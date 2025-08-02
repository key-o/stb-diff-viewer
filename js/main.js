/**
 * @fileoverview 構造モデルビューワーのメインモジュール
 *
 * このファイルは、アプリケーションのエントリーポイントとして機能し、以下の役割を持ちます：
 * - Three.jsビューワーの初期化と設定
 * - モジュール間の連携とイベント処理
 * - グローバル関数の公開と初期化
 * - UIイベントリスナーの設定
 * - モデルローディングと表示モード管理
 * - 再描画機能の提供
 *
 * このモジュールは他のモジュール (modelLoader, interaction, viewModes) を
 * 連携させるオーケストレーターとして機能します。
 */
import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";
import {
  scene,
  camera,
  controls,
  renderer,
  elementGroups,
  SUPPORTED_ELEMENTS,
  initRenderer,
  animate,
  setupViewportResizeHandler,
  updateMaterialClippingPlanes,
  createOrUpdateGridHelper,
  clearClippingPlanes,
} from "./viewer/index.js";
import { compareModels } from "./modelLoader.js";
import { setupInteractionListeners } from "./interaction.js";
import { setupViewModeListeners } from "./viewModes.js";
import { setupColorModeListeners } from "./colorModes.js";
import { updateUnifiedLabelVisibility } from "./ui/unifiedLabelManager.js";
import {
  setupUIEventListeners,
  toggleLegend,
  applyStoryClip,
  applyAxisClip,
} from "./ui.js";
import { displayElementInfo } from "./viewer/ui/elementInfoDisplay.js";
import { regenerateAllLabels } from "./ui/labelRegeneration.js";
import {
  setState,
  getState,
  registerGlobalFunction,
  enableStateDebug,
} from "./core/globalState.js";
import { initializeSettingsManager } from "./core/settingsManager.js";
import { initializeGlobalMessenger } from "./core/moduleMessaging.js";
import { initializeImportanceManager } from "./core/importanceManager.js";
import {
  initializeImportancePanel,
  getImportancePanel,
} from "./ui/importancePanel.js";
import { initializeImportanceFilterSystem } from "./ui/importanceFilter.js";
import { initializeImportanceStatistics } from "./ui/statistics.js";
import { initializeBulkImportanceOperations } from "./ui/bulkImportanceOperations.js";
import { initializeOutlineSystem } from "./viewer/rendering/outlines.js";
import {
  setupDiffSummaryEventListeners,
  clearDiffSummary,
} from "./ui/diffSummary.js";

// --- 初期化フラグ ---
let rendererInitialized = false;

// --- 再描画をリクエストする関数 ---
function scheduleRender() {
  if (rendererInitialized) {
    console.log("Manual render requested");
    if (controls && scene && camera) {
      controls.update();
      renderer.render(scene, camera);
    }
  } else {
    console.warn("Cannot request render: Renderer not initialized");
  }
}

// --- グローバル状態管理とレガシー互換性 ---
// 新しい状態管理システムに登録
registerGlobalFunction("scheduleRender", scheduleRender);
registerGlobalFunction("requestRender", scheduleRender);
setState("rendering.scheduleRender", scheduleRender);
setState("rendering.requestRender", scheduleRender);

// レガシー互換性のため
window.requestRender = scheduleRender;

// --- 重要度パネル表示切り替え関数 ---
function toggleImportancePanel() {
  const panel = getImportancePanel();
  panel.toggle();
}
window.toggleImportancePanel = toggleImportancePanel;

// --- compareModelsをHTMLから呼び出せるようにグローバルに設定 ---
window.compareModels = async function () {
  // レンダラーが初期化されていない場合は処理中断
  if (!rendererInitialized) {
    alert("ビューアが初期化されていません。");
    return;
  }

  // モデルの読み込みと比較処理
  await compareModels(scheduleRender, { camera, controls });

  // 少し待ってからラベル表示状態をチェックボックスに基づいて更新
  // （ラベル作成処理の完了を待つ）
  console.log("Initializing label visibility based on checkbox states...");
  setTimeout(() => {
    updateUnifiedLabelVisibility();
    // 再描画
    if (typeof window.requestRender === "function") window.requestRender();
  }, 100);
};

// --- アプリケーション開始関数 ---
function startApp() {
  // グローバル関数を状態管理システムに登録
  registerGlobalFunction("toggleLegend", toggleLegend);
  registerGlobalFunction("applyStoryClip", applyStoryClip);
  registerGlobalFunction("applyAxisClip", applyAxisClip);
  registerGlobalFunction("displayElementInfo", displayElementInfo);
  registerGlobalFunction("clearClippingPlanes", clearClippingPlanes);
  registerGlobalFunction("regenerateAllLabels", regenerateAllLabels);
  registerGlobalFunction("toggleImportancePanel", toggleImportancePanel);

  // レガシー互換性のためwindowにも登録
  window.toggleLegend = toggleLegend;
  window.applyStoryClip = applyStoryClip;
  window.applyAxisClip = applyAxisClip;
  window.displayElementInfo = displayElementInfo;
  window.clearClippingPlanes = clearClippingPlanes;

  // 状態管理システムの初期化
  setState("rendering.rendererInitialized", rendererInitialized);
  // 要素グループをグローバル状態に登録（重要度モードで使用）
  setState("elementGroups", elementGroups);
  enableStateDebug(true); // 開発時はデバッグ有効

  // 高度な機能の初期化
  initializeSettingsManager();
  initializeGlobalMessenger();

  // 重要度管理システムの初期化
  initializeImportanceManager()
    .then(() => {
      console.log("ImportanceManager initialized");
    })
    .catch((error) => {
      console.error("Failed to initialize ImportanceManager:", error);
    });

  // 初期化処理
  setupUIEventListeners();
  setupViewportResizeHandler(camera);
  setupInteractionListeners(scheduleRender);
  setupViewModeListeners(scheduleRender);
  setupColorModeListeners(); // 色付けモードの初期化
  setupDiffSummaryEventListeners(); // 差分サマリー機能の初期化
  controls.target.set(0, 0, 0);
  controls.update();
  animate(controls, scene, camera);
  createOrUpdateGridHelper(new THREE.Box3());
}

// --- DOMContentLoaded イベントリスナー ---
document.addEventListener("DOMContentLoaded", () => {
  if (initRenderer()) {
    rendererInitialized = true;
    setState("rendering.rendererInitialized", true);
    updateMaterialClippingPlanes();
    console.log("Renderer initialized successfully via DOMContentLoaded.");

    // 統合ラベル管理システムを初期化
    import("./ui/unifiedLabelManager.js").then(
      ({ initializeUnifiedLabelManager }) => {
        initializeUnifiedLabelManager();
        console.log("Unified label management system initialized");
      }
    );

    startApp();
  } else {
    console.error("Renderer initialization failed. Cannot start application.");
    alert("3Dビューアの初期化に失敗しました。");
  }

  // 比較ボタンにイベントリスナーを追加
  const compareBtn = document.getElementById("compareButton");
  if (compareBtn) {
    compareBtn.addEventListener("click", window.compareModels);
  } else {
    console.error("Compare button not found.");
  }

  // クリッピング関連ボタンのリスナーは ui/events.js で設定

  // 重要度設定ボタンのイベントリスナー
  const importanceBtn = document.getElementById("toggleImportanceBtn");
  if (importanceBtn) {
    importanceBtn.addEventListener("click", toggleImportancePanel);
  } else {
    console.error("Importance button not found.");
  }

  // 重要度統合機能の初期化
  initializeImportancePanel(document.body);

  // 重要度関連システムの初期化
  const { filter, indicator } = initializeImportanceFilterSystem(document.body);
  const statistics = initializeImportanceStatistics(document.body);
  const bulkOperations = initializeBulkImportanceOperations(document.body);

  // アウトラインシステム初期化
  initializeOutlineSystem();

  // グローバル状態に登録
  setState("importanceSystem.filter", filter);
  setState("importanceSystem.statistics", statistics);
  setState("importanceSystem.bulkOperations", bulkOperations);
  setState("importanceSystem.filterIndicator", indicator);

  console.log("Importance integration system initialized");

  // 統合機能のテスト用グローバル関数を追加
  window.toggleImportanceStatistics = () => statistics.toggle();
  window.toggleBulkOperations = () => bulkOperations.toggle();
  window.toggleImportanceFilter = () => filter.setEnabled(!filter.isEnabled);

  // パフォーマンス統計表示関数とリセット関数を追加
  import("./colorModes.js").then(
    ({
      showImportancePerformanceStats,
      resetImportanceColors,
      resetElementColors,
      resetSchemaColors,
    }) => {
      window.showImportancePerformanceStats = showImportancePerformanceStats;
      window.resetImportanceColors = resetImportanceColors;
      window.resetElementColors = resetElementColors;
      window.resetSchemaColors = resetSchemaColors;
    }
  );

  // 凡例ボタンはui/events.jsで設定済み
});

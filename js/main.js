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
import { createLogger, Logger as AppLogger } from "./utils/logger.js";
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
import { setupInteractionListeners, getSelectedCenter } from "./interaction.js";
import { setupViewModeListeners } from "./viewModes.js";
import { setupColorModeListeners } from "./colorModes.js";
import { updateLabelVisibility } from "./ui/unifiedLabelManager.js";
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
import { IFCConverter, IFCConverterUI } from "./api/ifcConverter.js";
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
const log = createLogger("app");

// --- 再描画をリクエストする関数 ---
function scheduleRender() {
  if (rendererInitialized) {
    // console.log("Manual render requested");
    if (renderer && scene && camera) {
      // controls.update() は animate ループで呼ばれるので、ここでは不要
      renderer.render(scene, camera);
    }
  } else {
    log.warn("Cannot request render: Renderer not initialized");
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
  log.info("Initializing label visibility based on checkbox states...");
  setTimeout(() => {
    updateLabelVisibility();
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

  // IFC変換機能の初期化
  const ifcConverter = new IFCConverter();
  const ifcConverterUI = new IFCConverterUI(ifcConverter);
  window.ifcConverter = ifcConverter; // グローバルアクセス用

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
      log.info("ImportanceManager initialized");
    })
    .catch((error) => {
      log.error("Failed to initialize ImportanceManager:", error);
    });

  // 初期化処理
  setupUIEventListeners();
  setupViewportResizeHandler(camera);
  setupInteractionListeners(scheduleRender);
  setupViewModeListeners(scheduleRender);
  setupColorModeListeners(); // 色付けモードの初期化
  setupDiffSummaryEventListeners(); // 差分サマリー機能の初期化

  // 初期回転中心の強制設定は行わない（CameraControls は setOrbitPoint で都度切替）

  animate(controls, scene, camera);
  createOrUpdateGridHelper(new THREE.Box3());

  // ===== ズームを選択部材へ向ける（dollyToCursor + pointer同期） =====
  try {
    // CameraControls 透過設定
    controls.dollyToCursor = true;
    controls.infinityDolly = false;

    const el = renderer?.domElement || document.getElementById("three-canvas");
    if (el) {
      const projectWorldToClient = (world, cam, element) => {
        const ndc = world.clone().project(cam);
        const rect = element.getBoundingClientRect();
        const x = (ndc.x * 0.5 + 0.5) * rect.width + rect.left;
        const y = (-ndc.y * 0.5 + 0.5) * rect.height + rect.top;
        return { x, y };
      };
      el.addEventListener(
        "wheel",
        () => {
          const center = getSelectedCenter?.();
          if (!center) return;
          const pt = projectWorldToClient(center, camera, el);
          const move = new PointerEvent("pointermove", {
            clientX: pt.x,
            clientY: pt.y,
            pointerId: 1,
            pointerType: "mouse",
            bubbles: true,
          });
          el.dispatchEvent(move);
        },
        { capture: true, passive: true }
      );
    }
  } catch (e) {
    log.warn("Failed to setup zoom-to-selection behavior:", e);
  }
}

// --- DOMContentLoaded イベントリスナー ---
document.addEventListener("DOMContentLoaded", () => {
  if (initRenderer()) {
    rendererInitialized = true;
    setState("rendering.rendererInitialized", true);
    updateMaterialClippingPlanes();
    log.info("Renderer initialized successfully via DOMContentLoaded.");

    // ==== 診断/デバッグ用に Three.js リソースをグローバルへ公開 ====
    // GeometryDiagnostics.getDefaultScene() は window.viewer.scene / window.scene を探索するため
    // ここで公開しておくことで logDefaultSceneComparisons などが利用可能になる。
    if (!window.viewer) window.viewer = {};
    window.viewer.scene = scene;
    window.viewer.camera = camera;
    window.viewer.renderer = renderer;
    window.viewer.controls = controls;
    // シンプルアクセス用に直接も公開
    window.scene = scene; // 他ライブラリと衝突しうるが開発診断用途

    // 便利: 断面比較一括実行ショートカット
    window.runSectionComparison = (opts = {}) => {
      try {
        if (!window.GeometryDiagnostics) {
          console.warn("GeometryDiagnostics module not loaded yet");
          return;
        }
        return window.GeometryDiagnostics.logDefaultSceneComparisons(
          null,
          opts.limit || 300,
          {
            tolerance: opts.tolerance ?? 0.02,
            level: opts.level || "info",
          }
        );
      } catch (e) {
        console.error("runSectionComparison failed", e);
      }
    };

    // 統合ラベル管理システムを初期化
    import("./ui/unifiedLabelManager.js").then(({ initializeLabelManager }) => {
      initializeLabelManager();
      log.info("Unified label management system initialized");
    });

    // XSDスキーマを初期化（プロパティ表示で必要）
    import("./parser/xsdSchemaParser.js")
      .then(({ loadXsdSchema }) => {
        const xsdPath = "./schemas/ST-Bridge202.xsd";
        loadXsdSchema(xsdPath).then((success) => {
          if (success) {
            log.info("XSD schema initialized at startup");
          } else {
            log.warn("XSD schema initialization failed at startup");
          }
        });
      })
      .catch((error) => {
        log.warn("Failed to load XSD schema module:", error);
      });

    startApp();
  } else {
    log.error("Renderer initialization failed. Cannot start application.");
    alert("3Dビューアの初期化に失敗しました。");
  }

  // 比較ボタンにイベントリスナーを追加
  const compareBtn = document.getElementById("compareButton");
  if (compareBtn) {
    compareBtn.addEventListener("click", window.compareModels);
  } else {
    log.error("Compare button not found.");
  }

  // クリッピング関連ボタンのリスナーは ui/events.js で設定

  // 重要度設定ボタンのイベントリスナー
  const importanceBtn = document.getElementById("toggleImportanceBtn");
  if (importanceBtn) {
    importanceBtn.addEventListener("click", toggleImportancePanel);
  } else {
    log.error("Importance button not found.");
  }

  // 配置基準線表示切り替えのイベントリスナー
  const placementLinesToggle = document.getElementById("togglePlacementLines");
  if (placementLinesToggle) {
    placementLinesToggle.addEventListener("change", (event) => {
      const isVisible = event.target.checked;
      togglePlacementLinesVisibility(isVisible);
      log.info(`Placement lines visibility set to: ${isVisible}`);
    });
  } else {
    log.warn("Placement lines toggle not found.");
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

  log.info("Importance integration system initialized");

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

  // テストページからのメッセージ受信処理
  window.addEventListener("message", (event) => {
    if (event.data && event.data.action === "testPlacementLinesToggle") {
      const placementLinesToggle = document.getElementById(
        "togglePlacementLines"
      );
      if (placementLinesToggle) {
        // 現在の状態を切り替え
        placementLinesToggle.checked = !placementLinesToggle.checked;
        // 切り替えイベントを発火
        placementLinesToggle.dispatchEvent(new Event("change"));
        console.log(
          `Placement lines toggled via test: ${placementLinesToggle.checked}`
        );
      }
    }

    if (event.data && event.data.action === "loadSample") {
      // テストページからのサンプルファイル読み込み要求
      try {
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = ".stb";
        fileInput.style.display = "none";
        document.body.appendChild(fileInput);

        // ファイル選択時の処理
        fileInput.addEventListener("change", (e) => {
          if (e.target.files.length > 0) {
            const file = e.target.files[0];
            if (window.compareModels) {
              window.compareModels([file]);
            }
          }
          document.body.removeChild(fileInput);
        });

        // ファイル選択ダイアログを開く
        fileInput.click();
      } catch (error) {
        console.error("Error triggering file selection:", error);
      }
    }
  });
});

/**
 * 配置基準線の表示切り替え
 * @param {boolean} isVisible - 表示するかどうか
 */
function togglePlacementLinesVisibility(isVisible) {
  try {
    if (!scene) {
      log.warn("Scene not available for placement lines toggle");
      return;
    }

    // すべてのメッシュオブジェクトを探索して配置基準線を切り替え
    scene.traverse((object) => {
      if (object.userData && object.userData.isPlacementLine) {
        object.visible = isVisible;
      }
    });

    log.info(`Placement lines visibility toggled: ${isVisible}`);
  } catch (error) {
    log.error("Error toggling placement lines visibility:", error);
  }
}

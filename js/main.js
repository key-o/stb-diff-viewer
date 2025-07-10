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
import {
  setupUIEventListeners,
  toggleLegend,
  applyStoryClip,
  applyAxisClip,
} from "./ui.js";
import { displayElementInfo } from "./viewer/ui/elementInfoDisplay.js";
import { 
  setState, 
  getState, 
  registerGlobalFunction,
  enableStateDebug
} from "./core/globalState.js";

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
registerGlobalFunction('scheduleRender', scheduleRender);
registerGlobalFunction('requestRender', scheduleRender);
setState('rendering.scheduleRender', scheduleRender);
setState('rendering.requestRender', scheduleRender);

// レガシー互換性のため
window.requestRender = scheduleRender;

// --- compareModelsをHTMLから呼び出せるようにグローバルに設定 ---
window.compareModels = async function () {
  // レンダラーが初期化されていない場合は処理中断
  if (!rendererInitialized) {
    alert("ビューアが初期化されていません。");
    return;
  }

  // モデルの読み込みと比較処理
  await compareModels(scheduleRender, { camera, controls });
};

// --- アプリケーション開始関数 ---
function startApp() {
  // グローバル関数を状態管理システムに登録
  registerGlobalFunction('toggleLegend', toggleLegend);
  registerGlobalFunction('applyStoryClip', applyStoryClip);
  registerGlobalFunction('applyAxisClip', applyAxisClip);
  registerGlobalFunction('displayElementInfo', displayElementInfo);
  registerGlobalFunction('clearClippingPlanes', clearClippingPlanes);

  // レガシー互換性のためwindowにも登録
  window.toggleLegend = toggleLegend;
  window.applyStoryClip = applyStoryClip;
  window.applyAxisClip = applyAxisClip;
  window.displayElementInfo = displayElementInfo;
  window.clearClippingPlanes = clearClippingPlanes;

  // 状態管理システムの初期化
  setState('rendering.rendererInitialized', rendererInitialized);
  enableStateDebug(true); // 開発時はデバッグ有効

  // 初期化処理
  setupUIEventListeners();
  setupViewportResizeHandler(camera);
  setupInteractionListeners(scheduleRender);
  setupViewModeListeners(scheduleRender);
  setupColorModeListeners(); // 色付けモードの初期化
  controls.target.set(0, 0, 0);
  controls.update();
  animate(controls, scene, camera);
  createOrUpdateGridHelper(new THREE.Box3());
}

// --- DOMContentLoaded イベントリスナー ---
document.addEventListener("DOMContentLoaded", () => {
  if (initRenderer()) {
    rendererInitialized = true;
    setState('rendering.rendererInitialized', true);
    updateMaterialClippingPlanes();
    console.log("Renderer initialized successfully via DOMContentLoaded.");
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

  // クリッピング関連ボタンのリスナー設定
  const clearButton = document.getElementById("clearClipButton");
  if (clearButton) {
    clearButton.addEventListener("click", clearClippingPlanes);
  }

  const storyClipButton = document.getElementById("applyStoryClipButton");
  if (storyClipButton) {
    storyClipButton.addEventListener("click", () => {
      const storySelector = document.getElementById("storySelector");
      if (storySelector && storySelector.value !== "all") {
        applyStoryClip(storySelector.value);
        if (scheduleRender) scheduleRender();
      } else {
        alert("階を選択してください");
      }
    });
  }

  const xAxisClipButton = document.getElementById("applyXAxisClipButton");
  if (xAxisClipButton) {
    xAxisClipButton.addEventListener("click", () => {
      const xAxisSelector = document.getElementById("xAxisSelector");
      if (xAxisSelector && xAxisSelector.value !== "all") {
        applyAxisClip("X", xAxisSelector.value);
        if (scheduleRender) scheduleRender();
      } else {
        alert("X軸を選択してください");
      }
    });
  }

  const yAxisClipButton = document.getElementById("applyYAxisClipButton");
  if (yAxisClipButton) {
    yAxisClipButton.addEventListener("click", () => {
      const yAxisSelector = document.getElementById("yAxisSelector");
      if (yAxisSelector && yAxisSelector.value !== "all") {
        applyAxisClip("Y", yAxisSelector.value);
        if (scheduleRender) scheduleRender();
      } else {
        alert("Y軸を選択してください");
      }
    });
  }

  // 凡例ボタンはui/events.jsで設定済み
});

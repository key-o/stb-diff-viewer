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
  setupResizeListener,
  updateMaterialClippingPlanes,
  createOrUpdateGridHelper,
  clearClippingPlanes,
} from "./viewer/index.js";
import { compareModels } from "./modelLoader.js";
import { setupInteractionListeners } from "./interaction.js";
import { setupViewModeListeners } from "./viewModes.js";
import {
  setupUIEventListeners,
  toggleLegend,
  applyStoryClip,
  applyAxisClip,
} from "./ui.js";
import { displayElementInfo } from "./viewer/ui/elementInfoDisplay.js";

// --- 初期化フラグ ---
let rendererInitialized = false;

// --- 再描画をリクエストする関数 ---
function requestRender() {
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

// --- グローバルに公開 ---
window.requestRender = requestRender;

// --- compareModelsをHTMLから呼び出せるようにグローバルに設定 ---
window.compareModels = async function () {
  // レンダラーが初期化されていない場合は処理中断
  if (!rendererInitialized) {
    alert("ビューアが初期化されていません。");
    return;
  }

  // モデルの読み込みと比較処理
  await compareModels(requestRender, { camera, controls });
};

// --- アプリケーション開始関数 ---
function startApp() {
  // HTMLから呼び出す関数をwindowに登録
  window.toggleLegend = toggleLegend;
  window.applyStoryClip = applyStoryClip;
  window.applyAxisClip = applyAxisClip;
  window.displayElementInfo = displayElementInfo;
  window.clearClippingPlanes = clearClippingPlanes;

  // 初期化処理
  setupUIEventListeners();
  setupResizeListener(camera);
  setupInteractionListeners(requestRender);
  setupViewModeListeners(requestRender);
  controls.target.set(0, 0, 0);
  controls.update();
  animate(controls, scene, camera);
  createOrUpdateGridHelper(new THREE.Box3());
}

// --- DOMContentLoaded イベントリスナー ---
document.addEventListener("DOMContentLoaded", () => {
  if (initRenderer()) {
    rendererInitialized = true;
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

  // クリップ解除ボタンのリスナー設定
  const clearButton = document.getElementById("clearClipButton");
  if (clearButton) {
    clearButton.addEventListener("click", clearClippingPlanes);
  }

  // 凡例ボタンのリスナー設定
  const toggleLegendBtn = document.getElementById("toggleLegendBtn");
  if (toggleLegendBtn) {
    toggleLegendBtn.addEventListener("click", toggleLegend);
  }
});

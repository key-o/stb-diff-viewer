// ★★★ 各ビューアモジュールからのインポートパスを更新 ★★★
import {
  scene,
  camera,
  renderer,
  controls,
  directionalLight,
  gridHelper,
  axesHelper,
  elementGroups,
  SUPPORTED_ELEMENTS,
  initRenderer,
} from "./core.js";
import { materials } from "./materials.js";
import { drawLineElements, drawPolyElements, drawNodes } from "./elements.js";
import { createLabel } from "./labels.js"; // 必要に応じてインポート
import { drawAxes, drawStories } from "./layout.js";
// ★★★ animate を utils からインポート ★★★
import {
  clearClippingPlanes,
  applyClipPlanes,
  updateMaterialClippingPlanes,
  adjustCameraToFitModel,
  setupResizeListener,
  animate, // ★★★ animate を追加 ★★★
  clearSceneContent,
  createOrUpdateGridHelper,
} from "./utils.js";

// ★★★ 必要なものを再エクスポート ★★★
export {
  scene,
  camera,
  renderer,
  controls,
  directionalLight,
  gridHelper,
  axesHelper,
  elementGroups,
  SUPPORTED_ELEMENTS,
  initRenderer,
  materials,
  drawLineElements,
  drawPolyElements,
  drawNodes,
  createLabel, // 必要に応じてエクスポート
  drawAxes,
  drawStories,
  clearClippingPlanes,
  applyClipPlanes,
  updateMaterialClippingPlanes,
  adjustCameraToFitModel,
  setupResizeListener,
  animate, // ★★★ animate をエクスポートリストに追加 ★★★
  clearSceneContent,
  createOrUpdateGridHelper,
};

// このファイル自体にロジックを追加することも可能
console.log("Viewer module initialized");

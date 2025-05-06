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
} from "./core/core.js"; // パス修正
import { materials } from "./rendering/materials.js"; // パス修正
import {
  drawLineElements,
  drawPolyElements,
  drawNodes,
} from "./rendering/elements.js"; // パス修正
// ★★★ labels.js のインポートパスを確認・修正 ★★★js/viewer/ui/labels.js
import { createLabel } from "./ui/labels.js"; // ← このパスが正しいか確認
import { drawAxes, drawStories } from "./ui/layout.js"; // パス修正
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
} from "./utils/utils.js"; // パス修正

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

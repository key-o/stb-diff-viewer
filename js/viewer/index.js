// STBビューアモジュールのメインエントリポイント
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
  animate,
  setupViewportResizeHandler,
} from "./core/core.js";
import { materials } from "./rendering/materials.js";
import {
  drawLineElements,
  drawPolyElements,
  drawNodes,
} from "./rendering/elements.js";
import { createLabel } from "./ui/labels.js";
import { drawAxes, drawStories } from "./ui/layout.js";
import {
  clearClippingPlanes,
  applyClipPlanes,
  updateMaterialClippingPlanes,
  adjustCameraToFitModel,
  clearSceneContent,
  createOrUpdateGridHelper,
  getModelBounds,
} from "./utils/utils.js";

// 必要なものを再エクスポート
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
  animate,
  setupViewportResizeHandler,
  materials,
  drawLineElements,
  drawPolyElements,
  drawNodes,
  createLabel,
  drawAxes,
  drawStories,
  clearClippingPlanes,
  applyClipPlanes,
  updateMaterialClippingPlanes,
  adjustCameraToFitModel,
  clearSceneContent,
  createOrUpdateGridHelper,
  getModelBounds,
};

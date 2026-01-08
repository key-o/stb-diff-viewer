/**
 * Viewer Layer Interface
 * STBビューアモジュールの公開API
 *
 * このファイルはviewer層の統一インターフェースを提供します。
 * 他のレイヤーからviewer層にアクセスする際は、必ずこのindex.jsを経由してください。
 *
 * @module viewer
 */

// ============================================
// 型定義
// ============================================

export * from './types/index.js';

// ============================================
// コア機能
// ============================================

import {
  scene,
  camera,
  orthographicCamera,
  renderer,
  controls,
  directionalLight,
  gridHelper,
  axesHelper,
  elementGroups,
  initRenderer,
  animate,
  setupViewportResizeHandler,
  setSkipControlsUpdate,
  getActiveCamera,
  setFrustumCullingEnabled,
  isFrustumCullingEnabled,
} from './core/core.js';
import { SUPPORTED_ELEMENTS } from '../config/elementTypes.js';
import {
  materials,
  ELEMENT_MATERIAL_SIDE,
  getMaterialSideForElement,
  setSingleSidedOptimizationEnabled,
  isSingleSidedOptimizationEnabled,
  createOptimizedMaterial,
} from './rendering/materials.js';
import {
  drawLineElements,
  drawPolyElements,
  drawNodes,
  setElementsLabelProvider,
} from './rendering/elements.js';
import {
  drawLineElementsBatched,
  drawNodesBatched,
  shouldUseBatchRendering,
  getElementFromBatchedIntersection,
  setLabelProvider,
} from './rendering/batchedElements.js';
import { createLabel } from './ui/labels.js';
import { drawAxes, drawStories } from './ui/layout.js';
import { clearSceneContent, getModelBounds } from './scene/sceneManager.js';
import { createOrUpdateGridHelper } from './grid/gridHelper.js';
import {
  adjustCameraToFitModel,
  focusOnSelected,
  fitCameraToModel,
  fitCameraToBox,
  computeModelBoundingBox,
} from './camera/cameraFitter.js';
import { setView, VIEW_DIRECTIONS } from './camera/viewManagerImpl.js';
import {
  clearClippingPlanes,
  applyClipPlanes,
  updateMaterialClippingPlanes,
} from './clipping/clippingManager.js';
import { setElementInfoProviders } from './ui/element-info/index.js';
import { setClippingStateProvider } from './clipping/clippingManager.js';

// ============================================
// シーン・コア
// ============================================

export {
  scene,
  camera,
  orthographicCamera,
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
  setSkipControlsUpdate,
  getActiveCamera,
  // パフォーマンス最適化: フラスタムカリング
  setFrustumCullingEnabled,
  isFrustumCullingEnabled,
  // マテリアル関連
  materials,
  ELEMENT_MATERIAL_SIDE,
  getMaterialSideForElement,
  setSingleSidedOptimizationEnabled,
  isSingleSidedOptimizationEnabled,
  createOptimizedMaterial,
  // 描画関数
  drawLineElements,
  drawPolyElements,
  drawNodes,
  setElementsLabelProvider,
  drawLineElementsBatched,
  drawNodesBatched,
  shouldUseBatchRendering,
  getElementFromBatchedIntersection,
  setLabelProvider,
  createLabel,
  drawAxes,
  drawStories,
  clearClippingPlanes,
  applyClipPlanes,
  updateMaterialClippingPlanes,
  adjustCameraToFitModel,
  focusOnSelected,
  fitCameraToModel,
  fitCameraToBox,
  computeModelBoundingBox,
  setView,
  VIEW_DIRECTIONS,
  clearSceneContent,
  createOrUpdateGridHelper,
  getModelBounds,
  setElementInfoProviders,
  setClippingStateProvider,
};

// パフォーマンスユーティリティの再エクスポート
export { getElementRegistry } from './utils/ElementRegistry.js';
export { getFrustumCuller } from './rendering/FrustumCuller.js';
export {
  disposeRecursive,
  disposeLabels,
  disposeElementGroups,
  getResourceStats,
} from './utils/ResourceDisposer.js';
export { getPerformanceMonitor, measureAsync, measureSync } from './utils/PerformanceMonitor.js';

// キーボードショートカット
export {
  initKeyboardShortcuts,
  disposeKeyboardShortcuts,
  setOrbitCenterToSelected,
  resetOrbitCenter,
} from './interaction/keyboard-shortcuts.js';

// ViewCubeナビゲーション
export { initializeViewCube, getViewCube, destroyViewCube } from './ui/viewCube/ViewCube.js';

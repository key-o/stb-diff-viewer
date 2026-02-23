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
  setXRSessionActive,
  isXRSessionActive,
} from './core/core.js';
import { SUPPORTED_ELEMENTS } from '../constants/elementTypes.js';
import {
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
import { createLabel } from './annotations/labels.js';
import { drawAxes, drawStories } from './annotations/layout.js';
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
import { SectionBox } from './clipping/SectionBox.js';
import { setElementInfoProviders } from './services/elementInfoAdapter.js';
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
  // WebXR AR/VR 状態管理
  setXRSessionActive,
  isXRSessionActive,
  // マテリアル関連
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
  SectionBox,
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

// ============================================
// レンダリング管理 (rendering/)
// ============================================

// 色管理・マテリアル管理
export { colorManager } from './rendering/colorManager.js';
export { applyImportanceColorMode } from './rendering/materials.js';

// 表示モード管理
export { default as displayModeManager } from './rendering/displayModeManager.js';
export { default as labelDisplayManager } from './rendering/labelDisplayManager.js';
export { default as modelVisibilityManager } from './rendering/modelVisibilityManager.js';

// 荷重表示管理（Load Display）
export {
  initLoadDisplayManager,
  getLoadDisplayManager,
  LOAD_DISPLAY_MODE,
} from './rendering/loadDisplayManager.js';

// アウトライン
export { initializeOutlineSystem } from './rendering/outlines.js';

// ラベル作成
export { createLabelSprite } from './annotations/labels.js';

// ============================================
// ジオメトリ生成 (geometry/)
// ============================================

// ジオメトリ生成ファクトリー
export {
  GeometryGeneratorFactory,
  geometryGeneratorFactory,
} from './geometry/GeometryGeneratorFactory.js';
export { ElementGeometryUtils } from './geometry/ElementGeometryUtils.js';

// STB構造パーサー
export { clearParseCache, setStateProvider, parseStbFile } from './geometry/stbStructureReader.js';

// プロファイル計算
export {
  calculateHShapeProfile,
  calculateBoxProfile,
  calculatePipeProfile,
  calculateRectangleProfile,
  calculateLShapeProfile,
  calculateChannelProfile,
  calculateTShapeProfile,
} from './geometry/core/ProfileCalculator.js';

// デバッグツール（開発時のみ）
export * as GeometryDebugger from './geometry/debug/GeometryDebugger.js';

// ============================================
// カメラ管理 (camera/)
// ============================================

// カメラモード管理
export {
  setCameraMode,
  getCameraMode,
  reaffirmControlsForCurrentMode,
} from './camera/cameraManagerImpl.js';

// ビュー管理（setView, VIEW_DIRECTIONS は既にエクスポート済み）

// ============================================
// 要素動的更新 (elementUpdater.js)
// ============================================

export { regenerateElementGeometry } from './elementUpdater.js';

// ============================================
// AR/WebXR (ar/)
// ============================================

export { arSessionManager } from './ar/arSessionManager.js';
export { ArPlacement } from './ar/arPlacement.js';

// ============================================
// DXFビューア (dxfViewer.js)
// ============================================

export {
  renderDxfEntities,
  clearDxfGroup,
  getDxfGroup,
  fitCameraToDxfBounds,
  setLayerVisibility,
  toggleDxfEditMode,
} from './dxfViewer.js';

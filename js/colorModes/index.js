/**
 * @fileoverview 色付けモード管理モジュール - エントリーポイント
 *
 * このファイルは、色付けモードの管理と統合APIを提供します：
 * 1. 差分表示モード（デフォルト）- モデルA/Bの差分を表示
 * 2. 部材別色付けモード - 要素タイプごとに色を設定
 * 3. スキーマエラー表示モード - スキーマチェックエラーを表示
 * 4. 重要度別色付けモード - 属性の重要度で色分け
 *
 * @module colorModes
 */

// Color mode manager (main logic)
export {
  COLOR_MODES,
  getCurrentColorMode,
  setColorMode,
  setupColorModeListeners,
  updateElementsForColorMode,
  requestColorModeRedraw,
  applyColorModeToAllObjects,
  getMaterialForElement,
  applyDefaultColorModeAfterLoad,
} from './colorModeManager.js';

// Element color mode
export {
  initializeElementColorControls,
  resetElementColors,
  getElementColors,
} from './elementColorMode.js';

// Schema color mode
export {
  initializeSchemaColorControls,
  setFloatingWindowManager,
  resetSchemaColors,
  setDemoSchemaErrors,
  getSchemaColors,
} from './schemaColorMode.js';

// Schema error store (separated to avoid circular dependency with validationManager)
export {
  buildSchemaKey,
  setSchemaError,
  getSchemaError,
  clearSchemaErrors,
  getSchemaErrorStats,
} from '../common-stb/validation/schemaErrorStore.js';

// Importance color mode
export {
  initializeImportanceColorControls,
  resetImportanceColors,
  showImportancePerformanceStats,
} from './importanceColorMode.js';

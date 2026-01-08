/**
 * @fileoverview UI連携モジュール (v2.0)
 *
 * このモジュールはUI機能の主要な連携ポイントとして機能します：
 * - 専門化されたUIモジュールからの関数エクスポート
 * - UIモジュール間の相互作用の調整
 * - UI操作の統一インターフェース提供
 *
 * 元の620行のui.jsは以下の焦点を絞ったモジュールに分割されました：
 * - ui/state.js - グローバル状態管理
 * - ui/selectors.js - 階/軸セレクター管理
 * - ui/unifiedLabelManager.js - 統合ラベル管理
 * - ui/events.js - イベントリスナー設定と処理
 * - ui/clipping.js - クリッピング平面操作
 */

// Export functions from specialized modules
export {
  setGlobalStateForUI,
  getGlobalUIState,
  getAllLabels,
  getCurrentStories,
  getCurrentAxesData,
  removeLabelsForElementType,
  addLabelsToGlobalState,
  clearUIState,
  updateStoriesData,
  updateAxesData,
  addStateChangeListener,
  removeStateChangeListener,
  getStateStatistics,
} from './ui/state.js';

export {
  updateStorySelector,
  updateAxisSelectors,
  getCurrentStorySelection,
  getCurrentXAxisSelection,
  getCurrentYAxisSelection,
  setStorySelection,
  setXAxisSelection,
  setYAxisSelection,
  resetSelectorsToDefault,
  getSelectorStatistics,
  validateSelectorElements,
} from './ui/selectors.js';

import { updateLabelVisibility } from './ui/unifiedLabelManager.js';
export { updateLabelVisibility };

export {
  setupUIEventListeners,
  toggleModelAVisibility,
  toggleModelBVisibility,
  toggleLegend,
  resetAllSelectors,
  getEventListenerStatus,
} from './ui/events/index.js';

export {
  applyStoryClip,
  applyAxisClip,
  clearAllClippingPlanes,
  getClippingStatus,
  applyCustomClippingPlanes,
  createClippingPlaneFromPointAndNormal,
  createBoxClippingPlanes,
  getCurrentClippingState,
  updateClippingRange,
  restoreCameraView,
} from './ui/clipping.js';

// RC柱断面リストパネル
import { initColumnSectionListPanel } from './ui/sectionList/index.js';
export { initColumnSectionListPanel };

/**
 * Initialize all UI modules
 * This function coordinates the initialization of all UI sub-modules
 */
export function initializeUI() {
  try {
    // Validate that required DOM elements exist
    const validation = validateSelectorElements();
    if (!validation.isValid) {
      console.warn('Some UI elements are missing:', validation.missing);
    }

    // Setup event listeners
    setupUIEventListeners();

    // Initialize state change coordination
    initializeStateChangeCoordination();

    // Initialize RC column section list panel
    try {
      initColumnSectionListPanel();
    } catch (e) {
      console.warn('Failed to initialize column section list panel:', e);
    }

    return true;
  } catch (error) {
    console.error('Failed to initialize UI modules:', error);
    return false;
  }
}

/**
 * UIモジュール間の連携を設定
 */
function initializeStateChangeCoordination() {
  // Listen for state changes and coordinate updates between modules
  addStateChangeListener((newState) => {
    // Trigger label visibility update when state changes
    updateLabelVisibility();

    // Could add other coordination logic here
  });
}

/**
 * デバッグ用の包括的なUI状態を取得
 * @returns {Object} 完全なUI状態
 */
export function getUIStatus() {
  return {
    state: getStateStatistics(),
    selectors: getSelectorStatistics(),
    labels: getLabelVisibilityStatistics(),
    events: getEventListenerStatus(),
    clipping: getClippingStatus(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * 全UIモジュールをデフォルト状態にリセット
 */
export function resetAllUI() {
  try {
    // Clear state
    clearUIState();

    // Reset selectors
    resetSelectorsToDefault();

    // Clear clipping
    clearAllClippingPlanes();

    // Hide all labels initially
    // Labels will be hidden automatically by the unified manager
  } catch (error) {
    console.error('Error resetting UI modules:', error);
  }
}

// Import validation and other utilities
import { validateSelectorElements } from './ui/selectors.js';
import { setupUIEventListeners } from './ui/events/index.js';

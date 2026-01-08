/**
 * @fileoverview UIイベント処理モジュール - エントリーポイント
 *
 * このモジュールはUIイベントリスナーと相互作用を管理します：
 * - イベントリスナー設定と管理
 * - UI相互作用処理
 * - イベント委譲と調整
 * - モデル可視性切り替え処理
 *
 * より良い整理のため、大きなui.jsモジュールから分割されました。
 *
 * @module ui/events
 */

// --- 各モジュールからのエクスポート ---
import {
  setupModelVisibilityListeners,
  toggleModelAVisibility,
  toggleModelBVisibility,
  getModelVisibilityStatus,
} from './modelVisibilityListeners.js';

import {
  setupSelectorChangeListeners,
  redrawAxesAtStory,
  resetAllSelectors,
  getSelectorStatus,
} from './selectorChangeListeners.js';

import {
  setupLabelToggleListeners,
  setupLabelContentListener,
} from './labelVisibilityListeners.js';

import { setupIfcExportListener, setupStbExportListener } from './exportListeners.js';

import { setupClippingRangeListeners, setupClippingButtonListeners } from './clippingListeners.js';

import {
  setupAccordionListeners,
  expandAllAccordions,
  collapseAllAccordions,
  getAccordionSectionCount,
} from './accordionListeners.js';

import {
  toggleLegend,
  updateLegendContent,
  hasLegendPanel,
} from './legendListeners.js';

import { setupKeyboardShortcuts, setupWindowResizeListener } from './keyboardListeners.js';

import { setupStbConvertListeners } from './stbConvertHandler.js';

import { setupMasterToggleListeners } from './masterToggleListeners.js';

// --- 統合リスナー設定関数 ---

/**
 * Setup all UI event listeners
 */
export function setupUIEventListeners() {
  try {
    setupModelVisibilityListeners();
    setupSelectorChangeListeners();
    setupLabelToggleListeners();
    setupLabelContentListener();
    setupIfcExportListener();
    setupStbExportListener();
    setupAccordionListeners();
    setupClippingRangeListeners();
    setupClippingButtonListeners();
    setupKeyboardShortcuts();
    setupWindowResizeListener();
    setupStbConvertListeners();
    setupMasterToggleListeners();
  } catch (error) {
    console.error('UIイベントリスナーの設定中にエラーが発生しました:', error);
  }
}

/**
 * Get current UI event listener status
 * @returns {Object} Event listener status
 */
export function getEventListenerStatus() {
  const modelStatus = getModelVisibilityStatus();
  const selectorStatus = getSelectorStatus();

  return {
    modelAToggle: modelStatus.modelA,
    modelBToggle: modelStatus.modelB,
    legendPanel: hasLegendPanel(),
    storySelector: selectorStatus.storySelector,
    xAxisSelector: selectorStatus.xAxisSelector,
    yAxisSelector: selectorStatus.yAxisSelector,
    // toggleLegendBtn: removed
    accordionSections: getAccordionSectionCount(),
    clippingRangeSliders: document.querySelectorAll('.clip-range-slider').length,
  };
}

// --- Re-exports for backward compatibility ---
export {
  // Model visibility
  toggleModelAVisibility,
  toggleModelBVisibility,
  // Selectors
  redrawAxesAtStory,
  resetAllSelectors,
  // Legend
  toggleLegend,
  updateLegendContent,
  // Accordion
  expandAllAccordions,
  collapseAllAccordions,
  // Master toggle
  setupMasterToggleListeners,
};

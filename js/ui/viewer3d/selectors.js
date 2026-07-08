/**
 * @fileoverview UIセレクター管理モジュール
 *
 * このモジュールはUI内の階と軸のセレクターを管理します：
 * - 階セレクターの入力と更新
 * - X/Y軸セレクターの入力と更新
 * - セレクターオプション生成
 * - セレクター状態管理
 *
 * より良い整理のため、大きなui.jsモジュールから分割されました。
 */

import { createLogger } from '../../utils/logger.js';
import { getCurrentStories, getCurrentAxesData } from '../state.js';

const log = createLogger('ui:selectors');

// --- UI Element References ---
const storySelector = document.getElementById('storySelector');
const xAxisSelector = document.getElementById('xAxisSelector');
const yAxisSelector = document.getElementById('yAxisSelector');

/**
 * Update story selector with current story data
 */
export function updateStorySelector() {
  if (!storySelector) {
    log.warn('Story selector element not found');
    return;
  }

  const stories = getCurrentStories();

  // Keep (or recreate) the "All Stories" option, discard the rest
  const allOption =
    storySelector.querySelector('option[value="all"]') ??
    (() => {
      const o = document.createElement('option');
      o.value = 'all';
      o.textContent = '全ての階';
      return o;
    })();
  storySelector.replaceChildren(allOption);

  // Add story options
  stories.forEach((story) => {
    const option = document.createElement('option');
    option.value = story.id;
    option.textContent = `${story.name} (高さ: ${story.height} mm)`;
    storySelector.appendChild(option);
  });

  // Set default selection
  storySelector.value = 'all';

  log.info(`Story selector updated with ${stories.length} stories`);
}

/**
 * Update axis selectors with current axis data
 */
export function updateAxisSelectors() {
  const axesData = getCurrentAxesData();

  updateXAxisSelector(axesData.xAxes);
  updateYAxisSelector(axesData.yAxes);

  log.info(`Axis selectors updated: X=${axesData.xAxes.length}, Y=${axesData.yAxes.length}`);
}

/**
 * Update X-axis selector
 * @param {Array} xAxes - Array of X-axis data
 */
function updateXAxisSelector(xAxes) {
  if (!xAxisSelector) {
    log.warn('X-axis selector element not found');
    return;
  }

  const allOption =
    xAxisSelector.querySelector('option[value="all"]') ??
    (() => {
      const o = document.createElement('option');
      o.value = 'all';
      o.textContent = '全てのX軸';
      return o;
    })();
  xAxisSelector.replaceChildren(allOption);

  // Add X-axis options
  xAxes.forEach((axis) => {
    const option = document.createElement('option');
    option.value = axis.id;
    option.textContent = getAxisOptionText(axis, 'X');
    xAxisSelector.appendChild(option);
  });

  // Set default selection
  xAxisSelector.value = 'all';
}

/**
 * Update Y-axis selector
 * @param {Array} yAxes - Array of Y-axis data
 */
function updateYAxisSelector(yAxes) {
  if (!yAxisSelector) {
    log.warn('Y-axis selector element not found');
    return;
  }

  const allOption =
    yAxisSelector.querySelector('option[value="all"]') ??
    (() => {
      const o = document.createElement('option');
      o.value = 'all';
      o.textContent = '全てのY軸';
      return o;
    })();
  yAxisSelector.replaceChildren(allOption);

  // Add Y-axis options
  yAxes.forEach((axis) => {
    const option = document.createElement('option');
    option.value = axis.id;
    option.textContent = getAxisOptionText(axis, 'Y');
    yAxisSelector.appendChild(option);
  });

  // Set default selection
  yAxisSelector.value = 'all';
}

function getAxisOptionText(axis, axisType) {
  if (axis.axisKind === 'arc') {
    return `${axis.name} (R: ${axis.radius} mm)`;
  }
  if (axis.axisKind === 'radial') {
    return `${axis.name} (${axis.angle}°)`;
  }
  return `${axis.name} (${axisType}: ${axis.distance} mm)`;
}

/**
 * Get current story selection
 * @returns {string|null} Selected story ID or "all"
 */
export function getCurrentStorySelection() {
  return storySelector?.value || null;
}

/**
 * Get current X-axis selection
 * @returns {string|null} Selected X-axis ID or "all"
 */
export function getCurrentXAxisSelection() {
  return xAxisSelector?.value || null;
}

/**
 * Get current Y-axis selection
 * @returns {string|null} Selected Y-axis ID or "all"
 */
export function getCurrentYAxisSelection() {
  return yAxisSelector?.value || null;
}

/**
 * Set story selection
 * @param {string} storyId - Story ID to select
 */
export function setStorySelection(storyId) {
  if (storySelector) {
    storySelector.value = storyId;
    log.info(`Story selection set to: ${storyId}`);
  }
}

/**
 * Set X-axis selection
 * @param {string} axisId - X-axis ID to select
 */
export function setXAxisSelection(axisId) {
  if (xAxisSelector) {
    xAxisSelector.value = axisId;
    log.info(`X-axis selection set to: ${axisId}`);
  }
}

/**
 * Set Y-axis selection
 * @param {string} axisId - Y-axis ID to select
 */
export function setYAxisSelection(axisId) {
  if (yAxisSelector) {
    yAxisSelector.value = axisId;
    log.info(`Y-axis selection set to: ${axisId}`);
  }
}

/**
 * Reset all selectors to default ("all") values
 */
export function resetSelectorsToDefault() {
  setStorySelection('all');
  setXAxisSelection('all');
  setYAxisSelection('all');
  log.info('All selectors reset to default values');
}

/**
 * Get selector statistics for debugging
 * @returns {Object} Selector statistics
 */
export function getSelectorStatistics() {
  return {
    storySelector: {
      exists: !!storySelector,
      optionCount: storySelector?.options.length || 0,
      currentValue: storySelector?.value || null,
    },
    xAxisSelector: {
      exists: !!xAxisSelector,
      optionCount: xAxisSelector?.options.length || 0,
      currentValue: xAxisSelector?.value || null,
    },
    yAxisSelector: {
      exists: !!yAxisSelector,
      optionCount: yAxisSelector?.options.length || 0,
      currentValue: yAxisSelector?.value || null,
    },
  };
}

/**
 * Validate selector elements exist in DOM
 * @returns {Object} Validation result
 */
export function validateSelectorElements() {
  const validation = {
    isValid: true,
    missing: [],
  };

  if (!storySelector) {
    validation.isValid = false;
    validation.missing.push('storySelector');
  }

  if (!xAxisSelector) {
    validation.isValid = false;
    validation.missing.push('xAxisSelector');
  }

  if (!yAxisSelector) {
    validation.isValid = false;
    validation.missing.push('yAxisSelector');
  }

  return validation;
}

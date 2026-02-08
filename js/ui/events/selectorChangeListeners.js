/**
 * @fileoverview セレクター変更イベントリスナー
 *
 * 階・軸セレクターの変更を処理するイベントリスナー。
 *
 * @module ui/events/selectorChangeListeners
 */

import { updateLabelVisibility } from '../viewer3d/unifiedLabelManager.js';
import { applyStoryClip, applyAxisClip } from '../viewer3d/clipping.js';
import { eventBus, AxisEvents, RenderEvents } from '../../app/events/index.js';
import { getModelData } from '../../app/modelLoader.js';

/**
 * Setup selector change listeners
 */
export function setupSelectorChangeListeners() {
  const storySelector = document.getElementById('storySelector');
  const xAxisSelector = document.getElementById('xAxisSelector');
  const yAxisSelector = document.getElementById('yAxisSelector');

  if (storySelector) {
    storySelector.addEventListener('change', handleStorySelectionChange);
  }

  if (xAxisSelector) {
    xAxisSelector.addEventListener('change', handleXAxisSelectionChange);
  }

  if (yAxisSelector) {
    yAxisSelector.addEventListener('change', handleYAxisSelectionChange);
  }
}

/**
 * Handle story selection change
 * @param {Event} event - Change event
 */
function handleStorySelectionChange(event) {
  const selectedStoryId = event.target.value;

  // Apply story clipping if not "all"
  if (selectedStoryId !== 'all') {
    applyStoryClip(selectedStoryId);
  }

  // Redraw axes at the selected story level
  redrawAxesAtStory(selectedStoryId);

  // Update label visibility
  updateLabelVisibility();

  // Request render update via EventBus
  eventBus.emit(RenderEvents.REQUEST_RENDER);
}

/**
 * Redraw axes at the specified story level
 * EventBusを使用してViewer層に描画をリクエストします。
 * @param {string} targetStoryId - Target story ID ('all' for lowest story)
 */
export function redrawAxesAtStory(targetStoryId) {
  try {
    const modelData = getModelData();
    const { stories, axesData, modelBounds } = modelData;

    if (!axesData || (!axesData.xAxes?.length && !axesData.yAxes?.length)) {
      return;
    }

    // Get label toggle state from the checkbox
    const labelCheckbox = document.getElementById('toggleLabel-Axis');
    const labelToggle = labelCheckbox ? labelCheckbox.checked : true;

    // EventBusを通じてViewer層に軸再描画をリクエスト
    eventBus.emit(AxisEvents.REDRAW_REQUESTED, {
      axesData,
      stories,
      modelBounds,
      labelToggle,
      targetStoryId,
    });
  } catch (error) {
    console.error('Error redrawing axes at story:', error);
  }
}

/**
 * Handle X-axis selection change
 * @param {Event} event - Change event
 */
function handleXAxisSelectionChange(event) {
  const selectedAxisId = event.target.value;

  // Apply axis clipping if not "all"
  if (selectedAxisId !== 'all') {
    applyAxisClip('X', selectedAxisId);
  }

  // Update label visibility
  updateLabelVisibility();

  // Request render update via EventBus
  eventBus.emit(RenderEvents.REQUEST_RENDER);
}

/**
 * Handle Y-axis selection change
 * @param {Event} event - Change event
 */
function handleYAxisSelectionChange(event) {
  const selectedAxisId = event.target.value;

  // Apply axis clipping if not "all"
  if (selectedAxisId !== 'all') {
    applyAxisClip('Y', selectedAxisId);
  }

  // Update label visibility
  updateLabelVisibility();

  // Request render update via EventBus
  eventBus.emit(RenderEvents.REQUEST_RENDER);
}

/**
 * Reset all selectors to default values
 */
export function resetAllSelectors() {
  const storySelector = document.getElementById('storySelector');
  const xAxisSelector = document.getElementById('xAxisSelector');
  const yAxisSelector = document.getElementById('yAxisSelector');

  if (storySelector) storySelector.value = 'all';
  if (xAxisSelector) xAxisSelector.value = 'all';
  if (yAxisSelector) yAxisSelector.value = 'all';

  // Clear clipping planes
  if (typeof window.clearClippingPlanes === 'function') {
    window.clearClippingPlanes();
  }

  // Update label visibility
  updateLabelVisibility();

  // Request render update via EventBus
  eventBus.emit(RenderEvents.REQUEST_RENDER);

  console.log('[Event] 全セレクタをリセット');
}

/**
 * Get selector status
 * @returns {Object} Selector element status
 */
export function getSelectorStatus() {
  return {
    storySelector: !!document.getElementById('storySelector'),
    xAxisSelector: !!document.getElementById('xAxisSelector'),
    yAxisSelector: !!document.getElementById('yAxisSelector'),
  };
}

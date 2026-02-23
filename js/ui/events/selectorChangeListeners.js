/**
 * @fileoverview セレクター変更イベントリスナー
 *
 * 階・軸セレクターの変更を処理するイベントリスナー。
 *
 * @module ui/events/selectorChangeListeners
 */

import { updateLabelVisibility } from '../viewer3d/unifiedLabelManager.js';
import { getStoryClipBounds, getAxisClipBounds } from '../viewer3d/clipping.js';
import { activateSectionBoxForBounds, deactivateSectionBox } from '../viewer3d/sectionBox.js';
import { eventBus, AxisEvents, RenderEvents } from '../../app/events/index.js';
import { getState } from '../../app/globalState.js';

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
  const storyRange = parseInt(document.getElementById('storyClipRange')?.value || '1000', 10);

  if (selectedStoryId !== 'all') {
    const bounds = getStoryClipBounds(selectedStoryId, storyRange);
    if (bounds) {
      activateSectionBoxForBounds(bounds);
      updateClipControlsVisibility('story');
    }
  } else {
    deactivateSectionBox();
    updateClipControlsVisibility(null);
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
    const stories = getState('models.stories') || [];
    const axesData = getState('models.axesData') || { xAxes: [], yAxes: [] };
    const modelBounds = getState('models.modelBounds') || null;

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
  const axisRange = parseInt(document.getElementById('xAxisClipRange')?.value || '2000', 10);

  if (selectedAxisId !== 'all') {
    const bounds = getAxisClipBounds('X', selectedAxisId, axisRange);
    if (bounds) {
      activateSectionBoxForBounds(bounds);
      updateClipControlsVisibility('xAxis');
    }
  } else {
    deactivateSectionBox();
    updateClipControlsVisibility(null);
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
  const axisRange = parseInt(document.getElementById('yAxisClipRange')?.value || '2000', 10);

  if (selectedAxisId !== 'all') {
    const bounds = getAxisClipBounds('Y', selectedAxisId, axisRange);
    if (bounds) {
      activateSectionBoxForBounds(bounds);
      updateClipControlsVisibility('yAxis');
    }
  } else {
    deactivateSectionBox();
    updateClipControlsVisibility(null);
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

/**
 * どのクリッピング範囲UIを表示するか更新
 * @param {'story'|'xAxis'|'yAxis'|null} type
 */
function updateClipControlsVisibility(type) {
  const controlIds = ['storyClipControls', 'xAxisClipControls', 'yAxisClipControls'];
  controlIds.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.classList.add('hidden');
    }
  });

  const groups = document.querySelectorAll('.clipping-group');
  groups.forEach((group) => {
    group.classList.remove('active', 'clipping-active');
  });

  if (!type) {
    return;
  }

  const controlElement = document.getElementById(`${type}ClipControls`);
  if (controlElement) {
    controlElement.classList.remove('hidden');
    const groupElement = controlElement.closest('.clipping-group');
    if (groupElement) {
      groupElement.classList.add('active', 'clipping-active');
    }
  }
}

/**
 * @fileoverview クリッピング関連イベントリスナー
 *
 * クリッピング範囲スライダーとボタンのイベントリスナー。
 *
 * @module ui/events/clippingListeners
 */

import {
  applyStoryClip,
  applyAxisClip,
  updateClippingRange,
  clearAllClippingPlanes,
} from '../viewer3d/clipping.js';

/**
 * Setup clipping range slider listeners
 */
export function setupClippingRangeListeners() {
  // Story clipping range slider
  const storyRangeSlider = document.getElementById('storyClipRange');
  const storyRangeValue = document.getElementById('storyRangeValue');

  if (storyRangeSlider && storyRangeValue) {
    storyRangeSlider.addEventListener('input', (event) => {
      const rangeValue = parseInt(event.target.value);
      storyRangeValue.textContent = (rangeValue / 1000).toFixed(1);
      updateClippingRange(rangeValue);
    });
  }

  // X-axis clipping range slider
  const xAxisRangeSlider = document.getElementById('xAxisClipRange');
  const xAxisRangeValue = document.getElementById('xAxisRangeValue');

  if (xAxisRangeSlider && xAxisRangeValue) {
    xAxisRangeSlider.addEventListener('input', (event) => {
      const rangeValue = parseInt(event.target.value);
      xAxisRangeValue.textContent = (rangeValue / 1000).toFixed(1);
      updateClippingRange(rangeValue);
    });
  }

  // Y-axis clipping range slider
  const yAxisRangeSlider = document.getElementById('yAxisClipRange');
  const yAxisRangeValue = document.getElementById('yAxisRangeValue');

  if (yAxisRangeSlider && yAxisRangeValue) {
    yAxisRangeSlider.addEventListener('input', (event) => {
      const rangeValue = parseInt(event.target.value);
      yAxisRangeValue.textContent = (rangeValue / 1000).toFixed(1);
      updateClippingRange(rangeValue);
    });
  }
}

/**
 * Setup clipping button listeners
 */
export function setupClippingButtonListeners() {
  // Story clipping apply button
  const storyClipButton = document.getElementById('applyStoryClipButton');
  if (storyClipButton) {
    storyClipButton.addEventListener('click', () => {
      const storySelector = document.getElementById('storySelector');
      const storyRange = document.getElementById('storyClipRange');
      if (storySelector && storyRange) {
        const storyId = storySelector.value;
        const range = parseInt(storyRange.value);
        applyStoryClip(storyId, range);
      }
    });
  }

  // X-axis clipping apply button
  const xAxisClipButton = document.getElementById('applyXAxisClipButton');
  if (xAxisClipButton) {
    xAxisClipButton.addEventListener('click', () => {
      const xAxisSelector = document.getElementById('xAxisSelector');
      const xAxisRange = document.getElementById('xAxisClipRange');
      if (xAxisSelector && xAxisRange) {
        const axisId = xAxisSelector.value;
        const range = parseInt(xAxisRange.value);
        applyAxisClip('X', axisId, range);
      }
    });
  }

  // Y-axis clipping apply button
  const yAxisClipButton = document.getElementById('applyYAxisClipButton');
  if (yAxisClipButton) {
    yAxisClipButton.addEventListener('click', () => {
      const yAxisSelector = document.getElementById('yAxisSelector');
      const yAxisRange = document.getElementById('yAxisClipRange');
      if (yAxisSelector && yAxisRange) {
        const axisId = yAxisSelector.value;
        const range = parseInt(yAxisRange.value);
        applyAxisClip('Y', axisId, range);
      }
    });
  }

  // Clear clipping button
  const clearClipButton = document.getElementById('clearClipButton');
  if (clearClipButton) {
    clearClipButton.addEventListener('click', () => {
      clearAllClippingPlanes();
    });
  }
}

/**
 * Get clipping slider status
 * @returns {number} Number of clipping range sliders found
 */
export function getClippingSliderCount() {
  return document.querySelectorAll('.clip-range-slider').length;
}

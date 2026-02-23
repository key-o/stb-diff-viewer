/**
 * @fileoverview クリッピング関連イベントリスナー
 *
 * クリッピング範囲スライダーとボタンのイベントリスナー。
 *
 * @module ui/events/clippingListeners
 */

import { getStoryClipBounds, getAxisClipBounds } from '../viewer3d/clipping.js';
import { toggleSectionBox, activateSectionBoxForBounds } from '../viewer3d/sectionBox.js';

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

      // スライダー変更時にSectionBoxを直接更新
      const storySelector = document.getElementById('storySelector');
      if (storySelector) {
        const bounds = getStoryClipBounds(storySelector.value, rangeValue);
        if (bounds) {
          activateSectionBoxForBounds(bounds);
        }
      }
    });
  }

  // X-axis clipping range slider
  const xAxisRangeSlider = document.getElementById('xAxisClipRange');
  const xAxisRangeValue = document.getElementById('xAxisRangeValue');

  if (xAxisRangeSlider && xAxisRangeValue) {
    xAxisRangeSlider.addEventListener('input', (event) => {
      const rangeValue = parseInt(event.target.value);
      xAxisRangeValue.textContent = (rangeValue / 1000).toFixed(1);

      const xAxisSelector = document.getElementById('xAxisSelector');
      if (xAxisSelector) {
        const bounds = getAxisClipBounds('X', xAxisSelector.value, rangeValue);
        if (bounds) {
          activateSectionBoxForBounds(bounds);
        }
      }
    });
  }

  // Y-axis clipping range slider
  const yAxisRangeSlider = document.getElementById('yAxisClipRange');
  const yAxisRangeValue = document.getElementById('yAxisRangeValue');

  if (yAxisRangeSlider && yAxisRangeValue) {
    yAxisRangeSlider.addEventListener('input', (event) => {
      const rangeValue = parseInt(event.target.value);
      yAxisRangeValue.textContent = (rangeValue / 1000).toFixed(1);

      const yAxisSelector = document.getElementById('yAxisSelector');
      if (yAxisSelector) {
        const bounds = getAxisClipBounds('Y', yAxisSelector.value, rangeValue);
        if (bounds) {
          activateSectionBoxForBounds(bounds);
        }
      }
    });
  }
}

/**
 * Setup clipping button listeners
 */
export function setupClippingButtonListeners() {
  // Section box toggle button
  const sectionBoxButton = document.getElementById('toggleSectionBoxButton');
  if (sectionBoxButton) {
    sectionBoxButton.addEventListener('click', () => {
      toggleSectionBox();
    });
  }
}

/**
 * @fileoverview クリッピング関連イベントリスナー
 *
 * クリッピング範囲スライダーとボタンのイベントリスナー。
 *
 * @module ui/events/clippingListeners
 */

import { getStoryClipBounds, getAxisClipBounds } from '../viewer3d/clipping.js';
import { toggleSectionBox, activateSectionBoxForBounds } from '../viewer3d/sectionBox.js';

/** @type {Array<{el: EventTarget, event: string, handler: Function}>} */
let _clippingListeners = [];

function _addListener(el, event, handler) {
  if (!el) return;
  el.addEventListener(event, handler);
  _clippingListeners.push({ el, event, handler });
}

/**
 * Setup clipping range slider listeners
 */
export function setupClippingRangeListeners() {
  const storyRangeSlider = document.getElementById('storyClipRange');
  const storyRangeValue = document.getElementById('storyRangeValue');

  if (storyRangeSlider && storyRangeValue) {
    _addListener(storyRangeSlider, 'input', (event) => {
      const rangeValue = parseInt(event.target.value);
      storyRangeValue.textContent = (rangeValue / 1000).toFixed(1);

      const storySelector = document.getElementById('storySelector');
      if (storySelector) {
        const bounds = getStoryClipBounds(storySelector.value, rangeValue);
        if (bounds) {
          activateSectionBoxForBounds(bounds);
        }
      }
    });
  }

  const xAxisRangeSlider = document.getElementById('xAxisClipRange');
  const xAxisRangeValue = document.getElementById('xAxisRangeValue');

  if (xAxisRangeSlider && xAxisRangeValue) {
    _addListener(xAxisRangeSlider, 'input', (event) => {
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

  const yAxisRangeSlider = document.getElementById('yAxisClipRange');
  const yAxisRangeValue = document.getElementById('yAxisRangeValue');

  if (yAxisRangeSlider && yAxisRangeValue) {
    _addListener(yAxisRangeSlider, 'input', (event) => {
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
  const sectionBoxButton = document.getElementById('toggleSectionBoxButton');
  _addListener(sectionBoxButton, 'click', () => {
    toggleSectionBox();
  });
}

/**
 * Teardown all clipping listeners
 */
export function teardownClippingListeners() {
  for (const { el, event, handler } of _clippingListeners) {
    el.removeEventListener(event, handler);
  }
  _clippingListeners = [];
}

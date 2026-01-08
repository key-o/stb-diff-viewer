/**
 * @fileoverview キーボードショートカットイベントリスナー
 *
 * キーボードショートカットとウィンドウリサイズを処理するイベントリスナー。
 *
 * @module ui/events/keyboardListeners
 */

import { toggleLegend } from './legendListeners.js';
import { toggleModelAVisibility, toggleModelBVisibility } from './modelVisibilityListeners.js';
import { resetAllSelectors } from './selectorChangeListeners.js';

/**
 * Setup keyboard shortcuts
 */
export function setupKeyboardShortcuts() {
  document.addEventListener('keydown', handleKeyboardShortcuts);
}

/**
 * Setup window resize listener for responsive UI
 */
export function setupWindowResizeListener() {
  window.addEventListener('resize', handleWindowResize);
}

/**
 * Handle keyboard shortcuts
 * @param {KeyboardEvent} event - Keyboard event
 */
function handleKeyboardShortcuts(event) {
  // Only handle shortcuts when not typing in inputs
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
    return;
  }

  switch (event.key.toLowerCase()) {
    case 'l':
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        toggleLegend();
      }
      break;

    case '1':
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        toggleModelAVisibility();
      }
      break;

    case '2':
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        toggleModelBVisibility();
      }
      break;

    case 'r':
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        resetAllSelectors();
      }
      break;
  }
}

/**
 * Handle window resize
 * @param {Event} event - Resize event
 */
function handleWindowResize(event) {
  // Debounce resize handling
  clearTimeout(window.resizeTimeout);
  window.resizeTimeout = setTimeout(() => {
    console.log('[Event] ウィンドウリサイズ');
    // Could trigger layout updates here if needed
  }, 250);
}

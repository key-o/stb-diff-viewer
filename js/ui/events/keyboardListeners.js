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
import { undoLastModification } from '../panels/element-info/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('ui:events:keyboardListeners');

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
 *
 * 修飾キーなしの単キーのみ使用する（Ctrl+R 等のブラウザ標準操作を奪わないため）。
 * @param {KeyboardEvent} event - Keyboard event
 */
function handleKeyboardShortcuts(event) {
  // Only handle shortcuts when not typing in inputs
  const tag = event.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target.isContentEditable) {
    return;
  }

  // Ctrl+Z / Cmd+Z: 編集の Undo（input 内ではブラウザ標準の Undo を維持）
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
    if (
      tag !== 'INPUT' &&
      tag !== 'TEXTAREA' &&
      tag !== 'SELECT' &&
      !event.target.isContentEditable
    ) {
      event.preventDefault();
      undoLastModification();
    }
    return;
  }

  // ブラウザ・OSのショートカット（Ctrl+R, Ctrl+1 等）には反応しない
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }

  switch (event.key.toLowerCase()) {
    case 'l':
      event.preventDefault();
      toggleLegend();
      break;

    case 'a':
      event.preventDefault();
      toggleModelAVisibility();
      break;

    case 'b':
      event.preventDefault();
      toggleModelBVisibility();
      break;

    case 'r':
      event.preventDefault();
      resetAllSelectors();
      break;
  }
}

/**
 * Handle window resize
 * @param {Event} _event - Resize event
 */
function handleWindowResize(_event) {
  // Debounce resize handling
  clearTimeout(window.resizeTimeout);
  window.resizeTimeout = setTimeout(() => {
    log.info('[Event] ウィンドウリサイズ');
    // Could trigger layout updates here if needed
  }, 250);
}

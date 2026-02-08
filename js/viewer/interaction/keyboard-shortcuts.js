/**
 * @fileoverview キーボードショートカットモジュール
 *
 * ビュー操作のキーボードショートカットを提供します:
 * - F: 選択要素にフォーカス＆回転中心設定
 * - Home: モデル全体にフィット＆回転中心リセット
 * - Escape: 選択解除
 */

import { controls } from '../index.js';
import {
  getSelectedCenter,
  resetSelection,
  createOrUpdateOrbitCenterHelper,
  hideOrbitCenterHelper,
} from '../../app/interaction.js';
import { focusOnSelected, fitCameraToModel } from '../camera/cameraFitter.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('viewer:keyboard');

let isInitialized = false;

/**
 * 選択要素に回転中心を設定
 * @returns {boolean} 成功した場合true
 */
export function setOrbitCenterToSelected() {
  const center = getSelectedCenter();

  if (!center) {
    log.debug('No selected element for orbit center');
    return false;
  }

  // 回転中心を設定
  if (controls && typeof controls.setOrbitPoint === 'function') {
    controls.stop?.();
    controls.setOrbitPoint(center.x, center.y, center.z);
    log.debug('Orbit point set to selected element', center.toArray());
  } else if (controls && controls.target) {
    controls.target.copy(center);
    controls.update?.();
  }

  // 回転中心ヘルパーを表示
  createOrUpdateOrbitCenterHelper(center);

  return true;
}

/**
 * 回転中心をリセット（ヘルパーを非表示に）
 */
export function resetOrbitCenter() {
  hideOrbitCenterHelper();
}

/**
 * キーボードイベントハンドラー
 * @param {KeyboardEvent} event
 */
function handleKeyDown(event) {
  // 入力フィールド内では無視
  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  ) {
    return;
  }

  switch (event.key.toLowerCase()) {
    case 'f':
      // F: 選択要素にフォーカス
      if (!event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        const success = focusOnSelected({ enableTransition: true, padding: 2.0 });
        if (success) {
          // フォーカス後に回転中心も設定
          setOrbitCenterToSelected();
          log.info('Focused on selected element');
        } else {
          log.debug('No element to focus on');
        }
      }
      break;

    case 'home':
      // Home: モデル全体にフィット
      if (!event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        const success = fitCameraToModel({ enableTransition: true, padding: 1.2 });
        if (success) {
          // モデル全体フィット時は回転中心ヘルパーを非表示
          resetOrbitCenter();
          log.info('Camera fitted to model');
        } else {
          log.debug('No model content to fit');
        }
      }
      break;

    case 'escape':
      // Escape: 選択解除
      resetSelection();
      log.debug('Selection cleared via Escape key');
      break;
  }
}

/**
 * キーボードショートカットを初期化
 */
export function initKeyboardShortcuts() {
  if (isInitialized) {
    log.warn('Keyboard shortcuts already initialized');
    return;
  }

  window.addEventListener('keydown', handleKeyDown);
  isInitialized = true;

  log.info('Keyboard shortcuts initialized (F: focus, Home: fit model, Escape: clear)');
}

/**
 * キーボードショートカットを破棄
 */
export function disposeKeyboardShortcuts() {
  if (!isInitialized) return;

  window.removeEventListener('keydown', handleKeyDown);
  isInitialized = false;

  log.info('Keyboard shortcuts disposed');
}

export default {
  initKeyboardShortcuts,
  disposeKeyboardShortcuts,
  setOrbitCenterToSelected,
  resetOrbitCenter,
};

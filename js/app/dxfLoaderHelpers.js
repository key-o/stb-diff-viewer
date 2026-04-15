/**
 * @fileoverview DXFローダー共有ヘルパー関数
 *
 * dxfLoader配下のサブモジュールで共有されるユーティリティ関数を提供します。
 */

import { getState } from '../data/state/globalState.js';
import { eventBus, ToastEvents } from '../data/events/index.js';

/**
 * 現在のSTB階情報を取得
 * @returns {Array} 階情報の配列
 */
export function getCurrentStories() {
  return getState('models.stories') || [];
}

/**
 * 現在のSTB通り芯情報を取得
 * @returns {Object} 通り芯データ {xAxes, yAxes}
 */
export function getCurrentAxesData() {
  return getState('models.axesData') || { xAxes: [], yAxes: [] };
}

/**
 * エラーメッセージを表示
 * @param {string} message - エラーメッセージ
 */
export function showError(message) {
  eventBus.emit(ToastEvents.SHOW_ERROR, { message });
}

/**
 * 警告メッセージを表示
 * @param {string} message - 警告メッセージ
 */
export function showWarning(message) {
  eventBus.emit(ToastEvents.SHOW_WARNING, { message });
}

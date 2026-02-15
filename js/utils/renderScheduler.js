/**
 * @fileoverview レンダリングスケジューラー
 *
 * Three.jsの再描画リクエストを一元管理するユーティリティ。
 * 複数のパターン（getState経由、window.requestRender、関数参照渡し）を
 * 単一のAPIに統一します。
 *
 * @module utils/renderScheduler
 */

import { getState } from '../app/globalState.js';

/**
 * 再描画をスケジュール
 *
 * globalStateに登録されているscheduleRender関数を呼び出します。
 * 関数が未登録の場合は何もしません。
 *
 * @example
 * // 色変更後に再描画をリクエスト
 * colorManager.setElementColor('Column', '#ff0000');
 * scheduleRender();
 */
export function scheduleRender() {
  const fn = getState('rendering.scheduleRender');
  if (typeof fn === 'function') {
    fn();
  }
}

/**
 * 即座に再描画をリクエスト
 *
 * scheduleRenderと同じ動作ですが、意図を明確にするためのエイリアス。
 * アニメーションループ外での即座の描画更新が必要な場合に使用。
 */
function requestImmediateRender() {
  scheduleRender();
}

/**
 * レンダリング関数が利用可能かどうかをチェック
 *
 * @returns {boolean} scheduleRender関数が登録済みの場合true
 */
function isRenderAvailable() {
  const fn = getState('rendering.scheduleRender');
  return typeof fn === 'function';
}

export default {
  scheduleRender,
  requestImmediateRender,
  isRenderAvailable,
};

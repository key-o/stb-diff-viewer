/**
 * @fileoverview レンダリングスケジューラー
 *
 * Three.jsの再描画リクエストを一元管理するユーティリティ。
 * 依存性注入パターンで外部からレンダリング関数を設定します。
 *
 * @module utils/renderScheduler
 */

/** @type {Function|null} */
let renderFn = null;

/**
 * レンダリング関数を設定（依存性注入）
 * @param {Function} fn - 再描画スケジュール関数
 */
export function setRenderFunction(fn) {
  renderFn = fn;
}

/**
 * 再描画をスケジュール
 */
export function scheduleRender() {
  if (typeof renderFn === 'function') {
    renderFn();
  }
}

/**
 * 即座に再描画をリクエスト
 */
function requestImmediateRender() {
  scheduleRender();
}

/**
 * レンダリング関数が利用可能かどうかをチェック
 * @returns {boolean} scheduleRender関数が登録済みの場合true
 */
function isRenderAvailable() {
  return typeof renderFn === 'function';
}

export default {
  scheduleRender,
  requestImmediateRender,
  isRenderAvailable,
};

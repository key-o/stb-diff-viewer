/**
 * @fileoverview HTML関連のユーティリティ関数
 * @module utils/htmlUtils
 */

/**
 * HTML特殊文字をエスケープ
 * @param {*} str - エスケープ対象の文字列
 * @returns {string} エスケープ済み文字列
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * HTML属性値として安全な文字列に変換する
 * @param {*} value - エスケープ対象の値
 * @returns {string}
 */
export function escapeHtmlAttribute(value) {
  return escapeHtml(value);
}

/**
 * 値セルに挿入するHTMLを生成する。
 * 実データは必ずエスケープし、値なし表示だけ既知のHTMLを使う。
 * @param {*} value - 表示する値
 * @param {string} fallbackHtml - 値がない場合のHTML
 * @returns {string}
 */
export function valueToSafeHtml(value, fallbackHtml = '<span class="no-value">-</span>') {
  return value === null || value === undefined ? fallbackHtml : escapeHtml(value);
}

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
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

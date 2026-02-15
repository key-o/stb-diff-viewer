/**
 * @fileoverview CSS動的生成ユーティリティ
 *
 * このファイルは、設定ファイルからCSSを動的生成する機能を提供します:
 * - 差分カテゴリの色定義CSS生成
 * - スタイルシートの動的挿入
 *
 * @module utils/cssGenerator
 */

import { DIFF_CATEGORIES } from '../config/diffFilterConfig.js';

/**
 * 差分凡例用CSSを生成
 * @param {Array<Object>} [categories=DIFF_CATEGORIES] - カテゴリ定義配列
 * @returns {string} CSS文字列
 */
function generateDiffLegendCSS(categories = DIFF_CATEGORIES) {
  const cssRules = categories
    .map(
      (cat) => `
/* ${cat.label.ja} (${cat.id}) */
.${cat.htmlColorClass} {
  background-color: ${cat.color};
}

#diff-color-${cat.id} {
  background-color: ${cat.color};
}

.diff-status-${cat.id} {
  color: ${cat.color};
}
`,
    )
    .join('\n');

  return `
/* ============================================
   差分フィルタ凡例色 - 自動生成
   config/diffFilterConfig.js から生成
   このCSSは動的に生成されています。直接編集しないでください。
   ============================================ */
${cssRules}
`.trim();
}

/**
 * スタイルシートを動的挿入
 * @param {string} css - CSS文字列
 * @param {string} [id='dynamic-diff-legend-styles'] - style要素のID
 * @returns {HTMLStyleElement} 挿入されたstyle要素
 */
function injectStyleSheet(css, id = 'dynamic-diff-legend-styles') {
  let styleEl = document.getElementById(id);

  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = id;
    styleEl.setAttribute('data-generated', 'true');
    document.head.appendChild(styleEl);
  }

  styleEl.textContent = css;
  return styleEl;
}

/**
 * 動的スタイルシートを削除
 * @param {string} [id='dynamic-diff-legend-styles'] - style要素のID
 * @returns {boolean} 削除成功かどうか
 */
function removeStyleSheet(id = 'dynamic-diff-legend-styles') {
  const styleEl = document.getElementById(id);
  if (styleEl) {
    styleEl.remove();
    return true;
  }
  return false;
}

/**
 * 差分凡例CSSを初期化（生成・挿入）
 * @param {Array<Object>} [categories=DIFF_CATEGORIES] - カテゴリ定義配列
 * @returns {HTMLStyleElement} 挿入されたstyle要素
 */
export function initializeDiffLegendCSS(categories = DIFF_CATEGORIES) {
  const css = generateDiffLegendCSS(categories);
  const styleEl = injectStyleSheet(css);
  console.log('[Event] 差分凡例CSSを動的生成しました');
  return styleEl;
}

/**
 * カスタムCSS変数を生成
 * @param {Array<Object>} [categories=DIFF_CATEGORIES] - カテゴリ定義配列
 * @returns {string} CSS変数定義
 */
function generateDiffColorVariables(categories = DIFF_CATEGORIES) {
  const variables = categories.map((cat) => `  --diff-color-${cat.id}: ${cat.color};`).join('\n');

  return `
:root {
${variables}
}
`.trim();
}

/**
 * 差分カテゴリの色をCSS変数として登録
 * @param {Array<Object>} [categories=DIFF_CATEGORIES] - カテゴリ定義配列
 * @returns {HTMLStyleElement} 挿入されたstyle要素
 */
function initializeDiffColorVariables(categories = DIFF_CATEGORIES) {
  const css = generateDiffColorVariables(categories);
  return injectStyleSheet(css, 'dynamic-diff-color-variables');
}

export default {
  generateDiffLegendCSS,
  injectStyleSheet,
  removeStyleSheet,
  initializeDiffLegendCSS,
  generateDiffColorVariables,
  initializeDiffColorVariables,
};

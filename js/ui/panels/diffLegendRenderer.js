/**
 * @fileoverview 差分フィルタ凡例レンダラー
 *
 * このファイルは、差分フィルタ凡例のHTML動的生成機能を提供します:
 * - config/diffFilterConfig.js の設定からHTML生成
 * - カテゴリ凡例の描画
 * - プリセットボタンの描画
 * - 国際化対応
 *
 * @module ui/panels/diffLegendRenderer
 */

import {
  DIFF_CATEGORIES,
  DIFF_FILTER_PRESETS,
  DIFF_FILTER_UI_CONFIG,
  getCategoryLabel,
  getPresetName,
} from '../../config/diffFilterConfig.js';

/**
 * 差分フィルタ凡例レンダラークラス
 */
export class DiffLegendRenderer {
  /**
   * @param {string} [locale='ja'] - 言語コード
   */
  constructor(locale = DIFF_FILTER_UI_CONFIG.locale || 'ja') {
    this.locale = locale;
    this.config = DIFF_FILTER_UI_CONFIG;
  }

  /**
   * 凡例HTMLを生成
   * @param {string} [containerId='diff-filter-legend'] - コンテナ要素のID
   * @returns {string} HTML文字列
   */
  renderLegend(containerId = 'diff-filter-legend') {
    const sortedCategories = [...DIFF_CATEGORIES].sort((a, b) => a.order - b.order);

    const items = sortedCategories.map((cat) => this.renderCategoryItem(cat)).join('\n');

    return `<div class="color-legend-container" id="${containerId}">${items}</div>`;
  }

  /**
   * カテゴリ1つ分のHTMLを生成
   * @param {Object} category - カテゴリ定義
   * @returns {string} HTML文字列
   */
  renderCategoryItem(category) {
    const label = getCategoryLabel(category.id, this.locale);
    const description = category.description[this.locale] || category.description.ja;
    const showIcon = this.config.showIcons && category.icon;

    return `
      <div class="legend-item diff-filter-item"
           data-status="${category.id}"
           title="${description}">
        <input type="checkbox"
               class="diff-filter-checkbox"
               id="${category.htmlCheckboxId}"
               checked />
        <span class="legend-color-box ${category.htmlColorClass}"></span>
        <span class="legend-label">${showIcon ? category.icon + ' ' : ''}${label}</span>
        ${this.config.showCounts ? `<span id="${category.htmlCountId}" class="legend-count">0</span>` : ''}
      </div>
    `.trim();
  }

  /**
   * プリセットボタンHTMLを生成
   * @param {string} [containerId='diff-filter-presets'] - コンテナ要素のID
   * @returns {string} HTML文字列
   */
  renderPresetButtons(containerId = 'diff-filter-presets') {
    if (!this.config.enablePresets) {
      return '';
    }

    const sortedPresets = [...DIFF_FILTER_PRESETS].sort((a, b) => a.order - b.order);

    const buttons = sortedPresets.map((preset) => this.renderPresetButton(preset)).join('\n');

    return `<div class="diff-preset-buttons" id="${containerId}">${buttons}</div>`;
  }

  /**
   * プリセットボタン1つ分のHTMLを生成
   * @param {Object} preset - プリセット定義
   * @returns {string} HTML文字列
   */
  renderPresetButton(preset) {
    const name = getPresetName(preset.id, this.locale);
    const description = preset.description[this.locale] || preset.description.ja;

    return `
      <button class="preset-btn"
              data-preset="${preset.id}"
              title="${description}">
        ${preset.icon ? preset.icon + ' ' : ''}${name}
      </button>
    `.trim();
  }

  /**
   * 統計表示HTMLを生成
   * @returns {string} HTML文字列
   */
  renderStats() {
    return `
      <div class="diff-filter-stats">
        <span>表示中: </span>
        <span id="diff-visible-count">0</span>
        <span> / </span>
        <span id="diff-total-count">0</span>
        <span> 要素</span>
      </div>
    `.trim();
  }

  /**
   * 完全なフィルタパネルHTMLを生成
   * @returns {string} HTML文字列
   */
  renderFullPanel() {
    return `
      <div class="diff-filter-panel">
        <h4>差分フィルタ</h4>
        ${this.renderPresetButtons()}
        ${this.renderLegend()}
        ${this.renderStats()}
      </div>
    `.trim();
  }

  /**
   * DOMにHTML挿入
   * @param {string} parentId - 親要素のID
   * @param {string} html - 挿入するHTML
   * @returns {boolean} 挿入成功かどうか
   */
  insertIntoDOM(parentId, html) {
    const parent = document.getElementById(parentId);
    if (parent) {
      parent.innerHTML = html;
      return true;
    }
    console.warn(`[DiffLegendRenderer] Parent element not found: ${parentId}`);
    return false;
  }

  /**
   * 凡例をDOMに挿入
   * @param {string} parentId - 親要素のID
   * @returns {boolean} 挿入成功かどうか
   */
  insertLegend(parentId) {
    const html = this.renderLegend();
    return this.insertIntoDOM(parentId, html);
  }

  /**
   * プリセットボタンをDOMに挿入
   * @param {string} parentId - 親要素のID
   * @returns {boolean} 挿入成功かどうか
   */
  insertPresetButtons(parentId) {
    const html = this.renderPresetButtons();
    return this.insertIntoDOM(parentId, html);
  }

  /**
   * 言語を変更
   * @param {string} locale - 言語コード
   */
  setLocale(locale) {
    this.locale = locale;
  }
}

// シングルトンインスタンス
let diffLegendRendererInstance = null;

/**
 * DiffLegendRendererのシングルトンインスタンスを取得
 * @param {string} [locale] - 言語コード
 * @returns {DiffLegendRenderer} インスタンス
 */
export function getDiffLegendRenderer(locale) {
  if (!diffLegendRendererInstance) {
    diffLegendRendererInstance = new DiffLegendRenderer(locale);
  } else if (locale && locale !== diffLegendRendererInstance.locale) {
    diffLegendRendererInstance.setLocale(locale);
  }
  return diffLegendRendererInstance;
}

/**
 * 凡例を初期化（DOM挿入）
 * @param {string} [legendContainerId='diff-filter-legend-container'] - 凡例コンテナのID
 * @param {string} [presetContainerId='diff-filter-presets-container'] - プリセットコンテナのID
 * @returns {DiffLegendRenderer} レンダラーインスタンス
 */
export function initializeDiffLegend(
  legendContainerId = 'diff-filter-legend-container',
  presetContainerId = 'diff-filter-presets-container',
) {
  const renderer = getDiffLegendRenderer();

  // 凡例の挿入
  const legendParent = document.getElementById(legendContainerId);
  if (legendParent) {
    legendParent.innerHTML = renderer.renderLegend();
  }

  // プリセットボタンの挿入
  const presetParent = document.getElementById(presetContainerId);
  if (presetParent) {
    presetParent.innerHTML = renderer.renderPresetButtons();
  }

  console.log('[Event] 差分フィルタ凡例を動的生成しました');
  return renderer;
}

export default DiffLegendRenderer;

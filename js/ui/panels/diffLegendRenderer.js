/**
 * @fileoverview 差分フィルタ凡例レンダラー
 *
 * このファイルは、差分フィルタ凡例のDOM動的生成機能を提供します:
 * - config/diffFilterConfig.js の設定からDOM生成
 * - カテゴリ凡例の描画
 * - プリセットボタンの描画
 * - 国際化対応
 *
 * 返り値は全て DOM Node です（innerHTML を介しません）。
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
import { createLogger } from '../../utils/logger.js';

const log = createLogger('ui:panels:diffLegendRenderer');

/**
 * 差分フィルタ凡例レンダラークラス
 */
class DiffLegendRenderer {
  /**
   * @param {string} [locale='ja'] - 言語コード
   */
  constructor(locale = DIFF_FILTER_UI_CONFIG.locale || 'ja') {
    this.locale = locale;
    this.config = DIFF_FILTER_UI_CONFIG;
  }

  /**
   * 凡例コンテナを生成
   * @param {string} [containerId='diff-filter-legend']
   * @returns {HTMLDivElement}
   */
  renderLegend(containerId = 'diff-filter-legend') {
    const container = document.createElement('div');
    container.className = 'color-legend-container';
    container.id = containerId;
    const sortedCategories = [...DIFF_CATEGORIES].sort((a, b) => a.order - b.order);
    for (const cat of sortedCategories) {
      container.appendChild(this.renderCategoryItem(cat));
    }
    return container;
  }

  /**
   * カテゴリ1つ分のDOMを生成
   * @param {Object} category
   * @returns {HTMLDivElement}
   */
  renderCategoryItem(category) {
    const label = getCategoryLabel(category.id, this.locale);
    const description = category.description[this.locale] || category.description.ja;
    const showIcon = this.config.showIcons && category.icon;

    const item = document.createElement('div');
    item.className = 'legend-item diff-filter-item';
    item.dataset.status = category.id;
    item.title = description;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'diff-filter-checkbox';
    checkbox.id = category.htmlCheckboxId;
    checkbox.checked = true;
    item.appendChild(checkbox);

    const colorBox = document.createElement('span');
    colorBox.className = `legend-color-box ${category.htmlColorClass}`;
    item.appendChild(colorBox);

    const labelSpan = document.createElement('span');
    labelSpan.className = 'legend-label';
    labelSpan.textContent = showIcon ? `${category.icon} ${label}` : label;
    item.appendChild(labelSpan);

    if (this.config.showCounts) {
      const count = document.createElement('span');
      count.id = category.htmlCountId;
      count.className = 'legend-count';
      count.textContent = '0';
      item.appendChild(count);
    }

    return item;
  }

  /**
   * プリセットボタンのコンテナを生成
   * @param {string} [containerId='diff-filter-presets']
   * @returns {HTMLDivElement|null}
   */
  renderPresetButtons(containerId = 'diff-filter-presets') {
    if (!this.config.enablePresets) {
      return null;
    }

    const container = document.createElement('div');
    container.className = 'diff-preset-buttons';
    container.id = containerId;

    const sortedPresets = [...DIFF_FILTER_PRESETS].sort((a, b) => a.order - b.order);
    for (const preset of sortedPresets) {
      container.appendChild(this.renderPresetButton(preset));
    }
    return container;
  }

  /**
   * プリセットボタン1つ分のDOMを生成
   * @param {Object} preset
   * @returns {HTMLButtonElement}
   */
  renderPresetButton(preset) {
    const name = getPresetName(preset.id, this.locale);
    const description = preset.description[this.locale] || preset.description.ja;

    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.dataset.preset = preset.id;
    btn.title = description;
    btn.textContent = preset.icon ? `${preset.icon} ${name}` : name;
    return btn;
  }

  /**
   * 統計表示のDOMを生成
   * @returns {HTMLDivElement}
   */
  renderStats() {
    const stats = document.createElement('div');
    stats.className = 'diff-filter-stats';

    const label1 = document.createElement('span');
    label1.textContent = '表示中: ';

    const visibleCount = document.createElement('span');
    visibleCount.id = 'diff-visible-count';
    visibleCount.textContent = '0';

    const separator = document.createElement('span');
    separator.textContent = ' / ';

    const totalCount = document.createElement('span');
    totalCount.id = 'diff-total-count';
    totalCount.textContent = '0';

    const unit = document.createElement('span');
    unit.textContent = ' 要素';

    stats.append(label1, visibleCount, separator, totalCount, unit);
    return stats;
  }

  /**
   * 完全なフィルタパネルのDOMを生成
   * @returns {HTMLDivElement}
   */
  renderFullPanel() {
    const panel = document.createElement('div');
    panel.className = 'diff-filter-panel';

    const heading = document.createElement('h4');
    heading.textContent = '差分フィルタ';
    panel.appendChild(heading);

    const presets = this.renderPresetButtons();
    if (presets) panel.appendChild(presets);
    panel.appendChild(this.renderLegend());
    panel.appendChild(this.renderStats());
    return panel;
  }

  /**
   * DOMに子ノードを挿入（既存の子を置き換え）
   * @param {string} parentId
   * @param {Node} node
   * @returns {boolean} 挿入成功かどうか
   */
  insertIntoDOM(parentId, node) {
    const parent = document.getElementById(parentId);
    if (parent) {
      parent.replaceChildren(node);
      return true;
    }
    log.warn(`[DiffLegendRenderer] Parent element not found: ${parentId}`);
    return false;
  }

  /**
   * 凡例をDOMに挿入
   * @param {string} parentId
   * @returns {boolean}
   */
  insertLegend(parentId) {
    return this.insertIntoDOM(parentId, this.renderLegend());
  }

  /**
   * プリセットボタンをDOMに挿入
   * @param {string} parentId
   * @returns {boolean}
   */
  insertPresetButtons(parentId) {
    const presets = this.renderPresetButtons();
    if (!presets) return false;
    return this.insertIntoDOM(parentId, presets);
  }

  /**
   * 言語を変更
   * @param {string} locale
   */
  setLocale(locale) {
    this.locale = locale;
  }
}

// シングルトンインスタンス
let diffLegendRendererInstance = null;

/**
 * DiffLegendRendererのシングルトンインスタンスを取得
 * @param {string} [locale]
 * @returns {DiffLegendRenderer}
 */
export function getDiffLegendRenderer(locale) {
  if (!diffLegendRendererInstance) {
    diffLegendRendererInstance = new DiffLegendRenderer(locale);
  } else if (locale && locale !== diffLegendRendererInstance.locale) {
    diffLegendRendererInstance.setLocale(locale);
  }
  return diffLegendRendererInstance;
}

export default DiffLegendRenderer;

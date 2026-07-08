/**
 * @fileoverview 差分一覧表示機能
 *
 * このファイルは、モデル比較結果の差分を一覧表示し、
 * クリックで3Dビューの該当要素にジャンプする機能を提供します:
 * - 差分カテゴリ（モデルAのみ、モデルBのみ）別の表示
 * - 要素タイプでのフィルタリング
 * - 3Dビューとの連携（ハイライト・フォーカス）
 * - 統計情報との連携
 */

import { getState, setState } from '../../data/state/globalState.js';
import { floatingWindowManager } from './floatingWindowManager.js';
import { sceneController } from '../../app/controllers/sceneController.js';
import { selectElement3D } from '../../app/controllers/interactionController.js';
import { findElementInGroup } from '../../viewer/index.js';
import { UI_TIMING } from '../../config/uiTimingConfig.js';
import { ComparisonEvents } from '../../data/events/index.js';
import { VersionEvents } from '../../constants/eventTypes.js';
import { ELEMENT_LABELS } from '../../config/elementLabels.js';
import { shouldShowVersionSpecificDifferences, getCurrentVersionInfo } from './versionPanel.js';
import { scheduleRender } from '../../utils/renderScheduler.js';
import { createLogger } from '../../utils/logger.js';
import { UIComponent } from '../common/UIComponent.js';
import { escapeHtml } from '../../utils/htmlUtils.js';
import { diffDefinitionElements } from '../../common-stb/comparison/stbDefinitionComparator.js';
import { showRawXmlForElement } from './rawXmlDiffViewer.js';

const log = createLogger('ui:panels:diffList');

/**
 * 差分一覧表示クラス
 */
export class DiffListPanel extends UIComponent {
  constructor() {
    super();
    this.isVisible = false;
    this.containerElement = null;
    this.diffData = {
      onlyA: [],
      onlyB: [],
      attributeMismatch: [],
      matched: [],
      versionDifferences: [], // バージョン固有差分を追跡
    };
    this.currentFilter = {
      category: 'all', // 'all', 'onlyA', 'onlyB', 'versionOnly'
      elementType: 'all',
      showVersionDifferences: true, // バージョン固有差分を表示するか
    };
    this.elementTypes = new Set();
    this.versionInfo = { versionA: null, versionB: null, isCrossVersion: false };

    this.setupEventListeners();
  }

  /**
   * イベントリスナーを設定
   */
  setupEventListeners() {
    // 比較結果更新時（EventBus経由）
    this.onBus(ComparisonEvents.UPDATE_STATISTICS, (data) => {
      if (data && data.comparisonResults) {
        this.updateDiffList(data.comparisonResults);
      }
    });

    // バージョンフィルタ変更時
    this.onBus(VersionEvents.FILTER_CHANGED, (data) => {
      this.currentFilter.showVersionDifferences = data.showVersionSpecificDifferences;
      if (this.isVisible) {
        this.renderList();
      }
    });

    // バージョン情報更新時
    this.onBus(VersionEvents.INFO_UPDATED, (data) => {
      if (data) {
        this.versionInfo = {
          versionA: data.versionA,
          versionB: data.versionB,
          isCrossVersion:
            data.versionA !== data.versionB &&
            data.versionA !== 'unknown' &&
            data.versionB !== 'unknown',
        };
      }
    });
  }

  /**
   * パネルを初期化
   * @param {HTMLElement} containerElement - パネルを配置するコンテナ
   */
  initialize(containerElement) {
    this.containerElement = containerElement;
    this.createPanelHTML();
    this.bindEvents();
    this.registerWithWindowManager();

    log.info('[Event] DiffListPanel初期化完了');
  }

  /**
   * Windowマネージャに登録
   */
  registerWithWindowManager() {
    floatingWindowManager.registerWindow({
      windowId: 'diff-list-panel',
      toggleButtonId: null,
      closeButtonId: 'diff-list-close',
      headerId: 'diff-list-header',
      draggable: true,
      autoShow: false,
      onShow: () => {
        this.isVisible = true;
        this.refreshList();
        setState('ui.diffListPanelVisible', true);
      },
      onHide: () => {
        this.isVisible = false;
        setState('ui.diffListPanelVisible', false);
      },
    });
  }

  /**
   * パネルのHTMLを作成
   */
  createPanelHTML() {
    const panelHTML = `
      <div id="diff-list-panel" class="floating-window diff-list-panel">
        <div class="float-window-header" id="diff-list-header">
          <span class="float-window-title">📋 差分一覧</span>
          <div class="float-window-sceneController.getCameraControls()">
            <button class="float-window-btn" id="diff-list-refresh" title="更新">🔄</button>
            <button class="float-window-btn" id="diff-list-close">✕</button>
          </div>
        </div>
        <div class="float-window-content">
          <!-- フィルタセクション -->
          <div class="diff-list-filters">
            <div class="filter-row">
              <label>カテゴリ:</label>
              <select id="diff-category-filter">
                <option value="all">すべて</option>
                <option value="attributeMismatch">属性不一致</option>
                <option value="attributeMismatchInstance">インスタンス属性差</option>
                <option value="attributeMismatchType">タイプ情報差</option>
                <option value="attributeMismatchBoth">属性+タイプ差</option>
                <option value="onlyA">モデルAのみ</option>
                <option value="onlyB">モデルBのみ</option>
                <option value="versionOnly">バージョン差のみ</option>
              </select>
            </div>
            <div class="filter-row">
              <label>要素タイプ:</label>
              <select id="diff-element-type-filter">
                <option value="all">すべて</option>
              </select>
            </div>
          </div>

          <!-- サマリー表示 -->
          <div class="diff-list-summary">
            <span class="summary-item onlyA">
              <span class="color-indicator"></span>
              🔵 Aのみ: <strong id="diff-count-onlyA">0</strong>
            </span>
            <span class="summary-item onlyB">
              <span class="color-indicator"></span>
              🔴 Bのみ: <strong id="diff-count-onlyB">0</strong>
            </span>
            <span class="summary-item attributeMismatch">
              <span class="color-indicator"></span>
              🟠 属性: <strong id="diff-count-attributeMismatch">0</strong>
            </span>
            <span class="summary-item versionOnly" style="display: none;">
              <span class="color-indicator"></span>
              ⚪ Ver差: <strong id="diff-count-version">0</strong>
            </span>
            <span class="summary-item total">
              合計: <strong id="diff-count-total">0</strong>
            </span>
          </div>

          <!-- 凡例（クロスバージョン時のみ表示） -->
          <div class="diff-list-legend" id="diff-list-legend" style="display: none;">
            <span class="legend-item">🔵 新規(A)</span>
            <span class="legend-item">🔴 削除(B)</span>
            <span class="legend-item">⚪ バージョン差</span>
          </div>

          <!-- 差分リスト -->
          <div class="diff-list-container" id="diff-list-container">
            <div class="diff-list-empty">
              モデルを比較すると差分が表示されます
            </div>
          </div>
        </div>
      </div>
    `;

    this.containerElement.insertAdjacentHTML('beforeend', panelHTML);
  }

  /**
   * イベントを関連付け
   */
  bindEvents() {
    // 閉じるボタン
    document.getElementById('diff-list-close').addEventListener('click', () => {
      this.hide();
    });

    // 更新ボタン
    document.getElementById('diff-list-refresh').addEventListener('click', () => {
      this.refreshList();
    });

    // カテゴリフィルタ
    document.getElementById('diff-category-filter').addEventListener('change', (e) => {
      this.currentFilter.category = e.target.value;
      this.renderList();
    });

    // 要素タイプフィルタ
    document.getElementById('diff-element-type-filter').addEventListener('change', (e) => {
      this.currentFilter.elementType = e.target.value;
      this.renderList();
    });
  }

  /**
   * 差分データを更新
   * @param {Map} comparisonResults - 比較結果
   */
  updateDiffList(comparisonResults) {
    this.diffData = {
      onlyA: [],
      onlyB: [],
      attributeMismatch: [],
      matched: [],
      versionDifferences: [],
    };
    this.elementTypes.clear();

    // バージョン情報を取得
    const versionInfo = getCurrentVersionInfo();
    this.versionInfo = versionInfo;

    if (!comparisonResults) return;

    // MapまたはObjectを処理
    const entries =
      comparisonResults instanceof Map
        ? comparisonResults.entries()
        : Object.entries(comparisonResults);

    for (const [elementType, result] of entries) {
      if (!result) continue;

      this.elementTypes.add(elementType);

      // 3D描画されないタイプ（STB定義等）はonlyA/onlyBもフォーカス不可（生XMLで確認する）
      const isRenderable = result.isRenderable !== false;

      // onlyA要素を追加
      if (result.onlyA && Array.isArray(result.onlyA)) {
        result.onlyA.forEach((item) => {
          this.diffData.onlyA.push({
            elementType,
            id: item.id,
            name: item.name || item.id,
            category: 'onlyA',
            data: item,
            isVersionSpecificOnly: false,
            isRenderable,
          });
        });
      }

      // onlyB要素を追加
      if (result.onlyB && Array.isArray(result.onlyB)) {
        result.onlyB.forEach((item) => {
          this.diffData.onlyB.push({
            elementType,
            id: item.id,
            name: item.name || item.id,
            category: 'onlyB',
            data: item,
            isVersionSpecificOnly: false,
            isRenderable,
          });
        });
      }

      if (result.attributeMismatch && Array.isArray(result.attributeMismatch)) {
        result.attributeMismatch.forEach((item) => {
          const id = item.dataA?.id || item.dataB?.id || item.id;
          const name = item.dataA?.name || item.dataB?.name || id;
          this.diffData.attributeMismatch.push({
            elementType,
            id,
            name,
            category: 'attributeMismatch',
            diffStatus: item.diffStatus || 'attributeMismatch',
            attributeMismatchKind: item.attributeMismatchKind || null,
            data: item,
            isVersionSpecificOnly: false,
            isRenderable: result.isRenderable !== false,
          });
        });
      }

      // matched要素からバージョン固有差分を抽出
      if (result.matched && Array.isArray(result.matched)) {
        result.matched.forEach((match) => {
          // versionComparisonがある場合（compareElementsVersionAwareの結果）
          if (match.versionComparison && match.hasVersionOnlyDiff) {
            this.diffData.versionDifferences.push({
              elementType,
              id: match.dataA?.id || match.dataB?.id,
              name: match.dataA?.name || match.dataB?.name || match.dataA?.id,
              category: 'versionOnly',
              data: match,
              isVersionSpecificOnly: true,
              versionDifferences: match.versionDifferences || [],
            });
          }
        });
      }

      // versionDifferencesが直接含まれる場合（別の形式）
      if (result.versionDifferences && Array.isArray(result.versionDifferences)) {
        result.versionDifferences.forEach((item) => {
          this.diffData.versionDifferences.push({
            elementType,
            id: item.elementA?.id || item.elementB?.id,
            name: item.elementA?.name || item.elementB?.name || item.elementA?.id,
            category: 'versionOnly',
            data: item,
            isVersionSpecificOnly: true,
            versionDifferences: item.differences || [],
          });
        });
      }
    }

    // 要素タイプフィルタを更新
    this.updateElementTypeFilter();

    // フィルタ状態を同期
    this.currentFilter.showVersionDifferences = shouldShowVersionSpecificDifferences();

    // 表示を更新
    if (this.isVisible) {
      this.renderList();
    }
  }

  /**
   * 要素タイプフィルタの選択肢を更新
   */
  updateElementTypeFilter() {
    const select = document.getElementById('diff-element-type-filter');
    if (!select) return;

    // 現在の選択を保持
    const currentValue = select.value;

    // 選択肢を再構築
    select.innerHTML = '<option value="all">すべて</option>';

    for (const type of this.elementTypes) {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = this.getElementTypeDisplayName(type);
      select.appendChild(option);
    }

    // 可能なら以前の選択を復元
    if (this.elementTypes.has(currentValue)) {
      select.value = currentValue;
    }
  }

  /**
   * 要素タイプの表示名を取得
   * ELEMENT_LABELS（SSOT）を使用
   * @param {string} type - 要素タイプ
   * @returns {string} 表示名
   */
  getElementTypeDisplayName(type) {
    return ELEMENT_LABELS[type] || type;
  }

  /**
   * リストを再描画
   */
  renderList() {
    const container = document.getElementById('diff-list-container');
    if (!container) return;

    // バージョン情報を同期
    const currentVersionInfo = getCurrentVersionInfo();
    this.versionInfo = currentVersionInfo;

    // 凡例の表示/非表示を制御
    const legend = document.getElementById('diff-list-legend');
    if (legend) {
      legend.style.display = this.versionInfo.isCrossVersion ? 'flex' : 'none';
    }

    // バージョン差分サマリーの表示/非表示
    const versionSummaryItem = document.querySelector('.summary-item.versionOnly');
    if (versionSummaryItem) {
      versionSummaryItem.style.display = this.versionInfo.isCrossVersion ? 'inline-flex' : 'none';
    }

    // フィルタリングされたデータを取得
    const filteredData = this.getFilteredData();

    // サマリーを更新
    this.updateSummary(filteredData);

    // リストが空の場合
    if (filteredData.length === 0) {
      container.innerHTML = `
        <div class="diff-list-empty">
          ${
            this.diffData.onlyA.length + this.diffData.onlyB.length === 0
              ? 'モデルを比較すると差分が表示されます'
              : 'フィルタ条件に一致する差分はありません'
          }
        </div>
      `;
      return;
    }

    // 要素タイプでグループ化
    const grouped = this.groupByElementType(filteredData);

    // HTMLを生成
    let html = '';
    for (const [elementType, items] of Object.entries(grouped)) {
      html += this.renderElementTypeGroup(elementType, items);
    }

    container.innerHTML = html;

    // クリックイベントを設定
    this.setupItemClickHandlers(container);
  }

  /**
   * フィルタリングされたデータを取得
   * @returns {Array} フィルタ済みデータ
   */
  getFilteredData() {
    let data = [];

    // カテゴリフィルタ
    if (this.currentFilter.category === 'all') {
      data = [...this.diffData.attributeMismatch, ...this.diffData.onlyA, ...this.diffData.onlyB];
      // バージョン固有差分を含める（フィルタ設定に応じて）
      if (this.currentFilter.showVersionDifferences && this.versionInfo.isCrossVersion) {
        data = [...data, ...this.diffData.versionDifferences];
      }
    } else if (this.currentFilter.category === 'onlyA') {
      data = [...this.diffData.onlyA];
    } else if (this.currentFilter.category === 'onlyB') {
      data = [...this.diffData.onlyB];
    } else if (this.currentFilter.category === 'attributeMismatch') {
      data = [...this.diffData.attributeMismatch];
    } else if (
      ['attributeMismatchInstance', 'attributeMismatchType', 'attributeMismatchBoth'].includes(
        this.currentFilter.category,
      )
    ) {
      data = this.diffData.attributeMismatch.filter(
        (item) => item.diffStatus === this.currentFilter.category,
      );
    } else if (this.currentFilter.category === 'versionOnly') {
      // バージョン固有差分のみ
      data = [...this.diffData.versionDifferences];
    }

    // 要素タイプフィルタ
    if (this.currentFilter.elementType !== 'all') {
      data = data.filter((item) => item.elementType === this.currentFilter.elementType);
    }

    return data;
  }

  /**
   * 要素タイプでグループ化
   * @param {Array} data - データ配列
   * @returns {Object} グループ化されたデータ
   */
  groupByElementType(data) {
    const grouped = {};
    for (const item of data) {
      if (!grouped[item.elementType]) {
        grouped[item.elementType] = [];
      }
      grouped[item.elementType].push(item);
    }
    return grouped;
  }

  /**
   * 要素タイプグループのHTMLを生成
   * @param {string} elementType - 要素タイプ
   * @param {Array} items - アイテム配列
   * @returns {string} HTML文字列
   */
  renderElementTypeGroup(elementType, items) {
    const displayName = escapeHtml(this.getElementTypeDisplayName(elementType));
    const onlyACount = items.filter((i) => i.category === 'onlyA').length;
    const onlyBCount = items.filter((i) => i.category === 'onlyB').length;
    const attributeMismatchItems = items.filter((i) => i.category === 'attributeMismatch');
    const attributeMismatchCount = attributeMismatchItems.length;
    const attributeMismatchTypeCount = attributeMismatchItems.filter(
      (i) => i.diffStatus === 'attributeMismatchType',
    ).length;
    const attributeMismatchInstanceCount = attributeMismatchItems.filter(
      (i) => i.diffStatus === 'attributeMismatchInstance',
    ).length;
    const attributeMismatchBothCount = attributeMismatchItems.filter(
      (i) => i.diffStatus === 'attributeMismatchBoth',
    ).length;
    const versionOnlyCount = items.filter((i) => i.category === 'versionOnly').length;

    let html = `
      <div class="diff-group">
        <div class="diff-group-header">
          <span class="group-name">${displayName}</span>
          <span class="group-counts">
            ${onlyACount > 0 ? `<span class="count-a">🔵 ${onlyACount}</span>` : ''}
            ${onlyBCount > 0 ? `<span class="count-b">🔴 ${onlyBCount}</span>` : ''}
            ${
              attributeMismatchCount > 0
                ? `<span class="count-attr">🟠 ${attributeMismatchCount}</span>`
                : ''
            }
            ${
              attributeMismatchInstanceCount > 0
                ? `<span class="count-attr">I ${attributeMismatchInstanceCount}</span>`
                : ''
            }
            ${
              attributeMismatchTypeCount > 0
                ? `<span class="count-attr">T ${attributeMismatchTypeCount}</span>`
                : ''
            }
            ${
              attributeMismatchBothCount > 0
                ? `<span class="count-attr">B ${attributeMismatchBothCount}</span>`
                : ''
            }
            ${versionOnlyCount > 0 ? `<span class="count-version">⚪ ${versionOnlyCount}</span>` : ''}
          </span>
        </div>
        <div class="diff-group-items">
    `;

    for (const item of items) {
      html += this.renderDiffItem(item);
    }

    html += '</div></div>';
    return html;
  }

  /**
   * 差分アイテムのHTMLを生成
   * @param {Object} item - 差分アイテム
   * @returns {string} HTML文字列
   */
  renderDiffItem(item) {
    // バージョン固有差分の場合
    if (item.isVersionSpecificOnly) {
      return this.renderVersionDiffItem(item);
    }

    const categoryClass =
      item.category === 'onlyA'
        ? 'item-onlyA'
        : item.category === 'onlyB'
          ? 'item-onlyB'
          : 'item-attributeMismatch';
    const categoryLabel =
      item.category === 'onlyA'
        ? 'A'
        : item.category === 'onlyB'
          ? 'B'
          : this.getAttributeMismatchLabel(item);
    const icon =
      item.category === 'onlyA'
        ? '🔵'
        : item.category === 'onlyB'
          ? '🔴'
          : this.getAttributeMismatchIcon(item);
    const isRenderable = item.isRenderable !== false;
    // 3D描画される要素は「クリック→3Dで確認」、非描画要素は「クリック→生XMLで確認」
    const title = isRenderable ? '3Dビューで表示' : '生XMLを表示';
    const renderableClass = isRenderable ? '' : ' item-non-renderable';
    const actionLabel = isRenderable ? '👁' : '🔍';
    const actionClass = isRenderable ? 'item-action' : 'item-action item-raw-xml';

    // 属性不一致は展開トグルで属性差の詳細（A/B値）を確認できる
    const detailToggle =
      item.category === 'attributeMismatch'
        ? '<span class="item-detail-toggle" title="属性差の詳細を表示">▸</span>'
        : '';

    return `
      <div class="diff-item ${categoryClass}${renderableClass}"
           data-element-type="${escapeHtml(item.elementType)}"
           data-element-id="${escapeHtml(item.id)}"
           data-category="${escapeHtml(item.category)}"
           data-renderable="${isRenderable}">
        ${detailToggle}
        <span class="diff-icon">${escapeHtml(icon)}</span>
        <span class="item-category">${escapeHtml(categoryLabel)}</span>
        <span class="item-id">${escapeHtml(item.id)}</span>
        <span class="${actionClass}" title="${escapeHtml(title)}">${escapeHtml(actionLabel)}</span>
      </div>
    `;
  }

  getAttributeMismatchLabel(item) {
    switch (item.attributeMismatchKind || item.diffStatus) {
      case 'instance':
      case 'attributeMismatchInstance':
        return '属性';
      case 'type':
      case 'attributeMismatchType':
        return 'タイプ';
      case 'both':
      case 'attributeMismatchBoth':
        return '両方';
      default:
        return '属性';
    }
  }

  getAttributeMismatchIcon(item) {
    switch (item.attributeMismatchKind || item.diffStatus) {
      case 'type':
      case 'attributeMismatchType':
        return '🔷';
      case 'both':
      case 'attributeMismatchBoth':
        return '🟣';
      default:
        return '🟠';
    }
  }

  /**
   * 属性差詳細の展開/折りたたみを切り替える
   * @param {HTMLElement} rowElement - 差分アイテムの行要素
   */
  toggleItemDetails(rowElement) {
    const toggle = rowElement.querySelector('.item-detail-toggle');
    const next = rowElement.nextElementSibling;
    if (next && next.classList.contains('diff-item-details')) {
      next.remove();
      if (toggle) toggle.textContent = '▸';
      return;
    }

    const item = this.findAttributeMismatchItem(
      rowElement.dataset.elementType,
      rowElement.dataset.elementId,
    );
    const details = item ? this.buildItemDiffDetails(item) : null;
    rowElement.insertAdjacentHTML('afterend', this.renderItemDetailsHTML(details));
    if (toggle) toggle.textContent = '▾';
  }

  /**
   * 属性不一致アイテムを要素タイプ＋IDで検索する
   * @param {string} elementType - 要素タイプ
   * @param {string} elementId - 要素ID
   * @returns {Object|null} 差分アイテム
   */
  findAttributeMismatchItem(elementType, elementId) {
    return (
      this.diffData.attributeMismatch.find(
        (item) => item.elementType === elementType && String(item.id) === String(elementId),
      ) || null
    );
  }

  /**
   * 差分アイテムから表示用の属性差詳細を構築する。
   * 配置要素は比較結果に付与済みの attributeDiffDetails（インスタンス属性差＋断面シグネチャ差）を、
   * STB定義など詳細を持たないペアは rawElement から属性差を動的に算出して用いる。
   * @param {Object} item - 差分アイテム
   * @returns {{attributes: Array, sectionSignatures: Object|null, childrenDiffer: boolean}|null}
   */
  buildItemDiffDetails(item) {
    const pair = item.data || {};
    const details = pair.attributeDiffDetails;
    const instanceDiffs = Array.isArray(details?.instance) ? details.instance : [];
    const typeDiff = details?.type || null;

    if (instanceDiffs.length > 0 || typeDiff) {
      return { attributes: instanceDiffs, sectionSignatures: typeDiff, childrenDiffer: false };
    }

    const elementA = pair.dataA?.rawElement;
    const elementB = pair.dataB?.rawElement;
    if (elementA?.attributes && elementB?.attributes) {
      const definitionDiff = diffDefinitionElements(elementA, elementB);
      return {
        attributes: definitionDiff.attributes,
        sectionSignatures: null,
        childrenDiffer: definitionDiff.childrenDiffer,
      };
    }

    return null;
  }

  /**
   * 属性差詳細のHTMLを生成する
   * @param {Object|null} details - buildItemDiffDetails の結果
   * @returns {string} HTML文字列
   */
  renderItemDetailsHTML(details) {
    const hasContent =
      details &&
      (details.attributes.length > 0 || details.sectionSignatures || details.childrenDiffer);
    if (!hasContent) {
      return '<div class="diff-item-details"><div class="detail-empty">属性差の詳細情報はありません</div></div>';
    }

    let html = '<div class="diff-item-details">';

    if (details.attributes.length > 0) {
      html += '<table class="diff-detail-table">';
      html += '<thead><tr><th>属性</th><th>モデルA</th><th>モデルB</th></tr></thead><tbody>';
      for (const diff of details.attributes) {
        html += `<tr>
          <td class="detail-attr">${escapeHtml(diff.attribute)}</td>
          <td class="detail-a">${escapeHtml(this.formatDetailValue(diff.valueA))}</td>
          <td class="detail-b">${escapeHtml(this.formatDetailValue(diff.valueB))}</td>
        </tr>`;
      }
      html += '</tbody></table>';
    }

    if (details.sectionSignatures) {
      const sigA = this.formatDetailValue(details.sectionSignatures.sectionSignatureA);
      const sigB = this.formatDetailValue(details.sectionSignatures.sectionSignatureB);
      // シグネチャは長大なJSONになりうるため、最初の差分位置の近傍のみを表示する
      let diffIndex = 0;
      while (
        diffIndex < sigA.length &&
        diffIndex < sigB.length &&
        sigA[diffIndex] === sigB[diffIndex]
      ) {
        diffIndex++;
      }
      const from = Math.max(0, diffIndex - 60);
      const excerpt = (text) => {
        const slice = text.slice(from, from + 240);
        return `${from > 0 ? '…' : ''}${slice}${from + 240 < text.length ? '…' : ''}`;
      };
      html += `<div class="detail-signature">
        <div class="detail-signature-title">断面構成（タイプ差分・差分近傍を抜粋）</div>
        <div class="detail-signature-row"><span class="detail-a">A:</span> <code>${escapeHtml(excerpt(sigA))}</code></div>
        <div class="detail-signature-row"><span class="detail-b">B:</span> <code>${escapeHtml(excerpt(sigB))}</code></div>
      </div>`;
    }

    if (details.childrenDiffer) {
      html += '<div class="detail-note">子要素（寸法・配筋・鋼材構成など）にも差分があります</div>';
    }

    html += '</div>';
    return html;
  }

  /**
   * 属性値を表示用文字列へ変換する
   * @param {*} value - 属性値
   * @returns {string} 表示文字列
   */
  formatDetailValue(value) {
    if (value === undefined || value === null || value === '') {
      return '（なし）';
    }
    return String(value);
  }

  /**
   * バージョン固有差分アイテムのHTMLを生成
   * @param {Object} item - バージョン固有差分アイテム
   * @returns {string} HTML文字列
   */
  renderVersionDiffItem(item) {
    const diffCount = item.versionDifferences?.length || 0;
    const diffAttrs = item.versionDifferences?.map((d) => d.attribute).join(', ') || '';
    const tooltip = diffAttrs ? `バージョン固有: ${diffAttrs}` : 'バージョン固有の差異';

    return `
      <div class="diff-item item-versionOnly"
           data-element-type="${escapeHtml(item.elementType)}"
           data-element-id="${escapeHtml(item.id)}"
           data-category="versionOnly"
           title="${escapeHtml(tooltip)}">
        <span class="diff-icon">⚪</span>
        <span class="item-category version-badge">Ver</span>
        <span class="item-id">${escapeHtml(item.id)}</span>
        <span class="version-diff-count">${escapeHtml(diffCount)}件</span>
        <span class="item-action" title="3Dビューで表示">👁</span>
      </div>
    `;
  }

  /**
   * サマリーを更新
   * @param {Array} filteredData - フィルタ済みデータ
   */
  updateSummary(filteredData) {
    const onlyACount =
      this.currentFilter.category === 'onlyB'
        ? 0
        : filteredData.filter((i) => i.category === 'onlyA').length;
    const onlyBCount =
      this.currentFilter.category === 'onlyA'
        ? 0
        : filteredData.filter((i) => i.category === 'onlyB').length;
    const attributeMismatchCount = filteredData.filter(
      (i) => i.category === 'attributeMismatch',
    ).length;
    const versionOnlyCount = filteredData.filter((i) => i.category === 'versionOnly').length;

    document.getElementById('diff-count-onlyA').textContent = onlyACount;
    document.getElementById('diff-count-onlyB').textContent = onlyBCount;
    const attributeCountEl = document.getElementById('diff-count-attributeMismatch');
    if (attributeCountEl) {
      attributeCountEl.textContent = attributeMismatchCount;
    }
    document.getElementById('diff-count-total').textContent = filteredData.length;

    // バージョン固有差分カウントの要素があれば更新
    const versionCountEl = document.getElementById('diff-count-version');
    if (versionCountEl) {
      versionCountEl.textContent = versionOnlyCount;
    }

    // バージョン固有差分サマリーの表示/非表示
    const versionSummaryItem = document.querySelector('.summary-item.versionOnly');
    if (versionSummaryItem) {
      versionSummaryItem.style.display = this.versionInfo.isCrossVersion ? 'inline-flex' : 'none';
    }
  }

  /**
   * アイテムのクリックハンドラを設定（イベントデリゲーション使用）
   * @param {HTMLElement} container - コンテナ要素
   */
  setupItemClickHandlers(container) {
    // 既存のデリゲーションハンドラを削除
    if (this._containerClickHandler) {
      container.removeEventListener('click', this._containerClickHandler);
    }

    // イベントデリゲーション: コンテナに1つのリスナーのみ設定
    this._containerClickHandler = (event) => {
      const item = event.target.closest('.diff-item');
      if (!item) return;

      const elementType = item.dataset.elementType;
      const elementId = item.dataset.elementId;
      const category = item.dataset.category;
      const isRenderable = item.dataset.renderable !== 'false';

      // 生XMLアクション（非描画要素）クリック時は生XMLビューアで確認する
      if (event.target.closest('.item-raw-xml')) {
        showRawXmlForElement({ elementType, id: elementId, category });
        return;
      }

      // 展開トグルクリック時は3Dフォーカスせず属性差詳細を開閉する
      if (event.target.closest('.item-detail-toggle')) {
        this.toggleItemDetails(item);
        return;
      }

      if (elementType && elementId && isRenderable) {
        this.focusOnElement(elementType, elementId, category);
      } else if (elementType && elementId && category === 'attributeMismatch') {
        // 非描画（STB定義等）の属性不一致は行クリックでも詳細を開閉する
        this.toggleItemDetails(item);
      } else if (elementType && elementId) {
        // 非描画のA/Bのみ差分は行クリックでも生XMLで確認できるようにする
        showRawXmlForElement({ elementType, id: elementId, category });
      }
    };

    container.addEventListener('click', this._containerClickHandler);
  }

  /**
   * 3Dビューで要素にフォーカス
   * @param {string} elementType - 要素タイプ
   * @param {string} elementId - 要素ID
   * @param {string} category - カテゴリ ('onlyA' or 'onlyB')
   */
  focusOnElement(elementType, elementId, category) {
    const modelSource = this.getModelSourceForCategory(category);

    // 要素グループから該当要素を検索（バッチ描画: 節点/線要素にも対応）
    const group = sceneController.getElementGroups()[elementType];
    const hit = findElementInGroup(group, elementType, elementId, modelSource);

    if (!hit) {
      log.warn(`[UI] DiffList: 要素が見つかりません (type=${elementType}, id=${elementId})`);
      // 要素が見つからない場合のフィードバック
      this.showNotFoundMessage(elementType, elementId);
      return;
    }

    // 通常オブジェクト=ハイライト+回転中心 / バッチ要素=位置フォーカス+マーカー
    // を selectElement3D が hit の種別に応じて処理する。
    selectElement3D(hit.object, scheduleRender, { batchHit: hit });

    log.info(`[Event] 要素フォーカス: ${elementType} ${elementId} (${category})`);
  }

  /**
   * 差分カテゴリから3D側のモデルソースを取得
   * @param {string} category
   * @returns {'A'|'B'|'matched'}
   */
  getModelSourceForCategory(category) {
    if (category === 'onlyA') return 'A';
    if (category === 'onlyB') return 'B';
    return 'matched';
  }

  /**
   * 要素が見つからない場合のメッセージを表示
   * @param {string} elementType - 要素タイプ
   * @param {string} elementId - 要素ID
   */
  showNotFoundMessage(elementType, elementId) {
    this.showToast(`要素が見つかりません: ${elementType} ${elementId}`);
  }

  /**
   * 一時的なトースト通知を表示
   * @param {string} message
   */
  showToast(message) {
    // 既存のトーストを削除
    const existingToast = document.querySelector('.diff-list-toast');
    if (existingToast) {
      existingToast.remove();
    }

    // 新しいトーストを作成
    const toast = document.createElement('div');
    toast.className = 'diff-list-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    // 自動削除
    setTimeout(() => {
      toast.remove();
    }, UI_TIMING.TOAST_DURATION_MS);
  }

  /**
   * リストを更新
   */
  refreshList() {
    const comparisonResults = getState('comparisonResults');
    if (comparisonResults) {
      this.updateDiffList(comparisonResults);
      this.renderList();
    }
  }

  /**
   * パネルを表示
   */
  show() {
    floatingWindowManager.showWindow('diff-list-panel');
  }

  /**
   * パネルを非表示
   */
  hide() {
    floatingWindowManager.hideWindow('diff-list-panel');
  }

  /**
   * パネルの表示切り替え
   */
  toggle() {
    floatingWindowManager.toggleWindow('diff-list-panel');
  }

  /**
   * 差分データを取得
   * @returns {Object} 差分データ
   */
  getDiffData() {
    return this.diffData;
  }
}

// シングルトンインスタンス
let diffListPanelInstance = null;

/**
 * DiffListPanelのシングルトンインスタンスを取得
 * @returns {DiffListPanel} インスタンス
 */
function getDiffListPanel() {
  if (!diffListPanelInstance) {
    diffListPanelInstance = new DiffListPanel();
  }
  return diffListPanelInstance;
}

/**
 * 差分一覧パネルを初期化
 * @param {HTMLElement} containerElement - パネルを配置するコンテナ
 * @returns {DiffListPanel} 初期化済みのインスタンス
 */
export function initializeDiffListPanel(containerElement = document.body) {
  const panel = getDiffListPanel();
  panel.initialize(containerElement);
  return panel;
}

export default DiffListPanel;

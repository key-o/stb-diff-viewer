/**
 * @fileoverview 差分一覧表示機能
 *
 * このファイルは、モデル比較結果の差分を一覧表示し、
 * クリックで3Dビューの該当要素にジャンプする機能を提供します:
 * - 差分カテゴリ（モデルA専用、モデルB専用）別の表示
 * - 要素タイプでのフィルタリング
 * - 3Dビューとの連携（ハイライト・フォーカス）
 * - 統計情報との連携
 */

import { getState, setState, addStateListener } from '../../app/globalState.js';
import { floatingWindowManager } from './floatingWindowManager.js';
import { sceneController } from '../../app/controllers/sceneController.js';
import { selectElement3D } from '../../app/interaction.js';
import * as THREE from 'three';
import { UI_TIMING } from '../../config/uiTimingConfig.js';
import { eventBus, ComparisonEvents } from '../../app/events/index.js';
import { VersionEvents } from '../../app/events/eventTypes.js';
import { ELEMENT_LABELS } from '../../config/elementLabels.js';
import { shouldShowVersionSpecificDifferences, getCurrentVersionInfo } from './versionPanel.js';
import { scheduleRender } from '../../utils/renderScheduler.js';

/**
 * 差分一覧表示クラス
 */
export class DiffListPanel {
  constructor() {
    this.isVisible = false;
    this.containerElement = null;
    this.diffData = {
      onlyA: [],
      onlyB: [],
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
    eventBus.on(ComparisonEvents.UPDATE_STATISTICS, (data) => {
      if (data && data.comparisonResults) {
        this.updateDiffList(data.comparisonResults);
      }
    });

    // globalStateの変更を監視
    addStateListener('comparisonResults', (newValue) => {
      if (newValue) {
        this.updateDiffList(newValue);
      }
    });

    // バージョンフィルタ変更時
    eventBus.on(VersionEvents.FILTER_CHANGED, (data) => {
      this.currentFilter.showVersionDifferences = data.showVersionSpecificDifferences;
      if (this.isVisible) {
        this.renderList();
      }
    });

    // バージョン情報更新時
    eventBus.on(VersionEvents.INFO_UPDATED, (data) => {
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

    console.log('[Event] DiffListPanel初期化完了');
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
                <option value="onlyA">モデルA専用</option>
                <option value="onlyB">モデルB専用</option>
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
              🔵 A専用: <strong id="diff-count-onlyA">0</strong>
            </span>
            <span class="summary-item onlyB">
              <span class="color-indicator"></span>
              ⚫ B専用: <strong id="diff-count-onlyB">0</strong>
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
            <span class="legend-item">⚫ 削除(B)</span>
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
      data = [...this.diffData.onlyA, ...this.diffData.onlyB];
      // バージョン固有差分を含める（フィルタ設定に応じて）
      if (this.currentFilter.showVersionDifferences && this.versionInfo.isCrossVersion) {
        data = [...data, ...this.diffData.versionDifferences];
      }
    } else if (this.currentFilter.category === 'onlyA') {
      data = [...this.diffData.onlyA];
    } else if (this.currentFilter.category === 'onlyB') {
      data = [...this.diffData.onlyB];
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
    const displayName = this.getElementTypeDisplayName(elementType);
    const onlyACount = items.filter((i) => i.category === 'onlyA').length;
    const onlyBCount = items.filter((i) => i.category === 'onlyB').length;
    const versionOnlyCount = items.filter((i) => i.category === 'versionOnly').length;

    let html = `
      <div class="diff-group">
        <div class="diff-group-header">
          <span class="group-name">${displayName}</span>
          <span class="group-counts">
            ${onlyACount > 0 ? `<span class="count-a">🔵 ${onlyACount}</span>` : ''}
            ${onlyBCount > 0 ? `<span class="count-b">⚫ ${onlyBCount}</span>` : ''}
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

    const categoryClass = item.category === 'onlyA' ? 'item-onlyA' : 'item-onlyB';
    const categoryLabel = item.category === 'onlyA' ? 'A' : 'B';
    const icon = item.category === 'onlyA' ? '🔵' : '⚫';

    return `
      <div class="diff-item ${categoryClass}"
           data-element-type="${item.elementType}"
           data-element-id="${item.id}"
           data-category="${item.category}">
        <span class="diff-icon">${icon}</span>
        <span class="item-category">${categoryLabel}</span>
        <span class="item-id">${item.id}</span>
        <span class="item-action" title="3Dビューで表示">👁</span>
      </div>
    `;
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
           data-element-type="${item.elementType}"
           data-element-id="${item.id}"
           data-category="versionOnly"
           title="${tooltip}">
        <span class="diff-icon">⚪</span>
        <span class="item-category version-badge">Ver</span>
        <span class="item-id">${item.id}</span>
        <span class="version-diff-count">${diffCount}件</span>
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
    const versionOnlyCount = filteredData.filter((i) => i.category === 'versionOnly').length;

    document.getElementById('diff-count-onlyA').textContent = onlyACount;
    document.getElementById('diff-count-onlyB').textContent = onlyBCount;
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

      if (elementType && elementId) {
        this.focusOnElement(elementType, elementId, category);
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
    const modelSource = category === 'onlyA' ? 'A' : 'B';

    // 要素グループから該当オブジェクトを検索
    const targetObject = this.findElement3D(elementType, elementId, modelSource);

    if (targetObject) {
      // 要素を選択してハイライト
      selectElement3D(targetObject, scheduleRender);

      // カメラを要素の中心にフォーカス
      this.focusCameraOnObject(targetObject);

      console.log(`[Event] 要素フォーカス: ${elementType} ${elementId} (${category})`);
    } else {
      console.warn(`[UI] DiffList: 要素が見つかりません (type=${elementType}, id=${elementId})`);
      // 要素が見つからない場合のフィードバック
      this.showNotFoundMessage(elementType, elementId);
    }
  }

  /**
   * 3Dシーンから要素を検索
   * @param {string} elementType - 要素タイプ
   * @param {string} elementId - 要素ID
   * @param {string} modelSource - モデルソース ('A' or 'B')
   * @returns {THREE.Object3D|null} 見つかったオブジェクト
   */
  findElement3D(elementType, elementId, modelSource) {
    // 要素グループを取得
    const group = sceneController.getElementGroups()[elementType];
    if (!group) {
      console.warn(`[UI] DiffList: 要素グループが見つかりません (type=${elementType})`);
      return null;
    }

    // グループ内のオブジェクトを検索
    let foundObject = null;

    group.traverse((child) => {
      if (foundObject) return; // 既に見つかった場合はスキップ

      const userData = child.userData;
      if (!userData) return;

      // elementIdで一致を確認
      const childId = userData.elementId;
      const childModelSource = userData.modelSource;

      // IDとモデルソースが一致する場合
      if (childId === elementId && childModelSource === modelSource) {
        foundObject = child;
      }
    });

    return foundObject;
  }

  /**
   * カメラを対象オブジェクトにフォーカス
   * @param {THREE.Object3D} object - 対象オブジェクト
   */
  focusCameraOnObject(object) {
    if (!object || !sceneController.getCameraControls()) return;

    try {
      // オブジェクトのバウンディングボックスを計算
      const box = new THREE.Box3().setFromObject(object);
      const center = new THREE.Vector3();
      box.getCenter(center);

      // CameraControlsのsetOrbitPointを使用
      if (typeof sceneController.getCameraControls().setOrbitPoint === 'function') {
        sceneController.getCameraControls().stop?.();
        sceneController.getCameraControls().setOrbitPoint(center.x, center.y, center.z);
      } else if (sceneController.getCameraControls().target) {
        sceneController.getCameraControls().target.copy(center);
      }

      // 再描画
      scheduleRender();
    } catch (e) {
      console.warn('[UI] DiffList: カメラフォーカス失敗', e);
    }
  }

  /**
   * 要素が見つからない場合のメッセージを表示
   * @param {string} elementType - 要素タイプ
   * @param {string} elementId - 要素ID
   */
  showNotFoundMessage(elementType, elementId) {
    // 一時的なトースト通知を表示
    const message = `要素が見つかりません: ${elementType} ${elementId}`;

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
export function getDiffListPanel() {
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

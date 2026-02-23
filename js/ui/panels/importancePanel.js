/**
 * @fileoverview 重要度設定UIパネル
 *
 * ST-Bridge要素の重要度設定を管理するUIコンポーネント。
 * タブ別の要素表示、重要度レベル変更、CSV入出力機能を提供します。
 */

import { getImportanceManager, STB_ELEMENT_TABS } from '../../app/importanceManager.js';
import { IMPORTANCE_LEVELS } from '../../constants/importanceLevels.js';
import { IMPORTANCE_COLORS } from '../../config/colorConfig.js';
import { getState, setState } from '../../app/globalState.js';
import { comparisonController } from '../../app/controllers/comparisonController.js';
import { floatingWindowManager } from './floatingWindowManager.js';
import {
  eventBus,
  ImportanceEvents,
  ComparisonEvents,
  RenderEvents,
} from '../../app/events/index.js';
import { showSuccess, showError, showWarning } from '../common/toast.js';
import { createLogger } from '../../utils/logger.js';
import { downloadBlob } from '../../utils/downloadHelper.js';

const log = createLogger('importancePanel');

/**
 * XSDスキーマに基づくカテゴリ階層定義
 * STB要素の親子関係をサイドバーで表現するための構造
 */
const CATEGORY_HIERARCHY = [
  { type: 'item', id: 'StbCommon' },
  {
    type: 'group',
    label: 'StbAxes',
    children: [
      { type: 'item', id: 'StbParallelAxes' },
      { type: 'item', id: 'StbArcAxes' },
      { type: 'item', id: 'StbRadialAxes' },
      {
        type: 'group',
        label: 'StbDrawingAxes',
        children: [
          { type: 'item', id: 'StbDrawingLineAxis' },
          { type: 'item', id: 'StbDrawingArcAxis' },
        ],
      },
    ],
  },
  { type: 'group', label: 'StbNodes', items: ['StbNodes'] },
  { type: 'group', label: 'StbStories', items: ['StbStories'] },
  {
    type: 'group',
    label: 'StbMembers',
    children: [
      { type: 'item', id: 'StbColumns' },
      { type: 'item', id: 'StbPosts' },
      { type: 'item', id: 'StbGirders' },
      { type: 'item', id: 'StbBeams' },
      { type: 'item', id: 'StbBraces' },
      { type: 'item', id: 'StbSlabs' },
      { type: 'item', id: 'StbWalls' },
      { type: 'item', id: 'StbFootings' },
      { type: 'item', id: 'StbStripFootings' },
      { type: 'item', id: 'StbPiles' },
      { type: 'item', id: 'StbFoundationColumns' },
      { type: 'item', id: 'StbParapets' },
      { type: 'item', id: 'StbOpens' },
    ],
  },
  {
    type: 'group',
    label: 'StbSections',
    children: [
      { type: 'item', id: 'StbSecColumn_RC' },
      { type: 'item', id: 'StbSecColumn_S' },
      { type: 'item', id: 'StbSecColumn_SRC' },
      { type: 'item', id: 'StbSecColumn_CFT' },
      { type: 'item', id: 'StbSecBeam_RC' },
      { type: 'item', id: 'StbSecBeam_S' },
      { type: 'item', id: 'StbSecBeam_SRC' },
      { type: 'item', id: 'StbSecBrace_S' },
      { type: 'item', id: 'StbSecSlab_RC' },
      { type: 'item', id: 'StbSecSlabDeck' },
      { type: 'item', id: 'StbSecSlabPrecast' },
      { type: 'item', id: 'StbSecWall_RC' },
      { type: 'item', id: 'StbSecFoundation_RC' },
      { type: 'item', id: 'StbSecPile_RC' },
      { type: 'item', id: 'StbSecPile_S' },
      { type: 'item', id: 'StbSecPileProduct' },
      { type: 'item', id: 'StbSecParapet_RC' },
    ],
  },
  { type: 'group', label: 'StbJoints', items: ['StbJoints'] },
];

/**
 * 重要度設定パネルクラス
 */
class ImportancePanel {
  constructor() {
    this.manager = getImportanceManager();
    this.currentTab = 'StbCommon';
    this.filterText = '';
    this.filterImportance = 'all';
    this.categoryFilterText = '';
    this.parameterSortKey = 'paramName';
    this.parameterSortDirection = 'asc';
    this.isVisible = false;
    this.elementContainer = null;
    this.statisticsContainer = null;
    this.treeNodeCounter = 0;

    this.setupEventListeners();
  }

  /**
   * イベントリスナーを設定する
   */
  setupEventListeners() {
    // 重要度設定変更イベント（EventBus経由）
    eventBus.on(ImportanceEvents.SETTINGS_CHANGED, (data) => {
      this.refreshCurrentTab();

      // 自動再描画を実行
      this.triggerAutoRedraw(data);
    });
  }

  /**
   * 重要度変更時の自動再描画を実行する
   * @param {Object} changeDetails - 変更の詳細情報
   */
  async triggerAutoRedraw(changeDetails = {}) {
    try {
      log.info('Starting auto-redraw after importance change:', changeDetails);

      // 比較結果の重要度情報を更新
      await this.updateVisualizationWithImportance();

      // 3D表示を再描画
      this.rerenderElements();

      // 統計情報を更新
      this.updateComparisonStatistics();

      log.info('Auto-redraw completed successfully');

      // 成功の通知イベントを発行（EventBus経由）
      eventBus.emit(ImportanceEvents.AUTO_REDRAW_COMPLETED, {
        success: true,
        changeDetails,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Auto-redraw failed:', error);

      // エラーの通知イベントを発行（EventBus経由）
      eventBus.emit(ImportanceEvents.AUTO_REDRAW_ERROR, {
        error: error.message,
        changeDetails,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * 重要度設定で比較結果の視覚化を更新する
   */
  async updateVisualizationWithImportance() {
    const currentResults = getState('comparisonResults');
    if (!currentResults) {
      log.info('No comparison results available for importance update');
      return;
    }

    log.info('Updating visualization with importance settings...');

    // 各要素タイプの比較結果を重要度で更新
    for (const [elementType, result] of currentResults.entries()) {
      try {
        const updatedResult = comparisonController.updateImportance(result, elementType);
        currentResults.set(elementType, updatedResult);
        log.info(`Updated importance for ${elementType}:`, {
          matched: updatedResult.matched.length,
          onlyA: updatedResult.onlyA.length,
          onlyB: updatedResult.onlyB.length,
        });
      } catch (error) {
        log.error(`Failed to update importance for ${elementType}:`, error);
      }
    }

    // 更新された結果をグローバル状態に保存
    setState('comparisonResults', currentResults);

    log.info('Visualization importance update completed');
  }

  /**
   * 3D要素の再描画を実行する
   */
  rerenderElements() {
    try {
      log.info('Rerendering 3D elements...');

      // 3Dビューアーの再描画を要求
      const viewer = getState('viewer');
      if (viewer && typeof viewer.requestRender === 'function') {
        viewer.requestRender();
      }

      // カスタム再描画イベントを発行（EventBus経由）
      eventBus.emit(RenderEvents.REQUEST_ELEMENT_RERENDER, {
        reason: 'importanceChange',
        timestamp: new Date().toISOString(),
      });

      log.info('Element rerender request completed');
    } catch (error) {
      log.error('Failed to rerender elements:', error);
      throw error;
    }
  }

  /**
   * 比較統計情報を更新する
   */
  updateComparisonStatistics() {
    try {
      log.info('Updating comparison statistics...');

      const currentResults = getState('comparisonResults');
      if (!currentResults) {
        return;
      }

      // 統計更新イベントを発行（EventBus経由）
      eventBus.emit(ComparisonEvents.UPDATE_STATISTICS, {
        comparisonResults: currentResults,
        reason: 'importanceChange',
        timestamp: new Date().toISOString(),
      });

      log.info('Comparison statistics update completed');
    } catch (error) {
      log.error('Failed to update comparison statistics:', error);
    }
  }

  /**
   * パネルを初期化する
   * @param {HTMLElement} containerElement - パネルを配置するコンテナー要素
   */
  initialize(containerElement) {
    this.containerElement = containerElement;
    this.createPanelHTML();

    // 要素参照の更新
    this.elementContainer = document.getElementById('importance-elements');
    this.statisticsContainer = document.getElementById('importance-statistics');
    this.categoryListContainer = document.getElementById('importance-category-list');

    this.bindEvents();

    // Windowマネージャに登録
    this.registerWithWindowManager();

    // 初期描画
    this.refreshCurrentTab();

    log.info('ImportancePanel initialized');
  }

  /**
   * Windowマネージャに登録
   */
  registerWithWindowManager() {
    floatingWindowManager.registerWindow({
      windowId: 'importance-panel',
      toggleButtonId: 'toggle-importance-panel-btn',
      closeButtonId: 'importance-panel-close',
      headerId: 'importance-panel-header',
      draggable: true,
      resizable: true,
      autoShow: false,
      onShow: () => {
        this.isVisible = true;
        this.refreshCurrentTab();
        setState('ui.importancePanelVisible', true);
      },
      onHide: () => {
        this.isVisible = false;
        setState('ui.importancePanelVisible', false);
      },
    });
  }

  /**
   * パネルのHTMLを作成する
   */
  createPanelHTML() {
    const panelHTML = `
      <div id="importance-panel" class="floating-window importance-panel">
        <div class="float-window-header" id="importance-panel-header">
          <span class="float-window-title">🏷️ 重要度設定</span>
          <div class="float-window-controls">
            <button class="float-window-btn" id="importance-panel-close">✕</button>
          </div>
        </div>
        
        <div class="importance-panel-body">
          <div class="importance-sidebar">
            <div class="importance-category-search">
              <input type="text" id="importance-category-filter" placeholder="カテゴリ検索...">
            </div>
            <ul id="importance-category-list" class="importance-category-list">
              <!-- カテゴリリストがここに表示される -->
            </ul>
          </div>
          
          <div class="importance-main-content">
            <div class="content-toolbar">
              <div class="mvd-config-section">
                <div id="importance-config-description" class="config-description">
                  S4はS2を包含します。各パラメータで S2 / S4 を個別に設定してください。
                </div>
              </div>

              <div class="importance-column-guide" aria-label="列説明">
                <span><strong>XSD必須</strong>: XSDで必須と定義される項目</span>
                <span><strong>項目名</strong>: 要素名/属性名</span>
                <span><strong>S2</strong>: チェック対象/対象外</span>
                <span><strong>S4</strong>: チェック対象/対象外</span>
              </div>

              <div class="search-box">
                 <input type="text" id="importance-filter-text" placeholder="パラメータ検索...">
              </div>
              
              <select id="importance-filter-level">
                <option value="all">全て</option>
                <option value="${IMPORTANCE_LEVELS.REQUIRED}">対象</option>
                <option value="${IMPORTANCE_LEVELS.NOT_APPLICABLE}">対象外</option>
              </select>

              <div class="dropdown-menu">
                <button class="btn-icon" id="importance-menu-btn">⋮</button>
                <div class="dropdown-content" id="importance-menu-content">
                   <button id="importance-export-csv" class="dropdown-item">CSV出力</button>
                   <button id="importance-import-csv-btn" class="dropdown-item">CSV読込</button>
                   <button id="importance-reset-defaults" class="dropdown-item text-danger">デフォルトに戻す</button>
                   <input type="file" id="importance-import-csv" accept=".csv" style="display: none;" />
                </div>
              </div>
            </div>

            <div id="importance-elements" class="importance-table-container">
              <!-- パラメータテーブルがここに表示される -->
            </div>
            
            <div class="panel-controls importance-bulk-controls">
               <div class="control-group importance-bulk-group">
                  <label>一括変更:</label>
                  <select id="importance-bulk-level" class="importance-bulk-level">
                    <option value="">設定を選択...</option>
                    <option value="${IMPORTANCE_LEVELS.REQUIRED}">対象</option>
                    <option value="${IMPORTANCE_LEVELS.NOT_APPLICABLE}">対象外</option>
                  </select>
                  <button id="importance-bulk-apply" class="btn-small">適用</button>
               </div>
            </div>

            <div id="importance-statistics" class="statistics-bar">
              <!-- 簡易統計 -->
            </div>
          </div>
        </div>
      </div>
    `;

    this.containerElement.insertAdjacentHTML('beforeend', panelHTML);
    this.elementContainer = document.getElementById('importance-elements');
    this.statisticsContainer = document.getElementById('importance-statistics');
  }

  /**
   * イベントを関連付ける
   */
  bindEvents() {
    // パネル閉じるボタン
    document.getElementById('importance-panel-close').addEventListener('click', () => {
      this.hide();
    });

    // パラメータフィルター
    document.getElementById('importance-filter-text').addEventListener('input', (e) => {
      this.filterText = e.target.value;
      this.refreshParameterTable();
    });

    // カテゴリフィルター
    document.getElementById('importance-category-filter')?.addEventListener('input', (e) => {
      this.categoryFilterText = e.target.value || '';
      this.applyCategoryListFilter();
    });

    // ドロップダウンメニュー
    const menuBtn = document.getElementById('importance-menu-btn');
    const menuContent = document.getElementById('importance-menu-content');
    if (menuBtn && menuContent) {
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        menuContent.style.display = menuContent.style.display === 'block' ? 'none' : 'block';
      });
      document.addEventListener('click', () => {
        menuContent.style.display = 'none';
      });
      menuContent.addEventListener('click', (e) => e.stopPropagation());
    }

    document.getElementById('importance-filter-level').addEventListener('change', (e) => {
      this.filterImportance = e.target.value;
      this.refreshParameterTable();
    });

    // 一括適用
    document.getElementById('importance-bulk-apply').addEventListener('click', () => {
      this.applyBulkImportance();
    });

    // CSV機能
    document.getElementById('importance-export-csv').addEventListener('click', () => {
      this.exportToCSV();
      if (menuContent) menuContent.style.display = 'none';
    });

    document.getElementById('importance-import-csv-btn').addEventListener('click', () => {
      document.getElementById('importance-import-csv').click();
      if (menuContent) menuContent.style.display = 'none';
    });

    document.getElementById('importance-import-csv').addEventListener('change', (e) => {
      this.importFromCSV(e.target.files[0]);
    });

    // デフォルトリセット
    document.getElementById('importance-reset-defaults').addEventListener('click', () => {
      this.resetToDefaults();
      if (menuContent) menuContent.style.display = 'none';
    });
  }

  /**
   * パネルを表示する
   */
  show() {
    floatingWindowManager.showWindow('importance-panel');
  }

  /**
   * パネルを非表示にする
   */
  hide() {
    floatingWindowManager.hideWindow('importance-panel');
  }

  /**
   * パネルの表示状態を切り替える
   */
  toggle() {
    floatingWindowManager.toggleWindow('importance-panel');
  }

  /**
   * カテゴリを選択する
   * @param {string} categoryId - カテゴリID（旧 tabId）
   */
  selectCategory(categoryId) {
    this.currentTab = categoryId;

    // カテゴリリストの選択状態を更新
    if (this.categoryListContainer) {
      this.categoryListContainer.querySelectorAll('.category-item').forEach((item) => {
        if (item.dataset.id === categoryId) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
    }

    this.refreshParameterTable();
  }

  /**
   * パラメータテーブルを更新する
   */
  refreshParameterTable() {
    if (!this.elementContainer) return;

    const elementPaths = this.manager.getElementPathsByTab(this.currentTab);
    const filteredPaths = this.filterElementPaths(elementPaths);

    this.renderParameterTable(filteredPaths);
  }

  /**
   * 現在タブの表示を更新する
   */
  refreshCurrentTab() {
    if (!this.currentTab) {
      this.currentTab = 'StbCommon';
    }

    this.renderCategoryList();
    this.refreshParameterTable();
    this.updateStatistics();
  }

  /**
   * 要素パスをフィルタリングする
   * @param {string[]} elementPaths - 要素パスの配列
   * @returns {string[]} フィルタリング済みの要素パス
   */
  filterElementPaths(elementPaths) {
    return elementPaths.filter((path) => {
      // テキストフィルター
      if (this.filterText && !path.toLowerCase().includes(this.filterText.toLowerCase())) {
        return false;
      }

      // 重要度フィルター
      if (this.filterImportance !== 'all') {
        const importance = this.normalizeBinaryLevel(this.manager.getImportanceLevel(path));
        if (importance !== this.filterImportance) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * カテゴリリストを描画する
   */
  renderCategoryList() {
    if (!this.categoryListContainer) return;
    const settings = this.manager.getAllImportanceSettings();

    const html = this.renderHierarchy(CATEGORY_HIERARCHY, settings, 0);

    this.categoryListContainer.innerHTML = html;

    // カテゴリ項目のクリックイベント
    this.categoryListContainer.querySelectorAll('.category-item').forEach((item) => {
      item.addEventListener('click', () => {
        this.selectCategory(item.dataset.id);
      });
    });

    // グループヘッダーの折りたたみイベント
    this.categoryListContainer.querySelectorAll('.category-group-header').forEach((header) => {
      header.addEventListener('click', () => {
        const group = header.closest('.category-group');
        if (group) {
          group.classList.toggle('collapsed');
        }
      });
    });

    this.applyCategoryListFilter();
  }

  /**
   * 階層構造を再帰的にHTMLへ変換する
   * @param {Array} nodes - 階層ノード配列
   * @param {Map} settings - 重要度設定
   * @param {number} depth - 現在の深さ
   * @returns {string} HTML文字列
   */
  renderHierarchy(nodes, settings, depth) {
    return nodes
      .map((node) => {
        if (node.type === 'item') {
          return this.renderCategoryItem(node.id, settings, depth);
        }
        // group type
        const childrenHtml = node.children
          ? this.renderHierarchy(node.children, settings, depth + 1)
          : (node.items || [])
              .map((id) => this.renderCategoryItem(id, settings, depth + 1))
              .join('');

        return `
        <li class="category-group">
          <div class="category-group-header" style="padding-left: ${8 + depth * 12}px">
            <span class="group-toggle-icon"></span>
            <span class="group-label">${node.label}</span>
          </div>
          <ul class="category-group-children">${childrenHtml}</ul>
        </li>`;
      })
      .join('');
  }

  /**
   * 単一カテゴリ項目のHTMLを生成する
   * @param {string} tabId - タブID
   * @param {Map} settings - 重要度設定
   * @param {number} depth - インデント深さ
   * @returns {string} HTML文字列
   */
  renderCategoryItem(tabId, settings, depth) {
    const tab = STB_ELEMENT_TABS.find((t) => t.id === tabId);
    if (!tab) return '';
    const paths = this.manager.getElementPathsByTab(tab.id);
    const count = paths.filter((path) => settings.has(path)).length;
    const isActive = this.currentTab === tab.id;

    return `
      <li class="category-item ${isActive ? 'active' : ''}" data-id="${tab.id}" style="padding-left: ${8 + depth * 12}px">
        <span class="category-name">${tab.name}</span>
        <span class="count-badge">${count}</span>
      </li>`;
  }

  /**
   * カテゴリリストの表示をフィルタリングする
   */
  applyCategoryListFilter() {
    const filterText = (this.categoryFilterText || '').toLowerCase();
    if (!this.categoryListContainer) return;

    this.categoryListContainer.querySelectorAll('.category-group').forEach((group) => {
      const items = group.querySelectorAll('.category-item');
      let anyVisible = false;
      items.forEach((item) => {
        const name = (item.querySelector('.category-name')?.textContent || '').toLowerCase();
        const visible = name.includes(filterText);
        item.style.display = visible ? 'flex' : 'none';
        if (visible) anyVisible = true;
      });
      group.style.display = anyVisible ? '' : 'none';
      // フィルタ時はグループを自動展開
      if (filterText && anyVisible) {
        group.classList.remove('collapsed');
      }
    });

    // トップレベルの直接 category-item（グループ外）
    this.categoryListContainer.querySelectorAll(':scope > .category-item').forEach((item) => {
      const name = (item.querySelector('.category-name')?.textContent || '').toLowerCase();
      item.style.display = name.includes(filterText) ? 'flex' : 'none';
    });
  }

  /**
   * XPathを表示用のセグメント配列に分解する
   * @param {string} path - XPath
   * @returns {string[]} セグメント配列
   */
  parsePathSegments(path, tabId = this.currentTab) {
    if (!path || typeof path !== 'string') {
      return [];
    }

    const segments = path.split('/').filter(Boolean);
    if (segments[0] === 'ST_BRIDGE') {
      segments.shift();
    }

    if (!tabId || segments.length === 0) {
      return segments;
    }

    const tab = STB_ELEMENT_TABS.find((item) => item.id === tabId);
    const xsdElemLower = tab?.xsdElem?.toLowerCase();
    if (xsdElemLower) {
      const xsdIndex = segments.findIndex((segment) => segment.toLowerCase() === xsdElemLower);
      if (xsdIndex > 0) {
        return segments.slice(xsdIndex);
      }
    }

    const candidates = this.manager.buildTabPathCandidates(tabId);
    const tabIndex = segments.findIndex((segment) => {
      const lower = segment.toLowerCase();
      if (candidates.has(lower)) return true;
      for (const candidate of candidates) {
        if (lower.startsWith(`${candidate}_`)) return true;
      }
      return false;
    });

    return tabIndex > 0 ? segments.slice(tabIndex) : segments;
  }

  /**
   * パス一覧から階層ツリーを構築する
   * @param {string[]} elementPaths - 表示対象パス
   * @returns {Object} ツリー構造
   */
  buildParameterTree(elementPaths) {
    const root = {
      name: 'ROOT',
      children: new Map(),
      terminalPaths: [],
    };

    elementPaths.forEach((path) => {
      const segments = this.parsePathSegments(path, this.currentTab);
      if (segments.length === 0) return;

      let node = root;
      segments.forEach((segment) => {
        if (!node.children.has(segment)) {
          node.children.set(segment, {
            name: segment,
            children: new Map(),
            terminalPaths: [],
          });
        }
        node = node.children.get(segment);
      });
      // 重複チェックを追加
      if (!node.terminalPaths.includes(path)) {
        node.terminalPaths.push(path);
      }
    });

    return root;
  }

  /**
   * ノード配下のパス数を取得する
   * @param {Object} node - ツリーノード
   * @returns {number} パス数
   */
  countTreePaths(node) {
    let count = node.terminalPaths.length;
    node.children.forEach((childNode) => {
      count += this.countTreePaths(childNode);
    });
    return count;
  }

  /**
   * ノード直下で編集可能なパス（属性のみ）を取得する
   * @param {Object} node - ツリーノード
   * @returns {string[]} 直下のパス配列
   */
  collectDirectPaths(node) {
    const directPaths = [];

    // 属性のみを収集（要素自体は含めない）
    node.children.forEach((childNode, childName) => {
      if (childName.startsWith('@')) {
        directPaths.push(...childNode.terminalPaths);
      }
    });

    // 重複を除去して返す
    return [...new Set(directPaths)];
  }

  /**
   * 要素子ノードをソートして取得する
   * @param {Object} node - ツリーノード
   * @returns {Object[]} 子ノード配列
   */
  getSortedElementChildren(node) {
    return [...node.children.values()]
      .filter((childNode) => !childNode.name.startsWith('@'))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * パスがXSD必須かどうかを取得
   * @param {string} path
   * @returns {boolean}
   */
  isXsdRequired(path) {
    const requirement = this.manager.getSchemaRequirement(path);
    return requirement?.required === true;
  }

  /**
   * パラメータパス一覧を現在のソート設定で並べ替える
   * @param {string[]} paths
   * @returns {string[]}
   */
  sortParameterPaths(paths) {
    if (!this.parameterSortKey) {
      return [...paths];
    }

    const compareByName = (left, right) =>
      left.localeCompare(right, 'ja', { numeric: true, sensitivity: 'base' });
    const order = new Map(paths.map((path, index) => [path, index]));

    const sorted = [...paths].sort((a, b) => {
      let compareResult = 0;

      if (this.parameterSortKey === 'xsdRequired') {
        const aRank = this.isXsdRequired(a) ? 1 : 0;
        const bRank = this.isXsdRequired(b) ? 1 : 0;
        compareResult = aRank - bRank;
        if (compareResult === 0) {
          compareResult = compareByName(this.extractParameterName(a), this.extractParameterName(b));
        }
      } else if (this.parameterSortKey === 'paramName') {
        compareResult = compareByName(this.extractParameterName(a), this.extractParameterName(b));
      }

      if (this.parameterSortDirection === 'desc') {
        compareResult *= -1;
      }

      if (compareResult !== 0) {
        return compareResult;
      }

      return (order.get(a) || 0) - (order.get(b) || 0);
    });

    return sorted;
  }

  /**
   * ソートキーを切り替える
   * @param {'xsdRequired'|'paramName'} sortKey
   */
  updateSort(sortKey) {
    if (!sortKey) return;

    if (this.parameterSortKey === sortKey) {
      this.parameterSortDirection = this.parameterSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.parameterSortKey = sortKey;
      this.parameterSortDirection = sortKey === 'xsdRequired' ? 'desc' : 'asc';
    }

    this.refreshParameterTable();
  }

  /**
   * ソートヘッダーのHTMLを生成
   * @param {string} label
   * @param {'xsdRequired'|'paramName'} sortKey
   * @param {string} [extraClass]
   * @returns {string}
   */
  renderSortableHeader(label, sortKey, extraClass = '') {
    const isActive = this.parameterSortKey === sortKey;
    const direction = isActive ? this.parameterSortDirection : null;
    const indicator = direction === 'asc' ? '↑' : direction === 'desc' ? '↓' : '↕';
    const classes = ['sortable-header', extraClass, isActive ? 'active' : '']
      .filter(Boolean)
      .join(' ');

    return `
      <th class="${classes}" data-sort-key="${sortKey}">
        <span class="sortable-label">${label}<span class="sort-indicator">${indicator}</span></span>
      </th>
    `;
  }

  /**
   * 4値の重要度を2値（対象/対象外）へ正規化
   * @param {string} level
   * @returns {string}
   */
  normalizeBinaryLevel(level) {
    return level === IMPORTANCE_LEVELS.NOT_APPLICABLE
      ? IMPORTANCE_LEVELS.NOT_APPLICABLE
      : IMPORTANCE_LEVELS.REQUIRED;
  }

  /**
   * 2値表示ラベルを取得
   * @param {string} level
   * @returns {string}
   */
  getBinaryLabel(level) {
    return this.normalizeBinaryLevel(level) === IMPORTANCE_LEVELS.NOT_APPLICABLE
      ? '対象外'
      : '対象';
  }

  /**
   * XSD必須表示セルを生成
   * @param {string} path
   * @returns {string}
   */
  renderXsdRequiredCell(path) {
    const isRequired = this.isXsdRequired(path);
    const label = isRequired ? '必須' : '-';
    const badgeClass = isRequired ? 'xsd-required-badge required' : 'xsd-required-badge optional';
    const title = isRequired ? 'XSD必須項目' : 'XSD任意項目';
    return `<span class="${badgeClass}" title="${title}">${label}</span>`;
  }

  /**
   * パス行HTMLを描画する
   * @param {string[]} paths - パス配列
   * @returns {string} rows HTML
   */
  renderParameterRows(paths) {
    return paths
      .map((path) => {
        const s2ImportanceRaw = this.manager.getMvdImportanceLevel(path, 's2');
        const s4ImportanceRaw = this.manager.getMvdImportanceLevel(path, 's4');
        const s2Importance = this.normalizeBinaryLevel(s2ImportanceRaw);
        const s4Importance = this.normalizeBinaryLevel(s4ImportanceRaw);
        const paramName = this.extractParameterName(path);
        const rowTypeClass = 'attribute-row';
        const selectableLevels = [IMPORTANCE_LEVELS.REQUIRED, IMPORTANCE_LEVELS.NOT_APPLICABLE];

        return `
          <tr class="importance-path-row ${rowTypeClass}" data-path="${path}">
            <td class="xsd-required-col">${this.renderXsdRequiredCell(path)}</td>
            <td class="param-name-col" title="${path}">
              <span class="param-name">${paramName}</span>
            </td>
            <td class="mvd-col">
              <div class="importance-select-wrapper">
                <span class="status-dot status-dot-s2" style="background-color: ${IMPORTANCE_COLORS[s2Importance]};" title="${this.getBinaryLabel(s2Importance)}"></span>
                <select class="importance-select importance-select-s2" data-path="${path}" data-mvd="s2">
                  ${selectableLevels
                    .map(
                      (value) => `
                        <option value="${value}" ${value === s2Importance ? 'selected' : ''}>
                          ${this.getBinaryLabel(value)}
                        </option>
                      `,
                    )
                    .join('')}
                </select>
              </div>
            </td>
            <td class="mvd-col">
              <div class="importance-select-wrapper">
                <span class="status-dot status-dot-s4" style="background-color: ${IMPORTANCE_COLORS[s4Importance]};" title="${this.getBinaryLabel(s4Importance)}"></span>
                <select class="importance-select importance-select-s4" data-path="${path}" data-mvd="s4">
                  ${selectableLevels
                    .map(
                      (value) => `
                        <option value="${value}" ${value === s4Importance ? 'selected' : ''}>
                          ${this.getBinaryLabel(value)}
                        </option>
                      `,
                    )
                    .join('')}
                </select>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  /**
   * パス一覧テーブルを描画する
   * @param {string[]} paths - パス配列
   * @param {boolean} compact - コンパクト表示
   * @returns {string} table HTML
   */
  renderPathsTable(paths, compact = false) {
    if (!paths.length) {
      return '';
    }

    const sortedPaths = this.sortParameterPaths(paths);
    const rowsHTML = this.renderParameterRows(sortedPaths);
    if (compact) {
      return `
        <table class="importance-table importance-table-compact">
          <thead>
            <tr>
              ${this.renderSortableHeader('XSD必須', 'xsdRequired', 'xsd-required-col')}
              ${this.renderSortableHeader('項目名', 'paramName', 'param-name-col')}
              <th class="mvd-col">S2</th>
              <th class="mvd-col">S4</th>
            </tr>
          </thead>
          <tbody>${rowsHTML}</tbody>
        </table>
      `;
    }

    return `
      <table class="importance-table">
        <thead>
          <tr>
            ${this.renderSortableHeader('XSD必須', 'xsdRequired', 'xsd-required-col')}
            ${this.renderSortableHeader('項目名', 'paramName', 'param-name-col')}
            <th class="mvd-col">S2</th>
            <th class="mvd-col">S4</th>
          </tr>
        </thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    `;
  }

  /**
   * ツリーノードを折りたたみ形式で描画する
   * @param {Object} node - ツリーノード
   * @param {number} depth - 階層深さ
   * @returns {string} node HTML
   */
  renderTreeNode(node, depth = 0) {
    const directPaths = this.collectDirectPaths(node);
    const childNodes = this.getSortedElementChildren(node);
    const pathCount = this.countTreePaths(node);
    const nodeId = `importance-node-${++this.treeNodeCounter}`;
    const isExpanded = depth === 0;
    const indent = Math.min(depth, 6) * 16;

    return `
      <div class="importance-tree-node depth-${Math.min(depth, 6)}">
        <div class="importance-tree-summary" style="padding-left:${10 + indent}px;">
          <span class="toggle-btn importance-toggle-btn" data-target-id="${nodeId}">${isExpanded ? '-' : '+'}</span>
          <span class="tree-node-name">${node.name}</span>
          <span class="tree-node-count">${pathCount}</span>
        </div>
        <div class="importance-tree-content" data-tree-id="${nodeId}" style="display:${isExpanded ? 'block' : 'none'};">
          ${directPaths.length ? this.renderPathsTable(directPaths, true) : ''}
          ${childNodes.map((childNode) => this.renderTreeNode(childNode, depth + 1)).join('')}
        </div>
      </div>
    `;
  }

  /**
   * パラメータテーブルを描画する
   * @param {string[]} elementPaths - 表示する要素パス
   */
  renderParameterTable(elementPaths) {
    if (!elementPaths.length) {
      this.elementContainer.innerHTML =
        '<div class="no-elements">該当するパラメータがありません</div>';
      return;
    }

    const uniquePaths = [...new Set(elementPaths)];
    this.treeNodeCounter = 0;
    const tree = this.buildParameterTree(uniquePaths);
    const rootNodes = this.getSortedElementChildren(tree);
    if (!rootNodes.length) {
      this.elementContainer.innerHTML =
        '<div class="no-elements">該当するパラメータがありません</div>';
      return;
    }

    this.elementContainer.innerHTML = `
      <div class="importance-tree-root">
        ${rootNodes.map((node) => this.renderTreeNode(node)).join('')}
      </div>
    `;

    // 重要度変更イベントを関連付け
    this.elementContainer.querySelectorAll('.importance-select').forEach((select) => {
      select.addEventListener('change', (e) => {
        const path = e.target.dataset.path;
        const mvdMode = e.target.dataset.mvd;
        const newImportance = e.target.value;
        this.manager.setMvdImportanceLevel(path, mvdMode, newImportance);
        this.updateRenderedPathState(path);
      });
    });

    // ツリー折りたたみイベントを関連付け
    this.elementContainer.querySelectorAll('.importance-toggle-btn').forEach((toggleBtn) => {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetId = toggleBtn.dataset.targetId;
        const targetEl = this.elementContainer.querySelector(`[data-tree-id="${targetId}"]`);
        if (!targetEl) return;
        const isVisible = targetEl.style.display !== 'none';
        targetEl.style.display = isVisible ? 'none' : 'block';
        toggleBtn.textContent = isVisible ? '+' : '-';
      });
    });

    this.elementContainer.querySelectorAll('.sortable-header').forEach((header) => {
      header.addEventListener('click', () => {
        const sortKey = header.dataset.sortKey;
        this.updateSort(sortKey);
      });
    });
  }

  /**
   * 描画済み行の表示状態（S2/S4/評価）を同期
   * @param {string} path
   */
  updateRenderedPathState(path) {
    const rows = this.elementContainer?.querySelectorAll(`tr[data-path="${path}"]`);
    if (!rows || rows.length === 0) {
      return;
    }

    const s2Importance = this.normalizeBinaryLevel(this.manager.getMvdImportanceLevel(path, 's2'));
    const s4Importance = this.normalizeBinaryLevel(this.manager.getMvdImportanceLevel(path, 's4'));

    rows.forEach((row) => {
      const s2Select = row.querySelector('.importance-select-s2');
      const s4Select = row.querySelector('.importance-select-s4');
      const s2Dot = row.querySelector('.status-dot-s2');
      const s4Dot = row.querySelector('.status-dot-s4');

      if (s2Select && s2Select.value !== s2Importance) {
        s2Select.value = s2Importance;
      }
      if (s4Select && s4Select.value !== s4Importance) {
        s4Select.value = s4Importance;
      }
      if (s2Dot) {
        s2Dot.style.backgroundColor = IMPORTANCE_COLORS[s2Importance];
        s2Dot.title = this.getBinaryLabel(s2Importance);
      }
      if (s4Dot) {
        s4Dot.style.backgroundColor = IMPORTANCE_COLORS[s4Importance];
        s4Dot.title = this.getBinaryLabel(s4Importance);
      }
    });
  }

  /**
   * パスからパラメータ名を抽出する
   */
  extractParameterName(path) {
    if (!path) return '';
    // 属性の場合 @name
    if (path.includes('@')) {
      return path.split('@')[1];
    }
    // 要素の場合、最後の要素名
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  }

  /**
   * 重要度変更時の処理
   */
  handleImportanceChange(path, importance) {
    // マネージャーのメソッドを呼び出す
    // イベント発行はマネージャー側で行われる
    this.manager.setImportanceLevel(path, importance);
  }

  /**
   * 要素パスを読みやすい形式にフォーマットする
   * @param {string} path - 要素パス
   * @returns {string} フォーマット済みのパス
   */
  formatElementPath(path) {
    // XPathの長いパスを短縮表示
    const parts = path.split('/');
    if (parts.length > 4) {
      const start = parts.slice(0, 2).join('/');
      const end = parts.slice(-2).join('/');
      return `${start}/.../${end}`;
    }
    return path;
  }

  /**
   * 統計情報を更新する
   */
  updateStatistics() {
    if (!this.statisticsContainer) return;

    const stats = this.manager.getStatistics();

    const statsHTML = `
      <div class="statistics-grid">
        <div class="stat-item total-parameters">
          <div class="stat-label">STB総パラメータ数</div>
          <div class="stat-value">${stats.totalParameterCount || 0}</div>
        </div>
        <div class="stat-item xsd-required">
          <div class="stat-label">XSD必須数</div>
          <div class="stat-value">${stats.xsdRequiredCount || 0}</div>
        </div>
        <div class="stat-item s2-target">
          <div class="stat-label">S2対象数</div>
          <div class="stat-value">${stats.s2TargetCount || 0}</div>
        </div>
        <div class="stat-item s4-target">
          <div class="stat-label">S4対象数</div>
          <div class="stat-value">${stats.s4TargetCount || 0}</div>
        </div>
      </div>
    `;

    this.statisticsContainer.innerHTML = statsHTML;
  }

  /**
   * 現在のタブに一括で重要度を適用する（属性のみ）
   */
  applyBulkImportance() {
    const bulkLevel = document.getElementById('importance-bulk-level').value;
    if (!bulkLevel) {
      showWarning('設定を選択してください。');
      return;
    }

    const elementPaths = this.manager.getElementPathsByTab(this.currentTab);
    const filteredPaths = this.filterElementPaths(elementPaths);

    // 属性のみに絞り込み（要素は除外）
    const attributePaths = filteredPaths.filter((path) => path.includes('@'));

    if (attributePaths.length === 0) {
      showWarning('適用対象の属性がありません。');
      return;
    }

    const confirmMessage = `現在のタブの${attributePaths.length}個の属性を「${this.getBinaryLabel(bulkLevel)}」に設定しますか？\n（S2/S4 の両方に適用）`;
    if (!confirm(confirmMessage)) {
      return;
    }

    attributePaths.forEach((path) => {
      this.manager.setMvdImportanceLevel(path, 's2', bulkLevel, {
        notify: false,
        rebuild: false,
      });
      this.manager.setMvdImportanceLevel(path, 's4', bulkLevel, {
        notify: false,
        rebuild: false,
      });
    });
    this.manager.rebuildEffectiveImportanceSettings();
    this.manager.notifySettingsChanged();

    this.refreshCurrentTab();
    showSuccess(`${attributePaths.length}個の属性の重要度を変更しました。`);
  }

  /**
   * CSV形式で設定をエクスポートする
   */
  exportToCSV() {
    try {
      const csvContent = this.manager.exportToCSV();
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      downloadBlob(blob, `importance_settings_${new Date().toISOString().slice(0, 10)}.csv`);

      showSuccess('重要度設定をCSVファイルに出力しました。');
    } catch (error) {
      log.error('CSV export failed:', error);
      showError('CSVファイルの出力に失敗しました。');
    }
  }

  /**
   * CSVファイルから設定をインポートする
   * @param {File} file - CSVファイル
   */
  async importFromCSV(file) {
    if (!file) return;

    try {
      const csvContent = await this.readFileAsText(file);
      const success = this.manager.importFromCSV(csvContent);

      if (success) {
        this.refreshCurrentTab();
        showSuccess('重要度設定をCSVファイルから読み込みました。');
      } else {
        showError('CSVファイルの読み込みに失敗しました。');
      }
    } catch (error) {
      log.error('CSV import failed:', error);
      showError('CSVファイルの読み込み中にエラーが発生しました。');
    }
  }

  /**
   * ファイルをテキストとして読み込む
   * @param {File} file - 読み込むファイル
   * @returns {Promise<string>} ファイル内容
   */
  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file, 'UTF-8');
    });
  }

  /**
   * 設定をデフォルトに戻す
   */
  resetToDefaults() {
    const confirmMessage = '重要度設定をデフォルトに戻しますか？\n現在の設定は失われます。';
    if (!confirm(confirmMessage)) {
      return;
    }

    this.manager.resetToDefaults();

    this.refreshCurrentTab();
    showSuccess('重要度設定をデフォルトに戻しました。');
  }

  /**
   * パネルのスタイルを動的に追加する
   * 注: スタイルは importance.css に外部化されました
   */
  static addStyles() {
    // スタイルは stb-diff-viewer/style/components/importance.css で定義
    // このメソッドは互換性のために残されています
  }
}

// スタイルを追加
ImportancePanel.addStyles();

// シングルトンインスタンス
let importancePanelInstance = null;

/**
 * ImportancePanelのシングルトンインスタンスを取得する
 * @returns {ImportancePanel} インスタンス
 */
export function getImportancePanel() {
  if (!importancePanelInstance) {
    importancePanelInstance = new ImportancePanel();
  }
  return importancePanelInstance;
}

/**
 * 重要度設定パネルを初期化する
 * @param {HTMLElement} containerElement - パネルを配置するコンテナー
 * @returns {ImportancePanel} 初期化済みのインスタンス
 */
export function initializeImportancePanel(containerElement = document.body) {
  const panel = getImportancePanel();
  panel.initialize(containerElement);
  return panel;
}

// デフォルトエクスポート
export default ImportancePanel;

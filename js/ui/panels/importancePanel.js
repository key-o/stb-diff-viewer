/**
 * @fileoverview 重要度設定UIパネル
 *
 * ST-Bridge要素の重要度設定を管理するUIコンポーネント。
 * タブ別の要素表示、重要度レベル変更、CSV入出力機能を提供します。
 */

import { getImportanceManager, STB_ELEMENT_TABS } from '../../app/importanceManager.js';
import { IMPORTANCE_LEVELS, IMPORTANCE_LEVEL_NAMES } from '../../constants/importanceLevels.js';
import { IMPORTANCE_COLORS } from '../../config/importanceConfig.js';
import { AVAILABLE_CONFIGS } from '../../config/importanceConfigLoader.js';
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

const log = createLogger('importancePanel');

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
    this.isVisible = false;
    this.elementContainer = null;
    this.statisticsContainer = null;

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
    this.syncMvdConfigSelector();

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
        this.syncMvdConfigSelector();
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
                <div class="config-selector-group">
                  <label for="importance-mvd-config-select">MVD:</label>
                  <select id="importance-mvd-config-select" class="mvd-config-select">
                    ${AVAILABLE_CONFIGS.map(
                      (config) => `
                      <option value="${config.id}" ${config.id === 'mvd-combined' ? 'selected' : ''}>
                        ${config.name}
                      </option>
                    `,
                    ).join('')}
                  </select>
                </div>
                <div id="importance-config-description" class="config-description"></div>
              </div>

              <div class="search-box">
                 <input type="text" id="importance-filter-text" placeholder="パラメータ検索...">
              </div>
              
              <select id="importance-filter-level">
                <option value="all">全レベル</option>
                <option value="${IMPORTANCE_LEVELS.REQUIRED}">高重要度</option>
                <option value="${IMPORTANCE_LEVELS.OPTIONAL}">中重要度</option>
                <option value="${IMPORTANCE_LEVELS.UNNECESSARY}">低重要度</option>
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
                    <option value="">レベルを選択...</option>
                    <option value="${IMPORTANCE_LEVELS.REQUIRED}">高重要度</option>
                    <option value="${IMPORTANCE_LEVELS.OPTIONAL}">中重要度</option>
                    <option value="${IMPORTANCE_LEVELS.UNNECESSARY}">低重要度</option>
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
      if(menuContent) menuContent.style.display = 'none';
    });

    document.getElementById('importance-import-csv-btn').addEventListener('click', () => {
      document.getElementById('importance-import-csv').click();
      if(menuContent) menuContent.style.display = 'none';
    });

    document.getElementById('importance-import-csv').addEventListener('change', (e) => {
      this.importFromCSV(e.target.files[0]);
    });

    // デフォルトリセット
    document.getElementById('importance-reset-defaults').addEventListener('click', () => {
      this.resetToDefaults();
      if(menuContent) menuContent.style.display = 'none';
    });

    // MVD設定切り替え
    document.getElementById('importance-mvd-config-select').addEventListener('change', (e) => {
      this.switchMvdConfig(e.target.value);
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
        this.categoryListContainer.querySelectorAll('.category-item').forEach(item => {
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
        const importance = this.manager.getImportanceLevel(path);
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

      const html = STB_ELEMENT_TABS.map(tab => {
          const paths = this.manager.getElementPathsByTab(tab.id);
          const count = paths.filter((path) => settings.has(path)).length;
          const isActive = this.currentTab === tab.id;
          
          return `
          <li class="category-item ${isActive ? 'active' : ''}" data-id="${tab.id}">
              <span class="category-name">${tab.name}</span>
              <span class="count-badge">${count}</span>
          </li>
          `;
      }).join('');

      this.categoryListContainer.innerHTML = html;

      // イベントリスナー再設定
      this.categoryListContainer.querySelectorAll('.category-item').forEach(item => {
          item.addEventListener('click', () => {
              this.selectCategory(item.dataset.id);
          });
      });

      this.applyCategoryListFilter();
  }

  /**
   * カテゴリリストの表示をフィルタリングする
   */
  applyCategoryListFilter() {
    const filterText = (this.categoryFilterText || '').toLowerCase();
    if (!this.categoryListContainer) return;

    this.categoryListContainer.querySelectorAll('.category-item').forEach((item) => {
      const name = (item.querySelector('.category-name')?.textContent || '').toLowerCase();
      item.style.display = name.includes(filterText) ? 'flex' : 'none';
    });
  }

  /**
   * XPathを表示用のセグメント配列に分解する
   * @param {string} path - XPath
   * @returns {string[]} セグメント配列
   */
  parsePathSegments(path) {
    if (!path || typeof path !== 'string') {
      return [];
    }

    const segments = path.split('/').filter(Boolean);
    if (segments[0] === 'ST_BRIDGE') {
      segments.shift();
    }
    return segments;
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
      const segments = this.parsePathSegments(path);
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
      node.terminalPaths.push(path);
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
   * ノード直下で編集可能なパス（要素＋属性）を取得する
   * @param {Object} node - ツリーノード
   * @returns {string[]} 直下のパス配列
   */
  collectDirectPaths(node) {
    const directPaths = [...node.terminalPaths];

    node.children.forEach((childNode, childName) => {
      if (childName.startsWith('@')) {
        directPaths.push(...childNode.terminalPaths);
      }
    });

    return directPaths;
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
   * パス行HTMLを描画する
   * @param {string[]} paths - パス配列
   * @returns {string} rows HTML
   */
  renderParameterRows(paths) {
    return paths
      .map((path) => {
        const importance = this.manager.getImportanceLevel(path);
        const importanceName = IMPORTANCE_LEVEL_NAMES[importance];
        const color = IMPORTANCE_COLORS[importance];
        const paramName = this.extractParameterName(path);
        const isAttribute = path.includes('@');

        return `
          <tr>
            <td title="${path}">
              <span class="param-name">${paramName}</span>
              ${isAttribute ? '<span class="param-type">属性</span>' : '<span class="param-type">要素</span>'}
            </td>
            <td>
              <div class="importance-select-wrapper">
                <span class="status-dot" style="background-color: ${color};" title="${importanceName}"></span>
                <select class="importance-select" data-path="${path}">
                  ${Object.entries(IMPORTANCE_LEVELS)
                    .map(
                      ([, value]) => `
                        <option value="${value}" ${value === importance ? 'selected' : ''}>
                          ${IMPORTANCE_LEVEL_NAMES[value]}
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

    const rowsHTML = this.renderParameterRows(paths);
    if (compact) {
      return `
        <table class="importance-table importance-table-compact">
          <tbody>${rowsHTML}</tbody>
        </table>
      `;
    }

    return `
      <table class="importance-table">
        <thead>
          <tr>
            <th>パラメータ名</th>
            <th>重要度設定</th>
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
    const isOpen = depth === 0 ? 'open' : '';

    return `
      <details class="importance-tree-node depth-${Math.min(depth, 6)}" ${isOpen}>
        <summary class="importance-tree-summary">
          <span class="tree-node-name">${node.name}</span>
          <span class="tree-node-count">${pathCount}</span>
        </summary>
        <div class="importance-tree-content">
          ${directPaths.length ? this.renderPathsTable(directPaths, true) : ''}
          ${childNodes.map((childNode) => this.renderTreeNode(childNode, depth + 1)).join('')}
        </div>
      </details>
    `;
  }

  /**
   * パラメータテーブルを描画する
   * @param {string[]} elementPaths - 表示する要素パス
   */
  renderParameterTable(elementPaths) {
    if (!elementPaths.length) {
      this.elementContainer.innerHTML = '<div class="no-elements">該当するパラメータがありません</div>';
      return;
    }

    const uniquePaths = [...new Set(elementPaths)];
    const tree = this.buildParameterTree(uniquePaths);
    const rootNodes = this.getSortedElementChildren(tree);
    if (!rootNodes.length) {
      this.elementContainer.innerHTML = '<div class="no-elements">該当するパラメータがありません</div>';
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
        const newImportance = e.target.value;

        // 色更新
        const dot = select.parentElement.querySelector('.status-dot');
        if(dot) dot.style.backgroundColor = IMPORTANCE_COLORS[newImportance];

        this.handleImportanceChange(path, newImportance);
      });
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
        <div class="stat-item">
          <div class="stat-label">総要素数</div>
          <div class="stat-value">${stats.total}</div>
        </div>
        <div class="stat-item high">
          <div class="stat-label">高重要度</div>
          <div class="stat-value">${stats.byLevel[IMPORTANCE_LEVELS.REQUIRED] || 0}</div>
        </div>
        <div class="stat-item medium">
          <div class="stat-label">中重要度</div>
          <div class="stat-value">${stats.byLevel[IMPORTANCE_LEVELS.OPTIONAL] || 0}</div>
        </div>
        <div class="stat-item low">
          <div class="stat-label">低重要度</div>
          <div class="stat-value">${stats.byLevel[IMPORTANCE_LEVELS.UNNECESSARY] || 0}</div>
        </div>
        <div class="stat-item na">
          <div class="stat-label">対象外</div>
          <div class="stat-value">${stats.byLevel[IMPORTANCE_LEVELS.NOT_APPLICABLE] || 0}</div>
        </div>
      </div>
    `;

    this.statisticsContainer.innerHTML = statsHTML;
  }

  /**
   * 現在のタブに一括で重要度を適用する
   */
  applyBulkImportance() {
    const bulkLevel = document.getElementById('importance-bulk-level').value;
    if (!bulkLevel) {
      showWarning('重要度レベルを選択してください。');
      return;
    }

    const elementPaths = this.manager.getElementPathsByTab(this.currentTab);
    const filteredPaths = this.filterElementPaths(elementPaths);

    if (filteredPaths.length === 0) {
      showWarning('適用対象の要素がありません。');
      return;
    }

    const confirmMessage = `現在のタブの${filteredPaths.length}個の要素を「${IMPORTANCE_LEVEL_NAMES[bulkLevel]}」に設定しますか？`;
    if (!confirm(confirmMessage)) {
      return;
    }

    filteredPaths.forEach((path) => {
      this.manager.setImportanceLevel(path, bulkLevel);
    });

    // 一括変更の詳細情報をイベントで通知（EventBus経由）
    eventBus.emit(ImportanceEvents.SETTINGS_CHANGED, {
      type: 'bulk',
      paths: filteredPaths,
      newImportance: bulkLevel,
      tab: this.currentTab,
      count: filteredPaths.length,
      timestamp: new Date().toISOString(),
    });

    this.refreshCurrentTab();
    showSuccess(`${filteredPaths.length}個の要素の重要度を変更しました。`);
  }

  /**
   * CSV形式で設定をエクスポートする
   */
  exportToCSV() {
    try {
      const csvContent = this.manager.exportToCSV();
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');

      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute(
        'download',
        `importance_settings_${new Date().toISOString().slice(0, 10)}.csv`,
      );
      link.style.visibility = 'hidden';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

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

    // リセットの詳細情報をイベントで通知（EventBus経由）
    eventBus.emit(ImportanceEvents.SETTINGS_CHANGED, {
      type: 'reset',
      timestamp: new Date().toISOString(),
    });

    this.refreshCurrentTab();
    this.syncMvdConfigSelector();
    showSuccess('重要度設定をデフォルトに戻しました。');
  }

  /**
   * MVD設定を切り替える
   * @param {string} configId - 設定ID ('mvd-combined', 's2', 's4')
   */
  async switchMvdConfig(configId) {
    try {
      const success = await this.manager.loadExternalConfig(configId);

      if (success) {
        const configInfo = AVAILABLE_CONFIGS.find((c) => c.id === configId);
        const descEl = document.getElementById('importance-config-description');
        if (descEl && configInfo) {
          descEl.textContent = configInfo.description;
        }

        this.updateStatistics();
        this.refreshCurrentTab();

        await this.triggerAutoRedraw({
          type: 'configSwitch',
          configId: configId,
          configName: configInfo?.name,
          timestamp: new Date().toISOString(),
        });

        showSuccess(`MVD設定を「${configInfo?.name || configId}」に切り替えました。`);
      } else {
        showError('MVD設定の切り替えに失敗しました。');
      }
    } catch (error) {
      log.error('MVD config switch failed:', error);
      showError('MVD設定の読み込み中にエラーが発生しました。');
    }
  }

  /**
   * MVD設定セレクターの表示状態を現在の設定と同期する
   */
  syncMvdConfigSelector() {
    const selectEl = document.getElementById('importance-mvd-config-select');
    if (selectEl && this.manager.getCurrentConfigId()) {
      selectEl.value = this.manager.getCurrentConfigId();
    }

    const descEl = document.getElementById('importance-config-description');
    if (descEl) {
      const currentId = this.manager.getCurrentConfigId() || 'mvd-combined';
      const configInfo = AVAILABLE_CONFIGS.find((c) => c.id === currentId);
      if (configInfo) {
        descEl.textContent = configInfo.description;
      }
    }
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

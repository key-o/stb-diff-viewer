/**
 * @fileoverview 重要度設定UIパネル
 *
 * ST-Bridge要素の重要度設定を管理するUIコンポーネント。
 * タブ別の要素表示、重要度レベル変更、CSV入出力機能を提供します。
 */

import { getImportanceManager, STB_ELEMENT_TABS } from '../app/importanceManager.js';
import { IMPORTANCE_LEVELS, IMPORTANCE_LEVEL_NAMES } from '../constants/importanceLevels.js';
import { IMPORTANCE_COLORS } from '../config/importanceConfig.js';
import { getState, setState } from '../app/globalState.js';
import { comparisonController } from '../app/controllers/comparisonController.js';
import { floatingWindowManager } from './floatingWindowManager.js';
import { eventBus, ImportanceEvents, ComparisonEvents, RenderEvents } from '../app/events/index.js';
import { showSuccess, showError, showWarning } from './toast.js';
import { createLogger } from '../utils/logger.js';

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
      this.updateStatistics();
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
    this.bindEvents();
    this.updateStatistics();

    // Windowマネージャに登録
    this.registerWithWindowManager();

    // 初期表示でCommonタブを選択
    this.switchTab('StbCommon');

    log.info('ImportancePanel initialized');
  }

  /**
   * Windowマネージャに登録
   */
  registerWithWindowManager() {
    floatingWindowManager.registerWindow({
      windowId: 'importance-panel',
      toggleButtonId: null, // ボタンは手動で管理
      closeButtonId: 'importance-panel-close',
      headerId: 'importance-panel-header',
      draggable: true,
      autoShow: false,
      onShow: () => {
        this.isVisible = true;
        this.updateStatistics();
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
      <div id="importance-panel" class="floating-window">
        <div class="float-window-header" id="importance-panel-header">
          <span class="float-window-title">🏷️ 重要度設定</span>
          <div class="float-window-controls">
            <button class="float-window-btn" id="importance-panel-close">✕</button>
          </div>
        </div>
        <div class="float-window-content">
        
        <div class="panel-controls">
          <div class="control-group">
            <label>フィルター:</label>
            <input type="text" id="importance-filter-text" placeholder="要素パスで検索..." />
            <select id="importance-filter-level">
              <option value="all">すべて</option>
              <option value="${IMPORTANCE_LEVELS.REQUIRED}">高重要度</option>
              <option value="${IMPORTANCE_LEVELS.OPTIONAL}">中重要度</option>
              <option value="${IMPORTANCE_LEVELS.UNNECESSARY}">低重要度</option>
              <option value="${IMPORTANCE_LEVELS.NOT_APPLICABLE}">対象外</option>
            </select>
          </div>
          
          <div class="control-group">
            <label>一括設定:</label>
            <select id="importance-bulk-level">
              <option value="">レベルを選択...</option>
              <option value="${IMPORTANCE_LEVELS.REQUIRED}">高重要度</option>
              <option value="${IMPORTANCE_LEVELS.OPTIONAL}">中重要度</option>
              <option value="${IMPORTANCE_LEVELS.UNNECESSARY}">低重要度</option>
              <option value="${IMPORTANCE_LEVELS.NOT_APPLICABLE}">対象外</option>
            </select>
            <button id="importance-bulk-apply">現在のタブに適用</button>
          </div>
          
          <div class="control-group">
            <button id="importance-export-csv" class="btn btn-primary">CSV出力</button>
            <input type="file" id="importance-import-csv" accept=".csv" style="display: none;" />
            <button id="importance-import-csv-btn" class="btn btn-primary">CSV読込</button>
            <button id="importance-reset-defaults" class="btn btn-warning">デフォルトに戻す</button>
          </div>
        </div>
        
        <div class="panel-tabs">
          <div id="importance-tab-buttons" class="tab-buttons">
            ${STB_ELEMENT_TABS.map(
              (tab) => `
              <button class="tab-button" data-tab="${tab.id}" title="${tab.name}">
                ${tab.name}
              </button>
            `,
            ).join('')}
          </div>
        </div>
        
        <div class="panel-content">
          <div id="importance-statistics" class="statistics-container">
            <!-- 統計情報がここに表示される -->
          </div>
          
          <div id="importance-elements" class="elements-container">
            <!-- 要素一覧がここに表示される -->
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

    // フィルター
    document.getElementById('importance-filter-text').addEventListener('input', (e) => {
      this.filterText = e.target.value;
      this.refreshCurrentTab();
    });

    document.getElementById('importance-filter-level').addEventListener('change', (e) => {
      this.filterImportance = e.target.value;
      this.refreshCurrentTab();
    });

    // 一括適用
    document.getElementById('importance-bulk-apply').addEventListener('click', () => {
      this.applyBulkImportance();
    });

    // CSV機能
    document.getElementById('importance-export-csv').addEventListener('click', () => {
      this.exportToCSV();
    });

    document.getElementById('importance-import-csv-btn').addEventListener('click', () => {
      document.getElementById('importance-import-csv').click();
    });

    document.getElementById('importance-import-csv').addEventListener('change', (e) => {
      this.importFromCSV(e.target.files[0]);
    });

    // デフォルトリセット
    document.getElementById('importance-reset-defaults').addEventListener('click', () => {
      this.resetToDefaults();
    });

    // タブボタン
    document.querySelectorAll('.tab-button').forEach((button) => {
      button.addEventListener('click', (e) => {
        const tabId = e.target.dataset.tab;
        this.switchTab(tabId);
      });
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
   * タブを切り替える
   * @param {string} tabId - タブID
   */
  switchTab(tabId) {
    this.currentTab = tabId;

    // タブボタンのアクティブ状態を更新
    document.querySelectorAll('.tab-button').forEach((button) => {
      button.classList.toggle('active', button.dataset.tab === tabId);
    });

    this.refreshCurrentTab();
  }

  /**
   * 現在のタブの内容を更新する
   */
  refreshCurrentTab() {
    if (!this.elementContainer) return;

    const elementPaths = this.manager.getElementPathsByTab(this.currentTab);
    const filteredPaths = this.filterElementPaths(elementPaths);

    this.renderElementList(filteredPaths);
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
   * 要素一覧を描画する
   * @param {string[]} elementPaths - 表示する要素パス
   */
  renderElementList(elementPaths) {
    if (!elementPaths.length) {
      this.elementContainer.innerHTML = '<div class="no-elements">該当する要素がありません</div>';
      return;
    }

    const elementsHTML = elementPaths
      .map((path) => {
        const importance = this.manager.getImportanceLevel(path);
        const importanceName = IMPORTANCE_LEVEL_NAMES[importance];
        const color = IMPORTANCE_COLORS[importance];

        return `
        <div class="element-item" data-path="${path}">
          <div class="element-path" title="${path}">
            ${this.formatElementPath(path)}
          </div>
          <div class="element-importance">
            <select class="importance-select" data-path="${path}">
              ${Object.entries(IMPORTANCE_LEVELS)
                .map(
                  ([key, value]) => `
                <option value="${value}" ${value === importance ? 'selected' : ''}>
                  ${IMPORTANCE_LEVEL_NAMES[value]}
                </option>
              `,
                )
                .join('')}
            </select>
            <div class="importance-indicator" style="background-color: ${color};" title="${importanceName}"></div>
          </div>
        </div>
      `;
      })
      .join('');

    this.elementContainer.innerHTML = `
      <div class="elements-header">
        <div class="element-count">${elementPaths.length} 件の要素</div>
      </div>
      <div class="elements-list">
        ${elementsHTML}
      </div>
    `;

    // 重要度変更イベントを関連付け
    this.elementContainer.querySelectorAll('.importance-select').forEach((select) => {
      select.addEventListener('change', (e) => {
        const path = e.target.dataset.path;
        const oldImportance = select.dataset.previousValue;
        const newImportance = e.target.value;

        // 前の値を記録（次回の比較用）
        select.dataset.previousValue = newImportance;

        this.manager.setImportanceLevel(path, newImportance);

        // インジケーターの色を更新
        const indicator = e.target.parentElement.querySelector('.importance-indicator');
        indicator.style.backgroundColor = IMPORTANCE_COLORS[newImportance];
        indicator.title = IMPORTANCE_LEVEL_NAMES[newImportance];

        // 詳細な変更情報をイベントで通知（EventBus経由）
        eventBus.emit(ImportanceEvents.SETTINGS_CHANGED, {
          type: 'single',
          path: path,
          oldImportance: oldImportance,
          newImportance: newImportance,
          tab: this.currentTab,
          timestamp: new Date().toISOString(),
        });
      });

      // 初期値を記録
      select.dataset.previousValue = select.value;
    });
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

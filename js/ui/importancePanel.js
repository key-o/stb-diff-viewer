/**
 * @fileoverview 重要度設定UIパネル
 * 
 * ST-Bridge要素の重要度設定を管理するUIコンポーネント。
 * タブ別の要素表示、重要度レベル変更、CSV入出力機能を提供します。
 */

import { getImportanceManager, IMPORTANCE_LEVELS, IMPORTANCE_LEVEL_NAMES, STB_ELEMENT_TABS } from '../core/importanceManager.js';
import { IMPORTANCE_COLORS } from '../config/importanceConfig.js';
import { getState, setState } from '../core/globalState.js';
import { updateComparisonResultImportance } from '../comparator.js';
import { floatingWindowManager } from './floatingWindowManager.js';

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
    // 重要度設定変更イベント
    window.addEventListener('importanceSettingsChanged', (event) => {
      this.updateStatistics();
      this.refreshCurrentTab();
      
      // 自動再描画を実行
      this.triggerAutoRedraw(event.detail);
    });
  }

  /**
   * 重要度変更時の自動再描画を実行する
   * @param {Object} changeDetails - 変更の詳細情報
   */
  async triggerAutoRedraw(changeDetails = {}) {
    try {
      console.log('Starting auto-redraw after importance change:', changeDetails);
      
      // 比較結果の重要度情報を更新
      await this.updateVisualizationWithImportance();
      
      // 3D表示を再描画
      this.rerenderElements();
      
      // 統計情報を更新
      this.updateComparisonStatistics();
      
      console.log('Auto-redraw completed successfully');
      
      // 成功の通知イベントを発行
      window.dispatchEvent(new CustomEvent('importanceAutoRedrawCompleted', {
        detail: {
          success: true,
          changeDetails,
          timestamp: new Date().toISOString()
        }
      }));
      
    } catch (error) {
      console.error('Auto-redraw failed:', error);
      
      // エラーの通知イベントを発行
      window.dispatchEvent(new CustomEvent('importanceAutoRedrawError', {
        detail: {
          error: error.message,
          changeDetails,
          timestamp: new Date().toISOString()
        }
      }));
    }
  }

  /**
   * 重要度設定で比較結果の視覚化を更新する
   */
  async updateVisualizationWithImportance() {
    const currentResults = getState('comparisonResults');
    if (!currentResults) {
      console.log('No comparison results available for importance update');
      return;
    }
    
    console.log('Updating visualization with importance settings...');
    
    // 各要素タイプの比較結果を重要度で更新
    for (const [elementType, result] of currentResults.entries()) {
      try {
        const updatedResult = updateComparisonResultImportance(result, elementType);
        currentResults.set(elementType, updatedResult);
        console.log(`Updated importance for ${elementType}:`, {
          matched: updatedResult.matched.length,
          onlyA: updatedResult.onlyA.length,
          onlyB: updatedResult.onlyB.length
        });
      } catch (error) {
        console.error(`Failed to update importance for ${elementType}:`, error);
      }
    }
    
    // 更新された結果をグローバル状態に保存
    setState('comparisonResults', currentResults);
    
    console.log('Visualization importance update completed');
  }

  /**
   * 3D要素の再描画を実行する
   */
  rerenderElements() {
    try {
      console.log('Rerendering 3D elements...');
      
      // 3Dビューアーの再描画を要求
      const viewer = getState('viewer');
      if (viewer && typeof viewer.requestRender === 'function') {
        viewer.requestRender();
      }
      
      // カスタム再描画イベントを発行（他のモジュールが対応できるように）
      window.dispatchEvent(new CustomEvent('requestElementRerender', {
        detail: {
          reason: 'importanceChange',
          timestamp: new Date().toISOString()
        }
      }));
      
      console.log('Element rerender request completed');
      
    } catch (error) {
      console.error('Failed to rerender elements:', error);
      throw error;
    }
  }

  /**
   * 比較統計情報を更新する
   */
  updateComparisonStatistics() {
    try {
      console.log('Updating comparison statistics...');
      
      const currentResults = getState('comparisonResults');
      if (!currentResults) {
        return;
      }
      
      // 統計更新イベントを発行
      window.dispatchEvent(new CustomEvent('updateComparisonStatistics', {
        detail: {
          comparisonResults: currentResults,
          reason: 'importanceChange',
          timestamp: new Date().toISOString()
        }
      }));
      
      console.log('Comparison statistics update completed');
      
    } catch (error) {
      console.error('Failed to update comparison statistics:', error);
    }
  }

  /**
   * パネルを初期化する
   * @param {HTMLElement} containerElement - パネルを配置するコンテナ要素
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

    console.log('ImportancePanel initialized');
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
      }
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
            ${STB_ELEMENT_TABS.map(tab => `
              <button class="tab-button" data-tab="${tab.id}" title="${tab.name}">
                ${tab.name}
              </button>
            `).join('')}
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
    document.querySelectorAll('.tab-button').forEach(button => {
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
    document.querySelectorAll('.tab-button').forEach(button => {
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
    return elementPaths.filter(path => {
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
    
    const elementsHTML = elementPaths.map(path => {
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
              ${Object.entries(IMPORTANCE_LEVELS).map(([key, value]) => `
                <option value="${value}" ${value === importance ? 'selected' : ''}>
                  ${IMPORTANCE_LEVEL_NAMES[value]}
                </option>
              `).join('')}
            </select>
            <div class="importance-indicator" style="background-color: ${color};" title="${importanceName}"></div>
          </div>
        </div>
      `;
    }).join('');
    
    this.elementContainer.innerHTML = `
      <div class="elements-header">
        <div class="element-count">${elementPaths.length} 件の要素</div>
      </div>
      <div class="elements-list">
        ${elementsHTML}
      </div>
    `;
    
    // 重要度変更イベントを関連付け
    this.elementContainer.querySelectorAll('.importance-select').forEach(select => {
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
        
        // 詳細な変更情報をイベントで通知
        window.dispatchEvent(new CustomEvent('importanceSettingsChanged', {
          detail: {
            type: 'single',
            path: path,
            oldImportance: oldImportance,
            newImportance: newImportance,
            tab: this.currentTab,
            timestamp: new Date().toISOString()
          }
        }));
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
      alert('重要度レベルを選択してください。');
      return;
    }
    
    const elementPaths = this.manager.getElementPathsByTab(this.currentTab);
    const filteredPaths = this.filterElementPaths(elementPaths);
    
    if (filteredPaths.length === 0) {
      alert('適用対象の要素がありません。');
      return;
    }
    
    const confirmMessage = `現在のタブの${filteredPaths.length}個の要素を「${IMPORTANCE_LEVEL_NAMES[bulkLevel]}」に設定しますか？`;
    if (!confirm(confirmMessage)) {
      return;
    }
    
    filteredPaths.forEach(path => {
      this.manager.setImportanceLevel(path, bulkLevel);
    });
    
    // 一括変更の詳細情報をイベントで通知
    window.dispatchEvent(new CustomEvent('importanceSettingsChanged', {
      detail: {
        type: 'bulk',
        paths: filteredPaths,
        newImportance: bulkLevel,
        tab: this.currentTab,
        count: filteredPaths.length,
        timestamp: new Date().toISOString()
      }
    }));
    
    this.refreshCurrentTab();
    alert(`${filteredPaths.length}個の要素の重要度を変更しました。`);
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
      link.setAttribute('download', `importance_settings_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      alert('重要度設定をCSVファイルに出力しました。');
    } catch (error) {
      console.error('CSV export failed:', error);
      alert('CSVファイルの出力に失敗しました。');
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
        alert('重要度設定をCSVファイルから読み込みました。');
      } else {
        alert('CSVファイルの読み込みに失敗しました。');
      }
    } catch (error) {
      console.error('CSV import failed:', error);
      alert('CSVファイルの読み込み中にエラーが発生しました。');
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
    
    // リセットの詳細情報をイベントで通知
    window.dispatchEvent(new CustomEvent('importanceSettingsChanged', {
      detail: {
        type: 'reset',
        timestamp: new Date().toISOString()
      }
    }));
    
    this.refreshCurrentTab();
    alert('重要度設定をデフォルトに戻しました。');
  }

  /**
   * パネルのスタイルを動的に追加する
   */
  static addStyles() {
    if (document.getElementById('importance-panel-styles')) return;

    const styles = `
      <style id="importance-panel-styles">
        .importance-panel {
          position: fixed;
          top: 50px;
          right: 20px;
          width: 400px;
          max-height: 80vh;
          background: white;
          border: 1px solid #ccc;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          z-index: 1000;
          flex-direction: column;
          display: none;
        }

        .importance-panel.visible {
          display: flex;
        }
        
        .importance-panel .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid #eee;
          background: #f8f9fa;
          border-radius: 8px 8px 0 0;
        }
        
        .importance-panel .panel-header h3 {
          margin: 0;
          font-size: 16px;
          color: #333;
        }
        
        .importance-panel .close-button {
          background: none;
          border: none;
          font-size: 18px;
          cursor: pointer;
          color: #666;
          padding: 0;
          width: 24px;
          height: 24px;
          border-radius: 50%;
        }
        
        .importance-panel .close-button:hover {
          background: #e9ecef;
        }
        
        .importance-panel .panel-controls {
          padding: 12px 16px;
          border-bottom: 1px solid #eee;
          background: #f8f9fa;
        }
        
        .importance-panel .control-group {
          margin-bottom: 8px;
        }
        
        .importance-panel .control-group:last-child {
          margin-bottom: 0;
        }
        
        .importance-panel .control-group label {
          display: inline-block;
          font-weight: bold;
          margin-right: 8px;
          font-size: 12px;
          color: #555;
        }
        
        .importance-panel .control-group input,
        .importance-panel .control-group select {
          font-size: 12px;
          padding: 4px 6px;
          border: 1px solid #ddd;
          border-radius: 3px;
          margin-right: 8px;
        }
        
        .importance-panel .control-group button {
          font-size: 12px;
          padding: 4px 8px;
          border: 1px solid #ddd;
          border-radius: 3px;
          background: white;
          cursor: pointer;
          margin-right: 4px;
        }
        
        .importance-panel .control-group button:hover {
          background: #f0f0f0;
        }
        
        .importance-panel .panel-tabs {
          background: #f8f9fa;
          border-bottom: 1px solid #eee;
          padding: 8px 16px;
          overflow-x: auto;
        }
        
        .importance-panel .tab-buttons {
          display: flex;
          gap: 4px;
          white-space: nowrap;
        }
        
        .importance-panel .tab-button {
          padding: 6px 12px;
          font-size: 11px;
          border: 1px solid #ddd;
          border-radius: 4px;
          background: white;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .importance-panel .tab-button:hover {
          background: #e9ecef;
        }
        
        .importance-panel .tab-button.active {
          background: #007bff;
          color: white;
          border-color: #007bff;
        }
        
        .importance-panel .panel-content {
          flex: 1;
          overflow-y: auto;
          min-height: 200px;
        }
        
        .importance-panel .statistics-container {
          padding: 12px 16px;
          border-bottom: 1px solid #eee;
          background: #f8f9fa;
        }
        
        .importance-panel .statistics-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 8px;
        }
        
        .importance-panel .stat-item {
          text-align: center;
          padding: 8px 4px;
          border-radius: 4px;
          background: white;
          border: 1px solid #eee;
        }
        
        .importance-panel .stat-item.high { border-left: 4px solid #ff4444; }
        .importance-panel .stat-item.medium { border-left: 4px solid #ffaa00; }
        .importance-panel .stat-item.low { border-left: 4px solid #888888; }
        .importance-panel .stat-item.na { border-left: 4px solid #cccccc; }
        
        .importance-panel .stat-label {
          font-size: 10px;
          color: #666;
          margin-bottom: 2px;
        }
        
        .importance-panel .stat-value {
          font-size: 14px;
          font-weight: bold;
          color: #333;
        }
        
        .importance-panel .elements-container {
          flex: 1;
        }
        
        .importance-panel .elements-header {
          padding: 8px 16px;
          background: #f8f9fa;
          border-bottom: 1px solid #eee;
          font-size: 12px;
          color: #666;
        }
        
        .importance-panel .elements-list {
          max-height: 300px;
          overflow-y: auto;
        }
        
        .importance-panel .element-item {
          display: flex;
          align-items: center;
          padding: 8px 16px;
          border-bottom: 1px solid #f0f0f0;
          font-size: 11px;
        }
        
        .importance-panel .element-item:hover {
          background: #f8f9fa;
        }
        
        .importance-panel .element-path {
          flex: 1;
          margin-right: 12px;
          font-family: monospace;
          color: #333;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        
        .importance-panel .element-importance {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .importance-panel .importance-select {
          font-size: 10px;
          padding: 2px 4px;
          border: 1px solid #ddd;
          border-radius: 3px;
          background: white;
        }
        
        .importance-panel .importance-indicator {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          border: 1px solid #ccc;
        }
        
        .importance-panel .no-elements {
          padding: 20px;
          text-align: center;
          color: #666;
          font-style: italic;
        }
      </style>
    `;
    
    document.head.insertAdjacentHTML('beforeend', styles);
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
 * @param {HTMLElement} containerElement - パネルを配置するコンテナ
 * @returns {ImportancePanel} 初期化済みのインスタンス
 */
export function initializeImportancePanel(containerElement = document.body) {
  const panel = getImportancePanel();
  panel.initialize(containerElement);
  return panel;
}

// デフォルトエクスポート
export default ImportancePanel;
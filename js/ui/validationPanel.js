/**
 * @fileoverview ST-Bridge バリデーションパネルUI
 *
 * バリデーション結果の表示と修復オプションの選択UIを提供します。
 */

import { SEVERITY, CATEGORY, formatValidationReport } from '../validation/stbValidator.js';
import { formatRepairReport } from '../repair/stbRepairEngine.js';

/**
 * バリデーションパネルクラス
 */
export class ValidationPanel {
  /**
   * @param {HTMLElement} container - パネルを表示するコンテナ要素
   */
  constructor(container) {
    this.container = container;
    this.validationReport = null;
    this.repairReport = null;
    this.selectedIssues = new Set();
    this.onRepairCallback = null;
    this.onExportCallback = null;

    this.render();
  }

  /**
   * 初期UIを描画
   */
  render() {
    this.container.innerHTML = `
      <div class="validation-panel">
        <div class="validation-header">
          <h3>ST-Bridge バリデーション</h3>
          <div class="validation-actions">
            <button id="btn-validate" class="btn-primary">バリデーション実行</button>
            <button id="btn-repair" class="btn-secondary" disabled>自動修復</button>
            <button id="btn-export" class="btn-success" disabled>エクスポート</button>
          </div>
        </div>

        <div class="validation-summary" id="validation-summary">
          <p class="placeholder">ファイルを読み込んでバリデーションを実行してください</p>
        </div>

        <div class="validation-tabs">
          <button class="tab-btn active" data-tab="issues">問題一覧</button>
          <button class="tab-btn" data-tab="statistics">統計情報</button>
          <button class="tab-btn" data-tab="report">レポート</button>
        </div>

        <div class="validation-content">
          <div id="tab-issues" class="tab-content active">
            <div class="issues-filter">
              <label><input type="checkbox" id="filter-errors" checked> エラー</label>
              <label><input type="checkbox" id="filter-warnings" checked> 警告</label>
              <label><input type="checkbox" id="filter-info"> 情報</label>
              <label><input type="checkbox" id="filter-repairable"> 修復可能のみ</label>
            </div>
            <div id="issues-list" class="issues-list">
              <p class="placeholder">バリデーション結果がありません</p>
            </div>
          </div>

          <div id="tab-statistics" class="tab-content">
            <div id="statistics-content">
              <p class="placeholder">統計情報がありません</p>
            </div>
          </div>

          <div id="tab-report" class="tab-content">
            <pre id="report-content" class="report-content">レポートがありません</pre>
          </div>
        </div>

        <div class="repair-options" id="repair-options" style="display: none;">
          <h4>修復オプション</h4>
          <label><input type="checkbox" id="opt-remove-invalid" checked> 無効な要素を削除</label>
          <label><input type="checkbox" id="opt-use-defaults" checked> デフォルト値を使用</label>
          <label><input type="checkbox" id="opt-skip-geometry"> 幾何学修復をスキップ</label>
        </div>
      </div>
    `;

    this.bindEvents();
    this.addStyles();
  }

  /**
   * イベントをバインド
   */
  bindEvents() {
    // タブ切り替え
    const tabBtns = this.container.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    // フィルターチェックボックス
    const filterCheckboxes = this.container.querySelectorAll('.issues-filter input');
    filterCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', () => this.filterIssues());
    });

    // ボタン
    const btnValidate = this.container.querySelector('#btn-validate');
    const btnRepair = this.container.querySelector('#btn-repair');
    const btnExport = this.container.querySelector('#btn-export');

    if (btnRepair) {
      btnRepair.addEventListener('click', () => this.executeRepair());
    }

    if (btnExport) {
      btnExport.addEventListener('click', () => this.executeExport());
    }
  }

  /**
   * スタイルを追加
   */
  addStyles() {
    if (document.getElementById('validation-panel-styles')) return;

    const style = document.createElement('style');
    style.id = 'validation-panel-styles';
    style.textContent = `
      .validation-panel {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #f8f9fa;
        border-radius: 8px;
        padding: 16px;
        max-height: 600px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .validation-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }

      .validation-header h3 {
        margin: 0;
        font-size: 18px;
        color: #333;
      }

      .validation-actions button {
        margin-left: 8px;
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
      }

      .btn-primary { background: #007bff; color: white; }
      .btn-secondary { background: #6c757d; color: white; }
      .btn-success { background: #28a745; color: white; }
      .btn-primary:disabled, .btn-secondary:disabled, .btn-success:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .validation-summary {
        background: white;
        padding: 12px;
        border-radius: 4px;
        margin-bottom: 16px;
      }

      .validation-summary.valid { border-left: 4px solid #28a745; }
      .validation-summary.invalid { border-left: 4px solid #dc3545; }

      .summary-stats {
        display: flex;
        gap: 16px;
        margin-top: 8px;
      }

      .stat-item {
        font-size: 14px;
      }

      .stat-item.error { color: #dc3545; }
      .stat-item.warning { color: #ffc107; }
      .stat-item.info { color: #17a2b8; }
      .stat-item.repairable { color: #28a745; }

      .validation-tabs {
        display: flex;
        border-bottom: 1px solid #dee2e6;
        margin-bottom: 12px;
      }

      .tab-btn {
        padding: 8px 16px;
        border: none;
        background: none;
        cursor: pointer;
        font-size: 14px;
        border-bottom: 2px solid transparent;
      }

      .tab-btn.active {
        border-bottom-color: #007bff;
        color: #007bff;
      }

      .validation-content {
        flex: 1;
        overflow: hidden;
      }

      .tab-content {
        display: none;
        height: 100%;
        overflow-y: auto;
      }

      .tab-content.active {
        display: block;
      }

      .issues-filter {
        display: flex;
        gap: 16px;
        margin-bottom: 12px;
        font-size: 14px;
      }

      .issues-filter label {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .issues-list {
        max-height: 300px;
        overflow-y: auto;
      }

      .issue-item {
        background: white;
        padding: 12px;
        border-radius: 4px;
        margin-bottom: 8px;
        border-left: 4px solid;
      }

      .issue-item.error { border-left-color: #dc3545; }
      .issue-item.warning { border-left-color: #ffc107; }
      .issue-item.info { border-left-color: #17a2b8; }

      .issue-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 8px;
      }

      .issue-severity {
        font-size: 12px;
        padding: 2px 8px;
        border-radius: 4px;
        text-transform: uppercase;
      }

      .issue-severity.error { background: #f8d7da; color: #721c24; }
      .issue-severity.warning { background: #fff3cd; color: #856404; }
      .issue-severity.info { background: #d1ecf1; color: #0c5460; }

      .issue-message {
        font-size: 14px;
        color: #333;
        margin-bottom: 4px;
      }

      .issue-details {
        font-size: 12px;
        color: #666;
      }

      .issue-repair {
        font-size: 12px;
        color: #28a745;
        margin-top: 4px;
      }

      .report-content {
        background: white;
        padding: 12px;
        border-radius: 4px;
        font-size: 12px;
        max-height: 300px;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .placeholder {
        color: #999;
        font-style: italic;
        text-align: center;
        padding: 20px;
      }

      .repair-options {
        background: #e9ecef;
        padding: 12px;
        border-radius: 4px;
        margin-top: 16px;
      }

      .repair-options h4 {
        margin: 0 0 8px 0;
        font-size: 14px;
      }

      .repair-options label {
        display: block;
        font-size: 13px;
        margin: 4px 0;
      }

      #statistics-content {
        background: white;
        padding: 12px;
        border-radius: 4px;
      }

      .stat-row {
        display: flex;
        justify-content: space-between;
        padding: 4px 0;
        border-bottom: 1px solid #eee;
      }

      .stat-row:last-child {
        border-bottom: none;
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * タブを切り替え
   */
  switchTab(tabId) {
    const tabBtns = this.container.querySelectorAll('.tab-btn');
    const tabContents = this.container.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    tabContents.forEach(content => {
      content.classList.toggle('active', content.id === `tab-${tabId}`);
    });
  }

  /**
   * バリデーションレポートを設定して表示
   *
   * @param {Object} report - バリデーションレポート
   */
  setValidationReport(report) {
    this.validationReport = report;
    this.updateSummary();
    this.updateIssuesList();
    this.updateStatistics();
    this.updateReportText();

    // ボタンの有効化
    const btnRepair = this.container.querySelector('#btn-repair');
    const btnExport = this.container.querySelector('#btn-export');

    if (btnRepair) {
      btnRepair.disabled = report.statistics.repairableCount === 0;
    }
    if (btnExport) {
      btnExport.disabled = false;
    }

    // 修復オプションの表示
    const repairOptions = this.container.querySelector('#repair-options');
    if (repairOptions && report.statistics.repairableCount > 0) {
      repairOptions.style.display = 'block';
    }
  }

  /**
   * 修復レポートを設定
   *
   * @param {Object} report - 修復レポート
   */
  setRepairReport(report) {
    this.repairReport = report;
    this.updateReportText();
  }

  /**
   * サマリーを更新
   */
  updateSummary() {
    const summary = this.container.querySelector('#validation-summary');
    if (!summary || !this.validationReport) return;

    const { valid, statistics } = this.validationReport;

    summary.className = `validation-summary ${valid ? 'valid' : 'invalid'}`;
    summary.innerHTML = `
      <div class="summary-title">
        ${valid ? '✓ バリデーション成功' : '✗ 問題が検出されました'}
      </div>
      <div class="summary-stats">
        <span class="stat-item error">エラー: ${statistics.errorCount}</span>
        <span class="stat-item warning">警告: ${statistics.warningCount}</span>
        <span class="stat-item info">情報: ${statistics.infoCount}</span>
        <span class="stat-item repairable">修復可能: ${statistics.repairableCount}</span>
      </div>
    `;
  }

  /**
   * 問題一覧を更新
   */
  updateIssuesList() {
    const list = this.container.querySelector('#issues-list');
    if (!list || !this.validationReport) return;

    this.filterIssues();
  }

  /**
   * フィルターを適用して問題を表示
   */
  filterIssues() {
    const list = this.container.querySelector('#issues-list');
    if (!list || !this.validationReport) return;

    const showErrors = this.container.querySelector('#filter-errors')?.checked;
    const showWarnings = this.container.querySelector('#filter-warnings')?.checked;
    const showInfo = this.container.querySelector('#filter-info')?.checked;
    const onlyRepairable = this.container.querySelector('#filter-repairable')?.checked;

    const filteredIssues = this.validationReport.issues.filter(issue => {
      if (issue.severity === SEVERITY.ERROR && !showErrors) return false;
      if (issue.severity === SEVERITY.WARNING && !showWarnings) return false;
      if (issue.severity === SEVERITY.INFO && !showInfo) return false;
      if (onlyRepairable && !issue.repairable) return false;
      return true;
    });

    if (filteredIssues.length === 0) {
      list.innerHTML = '<p class="placeholder">表示する問題がありません</p>';
      return;
    }

    list.innerHTML = filteredIssues.map(issue => `
      <div class="issue-item ${issue.severity}">
        <div class="issue-header">
          <span class="issue-severity ${issue.severity}">${issue.severity}</span>
        </div>
        <div class="issue-message">${this.escapeHtml(issue.message)}</div>
        <div class="issue-details">
          ${issue.elementType} ${issue.elementId ? `(ID: ${issue.elementId})` : ''}
          ${issue.attribute ? `/ ${issue.attribute}` : ''}
        </div>
        ${issue.repairable && issue.repairSuggestion ? `
          <div class="issue-repair">修復提案: ${this.escapeHtml(issue.repairSuggestion)}</div>
        ` : ''}
      </div>
    `).join('');
  }

  /**
   * 統計情報を更新
   */
  updateStatistics() {
    const content = this.container.querySelector('#statistics-content');
    if (!content || !this.validationReport) return;

    const { statistics } = this.validationReport;

    let html = '<h4>要素別カウント</h4>';

    const counts = Object.entries(statistics.elementCounts);
    if (counts.length > 0) {
      html += counts.map(([type, count]) => `
        <div class="stat-row">
          <span>${type}</span>
          <span>${count}</span>
        </div>
      `).join('');
    } else {
      html += '<p>要素データがありません</p>';
    }

    html += `
      <h4 style="margin-top: 16px;">サマリー</h4>
      <div class="stat-row">
        <span>総要素数</span>
        <span>${statistics.totalElements}</span>
      </div>
      <div class="stat-row">
        <span>エラー</span>
        <span>${statistics.errorCount}</span>
      </div>
      <div class="stat-row">
        <span>警告</span>
        <span>${statistics.warningCount}</span>
      </div>
      <div class="stat-row">
        <span>情報</span>
        <span>${statistics.infoCount}</span>
      </div>
      <div class="stat-row">
        <span>修復可能</span>
        <span>${statistics.repairableCount}</span>
      </div>
    `;

    content.innerHTML = html;
  }

  /**
   * レポートテキストを更新
   */
  updateReportText() {
    const content = this.container.querySelector('#report-content');
    if (!content) return;

    let text = '';

    if (this.validationReport) {
      text += formatValidationReport(this.validationReport);
    }

    if (this.repairReport) {
      text += '\n\n' + formatRepairReport(this.repairReport);
    }

    content.textContent = text || 'レポートがありません';
  }

  /**
   * 修復を実行
   */
  executeRepair() {
    if (!this.onRepairCallback) {
      console.warn('Repair callback not set');
      return;
    }

    const options = {
      removeInvalid: this.container.querySelector('#opt-remove-invalid')?.checked,
      useDefaults: this.container.querySelector('#opt-use-defaults')?.checked,
      skipCategories: this.container.querySelector('#opt-skip-geometry')?.checked
        ? [CATEGORY.GEOMETRY]
        : []
    };

    this.onRepairCallback(options);
  }

  /**
   * エクスポートを実行
   */
  executeExport() {
    if (!this.onExportCallback) {
      console.warn('Export callback not set');
      return;
    }

    this.onExportCallback();
  }

  /**
   * 修復コールバックを設定
   *
   * @param {Function} callback - コールバック関数
   */
  onRepair(callback) {
    this.onRepairCallback = callback;
  }

  /**
   * エクスポートコールバックを設定
   *
   * @param {Function} callback - コールバック関数
   */
  onExport(callback) {
    this.onExportCallback = callback;
  }

  /**
   * HTMLエスケープ
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * パネルをクリア
   */
  clear() {
    this.validationReport = null;
    this.repairReport = null;
    this.selectedIssues.clear();

    const summary = this.container.querySelector('#validation-summary');
    if (summary) {
      summary.className = 'validation-summary';
      summary.innerHTML = '<p class="placeholder">ファイルを読み込んでバリデーションを実行してください</p>';
    }

    const list = this.container.querySelector('#issues-list');
    if (list) {
      list.innerHTML = '<p class="placeholder">バリデーション結果がありません</p>';
    }

    const stats = this.container.querySelector('#statistics-content');
    if (stats) {
      stats.innerHTML = '<p class="placeholder">統計情報がありません</p>';
    }

    const report = this.container.querySelector('#report-content');
    if (report) {
      report.textContent = 'レポートがありません';
    }

    const btnRepair = this.container.querySelector('#btn-repair');
    const btnExport = this.container.querySelector('#btn-export');
    if (btnRepair) btnRepair.disabled = true;
    if (btnExport) btnExport.disabled = true;

    const repairOptions = this.container.querySelector('#repair-options');
    if (repairOptions) repairOptions.style.display = 'none';
  }
}

/**
 * バリデーションパネルを作成
 *
 * @param {string|HTMLElement} container - コンテナ要素またはセレクタ
 * @returns {ValidationPanel} パネルインスタンス
 */
export function createValidationPanel(container) {
  const element = typeof container === 'string'
    ? document.querySelector(container)
    : container;

  if (!element) {
    throw new Error('Container element not found');
  }

  return new ValidationPanel(element);
}

export default ValidationPanel;

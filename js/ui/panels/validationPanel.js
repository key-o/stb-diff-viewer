/**
 * @fileoverview ST-Bridge バリデーションパネルUI
 *
 * バリデーション結果の表示と修復オプションの選択UIを提供します。
 */

import { validationController } from '../../app/controllers/validationController.js';
import { createLogger } from '../../utils/logger.js';
import { downloadBlob } from '../../utils/downloadHelper.js';

/**
 * 指定タグの要素を生成し、クラス・属性・子ノードを一括設定するヘルパー
 * @param {string} tag
 * @param {{className?: string, id?: string, text?: string, attrs?: Object<string, string>, children?: Array<Node|string>}} [opts]
 * @returns {HTMLElement}
 */
function el(tag, opts = {}) {
  const node = document.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.id) node.id = opts.id;
  if (opts.text != null) node.textContent = opts.text;
  if (opts.attrs) {
    for (const [key, value] of Object.entries(opts.attrs)) {
      node.setAttribute(key, value);
    }
  }
  if (opts.children) {
    for (const child of opts.children) {
      if (child == null) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
  }
  return node;
}

/**
 * `<label><input type="checkbox" id=...> ラベルテキスト</label>` を生成
 */
function checkboxLabel({ id, labelText, checked = false }) {
  const input = el('input', { id, attrs: { type: 'checkbox' } });
  if (checked) input.checked = true;
  return el('label', { children: [input, ` ${labelText}`] });
}

/**
 * `<label>ラベルテキスト<select>...</select></label>` を生成
 */
function selectLabel({ id, labelText, options }) {
  const select = el('select', { id });
  for (const [value, text] of options) {
    const option = el('option', { text, attrs: { value } });
    select.appendChild(option);
  }
  return el('label', { children: [`${labelText} `, select] });
}

const log = createLogger('ui:panels:validationPanel');

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
    this.onValidateCallback = null;
    this.onRepairCallback = null;
    this.onExportCallback = null;

    this.render();
  }

  /**
   * 初期UIを描画
   */
  render() {
    const header = el('div', {
      className: 'validation-header',
      children: [
        el('h3', { text: 'ST-Bridge バリデーション' }),
        el('div', {
          className: 'validation-actions',
          children: [
            el('button', {
              id: 'btn-validate',
              className: 'btn-primary',
              text: 'バリデーション実行',
            }),
            (() => {
              const b = el('button', {
                id: 'btn-repair',
                className: 'btn-secondary',
                text: '自動修復',
              });
              b.disabled = true;
              return b;
            })(),
            (() => {
              const b = el('button', {
                id: 'btn-export',
                className: 'btn-success',
                text: 'エクスポート',
              });
              b.disabled = true;
              return b;
            })(),
          ],
        }),
      ],
    });

    const options = el('div', {
      className: 'validation-options',
      children: [
        selectLabel({
          id: 'validation-target-model',
          labelText: '対象モデル',
          options: [
            ['auto', '自動（モデルA優先）'],
            ['A', 'モデルA'],
            ['B', 'モデルB'],
          ],
        }),
        checkboxLabel({ id: 'validation-opt-references', labelText: '参照整合性', checked: true }),
        checkboxLabel({ id: 'validation-opt-geometry', labelText: '幾何チェック', checked: true }),
        checkboxLabel({ id: 'validation-opt-include-info', labelText: '情報レベルを含める' }),
        selectLabel({
          id: 'validation-opt-mvd-level',
          labelText: 'MVDレベル',
          options: [
            ['', 'なし'],
            ['s2', 'S2（基本）'],
            ['s4', 'S4（詳細）'],
          ],
        }),
      ],
    });

    const summary = el('div', {
      id: 'validation-summary',
      className: 'validation-summary',
      children: [
        el('p', {
          className: 'placeholder',
          text: 'ファイルを読み込んでバリデーションを実行してください',
        }),
      ],
    });

    const tabs = el('div', {
      className: 'validation-tabs',
      children: [
        el('button', {
          className: 'tab-btn active',
          text: '問題一覧',
          attrs: { 'data-tab': 'issues' },
        }),
        el('button', {
          className: 'tab-btn',
          text: '統計情報',
          attrs: { 'data-tab': 'statistics' },
        }),
        el('button', { className: 'tab-btn', text: 'レポート', attrs: { 'data-tab': 'report' } }),
      ],
    });

    const issuesTab = el('div', {
      id: 'tab-issues',
      className: 'tab-content active',
      children: [
        el('div', {
          className: 'issues-filter',
          children: [
            checkboxLabel({ id: 'filter-errors', labelText: 'エラー', checked: true }),
            checkboxLabel({ id: 'filter-warnings', labelText: '警告', checked: true }),
            checkboxLabel({ id: 'filter-info', labelText: '情報' }),
            checkboxLabel({ id: 'filter-repairable', labelText: '修復可能のみ' }),
          ],
        }),
        el('div', {
          id: 'issues-list',
          className: 'issues-list',
          children: [el('p', { className: 'placeholder', text: 'バリデーション結果がありません' })],
        }),
      ],
    });

    const statsTab = el('div', {
      id: 'tab-statistics',
      className: 'tab-content',
      children: [
        el('div', {
          id: 'statistics-content',
          children: [el('p', { className: 'placeholder', text: '統計情報がありません' })],
        }),
      ],
    });

    const reportTab = el('div', {
      id: 'tab-report',
      className: 'tab-content',
      children: [
        el('div', {
          className: 'report-actions',
          children: [
            (() => {
              const b = el('button', {
                id: 'btn-download-report',
                className: 'btn-secondary',
                text: 'テキストダウンロード',
              });
              b.disabled = true;
              return b;
            })(),
          ],
        }),
        el('pre', {
          id: 'report-content',
          className: 'report-content',
          text: 'レポートがありません',
        }),
      ],
    });

    const content = el('div', {
      className: 'validation-content',
      children: [issuesTab, statsTab, reportTab],
    });

    const repairOptions = el('div', {
      id: 'repair-options',
      className: 'repair-options',
      children: [
        el('h4', { text: '修復オプション' }),
        checkboxLabel({ id: 'opt-remove-invalid', labelText: '無効な要素を削除', checked: true }),
        checkboxLabel({ id: 'opt-use-defaults', labelText: 'デフォルト値を使用', checked: true }),
        checkboxLabel({ id: 'opt-skip-geometry', labelText: '幾何学修復をスキップ' }),
      ],
    });
    repairOptions.style.display = 'none';

    const panel = el('div', {
      className: 'validation-panel',
      children: [header, options, summary, tabs, content, repairOptions],
    });

    this.container.replaceChildren(panel);

    this.bindEvents();
    this.addStyles();
  }

  /**
   * イベントをバインド
   */
  bindEvents() {
    // タブ切り替え
    const tabBtns = this.container.querySelectorAll('.tab-btn');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    // フィルターチェックボックス
    const filterCheckboxes = this.container.querySelectorAll('.issues-filter input');
    filterCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener('change', () => this.filterIssues());
    });

    // ボタン
    const btnValidate = this.container.querySelector('#btn-validate');
    const btnRepair = this.container.querySelector('#btn-repair');
    const btnExport = this.container.querySelector('#btn-export');

    if (btnValidate) {
      btnValidate.addEventListener('click', () => this.executeValidate());
    }

    if (btnRepair) {
      btnRepair.addEventListener('click', () => this.executeRepair());
    }

    if (btnExport) {
      btnExport.addEventListener('click', () => this.executeExport());
    }

    const btnDownloadReport = this.container.querySelector('#btn-download-report');
    if (btnDownloadReport) {
      btnDownloadReport.addEventListener('click', () => this.downloadReport());
    }
  }

  /**
   * スタイルを追加する
   * 注: スタイルは style/components/validation-panel.css に外部化されました
   */
  addStyles() {
    // スタイルは validation-panel.css で定義（index.html でリンク済み）
  }

  /**
   * タブを切り替え
   */
  switchTab(tabId) {
    const tabBtns = this.container.querySelectorAll('.tab-btn');
    const tabContents = this.container.querySelectorAll('.tab-content');

    tabBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    tabContents.forEach((content) => {
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

    const btnDownloadReport = this.container.querySelector('#btn-download-report');
    if (btnDownloadReport) {
      btnDownloadReport.disabled = false;
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
    summary.replaceChildren(
      el('div', {
        className: 'summary-title',
        text: valid ? '✓ バリデーション成功' : '✗ 問題が検出されました',
      }),
      el('div', {
        className: 'summary-stats',
        children: [
          el('span', { className: 'stat-item error', text: `エラー: ${statistics.errorCount}` }),
          el('span', { className: 'stat-item warning', text: `警告: ${statistics.warningCount}` }),
          el('span', { className: 'stat-item info', text: `情報: ${statistics.infoCount}` }),
          el('span', {
            className: 'stat-item repairable',
            text: `修復可能: ${statistics.repairableCount}`,
          }),
        ],
      }),
    );
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

    const filteredIssues = this.validationReport.issues.filter((issue) => {
      // 「修復可能のみ」が有効な場合は重大度フィルターを無視し、修復可能な問題のみ表示
      if (onlyRepairable) {
        return !!issue.repairable;
      }
      if (issue.severity === validationController.SEVERITY.ERROR && !showErrors) return false;
      if (issue.severity === validationController.SEVERITY.WARNING && !showWarnings) return false;
      if (issue.severity === validationController.SEVERITY.INFO && !showInfo) return false;
      return true;
    });

    if (filteredIssues.length === 0) {
      list.replaceChildren(el('p', { className: 'placeholder', text: '表示する問題がありません' }));
      return;
    }

    const items = filteredIssues.map((issue) => this._buildIssueItem(issue));
    list.replaceChildren(...items);
  }

  /**
   * 単一の issue 項目を DOM として構築
   * @private
   */
  _buildIssueItem(issue) {
    const header = el('div', {
      className: 'issue-header',
      children: [
        el('span', { className: `issue-severity ${issue.severity}`, text: String(issue.severity) }),
      ],
    });

    const message = el('div', { className: 'issue-message', text: String(issue.message ?? '') });

    const detailsChildren = [];
    const elementTypeText = issue.elementType ? String(issue.elementType) : '';
    const elementIdSuffix = issue.elementId ? ` (ID: ${issue.elementId})` : '';
    const attributeSuffix = issue.attribute ? ` / ${issue.attribute}` : '';
    detailsChildren.push(
      document.createTextNode(`${elementTypeText}${elementIdSuffix}${attributeSuffix}`),
    );

    const xpathValue = issue.idXPath || issue.xpath;
    if (xpathValue) {
      detailsChildren.push(el('div', { className: 'issue-xpath', text: `XPath: ${xpathValue}` }));
    }

    const children = [
      header,
      message,
      el('div', { className: 'issue-details', children: detailsChildren }),
    ];

    if (issue.repairable && issue.repairSuggestion) {
      children.push(
        el('div', { className: 'issue-repair', text: `修復提案: ${issue.repairSuggestion}` }),
      );
    }

    return el('div', { className: `issue-item ${issue.severity}`, children });
  }

  /**
   * 統計情報を更新
   */
  updateStatistics() {
    const content = this.container.querySelector('#statistics-content');
    if (!content || !this.validationReport) return;

    const { statistics } = this.validationReport;
    const nodes = [el('h4', { text: '要素別カウント' })];

    const counts = Object.entries(statistics.elementCounts);
    if (counts.length > 0) {
      for (const [type, count] of counts) {
        nodes.push(this._buildStatRow(String(type), String(count)));
      }
    } else {
      nodes.push(el('p', { text: '要素データがありません' }));
    }

    const summaryHeading = el('h4', { text: 'サマリー' });
    summaryHeading.style.marginTop = '16px';
    nodes.push(
      summaryHeading,
      this._buildStatRow('総要素数', String(statistics.totalElements)),
      this._buildStatRow('エラー', String(statistics.errorCount)),
      this._buildStatRow('警告', String(statistics.warningCount)),
      this._buildStatRow('情報', String(statistics.infoCount)),
      this._buildStatRow('修復可能', String(statistics.repairableCount)),
    );

    content.replaceChildren(...nodes);
  }

  /**
   * @private
   */
  _buildStatRow(label, value) {
    return el('div', {
      className: 'stat-row',
      children: [el('span', { text: label }), el('span', { text: value })],
    });
  }

  /**
   * レポートテキストを更新
   */
  updateReportText() {
    const content = this.container.querySelector('#report-content');
    if (!content) return;

    let text = '';

    if (this.validationReport) {
      text += validationController.formatValidationReport(this.validationReport);
    }

    if (this.repairReport) {
      text += '\n\n' + validationController.formatRepairReport(this.repairReport);
    }

    content.textContent = text || 'レポートがありません';
  }

  /**
   * 修復を実行
   */
  executeValidate() {
    if (!this.onValidateCallback) {
      log.warn('Validate callback not set');
      return;
    }

    this.onValidateCallback(this.getValidationRequest());
  }

  executeRepair() {
    if (!this.onRepairCallback) {
      log.warn('Repair callback not set');
      return;
    }

    const options = {
      removeInvalid: this.container.querySelector('#opt-remove-invalid')?.checked,
      useDefaults: this.container.querySelector('#opt-use-defaults')?.checked,
      skipCategories: this.container.querySelector('#opt-skip-geometry')?.checked
        ? [validationController.CATEGORY.GEOMETRY]
        : [],
    };

    this.onRepairCallback(options);
  }

  /**
   * エクスポートを実行
   */
  executeExport() {
    if (!this.onExportCallback) {
      log.warn('Export callback not set');
      return;
    }

    this.onExportCallback();
  }

  /**
   * レポートをテキストファイルとしてダウンロード
   */
  downloadReport() {
    const content = this.container.querySelector('#report-content');
    const text = content?.textContent || '';
    if (!text || text === 'レポートがありません') {
      log.warn('ダウンロードできるレポートがありません');
      return;
    }

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadBlob(blob, `validation-report-${timestamp}.txt`);
  }

  /**
   * 修復コールバックを設定
   *
   * @param {Function} callback - コールバック関数
   */
  onRepair(callback) {
    this.onRepairCallback = callback;
  }

  onValidate(callback) {
    this.onValidateCallback = callback;
  }

  /**
   * エクスポートコールバックを設定
   *
   * @param {Function} callback - コールバック関数
   */
  onExport(callback) {
    this.onExportCallback = callback;
  }

  getValidationRequest() {
    const targetModel = this.container.querySelector('#validation-target-model')?.value || 'auto';
    const validateReferences =
      this.container.querySelector('#validation-opt-references')?.checked !== false;
    const validateGeometry =
      this.container.querySelector('#validation-opt-geometry')?.checked !== false;
    const includeInfo =
      this.container.querySelector('#validation-opt-include-info')?.checked === true;
    const mvdLevel = this.container.querySelector('#validation-opt-mvd-level')?.value || null;

    return {
      targetModel,
      options: {
        validateReferences,
        validateGeometry,
        includeInfo,
        mvdLevel: mvdLevel || null,
      },
    };
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
      summary.replaceChildren(
        el('p', {
          className: 'placeholder',
          text: 'ファイルを読み込んでバリデーションを実行してください',
        }),
      );
    }

    const list = this.container.querySelector('#issues-list');
    if (list) {
      list.replaceChildren(
        el('p', { className: 'placeholder', text: 'バリデーション結果がありません' }),
      );
    }

    const stats = this.container.querySelector('#statistics-content');
    if (stats) {
      stats.replaceChildren(el('p', { className: 'placeholder', text: '統計情報がありません' }));
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
  const element = typeof container === 'string' ? document.querySelector(container) : container;

  if (!element) {
    throw new Error('Container element not found');
  }

  return new ValidationPanel(element);
}

export default ValidationPanel;

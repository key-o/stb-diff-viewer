/**
 * @fileoverview ST-Bridge バリデーション・修復・出力ワークフロー
 *
 * ST-Bridgeファイルの完全な処理パイプラインを提供します:
 * 1. ファイル読み込み
 * 2. バリデーション
 * 3. 修復提案の生成
 * 4. 修復の実行
 * 5. 修復済みファイルの出力
 */

/* global XMLSerializer */

import { loadStbXmlAutoEncoding } from '../viewer/loader/stbXmlLoader.js';
import { validateStbDocument, formatValidationReport } from './stbValidator.js';
import { formatRepairReport, autoRepairDocument } from '../repair/stbRepairEngine.js';

/**
 * ワークフローステップ
 */
export const WORKFLOW_STEP = {
  IDLE: 'idle',
  LOADING: 'loading',
  VALIDATING: 'validating',
  VALIDATED: 'validated',
  REPAIRING: 'repairing',
  REPAIRED: 'repaired',
  EXPORTING: 'exporting',
  COMPLETED: 'completed',
  ERROR: 'error',
};

/**
 * ワークフロー状態
 * @typedef {Object} WorkflowState
 * @property {string} step - 現在のステップ
 * @property {Document} originalDocument - 元のXMLドキュメント
 * @property {Document} repairedDocument - 修復済みドキュメント
 * @property {Object} validationReport - バリデーションレポート
 * @property {Object} repairReport - 修復レポート
 * @property {string} error - エラーメッセージ
 * @property {Object} options - ワークフローオプション
 */

/**
 * バリデーション・修復ワークフロークラス
 */
export class ValidationWorkflow {
  constructor() {
    this.state = {
      step: WORKFLOW_STEP.IDLE,
      originalDocument: null,
      repairedDocument: null,
      validationReport: null,
      repairReport: null,
      error: null,
      options: {},
    };

    this.listeners = [];
  }

  /**
   * 状態変更リスナーを追加
   *
   * @param {Function} listener - コールバック関数
   */
  addListener(listener) {
    this.listeners.push(listener);
  }

  /**
   * 状態変更リスナーを削除
   *
   * @param {Function} listener - コールバック関数
   */
  removeListener(listener) {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  /**
   * 状態変更を通知
   */
  notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener({ ...this.state });
      } catch (e) {
        console.error('Listener error:', e);
      }
    }
  }

  /**
   * 状態を更新
   *
   * @param {Object} updates - 更新内容
   */
  updateState(updates) {
    this.state = { ...this.state, ...updates };
    this.notifyListeners();
  }

  /**
   * ワークフローをリセット
   */
  reset() {
    this.state = {
      step: WORKFLOW_STEP.IDLE,
      originalDocument: null,
      repairedDocument: null,
      validationReport: null,
      repairReport: null,
      error: null,
      options: {},
    };
    this.notifyListeners();
  }

  /**
   * ファイルを読み込んでバリデーション
   *
   * @param {File} file - 読み込むファイル
   * @param {Object} options - バリデーションオプション
   * @returns {Promise<Object>} バリデーションレポート
   */
  async loadAndValidate(file, options = {}) {
    try {
      // 読み込みステップ
      this.updateState({
        step: WORKFLOW_STEP.LOADING,
        error: null,
        options,
      });

      const xmlDoc = await loadStbXmlAutoEncoding(file);

      this.updateState({
        originalDocument: xmlDoc,
      });

      // バリデーションステップ
      this.updateState({
        step: WORKFLOW_STEP.VALIDATING,
      });

      const validationReport = validateStbDocument(xmlDoc, {
        validateReferences: options.validateReferences !== false,
        validateGeometry: options.validateGeometry !== false,
        includeInfo: options.includeInfo || false,
      });

      this.updateState({
        step: WORKFLOW_STEP.VALIDATED,
        validationReport,
      });

      return validationReport;
    } catch (e) {
      this.updateState({
        step: WORKFLOW_STEP.ERROR,
        error: e.message,
      });
      throw e;
    }
  }

  /**
   * XMLドキュメントを直接バリデーション
   *
   * @param {Document} xmlDoc - バリデーション対象
   * @param {Object} options - バリデーションオプション
   * @returns {Object} バリデーションレポート
   */
  validateDocument(xmlDoc, options = {}) {
    try {
      this.updateState({
        step: WORKFLOW_STEP.VALIDATING,
        originalDocument: xmlDoc,
        error: null,
        options,
      });

      const validationReport = validateStbDocument(xmlDoc, {
        validateReferences: options.validateReferences !== false,
        validateGeometry: options.validateGeometry !== false,
        includeInfo: options.includeInfo || false,
      });

      this.updateState({
        step: WORKFLOW_STEP.VALIDATED,
        validationReport,
      });

      return validationReport;
    } catch (e) {
      this.updateState({
        step: WORKFLOW_STEP.ERROR,
        error: e.message,
      });
      throw e;
    }
  }

  /**
   * 自動修復を実行
   *
   * @param {Object} repairOptions - 修復オプション
   * @returns {Object} 修復レポート
   */
  executeAutoRepair(repairOptions = {}) {
    if (!this.state.originalDocument || !this.state.validationReport) {
      throw new Error('バリデーションが完了していません');
    }

    try {
      this.updateState({
        step: WORKFLOW_STEP.REPAIRING,
      });

      // ドキュメントをクローン
      const docClone = this.state.originalDocument.cloneNode(true);

      const { document: repairedDoc, report } = autoRepairDocument(
        docClone,
        this.state.validationReport,
        {
          removeInvalid: repairOptions.removeInvalid !== false,
          useDefaults: repairOptions.useDefaults !== false,
          skipCategories: repairOptions.skipCategories || [],
        },
      );

      this.updateState({
        step: WORKFLOW_STEP.REPAIRED,
        repairedDocument: repairedDoc,
        repairReport: report,
      });

      return report;
    } catch (e) {
      this.updateState({
        step: WORKFLOW_STEP.ERROR,
        error: e.message,
      });
      throw e;
    }
  }

  /**
   * 修復済みドキュメントを再バリデーション
   *
   * @returns {Object} 新しいバリデーションレポート
   */
  revalidateRepaired() {
    if (!this.state.repairedDocument) {
      throw new Error('修復が完了していません');
    }

    const report = validateStbDocument(this.state.repairedDocument, {
      validateReferences: true,
      validateGeometry: true,
      includeInfo: false,
    });

    return report;
  }

  /**
   * 修復済みドキュメントをXML文字列として取得
   *
   * @param {Object} options - 出力オプション
   * @returns {string} XML文字列
   */
  getRepairedXmlString(options = {}) {
    const doc = this.state.repairedDocument || this.state.originalDocument;
    if (!doc) {
      throw new Error('ドキュメントがありません');
    }

    const serializer = new XMLSerializer();
    let xmlString = serializer.serializeToString(doc);

    // フォーマット
    if (options.format !== false) {
      xmlString = formatXml(xmlString);
    }

    return xmlString;
  }

  /**
   * 修復済みドキュメントをファイルとしてダウンロード
   *
   * @param {string} filename - ファイル名
   * @param {Object} options - 出力オプション
   */
  downloadRepairedFile(filename, options = {}) {
    this.updateState({
      step: WORKFLOW_STEP.EXPORTING,
    });

    try {
      const xmlString = this.getRepairedXmlString(options);

      // ファイル名の確保
      if (!filename.endsWith('.stb')) {
        filename += '.stb';
      }

      // Blobを作成してダウンロード
      const blob = new Blob([xmlString], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);

      this.updateState({
        step: WORKFLOW_STEP.COMPLETED,
      });
    } catch (e) {
      this.updateState({
        step: WORKFLOW_STEP.ERROR,
        error: e.message,
      });
      throw e;
    }
  }

  /**
   * 現在の状態を取得
   *
   * @returns {WorkflowState} 現在の状態
   */
  getState() {
    return { ...this.state };
  }

  /**
   * バリデーションレポートのサマリーを取得
   *
   * @returns {Object} サマリー情報
   */
  getValidationSummary() {
    if (!this.state.validationReport) {
      return null;
    }

    const report = this.state.validationReport;
    return {
      valid: report.valid,
      errorCount: report.statistics.errorCount,
      warningCount: report.statistics.warningCount,
      repairableCount: report.statistics.repairableCount,
      totalElements: report.statistics.totalElements,
    };
  }

  /**
   * 修復レポートのサマリーを取得
   *
   * @returns {Object} サマリー情報
   */
  getRepairSummary() {
    if (!this.state.repairReport) {
      return null;
    }

    const report = this.state.repairReport;
    return {
      totalRepairs: report.totalRepairs,
      successCount: report.successCount,
      failureCount: report.failureCount,
      removedCount: report.removedElements.length,
    };
  }

  /**
   * 修復提案を取得
   *
   * @returns {Object[]} 修復提案の配列
   */
  getRepairSuggestions() {
    if (!this.state.validationReport) {
      return [];
    }

    return this.state.validationReport.issues
      .filter((issue) => issue.repairable)
      .map((issue) => ({
        elementType: issue.elementType,
        elementId: issue.elementId,
        attribute: issue.attribute,
        currentValue: issue.value,
        suggestion: issue.repairSuggestion,
        severity: issue.severity,
        message: issue.message,
      }));
  }
}

/**
 * XMLをフォーマット（インデント付き）
 *
 * @param {string} xmlString - 元のXML文字列
 * @returns {string} フォーマットされたXML文字列
 */
function formatXml(xmlString) {
  // XML宣言の追加（存在しない場合）
  if (!xmlString.startsWith('<?xml')) {
    xmlString = '<?xml version="1.0" encoding="UTF-8"?>\n' + xmlString;
  }

  // シンプルなインデント処理
  let formatted = '';
  let indent = 0;
  const lines = xmlString.replace(/>\s*</g, '>\n<').split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 終了タグでインデント減少
    if (trimmed.startsWith('</')) {
      indent = Math.max(0, indent - 1);
    }

    formatted += '  '.repeat(indent) + trimmed + '\n';

    // 開始タグでインデント増加（自己終了タグを除く）
    if (
      trimmed.startsWith('<') &&
      !trimmed.startsWith('</') &&
      !trimmed.startsWith('<?') &&
      !trimmed.endsWith('/>') &&
      !trimmed.includes('</')
    ) {
      indent++;
    }
  }

  return formatted;
}

/**
 * 完全なワークフローを実行（便利関数）
 *
 * @param {File} file - 入力ファイル
 * @param {Object} options - オプション
 * @returns {Promise<Object>} 結果 { validationReport, repairReport, xmlString }
 */
export async function runCompleteWorkflow(file, options = {}) {
  const workflow = new ValidationWorkflow();

  // バリデーション
  const validationReport = await workflow.loadAndValidate(file, options);

  // 修復が必要な場合
  let repairReport = null;
  let xmlString = null;

  if (!validationReport.valid && options.autoRepair !== false) {
    repairReport = workflow.executeAutoRepair(options);
    xmlString = workflow.getRepairedXmlString();

    // 修復後の再バリデーション
    const revalidation = workflow.revalidateRepaired();
    repairReport.revalidation = revalidation;
  } else {
    xmlString = workflow.getRepairedXmlString();
  }

  return {
    validationReport,
    repairReport,
    xmlString,
    workflow,
  };
}

/**
 * バリデーションと修復の統合レポートを生成
 *
 * @param {ValidationWorkflow} workflow - ワークフローインスタンス
 * @returns {string} 統合レポート
 */
export function generateIntegratedReport(workflow) {
  const state = workflow.getState();
  const lines = [];

  lines.push('='.repeat(70));
  lines.push('ST-Bridge バリデーション & 修復 統合レポート');
  lines.push('='.repeat(70));
  lines.push('');

  // バリデーションレポート
  if (state.validationReport) {
    lines.push(formatValidationReport(state.validationReport));
    lines.push('');
  }

  // 修復レポート
  if (state.repairReport) {
    lines.push(formatRepairReport(state.repairReport));
    lines.push('');
  }

  // 最終ステータス
  lines.push('--- 最終ステータス ---');
  lines.push(`ワークフローステップ: ${state.step}`);

  if (state.error) {
    lines.push(`エラー: ${state.error}`);
  }

  const summary = workflow.getValidationSummary();
  if (summary) {
    lines.push(`データ有効性: ${summary.valid ? '有効' : '要修正'}`);
    lines.push(`修復可能な問題: ${summary.repairableCount}`);
  }

  const repairSummary = workflow.getRepairSummary();
  if (repairSummary) {
    lines.push(`実行した修復: ${repairSummary.totalRepairs}`);
    lines.push(`成功した修復: ${repairSummary.successCount}`);
  }

  lines.push('');
  lines.push('='.repeat(70));

  return lines.join('\n');
}

// デフォルトエクスポート
export default ValidationWorkflow;

/**
 * @fileoverview ST-Bridge バリデーション・修復システム エントリーポイント
 *
 * ST-Bridgeファイルのバリデーション、修復、出力機能を提供します。
 *
 * 主な機能:
 * - validateStbDocument: ドキュメント全体のバリデーション
 * - StbRepairEngine: データ修復エンジン
 * - ValidationWorkflow: 完全なワークフロー管理
 * - ValidationPanel: UI コンポーネント
 * - exportValidatedStb: バリデート済みデータのエクスポート
 */

// バリデーションエンジン
export {
  validateStbDocument,
  formatValidationReport,
  getRepairableIssues,
  getIssuesByCategory,
  getIssuesByElementType,
  SEVERITY,
  CATEGORY
} from './stbValidator.js';

// 修復エンジン
export {
  StbRepairEngine,
  formatRepairReport,
  autoRepairDocument,
  REPAIR_ACTION
} from '../repair/stbRepairEngine.js';

// ワークフロー
export {
  ValidationWorkflow,
  runCompleteWorkflow,
  generateIntegratedReport,
  WORKFLOW_STEP
} from './validationWorkflow.js';

// エクスポート機能
export {
  exportValidatedStb,
  validateRepairAndExport,
  createExportConfig,
  getExportSummary
} from '../exporter/stbExporter.js';

// UIコンポーネント
export {
  ValidationPanel,
  createValidationPanel
} from '../ui/validationPanel.js';

// UI連携
export {
  validateAndIntegrate,
  getElementValidation,
  getSectionValidation,
  getLastValidationResult,
  clearValidationData,
  generateValidationInfoHtml,
  generateValidationSummaryHtml,
  getValidationStyles,
  SUGGESTION_TYPE
} from './validationIntegration.js';

/**
 * 簡単使用のためのユーティリティ関数
 */

/**
 * ファイルを読み込んでバリデーション・修復・エクスポートを一括実行
 *
 * @param {File} file - ST-Bridgeファイル
 * @param {Object} options - オプション
 * @returns {Promise<Object>} 処理結果
 *
 * @example
 * const result = await processStbFile(file, {
 *   autoRepair: true,
 *   exportFilename: 'validated.stb',
 * });
 * console.log(result.validationReport);
 */
export async function processStbFile(file, options = {}) {
  const { runCompleteWorkflow } = await import('./validationWorkflow.js');
  return runCompleteWorkflow(file, options);
}

/**
 * XMLドキュメントをバリデーションして問題を報告
 *
 * @param {Document} xmlDoc - XMLドキュメント
 * @param {Object} options - オプション
 * @returns {Object} バリデーションレポート
 *
 * @example
 * const report = quickValidate(xmlDoc);
 * if (!report.valid) {
 *   console.log('問題が検出されました:', report.statistics.errorCount);
 * }
 */
export function quickValidate(xmlDoc, options = {}) {
  const { validateStbDocument } = require('./stbValidator.js');
  return validateStbDocument(xmlDoc, {
    validateReferences: true,
    validateGeometry: true,
    ...options
  });
}

/**
 * ドキュメントを自動修復して結果を返す
 *
 * @param {Document} xmlDoc - 元のXMLドキュメント
 * @param {Object} options - 修復オプション
 * @returns {Object} { document, validationReport, repairReport }
 *
 * @example
 * const result = quickRepair(xmlDoc);
 * console.log('修復数:', result.repairReport.totalRepairs);
 * downloadXml(result.document); // 修復済みドキュメント
 */
export function quickRepair(xmlDoc, options = {}) {
  const { validateStbDocument } = require('./stbValidator.js');
  const { autoRepairDocument } = require('../repair/stbRepairEngine.js');

  // バリデーション
  const validationReport = validateStbDocument(xmlDoc);

  // 修復
  const { document: repairedDoc, report: repairReport } = autoRepairDocument(
    xmlDoc.cloneNode(true),
    validationReport,
    options
  );

  // 再バリデーション
  const revalidation = validateStbDocument(repairedDoc);

  return {
    document: repairedDoc,
    validationReport,
    repairReport,
    revalidation
  };
}

/**
 * コンソールにバリデーションサマリーを表示
 *
 * @param {Object} report - バリデーションレポート
 */
export function logValidationSummary(report) {
  console.log('--- ST-Bridge Validation Summary ---');
  console.log(`Valid: ${report.valid ? 'Yes' : 'No'}`);
  console.log(`Errors: ${report.statistics.errorCount}`);
  console.log(`Warnings: ${report.statistics.warningCount}`);
  console.log(`Repairable: ${report.statistics.repairableCount}`);
  console.log(`Total Elements: ${report.statistics.totalElements}`);

  if (report.statistics.errorCount > 0) {
    console.log('\nTop Errors:');
    report.issues
      .filter(i => i.severity === 'error')
      .slice(0, 5)
      .forEach(issue => {
        console.log(`  - ${issue.message}`);
      });
  }
}

// デフォルトエクスポート
export default {
  validateStbDocument,
  StbRepairEngine,
  ValidationWorkflow,
  ValidationPanel,
  processStbFile,
  quickValidate,
  quickRepair,
  logValidationSummary
};

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
  CATEGORY,
} from './stbValidator.js';

// 修復エンジン
export {
  StbRepairEngine,
  formatRepairReport,
  autoRepairDocument,
  REPAIR_ACTION,
} from '../repair/stbRepairEngine.js';

// ワークフロー
export {
  ValidationWorkflow,
  runCompleteWorkflow,
  generateIntegratedReport,
  WORKFLOW_STEP,
} from './validationWorkflow.js';

// エクスポート機能
export {
  exportValidatedStb,
  validateRepairAndExport,
  createExportConfig,
  getExportSummary,
} from '../export/stb/stbExporter.js';

// UIコンポーネント
export { ValidationPanel, createValidationPanel } from '../ui/validationPanel.js';

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
  SUGGESTION_TYPE,
} from './validationIntegration.js';

// ユーティリティ関数
export { quickValidate, quickRepair, logValidationSummary } from './validationUtils.js';

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

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
  logValidationSummary,
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

// ワークフロー管理＆統合
export {
  ValidationManager,
  ValidationManager as ValidationWorkflow, // 後方互換性エイリアス
  runCompleteWorkflow,
  generateIntegratedReport,
  quickRepair,
  WORKFLOW_STEP,
  SUGGESTION_TYPE,
} from './validationManager.js';

// 重要度設定検証
export {
  validateImportanceSettings,
  VALID_IMPORTANCE_LEVELS,
  IMPORTANCE_LEVEL_NAMES,
} from './importanceValidation.js';

// エクスポート機能
export {
  exportValidatedStb,
  validateRepairAndExport,
  createExportConfig,
  getExportSummary,
} from '../export/stb/stbExporter.js';

// UIコンポーネント
export { ValidationPanel, createValidationPanel } from '../ui/panels/validationPanel.js';

// UI連携 (ValidationManager経由)
export {
  validateAndIntegrate,
  getElementValidation,
  getSectionValidation,
  getLastValidationResult,
  clearValidationData,
  generateValidationInfoHtml,
  generateValidationSummaryHtml,
  getValidationStyles,
} from './validationManager.js';

// ユーティリティ関数
export { quickValidate } from './stbValidator.js'; // quickValidate は stbValidator.js に入れてないが、default options で代用できるが、exportがないとエラーになる。

// processStbFile
export async function processStbFile(file, options = {}) {
  const { runCompleteWorkflow } = await import('./validationManager.js');
  return runCompleteWorkflow(file, options);
}

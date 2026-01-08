/**
 * @fileoverview ST-Bridge バリデーション ユーティリティ関数
 *
 * バリデーションと修復の簡易関数を提供します。
 */

import { validateStbDocument } from './stbValidator.js';
import { autoRepairDocument } from '../repair/stbRepairEngine.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('validation:utils');

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
  return validateStbDocument(xmlDoc, {
    validateReferences: true,
    validateGeometry: true,
    ...options,
  });
}

/**
 * ドキュメントを自動修復して結果を返す
 *
 * @param {Document} xmlDoc - 元のXMLドキュメント
 * @param {Object} options - 修復オプション
 * @returns {Object} { document, validationReport, repairReport, revalidation }
 *
 * @example
 * const result = quickRepair(xmlDoc);
 * console.log('修復数:', result.repairReport.totalRepairs);
 * downloadXml(result.document); // 修復済みドキュメント
 */
export function quickRepair(xmlDoc, options = {}) {
  // バリデーション
  const validationReport = validateStbDocument(xmlDoc);

  // 修復
  const { document: repairedDoc, report: repairReport } = autoRepairDocument(
    xmlDoc.cloneNode(true),
    validationReport,
    options,
  );

  // 再バリデーション
  const revalidation = validateStbDocument(repairedDoc);

  return {
    document: repairedDoc,
    validationReport,
    repairReport,
    revalidation,
  };
}

/**
 * コンソールにバリデーションサマリーを表示
 *
 * @param {Object} report - バリデーションレポート
 */
export function logValidationSummary(report) {
  logger.info('--- ST-Bridge Validation Summary ---');
  logger.info(`Valid: ${report.valid ? 'Yes' : 'No'}`);
  logger.info(`Errors: ${report.statistics.errorCount}`);
  logger.info(`Warnings: ${report.statistics.warningCount}`);
  logger.info(`Repairable: ${report.statistics.repairableCount}`);
  logger.info(`Total Elements: ${report.statistics.totalElements}`);

  if (report.statistics.errorCount > 0) {
    logger.info('\nTop Errors:');
    report.issues
      .filter((i) => i.severity === 'error')
      .slice(0, 5)
      .forEach((issue) => {
        logger.info(`  - ${issue.message}`);
      });
  }
}

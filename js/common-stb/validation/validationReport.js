/**
 * @fileoverview ST-Bridge バリデーションレポート整形・抽出ユーティリティ
 *
 * stbValidator.js から分割。バリデーション結果（ValidationReport）の
 * テキスト整形・問題抽出・サマリー出力を担当する。
 */

import { createLogger } from '../../utils/logger.js';
import { SEVERITY } from './validationConstants.js';

const logger = createLogger('validation:report');

/**
 * バリデーションレポートをフォーマット
 *
 * @param {ValidationReport} report - バリデーションレポート
 * @returns {string} フォーマットされたテキスト
 */
export function formatValidationReport(report) {
  const lines = [];

  lines.push('='.repeat(60));
  lines.push('ST-Bridge バリデーションレポート');
  lines.push('='.repeat(60));
  lines.push('');
  lines.push(`検証日時: ${report.timestamp.toISOString()}`);
  lines.push(`結果: ${report.valid ? '✓ 有効' : '✗ エラーあり'}`);
  lines.push('');

  // 統計情報
  lines.push('--- 統計情報 ---');
  lines.push(`総要素数: ${report.statistics.totalElements}`);
  lines.push(`エラー: ${report.statistics.errorCount}`);
  lines.push(`警告: ${report.statistics.warningCount}`);
  lines.push(`情報: ${report.statistics.infoCount}`);
  lines.push(`修復可能: ${report.statistics.repairableCount}`);
  lines.push('');

  // 要素別カウント
  if (Object.keys(report.statistics.elementCounts).length > 0) {
    lines.push('--- 要素別カウント ---');
    for (const [type, count] of Object.entries(report.statistics.elementCounts)) {
      lines.push(`  ${type}: ${count}`);
    }
    lines.push('');
  }

  // 問題一覧
  if (report.issues.length > 0) {
    lines.push('--- 検出された問題 ---');

    // エラーを先に表示
    const errors = report.issues.filter((i) => i.severity === SEVERITY.ERROR);
    if (errors.length > 0) {
      lines.push('');
      lines.push('[エラー]');
      for (const issue of errors) {
        lines.push(`  - ${issue.message}`);
        if (issue.elementId) {
          lines.push(`    要素: ${issue.elementType} (ID: ${issue.elementId})`);
        }
        if (issue.idXPath || issue.xpath) {
          lines.push(`    XPath: ${issue.idXPath || issue.xpath}`);
        }
        if (issue.repairable && issue.repairSuggestion) {
          lines.push(`    修復提案: ${issue.repairSuggestion}`);
        }
      }
    }

    // 警告
    const warnings = report.issues.filter((i) => i.severity === SEVERITY.WARNING);
    if (warnings.length > 0) {
      lines.push('');
      lines.push('[警告]');
      for (const issue of warnings) {
        lines.push(`  - ${issue.message}`);
        if (issue.elementId) {
          lines.push(`    要素: ${issue.elementType} (ID: ${issue.elementId})`);
        }
        if (issue.idXPath || issue.xpath) {
          lines.push(`    XPath: ${issue.idXPath || issue.xpath}`);
        }
      }
    }

    // 情報
    const infos = report.issues.filter((i) => i.severity === SEVERITY.INFO);
    if (infos.length > 0) {
      lines.push('');
      lines.push('[情報]');
      for (const issue of infos) {
        lines.push(`  - ${issue.message}`);
        if (issue.idXPath || issue.xpath) {
          lines.push(`    XPath: ${issue.idXPath || issue.xpath}`);
        }
      }
    }
  } else {
    lines.push('問題は検出されませんでした。');
  }

  lines.push('');
  lines.push('='.repeat(60));

  return lines.join('\n');
}

/**
 * 修復可能な問題のみを抽出
 *
 * @param {ValidationReport} report - バリデーションレポート
 * @returns {ValidationIssue[]} 修復可能な問題の配列
 */
export function getRepairableIssues(report) {
  return report.issues.filter((issue) => issue.repairable);
}

/**
 * 特定のカテゴリの問題を抽出
 *
 * @param {ValidationReport} report - バリデーションレポート
 * @param {string} category - カテゴリ
 * @returns {ValidationIssue[]} 該当する問題の配列
 */
export function getIssuesByCategory(report, category) {
  return report.issues.filter((issue) => issue.category === category);
}

/**
 * 特定の要素タイプの問題を抽出
 *
 * @param {ValidationReport} report - バリデーションレポート
 * @param {string} elementType - 要素タイプ
 * @returns {ValidationIssue[]} 該当する問題の配列
 */
export function getIssuesByElementType(report, elementType) {
  return report.issues.filter((issue) => issue.elementType === elementType);
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
      .filter((i) => i.severity === SEVERITY.ERROR)
      .slice(0, 5)
      .forEach((issue) => {
        logger.info(`  - ${issue.message}`);
      });
  }
}

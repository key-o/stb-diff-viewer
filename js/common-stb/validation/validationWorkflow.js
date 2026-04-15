/**
 * @fileoverview バリデーション ワークフロー関数
 *
 * 完全なバリデーション・修復ワークフローの実行、統合レポート生成、
 * クイック修復などの便利関数を提供します。
 */

import { ValidationManager } from './validationManager.js';
import { formatValidationReport } from './stbValidator.js';
import { formatRepairReport } from '../repair/stbRepairEngine.js';

/**
 * 完全なワークフローを実行（便利関数）
 * @param {File} file - 読み込むファイル
 * @param {Object} options - バリデーションオプション
 * @returns {Promise<Object>} ワークフロー結果
 */
export async function runCompleteWorkflow(file, options = {}) {
  const manager = new ValidationManager();
  const validationReport = await manager.loadAndValidate(file, options);

  let repairReport = null;
  let xmlString = null;

  if (!validationReport.valid && options.autoRepair !== false) {
    repairReport = manager.executeAutoRepair(options);
    xmlString = manager.getRepairedXmlString();

    // オプションがあれば再検証結果も含める
    if (options.revalidate) {
      repairReport.revalidation = manager.revalidateRepaired();
    }
  } else {
    xmlString = manager.getRepairedXmlString();
  }

  return {
    validationReport,
    repairReport,
    xmlString,
    manager, // workflow から manager へ名称変更的意味合い
  };
}

/**
 * バリデーションと修復の統合レポートを生成
 * @param {ValidationManager} manager - ValidationManagerインスタンス
 * @returns {string} レポート文字列
 */
export function generateIntegratedReport(manager) {
  const state = manager.state;

  const lines = [];

  lines.push('='.repeat(70));
  lines.push('ST-Bridge バリデーション & 修復 統合レポート');
  lines.push('='.repeat(70));
  lines.push('');

  if (state.validationReport) {
    lines.push(formatValidationReport(state.validationReport));
    lines.push('');
  }

  if (state.repairReport) {
    lines.push(formatRepairReport(state.repairReport));
    lines.push('');
  }

  lines.push('--- 最終ステータス ---');
  lines.push(`ワークフローステップ: ${state.step}`);

  if (state.error) {
    lines.push(`エラー: ${state.error}`);
  }

  // 統計情報
  if (state.validationReport) {
    const report = state.validationReport;
    lines.push(`データ有効性: ${report.valid ? '有効' : '要修正'}`);
    lines.push(`修復可能な問題: ${report.statistics.repairableCount}`);
  }

  if (state.repairReport) {
    const report = state.repairReport;
    lines.push(`実行した修復: ${report.totalRepairs}`);
    lines.push(`成功した修復: ${report.successCount}`);
  }

  lines.push('');
  lines.push('='.repeat(70));

  return lines.join('\n');
}

/**
 * ドキュメントを自動修復して結果を返す (旧 validationUtils.quickRepair)
 * @param {Document} xmlDoc - XMLドキュメント
 * @param {Object} options - 修復オプション
 * @returns {Object} 修復結果
 */
export function quickRepair(xmlDoc, options = {}) {
  const manager = new ValidationManager();

  // ステートを手動でセットアップ
  manager.validateDocument(xmlDoc);

  // 修復
  const repairReport = manager.executeAutoRepair({
    removeInvalid: true,
    useDefaults: true,
    ...options,
  });

  // 結果取得
  const validationReport = manager.state.validationReport;
  const revalidation = manager.revalidateRepaired();

  return {
    document: manager.state.repairedDocument,
    validationReport,
    repairReport,
    revalidation,
  };
}

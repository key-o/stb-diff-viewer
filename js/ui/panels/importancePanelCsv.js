/**
 * @fileoverview 重要度設定のCSV/JSONインポート・エクスポート機能
 *
 * ImportancePanelから分離されたファイル入出力関連のスタンドアロン関数群。
 */

import { showSuccess, showError } from '../common/toast.js';
import { createLogger } from '../../utils/logger.js';
import { downloadBlob } from '../../utils/downloadHelper.js';

const log = createLogger('importancePanelCsv');

/**
 * ファイルをテキストとして読み込む
 * @param {File} file - 読み込むファイル
 * @returns {Promise<string>} ファイル内容
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsText(file, 'UTF-8');
  });
}

/**
 * CSV形式で設定をエクスポートする
 * @param {Object} manager - ImportanceManagerインスタンス
 */
export function exportToCSV(manager) {
  try {
    const csvContent = manager.exportToCSV();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `importance_settings_${new Date().toISOString().slice(0, 10)}.csv`);

    showSuccess('重要度設定をCSVファイルに出力しました。');
  } catch (error) {
    log.error('CSV export failed:', error);
    showError('CSVファイルの出力に失敗しました。');
  }
}

/**
 * JSON形式で設定をエクスポートする
 * @param {Object} manager - ImportanceManagerインスタンス
 */
export function exportToJSON(manager) {
  try {
    const jsonContent = manager.exportToJSON('combined');
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    downloadBlob(blob, `importance_settings_${new Date().toISOString().slice(0, 10)}.json`);
    showSuccess('重要度設定をJSONファイルに出力しました。');
  } catch (error) {
    log.error('JSON export failed:', error);
    showError('JSONファイルの出力に失敗しました。');
  }
}

/**
 * JSONファイルから設定をインポートする
 * @param {File} file - JSONファイル
 * @param {Object} manager - ImportanceManagerインスタンス
 * @param {Function} renderCallback - 描画更新コールバック
 */
export async function importFromJSON(file, manager, renderCallback) {
  if (!file) return;
  try {
    const jsonContent = await readFileAsText(file);
    const success = manager.importFromJSON(jsonContent);
    if (success) {
      renderCallback();
      showSuccess('重要度設定をJSONファイルから読み込みました。');
    } else {
      showError('JSONファイルの読み込みに失敗しました。');
    }
  } catch (error) {
    log.error('JSON import failed:', error);
    showError('JSONファイルの読み込み中にエラーが発生しました。');
  }
}

/**
 * CSVファイルから設定をインポートする
 * @param {File} file - CSVファイル
 * @param {Object} manager - ImportanceManagerインスタンス
 * @param {Function} refreshCallback - タブ更新コールバック
 */
export async function importFromCSV(file, manager, refreshCallback) {
  if (!file) return;

  try {
    const csvContent = await readFileAsText(file);
    const success = manager.importFromCSV(csvContent);

    if (success) {
      refreshCallback();
      showSuccess('重要度設定をCSVファイルから読み込みました。');
    } else {
      showError('CSVファイルの読み込みに失敗しました。');
    }
  } catch (error) {
    log.error('CSV import failed:', error);
    showError('CSVファイルの読み込み中にエラーが発生しました。');
  }
}

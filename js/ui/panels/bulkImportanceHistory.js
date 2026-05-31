/**
 * @fileoverview 重要度一括操作の履歴管理
 *
 * 操作履歴の記録、アンドゥ、エクスポート機能を提供します。
 */

import { IMPORTANCE_LEVEL_NAMES } from '../../constants/importanceLevels.js';
import { downloadBlob } from '../../utils/downloadHelper.js';
import { showSuccess, showError, showWarning } from '../common/toast.js';
import { createLogger } from '../../utils/logger.js';
import { createHistoryListHTML } from './bulkImportanceTemplates.js';

const log = createLogger('ui:panels:bulkImportanceHistory');

/**
 * 一括操作履歴エントリー
 * @typedef {Object} BulkOperationHistoryEntry
 * @property {string} id - 操作ID
 * @property {string} type - 操作タイプ
 * @property {string} timestamp - 実行時刻
 * @property {Object} changes - 変更内容
 * @property {string} description - 操作説明
 */

/**
 * 操作履歴管理クラス
 */
export class BulkImportanceHistory {
  constructor() {
    /** @type {BulkOperationHistoryEntry[]} */
    this.operationHistory = [];
    /** @type {number} */
    this.maxHistorySize = 50;
  }

  /**
   * 操作を履歴に記録する
   * @param {string} type - 操作タイプ
   * @param {Object} details - 操作詳細
   */
  recordOperation(type, details) {
    const operation = {
      id: Date.now().toString(),
      type,
      timestamp: new Date().toISOString(),
      details,
      description: this.generateOperationDescription(type, details),
    };

    this.operationHistory.unshift(operation);

    // 履歴サイズ制限
    if (this.operationHistory.length > this.maxHistorySize) {
      this.operationHistory = this.operationHistory.slice(0, this.maxHistorySize);
    }

    this.updateHistoryDisplay();
    this.updateUndoButton();
  }

  /**
   * 操作説明を生成する
   * @param {string} type - 操作タイプ
   * @param {Object} details - 操作詳細
   * @returns {string} 操作説明
   */
  generateOperationDescription(type, details) {
    switch (type) {
      case 'bulk':
        return `一括設定: ${details.count}個の要素を${IMPORTANCE_LEVEL_NAMES[details.importanceLevel]}に変更`;
      case 'preset':
        return `プリセット適用: ${details.presetName} (${details.count}個の要素)`;
      case 'rule':
        return `ルールテンプレート適用: ${details.template} (${details.count}個の要素)`;
      case 'individual':
        return `個別変更: ${details.path || '不明'}`;
      default:
        return `操作: ${type}`;
    }
  }

  /**
   * 最後の操作を元に戻す
   * @param {Object} manager - importanceManager インスタンス
   */
  undoLastOperation(manager) {
    if (this.operationHistory.length === 0) {
      showWarning('元に戻す操作がありません。');
      return;
    }

    const lastOperation = this.operationHistory[0];

    if (!confirm(`「${lastOperation.description}」を元に戻しますか？`)) {
      return;
    }

    // 操作を元に戻す
    if (lastOperation.details.beforeState) {
      Object.entries(lastOperation.details.beforeState).forEach(([path, importance]) => {
        manager.setImportanceLevel(path, importance);
      });

      // 履歴から削除
      this.operationHistory.shift();
      this.updateHistoryDisplay();
      this.updateUndoButton();

      showSuccess('操作を元に戻しました。');
    } else {
      showWarning('この操作は元に戻すことができません。');
    }
  }

  /**
   * 履歴をクリアする
   */
  clearHistory() {
    if (!confirm('操作履歴をすべてクリアしますか？')) {
      return;
    }

    this.operationHistory = [];
    this.updateHistoryDisplay();
    this.updateUndoButton();
  }

  /**
   * 履歴表示を更新する
   */
  updateHistoryDisplay() {
    const container = document.getElementById('operation-history-list');
    if (container) {
      container.replaceChildren(createHistoryListHTML(this.operationHistory));
    }
  }

  /**
   * アンドゥボタンの状態を更新する
   */
  updateUndoButton() {
    const button = document.getElementById('undo-last-operation');
    if (button) {
      button.disabled = this.operationHistory.length === 0;
    }
  }

  /**
   * 操作履歴の配列を取得する
   * @returns {BulkOperationHistoryEntry[]}
   */
  getOperations() {
    return this.operationHistory;
  }

  /**
   * 操作履歴を外部データで置換する（インポート用）
   * @param {Array} entries - 履歴エントリー配列
   */
  replaceHistory(entries) {
    this.operationHistory = entries.slice(0, this.maxHistorySize);
    this.updateHistoryDisplay();
    this.updateUndoButton();
  }

  /**
   * 履歴をエクスポートする
   */
  exportHistory() {
    try {
      const exportData = {
        timestamp: new Date().toISOString(),
        history: this.operationHistory,
      };

      const jsonContent = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      downloadBlob(blob, `operation_history_${new Date().toISOString().slice(0, 10)}.json`);
    } catch (error) {
      log.error('Failed to export history:', error);
      showError('履歴の出力に失敗しました。');
    }
  }
}

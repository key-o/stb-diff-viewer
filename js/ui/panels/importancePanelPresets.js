/**
 * @fileoverview 重要度設定のプリセット・リセット機能
 *
 * ImportancePanelから分離されたプリセット管理関連のスタンドアロン関数群。
 */

import { showSuccess, showWarning } from '../common/toast.js';

/**
 * 設定をデフォルトに戻す
 * @param {Object} manager - ImportanceManagerインスタンス
 * @param {Function} refreshCallback - タブ更新コールバック
 */
export function resetToDefaults(manager, refreshCallback) {
  const confirmMessage = '重要度設定をデフォルトに戻しますか？\n現在の設定は失われます。';
  if (!confirm(confirmMessage)) {
    return;
  }

  manager.resetToDefaults();

  refreshCallback();
  showSuccess('重要度設定をデフォルトに戻しました。');
}

/**
 * 現在のタブに一括で重要度を適用する（属性のみ）
 * @param {Object} manager - ImportanceManagerインスタンス
 * @param {string} currentTab - 現在のタブID
 * @param {Function} filterElementPaths - パスフィルタリング関数
 * @param {Function} getBinaryLabel - ラベル取得関数
 * @param {Function} refreshCallback - タブ更新コールバック
 */
export function applyBulkImportance(
  manager,
  currentTab,
  filterElementPaths,
  getBinaryLabel,
  refreshCallback,
) {
  const bulkLevel = document.getElementById('importance-bulk-level').value;
  if (!bulkLevel) {
    showWarning('設定を選択してください。');
    return;
  }

  const elementPaths = manager.getElementPathsByTab(currentTab);
  const filteredPaths = filterElementPaths(elementPaths);

  // 属性のみに絞り込み（要素は除外）
  const attributePaths = filteredPaths.filter((path) => path.includes('@'));

  if (attributePaths.length === 0) {
    showWarning('適用対象の属性がありません。');
    return;
  }

  const confirmMessage = `現在のタブの${attributePaths.length}個の属性を「${getBinaryLabel(bulkLevel)}」に設定しますか？\n（S2/S4 の両方に適用）`;
  if (!confirm(confirmMessage)) {
    return;
  }

  attributePaths.forEach((path) => {
    manager.setMvdImportanceLevel(path, 's2', bulkLevel, {
      notify: false,
      rebuild: false,
    });
    manager.setMvdImportanceLevel(path, 's4', bulkLevel, {
      notify: false,
      rebuild: false,
    });
  });
  manager.rebuildEffectiveImportanceSettings();
  manager.notifySettingsChanged();

  refreshCallback();
  showSuccess(`${attributePaths.length}個の属性の重要度を変更しました。`);
}

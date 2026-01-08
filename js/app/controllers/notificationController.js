/**
 * @fileoverview 通知コントローラー
 *
 * UI層のtoast通知機能へのFacadeを提供します。
 * 下位層（modelLoader等）がUI層に直接依存することを防ぎます。
 *
 * @module app/controllers/notificationController
 */

import { showWarning, showError, showSuccess, showInfo } from '../../ui/toast.js';

/**
 * 通知コントローラー
 * UI層のtoast機能への統一的なインターフェースを提供
 */
export const notify = {
  /**
   * 警告メッセージを表示
   * @param {string} message - 警告メッセージ
   */
  warning: (message) => showWarning(message),

  /**
   * エラーメッセージを表示
   * @param {string} message - エラーメッセージ
   */
  error: (message) => showError(message),

  /**
   * 成功メッセージを表示
   * @param {string} message - 成功メッセージ
   */
  success: (message) => showSuccess(message),

  /**
   * 情報メッセージを表示
   * @param {string} message - 情報メッセージ
   */
  info: (message) => showInfo(message),
};

export default notify;

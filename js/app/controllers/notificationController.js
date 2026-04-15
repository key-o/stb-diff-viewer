/**
 * @fileoverview 通知コントローラー
 *
 * eventBus経由でUI層のtoast通知機能を呼び出すFacadeを提供します。
 * 下位層（modelLoader等）がUI層に直接依存することを防ぎます。
 *
 * @module app/controllers/notificationController
 */

import { eventBus, ToastEvents } from '../../data/events/index.js';

/**
 * 通知コントローラー
 * eventBus経由でUI層のtoast機能を呼び出す統一的なインターフェース
 */
export const notify = {
  /**
   * 警告メッセージを表示
   * @param {string} message - 警告メッセージ
   */
  warning: (message) => eventBus.emit(ToastEvents.SHOW_WARNING, { message }),

  /**
   * エラーメッセージを表示
   * @param {string} message - エラーメッセージ
   */
  error: (message) => eventBus.emit(ToastEvents.SHOW_ERROR, { message }),

  /**
   * 成功メッセージを表示
   * @param {string} message - 成功メッセージ
   */
  success: (message) => eventBus.emit(ToastEvents.SHOW_SUCCESS, { message }),

  /**
   * 情報メッセージを表示
   * @param {string} message - 情報メッセージ
   */
  info: (message) => eventBus.emit(ToastEvents.SHOW_INFO, { message }),
};

export default notify;

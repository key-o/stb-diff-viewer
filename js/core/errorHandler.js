/**
 * @fileoverview 統一的なエラーハンドラー
 *
 * アプリケーション全体のエラー処理を一元管理します。
 * ユーザー通知、ログ記録、エラー追跡を統一的に処理します。
 */

import { createLogger } from '../utils/logger.js';
import { AppError, getErrorSeverity } from './errors.js';
import { ERROR_MESSAGES } from '../config/errorMessages.js';

const logger = createLogger('ErrorHandler');

/**
 * エラー通知の表示方法
 */
export const NotificationMode = {
  ALERT: 'alert',         // alert()を使用
  TOAST: 'toast',         // トースト通知（将来実装）
  CONSOLE: 'console',     // コンソールのみ
  SILENT: 'silent'        // 通知なし
};

/**
 * ErrorHandlerクラス
 * エラーの処理、通知、ログ記録を統一的に管理
 */
export class ErrorHandler {
  constructor() {
    this.notificationMode = NotificationMode.ALERT;
    this.errorHistory = [];
    this.maxHistorySize = 100;
    this.errorListeners = [];
  }

  /**
   * 通知モードを設定
   * @param {string} mode - 通知モード
   */
  setNotificationMode(mode) {
    if (Object.values(NotificationMode).includes(mode)) {
      this.notificationMode = mode;
    }
  }

  /**
   * エラーを処理
   * @param {Error} error - エラーオブジェクト
   * @param {Object} options - オプション
   * @param {string} options.userMessage - ユーザー向けメッセージ（省略時は自動生成）
   * @param {boolean} options.showNotification - 通知を表示するか（デフォルト: true）
   * @param {boolean} options.logToConsole - コンソールにログ出力するか（デフォルト: true）
   * @param {Object} options.context - 追加のコンテキスト情報
   */
  handle(error, options = {}) {
    const {
      userMessage = null,
      showNotification = true,
      logToConsole = true,
      context = {}
    } = options;

    // エラー情報を構築
    const errorInfo = this._buildErrorInfo(error, context);

    // 履歴に追加
    this._addToHistory(errorInfo);

    // コンソールにログ出力
    if (logToConsole) {
      this._logToConsole(errorInfo);
    }

    // ユーザーに通知
    if (showNotification) {
      const message = userMessage || this._getUserMessage(error);
      this._notifyUser(message, errorInfo.severity);
    }

    // エラーリスナーに通知
    this._notifyListeners(errorInfo);

    return errorInfo;
  }

  /**
   * エラー情報を構築
   * @private
   */
  _buildErrorInfo(error, context = {}) {
    const severity = getErrorSeverity(error);
    const timestamp = new Date();

    let errorInfo = {
      timestamp,
      severity,
      message: error.message,
      name: error.name,
      stack: error.stack,
      context
    };

    // AppErrorの場合は追加情報を含める
    if (error instanceof AppError) {
      errorInfo = {
        ...errorInfo,
        code: error.code,
        cause: error.cause,
        context: { ...error.context, ...context }
      };
    }

    return errorInfo;
  }

  /**
   * ユーザー向けメッセージを取得
   * @private
   */
  _getUserMessage(error) {
    // AppErrorの場合
    if (error instanceof AppError) {
      // エラーコードからメッセージを取得
      if (error.code && ERROR_MESSAGES[error.code]) {
        return ERROR_MESSAGES[error.code];
      }
      return error.getUserMessage();
    }

    // 標準Errorの場合
    return error.message || 'エラーが発生しました';
  }

  /**
   * コンソールにログ出力
   * @private
   */
  _logToConsole(errorInfo) {
    const { severity, message, code, context, stack } = errorInfo;

    switch (severity) {
      case 'error':
      case 'critical':
        logger.error(message, { code, context, stack });
        break;
      case 'warning':
        logger.warn(message, { code, context });
        break;
      case 'info':
        logger.info(message, { code, context });
        break;
      default:
        logger.debug(message, { code, context });
    }
  }

  /**
   * ユーザーに通知
   * @private
   */
  _notifyUser(message, severity) {
    switch (this.notificationMode) {
      case NotificationMode.ALERT:
        this._showAlert(message, severity);
        break;

      case NotificationMode.TOAST:
        this._showToast(message, severity);
        break;

      case NotificationMode.CONSOLE:
        // コンソールのみ（既に出力済み）
        break;

      case NotificationMode.SILENT:
        // 通知なし
        break;
    }
  }

  /**
   * アラートダイアログを表示
   * @private
   */
  _showAlert(message, severity) {
    const icon = this._getSeverityIcon(severity);
    alert(`${icon} ${message}`);
  }

  /**
   * トースト通知を表示（将来実装）
   * @private
   */
  _showToast(message, severity) {
    // TODO: トースト通知の実装
    // 現在はアラートにフォールバック
    this._showAlert(message, severity);
  }

  /**
   * 重要度に応じたアイコンを取得
   * @private
   */
  _getSeverityIcon(severity) {
    const icons = {
      critical: '🔴',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    return icons[severity] || '❌';
  }

  /**
   * 履歴に追加
   * @private
   */
  _addToHistory(errorInfo) {
    this.errorHistory.push(errorInfo);

    // 履歴サイズを制限
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }
  }

  /**
   * エラーリスナーに通知
   * @private
   */
  _notifyListeners(errorInfo) {
    this.errorListeners.forEach(listener => {
      try {
        listener(errorInfo);
      } catch (err) {
        console.error('Error listener failed:', err);
      }
    });
  }

  /**
   * エラーリスナーを登録
   * @param {Function} listener - リスナー関数
   * @returns {Function} 解除用関数
   */
  onError(listener) {
    this.errorListeners.push(listener);

    // 解除用関数を返す
    return () => {
      const index = this.errorListeners.indexOf(listener);
      if (index > -1) {
        this.errorListeners.splice(index, 1);
      }
    };
  }

  /**
   * エラー履歴を取得
   * @param {Object} options - オプション
   * @param {number} options.limit - 取得する件数
   * @param {string} options.severity - フィルター（重要度）
   * @returns {Array}
   */
  getHistory(options = {}) {
    const { limit = null, severity = null } = options;

    let history = [...this.errorHistory];

    // 重要度でフィルター
    if (severity) {
      history = history.filter(err => err.severity === severity);
    }

    // 件数制限
    if (limit) {
      history = history.slice(-limit);
    }

    return history;
  }

  /**
   * 履歴をクリア
   */
  clearHistory() {
    this.errorHistory = [];
  }

  /**
   * エラー統計を取得
   * @returns {Object}
   */
  getStatistics() {
    const stats = {
      total: this.errorHistory.length,
      bySeverity: {},
      byCode: {}
    };

    this.errorHistory.forEach(error => {
      // 重要度ごとにカウント
      stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;

      // エラーコードごとにカウント
      if (error.code) {
        stats.byCode[error.code] = (stats.byCode[error.code] || 0) + 1;
      }
    });

    return stats;
  }
}

// シングルトンインスタンス
export const errorHandler = new ErrorHandler();

/**
 * エラーを処理（ショートカット関数）
 * @param {Error} error - エラー
 * @param {Object} options - オプション
 */
export function handleError(error, options = {}) {
  return errorHandler.handle(error, options);
}

/**
 * グローバルエラーハンドラーを設定
 */
export function setupGlobalErrorHandler() {
  // 未捕捉のエラー
  window.addEventListener('error', (event) => {
    errorHandler.handle(event.error || new Error(event.message), {
      context: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      }
    });
  });

  // 未捕捉のPromise拒否
  window.addEventListener('unhandledrejection', (event) => {
    errorHandler.handle(
      event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
      {
        context: {
          type: 'unhandledRejection'
        }
      }
    );
  });

  logger.info('Global error handler initialized');
}

// デバッグ用にグローバル公開
if (typeof window !== 'undefined') {
  window.AppErrorHandler = errorHandler;
}

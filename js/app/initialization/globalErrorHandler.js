/**
 * @fileoverview 本番向けグローバルエラーハンドリング
 */

import { createLogger } from '../../utils/logger.js';
import { showError } from '../../ui/common/toast.js';
import { t } from '../../config/i18n.js';

const log = createLogger('app:global-error');

let initialized = false;
let errorHandler = null;
let rejectionHandler = null;
let lastNotificationAt = 0;

function getReasonMessage(reason) {
  if (!reason) return '';
  if (reason instanceof Error) return reason.message || reason.name || '';
  if (typeof reason === 'string') return reason;
  try {
    return JSON.stringify(reason);
  } catch (_error) {
    return String(reason);
  }
}

function notifyUser(toast, now = Date.now()) {
  if (now - lastNotificationAt < 3000) return;
  lastNotificationAt = now;
  if (toast === showError && (typeof document === 'undefined' || !document.body)) {
    return;
  }
  try {
    toast(t('errors.unexpected'));
  } catch (error) {
    log.warn('[GlobalError] Failed to show error toast', error);
  }
}

/**
 * window.onerror / unhandledrejection を登録する。
 * @param {{targetWindow?: Window, toast?: Function}} [options]
 */
export function initializeGlobalErrorHandling(options = {}) {
  const targetWindow = options.targetWindow || (typeof window !== 'undefined' ? window : null);
  const toast = options.toast || showError;

  if (!targetWindow || initialized) {
    return;
  }

  errorHandler = (event) => {
    const message = event?.message || getReasonMessage(event?.error) || 'Unknown error';
    log.error('[GlobalError]', message, event?.error || event);
    notifyUser(toast);
  };

  rejectionHandler = (event) => {
    const message = getReasonMessage(event?.reason) || 'Unhandled promise rejection';
    log.error('[UnhandledRejection]', message, event?.reason || event);
    notifyUser(toast);
  };

  targetWindow.addEventListener('error', errorHandler);
  targetWindow.addEventListener('unhandledrejection', rejectionHandler);
  initialized = true;
}

/**
 * テスト専用: 登録状態をリセットする。
 * @param {Window} targetWindow
 */
export function resetGlobalErrorHandlingForTest(targetWindow) {
  if (targetWindow && errorHandler) {
    targetWindow.removeEventListener('error', errorHandler);
  }
  if (targetWindow && rejectionHandler) {
    targetWindow.removeEventListener('unhandledrejection', rejectionHandler);
  }
  initialized = false;
  errorHandler = null;
  rejectionHandler = null;
  lastNotificationAt = 0;
}

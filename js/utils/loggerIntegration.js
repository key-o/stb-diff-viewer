/**
 * @fileoverview ロガー統合ヘルパー
 *
 * 既存のlogger.jsを使いやすくするヘルパー関数群を提供します。
 * エラーハンドラーとの統合、構造化ログの簡略化などを行います。
 */

import { createLogger } from './logger.js';

/**
 * モジュール用のロガーを作成（キャッシュ付き）
 */
const loggerCache = new Map();

/**
 * モジュール用のロガーを取得
 * @param {string} namespace - 名前空間
 * @returns {Object} ロガーインスタンス
 */
export function getLogger(namespace) {
  if (!loggerCache.has(namespace)) {
    loggerCache.set(namespace, createLogger(namespace));
  }
  return loggerCache.get(namespace);
}

/**
 * 構造化ログのヘルパー
 */
export class StructuredLogger {
  constructor(namespace) {
    this.logger = getLogger(namespace);
    this.namespace = namespace;
  }

  /**
   * エラーログ（詳細情報付き）
   * @param {string} message - メッセージ
   * @param {Error} error - エラーオブジェクト
   * @param {Object} context - コンテキスト情報
   */
  error(message, error = null, context = {}) {
    const logData = {
      message,
      context,
      timestamp: new Date().toISOString(),
    };

    if (error) {
      logData.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code,
      };
    }

    this.logger.error(JSON.stringify(logData, null, 2));
  }

  /**
   * 警告ログ
   * @param {string} message - メッセージ
   * @param {Object} context - コンテキスト情報
   */
  warn(message, context = {}) {
    this.logger.warn(message, context);
  }

  /**
   * 情報ログ
   * @param {string} message - メッセージ
   * @param {Object} context - コンテキスト情報
   */
  info(message, context = {}) {
    this.logger.info(message, context);
  }

  /**
   * デバッグログ
   * @param {string} message - メッセージ
   * @param {Object} context - コンテキスト情報
   */
  debug(message, context = {}) {
    this.logger.debug(message, context);
  }

  /**
   * トレースログ
   * @param {string} message - メッセージ
   * @param {Object} context - コンテキスト情報
   */
  trace(message, context = {}) {
    this.logger.trace(message, context);
  }

  /**
   * 関数の実行をログ記録
   * @param {string} functionName - 関数名
   * @param {Function} fn - 実行する関数
   * @param {Array} args - 引数
   * @returns {*} 関数の戻り値
   */
  logFunction(functionName, fn, ...args) {
    this.debug(`${functionName} start`, { args });

    const startTime = performance.now();
    try {
      const result = fn(...args);
      const duration = performance.now() - startTime;

      this.debug(`${functionName} completed`, {
        duration: `${duration.toFixed(2)}ms`,
      });

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.error(`${functionName} failed`, error, {
        duration: `${duration.toFixed(2)}ms`,
        args,
      });
      throw error;
    }
  }

  /**
   * 非同期関数の実行をログ記録
   * @param {string} functionName - 関数名
   * @param {Function} fn - 実行する非同期関数
   * @param {Array} args - 引数
   * @returns {Promise<*>} 関数の戻り値
   */
  async logAsyncFunction(functionName, fn, ...args) {
    this.debug(`${functionName} start`, { args });

    const startTime = performance.now();
    try {
      const result = await fn(...args);
      const duration = performance.now() - startTime;

      this.debug(`${functionName} completed`, {
        duration: `${duration.toFixed(2)}ms`,
      });

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.error(`${functionName} failed`, error, {
        duration: `${duration.toFixed(2)}ms`,
        args,
      });
      throw error;
    }
  }
}

/**
 * パフォーマンス測定ヘルパー
 */
export class PerformanceLogger {
  constructor(namespace) {
    this.logger = getLogger(namespace);
    this.timers = new Map();
  }

  /**
   * タイマーを開始
   * @param {string} label - ラベル
   */
  start(label) {
    this.timers.set(label, performance.now());
    this.logger.debug(`⏱️ ${label} started`);
  }

  /**
   * タイマーを終了してログ出力
   * @param {string} label - ラベル
   * @param {Object} context - 追加情報
   */
  end(label, context = {}) {
    if (!this.timers.has(label)) {
      this.logger.warn(`Timer "${label}" not found`);
      return;
    }

    const startTime = this.timers.get(label);
    const duration = performance.now() - startTime;
    this.timers.delete(label);

    this.logger.info(`⏱️ ${label} completed in ${duration.toFixed(2)}ms`, context);
  }

  /**
   * タイマーをラップした関数実行
   * @param {string} label - ラベル
   * @param {Function} fn - 実行する関数
   * @returns {*} 関数の戻り値
   */
  measure(label, fn) {
    this.start(label);
    try {
      const result = fn();
      this.end(label);
      return result;
    } catch (error) {
      this.end(label, { error: error.message });
      throw error;
    }
  }

  /**
   * タイマーをラップした非同期関数実行
   * @param {string} label - ラベル
   * @param {Function} fn - 実行する非同期関数
   * @returns {Promise<*>} 関数の戻り値
   */
  async measureAsync(label, fn) {
    this.start(label);
    try {
      const result = await fn();
      this.end(label);
      return result;
    } catch (error) {
      this.end(label, { error: error.message });
      throw error;
    }
  }
}

/**
 * デバッグ用のコンソールラッパー
 * 本番環境では無効化できる
 */
export class DebugConsole {
  constructor(enabled = true) {
    this.enabled = enabled;
  }

  log(...args) {
    if (this.enabled) {
    }
  }

  error(...args) {
    if (this.enabled) {
      console.error(...args);
    }
  }

  warn(...args) {
    if (this.enabled) {
      console.warn(...args);
    }
  }

  info(...args) {
    if (this.enabled) {
    }
  }

  debug(...args) {
    if (this.enabled) {
    }
  }

  table(data) {
    if (this.enabled) {
      console.table(data);
    }
  }

  group(label) {
    if (this.enabled) {
      console.group(label);
    }
  }

  groupEnd() {
    if (this.enabled) {
      console.groupEnd();
    }
  }
}

/**
 * 本番環境かどうかを判定
 * @returns {boolean}
 */
function isProduction() {
  return process.env.NODE_ENV === 'production' || window.location.hostname !== 'localhost';
}

// デバッグコンソールのシングルトン
export const debugConsole = new DebugConsole(!isProduction());

/**
 * 開発環境のみ実行
 * @param {Function} fn - 実行する関数
 */
export function devOnly(fn) {
  if (!isProduction()) {
    fn();
  }
}

/**
 * 本番環境のみ実行
 * @param {Function} fn - 実行する関数
 */
export function prodOnly(fn) {
  if (isProduction()) {
    fn();
  }
}

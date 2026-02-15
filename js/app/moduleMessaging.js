/**
 * @fileoverview モジュール間通信システム
 *
 * このファイルは、重要度機能と既存機能間の疎結合通信を提供します:
 * - イベント発行・購読システム
 * - 非同期メッセージ処理
 * - 優先度付きメッセージ配信
 * - エラーハンドリングと復旧機能
 * - パフォーマンス監視機能
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('ModuleMessaging');

/**
 * モジュール間メッセージング システム
 */
class ModuleMessenger {
  constructor() {
    this.subscribers = new Map();
    this.messageQueue = [];
    this.processing = false;
    this.stats = {
      messagesPublished: 0,
      messagesDelivered: 0,
      messagesDropped: 0,
      errors: 0,
      startTime: Date.now(),
    };
    this.config = {
      maxQueueSize: 1000,
      processingDelay: 0,
      enableDebugLogging: false,
      errorRetryCount: 3,
      errorRetryDelay: 100,
    };
  }

  /**
   * イベントを購読する
   * @param {string} event - イベント名
   * @param {Function} callback - コールバック関数
   * @param {Object} options - オプション設定
   * @returns {Function} 購読解除関数
   */
  subscribe(event, callback, options = {}) {
    if (typeof event !== 'string' || !event) {
      throw new Error('イベント名は空でない文字列である必要があります');
    }

    if (typeof callback !== 'function') {
      throw new Error('コールバックは関数である必要があります');
    }

    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, new Set());
    }

    const subscription = {
      callback,
      once: options.once || false,
      priority: options.priority || 0,
      context: options.context || null,
      id: this.generateSubscriptionId(),
      createdAt: Date.now(),
    };

    this.subscribers.get(event).add(subscription);

    // アンサブスクライブ関数を返す
    return () => {
      const eventSubscribers = this.subscribers.get(event);
      if (eventSubscribers) {
        eventSubscribers.delete(subscription);
        if (eventSubscribers.size === 0) {
          this.subscribers.delete(event);
        }
      }
    };
  }

  /**
   * 一度だけ実行される購読を登録する
   * @param {string} event - イベント名
   * @param {Function} callback - コールバック関数
   * @param {Object} options - オプション設定
   * @returns {Function} 購読解除関数
   */
  once(event, callback, options = {}) {
    return this.subscribe(event, callback, { ...options, once: true });
  }

  /**
   * メッセージを発行する
   * @param {string} event - イベント名
   * @param {any} data - メッセージデータ
   * @param {Object} options - オプション設定
   * @returns {Promise<boolean>} 発行成功可否
   */
  publish(event, data, options = {}) {
    if (typeof event !== 'string' || !event) {
      throw new Error('イベント名は空でない文字列である必要があります');
    }

    const message = {
      event,
      data,
      timestamp: Date.now(),
      id: this.generateMessageId(),
      async: options.async || false,
      priority: options.priority || 0,
      retryCount: 0,
      maxRetries: this.config.errorRetryCount,
    };

    this.stats.messagesPublished++;

    if (options.async) {
      return this.enqueueMessage(message);
    } else {
      return this.deliverMessage(message);
    }
  }

  /**
   * メッセージをキューに追加する
   * @param {Object} message - メッセージオブジェクト
   * @returns {Promise<boolean>} エンキュー成功可否
   */
  async enqueueMessage(message) {
    // キューサイズ制限チェック
    if (this.messageQueue.length >= this.config.maxQueueSize) {
      logger.warn(`メッセージキュー: 満杯のため破棄 (event=${message.event})`);
      this.stats.messagesDropped++;
      return false;
    }

    this.messageQueue.push(message);

    // キューを優先度順にソート
    this.messageQueue.sort((a, b) => b.priority - a.priority);

    // 非同期処理を開始
    this.processQueue();

    return true;
  }

  /**
   * メッセージキューを処理する
   */
  async processQueue() {
    if (this.processing || this.messageQueue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();

      try {
        await this.deliverMessage(message);

        // 処理間隔調整
        if (this.config.processingDelay > 0) {
          await this.delay(this.config.processingDelay);
        }
      } catch (error) {
        logger.error(`キューのメッセージ処理中にエラーが発生しました:`, error);

        // リトライ処理
        if (message.retryCount < message.maxRetries) {
          message.retryCount++;

          // リトライ遅延
          await this.delay(this.config.errorRetryDelay * message.retryCount);

          // キューの先頭に再挿入
          this.messageQueue.unshift(message);
        } else {
          logger.error(
            `メッセージ"${message.event}"の最大再試行回数を超えました。メッセージを破棄します`,
          );
          this.stats.messagesDropped++;
        }
      }
    }

    this.processing = false;
  }

  /**
   * メッセージを配信する
   * @param {Object} message - メッセージオブジェクト
   * @returns {Promise<boolean>} 配信成功可否
   */
  async deliverMessage(message) {
    const subscribers = this.subscribers.get(message.event);

    if (!subscribers || subscribers.size === 0) {
      return true;
    }

    // 優先度順にソート
    const sortedSubscribers = Array.from(subscribers).sort((a, b) => b.priority - a.priority);

    const deliveryPromises = [];
    const subscribersToRemove = [];

    for (const subscription of sortedSubscribers) {
      try {
        const deliveryPromise = this.executeCallback(subscription, message);
        deliveryPromises.push(deliveryPromise);

        // 一度だけの購読は削除対象に追加
        if (subscription.once) {
          subscribersToRemove.push(subscription);
        }
      } catch (error) {
        logger.error(
          `イベント"${message.event}"のコールバック実行中にエラーが発生しました:`,
          error,
        );
        this.stats.errors++;

        // コンテキスト情報があればログに出力
        if (subscription.context) {
          logger.error(`コールバックコンテキスト:`, subscription.context);
        }
      }
    }

    // 一度だけの購読を削除
    subscribersToRemove.forEach((subscription) => {
      subscribers.delete(subscription);
    });

    // イベントに購読者がいなくなった場合は削除
    if (subscribers.size === 0) {
      this.subscribers.delete(message.event);
    }

    // すべてのコールバック実行を待機
    try {
      await Promise.all(deliveryPromises);
      this.stats.messagesDelivered++;

      return true;
    } catch (error) {
      logger.error(`イベント"${message.event}"のメッセージ配信中にエラーが発生しました:`, error);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * コールバック関数を実行する
   * @param {Object} subscription - 購読情報
   * @param {Object} message - メッセージオブジェクト
   * @returns {Promise} 実行結果
   */
  async executeCallback(subscription, message) {
    const startTime = Date.now();

    try {
      // コンテキストがある場合はbindを使用
      const callback = subscription.context
        ? subscription.callback.bind(subscription.context)
        : subscription.callback;

      // コールバックを実行
      const result = callback(message.data, message);

      // Promiseの場合は待機
      if (result && typeof result.then === 'function') {
        await result;
      }

      const executionTime = Date.now() - startTime;

      if (this.config.enableDebugLogging && executionTime > 100) {
        logger.warn(`コールバック遅延: ${executionTime}ms (event=${message.event})`);
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error(`${executionTime}ms後にコールバックの実行が失敗しました:`, error);
      throw error;
    }
  }

  /**
   * すべての購読を解除する
   * @param {string} event - イベント名（省略時は全イベント）
   */
  unsubscribeAll(event) {
    if (event) {
      this.subscribers.delete(event);
    } else {
      this.subscribers.clear();
    }
  }

  /**
   * 統計情報を取得する
   * @returns {Object} 統計データ
   */
  getStats() {
    const uptime = Date.now() - this.stats.startTime;
    const queueSize = this.messageQueue.length;
    const subscriberCount = Array.from(this.subscribers.values()).reduce(
      (sum, subscribers) => sum + subscribers.size,
      0,
    );

    return {
      ...this.stats,
      uptime,
      queueSize,
      subscriberCount,
      eventCount: this.subscribers.size,
      messagesPerSecond: this.stats.messagesDelivered / (uptime / 1000),
      errorRate: this.stats.errors / Math.max(this.stats.messagesPublished, 1),
    };
  }

  /**
   * 設定を更新する
   * @param {Object} newConfig - 新しい設定
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * デバッグ情報を出力する
   */
  debug() {}

  /**
   * システムをリセットする
   */
  reset() {
    this.subscribers.clear();
    this.messageQueue.length = 0;
    this.processing = false;
    this.stats = {
      messagesPublished: 0,
      messagesDelivered: 0,
      messagesDropped: 0,
      errors: 0,
      startTime: Date.now(),
    };
  }

  /**
   * 購読IDを生成する
   * @private
   * @returns {string} ユニークなID
   */
  generateSubscriptionId() {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * メッセージIDを生成する
   * @private
   * @returns {string} ユニークなID
   */
  generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 指定時間待機する
   * @private
   * @param {number} ms - 待機時間（ミリ秒）
   * @returns {Promise} 待機完了Promise
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// グローバルメッセンジャーインスタンス
let globalMessenger = null;

/**
 * グローバルメッセンジャーを初期化する
 * @param {Object} config - 初期設定
 * @returns {ModuleMessenger} 初期化されたメッセンジャー
 */
export function initializeGlobalMessenger(config = {}) {
  globalMessenger = new ModuleMessenger();

  if (Object.keys(config).length > 0) {
    globalMessenger.updateConfig(config);
  }

  // 開発時のデバッグ用にwindowに公開
  if (typeof window !== 'undefined') {
    window.moduleMessenger = globalMessenger;
  }

  return globalMessenger;
}

/**
 * @fileoverview イベントリスナー登録ヘルパー
 *
 * DOM要素へのイベントリスナー登録を簡素化するユーティリティクラス。
 * 繰り返しのaddEventListener呼び出しを設定オブジェクトで一括登録できます。
 *
 * 使用例:
 * ```javascript
 * const helper = new EventListenerHelper(this);
 * helper.registerAll([
 *   { elementId: 'btn-save', event: 'click', handler: this.save },
 *   { elementId: 'btn-cancel', event: 'click', handler: this.cancel },
 *   { elementId: 'input-name', event: 'change', handler: this.onNameChange }
 * ]);
 * ```
 */

/**
 * イベントリスナー登録ヘルパークラス
 */
export class EventListenerHelper {
  /**
   * @param {Object} context - ハンドラーのthisコンテキスト
   * @param {Object} [options={}] - オプション
   * @param {boolean} [options.warnOnMissing=true] - 要素が見つからない場合に警告を出すか
   */
  constructor(context, options = {}) {
    this.context = context;
    this.warnOnMissing = options.warnOnMissing !== false;
    this.registeredListeners = [];
  }

  /**
   * 単一のイベントリスナーを登録
   *
   * @param {Object} config - リスナー設定
   * @param {string} config.elementId - DOM要素ID
   * @param {string} config.event - イベントタイプ（'click', 'change'等）
   * @param {Function} config.handler - ハンドラー関数
   * @param {boolean} [config.passEvent=false] - イベントオブジェクトをハンドラーに渡すか
   * @returns {boolean} 登録成功時true
   */
  register(config) {
    const { elementId, event, handler, passEvent = false } = config;

    const element = document.getElementById(elementId);
    if (!element) {
      if (this.warnOnMissing) {
        console.warn(`[EventListenerHelper] Element not found: ${elementId}`);
      }
      return false;
    }

    const boundHandler = passEvent
      ? (e) => handler.call(this.context, e)
      : () => handler.call(this.context);

    element.addEventListener(event, boundHandler);

    // 登録を記録（後でクリーンアップ可能に）
    this.registeredListeners.push({
      element,
      event,
      handler: boundHandler
    });

    return true;
  }

  /**
   * 複数のイベントリスナーを一括登録
   *
   * @param {Array<Object>} configs - リスナー設定配列
   * @returns {number} 登録成功数
   */
  registerAll(configs) {
    let successCount = 0;
    for (const config of configs) {
      if (this.register(config)) {
        successCount++;
      }
    }
    return successCount;
  }

  /**
   * クリックイベント専用の簡易登録
   *
   * @param {string} elementId - DOM要素ID
   * @param {Function} handler - ハンドラー関数
   * @returns {boolean} 登録成功時true
   */
  onClick(elementId, handler) {
    return this.register({ elementId, event: 'click', handler });
  }

  /**
   * changeイベント専用の簡易登録
   *
   * @param {string} elementId - DOM要素ID
   * @param {Function} handler - ハンドラー関数（イベントオブジェクトが渡される）
   * @returns {boolean} 登録成功時true
   */
  onChange(elementId, handler) {
    return this.register({ elementId, event: 'change', handler, passEvent: true });
  }

  /**
   * 複数のクリックイベントを一括登録
   *
   * @param {Object} mappings - elementId: handler のマッピングオブジェクト
   * @returns {number} 登録成功数
   */
  onClickAll(mappings) {
    const configs = Object.entries(mappings).map(([elementId, handler]) => ({
      elementId,
      event: 'click',
      handler
    }));
    return this.registerAll(configs);
  }

  /**
   * 登録したリスナーをすべて解除
   */
  removeAll() {
    for (const { element, event, handler } of this.registeredListeners) {
      element.removeEventListener(event, handler);
    }
    this.registeredListeners = [];
  }

  /**
   * 登録数を取得
   * @returns {number} 登録済みリスナー数
   */
  get count() {
    return this.registeredListeners.length;
  }
}

/**
 * ファクトリ関数: EventListenerHelperインスタンスを作成
 *
 * @param {Object} context - ハンドラーのthisコンテキスト
 * @param {Object} [options={}] - オプション
 * @returns {EventListenerHelper} インスタンス
 */
export function createEventListenerHelper(context, options = {}) {
  return new EventListenerHelper(context, options);
}

export default EventListenerHelper;

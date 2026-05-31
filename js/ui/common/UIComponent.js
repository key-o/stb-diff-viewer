/**
 * @fileoverview UIコンポーネントの基底クラス
 *
 * DOMイベントリスナーとEventBus購読を追跡し、destroy()で一括解除することで
 * メモリリークを防ぎます。
 *
 * 使用例:
 * ```javascript
 * import { UIComponent } from '../common/UIComponent.js';
 * import { eventBus, ComparisonEvents } from '../../data/events/index.js';
 *
 * class MyPanel extends UIComponent {
 *   init() {
 *     const btn = document.getElementById('my-btn');
 *     this.addListener(btn, 'click', () => this.handleClick());
 *     this.onBus(ComparisonEvents.UPDATE_STATISTICS, (data) => this.update(data));
 *   }
 * }
 *
 * const panel = new MyPanel();
 * panel.init();
 * // ...
 * panel.destroy(); // 全リスナー解除
 * ```
 *
 * @module ui/common/UIComponent
 */

import { eventBus } from '../../data/events/index.js';

/**
 * @typedef {Object} DomListenerEntry
 * @property {EventTarget} target
 * @property {string} event
 * @property {EventListenerOrEventListenerObject} handler
 * @property {boolean | AddEventListenerOptions} [options]
 */

/**
 * UIコンポーネント基底クラス
 *
 * addListener() / onBus() でリスナーを登録すると内部に蓄積され、
 * destroy() 呼び出しで一括解除されます。
 */
export class UIComponent {
  constructor() {
    /** @type {DomListenerEntry[]} */
    this._domListeners = [];
    /** @type {Array<() => void>} */
    this._busUnsubscribers = [];
    /** @type {boolean} */
    this._destroyed = false;
  }

  /**
   * DOMイベントリスナーを登録（destroy時に自動解除）
   * @param {EventTarget} target - 対象要素
   * @param {string} event - イベント名
   * @param {EventListenerOrEventListenerObject} handler - ハンドラー
   * @param {boolean | AddEventListenerOptions} [options] - addEventListenerオプション
   * @returns {() => void} 個別解除関数
   */
  addListener(target, event, handler, options) {
    if (!target || typeof target.addEventListener !== 'function') {
      return () => {};
    }
    target.addEventListener(event, handler, options);
    const entry = { target, event, handler, options };
    this._domListeners.push(entry);
    return () => this._removeDomListener(entry);
  }

  /**
   * EventBus イベントを購読（destroy時に自動解除）
   * @param {string} eventType - イベントタイプ
   * @param {Function} callback - コールバック
   * @param {Object} [context] - thisコンテキスト
   * @returns {() => void} 個別解除関数
   */
  onBus(eventType, callback, context = null) {
    const unsubscribe = eventBus.on(eventType, callback, context);
    this._busUnsubscribers.push(unsubscribe);
    return () => {
      unsubscribe();
      const idx = this._busUnsubscribers.indexOf(unsubscribe);
      if (idx >= 0) this._busUnsubscribers.splice(idx, 1);
    };
  }

  /**
   * 全リスナーを解除
   */
  destroy() {
    if (this._destroyed) return;
    for (const entry of this._domListeners) {
      try {
        entry.target.removeEventListener(entry.event, entry.handler, entry.options);
      } catch {
        // removeEventListener が失敗しても継続
      }
    }
    this._domListeners.length = 0;

    for (const unsubscribe of this._busUnsubscribers) {
      try {
        unsubscribe();
      } catch {
        // 継続
      }
    }
    this._busUnsubscribers.length = 0;
    this._destroyed = true;
  }

  /** @returns {boolean} */
  isDestroyed() {
    return this._destroyed;
  }

  /**
   * @private
   * @param {DomListenerEntry} entry
   */
  _removeDomListener(entry) {
    const idx = this._domListeners.indexOf(entry);
    if (idx < 0) return;
    this._domListeners.splice(idx, 1);
    try {
      entry.target.removeEventListener(entry.event, entry.handler, entry.options);
    } catch {
      // 継続
    }
  }
}

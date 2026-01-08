/**
 * @fileoverview ローカルストレージヘルパー
 *
 * localStorageへのアクセスを抽象化し、一貫したキー命名と
 * エラーハンドリングを提供するユーティリティ。
 *
 * @module utils/storageHelper
 */

/**
 * ストレージキーのプレフィックス
 * @constant {string}
 */
const STORAGE_PREFIX = 'stb:';

/**
 * ローカルストレージヘルパーオブジェクト
 *
 * @example
 * // 値の保存
 * storageHelper.set('panelWidth', 300);
 *
 * // 値の取得（デフォルト値付き）
 * const width = storageHelper.get('panelWidth', 250);
 *
 * // 値の削除
 * storageHelper.remove('panelWidth');
 */
export const storageHelper = {
  /**
   * ローカルストレージから値を取得
   *
   * @param {string} key - ストレージキー（プレフィックスなし）
   * @param {*} [defaultValue=null] - 値が存在しない場合のデフォルト値
   * @returns {*} 保存された値またはデフォルト値
   */
  get(key, defaultValue = null) {
    if (typeof localStorage === 'undefined') {
      return defaultValue;
    }

    try {
      const value = localStorage.getItem(STORAGE_PREFIX + key);
      if (value === null) {
        return defaultValue;
      }
      return JSON.parse(value);
    } catch {
      // JSONパースエラーまたはストレージアクセスエラー
      return defaultValue;
    }
  },

  /**
   * ローカルストレージに値を保存
   *
   * @param {string} key - ストレージキー（プレフィックスなし）
   * @param {*} value - 保存する値（JSON.stringifyで変換される）
   * @returns {boolean} 保存成功時true
   */
  set(key, value) {
    if (typeof localStorage === 'undefined') {
      return false;
    }

    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn(`[storageHelper] Failed to save: ${key}`, e);
      return false;
    }
  },

  /**
   * ローカルストレージから値を削除
   *
   * @param {string} key - ストレージキー（プレフィックスなし）
   * @returns {boolean} 削除成功時true
   */
  remove(key) {
    if (typeof localStorage === 'undefined') {
      return false;
    }

    try {
      localStorage.removeItem(STORAGE_PREFIX + key);
      return true;
    } catch (e) {
      console.warn(`[storageHelper] Failed to remove: ${key}`, e);
      return false;
    }
  },

  /**
   * 指定したプレフィックスで始まるすべてのキーを取得
   *
   * @param {string} [prefix=''] - 追加のプレフィックス
   * @returns {string[]} マッチするキーの配列（プレフィックスなし）
   */
  keys(prefix = '') {
    if (typeof localStorage === 'undefined') {
      return [];
    }

    const result = [];
    const fullPrefix = STORAGE_PREFIX + prefix;

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(fullPrefix)) {
          result.push(key.slice(STORAGE_PREFIX.length));
        }
      }
    } catch {
      // ストレージアクセスエラー
    }

    return result;
  },

  /**
   * すべてのstb:プレフィックス付きデータをクリア
   *
   * @returns {number} 削除したキーの数
   */
  clear() {
    if (typeof localStorage === 'undefined') {
      return 0;
    }

    const keysToRemove = this.keys();
    keysToRemove.forEach((key) => this.remove(key));
    return keysToRemove.length;
  },

  /**
   * ストレージが利用可能かどうかをチェック
   *
   * @returns {boolean} localStorageが利用可能な場合true
   */
  isAvailable() {
    if (typeof localStorage === 'undefined') {
      return false;
    }

    try {
      const testKey = STORAGE_PREFIX + '__test__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * プレフィックスを取得（デバッグ用）
   *
   * @returns {string} 使用中のプレフィックス
   */
  getPrefix() {
    return STORAGE_PREFIX;
  },
};

export default storageHelper;

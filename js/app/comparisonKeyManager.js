/**
 * @fileoverview 比較キータイプ管理モジュール
 *
 * STB要素の対応関係を決定する際のキータイプ（位置情報ベース or GUIDベース）を管理します。
 * ColorManagerやDisplayModeManagerと同様のシングルトンパターンで実装。
 */

import { COMPARISON_KEY_TYPE, DEFAULT_COMPARISON_KEY_TYPE } from '../config/comparisonKeyConfig.js';
// UI層への依存を解消: constants/から直接インポート
import { COMPARISON_KEY_EVENTS } from '../constants/eventTypes.js';
import { storageHelper } from '../utils/storageHelper.js';

// storageHelper用のキー
const STORAGE_KEY = 'comparison-key-type';

/**
 * 比較キータイプ管理クラス
 * シングルトンパターンで実装
 */
class ComparisonKeyManager {
  constructor() {
    // 現在のキータイプ
    this.currentKeyType = this.loadFromStorage();

    // 変更通知用のリスナー
    this.changeListeners = new Set();
  }

  /**
   * storageHelperからキータイプを読み込む
   * @returns {string} 比較キータイプ
   * @private
   */
  loadFromStorage() {
    const saved = storageHelper.get(STORAGE_KEY);
    if (saved && Object.values(COMPARISON_KEY_TYPE).includes(saved)) {
      return saved;
    }
    return DEFAULT_COMPARISON_KEY_TYPE;
  }

  /**
   * storageHelperにキータイプを保存する
   * @param {string} keyType - 比較キータイプ
   * @private
   */
  saveToStorage(keyType) {
    storageHelper.set(STORAGE_KEY, keyType);
  }

  /**
   * 現在の比較キータイプを取得
   * @returns {string} 比較キータイプ
   */
  getKeyType() {
    return this.currentKeyType;
  }

  /**
   * 比較キータイプを設定
   * @param {string} keyType - 比較キータイプ
   * @returns {boolean} 設定成功フラグ
   */
  setKeyType(keyType) {
    // 入力検証
    if (!Object.values(COMPARISON_KEY_TYPE).includes(keyType)) {
      console.error(`[ComparisonKeyManager] Invalid key type: ${keyType}`);
      return false;
    }

    const oldKeyType = this.currentKeyType;
    if (oldKeyType === keyType) {
      return true;
    }

    // 設定を変更
    this.currentKeyType = keyType;

    // 保存
    this.saveToStorage(keyType);

    // 変更通知
    this.notifyChange(keyType, oldKeyType);

    return true;
  }

  /**
   * 位置情報ベースかどうかを判定
   * @returns {boolean} 位置情報ベースならtrue
   */
  isPositionBased() {
    return this.currentKeyType === COMPARISON_KEY_TYPE.POSITION_BASED;
  }

  /**
   * GUIDベースかどうかを判定
   * @returns {boolean} GUIDベースならtrue
   */
  isGuidBased() {
    return this.currentKeyType === COMPARISON_KEY_TYPE.GUID_BASED;
  }

  /**
   * 変更通知リスナーを登録
   * @param {Function} callback - コールバック関数 (newKeyType, oldKeyType) => void
   */
  onChange(callback) {
    if (typeof callback === 'function') {
      this.changeListeners.add(callback);
    }
  }

  /**
   * 変更通知リスナーを削除
   * @param {Function} callback - コールバック関数
   */
  offChange(callback) {
    this.changeListeners.delete(callback);
  }

  /**
   * 変更を通知
   * @param {string} newKeyType - 新しいキータイプ
   * @param {string} oldKeyType - 古いキータイプ
   * @private
   */
  notifyChange(newKeyType, oldKeyType) {
    // カスタムイベントを発行
    const event = new CustomEvent(COMPARISON_KEY_EVENTS.KEY_TYPE_CHANGED, {
      detail: { newKeyType, oldKeyType },
    });
    document.dispatchEvent(event);

    // 登録されたリスナーを実行
    this.changeListeners.forEach((callback) => {
      try {
        callback(newKeyType, oldKeyType);
      } catch (error) {
        console.error('[ComparisonKeyManager] Error in change listener:', error);
      }
    });
  }

  /**
   * デフォルト値にリセット
   */
  reset() {
    this.setKeyType(DEFAULT_COMPARISON_KEY_TYPE);
  }

  /**
   * デバッグ情報を取得
   * @returns {Object} デバッグ情報
   */
  getDebugInfo() {
    return {
      currentKeyType: this.currentKeyType,
      isPositionBased: this.isPositionBased(),
      isGuidBased: this.isGuidBased(),
      listenerCount: this.changeListeners.size,
    };
  }
}

// シングルトンインスタンスをエクスポート
const comparisonKeyManager = new ComparisonKeyManager();

// 開発者向けにwindowに公開
if (typeof window !== 'undefined') {
  window.comparisonKeyManager = comparisonKeyManager;
}

export default comparisonKeyManager;

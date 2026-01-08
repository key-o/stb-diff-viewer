/**
 * BaseElementStateManager - 要素状態管理の基底クラス
 *
 * 各要素タイプの状態管理に共通するパターンを提供します。
 * DisplayModeManager、LabelDisplayManager など、複数のマネージャークラスで
 * 共通化されるコードをこの基底クラスに集約します。
 *
 * 主な機能：
 * - 要素タイプごとの状態管理（Map）
 * - 状態変更時のコールバック機構（要素別 + グローバル）
 * - デバッグモード
 * - 一括操作（全要素への状態設定、リセット）
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('viewer/rendering/baseElementStateManager');

/**
 * BaseElementStateManagerクラス
 * サブクラスで継承して使用します
 */
class BaseElementStateManager {
  /**
   * コンストラクタ
   * @param {Array<string>} elementTypes - 管理対象の要素タイプリスト
   * @param {*} defaultState - デフォルトの状態値
   * @param {string} managerName - マネージャー名（ログ出力用）
   */
  constructor(elementTypes, defaultState, managerName = 'BaseElementStateManager') {
    // 管理対象の要素タイプリスト
    this.elementTypes = elementTypes;

    // デフォルトの状態値
    this.defaultState = defaultState;

    // マネージャー名（ログ出力用）
    this.managerName = managerName;

    // 各要素タイプの状態を保持するMap
    this.states = new Map();
    elementTypes.forEach((type) => {
      this.states.set(type, defaultState);
    });

    // 状態変更時のコールバック
    // key: 要素タイプ, value: コールバック関数の配列
    this.callbacks = new Map();
    elementTypes.forEach((type) => {
      this.callbacks.set(type, []);
    });

    // グローバルコールバック（全要素タイプ共通）
    this.globalCallbacks = [];

    // デバッグモード
    this.debugMode = false;
  }

  /**
   * 状態を取得
   * @param {string} elementType - 要素タイプ
   * @returns {*} 状態値
   */
  getState(elementType) {
    if (!this.states.has(elementType)) {
      log.warn(`[${this.managerName}] Unknown element type: ${elementType}`);
      return this.defaultState;
    }
    return this.states.get(elementType);
  }

  /**
   * 状態を設定
   * @param {string} elementType - 要素タイプ
   * @param {*} newState - 新しい状態値
   * @returns {boolean} 設定成功フラグ
   */
  setState(elementType, newState) {
    if (!this.states.has(elementType)) {
      log.warn(`[${this.managerName}] Unknown element type: ${elementType}`);
      return false;
    }

    // サブクラスでの追加バリデーション
    if (!this._validateState(newState)) {
      log.warn(`[${this.managerName}] Invalid state: ${newState}`);
      return false;
    }

    const oldState = this.states.get(elementType);
    if (oldState === newState) {
      // 変更なし
      return true;
    }

    this.states.set(elementType, newState);

    if (this.debugMode) {
    }

    // コールバックを実行
    this._executeCallbacks(elementType, newState, oldState);

    return true;
  }

  /**
   * 状態の妥当性をチェック（サブクラスでオーバーライド可能）
   * @param {*} state - チェックする状態値
   * @returns {boolean} 妥当ならtrue
   * @protected
   */
  _validateState(state) {
    // デフォルトでは常にtrue（サブクラスでオーバーライドして使用）
    return true;
  }

  /**
   * 全要素タイプの状態を設定
   * @param {*} state - 設定する状態値
   */
  setAllStates(state) {
    this.elementTypes.forEach((type) => {
      this.setState(type, state);
    });
  }

  /**
   * 状態変更時のコールバックを登録
   * @param {string|Function} elementType - 要素タイプ（functionの場合は全要素共通）
   * @param {Function} callback - コールバック関数 (newState, oldState, elementType) => {}
   * @returns {Function} コールバック解除用関数
   */
  onChange(elementType, callback) {
    if (typeof elementType === 'function') {
      // 第一引数がfunctionの場合、グローバルコールバックとして登録
      callback = elementType;
      this.globalCallbacks.push(callback);

      // 解除用関数を返す
      return () => {
        const index = this.globalCallbacks.indexOf(callback);
        if (index > -1) {
          this.globalCallbacks.splice(index, 1);
        }
      };
    }

    if (!this.callbacks.has(elementType)) {
      log.warn(`[${this.managerName}] Unknown element type: ${elementType}`);
      return () => {};
    }

    this.callbacks.get(elementType).push(callback);

    // 解除用関数を返す
    return () => {
      const callbacks = this.callbacks.get(elementType);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    };
  }

  /**
   * コールバックを実行
   * @param {string} elementType - 要素タイプ
   * @param {*} newState - 新しい状態値
   * @param {*} oldState - 古い状態値
   * @private
   */
  _executeCallbacks(elementType, newState, oldState) {
    // 要素タイプ固有のコールバック
    const typeCallbacks = this.callbacks.get(elementType) || [];
    typeCallbacks.forEach((callback) => {
      try {
        callback(newState, oldState, elementType);
      } catch (error) {
        log.error(`[${this.managerName}] Callback error for ${elementType}:`, error);
      }
    });

    // グローバルコールバック
    this.globalCallbacks.forEach((callback) => {
      try {
        callback(newState, oldState, elementType);
      } catch (error) {
        log.error(`[${this.managerName}] Global callback error:`, error);
      }
    });
  }

  /**
   * すべての状態を取得
   * @returns {Object} 要素タイプをキー、状態を値とするオブジェクト
   */
  getAllStates() {
    const states = {};
    this.states.forEach((state, type) => {
      states[type] = state;
    });
    return states;
  }

  /**
   * デバッグモードの切り替え
   * @param {boolean} enabled - デバッグモード有効化フラグ
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
    if (enabled) {
    }
  }

  /**
   * デバッグ情報を取得
   * @returns {Object} デバッグ情報
   */
  getDebugInfo() {
    return {
      managerName: this.managerName,
      elementTypes: [...this.elementTypes],
      states: this.getAllStates(),
      callbackCounts: Object.fromEntries(
        Array.from(this.callbacks.entries()).map(([type, callbacks]) => [type, callbacks.length]),
      ),
      globalCallbackCount: this.globalCallbacks.length,
      debugMode: this.debugMode,
    };
  }

  /**
   * 状態をリセット
   */
  reset() {
    // すべてデフォルト状態に戻す
    this.elementTypes.forEach((type) => {
      this.states.set(type, this.defaultState);
    });

    if (this.debugMode) {
    }
  }
}

// BaseElementStateManagerクラスをエクスポート
export { BaseElementStateManager };
export default BaseElementStateManager;

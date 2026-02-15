/**
 * ModelVisibilityManager - モデル表示状態管理
 *
 * モデルA/Bの表示・非表示状態を管理します。
 */

import { BaseElementStateManager } from './baseElementStateManager.js';

// モデルタイプ
const MODEL_TYPES = ['A', 'B'];

/**
 * ModelVisibilityManagerクラス
 */
class ModelVisibilityManager extends BaseElementStateManager {
  constructor() {
    // 基底クラスのコンストラクタを呼び出し（デフォルトはすべて表示）
    super(MODEL_TYPES, true, 'ModelVisibilityManager');
  }

  /**
   * 状態の妥当性をチェック（オーバーライド）
   * @param {boolean} state - チェックする状態値
   * @returns {boolean} 妥当ならtrue
   * @protected
   */
  _validateState(state) {
    return typeof state === 'boolean';
  }

  /**
   * モデル表示状態を取得
   * @param {string} model - モデル ("A" または "B")
   * @returns {boolean} 表示状態
   */
  isModelVisible(model) {
    return this.getState(model);
  }

  /**
   * モデル表示状態を設定
   * @param {string} model - モデル ("A" または "B")
   * @param {boolean} visible - 表示状態
   * @returns {boolean} 設定成功フラグ
   */
  setModelVisibility(model, visible) {
    return this.setState(model, visible);
  }

  /**
   * モデルを表示
   * @param {string} model - モデル ("A" または "B")
   * @returns {boolean} 設定成功フラグ
   */
  showModel(model) {
    return this.setModelVisibility(model, true);
  }

  /**
   * モデルを非表示
   * @param {string} model - モデル ("A" または "B")
   * @returns {boolean} 設定成功フラグ
   */
  hideModel(model) {
    return this.setModelVisibility(model, false);
  }

  /**
   * モデル表示をトグル
   * @param {string} model - モデル ("A" または "B")
   * @returns {boolean} 新しい表示状態
   */
  toggleModelVisibility(model) {
    const currentValue = this.isModelVisible(model);
    const newValue = !currentValue;
    this.setModelVisibility(model, newValue);
    return newValue;
  }

  /**
   * すべてのモデル表示状態を取得
   * @returns {Object} モデルをキー、表示状態を値とするオブジェクト
   */
  getAllModelVisibility() {
    return this.getAllStates();
  }

  /**
   * 表示中のモデルを取得
   * @returns {Array<string>} 表示中のモデルの配列
   */
  getVisibleModels() {
    const visibleModels = [];
    this.states.forEach((visible, model) => {
      if (visible) {
        visibleModels.push(model);
      }
    });
    return visibleModels;
  }

  /**
   * デバッグ情報を取得（オーバーライド）
   * @returns {Object} デバッグ情報
   */
  getDebugInfo() {
    return {
      modelVisibility: this.getAllModelVisibility(),
      visibleModels: this.getVisibleModels(),
      callbackCounts: Object.fromEntries(
        Array.from(this.callbacks.entries()).map(([type, callbacks]) => [type, callbacks.length]),
      ),
      globalCallbackCount: this.globalCallbacks.length,
      debugMode: this.debugMode,
    };
  }
}

// シングルトンインスタンスを作成してエクスポート
const modelVisibilityManager = new ModelVisibilityManager();

export { modelVisibilityManager };
export default modelVisibilityManager;

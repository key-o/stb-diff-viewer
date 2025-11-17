/**
 * LabelDisplayManager - ID表示の一元管理
 *
 * 各要素タイプのラベル（ID）表示の有効/無効を管理し、
 * BaseElementStateManagerを継承してシンプルな実装を提供します。
 */

import { BaseElementStateManager } from "./baseElementStateManager.js";

/**
 * ラベル表示可能な要素タイプ
 */
const LABEL_TYPES = [
  "Node",
  "Column",
  "Girder",
  "Beam",
  "Brace",
  "Post",
  "Slab",
  "Wall",
  "Axis",
  "Story",
  "FoundationColumn",
  "Footing",
  "Pile",
];

/**
 * LabelDisplayManagerクラス
 * BaseElementStateManagerを継承
 */
class LabelDisplayManager extends BaseElementStateManager {
  constructor() {
    // 基底クラスのコンストラクタを呼び出し（デフォルトはすべて非表示）
    super(LABEL_TYPES, false, "LabelDisplayManager");
  }

  /**
   * 状態の妥当性をチェック（オーバーライド）
   * @param {boolean} state - チェックする状態値
   * @returns {boolean} 妥当ならtrue
   * @protected
   */
  _validateState(state) {
    return typeof state === "boolean";
  }

  /**
   * ラベル表示状態を取得
   * @param {string} elementType - 要素タイプ
   * @returns {boolean} ラベル表示が有効ならtrue
   */
  isLabelVisible(elementType) {
    return this.getState(elementType);
  }

  /**
   * ラベル表示状態を設定
   * @param {string} elementType - 要素タイプ
   * @param {boolean} visible - ラベル表示フラグ
   * @returns {boolean} 設定成功フラグ
   */
  setLabelVisibility(elementType, visible) {
    return this.setState(elementType, visible);
  }

  /**
   * ラベルを表示
   * @param {string} elementType - 要素タイプ
   * @returns {boolean} 設定成功フラグ
   */
  showLabel(elementType) {
    return this.setLabelVisibility(elementType, true);
  }

  /**
   * ラベルを非表示
   * @param {string} elementType - 要素タイプ
   * @returns {boolean} 設定成功フラグ
   */
  hideLabel(elementType) {
    return this.setLabelVisibility(elementType, false);
  }

  /**
   * ラベル表示をトグル
   * @param {string} elementType - 要素タイプ
   * @returns {boolean} 新しい表示状態
   */
  toggleLabelVisibility(elementType) {
    const currentValue = this.isLabelVisible(elementType);
    const newValue = !currentValue;
    this.setLabelVisibility(elementType, newValue);
    return newValue;
  }

  /**
   * 全要素タイプのラベル表示を設定
   * @param {boolean} visible - ラベル表示フラグ
   */
  setAllLabelVisibility(visible) {
    this.setAllStates(visible);
  }

  /**
   * すべてのラベルを表示
   */
  showAllLabels() {
    this.setAllLabelVisibility(true);
  }

  /**
   * すべてのラベルを非表示
   */
  hideAllLabels() {
    this.setAllLabelVisibility(false);
  }

  /**
   * すべてのラベル表示状態を取得
   * @returns {Object} 要素タイプをキー、表示状態を値とするオブジェクト
   */
  getAllLabelVisibility() {
    return this.getAllStates();
  }

  /**
   * 表示中のラベルタイプを取得
   * @returns {Array<string>} 表示中の要素タイプの配列
   */
  getVisibleLabelTypes() {
    const visibleTypes = [];
    this.states.forEach((visible, type) => {
      if (visible) {
        visibleTypes.push(type);
      }
    });
    return visibleTypes;
  }

  /**
   * 非表示のラベルタイプを取得
   * @returns {Array<string>} 非表示の要素タイプの配列
   */
  getHiddenLabelTypes() {
    const hiddenTypes = [];
    this.states.forEach((visible, type) => {
      if (!visible) {
        hiddenTypes.push(type);
      }
    });
    return hiddenTypes;
  }

  /**
   * チェックボックスの状態と同期
   * @param {string} elementType - 要素タイプ
   * @param {string} checkboxId - チェックボックスのID（省略時は "toggleLabel-{elementType}"）
   */
  syncWithCheckbox(elementType, checkboxId = null) {
    const id = checkboxId || `toggleLabel-${elementType}`;
    const checkbox = document.getElementById(id);

    if (!checkbox) {
      console.warn(`[LabelDisplayManager] Checkbox not found: ${id}`);
      return;
    }

    if (this.debugMode) {
      console.log(
        `[LabelDisplayManager] syncWithCheckbox: ${elementType} = ${checkbox.checked}`
      );
    }
    this.setLabelVisibility(elementType, checkbox.checked);
  }

  /**
   * すべてのチェックボックスと同期
   */
  syncAllWithCheckboxes() {
    LABEL_TYPES.forEach((type) => {
      this.syncWithCheckbox(type);
    });
  }

  /**
   * デバッグ情報を取得（オーバーライド）
   * @returns {Object} デバッグ情報
   */
  getDebugInfo() {
    return {
      labelVisibility: this.getAllLabelVisibility(),
      visibleTypes: this.getVisibleLabelTypes(),
      hiddenTypes: this.getHiddenLabelTypes(),
      callbackCounts: Object.fromEntries(
        Array.from(this.callbacks.entries()).map(([type, callbacks]) => [
          type,
          callbacks.length,
        ])
      ),
      globalCallbackCount: this.globalCallbacks.length,
      debugMode: this.debugMode,
    };
  }
}

// シングルトンインスタンスを作成してエクスポート
const labelDisplayManager = new LabelDisplayManager();

// 定数もエクスポート
export { labelDisplayManager, LabelDisplayManager, LABEL_TYPES };
export default labelDisplayManager;

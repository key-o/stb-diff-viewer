/**
 * DisplayModeManager - 立体表示の一元管理
 *
 * 各要素タイプの表示モード（line/solid）を管理し、
 * BaseElementStateManagerを継承してシンプルな実装を提供します。
 */

import { BaseElementStateManager } from './baseElementStateManager.js';
import { DISPLAY_MODE_ELEMENTS, SOLID_ONLY_ELEMENTS } from '../../constants/elementTypes.js';
import { DISPLAY_MODES } from '../../constants/displayModes.js';

/**
 * 表示可能な要素タイプ（切替対応要素 + 立体表示のみ要素）
 */
const ELEMENT_TYPES = [...DISPLAY_MODE_ELEMENTS, ...SOLID_ONLY_ELEMENTS];

/**
 * DisplayModeManagerクラス
 * BaseElementStateManagerを継承
 */
class DisplayModeManager extends BaseElementStateManager {
  constructor() {
    // 基底クラスのコンストラクタを呼び出し（デフォルトは立体表示）
    super(ELEMENT_TYPES, DISPLAY_MODES.SOLID, 'DisplayModeManager');
  }

  /**
   * 状態の妥当性をチェック（オーバーライド）
   * @param {string} state - チェックする状態値
   * @returns {boolean} 妥当ならtrue
   * @protected
   */
  _validateState(state) {
    return state === DISPLAY_MODES.LINE || state === DISPLAY_MODES.SOLID;
  }

  /**
   * 表示モードを取得
   * @param {string} elementType - 要素タイプ
   * @returns {string} 表示モード（"line" または "solid"）
   */
  getDisplayMode(elementType) {
    return this.getState(elementType);
  }

  /**
   * 表示モードを設定
   * @param {string} elementType - 要素タイプ
   * @param {string} mode - 表示モード（"line" または "solid"）
   * @returns {boolean} 設定成功フラグ
   */
  setDisplayMode(elementType, mode) {
    return this.setState(elementType, mode);
  }

  /**
   * 立体表示かどうかを判定
   * @param {string} elementType - 要素タイプ
   * @returns {boolean} 立体表示ならtrue
   */
  isSolidMode(elementType) {
    return this.getDisplayMode(elementType) === DISPLAY_MODES.SOLID;
  }

  /**
   * 線表示かどうかを判定
   * @param {string} elementType - 要素タイプ
   * @returns {boolean} 線表示ならtrue
   */
  isLineMode(elementType) {
    return this.getDisplayMode(elementType) === DISPLAY_MODES.LINE;
  }

  /**
   * 立体表示に切り替え
   * @param {string} elementType - 要素タイプ
   * @returns {boolean} 設定成功フラグ
   */
  setSolidMode(elementType) {
    return this.setDisplayMode(elementType, DISPLAY_MODES.SOLID);
  }

  /**
   * 線表示に切り替え
   * @param {string} elementType - 要素タイプ
   * @returns {boolean} 設定成功フラグ
   */
  setLineMode(elementType) {
    return this.setDisplayMode(elementType, DISPLAY_MODES.LINE);
  }

  /**
   * 表示モードをトグル
   * @param {string} elementType - 要素タイプ
   * @returns {string} 新しい表示モード
   */
  toggleDisplayMode(elementType) {
    const currentMode = this.getDisplayMode(elementType);
    const newMode = currentMode === DISPLAY_MODES.LINE ? DISPLAY_MODES.SOLID : DISPLAY_MODES.LINE;
    this.setDisplayMode(elementType, newMode);
    return newMode;
  }

  /**
   * 全要素タイプの表示モードを設定
   * @param {string} mode - 表示モード（"line" または "solid"）
   */
  setAllDisplayModes(mode) {
    this.setAllStates(mode);
  }

  /**
   * すべての表示モードを取得
   * @returns {Object} 要素タイプをキー、表示モードを値とするオブジェクト
   */
  getAllDisplayModes() {
    return this.getAllStates();
  }

  /**
   * デバッグ情報を取得（オーバーライド）
   * @returns {Object} デバッグ情報
   */
  getDebugInfo() {
    return {
      displayModes: this.getAllDisplayModes(),
      callbackCounts: Object.fromEntries(
        Array.from(this.callbacks.entries()).map(([type, callbacks]) => [type, callbacks.length]),
      ),
      globalCallbackCount: this.globalCallbacks.length,
      debugMode: this.debugMode,
    };
  }
}

// シングルトンインスタンスを作成してエクスポート
const displayModeManager = new DisplayModeManager();

// 定数もエクスポート
export { displayModeManager, DisplayModeManager, ELEMENT_TYPES, DISPLAY_MODES };
export default displayModeManager;

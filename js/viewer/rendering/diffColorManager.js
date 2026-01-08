/**
 * DiffColorManager - 差分表示色管理
 *
 * モデル比較時の差分表示用の色を管理します。
 * - 3段階分類（従来）: matched, onlyA, onlyB
 * - 5段階分類（許容差対応）: exact, withinTolerance, mismatch, onlyA, onlyB
 */

import { BaseColorStateManager } from './baseColorStateManager.js';
import {
  DIFF_COLORS,
  TOLERANCE_DIFF_COLORS as CONFIG_TOLERANCE_COLORS,
} from '../../config/colorConfig.js';

// 差分状態タイプ（6カテゴリ）
// - 存在差分: matched, onlyA, onlyB
// - 内容差分: positionTolerance, attributeMismatch, combined
const DIFF_STATES = [
  'matched',
  'onlyA',
  'onlyB',
  'positionTolerance',
  'attributeMismatch',
  'combined',
  'mismatch', // レガシー互換
];

// 許容差対応の分類状態タイプ（内部使用）
const TOLERANCE_DIFF_STATES = ['exact', 'withinTolerance', 'mismatch', 'onlyA', 'onlyB'];

// デフォルト色設定（6カテゴリ）- colorConfigから取得
const DEFAULT_DIFF_COLORS = { ...DIFF_COLORS };

// デフォルト色設定（許容差対応 - 内部使用）- colorConfigから取得
const DEFAULT_TOLERANCE_DIFF_COLORS = { ...CONFIG_TOLERANCE_COLORS };

/**
 * DiffColorManagerクラス
 */
class DiffColorManager extends BaseColorStateManager {
  constructor() {
    super(DIFF_STATES, DEFAULT_DIFF_COLORS, 'DiffColorManager');

    // 5段階分類用の色設定を別途管理
    this.toleranceColors = new Map();
    TOLERANCE_DIFF_STATES.forEach((state) => {
      this.toleranceColors.set(state, DEFAULT_TOLERANCE_DIFF_COLORS[state]);
    });
  }

  /**
   * 差分色を取得（3段階）
   * @param {string} state - 比較状態 ('matched', 'onlyA', 'onlyB')
   * @returns {string} 色コード
   */
  getDiffColor(state) {
    return this.getColor(state);
  }

  /**
   * 差分色を設定（3段階）
   * @param {string} state - 比較状態 ('matched', 'onlyA', 'onlyB')
   * @param {string} color - 色コード
   * @returns {boolean} 設定成功フラグ
   */
  setDiffColor(state, color) {
    return this.setColor(state, color);
  }

  /**
   * 全ての差分色を取得（3段階）
   * @returns {Object} 比較状態をキー、色コードを値とするオブジェクト
   */
  getAllDiffColors() {
    return this.getAllColors();
  }

  /**
   * 許容差対応の差分色を取得（5段階）
   * @param {string} state - 比較状態 ('exact', 'withinTolerance', 'mismatch', 'onlyA', 'onlyB')
   * @returns {string} 色コード
   */
  getToleranceDiffColor(state) {
    if (!TOLERANCE_DIFF_STATES.includes(state)) {
      console.warn(`[DiffColorManager] Invalid tolerance diff state: ${state}`);
      return '#888888';
    }
    return this.toleranceColors.get(state) || '#888888';
  }

  /**
   * 許容差対応の差分色を設定（5段階）
   * @param {string} state - 比較状態 ('exact', 'withinTolerance', 'mismatch', 'onlyA', 'onlyB')
   * @param {string} color - 色コード
   * @returns {boolean} 設定成功フラグ
   */
  setToleranceDiffColor(state, color) {
    if (!TOLERANCE_DIFF_STATES.includes(state)) {
      console.warn(`[DiffColorManager] Invalid tolerance diff state: ${state}`);
      return false;
    }

    if (!this._validateState(color)) {
      console.warn(`[DiffColorManager] Invalid color format: ${color}`);
      return false;
    }

    this.toleranceColors.set(state, color);
    this._executeColorChangeCallbacks(state, color);

    if (this.debugMode) {
    }

    return true;
  }

  /**
   * 全ての許容差対応差分色を取得（5段階）
   * @returns {Object} 比較状態をキー、色コードを値とするオブジェクト
   */
  getAllToleranceDiffColors() {
    const colors = {};
    TOLERANCE_DIFF_STATES.forEach((state) => {
      colors[state] = this.toleranceColors.get(state);
    });
    return colors;
  }

  /**
   * 許容差対応差分色をデフォルトにリセット
   */
  resetToleranceColorsToDefault() {
    TOLERANCE_DIFF_STATES.forEach((state) => {
      this.toleranceColors.set(state, DEFAULT_TOLERANCE_DIFF_COLORS[state]);
    });
    this._executeColorChangeCallbacks(null, null);

    if (this.debugMode) {
    }
  }
}

// シングルトンインスタンスを作成してエクスポート
const diffColorManager = new DiffColorManager();

export {
  diffColorManager,
  DiffColorManager,
  DIFF_STATES,
  TOLERANCE_DIFF_STATES,
  DEFAULT_DIFF_COLORS,
  DEFAULT_TOLERANCE_DIFF_COLORS,
};
export default diffColorManager;

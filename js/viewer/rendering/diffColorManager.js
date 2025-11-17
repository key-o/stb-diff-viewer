/**
 * DiffColorManager - 差分表示色管理
 *
 * モデル比較時の差分表示用の色を管理します。
 */

import { BaseColorStateManager } from './baseColorStateManager.js';

// 差分状態タイプ
const DIFF_STATES = ['matched', 'onlyA', 'onlyB'];

// デフォルト色設定
const DEFAULT_DIFF_COLORS = {
  matched: '#00aaff',   // 一致要素（水色）
  onlyA: '#00ff00',     // モデルA専用（緑）
  onlyB: '#ff0000',     // モデルB専用（赤）
};

/**
 * DiffColorManagerクラス
 */
class DiffColorManager extends BaseColorStateManager {
  constructor() {
    super(DIFF_STATES, DEFAULT_DIFF_COLORS, 'DiffColorManager');
  }

  /**
   * 差分色を取得
   * @param {string} state - 比較状態 ('matched', 'onlyA', 'onlyB')
   * @returns {string} 色コード
   */
  getDiffColor(state) {
    return this.getColor(state);
  }

  /**
   * 差分色を設定
   * @param {string} state - 比較状態 ('matched', 'onlyA', 'onlyB')
   * @param {string} color - 色コード
   * @returns {boolean} 設定成功フラグ
   */
  setDiffColor(state, color) {
    return this.setColor(state, color);
  }

  /**
   * 全ての差分色を取得
   * @returns {Object} 比較状態をキー、色コードを値とするオブジェクト
   */
  getAllDiffColors() {
    return this.getAllColors();
  }
}

// シングルトンインスタンスを作成してエクスポート
const diffColorManager = new DiffColorManager();

export { diffColorManager, DiffColorManager, DIFF_STATES, DEFAULT_DIFF_COLORS };
export default diffColorManager;

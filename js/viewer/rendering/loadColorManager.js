/**
 * LoadColorManager - 荷重表示色管理
 *
 * 各荷重タイプ（等分布荷重、集中荷重など）の色を管理します。
 * 色定義は colorConfig.js から取得します。
 */

import { BaseColorStateManager } from './baseColorStateManager.js';
import { DEFAULT_LOAD_COLORS as CONFIG_LOAD_COLORS } from '../../config/colorConfig.js';

// 荷重タイプ（colorConfigに含まれるすべてのタイプ）
const LOAD_TYPES = Object.keys(CONFIG_LOAD_COLORS);

// デフォルト色設定（colorConfig.jsから取得）
const DEFAULT_LOAD_COLORS = { ...CONFIG_LOAD_COLORS };

/**
 * LoadColorManagerクラス
 */
class LoadColorManager extends BaseColorStateManager {
  constructor() {
    super(LOAD_TYPES, DEFAULT_LOAD_COLORS, 'LoadColorManager');
  }

  /**
   * 荷重色を取得
   * @param {string} loadType - 荷重タイプ
   * @returns {string} 色コード
   */
  getLoadColor(loadType) {
    return this.getColor(loadType) || this.getColor('default');
  }

  /**
   * 荷重色を設定
   * @param {string} loadType - 荷重タイプ
   * @param {string} color - 色コード
   * @returns {boolean} 設定成功フラグ
   */
  setLoadColor(loadType, color) {
    return this.setColor(loadType, color);
  }

  /**
   * 全ての荷重色を取得
   * @returns {Object} 荷重タイプをキー、色コードを値とするオブジェクト
   */
  getAllLoadColors() {
    return this.getAllColors();
  }
}

// シングルトンインスタンスを作成してエクスポート
const loadColorManager = new LoadColorManager();

export { loadColorManager, LoadColorManager, LOAD_TYPES, DEFAULT_LOAD_COLORS };
export default loadColorManager;

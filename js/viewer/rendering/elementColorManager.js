/**
 * ElementColorManager - 部材別色管理
 *
 * 各要素タイプ（柱、梁、壁など）の色を管理します。
 * 色定義は colorConfig.js から取得します。
 */

import { BaseColorStateManager } from './baseColorStateManager.js';
import { DEFAULT_ELEMENT_COLORS as CONFIG_ELEMENT_COLORS } from '../../config/colorConfig.js';

// 部材タイプ（colorConfigに含まれるすべてのタイプ）
const ELEMENT_TYPES = Object.keys(CONFIG_ELEMENT_COLORS);

// デフォルト色設定（colorConfig.jsから取得）
const DEFAULT_ELEMENT_COLORS = { ...CONFIG_ELEMENT_COLORS };

/**
 * ElementColorManagerクラス
 */
class ElementColorManager extends BaseColorStateManager {
  constructor() {
    super(ELEMENT_TYPES, DEFAULT_ELEMENT_COLORS, 'ElementColorManager');
  }

  /**
   * 部材色を取得
   * @param {string} elementType - 要素タイプ
   * @returns {string} 色コード
   */
  getElementColor(elementType) {
    return this.getColor(elementType);
  }

  /**
   * 部材色を設定
   * @param {string} elementType - 要素タイプ
   * @param {string} color - 色コード
   * @returns {boolean} 設定成功フラグ
   */
  setElementColor(elementType, color) {
    return this.setColor(elementType, color);
  }

  /**
   * 全ての部材色を取得
   * @returns {Object} 要素タイプをキー、色コードを値とするオブジェクト
   */
  getAllElementColors() {
    return this.getAllColors();
  }
}

// シングルトンインスタンスを作成してエクスポート
const elementColorManager = new ElementColorManager();

export { elementColorManager, ElementColorManager, ELEMENT_TYPES, DEFAULT_ELEMENT_COLORS };
export default elementColorManager;

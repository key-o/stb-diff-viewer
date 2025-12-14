/**
 * ElementColorManager - 部材別色管理
 *
 * 各要素タイプ（柱、梁、壁など）の色を管理します。
 */

import { BaseColorStateManager } from './baseColorStateManager.js';

// 部材タイプ
const ELEMENT_TYPES = ['Column', 'Girder', 'Beam', 'Slab', 'Wall', 'Node'];

// デフォルト色設定
const DEFAULT_ELEMENT_COLORS = {
  Column: '#D2691E',    // サドルブラウン（柱）
  Girder: '#4169E1',    // ロイヤルブルー（大梁）
  Beam: '#32CD32',      // ライムグリーン（小梁）
  Slab: '#708090',      // スレートグレー（スラブ）
  Wall: '#CD853F',      // ペルー（壁）
  Node: '#FF6347'      // トマト色（節点）
};

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

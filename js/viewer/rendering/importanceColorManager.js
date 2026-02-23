/**
 * ImportanceColorManager - 重要度別色管理
 *
 * 重要度レベルごとの色と視覚スタイルを管理します。
 */

import { BaseColorStateManager } from './baseColorStateManager.js';
import { IMPORTANCE_LEVELS } from '../../constants/importanceLevels.js';
import { IMPORTANCE_COLORS } from '../../config/colorConfig.js';

// 重要度レベルタイプ
const IMPORTANCE_LEVEL_TYPES = Object.values(IMPORTANCE_LEVELS);

/**
 * ImportanceColorManagerクラス
 */
class ImportanceColorManager extends BaseColorStateManager {
  constructor() {
    super(IMPORTANCE_LEVEL_TYPES, IMPORTANCE_COLORS, 'ImportanceColorManager');

    // 重要度別視覚スタイル（違反/対象外の2値）
    this.visualStyles = {
      [IMPORTANCE_LEVELS.REQUIRED]: {
        opacity: 1.0,
        outlineWidth: 2.0,
        saturation: 1.0,
      },
      [IMPORTANCE_LEVELS.OPTIONAL]: {
        opacity: 1.0,
        outlineWidth: 2.0,
        saturation: 1.0,
      },
      [IMPORTANCE_LEVELS.UNNECESSARY]: {
        opacity: 1.0,
        outlineWidth: 2.0,
        saturation: 1.0,
      },
      [IMPORTANCE_LEVELS.NOT_APPLICABLE]: {
        opacity: 0.1,
        outlineWidth: 0.0,
        saturation: 0.1,
      },
    };
  }

  /**
   * 重要度色を取得
   * @param {string} importanceLevel - 重要度レベル
   * @returns {string} 色コード
   */
  getImportanceColor(importanceLevel) {
    // ColorManager内部のMapから色を取得（単一データソース）
    return this.getColor(importanceLevel);
  }

  /**
   * 重要度色を設定
   * @param {string} importanceLevel - 重要度レベル
   * @param {string} color - 色コード
   * @returns {boolean} 設定成功フラグ
   */
  setImportanceColor(importanceLevel, color) {
    // ColorManager内部のMapのみを更新（単一データソース）
    return this.setColor(importanceLevel, color);
  }

  /**
   * 全ての重要度色を取得
   * @returns {Object} 重要度レベルをキー、色コードを値とするオブジェクト
   */
  getAllImportanceColors() {
    return this.getAllColors();
  }

  /**
   * 重要度別視覚スタイルを取得
   * @param {string} importanceLevel - 重要度レベル
   * @returns {Object} 視覚スタイル
   */
  getVisualStyle(importanceLevel) {
    return this.visualStyles[importanceLevel] || this.visualStyles[IMPORTANCE_LEVELS.REQUIRED];
  }

  /**
   * デバッグ情報を取得（オーバーライド）
   * @returns {Object} デバッグ情報
   */
  getDebugInfo() {
    const baseInfo = super.getDebugInfo();
    return {
      ...baseInfo,
      visualStyles: { ...this.visualStyles },
    };
  }
}

// シングルトンインスタンスを作成してエクスポート
const importanceColorManager = new ImportanceColorManager();

export default importanceColorManager;

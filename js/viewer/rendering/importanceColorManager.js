/**
 * ImportanceColorManager - 重要度別色管理
 *
 * 重要度レベルごとの色と視覚スタイルを管理します。
 */

import { BaseColorStateManager } from './baseColorStateManager.js';
import { IMPORTANCE_LEVELS } from '../../core/importanceManager.js';
import { IMPORTANCE_COLORS } from '../../config/importanceConfig.js';

// 重要度レベルタイプ
const IMPORTANCE_LEVEL_TYPES = Object.values(IMPORTANCE_LEVELS);

/**
 * ImportanceColorManagerクラス
 */
class ImportanceColorManager extends BaseColorStateManager {
  constructor() {
    super(IMPORTANCE_LEVEL_TYPES, IMPORTANCE_COLORS, 'ImportanceColorManager');

    // 重要度別視覚スタイル
    this.visualStyles = {
      [IMPORTANCE_LEVELS.REQUIRED]: {
        opacity: 1.0,
        outlineWidth: 2.0,
        saturation: 1.0,
      },
      [IMPORTANCE_LEVELS.OPTIONAL]: {
        opacity: 0.8,
        outlineWidth: 1.0,
        saturation: 0.7,
      },
      [IMPORTANCE_LEVELS.UNNECESSARY]: {
        opacity: 0.4,
        outlineWidth: 0.5,
        saturation: 0.3,
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
    // ランタイム色設定を優先
    if (window.runtimeImportanceColors && window.runtimeImportanceColors[importanceLevel]) {
      return window.runtimeImportanceColors[importanceLevel];
    }
    return this.getColor(importanceLevel);
  }

  /**
   * 重要度色を設定
   * @param {string} importanceLevel - 重要度レベル
   * @param {string} color - 色コード
   * @returns {boolean} 設定成功フラグ
   */
  setImportanceColor(importanceLevel, color) {
    const success = this.setColor(importanceLevel, color);

    if (success) {
      // ランタイム色設定も更新
      if (!window.runtimeImportanceColors) {
        window.runtimeImportanceColors = {};
      }
      window.runtimeImportanceColors[importanceLevel] = color;
    }

    return success;
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
      runtimeColors: window.runtimeImportanceColors || {}
    };
  }
}

// シングルトンインスタンスを作成してエクスポート
const importanceColorManager = new ImportanceColorManager();

export { importanceColorManager, ImportanceColorManager, IMPORTANCE_LEVEL_TYPES };
export default importanceColorManager;

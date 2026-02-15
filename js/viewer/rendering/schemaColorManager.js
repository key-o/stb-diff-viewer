/**
 * SchemaColorManager - スキーマエラー色管理
 *
 * スキーマチェック結果に基づく色を管理します。
 * 色定義は colorConfig.js から取得します。
 */

import { BaseColorStateManager } from './baseColorStateManager.js';
import { DEFAULT_SCHEMA_COLORS as CONFIG_SCHEMA_COLORS } from '../../config/colorConfig.js';

// スキーマ状態タイプ
const SCHEMA_STATES = Object.keys(CONFIG_SCHEMA_COLORS);

// デフォルト色設定（colorConfig.jsから取得）
const DEFAULT_SCHEMA_COLORS = { ...CONFIG_SCHEMA_COLORS };

/**
 * SchemaColorManagerクラス
 */
class SchemaColorManager extends BaseColorStateManager {
  constructor() {
    super(SCHEMA_STATES, DEFAULT_SCHEMA_COLORS, 'SchemaColorManager');
  }

  /**
   * スキーマ色を取得
   * @param {string} status - ステータス ('valid', 'info', 'warning', 'error')
   * @returns {string} 色コード
   */
  getSchemaColor(status) {
    return this.getColor(status) || this.getColor('valid');
  }

  /**
   * スキーマ色を設定
   * @param {string} type - 'valid' または 'error'
   * @param {string} color - 色コード
   * @returns {boolean} 設定成功フラグ
   */
  setSchemaColor(type, color) {
    return this.setColor(type, color);
  }

  /**
   * 全てのスキーマ色を取得
   * @returns {Object} 状態をキー、色コードを値とするオブジェクト
   */
  getAllSchemaColors() {
    return this.getAllColors();
  }
}

// シングルトンインスタンスを作成してエクスポート
const schemaColorManager = new SchemaColorManager();

export { DEFAULT_SCHEMA_COLORS };
export default schemaColorManager;

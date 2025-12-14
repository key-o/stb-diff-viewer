/**
 * SchemaColorManager - スキーマエラー色管理
 *
 * スキーマチェック結果に基づく色を管理します。
 */

import { BaseColorStateManager } from './baseColorStateManager.js';

// スキーマ状態タイプ
const SCHEMA_STATES = ['valid', 'info', 'warning', 'error'];

// デフォルト色設定
const DEFAULT_SCHEMA_COLORS = {
  valid: '#00aaff',     // 正常要素（水色）
  info: '#32CD32',      // 自動修復可能（ライムグリーン）
  warning: '#FFA500',   // 要確認（オレンジ）
  error: '#ff0000'     // エラー要素（赤色）
};

/**
 * SchemaColorManagerクラス
 */
class SchemaColorManager extends BaseColorStateManager {
  constructor() {
    super(SCHEMA_STATES, DEFAULT_SCHEMA_COLORS, 'SchemaColorManager');
  }

  /**
   * スキーマ色を取得
   * @param {string|boolean} status - ステータス ('valid', 'info', 'warning', 'error') または hasError (boolean)
   * @returns {string} 色コード
   */
  getSchemaColor(status) {
    // booleanの場合は後方互換性のため変換
    if (typeof status === 'boolean') {
      return this.getColor(status ? 'error' : 'valid');
    }
    // 文字列の場合はそのまま使用（デフォルトはvalid）
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

export { schemaColorManager, SchemaColorManager, SCHEMA_STATES, DEFAULT_SCHEMA_COLORS };
export default schemaColorManager;

/**
 * @fileoverview バリデーション共通定数
 *
 * 重要度・カテゴリ・サジェストタイプの定数定義。
 * stbValidator / jsonSchemaValidator / mvdValidator / validationManager 間の
 * 循環依存を解消するために分離されています。
 *
 * @module common-stb/validation/validationConstants
 */

/**
 * バリデーション問題の重要度レベル
 */
export const SEVERITY = {
  ERROR: 'error', // データが使用不可
  WARNING: 'warning', // 使用可能だが確認推奨
  INFO: 'info', // 情報提供のみ
};

/**
 * バリデーション問題のカテゴリ
 */
export const CATEGORY = {
  STRUCTURE: 'structure', // 構造的な問題
  REFERENCE: 'reference', // 参照整合性
  DATA: 'data', // データ値の問題
  GEOMETRY: 'geometry', // 幾何学的問題
  DUPLICATE: 'duplicate', // 重複問題
  SCHEMA: 'schema', // XSDスキーマ制約違反
  MVD: 'mvd', // MVD必須属性違反
};

/**
 * バリデーション結果のサジェストタイプ
 */
export const SUGGESTION_TYPE = {
  AUTO_REPAIR: 'auto_repair', // 自動修復可能
  MANUAL_REVIEW: 'manual_review', // 手動確認が必要
  MANUAL_FIX: 'manual_fix', // 手動修正が必要
  INFO_ONLY: 'info_only', // 情報のみ（修正不要）
};

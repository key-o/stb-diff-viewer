/**
 * @fileoverview 色設定の定数
 *
 * マテリアルデザインカラーパレットに基づく色設定
 */

/**
 * 要素タイプ別のデフォルト色設定
 * @type {Object.<string, string>}
 */
export const DEFAULT_ELEMENT_COLORS = {
  Column: '#795548',           // マテリアルブラウン（柱らしい色）
  Post: '#8BC34A',             // マテリアルライトグリーン（間柱用）
  Girder: '#2196F3',           // マテリアルブルー（大梁用）
  Beam: '#4CAF50',             // マテリアルグリーン（小梁用）
  Brace: '#FF9800',            // マテリアルオレンジ（ブレース用）
  Slab: '#9E9E9E',             // マテリアルグレー（スラブ用）
  Wall: '#FF5722',             // マテリアルディープオレンジ（壁用）
  Node: '#E91E63',             // マテリアルピンク（節点用 - 目立つ色）
  Pile: '#607D8B',             // マテリアルブルーグレー（杭用）
  Footing: '#9C27B0',          // マテリアルパープル（基礎用）
  FoundationColumn: '#00BCD4'  // マテリアルシアン（基礎柱用）
};

/**
 * スキーマ検証結果の色設定
 * @type {Object.<string, string>}
 */
export const DEFAULT_SCHEMA_COLORS = {
  valid: '#4CAF50',   // 正常要素（マテリアルグリーン）
  info: '#2196F3',    // 自動修復可能（マテリアルブルー）
  warning: '#FF9800', // 要確認（マテリアルオレンジ）
  error: '#F44336'    // エラー要素（マテリアルレッド）
};

/**
 * 差分表示モードの色設定
 * @type {Object.<string, string>}
 */
export const DIFF_COLORS = {
  matched: '#4CAF50',  // 一致要素（グリーン）
  onlyA: '#2196F3',    // モデルAのみ（ブルー）
  onlyB: '#F44336',    // モデルBのみ（レッド）
  mismatch: '#FF9800'  // 属性不一致（オレンジ）
};

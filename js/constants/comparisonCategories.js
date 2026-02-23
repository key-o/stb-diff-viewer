/**
 * @fileoverview 比較結果カテゴリの正規定義
 *
 * 比較戦略の出力を統一する5段階分類と、将来の拡張に対応する
 * カテゴリ定義を提供します。
 *
 * Layer 0 (constants) - 全レイヤーからインポート可能
 */

/**
 * 比較結果カテゴリ（正規enum）
 *
 * 現在の5段階:
 * - exact: 位置完全一致 + 属性一致
 * - withinTolerance: 位置許容差内 + 属性一致
 * - attributeMismatch: 位置一致/許容差内 + 属性不一致
 * - onlyA: モデルAのみ
 * - onlyB: モデルBのみ
 *
 * 将来追加予定:
 * - sectionDiff: 断面情報のみ異なる
 * - propertyDiff: プロパティが異なる
 */
export const COMPARISON_CATEGORY = Object.freeze({
  EXACT: 'exact',
  WITHIN_TOLERANCE: 'withinTolerance',
  ATTRIBUTE_MISMATCH: 'attributeMismatch',
  ONLY_A: 'onlyA',
  ONLY_B: 'onlyB',
});

/** 全カテゴリの配列（イテレーション用） */
export const ALL_CATEGORIES = Object.freeze(Object.values(COMPARISON_CATEGORY));

/** 両モデルに存在する要素のカテゴリ */
export const MATCHED_CATEGORIES = Object.freeze([
  COMPARISON_CATEGORY.EXACT,
  COMPARISON_CATEGORY.WITHIN_TOLERANCE,
  COMPARISON_CATEGORY.ATTRIBUTE_MISMATCH,
]);

/** 片方のモデルにのみ存在する要素のカテゴリ */
export const ONLY_CATEGORIES = Object.freeze([
  COMPARISON_CATEGORY.ONLY_A,
  COMPARISON_CATEGORY.ONLY_B,
]);

/**
 * カテゴリがマッチ（両モデルに存在）カテゴリかどうかを判定
 * @param {string} category - カテゴリ値
 * @returns {boolean}
 */
export function isMatchedCategory(category) {
  return MATCHED_CATEGORIES.includes(category);
}

/**
 * カテゴリからモデルソース文字列を取得
 * レンダリング層でuserData.modelSourceに設定する値を返す
 * @param {string} category - COMPARISON_CATEGORYの値
 * @returns {string} 'matched' | 'A' | 'B'
 */
export function categoryToModelSource(category) {
  if (category === COMPARISON_CATEGORY.ONLY_A) return 'A';
  if (category === COMPARISON_CATEGORY.ONLY_B) return 'B';
  return 'matched';
}

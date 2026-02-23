/**
 * @fileoverview 比較結果の正規化レイヤー
 *
 * あらゆる比較戦略（Basic / Tolerance / Importance）の出力を
 * 5段階カテゴリの正規形式に変換し、後方互換のgetterを付与します。
 *
 * Layer 1 (data) - app/, services/, viewer/, ui/ からインポート可能
 */

import {
  COMPARISON_CATEGORY,
  ALL_CATEGORIES,
  MATCHED_CATEGORIES,
} from '../constants/comparisonCategories.js';

/**
 * 比較戦略の出力を正規5カテゴリ形式に変換する
 *
 * 正規化後のオブジェクトは以下の構造を持つ:
 * - [COMPARISON_CATEGORY.EXACT]: Array - 完全一致要素
 * - [COMPARISON_CATEGORY.WITHIN_TOLERANCE]: Array - 許容差内要素
 * - [COMPARISON_CATEGORY.ATTRIBUTE_MISMATCH]: Array - 属性不一致要素
 * - [COMPARISON_CATEGORY.ONLY_A]: Array - モデルAのみ
 * - [COMPARISON_CATEGORY.ONLY_B]: Array - モデルBのみ
 * - .matched (getter): exact + withinTolerance + attributeMismatch の合成
 *
 * 各マッチ要素には以下のメタデータが付与される:
 * - category: COMPARISON_CATEGORYの値
 * - matchType: 'exact' | 'withinTolerance' | 'attributeMismatch'
 * - positionState: 'exact' | 'withinTolerance'
 * - attributeState: 'matched' | 'mismatch'
 *
 * @param {Object} rawResult - 比較戦略の生出力
 * @returns {Object} 正規化された比較結果
 */
export function normalizeComparisonResult(rawResult) {
  if (!rawResult) {
    return createEmptyNormalized();
  }

  // ToleranceStrategy出力の検出: exactプロパティの存在で判別
  if (rawResult.exact !== undefined) {
    return normalizeToleranceResult(rawResult);
  }

  // BasicStrategy / Importance出力
  return normalizeBasicResult(rawResult);
}

/**
 * BasicStrategy出力を正規化
 * { matched, mismatch, onlyA, onlyB } → 5カテゴリ
 */
function normalizeBasicResult(rawResult) {
  const normalized = createEmptyNormalized();

  // matched → EXACT (位置完全一致、属性一致)
  if (rawResult.matched) {
    normalized[COMPARISON_CATEGORY.EXACT] = rawResult.matched.map((item) =>
      decorateMatchedItem(item, COMPARISON_CATEGORY.EXACT),
    );
  }

  // mismatch → ATTRIBUTE_MISMATCH (位置一致、属性不一致)
  if (rawResult.mismatch) {
    normalized[COMPARISON_CATEGORY.ATTRIBUTE_MISMATCH] = rawResult.mismatch.map((item) =>
      decorateMatchedItem(item, COMPARISON_CATEGORY.ATTRIBUTE_MISMATCH),
    );
  }

  // onlyA, onlyB はそのまま
  if (rawResult.onlyA) {
    normalized[COMPARISON_CATEGORY.ONLY_A] = rawResult.onlyA;
  }
  if (rawResult.onlyB) {
    normalized[COMPARISON_CATEGORY.ONLY_B] = rawResult.onlyB;
  }

  // 元の追加プロパティを保持 (importanceStats, filterSettings等)
  copyExtraProperties(rawResult, normalized);

  return normalized;
}

/**
 * ToleranceStrategy出力を正規化
 * { exact, withinTolerance, mismatch, onlyA, onlyB, matched } → 5カテゴリ
 */
function normalizeToleranceResult(rawResult) {
  const normalized = createEmptyNormalized();

  // exact → EXACT
  if (rawResult.exact) {
    normalized[COMPARISON_CATEGORY.EXACT] = rawResult.exact.map((item) =>
      decorateMatchedItem(item, COMPARISON_CATEGORY.EXACT),
    );
  }

  // withinTolerance → WITHIN_TOLERANCE
  if (rawResult.withinTolerance) {
    normalized[COMPARISON_CATEGORY.WITHIN_TOLERANCE] = rawResult.withinTolerance.map((item) =>
      decorateMatchedItem(item, COMPARISON_CATEGORY.WITHIN_TOLERANCE),
    );
  }

  // mismatch → ATTRIBUTE_MISMATCH
  // (ToleranceStrategy の mismatch は通常空だが、将来の拡張に備えて処理)
  if (rawResult.mismatch) {
    normalized[COMPARISON_CATEGORY.ATTRIBUTE_MISMATCH] = rawResult.mismatch.map((item) =>
      decorateMatchedItem(item, COMPARISON_CATEGORY.ATTRIBUTE_MISMATCH),
    );
  }

  // onlyA, onlyB
  if (rawResult.onlyA) {
    normalized[COMPARISON_CATEGORY.ONLY_A] = rawResult.onlyA;
  }
  if (rawResult.onlyB) {
    normalized[COMPARISON_CATEGORY.ONLY_B] = rawResult.onlyB;
  }

  // 元の追加プロパティを保持
  copyExtraProperties(rawResult, normalized);

  return normalized;
}

/**
 * マッチ要素にカテゴリメタデータを付与する
 * 元のプロパティ（dataA, dataB, importance, matchType, differences等）はすべて保持
 *
 * @param {Object} item - マッチ要素 { dataA, dataB, ... }
 * @param {string} category - COMPARISON_CATEGORYの値
 * @returns {Object} メタデータ付きの要素
 */
function decorateMatchedItem(item, category) {
  // 既にデコレート済みの場合はcategoryだけ更新
  if (item.category) {
    return { ...item, category };
  }

  const positionState = category === COMPARISON_CATEGORY.WITHIN_TOLERANCE
    ? 'withinTolerance'
    : 'exact';

  const attributeState = category === COMPARISON_CATEGORY.ATTRIBUTE_MISMATCH
    ? 'mismatch'
    : 'matched';

  return {
    ...item,
    category,
    matchType: item.matchType || category,
    positionState,
    attributeState,
  };
}

/**
 * 空の正規化結果を作成（後方互換getter付き）
 * @returns {Object}
 */
function createEmptyNormalized() {
  const obj = {
    [COMPARISON_CATEGORY.EXACT]: [],
    [COMPARISON_CATEGORY.WITHIN_TOLERANCE]: [],
    [COMPARISON_CATEGORY.ATTRIBUTE_MISMATCH]: [],
    [COMPARISON_CATEGORY.ONLY_A]: [],
    [COMPARISON_CATEGORY.ONLY_B]: [],
  };

  // 後方互換: .matched getter（全マッチカテゴリの合成）
  Object.defineProperty(obj, 'matched', {
    get() {
      return [
        ...this[COMPARISON_CATEGORY.EXACT],
        ...this[COMPARISON_CATEGORY.WITHIN_TOLERANCE],
        ...this[COMPARISON_CATEGORY.ATTRIBUTE_MISMATCH],
      ];
    },
    enumerable: true,
    configurable: true,
  });

  // Note: .onlyA / .onlyB はCOMPARISON_CATEGORY.ONLY_A/ONLY_B と同名のため
  // 直接プロパティとして既にアクセス可能。getterは不要。

  return obj;
}

/**
 * 元結果の追加プロパティを正規化結果にコピーする
 * (importanceStats, filterSettings, elementType 等)
 */
function copyExtraProperties(source, target) {
  const reservedKeys = new Set([
    'matched', 'onlyA', 'onlyB',
    'exact', 'withinTolerance', 'mismatch',
    ...ALL_CATEGORIES,
  ]);

  for (const key of Object.keys(source)) {
    if (!reservedKeys.has(key)) {
      target[key] = source[key];
    }
  }
}

/**
 * 正規化結果の各カテゴリの要素数を取得
 * @param {Object} normalizedResult - 正規化された比較結果
 * @returns {Object} カテゴリ別カウント
 */
export function getCategoryCounts(normalizedResult) {
  if (!normalizedResult) {
    return { exact: 0, withinTolerance: 0, attributeMismatch: 0, onlyA: 0, onlyB: 0, total: 0 };
  }

  const exact = normalizedResult[COMPARISON_CATEGORY.EXACT]?.length || 0;
  const withinTolerance = normalizedResult[COMPARISON_CATEGORY.WITHIN_TOLERANCE]?.length || 0;
  const attributeMismatch = normalizedResult[COMPARISON_CATEGORY.ATTRIBUTE_MISMATCH]?.length || 0;
  const onlyA = normalizedResult[COMPARISON_CATEGORY.ONLY_A]?.length || 0;
  const onlyB = normalizedResult[COMPARISON_CATEGORY.ONLY_B]?.length || 0;

  return {
    exact,
    withinTolerance,
    attributeMismatch,
    onlyA,
    onlyB,
    matched: exact + withinTolerance + attributeMismatch,
    total: exact + withinTolerance + attributeMismatch + onlyA + onlyB,
  };
}

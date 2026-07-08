/**
 * @fileoverview スコープ調停（A5）: 片側モデルにのみ存在するカテゴリの検出
 *
 * 異ソフト間比較では、ツールの出力範囲（スコープ）の違いにより
 * あるカテゴリ（Parapet / Pile / Footing 等）が片側モデルにまったく
 * 存在しないことがある（実測: SEIN はパラペット・杭・基礎を出力しない）。
 * これらは要素単位の差分（onlyA/onlyB の羅列）ではなく
 * 「カテゴリ単位の出力範囲差」として注記提示するのが適切。
 *
 * 本モジュールは正規化済み比較結果から片側欠落カテゴリを検出する
 * 決定的・純関数を提供する。表示のゲーティング（異ソフト間比較モード
 * ON時のみ）は呼び出し側（UI層）が行う。
 *
 * 検証根拠: docs/reports/cross-software-match-benchmark.md（A5 スコープ調停）
 */

import { getCategoryCounts } from '../../data/normalizeComparisonResult.js';

/**
 * 片側モデルにのみ存在するカテゴリ（要素タイプ）を検出する。
 *
 * 判定はカテゴリの要素数で行う:
 * - モデルA側の要素数 = 対応ペア数 + onlyA、モデルB側 = 対応ペア数 + onlyB
 * - 片側が0件・他側が1件以上のカテゴリを「片側欠落」とする
 *
 * 集約タイプ（isRenderable === false の StbDefinition 等）は
 * カテゴリ単位の判定になじまないため対象外とする。
 *
 * @param {Map<string, Object>|Object} comparisonResults - 要素タイプ→正規化済み比較結果
 * @returns {Array<{elementType: string, presentIn: 'A'|'B', count: number}>}
 *   片側欠落カテゴリの一覧（要素タイプ名順）。presentIn は要素が存在する側。
 */
export function findOneSidedCategories(comparisonResults) {
  if (!comparisonResults) return [];
  const entries =
    typeof comparisonResults.entries === 'function'
      ? comparisonResults.entries()
      : Object.entries(comparisonResults);

  const notes = [];
  for (const [elementType, result] of entries) {
    if (!result || typeof result !== 'object') continue;
    if (result.isRenderable === false) continue;

    const counts = getCategoryCounts(result);
    const countA = counts.matched + counts.onlyA;
    const countB = counts.matched + counts.onlyB;
    if (countA > 0 && countB === 0) {
      notes.push({ elementType, presentIn: 'A', count: countA });
    } else if (countB > 0 && countA === 0) {
      notes.push({ elementType, presentIn: 'B', count: countB });
    }
  }

  return notes.sort((a, b) => a.elementType.localeCompare(b.elementType));
}

/**
 * 片側欠落カテゴリを除外した「スコープ調停後」の対応率指標を計算する。
 * 片側欠落分を分母から除くことで、出力範囲差に埋もれない
 * 「本当の未対応」の割合を可視化する。
 *
 * @param {{totalElements: number, totalCorresponding: number}} stats - 集計値
 * @param {Array<{count: number}>} oneSidedCategories - findOneSidedCategories の結果
 * @returns {{adjustedTotal: number, excludedCount: number, adjustedRate: number}|null}
 *   調停後総数が0以下、または除外対象が無い場合は null
 */
export function computeScopeAdjustedRate(stats, oneSidedCategories) {
  if (!stats || !Array.isArray(oneSidedCategories) || oneSidedCategories.length === 0) {
    return null;
  }
  const excludedCount = oneSidedCategories.reduce((sum, note) => sum + note.count, 0);
  const adjustedTotal = stats.totalElements - excludedCount;
  if (excludedCount <= 0 || adjustedTotal <= 0) return null;
  return {
    adjustedTotal,
    excludedCount,
    adjustedRate: stats.totalCorresponding / adjustedTotal,
  };
}

/**
 * @fileoverview 比較結果 → ツリー表示用データ変換
 *
 * comparisonResults (Map) をツリービュー用の { matched, onlyA, onlyB } 形式に変換します。
 *
 * @module data/converters/comparison-to-tree
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('comparisonToTree');

/**
 * comparisonResultsをツリー表示用のデータ構造に変換
 * @param {Map} comparisonResults - 要素タイプごとの比較結果Map
 * @param {Array<string>|Set<string>|null} [targetElementTypes=null] - 変換対象の要素タイプ
 * @returns {Object} ツリー表示用のデータ構造
 */
export function convertComparisonResultsForTree(comparisonResults, targetElementTypes = null) {
  const matched = [];
  const onlyA = [];
  const onlyB = [];
  const targetTypeSet = targetElementTypes
    ? targetElementTypes instanceof Set
      ? targetElementTypes
      : new Set(targetElementTypes)
    : null;

  // comparisonResultsがMapかどうかチェック
  if (!comparisonResults) {
    log.warn('comparisonResults is null or undefined');
    return { matched, onlyA, onlyB };
  }

  // Mapまたはオブジェクトの各要素を処理
  const entries =
    comparisonResults instanceof Map
      ? comparisonResults.entries()
      : Object.entries(comparisonResults);

  for (const [elementType, result] of entries) {
    if (!result) continue;
    if (targetTypeSet && !targetTypeSet.has(elementType)) continue;

    // matched要素を変換
    if (result.matched && Array.isArray(result.matched)) {
      result.matched.forEach((item) => {
        matched.push({
          elementType: elementType,
          elementA: item.dataA,
          elementB: item.dataB,
          id: item.dataA?.id,
        });
      });
    }

    // onlyA要素を変換
    if (result.onlyA && Array.isArray(result.onlyA)) {
      result.onlyA.forEach((item) => {
        onlyA.push({
          elementType: elementType,
          ...item,
        });
      });
    }

    // onlyB要素を変換
    if (result.onlyB && Array.isArray(result.onlyB)) {
      result.onlyB.forEach((item) => {
        onlyB.push({
          elementType: elementType,
          ...item,
        });
      });
    }
  }

  log.info(
    `ツリー用データ変換完了: matched=${matched.length}, onlyA=${onlyA.length}, onlyB=${onlyB.length}`,
  );
  return { matched, onlyA, onlyB };
}

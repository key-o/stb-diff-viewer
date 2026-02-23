/**
 * Diff to RenderModel Adapter
 *
 * 差分比較結果（comparisonResults）をDiffRenderModel形式に変換します。
 * これにより、比較層と描画層の間のデータ形式を明確に分離します。
 *
 * @module data/converters/diff-to-render-model
 */

import { createDiffStatus, calculateBoundingBox } from './render-model-utils.js';
import { COMPARISON_CATEGORY } from '../../constants/comparisonCategories.js';
import { getCategoryCounts } from '../normalizeComparisonResult.js';

// ============================================
// 型定義
// ============================================

/**
 * 差分表示用の要素データ
 * @typedef {Object} DiffRenderElement
 * @property {string} id - 要素ID
 * @property {string} [idA] - モデルAでのID
 * @property {string} [idB] - モデルBでのID
 * @property {Object} [dataA] - モデルAのデータ
 * @property {Object} [dataB] - モデルBのデータ
 * @property {import('../../viewer/types/render-elements.js').RenderDiffStatus} diffStatus - 差分ステータス
 * @property {string} [importance] - 重要度
 * @property {string} [matchType] - マッチタイプ
 */

/**
 * 差分表示用の要素タイプ別コンテナ
 * @typedef {Object} DiffElementContainer
 * @property {DiffRenderElement[]} matched - 一致した要素
 * @property {DiffRenderElement[]} onlyA - モデルAのみに存在
 * @property {DiffRenderElement[]} onlyB - モデルBのみに存在
 * @property {string} elementType - 要素タイプ名
 * @property {boolean} isSelected - 選択状態
 * @property {boolean} [hasError] - エラー有無
 */

/**
 * 差分表示用RenderModel
 * @typedef {Object} DiffRenderModel
 * @property {Map<string, DiffElementContainer>} elements - 要素タイプ別コンテナ
 * @property {import('../../viewer/types/render-model.js').RenderBoundingBox} boundingBox - バウンディングボックス
 * @property {Object} meta - メタ情報
 * @property {string} [meta.modelAFileName] - モデルAファイル名
 * @property {string} [meta.modelBFileName] - モデルBファイル名
 * @property {Object} statistics - 統計情報
 */

// ============================================
// メイン変換関数
// ============================================

/**
 * 比較結果をDiffRenderModelに変換
 *
 * @param {Map<string, Object>} comparisonResults - 比較結果Map
 * @param {Object} [options={}] - 変換オプション
 * @param {Map} [options.nodeMapA] - モデルAの節点マップ
 * @param {Map} [options.nodeMapB] - モデルBの節点マップ
 * @param {string} [options.modelAFileName] - モデルAのファイル名
 * @param {string} [options.modelBFileName] - モデルBのファイル名
 * @returns {DiffRenderModel}
 */
export function convertToDiffRenderModel(comparisonResults, options = {}) {
  if (!comparisonResults || !(comparisonResults instanceof Map)) {
    return createEmptyDiffRenderModel();
  }

  const {
    nodeMapA = new Map(),
    nodeMapB = new Map(),
    modelAFileName = null,
    modelBFileName = null,
  } = options;

  const elements = new Map();
  let totalMatched = 0;
  let totalOnlyA = 0;
  let totalOnlyB = 0;
  let totalExact = 0;
  let totalWithinTolerance = 0;
  let totalAttributeMismatch = 0;

  // 各要素タイプを変換
  for (const [elementType, comparisonResult] of comparisonResults.entries()) {
    const container = convertElementTypeResult(elementType, comparisonResult, nodeMapA, nodeMapB);
    elements.set(elementType, container);

    const counts = getCategoryCounts(comparisonResult);
    totalMatched += counts.matched;
    totalOnlyA += counts.onlyA;
    totalOnlyB += counts.onlyB;
    totalExact += counts.exact;
    totalWithinTolerance += counts.withinTolerance;
    totalAttributeMismatch += counts.attributeMismatch;
  }

  // バウンディングボックス計算（節点から）
  const allNodes = [...nodeMapA.values(), ...nodeMapB.values()];
  const boundingBox = calculateBoundingBox(allNodes);

  return {
    elements,
    boundingBox,
    meta: {
      modelAFileName,
      modelBFileName,
      convertedAt: new Date().toISOString(),
    },
    statistics: {
      totalMatched,
      totalExact,
      totalWithinTolerance,
      totalAttributeMismatch,
      totalOnlyA,
      totalOnlyB,
      totalElements: totalMatched + totalOnlyA + totalOnlyB,
      elementTypes: elements.size,
    },
  };
}

/**
 * 空のDiffRenderModelを生成
 * @returns {DiffRenderModel}
 */
export function createEmptyDiffRenderModel() {
  return {
    elements: new Map(),
    boundingBox: {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
      center: { x: 0, y: 0, z: 0 },
    },
    meta: {
      modelAFileName: null,
      modelBFileName: null,
      convertedAt: null,
    },
    statistics: {
      totalMatched: 0,
      totalOnlyA: 0,
      totalOnlyB: 0,
      totalElements: 0,
      elementTypes: 0,
    },
  };
}

// ============================================
// 要素タイプ別変換
// ============================================

/**
 * 要素タイプの比較結果を変換
 * @param {string} elementType - 要素タイプ
 * @param {Object} comparisonResult - 比較結果
 * @param {Map} nodeMapA - モデルA節点マップ
 * @param {Map} nodeMapB - モデルB節点マップ
 * @returns {DiffElementContainer}
 */
function convertElementTypeResult(elementType, comparisonResult, nodeMapA, nodeMapB) {
  const {
    matched = [],
    onlyA = [],
    onlyB = [],
    isSelected = true,
    error = null,
  } = comparisonResult;

  return {
    elementType,
    isSelected,
    hasError: !!error,
    errorMessage: error || null,
    matched: matched.map((item) => convertMatchedElement(item, elementType, nodeMapA, nodeMapB)),
    onlyA: onlyA.map((item) => convertOnlySideElement(item, elementType, nodeMapA, 'A')),
    onlyB: onlyB.map((item) => convertOnlySideElement(item, elementType, nodeMapB, 'B')),
  };
}

/**
 * マッチした要素を変換
 * @param {Object} item - マッチアイテム
 * @param {string} elementType - 要素タイプ
 * @param {Map} nodeMapA - モデルA節点マップ
 * @param {Map} nodeMapB - モデルB節点マップ
 * @returns {DiffRenderElement}
 */
function convertMatchedElement(item, elementType, nodeMapA, nodeMapB) {
  const { dataA, dataB, importance, matchType } = item;

  return {
    id: dataA?.id || dataB?.id || 'unknown',
    idA: dataA?.id || null,
    idB: dataB?.id || null,
    elementType,
    dataA: enrichElementData(dataA, nodeMapA),
    dataB: enrichElementData(dataB, nodeMapB),
    diffStatus: determineDiffStatus(dataA, dataB, matchType),
    importance: importance || 'normal',
    matchType: matchType || 'exact',
  };
}

/**
 * 片側のみに存在する要素を変換
 * @param {Object} item - 要素データ
 * @param {string} elementType - 要素タイプ
 * @param {Map} nodeMap - 節点マップ
 * @param {'A'|'B'} side - どちら側のモデルか
 * @returns {DiffRenderElement}
 */
function convertOnlySideElement(item, elementType, nodeMap, side) {
  const data = item.data || item;
  const isA = side === 'A';

  return {
    id: data?.id || 'unknown',
    idA: isA ? data?.id || null : null,
    idB: isA ? null : data?.id || null,
    elementType,
    dataA: isA ? enrichElementData(data, nodeMap) : null,
    dataB: isA ? null : enrichElementData(data, nodeMap),
    diffStatus: createDiffStatus(isA ? 'removed' : 'added'),
    importance: item.importance || 'normal',
    matchType: null,
  };
}

// ============================================
// ユーティリティ関数
// ============================================

/**
 * 差分ステータスを決定
 * @param {Object} dataA - モデルAデータ
 * @param {Object} dataB - モデルBデータ
 * @param {string} matchType - マッチタイプ
 * @returns {import('../../viewer/types/render-elements.js').RenderDiffStatus}
 */
function determineDiffStatus(dataA, dataB, matchType) {
  if (!dataA && dataB) {
    return createDiffStatus('added');
  }
  if (dataA && !dataB) {
    return createDiffStatus('removed');
  }
  if (matchType === 'exact' || matchType === 'unchanged' || matchType === COMPARISON_CATEGORY.EXACT) {
    return createDiffStatus('unchanged');
  }
  if (matchType === 'withinTolerance' || matchType === COMPARISON_CATEGORY.WITHIN_TOLERANCE) {
    return createDiffStatus('modified'); // withinTolerance = minor modification
  }
  if (matchType === 'attributeMismatch' || matchType === COMPARISON_CATEGORY.ATTRIBUTE_MISMATCH) {
    return createDiffStatus('modified');
  }
  return createDiffStatus('modified');
}

/**
 * 要素データに座標情報を付加
 * @param {Object} data - 要素データ
 * @param {Map} nodeMap - 節点マップ
 * @returns {Object} 拡張された要素データ
 */
function enrichElementData(data, nodeMap) {
  if (!data) return null;

  const enriched = { ...data };

  // 座標情報がない場合、節点マップから取得
  for (const [coordKey, nodeIdKey] of [
    ['startCoords', 'idNodeStart'],
    ['endCoords', 'idNodeEnd'],
  ]) {
    if (!enriched[coordKey] && enriched[nodeIdKey]) {
      const node = nodeMap.get(String(enriched[nodeIdKey]));
      if (node) {
        enriched[coordKey] = { x: node.x, y: node.y, z: node.z };
      }
    }
  }

  return enriched;
}

// ============================================
// アクセサ関数
// ============================================

/**
 * DiffRenderModelの統計情報を取得
 * @param {DiffRenderModel} diffModel - DiffRenderModel
 * @returns {Object}
 */
export function getDiffStatistics(diffModel) {
  if (!diffModel) {
    return {
      totalMatched: 0,
      totalOnlyA: 0,
      totalOnlyB: 0,
      totalElements: 0,
      elementTypes: 0,
    };
  }
  return diffModel.statistics;
}

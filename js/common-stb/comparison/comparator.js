/**
 * @fileoverview モデル比較機能のための中核モジュール
 *
 * このファイルは、2つのSTBモデルを比較するための機能を提供します:
 *
 * **幾何的比較**:
 * - 要素間の座標ベースの比較ロジック
 * - 線分要素（柱、梁）の比較機能
 * - ポリゴン要素（スラブ、壁）の比較機能
 * - 節点要素の比較機能
 *
 * **パラメータ比較**:
 * - 座標パラメータの数値精度比較
 * - 寸法・断面パラメータの差分検出
 * - 材料特性・構造パラメータの値比較
 *
 * **結果分類**:
 * - モデル間の一致・不一致要素の分類
 * - 重要度を考慮した比較フィルタリング機能
 *
 * 比較結果は「一致」「モデルAのみ」「モデルBのみ」の3つに分類され、
 * 3Dビュー上での色分け表示の基礎となります。
 *
 * @note このモジュールは以下のサブモジュールに責任を分割しています：
 * - comparison/keyGenerator.js - キー生成
 * - comparison/strategies/ - 比較戦略
 */

import { IMPORTANCE_LEVELS, IMPORTANCE_LEVEL_NAMES } from '../../constants/importanceLevels.js';
import {
  COMPARISON_KEY_TYPE,
  PLACEMENT_COMPARISON_MODE,
} from '../../config/comparisonKeyConfig.js';
import { getToleranceConfig } from '../../config/toleranceConfig.js';
import { DEFAULT_PILE_LENGTH } from '../../config/geometryConfig.js';

// キー生成関数をインポート
import {
  getNodeCoordKey,
  getLineElementKey,
  getPolyElementKey,
  getElementKey,
  getAttr,
  getNodeStoryAxisKey,
  getLineElementKeyMode2,
  getLineElementKeyMode3,
  getPolyElementKeyPerVertexMode2,
  getPolyElementKeyPerVertexMode3,
} from './keyGenerator.js';

// 比較戦略をインポート
import { BasicStrategy } from './BaseStrategy.js';
import { ToleranceStrategy } from './ToleranceStrategy.js';
import { DIFF_TYPE } from './VersionAwareStrategy.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('common-stb:comparison:comparator');

// --- 定数 ---
const STB_NAMESPACE = 'https://www.building-smart.or.jp/dl'; // ST-Bridge 名前空間 (stbParserと重複するが、独立性のため保持)

// 戦略インスタンス
const basicStrategy = new BasicStrategy();
const toleranceStrategy = new ToleranceStrategy();

// --- 要素比較ロジック ---
/**
 * 2つの要素リスト（モデルAとB）を比較し、一致、Aのみ、Bのみの要素を分類する。
 * @param {Array<Element>} elementsA - モデルAの要素リスト。
 * @param {Array<Element>} elementsB - モデルBの要素リスト。
 * @param {Map<string, {x: number, y: number, z: number}>} nodeMapA - モデルAのノードマップ。
 * @param {Map<string, {x: number, y: number, z: number}>} nodeMapB - モデルBのノードマップ。
 * @param {function(Element, Map): {key: string|null, data: any}} keyExtractor - 要素から比較キーと関連データを抽出する関数。
 * @param {Object} [options={}] - 比較オプション（attributeComparator等）
 * @returns {{matched: Array<{dataA: any, dataB: any}>, mismatch: Array<{dataA: any, dataB: any}>, onlyA: Array<any>, onlyB: Array<any>}} 比較結果オブジェクト。
 */
export function compareElements(
  elementsA,
  elementsB,
  nodeMapA,
  nodeMapB,
  keyExtractor,
  options = {},
) {
  // BasicStrategyに委譲
  return basicStrategy.compare(elementsA, elementsB, nodeMapA, nodeMapB, keyExtractor, options);
}

// --- 要素タイプごとのキー抽出関数 ---

/*
 * 線分要素（柱、梁など）から比較キーと関連データ（始点・終点座標、要素ID）を抽出する。
 * @param {Element} element - 線分要素のXML要素。
 * @param {Map<string, {x: number, y: number, z: number}>} nodeMap - 対応するノードマップ。
 * @param {string} idStartAttr - 始点ノードIDの属性名。
 * @param {string} idEndAttr - 終点ノードIDの属性名。
 * @param {string} [keyType] - 比較キータイプ（省略時はPOSITION_BASED）
 * @param {Object} [options={}] - オプション
 * @param {function} [options.sectionSignatureResolver] - 断面シグネチャ解決関数
 * @param {Map} [options.storyAxisLookup] - 所属階・通芯ルックアップ（STORY_AXIS_BASEDモード用）
 * @returns {{key: string|null, data: {startCoords: object, endCoords: object, id: string}|null}} キーとデータのオブジェクト。
 */
export function lineElementKeyExtractor(
  element,
  nodeMap,
  idStartAttr,
  idEndAttr,
  keyType = COMPARISON_KEY_TYPE.POSITION_BASED,
  options = {},
) {
  let startId = getAttr(element, idStartAttr);
  let endId = getAttr(element, idEndAttr);
  const elementId = getAttr(element, 'id');
  let startCoords = nodeMap.get(startId);
  let endCoords = nodeMap.get(endId);

  // 1-node format fallback (for Pile with id_node + level_top)
  if ((!startCoords || !endCoords) && !startId && !endId) {
    const idNode = getAttr(element, 'id_node');
    const levelTop = getAttr(element, 'level_top');
    const levelBottom = getAttr(element, 'level_bottom');

    // Pile: id_node + level_top 形式
    if (idNode && levelTop && nodeMap.has(idNode)) {
      const topNode = nodeMap.get(idNode);
      const offsetX = parseFloat(getAttr(element, 'offset_X')) || 0;
      const offsetY = parseFloat(getAttr(element, 'offset_Y')) || 0;
      const levelTopValue = parseFloat(levelTop);

      // Default pile length for line display (actual length from section data used in 3D)
      const defaultPileLength = DEFAULT_PILE_LENGTH;

      // Calculate top node position (level_top はノードZからの相対オフセット)
      const topZ = topNode.z + levelTopValue;
      endCoords = {
        x: topNode.x + offsetX,
        y: topNode.y + offsetY,
        z: topZ, // ノードZ + level_top が杭天端Z座標
      };

      // Calculate bottom node (top - default pile length)
      startCoords = {
        x: endCoords.x,
        y: endCoords.y,
        z: topZ - defaultPileLength,
      };

      // Use synthetic IDs for 1-node format
      startId = `${idNode}_bottom`;
      endId = idNode;
    }
    // Footing: id_node + level_bottom 形式
    else if (idNode && levelBottom !== null && nodeMap.has(idNode)) {
      const refNode = nodeMap.get(idNode);
      const offsetX = parseFloat(getAttr(element, 'offset_X')) || 0;
      const offsetY = parseFloat(getAttr(element, 'offset_Y')) || 0;
      const levelBottomValue = parseFloat(levelBottom) || 0;

      // Calculate bottom position (level_bottom はノードZからの相対オフセット)
      startCoords = {
        x: refNode.x + offsetX,
        y: refNode.y + offsetY,
        z: refNode.z + levelBottomValue, // ノードZ + level_bottom が下端Z座標
      };

      // Calculate top position (reference node Z)
      endCoords = {
        x: refNode.x + offsetX,
        y: refNode.y + offsetY,
        z: refNode.z, // ノードZが上端Z座標
      };

      // Use synthetic IDs for 1-node format
      startId = `${idNode}_bottom`;
      endId = idNode;
    }
  }

  if (startCoords && endCoords) {
    // 要素の全属性を取得してelement objectを作成
    const elementData = {
      id: elementId,
      [idStartAttr]: startId,
      [idEndAttr]: endId,
    };

    // name属性やその他の属性も取得
    const name = getAttr(element, 'name');
    if (name) elementData.name = name;

    const idSection = getAttr(element, 'id_section');
    if (idSection) elementData.id_section = idSection;

    const kindStructure = getAttr(element, 'kind_structure');
    if (kindStructure) elementData.kind_structure = kindStructure;

    // GUID属性も取得
    const guid = getAttr(element, 'guid');
    if (guid) elementData.guid = guid;

    // キータイプに応じたキー生成
    let baseKey;
    if (keyType === COMPARISON_KEY_TYPE.STORY_AXIS_BASED && options.storyAxisLookup) {
      const startSaKey = getNodeStoryAxisKey(startId, options.storyAxisLookup);
      const endSaKey = getNodeStoryAxisKey(endId, options.storyAxisLookup);
      baseKey = startSaKey && endSaKey ? [startSaKey, endSaKey].sort().join('|') : null;
    } else {
      baseKey = getElementKey(element, keyType, () => getLineElementKey(startCoords, endCoords));
    }
    const sectionSignature =
      typeof options.sectionSignatureResolver === 'function'
        ? options.sectionSignatureResolver(element)
        : null;
    const key = baseKey && sectionSignature ? `${baseKey}|sec:${sectionSignature}` : baseKey;

    return {
      key,
      data: {
        startCoords,
        endCoords,
        id: elementId,
        name: name || undefined,
        guid: guid || undefined,
        element: elementData,
        rawElement: element,
      },
    };
  }
  log.warn(`[Data] 線分要素: ノード座標が不足 (Start=${startId}, End=${endId}, id=${elementId})`);
  return { key: null, data: null };
}

/*
 * ポリゴン要素（スラブ、壁など）から比較キーと関連データ（頂点座標リスト、要素ID）を抽出する。
 * @param {Element} element - ポリゴン要素のXML要素。
 * @param {Map<string, {x: number, y: number, z: number}>} nodeMap - 対応するノードマップ。
 * @param {string} [nodeOrderTag="StbNodeIdOrder"] - 頂点ノードIDリストが含まれるタグ名。
 * @param {string} [keyType] - 比較キータイプ（省略時はPOSITION_BASED）
 * @param {Object} [options={}] - オプション
 * @param {function} [options.sectionSignatureResolver] - 断面シグネチャ解決関数
 * @param {Map} [options.storyAxisLookup] - 所属階・通芯ルックアップ（STORY_AXIS_BASEDモード用）
 * @returns {{key: string|null, data: {vertexCoordsList: Array<object>, id: string}|null}} キーとデータのオブジェクト。
 */
export function polyElementKeyExtractor(
  element,
  nodeMap,
  nodeOrderTag = 'StbNodeIdOrder',
  keyType = COMPARISON_KEY_TYPE.POSITION_BASED,
  options = {},
) {
  const elementId = getAttr(element, 'id');

  // ノードID取得: XML DOM (getElementsByTagNameNS) または JSオブジェクト (node_ids)
  let nodeIds = null;
  if (typeof element.getElementsByTagNameNS === 'function') {
    const orderElem = element.getElementsByTagNameNS(STB_NAMESPACE, nodeOrderTag)[0];
    if (orderElem && orderElem.textContent) {
      nodeIds = orderElem.textContent.trim().split(/\s+/);
    }
  } else if (element.node_ids && Array.isArray(element.node_ids)) {
    nodeIds = element.node_ids;
  }

  if (nodeIds) {
    const vertexCoordsList = nodeIds
      .map((id) => nodeMap.get(String(id)))
      .filter((coords) => coords);

    if (vertexCoordsList.length === nodeIds.length && vertexCoordsList.length >= 3) {
      const name = getAttr(element, 'name');
      const guid = getAttr(element, 'guid');

      // キータイプに応じたキー生成
      let baseKey;
      if (keyType === COMPARISON_KEY_TYPE.STORY_AXIS_BASED && options.storyAxisLookup) {
        const vertexSaKeys = nodeIds.map((id) =>
          getNodeStoryAxisKey(String(id), options.storyAxisLookup),
        );
        baseKey = vertexSaKeys.every((k) => k !== null) ? vertexSaKeys.sort().join(',') : null;
      } else {
        baseKey = getElementKey(element, keyType, () => getPolyElementKey(vertexCoordsList));
      }
      const sectionSignature =
        typeof options.sectionSignatureResolver === 'function'
          ? options.sectionSignatureResolver(element)
          : null;
      const key = baseKey && sectionSignature ? `${baseKey}|sec:${sectionSignature}` : baseKey;

      return {
        key,
        data: {
          vertexCoordsList,
          id: elementId,
          name: name || undefined,
          guid: guid || undefined,
          element,
          rawElement: element,
        },
      };
    } else {
      log.warn(
        `[Data] 面要素: ノード座標または頂点が不足 (id=${elementId}, nodes=${nodeIds.length}, found=${vertexCoordsList.length})`,
      );
    }
  } else {
    log.warn(`[Data] 面要素: ノード順序タグが不足 (id=${elementId}, tag=${nodeOrderTag})`);
  }
  return { key: null, data: null };
}

/*
 * 節点要素から比較キーと関連データ（座標、ノードID）を抽出する。
 * @param {Element} element - 節点要素のXML要素 (StbNode)。
 * @param {Map<string, {x: number, y: number, z: number}>} nodeMap - 対応するノードマップ。
 * @param {string} [keyType] - 比較キータイプ（省略時はPOSITION_BASED）
 * @param {Object} [options={}] - オプション
 * @param {Map} [options.storyAxisLookup] - 所属階・通芯ルックアップ（STORY_AXIS_BASEDモード用）
 * @returns {{key: string|null, data: {coords: object, id: string}|null}} キーとデータのオブジェクト。
 */
export function nodeElementKeyExtractor(
  element,
  nodeMap,
  keyType = COMPARISON_KEY_TYPE.POSITION_BASED,
  options = {},
) {
  const nodeId = getAttr(element, 'id');
  const coords = nodeMap.get(nodeId);
  if (coords) {
    const name = getAttr(element, 'name');
    const guid = getAttr(element, 'guid');

    let key;
    if (keyType === COMPARISON_KEY_TYPE.STORY_AXIS_BASED && options.storyAxisLookup) {
      key = getNodeStoryAxisKey(nodeId, options.storyAxisLookup);
    } else {
      key = getElementKey(element, keyType, () => getNodeCoordKey(coords));
    }

    return {
      key,
      data: {
        coords,
        id: nodeId,
        name: name || undefined,
        guid: guid || undefined,
        element: {
          id: nodeId,
          ...(name ? { name } : {}),
          ...(guid ? { guid } : {}),
        },
        rawElement: element,
      },
    };
  }
  return { key: null, data: null };
}

// --- 重要度を考慮した比較機能 ---

/**
 * 要素リストを重要度でフィルタリングする
 * @param {Array<Element>} elements - 要素リスト
 * @param {string} elementType - 要素タイプ
 * @param {string[]} targetLevels - 対象とする重要度レベルの配列
 * @param {Function} lookupFn - 重要度判定関数 (element, elementType) => level
 * @returns {Array<Element>} フィルタリングされた要素リスト
 */
function filterElementsByImportance(elements, elementType, targetLevels, lookupFn) {
  if (!lookupFn || !targetLevels || targetLevels.length === 0) {
    return elements;
  }

  return elements.filter((element) => {
    const importance = lookupFn(element, elementType);
    return targetLevels.includes(importance);
  });
}

/*
 * 重要度を考慮した要素比較（compareElementsの拡張版）
 * @param {Array<Element>} elementsA - モデルAの要素リスト
 * @param {Array<Element>} elementsB - モデルBの要素リスト
 * @param {Map<string, {x: number, y: number, z: number}>} nodeMapA - モデルAのノードマップ
 * @param {Map<string, {x: number, y: number, z: number}>} nodeMapB - モデルBのノードマップ
 * @param {function(Element, Map): {key: string|null, data: any}} keyExtractor - キー抽出関数
 * @param {string} elementType - 要素タイプ
 * @param {Object} options - オプション設定
 * @param {string[]} [options.targetImportanceLevels] - 対象重要度レベル
 * @param {boolean} [options.includeImportanceInfo=true] - 重要度情報を結果に含めるか
 * @param {Function} [options.importanceLookup] - 重要度判定関数 (element, elementType) => level
 * @returns {{matched: Array, onlyA: Array, onlyB: Array, importanceStats: Object}} 重要度を考慮した比較結果
 */
export function compareElementsWithImportance(
  elementsA,
  elementsB,
  nodeMapA,
  nodeMapB,
  keyExtractor,
  elementType,
  options = {},
) {
  const {
    targetImportanceLevels = null,
    includeImportanceInfo = true,
    importanceLookup = null,
    compareOptions = {},
  } = options;

  // 重要度フィルタリング
  let filteredElementsA = elementsA;
  let filteredElementsB = elementsB;

  if (targetImportanceLevels) {
    filteredElementsA = filterElementsByImportance(
      elementsA,
      elementType,
      targetImportanceLevels,
      importanceLookup,
    );
    filteredElementsB = filterElementsByImportance(
      elementsB,
      elementType,
      targetImportanceLevels,
      importanceLookup,
    );
  }

  // 基本的な比較を実行
  const basicResult = compareElements(
    filteredElementsA,
    filteredElementsB,
    nodeMapA,
    nodeMapB,
    keyExtractor,
    compareOptions,
  );

  // 重要度情報を付加
  if (includeImportanceInfo) {
    const addImportanceInfo = (items, modelType) => {
      return items.map((item) => {
        let element;
        if (modelType === 'matched') {
          // matchedの場合、dataAから要素を取得
          element = item.dataA.element || null;
        } else {
          // onlyA, onlyBの場合
          element = item.element || null;
        }

        const importance =
          element && typeof importanceLookup === 'function'
            ? importanceLookup(element, elementType)
            : IMPORTANCE_LEVELS.OPTIONAL;

        return {
          ...item,
          importance,
          importanceName: IMPORTANCE_LEVEL_NAMES[importance],
        };
      });
    };

    basicResult.matched = addImportanceInfo(basicResult.matched, 'matched');
    basicResult.onlyA = addImportanceInfo(basicResult.onlyA, 'onlyA');
    basicResult.onlyB = addImportanceInfo(basicResult.onlyB, 'onlyB');
  }

  // 重要度別統計情報を生成
  const importanceStats = generateImportanceStatistics(basicResult, elementType);

  return {
    ...basicResult,
    importanceStats,
    elementType,
    filterSettings: {
      targetImportanceLevels,
      totalElementsA: elementsA.length,
      totalElementsB: elementsB.length,
      filteredElementsA: filteredElementsA.length,
      filteredElementsB: filteredElementsB.length,
    },
  };
}

/**
 * 比較結果から重要度別統計情報を生成する
 * @param {Object} comparisonResult - 比較結果
 * @param {string} elementType - 要素タイプ
 * @returns {Object} 重要度別統計情報
 */
function generateImportanceStatistics(comparisonResult, elementType) {
  const stats = {
    elementType,
    byImportance: {},
    summary: {
      totalMatched: comparisonResult.matched.length,
      totalOnlyA: comparisonResult.onlyA.length,
      totalOnlyB: comparisonResult.onlyB.length,
      totalDifferences: comparisonResult.onlyA.length + comparisonResult.onlyB.length,
    },
  };

  // 重要度レベル別の初期化
  for (const level of Object.values(IMPORTANCE_LEVELS)) {
    stats.byImportance[level] = {
      matched: 0,
      onlyA: 0,
      onlyB: 0,
      differences: 0,
    };
  }

  // 統計を集計
  const countByImportance = (items, category) => {
    items.forEach((item) => {
      const importance = item.importance || IMPORTANCE_LEVELS.OPTIONAL;
      stats.byImportance[importance][category]++;
      if (category !== 'matched') {
        stats.byImportance[importance].differences++;
      }
    });
  };

  countByImportance(comparisonResult.matched, 'matched');
  countByImportance(comparisonResult.onlyA, 'onlyA');
  countByImportance(comparisonResult.onlyB, 'onlyB');

  return stats;
}

/**
 * 重要度別比較サマリーを生成する
 * @param {Array<Object>} comparisonResults - 複数の要素タイプの比較結果
 * @returns {Object} 全体的な重要度サマリー
 */
export function generateImportanceSummary(comparisonResults) {
  const summary = {
    totalElements: 0,
    totalDifferences: 0,
    byImportance: {},
    byElementType: {},
    criticalDifferences: 0, // 高重要度の差分
    timestamp: new Date().toISOString(),
  };

  // 重要度レベル別の初期化
  for (const level of Object.values(IMPORTANCE_LEVELS)) {
    summary.byImportance[level] = {
      matched: 0,
      differences: 0,
      onlyA: 0,
      onlyB: 0,
    };
  }

  // 各比較結果を集計
  comparisonResults.forEach((result) => {
    if (!result.importanceStats) {
      return;
    }

    const elementType = result.elementType;
    summary.byElementType[elementType] = result.importanceStats.summary;

    summary.totalElements +=
      result.importanceStats.summary.totalMatched + result.importanceStats.summary.totalDifferences;
    summary.totalDifferences += result.importanceStats.summary.totalDifferences;

    // 重要度別の集計
    for (const [importance, stats] of Object.entries(result.importanceStats.byImportance)) {
      summary.byImportance[importance].matched += stats.matched;
      summary.byImportance[importance].differences += stats.differences;
      summary.byImportance[importance].onlyA += stats.onlyA;
      summary.byImportance[importance].onlyB += stats.onlyB;

      // 高重要度の差分をカウント
      if (importance === IMPORTANCE_LEVELS.REQUIRED) {
        summary.criticalDifferences += stats.differences;
      }
    }
  });

  return summary;
}

/*
 * 要素の重要度を取得するヘルパー
 * @param {Element} element - 要素
 * @param {string} elementType - 要素タイプ
 * @param {Function} importanceLookup - 重要度判定関数
 * @returns {number} 重要度レベル
 */
function getElementImportance(element, elementType, importanceLookup) {
  if (!element || typeof importanceLookup !== 'function') {
    return IMPORTANCE_LEVELS.OPTIONAL;
  }
  try {
    return importanceLookup(element, elementType) ?? IMPORTANCE_LEVELS.OPTIONAL;
  } catch {
    return IMPORTANCE_LEVELS.OPTIONAL;
  }
}

/**
 * 重要度設定の変更を比較結果に反映する
 * @param {Object} comparisonResult - 既存の比較結果
 * @param {string} elementType - 要素タイプ
 * @param {Function} importanceLookup - 重要度判定関数
 * @returns {Object} 更新された比較結果
 */
export function updateComparisonResultImportance(comparisonResult, elementType, importanceLookup) {
  // 重要度情報を再計算
  const addImportanceInfo = (items, modelType) => {
    return items.map((item) => {
      let element;
      if (modelType === 'matched') {
        element = item.dataA.element || null;
      } else {
        element = item.element || null;
      }

      const importance = element
        ? getElementImportance(element, elementType, importanceLookup)
        : IMPORTANCE_LEVELS.OPTIONAL;

      return {
        ...item,
        importance,
        importanceName: IMPORTANCE_LEVEL_NAMES[importance],
      };
    });
  };

  const updatedResult = {
    ...comparisonResult,
    matched: addImportanceInfo(comparisonResult.matched, 'matched'),
    onlyA: addImportanceInfo(comparisonResult.onlyA, 'onlyA'),
    onlyB: addImportanceInfo(comparisonResult.onlyB, 'onlyB'),
  };

  // 統計情報を再生成
  updatedResult.importanceStats = generateImportanceStatistics(updatedResult, elementType);

  return updatedResult;
}

/**
 * 許容差を考慮した要素比較
 * @param {Array<Element>} elementsA - モデルAの要素リスト
 * @param {Array<Element>} elementsB - モデルBの要素リスト
 * @param {Map} nodeMapA - モデルAのノードマップ
 * @param {Map} nodeMapB - モデルBのノードマップ
 * @param {function} keyExtractor - キー抽出関数
 * @param {Object} [toleranceConfig] - 許容差設定（省略時は現在の設定を使用）
 * @returns {Object} 拡張された比較結果
 */
export function compareElementsWithTolerance(
  elementsA,
  elementsB,
  nodeMapA,
  nodeMapB,
  keyExtractor,
  toleranceConfig = null,
  keyType = COMPARISON_KEY_TYPE.POSITION_BASED,
  strategyOptions = {},
) {
  // ToleranceStrategyに委譲
  return toleranceStrategy.compare(elementsA, elementsB, nodeMapA, nodeMapB, keyExtractor, {
    toleranceConfig: toleranceConfig || getToleranceConfig(),
    keyType,
    ...strategyOptions,
  });
}

// --- バージョン対応比較関数 ---
// ============================================
// 配置要素比較 V2（Mode 2 & 3）キー抽出
// ============================================

/**
 * 線分要素（Mode 2/3対応）からキーと関連データを抽出
 * @param {Element} element - 線分要素
 * @param {Map} nodeMap - ノードマップ
 * @param {string} idStartAttr - 始点属性名
 * @param {string} idEndAttr - 終点属性名
 * @param {string} placementMode - 配置比較モード (NODE_POSITION_ONLY | NODE_POSITION_WITH_OFFSET | PLACEMENT_POSITION_COMPLETE)
 * @param {string} [keyType] - 比較キータイプ
 * @param {Object} [options={}] - オプション
 * @returns {{key: string|null, data: object|null}}
 */
export function lineElementKeyExtractorV2(
  element,
  nodeMap,
  idStartAttr,
  idEndAttr,
  placementMode,
  keyType = COMPARISON_KEY_TYPE.POSITION_BASED,
  options = {},
) {
  // Mode 1（NODE_POSITION_ONLY）またはモード未設定はMode 1の関数に委譲（後方互換）
  if (
    !placementMode ||
    placementMode === PLACEMENT_COMPARISON_MODE.NODE_POSITION_ONLY ||
    !Object.values(PLACEMENT_COMPARISON_MODE).includes(placementMode)
  ) {
    return lineElementKeyExtractor(element, nodeMap, idStartAttr, idEndAttr, keyType, options);
  }

  let startId = getAttr(element, idStartAttr);
  let endId = getAttr(element, idEndAttr);
  const elementId = getAttr(element, 'id');
  let startCoords = nodeMap.get(startId);
  let endCoords = nodeMap.get(endId);

  // オフセット値を抽出
  const startOffsetX = parseFloat(getAttr(element, 'offset_start_X')) || 0;
  const startOffsetY = parseFloat(getAttr(element, 'offset_start_Y')) || 0;
  const startOffsetZ = parseFloat(getAttr(element, 'offset_start_Z')) || 0;
  const endOffsetX = parseFloat(getAttr(element, 'offset_end_X')) || 0;
  const endOffsetY = parseFloat(getAttr(element, 'offset_end_Y')) || 0;
  const endOffsetZ = parseFloat(getAttr(element, 'offset_end_Z')) || 0;
  const rotate = getAttr(element, 'rotate') || 0;

  const startOffset = { x: startOffsetX, y: startOffsetY, z: startOffsetZ };
  const endOffset = { x: endOffsetX, y: endOffsetY, z: endOffsetZ };

  // 座標取得失敗時の処理（1-node format等）
  if ((!startCoords || !endCoords) && !startId && !endId) {
    const idNode = getAttr(element, 'id_node');
    const levelTop = getAttr(element, 'level_top');
    const levelBottom = getAttr(element, 'level_bottom');

    if (idNode && levelTop && nodeMap.has(idNode)) {
      const topNode = nodeMap.get(idNode);
      const offsetX = parseFloat(getAttr(element, 'offset_X')) || 0;
      const offsetY = parseFloat(getAttr(element, 'offset_Y')) || 0;
      const levelTopValue = parseFloat(levelTop);
      const defaultPileLength = DEFAULT_PILE_LENGTH;

      const topZ = topNode.z + levelTopValue;
      endCoords = {
        x: topNode.x + offsetX,
        y: topNode.y + offsetY,
        z: topZ,
      };

      startCoords = {
        x: endCoords.x,
        y: endCoords.y,
        z: topZ - defaultPileLength,
      };

      startId = `${idNode}_bottom`;
      endId = idNode;
    } else if (idNode && levelBottom !== null && nodeMap.has(idNode)) {
      const refNode = nodeMap.get(idNode);
      const offsetX = parseFloat(getAttr(element, 'offset_X')) || 0;
      const offsetY = parseFloat(getAttr(element, 'offset_Y')) || 0;
      const levelBottomValue = parseFloat(levelBottom) || 0;

      startCoords = {
        x: refNode.x + offsetX,
        y: refNode.y + offsetY,
        z: levelBottomValue,
      };

      endCoords = {
        x: refNode.x + offsetX,
        y: refNode.y + offsetY,
        z: refNode.z,
      };

      startId = `${idNode}_bottom`;
      endId = idNode;
    }
  }

  if (startCoords && endCoords) {
    let key = null;

    if (placementMode === PLACEMENT_COMPARISON_MODE.NODE_POSITION_WITH_OFFSET) {
      key = getLineElementKeyMode2(startCoords, startOffset, endCoords, endOffset);
    } else if (placementMode === PLACEMENT_COMPARISON_MODE.PLACEMENT_POSITION_COMPLETE) {
      key = getLineElementKeyMode3(startCoords, startOffset, endCoords, endOffset, rotate);
    }

    if (key !== null) {
      return {
        key,
        data: {
          startCoords,
          endCoords,
          startOffset,
          endOffset,
          rotate,
          id: elementId,
          element,
          rawElement: element,
        },
      };
    }
  }

  return { key: null, data: null };
}

/**
 * ポリゴン要素から StbSlabOffsetList / StbWallOffsetList を解析し、
 * 「ノードID → {x,y,z} オフセット」のMapを返す。
 *
 * @param {Element} element - 床または壁のXML要素
 * @returns {Map<string, {x: number, y: number, z: number}>}
 */
function extractPerVertexOffsetMap(element) {
  const map = new Map();
  if (!element || typeof element.getElementsByTagName !== 'function') return map;

  // 床(StbSlabOffsetList) と 壁(StbWallOffsetList) の両方をサポート
  for (const listTag of ['StbSlabOffsetList', 'StbWallOffsetList']) {
    const lists = element.getElementsByTagName(listTag);
    if (!lists || lists.length === 0) continue;

    const itemTag = listTag.replace('List', ''); // StbSlabOffset / StbWallOffset
    for (const list of Array.from(lists)) {
      const items =
        typeof list.getElementsByTagName === 'function' ? list.getElementsByTagName(itemTag) : [];
      for (const item of Array.from(items)) {
        const nodeId = getAttr(item, 'id_node');
        if (!nodeId) continue;
        map.set(String(nodeId), {
          x: parseFloat(getAttr(item, 'offset_X')) || 0,
          y: parseFloat(getAttr(item, 'offset_Y')) || 0,
          z: parseFloat(getAttr(item, 'offset_Z')) || 0,
        });
      }
    }
  }
  return map;
}

/**
 * ポリゴン要素（Mode 2/3対応）からキーと関連データを抽出
 *
 * 床(StbSlab)・壁(StbWall) の StbSlabOffsetList / StbWallOffsetList を解析し、
 * 「節点ごとのオフセット」を加算した最終頂点座標で比較キーを生成する。
 * これにより、節点を移動した表現と、節点+オフセットで表現したものが
 * 最終ジオメトリ的に等価であれば同一判定される。
 *
 * @param {Element} element - ポリゴン要素
 * @param {Map} nodeMap - ノードマップ
 * @param {string} nodeOrderTag - ノード順序タグ名
 * @param {string} placementMode - 配置比較モード
 * @param {string} [keyType] - 比較キータイプ
 * @param {Object} [options={}] - オプション
 * @returns {{key: string|null, data: object|null}}
 */
export function polyElementKeyExtractorV2(
  element,
  nodeMap,
  nodeOrderTag,
  placementMode,
  keyType = COMPARISON_KEY_TYPE.POSITION_BASED,
  options = {},
) {
  // Mode 1（NODE_POSITION_ONLY）またはモード未設定はMode 1の関数に委譲（後方互換）
  if (
    !placementMode ||
    placementMode === PLACEMENT_COMPARISON_MODE.NODE_POSITION_ONLY ||
    !Object.values(PLACEMENT_COMPARISON_MODE).includes(placementMode)
  ) {
    return polyElementKeyExtractor(element, nodeMap, nodeOrderTag, keyType, options);
  }

  const elementId = getAttr(element, 'id');
  const name = getAttr(element, 'name');
  const guid = getAttr(element, 'guid');

  // ノード順序タグからノードIDリストを取得
  const nodeOrderElems = element.getElementsByTagName(nodeOrderTag);
  if (nodeOrderElems.length > 0) {
    const nodeIds = Array.from(nodeOrderElems[0].children)
      .map((child) => getAttr(child, 'ref'))
      .filter((id) => id);

    // 節点ごとオフセット (StbSlabOffsetList / StbWallOffsetList)
    const offsetByNode = extractPerVertexOffsetMap(element);

    // 厚さ（Mode 3で使用）
    const thickness = getAttr(element, 'thickness') || 0;

    // 各頂点座標を取得
    const vertexCoordsList = nodeIds.map((nodeId) => nodeMap.get(nodeId)).filter((c) => c);

    if (vertexCoordsList.length === nodeIds.length && vertexCoordsList.length > 0) {
      const perVertexOffsets = nodeIds.map((nodeId) => offsetByNode.get(String(nodeId)) || null);

      let key = null;
      if (placementMode === PLACEMENT_COMPARISON_MODE.NODE_POSITION_WITH_OFFSET) {
        key = getPolyElementKeyPerVertexMode2(vertexCoordsList, perVertexOffsets);
      } else if (placementMode === PLACEMENT_COMPARISON_MODE.PLACEMENT_POSITION_COMPLETE) {
        key = getPolyElementKeyPerVertexMode3(vertexCoordsList, perVertexOffsets, thickness);
      }

      if (key !== null) {
        return {
          key,
          data: {
            vertexCoordsList,
            perVertexOffsets,
            thickness,
            id: elementId,
            name: name || undefined,
            guid: guid || undefined,
            element,
            rawElement: element,
          },
        };
      }
    } else {
      log.warn(
        `[Data] 面要素(V2): ノード座標不足 (id=${elementId}, nodes=${nodeIds.length}, found=${vertexCoordsList.length})`,
      );
    }
  } else {
    log.warn(`[Data] 面要素(V2): ノード順序タグが不足 (id=${elementId}, tag=${nodeOrderTag})`);
  }

  return { key: null, data: null };
}

/**
 * STBバージョン情報を保持するオブジェクト
 * @typedef {Object} VersionInfo
 * @property {string} versionA - モデルAのバージョン ('2.0.2' or '2.1.0')
 * @property {string} versionB - モデルBのバージョン ('2.0.2' or '2.1.0')
 */

/*
 * バージョン対応の比較結果
 * @typedef {Object} VersionAwareComparisonResult
 * @property {Array} matched - 一致した要素
 * @property {Array} onlyA - モデルAのみの要素
 * @property {Array} onlyB - モデルBのみの要素
 * @property {Array} versionDifferences - バージョン固有の差異
 * @property {Object} versionInfo - バージョン情報
 */

// エクスポート: DIFF_TYPE定数の再エクスポート
export { DIFF_TYPE };

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
 */

import { getImportanceManager, IMPORTANCE_LEVELS, IMPORTANCE_LEVEL_NAMES } from './core/importanceManager.js';
import { COMPARISON_KEY_TYPE } from './config/comparisonKeyConfig.js';
import { getToleranceConfig } from './config/toleranceConfig.js';
import { compareElementDataWithTolerance } from './core/toleranceComparison.js';
import { COORDINATE_PRECISION } from './config/geometryConfig.js';

// --- 定数 ---
const PRECISION = COORDINATE_PRECISION; // 座標比較時の精度（共有定数を使用）
const STB_NAMESPACE = 'https://www.building-smart.or.jp/dl'; // ST-Bridge 名前空間 (stbParserと重複するが、独立性のため保持)

// --- 比較用キー生成関数 ---

/**
 * 座標オブジェクトから比較用のキー文字列を生成する。
 * @param {{x: number, y: number, z: number}} coords - 座標オブジェクト。
 * @param {number} [precision=PRECISION] - キー生成に使用する小数点以下の桁数。
 * @returns {string|null} 生成されたキー文字列、または無効な座標の場合はnull。
 */
function getNodeCoordKey(coords, precision = PRECISION) {
  if (
    !coords ||
    typeof coords.x !== 'number' ||
    typeof coords.y !== 'number' ||
    typeof coords.z !== 'number'
  ) {
    console.warn('Invalid coordinates for key generation:', coords);
    return null;
  }
  return `${coords.x.toFixed(precision)},${coords.y.toFixed(
    precision
  )},${coords.z.toFixed(precision)}`;
}

/**
 * 線分要素（始点・終点座標）から比較用のキー文字列を生成する。
 * @param {{x: number, y: number, z: number}} startCoords - 始点座標。
 * @param {{x: number, y: number, z: number}} endCoords - 終点座標。
 * @param {number} [precision=PRECISION] - 座標キー生成に使用する小数点以下の桁数。
 * @returns {string|null} 生成されたキー文字列、または無効な座標の場合はnull。
 */
function getLineElementKey(startCoords, endCoords, precision = PRECISION) {
  const startKey = getNodeCoordKey(startCoords, precision);
  const endKey = getNodeCoordKey(endCoords, precision);
  if (startKey === null || endKey === null) return null;
  return [startKey, endKey].sort().join('|');
}

/**
 * ポリゴン要素（頂点座標リスト、床ID、断面ID）から比較用のキー文字列を生成する。
 * @param {Array<{x: number, y: number, z: number}>} vertexCoordsList - 頂点座標のリスト。
 * @param {string} [floorId=''] - 床ID。
 * @param {string} [sectionId=''] - 断面ID。
 * @param {number} [precision=PRECISION] - 座標キー生成に使用する小数点以下の桁数。
 * @returns {string|null} 生成されたキー文字列、または無効な頂点が含まれる場合はnull。
 */
function getPolyElementKey(
  vertexCoordsList,
  floorId = '',
  sectionId = '',
  precision = PRECISION
) {
  if (!vertexCoordsList || vertexCoordsList.length === 0) return null;
  const coordKeys = vertexCoordsList.map((coords) =>
    getNodeCoordKey(coords, precision)
  );
  if (coordKeys.some((key) => key === null)) return null;
  return coordKeys.sort().join(',') + `|F:${floorId}|S:${sectionId}`;
}

// --- GUIDベースのキー生成関数 ---

/**
 * 要素のGUID属性からキーを生成する
 * @param {Element} element - XML要素
 * @returns {string|null} GUID文字列、またはGUID属性が無い場合はnull
 */
function getGuidKey(element) {
  if (!element || !element.getAttribute) {
    return null;
  }
  const guid = element.getAttribute('guid');
  return guid && guid.trim() !== '' ? guid.trim() : null;
}

/**
 * 要素から比較キーを生成する（キータイプに応じて位置ベースまたはGUIDベース）
 * @param {Element} element - XML要素
 * @param {string} keyType - 比較キータイプ（COMPARISON_KEY_TYPE.POSITION_BASED または GUID_BASED）
 * @param {function} positionKeyGenerator - 位置ベースのキー生成関数
 * @returns {string|null} 生成されたキー文字列
 */
function getElementKey(element, keyType, positionKeyGenerator) {
  if (keyType === COMPARISON_KEY_TYPE.GUID_BASED) {
    const guidKey = getGuidKey(element);
    if (guidKey !== null) {
      return `guid:${guidKey}`;
    }
    // GUIDが無い場合は位置ベースにフォールバック
    console.warn(`GUID not found for element ${element.getAttribute('id')}, falling back to position-based key`);
  }

  // 位置ベースのキー生成
  return positionKeyGenerator();
}

// --- 要素比較ロジック ---
/**
 * 2つの要素リスト（モデルAとB）を比較し、一致、Aのみ、Bのみの要素を分類する。
 * @param {Array<Element>} elementsA - モデルAの要素リスト。
 * @param {Array<Element>} elementsB - モデルBの要素リスト。
 * @param {Map<string, {x: number, y: number, z: number}>} nodeMapA - モデルAのノードマップ。
 * @param {Map<string, {x: number, y: number, z: number}>} nodeMapB - モデルBのノードマップ。
 * @param {function(Element, Map): {key: string|null, data: any}} keyExtractor - 要素から比較キーと関連データを抽出する関数。
 * @returns {{matched: Array<{dataA: any, dataB: any}>, onlyA: Array<any>, onlyB: Array<any>}} 比較結果オブジェクト。
 */
export function compareElements(
  elementsA,
  elementsB,
  nodeMapA,
  nodeMapB,
  keyExtractor
) {
  const keysA = new Map();
  const keysB = new Map();
  const dataA = [];
  const dataB = [];
  const matchedData = [];

  for (const elementA of elementsA) {
    const { key, data } = keyExtractor(elementA, nodeMapA);
    if (key !== null) {
      keysA.set(key, data);
    }
  }

  for (const elementB of elementsB) {
    const { key, data } = keyExtractor(elementB, nodeMapB);
    if (key !== null) {
      keysB.set(key, data);
    }
  }

  for (const [key, dataAItem] of keysA.entries()) {
    if (keysB.has(key)) {
      matchedData.push({ dataA: dataAItem, dataB: keysB.get(key) });
      keysB.delete(key);
    } else {
      dataA.push(dataAItem);
    }
  }

  for (const dataBItem of keysB.values()) {
    dataB.push(dataBItem);
  }

  return { matched: matchedData, onlyA: dataA, onlyB: dataB };
}

// --- 要素タイプごとのキー抽出関数 ---

/**
 * 線分要素（柱、梁など）から比較キーと関連データ（始点・終点座標、要素ID）を抽出する。
 * @param {Element} element - 線分要素のXML要素。
 * @param {Map<string, {x: number, y: number, z: number}>} nodeMap - 対応するノードマップ。
 * @param {string} idStartAttr - 始点ノードIDの属性名。
 * @param {string} idEndAttr - 終点ノードIDの属性名。
 * @param {string} [keyType] - 比較キータイプ（省略時はPOSITION_BASED）
 * @returns {{key: string|null, data: {startCoords: object, endCoords: object, id: string}|null}} キーとデータのオブジェクト。
 */
export function lineElementKeyExtractor(
  element,
  nodeMap,
  idStartAttr,
  idEndAttr,
  keyType = COMPARISON_KEY_TYPE.POSITION_BASED
) {
  let startId = element.getAttribute(idStartAttr);
  let endId = element.getAttribute(idEndAttr);
  const elementId = element.getAttribute('id');
  let startCoords = nodeMap.get(startId);
  let endCoords = nodeMap.get(endId);

  // 1-node format fallback (for Pile/Footing with id_node + level_top)
  if ((!startCoords || !endCoords) && !startId && !endId) {
    const idNode = element.getAttribute('id_node');
    const levelTop = element.getAttribute('level_top');

    if (idNode && levelTop && nodeMap.has(idNode)) {
      const topNode = nodeMap.get(idNode);
      const offsetX = parseFloat(element.getAttribute('offset_X')) || 0;
      const offsetY = parseFloat(element.getAttribute('offset_Y')) || 0;
      const levelTopValue = parseFloat(levelTop);

      // Default pile length for line display (actual length from section data used in 3D)
      const defaultPileLength = 5000; // 5000mm default

      // Calculate top node position (id_node + offsets + level_top for Z)
      endCoords = {
        x: topNode.x + offsetX,
        y: topNode.y + offsetY,
        z: levelTopValue // level_top is the top Z coordinate
      };

      // Calculate bottom node (top - default pile length)
      startCoords = {
        x: endCoords.x,
        y: endCoords.y,
        z: levelTopValue - defaultPileLength // Bottom is below top
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
      [idEndAttr]: endId
    };

    // name属性やその他の属性も取得
    const name = element.getAttribute('name');
    if (name) elementData.name = name;

    const idSection = element.getAttribute('id_section');
    if (idSection) elementData.id_section = idSection;

    const kindStructure = element.getAttribute('kind_structure');
    if (kindStructure) elementData.kind_structure = kindStructure;

    // GUID属性も取得
    const guid = element.getAttribute('guid');
    if (guid) elementData.guid = guid;

    // キータイプに応じたキー生成
    const key = getElementKey(element, keyType, () =>
      getLineElementKey(startCoords, endCoords)
    );

    return {
      key,
      data: {
        startCoords,
        endCoords,
        id: elementId,
        name: name || undefined,  // ツリー表示用にトップレベルに追加
        guid: guid || undefined,  // ツリー表示用にトップレベルに追加
        element: elementData // 要素データを追加
      }
    };
  }
  console.warn(
    `Missing node coords for line element: Start=${startId}, End=${endId}, ElementID=${elementId}`
  );
  return { key: null, data: null };
}

/**
 * ポリゴン要素（スラブ、壁など）から比較キーと関連データ（頂点座標リスト、要素ID）を抽出する。
 * @param {Element} element - ポリゴン要素のXML要素。
 * @param {Map<string, {x: number, y: number, z: number}>} nodeMap - 対応するノードマップ。
 * @param {string} [nodeOrderTag="StbNodeIdOrder"] - 頂点ノードIDリストが含まれるタグ名。
 * @param {string} [keyType] - 比較キータイプ（省略時はPOSITION_BASED）
 * @returns {{key: string|null, data: {vertexCoordsList: Array<object>, id: string}|null}} キーとデータのオブジェクト。
 */
export function polyElementKeyExtractor(
  element,
  nodeMap,
  nodeOrderTag = 'StbNodeIdOrder',
  keyType = COMPARISON_KEY_TYPE.POSITION_BASED
) {
  const floorId = element.getAttribute('id_floor') || '';
  const sectionId = element.getAttribute('id_section') || '';
  const elementId = element.getAttribute('id');
  const orderElem = element.getElementsByTagNameNS(
    STB_NAMESPACE,
    nodeOrderTag
  )[0];
  if (orderElem && orderElem.textContent) {
    const nodeIds = orderElem.textContent.trim().split(/\s+/);
    const vertexCoordsList = nodeIds
      .map((id) => nodeMap.get(id))
      .filter((coords) => coords);

    if (
      vertexCoordsList.length === nodeIds.length &&
      vertexCoordsList.length >= 3
    ) {
      // name属性とGUID属性を取得
      const name = element.getAttribute('name');
      const guid = element.getAttribute('guid');

      // キータイプに応じたキー生成
      const key = getElementKey(element, keyType, () =>
        getPolyElementKey(vertexCoordsList, floorId, sectionId)
      );

      return {
        key,
        data: {
          vertexCoordsList,
          id: elementId,
          name: name || undefined,  // ツリー表示用にトップレベルに追加
          guid: guid || undefined   // ツリー表示用にトップレベルに追加
        }
      };
    } else {
      console.warn(
        `Missing node coords or insufficient vertices for poly element: ElementID=${elementId}, IDs=${nodeIds}, Found=${vertexCoordsList.length}`
      );
    }
  } else {
    console.warn(
      `Missing or empty node order tag '${nodeOrderTag}' for poly element: ElementID=${elementId}`
    );
  }
  return { key: null, data: null };
}

/**
 * 節点要素から比較キーと関連データ（座標、ノードID）を抽出する。
 * @param {Element} element - 節点要素のXML要素 (StbNode)。
 * @param {Map<string, {x: number, y: number, z: number}>} nodeMap - 対応するノードマップ。
 * @returns {{key: string|null, data: {coords: object, id: string}|null}} キーとデータのオブジェクト。
 */
export function nodeElementKeyExtractor(element, nodeMap) {
  const nodeId = element.getAttribute('id');
  const coords = nodeMap.get(nodeId);
  if (coords) {
    // name属性とGUID属性を取得（Nodeには通常ないが、存在する場合に備えて）
    const name = element.getAttribute('name');
    const guid = element.getAttribute('guid');

    const key = getNodeCoordKey(coords);
    return {
      key,
      data: {
        coords,
        id: nodeId,
        name: name || undefined,  // ツリー表示用にトップレベルに追加
        guid: guid || undefined   // ツリー表示用にトップレベルに追加
      }
    };
  }
  return { key: null, data: null };
}

// --- 重要度を考慮した比較機能 ---

/**
 * 要素の重要度を取得する
 * @param {Element} element - XML要素
 * @param {string} elementType - 要素タイプ（'StbColumn', 'StbBeam'など）
 * @returns {string} 重要度レベル
 */
function getElementImportance(element, elementType) {
  const manager = getImportanceManager();
  if (!manager.isInitialized) {
    return IMPORTANCE_LEVELS.REQUIRED; // デフォルト
  }

  // 基本的な要素パス
  const basePath = `//ST_BRIDGE/${elementType}`;
  let importance = manager.getImportanceLevel(basePath);

  // より具体的なパスがあれば使用（例：属性レベル）
  let elementId = null;
  if (element && typeof element.getAttribute === 'function') {
    // DOM Element の場合
    elementId = element.getAttribute('id');
  } else if (element && typeof element === 'object' && element.id) {
    // JavaScript object の場合
    elementId = element.id;
  }

  if (elementId) {
    const idPath = `${basePath}/@id`;
    const idImportance = manager.getImportanceLevel(idPath);
    if (idImportance !== IMPORTANCE_LEVELS.REQUIRED) {
      importance = idImportance;
    }
  }

  return importance;
}

/**
 * 重要度レベルに基づいて要素をフィルタリングする
 * @param {Array<Element>} elements - 要素リスト
 * @param {string} elementType - 要素タイプ
 * @param {string[]} targetImportanceLevels - 対象とする重要度レベル
 * @returns {Array<Element>} フィルタリング済みの要素リスト
 */
export function filterElementsByImportance(elements, elementType, targetImportanceLevels) {
  if (!targetImportanceLevels || targetImportanceLevels.length === 0) {
    return elements; // フィルタリングなし
  }

  return elements.filter(element => {
    const importance = getElementImportance(element, elementType);
    return targetImportanceLevels.includes(importance);
  });
}

/**
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
 * @returns {{matched: Array, onlyA: Array, onlyB: Array, importanceStats: Object}} 重要度を考慮した比較結果
 */
export function compareElementsWithImportance(
  elementsA,
  elementsB,
  nodeMapA,
  nodeMapB,
  keyExtractor,
  elementType,
  options = {}
) {
  const {
    targetImportanceLevels = null,
    includeImportanceInfo = true
  } = options;

  // 重要度フィルタリング
  let filteredElementsA = elementsA;
  let filteredElementsB = elementsB;

  if (targetImportanceLevels) {
    filteredElementsA = filterElementsByImportance(elementsA, elementType, targetImportanceLevels);
    filteredElementsB = filterElementsByImportance(elementsB, elementType, targetImportanceLevels);
  }

  // 基本的な比較を実行
  const basicResult = compareElements(
    filteredElementsA,
    filteredElementsB,
    nodeMapA,
    nodeMapB,
    keyExtractor
  );

  // 重要度情報を付加
  if (includeImportanceInfo) {
    const addImportanceInfo = (items, modelType) => {
      return items.map(item => {
        let element;
        if (modelType === 'matched') {
          // matchedの場合、dataAから要素を取得
          element = item.dataA.element || null;
        } else {
          // onlyA, onlyBの場合
          element = item.element || null;
        }

        const importance = element ? getElementImportance(element, elementType) : IMPORTANCE_LEVELS.OPTIONAL;

        return {
          ...item,
          importance,
          importanceName: IMPORTANCE_LEVEL_NAMES[importance]
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
      filteredElementsB: filteredElementsB.length
    }
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
      totalDifferences: comparisonResult.onlyA.length + comparisonResult.onlyB.length
    }
  };

  // 重要度レベル別の初期化
  for (const level of Object.values(IMPORTANCE_LEVELS)) {
    stats.byImportance[level] = {
      matched: 0,
      onlyA: 0,
      onlyB: 0,
      differences: 0
    };
  }

  // 統計を集計
  const countByImportance = (items, category) => {
    items.forEach(item => {
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
    timestamp: new Date().toISOString()
  };

  // 重要度レベル別の初期化
  for (const level of Object.values(IMPORTANCE_LEVELS)) {
    summary.byImportance[level] = {
      matched: 0,
      differences: 0,
      onlyA: 0,
      onlyB: 0
    };
  }

  // 各比較結果を集計
  comparisonResults.forEach(result => {
    if (!result.importanceStats) {
      return;
    }

    const elementType = result.elementType;
    summary.byElementType[elementType] = result.importanceStats.summary;

    summary.totalElements += result.importanceStats.summary.totalMatched +
                           result.importanceStats.summary.totalDifferences;
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

/**
 * 重要度設定の変更を比較結果に反映する
 * @param {Object} comparisonResult - 既存の比較結果
 * @param {string} elementType - 要素タイプ
 * @returns {Object} 更新された比較結果
 */
export function updateComparisonResultImportance(comparisonResult, elementType) {
  // 重要度情報を再計算
  const addImportanceInfo = (items, modelType) => {
    return items.map(item => {
      let element;
      if (modelType === 'matched') {
        element = item.dataA.element || null;
      } else {
        element = item.element || null;
      }

      const importance = element ? getElementImportance(element, elementType) : IMPORTANCE_LEVELS.OPTIONAL;

      return {
        ...item,
        importance,
        importanceName: IMPORTANCE_LEVEL_NAMES[importance]
      };
    });
  };

  const updatedResult = {
    ...comparisonResult,
    matched: addImportanceInfo(comparisonResult.matched, 'matched'),
    onlyA: addImportanceInfo(comparisonResult.onlyA, 'onlyA'),
    onlyB: addImportanceInfo(comparisonResult.onlyB, 'onlyB')
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
  toleranceConfig = null
) {
  // 許容差設定を取得
  const config = toleranceConfig || getToleranceConfig();

  const result = {
    exact: [],
    withinTolerance: [],
    mismatch: [],
    onlyA: [],
    onlyB: []
  };

  // 厳密モードまたは許容差無効の場合は従来の比較
  if (config.strictMode || !config.enabled) {
    const basicResult = compareElements(elementsA, elementsB, nodeMapA, nodeMapB, keyExtractor);
    result.exact = basicResult.matched;
    result.onlyA = basicResult.onlyA;
    result.onlyB = basicResult.onlyB;
    return result;
  }

  // 許容差を考慮した比較ロジック
  const mapA = new Map();
  const mapB = new Map();

  // モデルAの要素をマッピング
  for (const elementA of elementsA) {
    const { key, data } = keyExtractor(elementA, nodeMapA);
    if (key !== null) {
      if (!mapA.has(key)) {
        mapA.set(key, []);
      }
      mapA.get(key).push(data);
    }
  }

  // モデルBの要素をマッピングし、マッチングを試行
  for (const elementB of elementsB) {
    const { key, data } = keyExtractor(elementB, nodeMapB);
    if (key === null) continue;

    let foundMatch = false;

    // 同じキーの要素を探す（完全一致）
    if (mapA.has(key)) {
      const candidatesA = mapA.get(key);

      for (let i = 0; i < candidatesA.length; i++) {
        const dataA = candidatesA[i];
        const comparisonResult = compareElementDataWithTolerance(dataA, data, config);

        if (comparisonResult.match && comparisonResult.type === 'exact') {
          result.exact.push({
            dataA: dataA,
            dataB: data,
            matchType: 'exact',
            differences: comparisonResult.differences
          });
          candidatesA.splice(i, 1);
          if (candidatesA.length === 0) {
            mapA.delete(key);
          }
          foundMatch = true;
          break;
        }
      }
    }

    // 完全一致が見つからない場合、許容差内の一致を探す
    if (!foundMatch) {
      for (const [keyA, candidatesA] of mapA.entries()) {
        for (let i = 0; i < candidatesA.length; i++) {
          const dataA = candidatesA[i];
          const comparisonResult = compareElementDataWithTolerance(dataA, data, config);

          if (comparisonResult.match && comparisonResult.type === 'withinTolerance') {
            result.withinTolerance.push({
              dataA: dataA,
              dataB: data,
              matchType: 'withinTolerance',
              differences: comparisonResult.differences
            });
            candidatesA.splice(i, 1);
            if (candidatesA.length === 0) {
              mapA.delete(keyA);
            }
            foundMatch = true;
            break;
          }
        }
        if (foundMatch) break;
      }
    }

    // マッチが見つからない場合
    if (!foundMatch) {
      if (!mapB.has(key)) {
        mapB.set(key, []);
      }
      mapB.get(key).push(data);
    }
  }

  // 残りの要素を振り分け
  for (const candidatesA of mapA.values()) {
    result.onlyA.push(...candidatesA);
  }

  for (const candidatesB of mapB.values()) {
    result.onlyB.push(...candidatesB);
  }

  return result;
}

// 比較のための追加ユーティリティ関数をここに追加できます。

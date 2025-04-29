// このファイルはファイルから読み込まれた2つのモデルを比較する関数を含みます。
// モデル間の差異や類似点を特定します。

// --- 定数 ---
const PRECISION = 3; // 座標比較時の小数点以下の桁数
const STB_NAMESPACE = "https://www.building-smart.or.jp/dl"; // ST-Bridge 名前空間 (stbParserと重複するが、独立性のため保持)

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
    typeof coords.x !== "number" ||
    typeof coords.y !== "number" ||
    typeof coords.z !== "number"
  ) {
    console.warn("Invalid coordinates for key generation:", coords);
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
  return [startKey, endKey].sort().join("|");
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
  floorId = "",
  sectionId = "",
  precision = PRECISION
) {
  if (!vertexCoordsList || vertexCoordsList.length === 0) return null;
  const coordKeys = vertexCoordsList.map((coords) =>
    getNodeCoordKey(coords, precision)
  );
  if (coordKeys.some((key) => key === null)) return null;
  return coordKeys.sort().join(",") + `|F:${floorId}|S:${sectionId}`;
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

  for (const elA of elementsA) {
    const { key, data } = keyExtractor(elA, nodeMapA);
    if (key !== null) {
      keysA.set(key, data);
    }
  }

  for (const elB of elementsB) {
    const { key, data } = keyExtractor(elB, nodeMapB);
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
 * @returns {{key: string|null, data: {startCoords: object, endCoords: object, id: string}|null}} キーとデータのオブジェクト。
 */
export function lineElementKeyExtractor(
  element,
  nodeMap,
  idStartAttr,
  idEndAttr
) {
  const startId = element.getAttribute(idStartAttr);
  const endId = element.getAttribute(idEndAttr);
  const elementId = element.getAttribute("id");
  const startCoords = nodeMap.get(startId);
  const endCoords = nodeMap.get(endId);
  if (startCoords && endCoords) {
    const key = getLineElementKey(startCoords, endCoords);
    return { key, data: { startCoords, endCoords, id: elementId } };
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
 * @returns {{key: string|null, data: {vertexCoordsList: Array<object>, id: string}|null}} キーとデータのオブジェクト。
 */
export function polyElementKeyExtractor(
  element,
  nodeMap,
  nodeOrderTag = "StbNodeIdOrder"
) {
  const floorId = element.getAttribute("id_floor") || "";
  const sectionId = element.getAttribute("id_section") || "";
  const elementId = element.getAttribute("id");
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
      const key = getPolyElementKey(vertexCoordsList, floorId, sectionId);
      return { key, data: { vertexCoordsList, id: elementId } };
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
  const nodeId = element.getAttribute("id");
  const coords = nodeMap.get(nodeId);
  if (coords) {
    const key = getNodeCoordKey(coords);
    return { key, data: { coords, id: nodeId } };
  }
  return { key: null, data: null };
}

// 比較のための追加ユーティリティ関数をここに追加できます。

/**
 * @fileoverview 比較キー生成モジュール
 *
 * モデル要素の比較用キー文字列を生成するための関数群。
 * 座標ベースとGUIDベースの両方のキー生成をサポートします。
 */

import { COMPARISON_KEY_TYPE } from '../../config/comparisonKeyConfig.js';
import { COORDINATE_PRECISION } from '../../config/geometryConfig.js';

const PRECISION = COORDINATE_PRECISION;

/**
 * 座標オブジェクトから比較用のキー文字列を生成する。
 * @param {{x: number, y: number, z: number}} coords - 座標オブジェクト。
 * @param {number} [precision=PRECISION] - キー生成に使用する小数点以下の桁数。
 * @returns {string|null} 生成されたキー文字列、または無効な座標の場合はnull。
 */
export function getNodeCoordKey(coords, precision = PRECISION) {
  if (
    !coords ||
    typeof coords.x !== 'number' ||
    typeof coords.y !== 'number' ||
    typeof coords.z !== 'number'
  ) {
    console.warn('[keyGenerator] キー生成: 無効な座標', coords);
    return null;
  }
  return `${coords.x.toFixed(precision)},${coords.y.toFixed(precision)},${coords.z.toFixed(precision)}`;
}

/**
 * 線分要素（始点・終点座標）から比較用のキー文字列を生成する。
 * @param {{x: number, y: number, z: number}} startCoords - 始点座標。
 * @param {{x: number, y: number, z: number}} endCoords - 終点座標。
 * @param {number} [precision=PRECISION] - 座標キー生成に使用する小数点以下の桁数。
 * @returns {string|null} 生成されたキー文字列、または無効な座標の場合はnull。
 */
export function getLineElementKey(startCoords, endCoords, precision = PRECISION) {
  const startKey = getNodeCoordKey(startCoords, precision);
  const endKey = getNodeCoordKey(endCoords, precision);
  if (startKey === null || endKey === null) return null;
  return [startKey, endKey].sort().join('|');
}

/**
 * ポリゴン要素（頂点座標リスト）から比較用のキー文字列を生成する。
 * @param {Array<{x: number, y: number, z: number}>} vertexCoordsList - 頂点座標のリスト。
 * @param {number} [precision=PRECISION] - 座標キー生成に使用する小数点以下の桁数。
 * @returns {string|null} 生成されたキー文字列、または無効な頂点が含まれる場合はnull。
 */
export function getPolyElementKey(vertexCoordsList, precision = PRECISION) {
  if (!vertexCoordsList || vertexCoordsList.length === 0) return null;
  const coordKeys = vertexCoordsList.map((coords) => getNodeCoordKey(coords, precision));
  if (coordKeys.some((key) => key === null)) return null;
  return coordKeys.sort().join(',');
}

/**
 * 要素からプロパティ値を取得する（XML DOM/JSオブジェクト両対応）
 * @param {Element|Object} element - 要素
 * @param {string} attrName - 属性名
 * @returns {string|null} 属性値
 */
export function getAttr(element, attrName) {
  if (!element) return null;
  if (typeof element.getAttribute === 'function') {
    return element.getAttribute(attrName);
  }
  const val = element[attrName];
  return val !== undefined ? String(val) : null;
}

/**
 * 要素のGUID属性からキーを生成する（XML DOM/JSオブジェクト両対応）
 * @param {Element|Object} element - XML要素またはJSオブジェクト
 * @returns {string|null} GUID文字列、またはGUID属性が無い場合はnull
 */
function getGuidKey(element) {
  const guid = getAttr(element, 'guid');
  return guid && guid.trim() !== '' ? guid.trim() : null;
}

/**
 * ノードIDから所属階・所属通芯名に基づく比較用キー文字列を生成する。
 * @param {string} nodeId - ノードID。
 * @param {Map<string, {storyName: string|null, axisNames: string[]}>} storyAxisLookup - 所属情報ルックアップ。
 * @returns {string|null} 生成されたキー文字列、または所属情報が無い場合はnull。
 */
export function getNodeStoryAxisKey(nodeId, storyAxisLookup) {
  if (!storyAxisLookup || !nodeId) return null;
  const info = storyAxisLookup.get(String(nodeId));
  if (!info) return null;

  const storyPart = info.storyName || '';
  const axisPart = [...info.axisNames].sort().join(',');

  // 階名も通芯名も無い場合はキー生成不可
  if (!storyPart && !axisPart) return null;

  return `sa:${storyPart}|${axisPart}`;
}

/**
 * 要素から比較キーを生成する（キータイプに応じて位置ベースまたはGUIDベース）
 * @param {Element} element - XML要素
 * @param {string} keyType - 比較キータイプ（COMPARISON_KEY_TYPE.POSITION_BASED または GUID_BASED）
 * @param {function} positionKeyGenerator - 位置ベースのキー生成関数
 * @returns {string|null} 生成されたキー文字列、GUIDモードでGUIDが無い場合はnull
 */
export function getElementKey(element, keyType, positionKeyGenerator) {
  if (keyType === COMPARISON_KEY_TYPE.GUID_BASED) {
    const guidKey = getGuidKey(element);
    if (guidKey !== null) {
      return `guid:${guidKey}`;
    }
    // GUIDモードでGUIDが無い要素は比較対象から除外（nullを返す）
    // これにより、GUIDが無い要素は「Aのみ」または「Bのみ」として分類される
    return null;
  }

  // 位置ベースのキー生成（POSITION_BASED および STORY_AXIS_BASED のフォールバック）
  return positionKeyGenerator();
}

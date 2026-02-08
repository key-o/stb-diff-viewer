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
 * ポリゴン要素（頂点座標リスト、床ID、断面ID）から比較用のキー文字列を生成する。
 * @param {Array<{x: number, y: number, z: number}>} vertexCoordsList - 頂点座標のリスト。
 * @param {string} [floorId=''] - 床ID。
 * @param {string} [sectionId=''] - 断面ID。
 * @param {number} [precision=PRECISION] - 座標キー生成に使用する小数点以下の桁数。
 * @returns {string|null} 生成されたキー文字列、または無効な頂点が含まれる場合はnull。
 */
export function getPolyElementKey(
  vertexCoordsList,
  floorId = '',
  sectionId = '',
  precision = PRECISION,
) {
  if (!vertexCoordsList || vertexCoordsList.length === 0) return null;
  const coordKeys = vertexCoordsList.map((coords) => getNodeCoordKey(coords, precision));
  if (coordKeys.some((key) => key === null)) return null;
  return coordKeys.sort().join(',') + `|F:${floorId}|S:${sectionId}`;
}

/**
 * 要素のGUID属性からキーを生成する
 * @param {Element} element - XML要素
 * @returns {string|null} GUID文字列、またはGUID属性が無い場合はnull
 */
export function getGuidKey(element) {
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
export function getElementKey(element, keyType, positionKeyGenerator) {
  if (keyType === COMPARISON_KEY_TYPE.GUID_BASED) {
    const guidKey = getGuidKey(element);
    if (guidKey !== null) {
      return `guid:${guidKey}`;
    }
    // GUIDが無い場合は位置ベースにフォールバック
    console.warn(
      `[keyGenerator] 比較キー: GUIDなし、位置ベースにフォールバック (id=${element.getAttribute('id')})`,
    );
  }

  // 位置ベースのキー生成
  return positionKeyGenerator();
}

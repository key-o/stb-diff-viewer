/**
 * @fileoverview 要素比較・レンダリング
 *
 * 立体表示モードにおける要素の比較処理を提供します。
 * 2つのモデルの要素をノード位置ベースで比較し、matched/mismatch/onlyA/onlyBに分類します。
 */

import { COORDINATE_PRECISION } from '../../config/geometryConfig.js';

/**
 * 立体表示用の要素比較関数
 * 2つのモデルの要素をノード位置ベースで比較し、matched/mismatch/onlyA/onlyBに分類する
 *
 * @param {Array} elementsA - モデルAの要素配列
 * @param {Array} elementsB - モデルBの要素配列
 * @param {Map} nodesA - モデルAのノードマップ
 * @param {Map} nodesB - モデルBのノードマップ
 * @param {string} nodeStartAttr - 始点ノード属性名
 * @param {string} nodeEndAttr - 終点ノード属性名（1ノード要素の場合はnull）
 * @returns {{matched: Array<{elementA, elementB}>, mismatch: Array<{elementA, elementB}>, onlyA: Array, onlyB: Array}}
 */
export function compareSolidElements(
  elementsA,
  elementsB,
  nodesA,
  nodesB,
  nodeStartAttr,
  nodeEndAttr,
) {
  // 座標比較時の精度（共有定数を使用）
  const PRECISION = COORDINATE_PRECISION;

  /**
   * 座標からキー文字列を生成
   * @param {THREE.Vector3|{x,y,z}} coords - 座標
   * @returns {string|null}
   */
  function getCoordKey(coords) {
    if (!coords) return null;
    const x = typeof coords.x === 'number' ? coords.x : coords.x;
    const y = typeof coords.y === 'number' ? coords.y : coords.y;
    const z = typeof coords.z === 'number' ? coords.z : coords.z;
    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
      return null;
    }
    return `${x.toFixed(PRECISION)},${y.toFixed(PRECISION)},${z.toFixed(PRECISION)}`;
  }

  /**
   * 要素からキーを生成
   * @param {Object} element - 要素
   * @param {Map} nodes - ノードマップ
   * @returns {string|null}
   */
  function getElementKey(element, nodes) {
    // 多角形要素（複数ノード要素: Slab, Wall）のチェック
    if (element.node_ids && Array.isArray(element.node_ids) && element.node_ids.length >= 3) {
      const nodeCoords = [];
      for (const nodeId of element.node_ids) {
        const node = nodes.get(nodeId);
        const coordKey = getCoordKey(node);
        if (!coordKey) return null;
        nodeCoords.push(coordKey);
      }
      // 順序に依存しないキー（ソート済み）
      return `poly:${nodeCoords.sort().join('|')}`;
    }

    if (nodeEndAttr === null) {
      // 1ノード要素（基礎など）
      const nodeId = element.id_node;
      const node = nodes.get(nodeId);
      return getCoordKey(node);
    }

    // 2ノード要素
    const startNodeId = element[nodeStartAttr];
    const endNodeId = element[nodeEndAttr];

    // 杭の1ノード形式の場合（id_node + level_top）
    if (!startNodeId && !endNodeId && element.id_node && element.level_top !== undefined) {
      const nodeId = element.id_node;
      const node = nodes.get(nodeId);
      if (node) {
        // 1ノード形式の杭はノード位置と深度でキーを生成
        const levelTop = element.level_top;
        return `pile:${getCoordKey(node)}|depth:${levelTop.toFixed(PRECISION)}`;
      }
      return null;
    }

    const startNode = nodes.get(startNodeId);
    const endNode = nodes.get(endNodeId);

    const startKey = getCoordKey(startNode);
    const endKey = getCoordKey(endNode);

    if (!startKey || !endKey) return null;

    // 順序に依存しないキー（ソート済み）
    return [startKey, endKey].sort().join('|');
  }

  /**
   * 2つの要素の属性を比較する
   * @param {Object} elementA - モデルAの要素
   * @param {Object} elementB - モデルBの要素
   * @returns {boolean} 属性が一致すればtrue
   */
  function compareElementAttributes(elementA, elementB) {
    // 比較対象の主要属性（断面、材質、回転、オフセットなど）
    const attributesToCompare = [
      'id_sec', // 断面ID
      'kind', // 材質種別
      'rotate', // 回転角
      'offset_X', // X方向オフセット
      'offset_Y', // Y方向オフセット
      'offset_Z', // Z方向オフセット
      'level_top', // 上端レベル
      'level_bottom', // 下端レベル
      'condition_bottom', // 下端条件
      'condition_top', // 上端条件
      'joint_bottom', // 下端接合部
      'joint_top', // 上端接合部
      'haunch_H', // ハンチ高さ
      'haunch_start', // ハンチ開始
      'haunch_end', // ハンチ終了
    ];

    for (const attr of attributesToCompare) {
      const valueA = elementA[attr];
      const valueB = elementB[attr];

      // 両方とも未定義なら一致とみなす
      if (valueA === undefined && valueB === undefined) {
        continue;
      }

      // 片方だけ定義されている場合は不一致
      if (valueA === undefined || valueB === undefined) {
        return false;
      }

      // 数値の場合は小数点以下の精度で比較
      if (typeof valueA === 'number' && typeof valueB === 'number') {
        if (Math.abs(valueA - valueB) > 0.001) {
          return false;
        }
      } else {
        // その他の型は厳密比較
        if (valueA !== valueB) {
          return false;
        }
      }
    }

    return true;
  }

  const keysA = new Map();
  const keysB = new Map();
  const result = {
    matched: [],
    mismatch: [],
    onlyA: [],
    onlyB: [],
  };

  // モデルAの要素をキーでマッピング
  for (const element of elementsA) {
    const key = getElementKey(element, nodesA);
    if (key) {
      keysA.set(key, element);
    }
  }

  // モデルBの要素をキーでマッピング
  for (const element of elementsB) {
    const key = getElementKey(element, nodesB);
    if (key) {
      keysB.set(key, element);
    }
  }

  // マッチングを実行
  for (const [key, elementA] of keysA.entries()) {
    if (keysB.has(key)) {
      const elementB = keysB.get(key);

      // 属性を比較して、一致/不一致を判定
      if (compareElementAttributes(elementA, elementB)) {
        result.matched.push({
          elementA: elementA,
          elementB: elementB,
        });
      } else {
        result.mismatch.push({
          elementA: elementA,
          elementB: elementB,
        });
      }
      keysB.delete(key);
    } else {
      result.onlyA.push(elementA);
    }
  }

  // モデルBのみの要素
  for (const elementB of keysB.values()) {
    result.onlyB.push(elementB);
  }

  return result;
}

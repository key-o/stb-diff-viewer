/**
 * @fileoverview 許容差を考慮した座標比較関数
 *
 * このファイルは、許容差を使用した座標比較機能を提供します：
 * - 2つの座標の比較（完全一致/許容差内/不一致）
 * - 要素比較（ノード、線分要素、ポリゴン要素）
 * - 比較結果の5段階分類
 */

/**
 * 2つの座標が許容差内で一致するかチェック
 * @param {{x: number, y: number, z: number}} coords1 - 座標1
 * @param {{x: number, y: number, z: number}} coords2 - 座標2
 * @param {{x: number, y: number, z: number}} tolerance - 許容差
 * @returns {{match: boolean, type: string, differences: {x: number, y: number, z: number}}}
 */
export function compareCoordinatesWithTolerance(coords1, coords2, tolerance) {
  // 差分を計算（絶対値）
  const diff = {
    x: Math.abs(coords1.x - coords2.x),
    y: Math.abs(coords1.y - coords2.y),
    z: Math.abs(coords1.z - coords2.z)
  };

  // 完全一致チェック
  const isExactMatch = diff.x === 0 && diff.y === 0 && diff.z === 0;
  if (isExactMatch) {
    return {
      match: true,
      type: 'exact',
      differences: diff
    };
  }

  // 許容差内チェック
  const withinTolerance =
    diff.x <= tolerance.x &&
    diff.y <= tolerance.y &&
    diff.z <= tolerance.z;

  if (withinTolerance) {
    return {
      match: true,
      type: 'withinTolerance',
      differences: diff
    };
  }

  // 不一致
  return {
    match: false,
    type: 'mismatch',
    differences: diff
  };
}

/**
 * 2つの要素データを詳細に比較（許容差考慮）
 * @param {Object} dataA - 要素データA
 * @param {Object} dataB - 要素データB
 * @param {Object} toleranceConfig - 許容差設定
 * @returns {{match: boolean, type: string, differences: Object}}
 */
export function compareElementDataWithTolerance(dataA, dataB, toleranceConfig) {
  // StbNode（基準点）の比較
  if (dataA.coords && dataB.coords) {
    return compareCoordinatesWithTolerance(
      dataA.coords,
      dataB.coords,
      toleranceConfig.basePoint
    );
  }

  // 線分要素（始点・終点）の比較
  if (dataA.startCoords && dataA.endCoords && dataB.startCoords && dataB.endCoords) {
    const startComparison = compareCoordinatesWithTolerance(
      dataA.startCoords,
      dataB.startCoords,
      toleranceConfig.basePoint
    );

    const endComparison = compareCoordinatesWithTolerance(
      dataA.endCoords,
      dataB.endCoords,
      toleranceConfig.basePoint
    );

    // 両方が一致する場合
    if (startComparison.match && endComparison.match) {
      const type = (startComparison.type === 'exact' && endComparison.type === 'exact')
        ? 'exact'
        : 'withinTolerance';

      return {
        match: true,
        type: type,
        differences: {
          start: startComparison.differences,
          end: endComparison.differences
        }
      };
    }

    // どちらかが不一致
    return {
      match: false,
      type: 'mismatch',
      differences: {
        start: startComparison.differences,
        end: endComparison.differences
      }
    };
  }

  // ポリゴン要素の比較
  if (dataA.vertexCoordsList && dataB.vertexCoordsList) {
    if (dataA.vertexCoordsList.length !== dataB.vertexCoordsList.length) {
      return { match: false, type: 'mismatch', differences: {} };
    }

    let allExact = true;
    let allWithinTolerance = true;
    const vertexDifferences = [];

    for (let i = 0; i < dataA.vertexCoordsList.length; i++) {
      const comparison = compareCoordinatesWithTolerance(
        dataA.vertexCoordsList[i],
        dataB.vertexCoordsList[i],
        toleranceConfig.basePoint
      );

      vertexDifferences.push(comparison.differences);

      if (!comparison.match) {
        allWithinTolerance = false;
        allExact = false;
      } else if (comparison.type !== 'exact') {
        allExact = false;
      }
    }

    if (!allWithinTolerance) {
      return { match: false, type: 'mismatch', differences: { vertices: vertexDifferences } };
    }

    return {
      match: true,
      type: allExact ? 'exact' : 'withinTolerance',
      differences: { vertices: vertexDifferences }
    };
  }

  return { match: false, type: 'mismatch', differences: {} };
}

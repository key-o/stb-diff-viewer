/**
 * @fileoverview 許容差を考慮した座標比較関数
 *
 * このファイルは、許容差を使用した座標比較機能を提供します：
 * - 2つの座標の比較（完全一致/許容差内/不一致）
 * - 要素比較（ノード、線分要素、ポリゴン要素）
 * - 比較結果の5段階分類
 *
 * V2 配置比較モード対応:
 *   線分・ポリゴン要素データに offset 情報（startOffset/endOffset/perVertexOffsets）が
 *   含まれる場合、最終ジオメトリ座標（生ノード座標 + offset）で許容差比較する。
 *   これにより「節点を移動した表現」と「節点+補償オフセットで表現」の最終ジオメトリ等価性が
 *   許容差ルートでも正しく判定される。
 */

export { compareGeometryCenterDirection as compareGeometryCenterDirectionWithTolerance } from './geometrySignature.js';

/**
 * 座標 + オフセットを加算する（null セーフ）
 * @param {{x: number, y: number, z: number}} coords
 * @param {{x?: number, y?: number, z?: number}|null} [offset]
 * @returns {{x: number, y: number, z: number}}
 */
function applyOffset(coords, offset) {
  if (!offset) return { x: coords.x, y: coords.y, z: coords.z };
  return {
    x: coords.x + (offset.x || 0),
    y: coords.y + (offset.y || 0),
    z: coords.z + (offset.z || 0),
  };
}

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
    z: Math.abs(coords1.z - coords2.z),
  };

  // 完全一致チェック
  const isExactMatch = diff.x === 0 && diff.y === 0 && diff.z === 0;
  if (isExactMatch) {
    return {
      match: true,
      type: 'exact',
      differences: diff,
    };
  }

  // 許容差内チェック
  const withinTolerance = diff.x <= tolerance.x && diff.y <= tolerance.y && diff.z <= tolerance.z;

  if (withinTolerance) {
    return {
      match: true,
      type: 'withinTolerance',
      differences: diff,
    };
  }

  // 不一致
  return {
    match: false,
    type: 'mismatch',
    differences: diff,
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
  // 識別子ベース要素（Story/Axis/Joint等、座標を持たない）の比較。
  // この関数はキー一致後の再検証として呼ばれるため、座標データを持たない要素は
  // 幾何比較の対象外とし、キー一致のみで完全一致とみなす。
  if (!dataA.coords && !dataA.startCoords && !dataA.vertexCoordsList) {
    return { match: true, type: 'exact', differences: {} };
  }

  // StbNode（基準点）の比較
  if (dataA.coords && dataB.coords) {
    return compareCoordinatesWithTolerance(dataA.coords, dataB.coords, toleranceConfig.basePoint);
  }

  // 線分要素（始点・終点）の比較
  if (dataA.startCoords && dataA.endCoords && dataB.startCoords && dataB.endCoords) {
    // V2: startOffset / endOffset を加算した最終座標で比較
    const startA = applyOffset(dataA.startCoords, dataA.startOffset);
    const endA = applyOffset(dataA.endCoords, dataA.endOffset);
    const startB = applyOffset(dataB.startCoords, dataB.startOffset);
    const endB = applyOffset(dataB.endCoords, dataB.endOffset);

    const startComparison = compareCoordinatesWithTolerance(
      startA,
      startB,
      toleranceConfig.basePoint,
    );
    const endComparison = compareCoordinatesWithTolerance(endA, endB, toleranceConfig.basePoint);

    // 始点と終点を入れ替えた組み合わせも試す（V1 と同様の線分向き不変性）
    const startSwapComparison = compareCoordinatesWithTolerance(
      startA,
      endB,
      toleranceConfig.basePoint,
    );
    const endSwapComparison = compareCoordinatesWithTolerance(
      endA,
      startB,
      toleranceConfig.basePoint,
    );

    const orderedMatch = startComparison.match && endComparison.match;
    const swappedMatch = startSwapComparison.match && endSwapComparison.match;

    if (orderedMatch || swappedMatch) {
      const chosen = orderedMatch
        ? { s: startComparison, e: endComparison }
        : { s: startSwapComparison, e: endSwapComparison };
      let type =
        chosen.s.type === 'exact' && chosen.e.type === 'exact' ? 'exact' : 'withinTolerance';

      // Mode 3 用: rotate が両方にあり、許容差設定にも rotate があれば追加チェック
      if (
        toleranceConfig.rotate != null &&
        dataA.rotate !== undefined &&
        dataB.rotate !== undefined
      ) {
        const rA = parseFloat(dataA.rotate) || 0;
        const rB = parseFloat(dataB.rotate) || 0;
        const rotateMatch = compareRotateWithTolerance(dataA.rotate, dataB.rotate, toleranceConfig);
        if (!rotateMatch) {
          return {
            match: false,
            type: 'mismatch',
            differences: { start: chosen.s.differences, end: chosen.e.differences, rotate: true },
          };
        }
        if (rA !== rB) type = 'withinTolerance';
      }

      return {
        match: true,
        type,
        differences: { start: chosen.s.differences, end: chosen.e.differences },
      };
    }

    return {
      match: false,
      type: 'mismatch',
      differences: {
        start: startComparison.differences,
        end: endComparison.differences,
      },
    };
  }

  // ポリゴン要素の比較
  if (dataA.vertexCoordsList && dataB.vertexCoordsList) {
    if (dataA.vertexCoordsList.length !== dataB.vertexCoordsList.length) {
      return { match: false, type: 'mismatch', differences: {} };
    }

    // V2: per-vertex offset を加算した最終頂点座標で比較
    // Mode 1 (V1) は perVertexOffsets が undefined なので applyOffset(coords, undefined) で no-op
    const offsetsA = dataA.perVertexOffsets || [];
    const offsetsB = dataB.perVertexOffsets || [];
    const finalA = dataA.vertexCoordsList.map((c, i) => applyOffset(c, offsetsA[i]));
    const finalB = dataB.vertexCoordsList.map((c, i) => applyOffset(c, offsetsB[i]));

    // 順序に頼らず、座標キーで集合比較（多角形は周回順序が違っても等価とみなす）
    // 各頂点を許容差付きでマッチング: B の各頂点が A のどれかに対応するか
    const usedA = new Array(finalA.length).fill(false);
    let allExact = true;
    let allWithinTolerance = true;
    const vertexDifferences = [];

    for (const vB of finalB) {
      let bestIdx = -1;
      let bestResult = null;
      for (let i = 0; i < finalA.length; i++) {
        if (usedA[i]) continue;
        const cmp = compareCoordinatesWithTolerance(finalA[i], vB, toleranceConfig.basePoint);
        if (cmp.match) {
          // 'exact' を優先
          if (cmp.type === 'exact') {
            bestIdx = i;
            bestResult = cmp;
            break;
          }
          if (!bestResult) {
            bestIdx = i;
            bestResult = cmp;
          }
        }
      }
      if (bestIdx < 0) {
        allWithinTolerance = false;
        allExact = false;
        vertexDifferences.push(null);
      } else {
        usedA[bestIdx] = true;
        vertexDifferences.push(bestResult.differences);
        if (bestResult.type !== 'exact') allExact = false;
      }
    }

    if (!allWithinTolerance) {
      return { match: false, type: 'mismatch', differences: { vertices: vertexDifferences } };
    }

    return {
      match: true,
      type: allExact ? 'exact' : 'withinTolerance',
      differences: { vertices: vertexDifferences },
    };
  }

  return { match: false, type: 'mismatch', differences: {} };
}

// ============================================
// 配置要素回転角比較
// ============================================

/**
 * 2つの回転角が許容差内で一致するかチェック（360度ラップ考慮）
 * @param {number|string} rotate1 - 回転角1（度）
 * @param {number|string} rotate2 - 回転角2（度）
 * @param {{rotate?: number}} tolerance - 許容差設定（rotate: 度）
 * @returns {boolean} 許容差内の場合 true
 */
export function compareRotateWithTolerance(rotate1, rotate2, tolerance = {}) {
  const r1 = parseFloat(rotate1) || 0;
  const r2 = parseFloat(rotate2) || 0;
  const tol = tolerance?.rotate || 0;

  // 差分を計算
  let diff = Math.abs(r1 - r2);

  // 360度ラップ: 180度以上の差は逆向きで計算
  if (diff > 180) {
    diff = 360 - diff;
  }

  return diff <= tol;
}

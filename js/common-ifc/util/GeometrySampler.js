/**
 * @fileoverview ビーム軸方向の断面サンプリングユーティリティ
 *
 * web-ifcのGetFlatMeshで取得した三角メッシュを、
 * ビーム軸方向に沿って複数の切断面で切り、各位置での断面高さを計測する。
 *
 * @module GeometrySampler
 */

/**
 * メッシュ頂点データからビーム軸方向のサンプリングを行う
 *
 * @param {Float32Array|number[]} vertexData - 頂点配列 (x,y,z,nx,ny,nz の繰り返し、stride=6)
 * @param {Uint32Array|number[]} indexData - インデックス配列
 * @param {number[]} axisDirection - ビーム軸方向ベクトル [dx, dy, dz] (正規化済み)
 * @param {number[]} origin - ビーム始点 [ox, oy, oz]
 * @param {number} length - ビーム全長 (同一単位)
 * @param {number} [numSamples=20] - サンプリング点数
 * @returns {Array<{t: number, position: number, height: number, width: number}>}
 *   t: 0～1のパラメータ、position: 軸方向の位置、height/width: 断面寸法
 */
export function sampleCrossSections(
  vertexData,
  indexData,
  axisDirection,
  origin,
  length,
  numSamples = 20,
) {
  if (!vertexData || vertexData.length < 18) return [];
  if (length <= 0) return [];

  const [dx, dy, dz] = axisDirection;
  const [ox, oy, oz] = origin;

  // 三角形を頂点座標配列に変換
  const triangles = buildTriangles(vertexData, indexData);
  if (triangles.length === 0) return [];

  // 軸に垂直な2つの基底ベクトルを構築
  const { u, v } = buildOrthoBasis(dx, dy, dz);

  const samples = [];

  for (let i = 0; i < numSamples; i++) {
    // 両端の微小オフセットを避けてサンプリング
    const t = (i + 0.5) / numSamples;
    const planePos = t * length;

    // 切断面: (P - planePoint) · axis = 0
    const planePoint = [ox + dx * planePos, oy + dy * planePos, oz + dz * planePos];

    // 三角形と平面の交差を計算
    const intersections = intersectTrianglesWithPlane(triangles, planePoint, [dx, dy, dz]);

    if (intersections.length === 0) {
      samples.push({ t, position: planePos, height: 0, width: 0 });
      continue;
    }

    // 交点を軸直交座標系(u, v)に射影して断面寸法を計測
    const { height, width } = measureCrossSection(intersections, planePoint, u, v);
    samples.push({ t, position: planePos, height, width });
  }

  return samples;
}

/**
 * 頂点データとインデックスから三角形配列を構築
 * @param {Float32Array|number[]} vertexData - stride=6 (x,y,z,nx,ny,nz)
 * @param {Uint32Array|number[]} indexData
 * @returns {Array<[number[],number[],number[]]>} 三角形の頂点座標配列
 */
function buildTriangles(vertexData, indexData) {
  const triangles = [];

  if (indexData && indexData.length >= 3) {
    for (let i = 0; i < indexData.length; i += 3) {
      const i0 = indexData[i];
      const i1 = indexData[i + 1];
      const i2 = indexData[i + 2];
      triangles.push([
        [vertexData[i0 * 6], vertexData[i0 * 6 + 1], vertexData[i0 * 6 + 2]],
        [vertexData[i1 * 6], vertexData[i1 * 6 + 1], vertexData[i1 * 6 + 2]],
        [vertexData[i2 * 6], vertexData[i2 * 6 + 1], vertexData[i2 * 6 + 2]],
      ]);
    }
  } else {
    // インデックスなしの場合は頂点を3つずつ
    const vertCount = Math.floor(vertexData.length / 6);
    for (let i = 0; i < vertCount - 2; i += 3) {
      triangles.push([
        [vertexData[i * 6], vertexData[i * 6 + 1], vertexData[i * 6 + 2]],
        [vertexData[(i + 1) * 6], vertexData[(i + 1) * 6 + 1], vertexData[(i + 1) * 6 + 2]],
        [vertexData[(i + 2) * 6], vertexData[(i + 2) * 6 + 1], vertexData[(i + 2) * 6 + 2]],
      ]);
    }
  }

  return triangles;
}

/**
 * 軸方向ベクトルに直交する2つの基底ベクトルを計算
 * @param {number} dx
 * @param {number} dy
 * @param {number} dz
 * @returns {{u: number[], v: number[]}}
 */
function buildOrthoBasis(dx, dy, dz) {
  // 軸方向と最も直交する標準基底を選択してクロス積
  let refX = 0,
    refY = 1,
    refZ = 0;
  if (Math.abs(dy) > 0.9) {
    refX = 0;
    refY = 0;
    refZ = 1;
  }

  // u = axis × ref
  const ux = dy * refZ - dz * refY;
  const uy = dz * refX - dx * refZ;
  const uz = dx * refY - dy * refX;
  const uLen = Math.sqrt(ux * ux + uy * uy + uz * uz);
  const u = [ux / uLen, uy / uLen, uz / uLen];

  // v = axis × u
  const vx = dy * u[2] - dz * u[1];
  const vy = dz * u[0] - dx * u[2];
  const vz = dx * u[1] - dy * u[0];
  const v = [vx, vy, vz];

  return { u, v };
}

/**
 * 三角形群と平面の交差線分を計算
 * @param {Array<[number[],number[],number[]]>} triangles
 * @param {number[]} planePoint - 平面上の点 [x,y,z]
 * @param {number[]} planeNormal - 平面法線（軸方向）[nx,ny,nz]
 * @returns {Array<number[]>} 交差点座標のフラット配列
 */
function intersectTrianglesWithPlane(triangles, planePoint, planeNormal) {
  const [nx, ny, nz] = planeNormal;
  const [px, py, pz] = planePoint;
  const d = nx * px + ny * py + nz * pz;

  const points = [];

  for (const tri of triangles) {
    // 各頂点の符号付き距離
    const dists = tri.map((v) => nx * v[0] + ny * v[1] + nz * v[2] - d);

    // 平面と交差するエッジを検出（符号が変わるエッジ）
    const edges = [
      [0, 1],
      [1, 2],
      [2, 0],
    ];

    for (const [a, b] of edges) {
      const da = dists[a];
      const db = dists[b];

      // 片方が平面上ならその点を追加
      if (Math.abs(da) < 1e-10) {
        points.push([...tri[a]]);
        continue;
      }
      if (Math.abs(db) < 1e-10) {
        continue; // 次のエッジで拾う
      }

      // 符号が異なる場合→交差
      if (da * db < 0) {
        const t = da / (da - db);
        points.push([
          tri[a][0] + t * (tri[b][0] - tri[a][0]),
          tri[a][1] + t * (tri[b][1] - tri[a][1]),
          tri[a][2] + t * (tri[b][2] - tri[a][2]),
        ]);
      }
    }
  }

  return points;
}

/**
 * 交差点群から断面の高さ・幅を計測
 * @param {Array<number[]>} points - 交差点 [x,y,z] の配列
 * @param {number[]} planePoint - 平面上の基準点
 * @param {number[]} u - 断面のU軸方向ベクトル
 * @param {number[]} v - 断面のV軸方向ベクトル
 * @returns {{height: number, width: number}}
 */
function measureCrossSection(points, planePoint, u, v) {
  if (points.length === 0) return { height: 0, width: 0 };

  let minU = Infinity,
    maxU = -Infinity;
  let minV = Infinity,
    maxV = -Infinity;

  for (const pt of points) {
    // planePoint からの相対位置を u, v 座標に射影
    const rx = pt[0] - planePoint[0];
    const ry = pt[1] - planePoint[1];
    const rz = pt[2] - planePoint[2];

    const projU = rx * u[0] + ry * u[1] + rz * u[2];
    const projV = rx * v[0] + ry * v[1] + rz * v[2];

    minU = Math.min(minU, projU);
    maxU = Math.max(maxU, projU);
    minV = Math.min(minV, projV);
    maxV = Math.max(maxV, projV);
  }

  return {
    height: Math.round((maxV - minV) * 100) / 100,
    width: Math.round((maxU - minU) * 100) / 100,
  };
}

// テスト用にエクスポート
export { buildTriangles, buildOrthoBasis, intersectTrianglesWithPlane, measureCrossSection };

/**
 * @fileoverview ジオメトリ中心・方向近似比較用の純粋関数群
 */

const EPSILON = 1e-9;

function applyOffset(coords, offset) {
  if (!coords) return null;
  return {
    x: coords.x + (offset?.x || 0),
    y: coords.y + (offset?.y || 0),
    z: coords.z + (offset?.z || 0),
  };
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function length(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function normalize(v) {
  const len = length(v);
  if (len <= EPSILON) return null;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

function getToleranceVector(config) {
  return config?.geometryCenter || config?.basePoint || { x: 0, y: 0, z: 0 };
}

function compareCenters(centerA, centerB, tolerance) {
  const differences = {
    x: Math.abs(centerA.x - centerB.x),
    y: Math.abs(centerA.y - centerB.y),
    z: Math.abs(centerA.z - centerB.z),
  };
  const match =
    differences.x <= tolerance.x && differences.y <= tolerance.y && differences.z <= tolerance.z;
  const exact = differences.x === 0 && differences.y === 0 && differences.z === 0;
  const distance = length(differences);
  return { match, exact, differences, distance };
}

/**
 * 方向ベクトル同士の角度差を計算する。
 * @param {{x:number,y:number,z:number}} directionA
 * @param {{x:number,y:number,z:number}} directionB
 * @param {boolean} [oppositeEquivalent=true] 逆方向を同一扱いするか
 * @returns {number} 角度差（度）
 */
export function calculateDirectionAngle(directionA, directionB, oppositeEquivalent = true) {
  const normalizedA = normalize(directionA);
  const normalizedB = normalize(directionB);
  if (!normalizedA || !normalizedB) return Number.POSITIVE_INFINITY;

  let cosine = dot(normalizedA, normalizedB);
  if (oppositeEquivalent) {
    cosine = Math.abs(cosine);
  }
  return toDegrees(Math.acos(clamp(cosine, -1, 1)));
}

/**
 * 線材の中心・軸方向・長さを計算する。
 * 1ノード形式要素（level属性を持たない Footing / FoundationColumn 等）は
 * 始終点が同一座標の長さ0線分になるため、方向を持たない「点」署名として扱う。
 * @param {Object} data 比較用要素データ
 * @returns {{kind:string, center:Object, direction:Object|null, length:number}|null}
 */
export function createLineGeometrySignature(data) {
  if (!data?.startCoords || !data?.endCoords) return null;

  const start = applyOffset(data.startCoords, data.startOffset);
  const end = applyOffset(data.endCoords, data.endOffset);
  if (!start || !end) return null;

  const axis = subtract(end, start);
  const lineLength = length(axis);
  const direction = normalize(axis);
  if (!direction) {
    return {
      kind: 'point',
      center: start,
      direction: null,
      length: 0,
    };
  }

  return {
    kind: 'line',
    center: {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
      z: (start.z + end.z) / 2,
    },
    direction,
    length: lineLength,
  };
}

function getFinalPolygonCoords(data) {
  if (!Array.isArray(data?.vertexCoordsList) || data.vertexCoordsList.length < 3) {
    return null;
  }
  const offsets = data.perVertexOffsets || [];
  return data.vertexCoordsList.map((coords, index) => applyOffset(coords, offsets[index]));
}

function calculateAverageCenter(coordsList) {
  const total = coordsList.reduce(
    (acc, coords) => ({
      x: acc.x + coords.x,
      y: acc.y + coords.y,
      z: acc.z + coords.z,
    }),
    { x: 0, y: 0, z: 0 },
  );
  return {
    x: total.x / coordsList.length,
    y: total.y / coordsList.length,
    z: total.z / coordsList.length,
  };
}

function calculateNewellNormalAndArea(coordsList) {
  let nx = 0;
  let ny = 0;
  let nz = 0;

  for (let i = 0; i < coordsList.length; i++) {
    const current = coordsList[i];
    const next = coordsList[(i + 1) % coordsList.length];
    nx += (current.y - next.y) * (current.z + next.z);
    ny += (current.z - next.z) * (current.x + next.x);
    nz += (current.x - next.x) * (current.y + next.y);
  }

  const normalVector = { x: nx, y: ny, z: nz };
  const normalLength = length(normalVector);
  if (normalLength <= EPSILON) {
    return null;
  }

  return {
    normal: normalize(normalVector),
    area: normalLength / 2,
  };
}

/**
 * 面材の中心・法線・面積を計算する。
 * @param {Object} data 比較用要素データ
 * @returns {{kind:string, center:Object, direction:Object, area:number}|null}
 */
export function createPolygonGeometrySignature(data) {
  const coordsList = getFinalPolygonCoords(data);
  if (!coordsList || coordsList.some((coords) => !coords)) return null;

  const normalAndArea = calculateNewellNormalAndArea(coordsList);
  if (!normalAndArea) return null;

  return {
    kind: 'polygon',
    center: calculateAverageCenter(coordsList),
    direction: normalAndArea.normal,
    area: normalAndArea.area,
  };
}

/**
 * 要素データから線材または面材のジオメトリ署名を生成する。
 * @param {Object} data 比較用要素データ
 * @returns {Object|null}
 */
export function createGeometrySignature(data) {
  return createLineGeometrySignature(data) || createPolygonGeometrySignature(data);
}

/**
 * 中心・方向近似で要素データを比較する。
 * @param {Object} dataA
 * @param {Object} dataB
 * @param {Object} toleranceConfig
 * @returns {{match:boolean,type:string,differences:Object,score:number}}
 */
export function compareGeometryCenterDirection(dataA, dataB, toleranceConfig = {}) {
  const signatureA = createGeometrySignature(dataA);
  const signatureB = createGeometrySignature(dataB);
  if (!signatureA || !signatureB || signatureA.kind !== signatureB.kind) {
    return { match: false, type: 'mismatch', differences: {}, score: Number.POSITIVE_INFINITY };
  }

  const centerComparison = compareCenters(
    signatureA.center,
    signatureB.center,
    getToleranceVector(toleranceConfig),
  );

  // 点署名は方向・長さ/面積を持たないため中心位置のみで判定する
  if (signatureA.kind === 'point') {
    return {
      match: centerComparison.match,
      type: centerComparison.match
        ? centerComparison.exact
          ? 'exact'
          : 'withinTolerance'
        : 'mismatch',
      differences: { center: centerComparison.differences },
      score: centerComparison.distance,
    };
  }

  const oppositeEquivalent = toleranceConfig.directionOppositeEquivalent !== false;
  const directionAngle = calculateDirectionAngle(
    signatureA.direction,
    signatureB.direction,
    oppositeEquivalent,
  );
  const directionTolerance = toleranceConfig.directionAngle ?? 0;
  const directionMatch = directionAngle <= directionTolerance;

  const differences = {
    center: centerComparison.differences,
    directionAngle,
  };

  let secondaryMatch = true;
  let secondaryExact = true;
  let secondaryScore = 0;

  if (signatureA.kind === 'line') {
    const lengthDiff = Math.abs(signatureA.length - signatureB.length);
    differences.length = lengthDiff;
    secondaryMatch = lengthDiff <= (toleranceConfig.geometryLength ?? 0);
    secondaryExact = lengthDiff === 0;
    secondaryScore = lengthDiff;
  } else {
    const areaDiff = Math.abs(signatureA.area - signatureB.area);
    differences.area = areaDiff;
    secondaryMatch = areaDiff <= (toleranceConfig.geometryArea ?? 0);
    secondaryExact = areaDiff === 0;
    secondaryScore = areaDiff;
  }

  const match = centerComparison.match && directionMatch && secondaryMatch;
  const exact = centerComparison.exact && directionAngle === 0 && secondaryExact;

  return {
    match,
    type: match && exact ? 'exact' : match ? 'withinTolerance' : 'mismatch',
    differences,
    score: centerComparison.distance + directionAngle + secondaryScore,
  };
}

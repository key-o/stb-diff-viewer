/**
 * @fileoverview ジオメトリ計算レイヤー（Pure JavaScript、Three.js非依存）
 *
 * 要素の配置・回転を計算する純粋な数値計算関数群。
 * Three.jsに依存せず、単体テスト可能。
 *
 * 基本ベクトル演算（normalizeVector, crossProduct, dotProduct）と
 * calculateBeamBasis は data/geometry/vectorMath.js に定義され、
 * ここから re-export される。
 *
 * @module GeometryCalculator
 */

import {
  normalizeVector,
  crossProduct,
  dotProduct,
  calculateBeamBasis,
  rotateVectorAroundAxis,
} from '../../../data/geometry/vectorMath.js';

// vectorMath からの re-export（後方互換性維持）
export { normalizeVector, crossProduct, dotProduct, calculateBeamBasis, rotateVectorAroundAxis };

/**
 * Vector3型定義（Plain Object）
 * @typedef {Object} Vector3
 * @property {number} x - X座標
 * @property {number} y - Y座標
 * @property {number} z - Z座標
 */

/**
 * Quaternion型定義（Plain Object）
 * @typedef {Object} Quaternion
 * @property {number} x - X成分
 * @property {number} y - Y成分
 * @property {number} z - Z成分
 * @property {number} w - W成分
 */

/**
 * PlacementResult型定義
 * @typedef {Object} PlacementResult
 * @property {Vector3} center - 中心座標
 * @property {number} length - 要素の長さ
 * @property {Vector3} direction - 正規化された方向ベクトル
 * @property {Quaternion} rotation - 回転（四元数）
 */

/**
 * 2点間の距離を計算
 * @param {Vector3} point1 - 点1
 * @param {Vector3} point2 - 点2
 * @returns {number} 距離
 */
export function calculateDistance(point1, point2) {
  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;
  const dz = point2.z - point1.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * ベクトルの減算
 * @param {Vector3} vector1 - ベクトル1
 * @param {Vector3} vector2 - ベクトル2
 * @returns {Vector3} vector1 - vector2
 */
export function subtractVectors(vector1, vector2) {
  return {
    x: vector1.x - vector2.x,
    y: vector1.y - vector2.y,
    z: vector1.z - vector2.z,
  };
}

/**
 * ベクトルの加算
 * @param {Vector3} vector1 - ベクトル1
 * @param {Vector3} vector2 - ベクトル2
 * @returns {Vector3} vector1 + vector2
 */
export function addVectors(vector1, vector2) {
  return {
    x: vector1.x + vector2.x,
    y: vector1.y + vector2.y,
    z: vector1.z + vector2.z,
  };
}

/**
 * ベクトルのスカラー倍
 * @param {Vector3} vector - ベクトル
 * @param {number} scalar - スカラー値
 * @returns {Vector3} vector * scalar
 */
export function multiplyVector(vector, scalar) {
  return {
    x: vector.x * scalar,
    y: vector.y * scalar,
    z: vector.z * scalar,
  };
}

/**
 * 2点の中点を計算
 * @param {Vector3} point1 - 点1
 * @param {Vector3} point2 - 点2
 * @returns {Vector3} 中点
 */
export function calculateMidpoint(point1, point2) {
  return {
    x: (point1.x + point2.x) / 2,
    y: (point1.y + point2.y) / 2,
    z: (point1.z + point2.z) / 2,
  };
}

/**
 * 2点間の線形補間
 * @param {Vector3} point1 - 点1
 * @param {Vector3} point2 - 点2
 * @param {number} t - 補間パラメータ (0.0 ~ 1.0)
 * @returns {Vector3} 補間された点
 */
export function lerpVectors(point1, point2, t) {
  return {
    x: point1.x + (point2.x - point1.x) * t,
    y: point1.y + (point2.y - point1.y) * t,
    z: point1.z + (point2.z - point1.z) * t,
  };
}

// crossProduct, dotProduct は vectorMath からの re-export（上記）

/**
 * ベクトルの長さを計算
 * @param {Vector3} vector - ベクトル
 * @returns {number} 長さ
 */
export function vectorLength(vector) {
  return Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
}

/**
 * 2つの単位ベクトル間の回転を四元数で計算
 * @param {Vector3} from - 開始単位ベクトル
 * @param {Vector3} to - 目標単位ベクトル
 * @returns {Quaternion} 回転四元数
 */
export function calculateQuaternionFromVectors(from, to) {
  const dot = from.x * to.x + from.y * to.y + from.z * to.z;

  if (dot > 0.999999) {
    return { x: 0, y: 0, z: 0, w: 1 };
  }

  if (dot < -0.999999) {
    let axis = crossProduct({ x: 1, y: 0, z: 0 }, from);
    const axisLength = vectorLength(axis);

    if (axisLength < 0.000001) {
      axis = crossProduct({ x: 0, y: 1, z: 0 }, from);
    }

    axis = normalizeVector(axis);
    return { x: axis.x, y: axis.y, z: axis.z, w: 0 };
  }

  const axis = crossProduct(from, to);
  const w = 1 + dot;

  const qLength = Math.sqrt(axis.x * axis.x + axis.y * axis.y + axis.z * axis.z + w * w);

  return {
    x: axis.x / qLength,
    y: axis.y / qLength,
    z: axis.z / qLength,
    w: w / qLength,
  };
}

/**
 * 軸周りの回転四元数を計算
 * @param {Vector3} axis - 回転軸（正規化された単位ベクトル）
 * @param {number} angle - 回転角度（ラジアン）
 * @returns {Quaternion} 回転四元数
 */
export function calculateQuaternionFromAxisAngle(axis, angle) {
  const halfAngle = angle / 2;
  const s = Math.sin(halfAngle);

  return {
    x: axis.x * s,
    y: axis.y * s,
    z: axis.z * s,
    w: Math.cos(halfAngle),
  };
}

/**
 * 四元数の合成（乗算）
 * @param {Quaternion} q1 - 四元数1
 * @param {Quaternion} q2 - 四元数2
 * @returns {Quaternion} q1 * q2
 */
export function multiplyQuaternions(q1, q2) {
  return {
    x: q1.w * q2.x + q1.x * q2.w + q1.y * q2.z - q1.z * q2.y,
    y: q1.w * q2.y + q1.y * q2.w + q1.z * q2.x - q1.x * q2.z,
    z: q1.w * q2.z + q1.z * q2.w + q1.x * q2.y - q1.y * q2.x,
    w: q1.w * q2.w - q1.x * q2.x - q1.y * q2.y - q1.z * q2.z,
  };
}

/**
 * オフセットを適用した節点座標を計算
 * @param {Vector3} node - 元の節点座標
 * @param {Object} offset - オフセット {x, y, z}
 * @returns {Vector3} オフセット適用後の節点座標
 */
export function applyOffset(node, offset = { x: 0, y: 0, z: 0 }) {
  return {
    x: node.x + (offset.x || 0),
    y: node.y + (offset.y || 0),
    z: node.z + (offset.z || 0),
  };
}

/**
 * 要素の配置情報を計算（中心、長さ、方向、回転）
 * @param {Vector3} startNode - 始点ノード
 * @param {Vector3} endNode - 終点ノード
 * @param {Object} options - オプション
 * @returns {PlacementResult} 配置情報
 */
export function calculatePlacement(
  startNode,
  endNode,
  { startOffset = { x: 0, y: 0, z: 0 }, endOffset = { x: 0, y: 0, z: 0 }, rollAngle = 0 } = {},
) {
  const adjustedStart = applyOffset(startNode, startOffset);
  const adjustedEnd = applyOffset(endNode, endOffset);

  const center = calculateMidpoint(adjustedStart, adjustedEnd);
  const length = calculateDistance(adjustedStart, adjustedEnd);

  const directionVector = subtractVectors(adjustedEnd, adjustedStart);
  const direction = normalizeVector(directionVector);

  const zAxis = { x: 0, y: 0, z: 1 };
  let rotation = calculateQuaternionFromVectors(zAxis, direction);

  if (rollAngle !== 0) {
    const rollQuaternion = calculateQuaternionFromAxisAngle(direction, rollAngle);
    rotation = multiplyQuaternions(rotation, rollQuaternion);
  }

  return {
    center,
    length,
    direction,
    rotation,
  };
}

/**
 * 柱要素の配置情報を計算（bottom/topオフセット対応）
 * @param {Vector3} bottomNode - 下端ノード
 * @param {Vector3} topNode - 上端ノード
 * @param {Object} options - オプション
 * @returns {PlacementResult} 配置情報
 */
export function calculateColumnPlacement(
  bottomNode,
  topNode,
  { bottomOffset = { x: 0, y: 0 }, topOffset = { x: 0, y: 0 }, rollAngle = 0 } = {},
) {
  const adjustedBottom = {
    x: bottomNode.x + (bottomOffset.x || 0),
    y: bottomNode.y + (bottomOffset.y || 0),
    z: bottomNode.z,
  };

  const adjustedTop = {
    x: topNode.x + (topOffset.x || 0),
    y: topNode.y + (topOffset.y || 0),
    z: topNode.z,
  };

  const center = calculateMidpoint(adjustedBottom, adjustedTop);
  const length = calculateDistance(adjustedBottom, adjustedTop);

  const directionVector = subtractVectors(adjustedTop, adjustedBottom);
  const direction = normalizeVector(directionVector);

  const zAxis = { x: 0, y: 0, z: 1 };
  let rotation = calculateQuaternionFromVectors(zAxis, direction);

  if (rollAngle !== 0) {
    const rollQuaternion = calculateQuaternionFromAxisAngle(direction, rollAngle);
    rotation = multiplyQuaternions(rotation, rollQuaternion);
  }

  return {
    center,
    length,
    direction,
    rotation,
    adjustedBottom,
    adjustedTop,
  };
}

// calculateBeamBasis は vectorMath からの re-export（上記）

/**
 * 基底ベクトルから回転四元数を計算
 * @param {Vector3} xAxis - X軸ベクトル
 * @param {Vector3} yAxis - Y軸ベクトル
 * @param {Vector3} zAxis - Z軸ベクトル
 * @returns {Quaternion} 回転四元数
 */
export function calculateQuaternionFromBasis(xAxis, yAxis, zAxis) {
  const m00 = xAxis.x,
    m01 = yAxis.x,
    m02 = zAxis.x;
  const m10 = xAxis.y,
    m11 = yAxis.y,
    m12 = zAxis.y;
  const m20 = xAxis.z,
    m21 = yAxis.z,
    m22 = zAxis.z;

  const trace = m00 + m11 + m22;
  let x, y, z, w;

  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    w = 0.25 / s;
    x = (m21 - m12) * s;
    y = (m02 - m20) * s;
    z = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m00 - m11 - m22);
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m11 - m00 - m22);
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = 2.0 * Math.sqrt(1.0 + m22 - m00 - m11);
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }

  return { x, y, z, w };
}

/**
 * 梁要素の配置情報を計算（天端基準対応）
 * @param {Vector3} startNode - 始点ノード
 * @param {Vector3} endNode - 終点ノード
 * @param {Object} options - オプション
 * @returns {PlacementResult} 配置情報
 */
export function calculateBeamPlacement(
  startNode,
  endNode,
  {
    startOffset = { x: 0, y: 0, z: 0 },
    endOffset = { x: 0, y: 0, z: 0 },
    rollAngle = 0,
    placementMode = 'center',
    sectionHeight = 0,
  } = {},
) {
  let adjustedStart = applyOffset(startNode, startOffset);
  let adjustedEnd = applyOffset(endNode, endOffset);

  const directionVector = subtractVectors(adjustedEnd, adjustedStart);
  const direction = normalizeVector(directionVector);
  const basis = calculateBeamBasis(direction);

  // top-alignedモードの場合、天端から断面高さの半分だけ下にシフト
  // このシフトは回転前のY軸方向に適用（配置位置は回転の影響を受けない）
  if (placementMode === 'top-aligned' && sectionHeight > 0 && isFinite(sectionHeight)) {
    const shift = multiplyVector(basis.yAxis, -sectionHeight / 2);
    adjustedStart = addVectors(adjustedStart, shift);
    adjustedEnd = addVectors(adjustedEnd, shift);
  }

  const center = calculateMidpoint(adjustedStart, adjustedEnd);
  const length = calculateDistance(adjustedStart, adjustedEnd);

  // 梁軸回りの回転を計算（断面の向きを変える）
  const rotation = calculateQuaternionFromBasis(basis.xAxis, basis.yAxis, basis.zAxis);

  // rollAngleは材軸（Z軸）回りの断面回転
  // この回転はジオメトリレベルで適用する必要があるため、ここでは保存のみ

  return {
    center,
    length,
    direction,
    rotation,
    adjustedStart,
    adjustedEnd,
    basis,
    placementMode,
    sectionHeight,
    rollAngle, // 材軸回りの断面回転角度（ラジアン）
  };
}

/**
 * 断面タイプから寸法情報を推定
 * @param {Object} dimensions - 寸法オブジェクト
 * @returns {string} 推定された断面タイプ
 */
export function inferSectionTypeFromDimensions(dimensions) {
  if (!dimensions) {
    return 'RECTANGLE';
  }

  const hasDiameter =
    dimensions.outer_diameter ||
    dimensions.diameter ||
    dimensions.D ||
    dimensions.d ||
    dimensions.D_axial;
  if (hasDiameter) {
    if (dimensions.wall_thickness || dimensions.t || dimensions.thickness) {
      return 'PIPE';
    }
    return 'CIRCLE';
  }

  if (dimensions.outer_height && dimensions.outer_width && dimensions.wall_thickness) {
    return 'BOX';
  }

  if (
    dimensions.width &&
    dimensions.height &&
    (dimensions.thickness || dimensions.wall_thickness)
  ) {
    return 'BOX';
  }

  if (
    dimensions.overall_depth &&
    dimensions.overall_width &&
    dimensions.web_thickness &&
    dimensions.flange_thickness
  ) {
    return 'H';
  }

  if (
    dimensions.overall_depth &&
    dimensions.flange_width &&
    dimensions.web_thickness &&
    dimensions.flange_thickness
  ) {
    return 'C';
  }

  if (
    dimensions.depth &&
    dimensions.width &&
    dimensions.thickness &&
    !dimensions.overall_depth &&
    !dimensions.web_thickness
  ) {
    return 'L';
  }

  if (dimensions.radius && !dimensions.thickness && !dimensions.wall_thickness) {
    return 'CIRCLE';
  }

  if (
    dimensions.width &&
    dimensions.height &&
    !dimensions.thickness &&
    !dimensions.wall_thickness &&
    !dimensions.web_thickness &&
    !dimensions.flange_thickness
  ) {
    return 'RECTANGLE';
  }

  return 'RECTANGLE';
}

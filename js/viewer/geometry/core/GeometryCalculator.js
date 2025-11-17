/**
 * @fileoverview ジオメトリ計算レイヤー（Pure JavaScript、Three.js非依存）
 *
 * 要素の配置・回転を計算する純粋な数値計算関数群。
 * Three.jsに依存せず、単体テスト可能。
 *
 * @module GeometryCalculator
 */

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
 *
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
 * ベクトルを正規化
 *
 * @param {Vector3} vector - ベクトル
 * @returns {Vector3} 正規化されたベクトル
 */
export function normalizeVector(vector) {
  const length = Math.sqrt(
    vector.x * vector.x + vector.y * vector.y + vector.z * vector.z
  );

  if (length === 0) {
    return { x: 0, y: 0, z: 0 };
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

/**
 * ベクトルの減算
 *
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
 *
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
 *
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
 *
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
 *
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

/**
 * 2つの単位ベクトル間の回転を四元数で計算
 *
 * @param {Vector3} from - 開始単位ベクトル
 * @param {Vector3} to - 目標単位ベクトル
 * @returns {Quaternion} 回転四元数
 */
export function calculateQuaternionFromVectors(from, to) {
  // 内積を計算
  const dot = from.x * to.x + from.y * to.y + from.z * to.z;

  // ベクトルがほぼ同じ方向の場合
  if (dot > 0.999999) {
    return { x: 0, y: 0, z: 0, w: 1 };
  }

  // ベクトルがほぼ逆方向の場合
  if (dot < -0.999999) {
    // 垂直な軸を見つける
    let axis = crossProduct({ x: 1, y: 0, z: 0 }, from);
    const axisLength = vectorLength(axis);

    if (axisLength < 0.000001) {
      axis = crossProduct({ x: 0, y: 1, z: 0 }, from);
    }

    axis = normalizeVector(axis);
    return { x: axis.x, y: axis.y, z: axis.z, w: 0 };
  }

  // 通常の場合: 外積と内積から四元数を計算
  const axis = crossProduct(from, to);
  const w = 1 + dot;

  // 四元数を正規化
  const qLength = Math.sqrt(
    axis.x * axis.x + axis.y * axis.y + axis.z * axis.z + w * w
  );

  return {
    x: axis.x / qLength,
    y: axis.y / qLength,
    z: axis.z / qLength,
    w: w / qLength,
  };
}

/**
 * ベクトルの外積を計算
 *
 * @param {Vector3} vector1 - ベクトル1
 * @param {Vector3} vector2 - ベクトル2
 * @returns {Vector3} vector1 × vector2
 */
export function crossProduct(vector1, vector2) {
  return {
    x: vector1.y * vector2.z - vector1.z * vector2.y,
    y: vector1.z * vector2.x - vector1.x * vector2.z,
    z: vector1.x * vector2.y - vector1.y * vector2.x,
  };
}

/**
 * ベクトルの長さを計算
 *
 * @param {Vector3} vector - ベクトル
 * @returns {number} 長さ
 */
export function vectorLength(vector) {
  return Math.sqrt(
    vector.x * vector.x + vector.y * vector.y + vector.z * vector.z
  );
}

/**
 * 軸周りの回転四元数を計算
 *
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
 *
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
 *
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
 *
 * @param {Vector3} startNode - 始点ノード
 * @param {Vector3} endNode - 終点ノード
 * @param {Object} options - オプション
 * @param {Object} options.startOffset - 始点オフセット {x, y, z}
 * @param {Object} options.endOffset - 終点オフセット {x, y, z}
 * @param {number} options.rollAngle - ロール角度（ラジアン、オプション）
 * @returns {PlacementResult} 配置情報
 */
export function calculatePlacement(
  startNode,
  endNode,
  { startOffset = { x: 0, y: 0, z: 0 }, endOffset = { x: 0, y: 0, z: 0 }, rollAngle = 0 } = {}
) {
  // オフセットを適用
  const adjustedStart = applyOffset(startNode, startOffset);
  const adjustedEnd = applyOffset(endNode, endOffset);

  // 中心点を計算
  const center = calculateMidpoint(adjustedStart, adjustedEnd);

  // 長さを計算
  const length = calculateDistance(adjustedStart, adjustedEnd);

  // 方向ベクトルを計算（正規化）
  const directionVector = subtractVectors(adjustedEnd, adjustedStart);
  const direction = normalizeVector(directionVector);

  // Z軸（0, 0, 1）からdirectionへの回転を計算
  const zAxis = { x: 0, y: 0, z: 1 };
  let rotation = calculateQuaternionFromVectors(zAxis, direction);

  // ロール角度が指定されている場合は追加回転を適用
  if (rollAngle !== 0) {
    const rollQuaternion = calculateQuaternionFromAxisAngle(
      direction,
      rollAngle
    );
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
 *
 * @param {Vector3} bottomNode - 下端ノード
 * @param {Vector3} topNode - 上端ノード
 * @param {Object} options - オプション
 * @param {Object} options.bottomOffset - 下端オフセット {x, y}
 * @param {Object} options.topOffset - 上端オフセット {x, y}
 * @param {number} options.rollAngle - ロール角度（ラジアン、オプション）
 * @returns {PlacementResult} 配置情報
 */
export function calculateColumnPlacement(
  bottomNode,
  topNode,
  { bottomOffset = { x: 0, y: 0 }, topOffset = { x: 0, y: 0 }, rollAngle = 0 } = {}
) {
  // X/Yオフセットをグローバル座標で適用
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

  // 中心点を計算
  const center = calculateMidpoint(adjustedBottom, adjustedTop);

  // 長さを計算
  const length = calculateDistance(adjustedBottom, adjustedTop);

  // 方向ベクトルを計算（正規化）
  const directionVector = subtractVectors(adjustedTop, adjustedBottom);
  const direction = normalizeVector(directionVector);

  // Z軸（0, 0, 1）からdirectionへの回転を計算
  const zAxis = { x: 0, y: 0, z: 1 };
  let rotation = calculateQuaternionFromVectors(zAxis, direction);

  // ロール角度が指定されている場合は追加回転を適用
  if (rollAngle !== 0) {
    const rollQuaternion = calculateQuaternionFromAxisAngle(
      direction,
      rollAngle
    );
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

/**
 * 断面タイプから寸法情報を推定
 *
 * @param {Object} dimensions - 寸法オブジェクト
 * @returns {string} 推定された断面タイプ
 */
export function inferSectionTypeFromDimensions(dimensions) {
  if (!dimensions) {
    return "RECTANGLE";
  }

  // 円形鋼管: outer_diameter または diameter が存在
  if (dimensions.outer_diameter || dimensions.diameter) {
    return "PIPE";
  }

  // 角形鋼管: outer_height + outer_width + wall_thickness
  if (
    dimensions.outer_height &&
    dimensions.outer_width &&
    dimensions.wall_thickness
  ) {
    return "BOX";
  }

  // BOX形: width + height + thickness
  if (
    dimensions.width &&
    dimensions.height &&
    (dimensions.thickness || dimensions.wall_thickness)
  ) {
    return "BOX";
  }

  // H形鋼: overall_depth + overall_width + web_thickness + flange_thickness
  if (
    dimensions.overall_depth &&
    dimensions.overall_width &&
    dimensions.web_thickness &&
    dimensions.flange_thickness
  ) {
    return "H";
  }

  // チャンネル材: overall_depth + flange_width + web_thickness + flange_thickness
  if (
    dimensions.overall_depth &&
    dimensions.flange_width &&
    dimensions.web_thickness &&
    dimensions.flange_thickness
  ) {
    return "C";
  }

  // L形鋼: depth + width + thickness
  if (
    dimensions.depth &&
    dimensions.width &&
    dimensions.thickness &&
    !dimensions.overall_depth &&
    !dimensions.web_thickness
  ) {
    return "L";
  }

  // 円形断面: radius のみ
  if (
    dimensions.radius &&
    !dimensions.thickness &&
    !dimensions.wall_thickness
  ) {
    return "CIRCLE";
  }

  // RC柱: width + height (肉厚情報なし)
  if (
    dimensions.width &&
    dimensions.height &&
    !dimensions.thickness &&
    !dimensions.wall_thickness &&
    !dimensions.web_thickness &&
    !dimensions.flange_thickness
  ) {
    return "RECTANGLE";
  }

  // デフォルト: 矩形断面
  return "RECTANGLE";
}

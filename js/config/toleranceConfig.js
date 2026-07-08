/**
 * @fileoverview 許容差設定管理モジュール
 *
 * このファイルは、要素比較時の許容差設定を管理します：
 * - 基準点(StbNode)座標の許容差（位置情報系キータイプ全般に適用。オフセット・回転角を
 *   加味した最終座標もこの許容差で判定される）
 * - 回転角の許容差（度単位。「節点位置 + オフセット + 回転」キータイプで使用）
 * - ジオメトリ中心・方向の許容差（「ジオメトリ中心・方向」キータイプで使用）
 * - 許容差機能の有効/無効切り替え
 * - 厳密モード（完全一致のみ）の設定
 */

/**
 * 許容差設定のデフォルト値
 * @type {Object}
 */
export const DEFAULT_TOLERANCE_CONFIG = {
  // 基準点(StbNode)座標の許容差 (mm)
  // 位置情報系キータイプ（節点位置のみ/+オフセット/+オフセット+回転）すべてで、
  // オフセット加算後の最終座標に対して使用される
  basePoint: {
    x: 10.0,
    y: 10.0,
    z: 10.0,
  },

  // 回転角の許容差 (度)
  // 「節点位置 + オフセット + 回転」キータイプでのみ使用
  rotate: 0.5,

  // ジオメトリ中心の許容差 (mm)
  // 「ジオメトリ中心・方向」キータイプでのみ使用
  geometryCenter: {
    x: 10.0,
    y: 10.0,
    z: 10.0,
  },

  // ジオメトリ方向角の許容差 (度)
  // 「ジオメトリ中心・方向」キータイプでのみ使用
  directionAngle: 1.0,

  // 線材の長さ差の許容差 (mm)
  geometryLength: 10.0,

  // 面材の面積差の許容差 (mm^2)
  geometryArea: 100.0,

  // 逆方向の軸・法線を同一方向として扱う
  directionOppositeEquivalent: true,

  // 属性値の数値比較しきい値（rotate, offset_X 等の数値属性に適用）
  attributeNumericTolerance: 0.001,

  // 許容差機能の有効/無効
  enabled: true,

  // 厳密モード（許容差を使用しない）
  strictMode: false,
};

/**
 * 現在の許容差設定を保持
 * @type {Object}
 */
let currentToleranceConfig = {
  ...DEFAULT_TOLERANCE_CONFIG,
  basePoint: { ...DEFAULT_TOLERANCE_CONFIG.basePoint },
  geometryCenter: { ...DEFAULT_TOLERANCE_CONFIG.geometryCenter },
};

/**
 * 許容差設定を取得
 * @returns {Object} 現在の許容差設定のコピー
 */
export function getToleranceConfig() {
  return {
    ...currentToleranceConfig,
    basePoint: { ...currentToleranceConfig.basePoint },
    geometryCenter: { ...currentToleranceConfig.geometryCenter },
  };
}

/**
 * 許容差設定を更新
 * @param {Object} config - 新しい設定（部分的な更新も可能）
 */
export function setToleranceConfig(config) {
  if (config.basePoint) {
    currentToleranceConfig.basePoint = {
      ...currentToleranceConfig.basePoint,
      ...config.basePoint,
    };
  }

  if (config.geometryCenter) {
    currentToleranceConfig.geometryCenter = {
      ...currentToleranceConfig.geometryCenter,
      ...config.geometryCenter,
    };
  }

  if (typeof config.rotate === 'number') {
    currentToleranceConfig.rotate = config.rotate;
  }

  if (typeof config.directionAngle === 'number') {
    currentToleranceConfig.directionAngle = config.directionAngle;
  }

  if (typeof config.geometryLength === 'number') {
    currentToleranceConfig.geometryLength = config.geometryLength;
  }

  if (typeof config.geometryArea === 'number') {
    currentToleranceConfig.geometryArea = config.geometryArea;
  }

  if (typeof config.directionOppositeEquivalent === 'boolean') {
    currentToleranceConfig.directionOppositeEquivalent = config.directionOppositeEquivalent;
  }

  if (typeof config.enabled === 'boolean') {
    currentToleranceConfig.enabled = config.enabled;
  }

  if (typeof config.strictMode === 'boolean') {
    currentToleranceConfig.strictMode = config.strictMode;
  }

  if (typeof config.attributeNumericTolerance === 'number') {
    currentToleranceConfig.attributeNumericTolerance = config.attributeNumericTolerance;
  }
}

/**
 * 許容差設定をリセット
 */
export function resetToleranceConfig() {
  currentToleranceConfig = {
    basePoint: { ...DEFAULT_TOLERANCE_CONFIG.basePoint },
    geometryCenter: { ...DEFAULT_TOLERANCE_CONFIG.geometryCenter },
    rotate: DEFAULT_TOLERANCE_CONFIG.rotate,
    directionAngle: DEFAULT_TOLERANCE_CONFIG.directionAngle,
    geometryLength: DEFAULT_TOLERANCE_CONFIG.geometryLength,
    geometryArea: DEFAULT_TOLERANCE_CONFIG.geometryArea,
    directionOppositeEquivalent: DEFAULT_TOLERANCE_CONFIG.directionOppositeEquivalent,
    enabled: DEFAULT_TOLERANCE_CONFIG.enabled,
    strictMode: DEFAULT_TOLERANCE_CONFIG.strictMode,
    attributeNumericTolerance: DEFAULT_TOLERANCE_CONFIG.attributeNumericTolerance,
  };
}

/**
 * 許容差設定の検証
 * @param {Object} config - 検証する設定
 * @returns {{valid: boolean, errors: string[]}} 検証結果
 */
export function validateToleranceConfig(config) {
  const errors = [];

  // 基準点の検証
  if (config.basePoint) {
    if (typeof config.basePoint.x !== 'number' || config.basePoint.x < 0) {
      errors.push('basePoint.x must be a non-negative number');
    }
    if (typeof config.basePoint.y !== 'number' || config.basePoint.y < 0) {
      errors.push('basePoint.y must be a non-negative number');
    }
    if (typeof config.basePoint.z !== 'number' || config.basePoint.z < 0) {
      errors.push('basePoint.z must be a non-negative number');
    }
  }

  // ジオメトリ中心の検証
  if (config.geometryCenter) {
    if (typeof config.geometryCenter.x !== 'number' || config.geometryCenter.x < 0) {
      errors.push('geometryCenter.x must be a non-negative number');
    }
    if (typeof config.geometryCenter.y !== 'number' || config.geometryCenter.y < 0) {
      errors.push('geometryCenter.y must be a non-negative number');
    }
    if (typeof config.geometryCenter.z !== 'number' || config.geometryCenter.z < 0) {
      errors.push('geometryCenter.z must be a non-negative number');
    }
  }

  if (config.directionAngle !== undefined) {
    if (typeof config.directionAngle !== 'number' || config.directionAngle < 0) {
      errors.push('directionAngle must be a non-negative number');
    }
  }

  if (config.geometryLength !== undefined) {
    if (typeof config.geometryLength !== 'number' || config.geometryLength < 0) {
      errors.push('geometryLength must be a non-negative number');
    }
  }

  if (config.geometryArea !== undefined) {
    if (typeof config.geometryArea !== 'number' || config.geometryArea < 0) {
      errors.push('geometryArea must be a non-negative number');
    }
  }

  // 属性値しきい値の検証
  if (config.attributeNumericTolerance !== undefined) {
    if (
      typeof config.attributeNumericTolerance !== 'number' ||
      config.attributeNumericTolerance < 0
    ) {
      errors.push('attributeNumericTolerance must be a non-negative number');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

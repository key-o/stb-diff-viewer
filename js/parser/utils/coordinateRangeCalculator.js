/**
 * @fileoverview 座標範囲計算ユーティリティ
 *
 * パーサー内で使用される座標データの範囲計算を統一化。
 * デバッグ・ログ出力時の座標範囲計算を簡素化します。
 */

/**
 * 座標配列から各軸の範囲を計算
 *
 * @param {Array<{x: number, y: number, z: number}>} coords - 座標オブジェクト配列
 * @returns {{x: {min: number, max: number}, y: {min: number, max: number}, z: {min: number, max: number}}|null}
 */
export function calculateCoordinateRange(coords) {
  if (!coords || coords.length === 0) {
    return null;
  }

  return {
    x: calculateRange(coords.map((c) => c.x)),
    y: calculateRange(coords.map((c) => c.y)),
    z: calculateRange(coords.map((c) => c.z)),
  };
}

/**
 * 数値配列から範囲を計算
 *
 * @param {Array<number>} values - 数値配列
 * @returns {{min: number, max: number}|null}
 */
export function calculateRange(values) {
  if (!values || values.length === 0) {
    return null;
  }

  const validValues = values.filter((v) => typeof v === 'number' && !isNaN(v));

  if (validValues.length === 0) {
    return null;
  }

  return {
    min: Math.min(...validValues),
    max: Math.max(...validValues),
  };
}

/**
 * 座標範囲をフォーマット済み文字列で返す
 *
 * @param {{x: {min: number, max: number}, y: {min: number, max: number}, z: {min: number, max: number}}} range - 範囲オブジェクト
 * @param {Object} [options={}] - オプション
 * @param {number} [options.decimals=0] - 小数点以下桁数
 * @param {string} [options.unit='mm'] - 単位文字列
 * @returns {string} フォーマット済み文字列
 */
export function formatCoordinateRange(range, options = {}) {
  const { decimals = 0, unit = 'mm' } = options;

  if (!range) {
    return 'No coordinate data';
  }

  const formatAxis = (axis, name) => {
    if (!axis) return `${name}:[N/A]`;
    return `${name}:[${axis.min.toFixed(decimals)}, ${axis.max.toFixed(decimals)}]`;
  };

  return `${formatAxis(range.x, 'X')}, ${formatAxis(range.y, 'Y')}, ${formatAxis(range.z, 'Z')} (${unit})`;
}

/**
 * 座標配列から範囲を計算してログ出力用文字列を返す
 *
 * @param {Array<{x: number, y: number, z: number}>} coords - 座標オブジェクト配列
 * @param {Object} [options={}] - オプション
 * @returns {string} フォーマット済み文字列
 */
export function getCoordinateRangeString(coords, options = {}) {
  const range = calculateCoordinateRange(coords);
  return formatCoordinateRange(range, options);
}

export default {
  calculateCoordinateRange,
  calculateRange,
  formatCoordinateRange,
  getCoordinateRangeString,
};

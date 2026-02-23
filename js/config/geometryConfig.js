/**
 * @fileoverview 幾何計算に関する共有定数
 */

/**
 * 座標比較時の小数点以下の桁数
 * @type {number}
 */
export const COORDINATE_PRECISION = 3;

/**
 * 属性値の数値比較における許容差
 * 回転角・オフセット等の数値属性が一致とみなされる閾値
 * @type {number}
 */
export const NUMERIC_TOLERANCE = 0.001;

/**
 * 杭要素の1ノードフォーマット時のデフォルト長さ (mm)
 * @type {number}
 */
export const DEFAULT_PILE_LENGTH = 5000;

/**
 * @fileoverview 断面タイプ定数
 *
 * 全レイヤーから参照可能な共有定数定義。
 *
 * @module constants/sectionTypes
 */

/**
 * サポートされている断面タイプの定数
 * @readonly
 * @enum {string}
 */
export const SECTION_TYPE = Object.freeze({
  H: 'H',
  BOX: 'BOX',
  PIPE: 'PIPE',
  C: 'C',
  L: 'L',
  T: 'T',
  FB: 'FB',
  RECTANGLE: 'RECTANGLE',
  CIRCLE: 'CIRCLE',
  CFT: 'CFT',
  SRC: 'SRC',
});

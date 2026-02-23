/**
 * @fileoverview 構造種別（RC/S/SRC/CFT）定数定義
 *
 * 柱・梁等の構造種別によるフィルタリングに使用する定数。
 *
 * @module constants/structuralSystems
 */

/**
 * 構造種別の定数
 * @readonly
 * @enum {string}
 */
export const STRUCTURAL_SYSTEM = Object.freeze({
  RC: 'RC',
  S: 'S',
  SRC: 'SRC',
  CFT: 'CFT',
});

/**
 * 構造種別の日本語ラベル
 * @readonly
 */
export const STRUCTURAL_SYSTEM_LABELS = Object.freeze({
  [STRUCTURAL_SYSTEM.RC]: 'RC',
  [STRUCTURAL_SYSTEM.S]: 'S',
  [STRUCTURAL_SYSTEM.SRC]: 'SRC',
  [STRUCTURAL_SYSTEM.CFT]: 'CFT',
});

/**
 * 構造種別サブフィルタ対応の要素タイプとその種別一覧
 * @readonly
 */
export const STRUCTURAL_SYSTEM_ELEMENT_TYPES = Object.freeze({
  Column: [STRUCTURAL_SYSTEM.RC, STRUCTURAL_SYSTEM.S, STRUCTURAL_SYSTEM.SRC, STRUCTURAL_SYSTEM.CFT],
  Girder: [STRUCTURAL_SYSTEM.RC, STRUCTURAL_SYSTEM.S, STRUCTURAL_SYSTEM.SRC],
  Beam: [STRUCTURAL_SYSTEM.RC, STRUCTURAL_SYSTEM.S, STRUCTURAL_SYSTEM.SRC],
});

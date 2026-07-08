/**
 * @fileoverview モデル由来情報と差分表示状態の変換ヘルパー
 */

/**
 * 3Dオブジェクトの modelSource を差分色管理の状態名へ正規化する。
 * @param {string|null|undefined} modelSource - 'A' | 'B' | 'matched' | 'onlyA' | 'onlyB' など
 * @returns {'matched'|'onlyA'|'onlyB'|string}
 */
export function normalizeModelSourceToComparisonState(modelSource) {
  switch (modelSource) {
    case 'A':
      return 'onlyA';
    case 'B':
      return 'onlyB';
    case 'solid':
    case 'line':
    case null:
    case undefined:
    case '':
      return 'matched';
    default:
      return modelSource;
  }
}

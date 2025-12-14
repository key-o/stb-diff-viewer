/**
 * 統一断面タイプ正規化ユーティリティ
 * 目的: section_type / profile_type / 大文字小文字ゆれを一本化
 * 標準キー: section_type (大文字識別子: H, BOX, PIPE, C, L, T, RECTANGLE, CIRCLE, CFT, stb-diff-viewer)
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
  'STB-DIFF-VIEWER': 'stb-diff-viewer'
});

// 既存バリアント -> 正規化マップ
const ALIAS_MAP = new Map([
  ['H-SECTION', 'H'],
  ['I', 'H'],
  ['IBEAM', 'H'],
  ['BOX-SECTION', 'BOX'],
  ['SQUARE-SECTION', 'BOX'],
  ['PIPE-SECTION', 'PIPE'],
  ['ROUND-SECTION', 'PIPE'],
  ['P', 'PIPE'],
  ['CHANNEL', 'C'],
  ['U', 'C'],
  ['U-SHAPE', 'C'],
  ['FB', 'FB'],
  ['FLATBAR', 'FB'],
  ['FLAT-BAR', 'FB'],
  ['RECT', 'RECTANGLE'],
  ['RC-SECTION', 'RECTANGLE'],
  ['SQUARE', 'RECTANGLE'],
  ['CIRCLE', 'CIRCLE'],
  ['ROUND', 'CIRCLE'],
  ['ROUNDBAR', 'CIRCLE'],
  ['ROUND-BAR', 'CIRCLE'],
  ['STB-DIFF-VIEWER', 'stb-diff-viewer'],
  ['CFT', 'CFT'],
  ['T-SHAPE', 'T'],
  ['TSHAPE', 'T'],
  // XSDタグ名形式のエイリアス
  ['STBSECCOLUMN_S', 'H'],      // S造柱 -> 形状はdimensionsから判定
  ['STBSECCOLUMN_RC', 'RECTANGLE'],
  ['STBSECCOLUMN_STB-DIFF-VIEWER', 'stb-diff-viewer'],
  ['STBSECCOLUMN_CFT', 'CFT'],
  ['STBSECBEAM_S', 'H'],
  ['STBSECBEAM_RC', 'RECTANGLE'],
  ['STBSECBEAM_STB-DIFF-VIEWER', 'stb-diff-viewer'],
  ['STBSECBRACE_S', 'H'],
  ['STBSECPILE_S', 'PIPE'],
  ['STBSECPILE_RC', 'CIRCLE'],
  ['STBSECFOUNDATION_RC', 'RECTANGLE']
]);

/**
 * 生のタイプ文字列を正規化 (不明はそのまま大文字化)
 * @param {string} raw
 * @returns {string|undefined}
 */
export function normalizeSectionType(raw) {
  if (!raw) return undefined;
  const up = String(raw).trim().toUpperCase();
  if (SECTION_TYPE[up]) return up; // 既に正式
  if (ALIAS_MAP.has(up)) return ALIAS_MAP.get(up);
  return up; // 未知タイプは上位で扱う
}

/**
 * オブジェクトに対して section_type を正規化し設定 (互換: profile_type / sectionType)
 * @param {Object} obj
 */
export function ensureUnifiedSectionType(obj) {
  if (!obj || typeof obj !== 'object') return;

  // 優先順位: dimensions.profile_hint > section_type > profile_type > sectionType
  let cand = null;

  // dimensionsのprofile_hintを最優先（S造断面の形状タイプ）
  if (obj.dimensions && obj.dimensions.profile_hint) {
    cand = obj.dimensions.profile_hint;
  }

  // 次に既存のタイプ属性
  if (!cand) {
    cand = obj.section_type || obj.profile_type || obj.sectionType || obj.sectiontype;
  }

  const norm = normalizeSectionType(cand);
  if (norm) {
    obj.section_type = norm;
  }
  return obj;
}

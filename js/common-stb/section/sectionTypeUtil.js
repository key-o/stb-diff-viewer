/**
 * @fileoverview 統一断面タイプ正規化ユーティリティ
 *
 * 目的: section_type / profile_type / 大文字小文字ゆれを一本化
 * 標準キー: section_type (大文字識別子: H, BOX, PIPE, C, L, T, FB, RECTANGLE, CIRCLE, CFT, SRC)
 *
 * MatrixCalcとStbDiffViewerの両方で使用される共通モジュール。
 *
 * @module common/stb/section/sectionTypeUtil
 */

/**
 * サポートされている断面タイプの定数
 * @readonly
 * @enum {string}
 */
export const SECTION_TYPE = Object.freeze({
  H: 'H', // H形鋼
  BOX: 'BOX', // 角形鋼管
  PIPE: 'PIPE', // 円形鋼管
  C: 'C', // 溝形鋼
  L: 'L', // 山形鋼
  T: 'T', // T形鋼
  FB: 'FB', // フラットバー
  RECTANGLE: 'RECTANGLE', // 矩形断面（RC等）
  CIRCLE: 'CIRCLE', // 円形断面（RC等）
  CFT: 'CFT', // コンクリート充填鋼管
  SRC: 'SRC', // 鉄骨鉄筋コンクリート
});

/**
 * 既存バリアント -> 正規化マップ
 * 様々な表記ゆれに対応
 * @private
 */
const ALIAS_MAP = new Map([
  // H形鋼バリエーション
  ['H-SECTION', 'H'],
  ['I', 'H'],
  ['IBEAM', 'H'],
  ['I-BEAM', 'H'],
  ['WIDE-FLANGE', 'H'],

  // 角形鋼管バリエーション
  ['BOX-SECTION', 'BOX'],
  ['SQUARE-SECTION', 'BOX'],
  ['SQUARE-TUBE', 'BOX'],
  ['RECTANGULAR-TUBE', 'BOX'],

  // 円形鋼管バリエーション
  ['PIPE-SECTION', 'PIPE'],
  ['ROUND-SECTION', 'PIPE'],
  ['CIRCULAR-TUBE', 'PIPE'],
  ['P', 'PIPE'],

  // 溝形鋼バリエーション
  ['CHANNEL', 'C'],
  ['U', 'C'],
  ['U-SHAPE', 'C'],
  ['C-CHANNEL', 'C'],

  // T形鋼バリエーション
  ['T-SHAPE', 'T'],
  ['TSHAPE', 'T'],
  ['TEE', 'T'],

  // フラットバーバリエーション
  ['FB', 'FB'],
  ['FLATBAR', 'FB'],
  ['FLAT-BAR', 'FB'],
  ['FLAT', 'FB'],

  // 矩形断面バリエーション
  ['RECT', 'RECTANGLE'],
  ['RC-SECTION', 'RECTANGLE'],
  ['SQUARE', 'RECTANGLE'],
  ['RECTANGULAR', 'RECTANGLE'],

  // 円形断面バリエーション
  ['CIRCLE', 'CIRCLE'],
  ['ROUND', 'CIRCLE'],
  ['ROUNDBAR', 'CIRCLE'],
  ['ROUND-BAR', 'CIRCLE'],
  ['CIRCULAR', 'CIRCLE'],

  // 複合構造バリエーション
  ['SRC', 'SRC'],
  ['CFT', 'CFT'],

  // XSDタグ名形式のエイリアス（要素タグから断面タイプを推定）
  ['STBSECCOLUMN_S', 'H'], // S造柱 -> 形状はdimensionsから判定
  ['STBSECCOLUMN_RC', 'RECTANGLE'],
  ['STBSECCOLUMN_SRC', 'SRC'],
  ['STBSECCOLUMN_CFT', 'CFT'],
  ['STBSECBEAM_S', 'H'],
  ['STBSECBEAM_RC', 'RECTANGLE'],
  ['STBSECBEAM_SRC', 'SRC'],
  ['STBSECGIRDER_S', 'H'],
  ['STBSECGIRDER_RC', 'RECTANGLE'],
  ['STBSECGIRDER_SRC', 'SRC'],
  ['STBSECBRACE_S', 'H'],
  ['STBSECPILE_S', 'PIPE'],
  ['STBSECPILE_RC', 'CIRCLE'],
  ['STBSECFOUNDATION_RC', 'RECTANGLE'],
]);

/**
 * 生のタイプ文字列を正規化
 * 不明なタイプはそのまま大文字化して返す
 *
 * @param {string} raw - 正規化前のタイプ文字列
 * @returns {string|undefined} 正規化されたタイプ文字列
 *
 * @example
 * normalizeSectionType('h-section') // => 'H'
 * normalizeSectionType('BOX')       // => 'BOX'
 * normalizeSectionType('unknown')   // => 'UNKNOWN'
 */
export function normalizeSectionType(raw) {
  if (!raw) return undefined;

  const up = String(raw).trim().toUpperCase();

  // 既に正式なタイプ名ならそのまま返す
  if (SECTION_TYPE[up]) return up;

  // エイリアスマップで変換
  if (ALIAS_MAP.has(up)) return ALIAS_MAP.get(up);

  // 未知タイプはそのまま大文字化して返す（上位で処理）
  return up;
}

/**
 * オブジェクトに対して section_type を正規化し設定
 * 互換性のため profile_type / sectionType も考慮
 *
 * @param {Object} obj - 断面タイプを持つオブジェクト
 * @returns {Object} 正規化されたオブジェクト（破壊的変更）
 *
 * @example
 * const section = { profile_type: 'h-section' };
 * ensureUnifiedSectionType(section);
 * // section.section_type === 'H'
 */
export function ensureUnifiedSectionType(obj) {
  if (!obj || typeof obj !== 'object') return undefined;

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

/**
 * 断面タイプが鋼構造かどうかを判定
 *
 * @param {string} sectionType - 断面タイプ
 * @returns {boolean} 鋼構造の場合true
 */
export function isSteelSection(sectionType) {
  const norm = normalizeSectionType(sectionType);
  return ['H', 'BOX', 'PIPE', 'C', 'L', 'T', 'FB'].includes(norm);
}

/**
 * 断面タイプがRC構造かどうかを判定
 *
 * @param {string} sectionType - 断面タイプ
 * @returns {boolean} RC構造の場合true
 */
export function isConcreteSection(sectionType) {
  const norm = normalizeSectionType(sectionType);
  return ['RECTANGLE', 'CIRCLE'].includes(norm);
}

/**
 * 断面タイプが複合構造かどうかを判定
 *
 * @param {string} sectionType - 断面タイプ
 * @returns {boolean} 複合構造（SRC/CFT）の場合true
 */
export function isCompositeSection(sectionType) {
  const norm = normalizeSectionType(sectionType);
  return ['SRC', 'CFT'].includes(norm);
}

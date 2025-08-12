/**
 * 統一断面タイプ正規化ユーティリティ
 * 目的: section_type / profile_type / 大文字小文字ゆれを一本化
 * 標準キー: section_type (大文字識別子: H, BOX, PIPE, C, L, T, RECTANGLE, CIRCLE, CFT, SRC)
 */

export const SECTION_TYPE = Object.freeze({
  H: "H",
  BOX: "BOX",
  PIPE: "PIPE",
  C: "C",
  L: "L",
  T: "T",
  RECTANGLE: "RECTANGLE",
  CIRCLE: "CIRCLE",
  CFT: "CFT",
  SRC: "SRC",
});

// 既存バリアント -> 正規化マップ
const ALIAS_MAP = new Map([
  ["H-SECTION", "H"],
  ["I", "H"],
  ["IBEAM", "H"],
  ["BOX-SECTION", "BOX"],
  ["SQUARE-SECTION", "BOX"],
  ["PIPE-SECTION", "PIPE"],
  ["ROUND-SECTION", "PIPE"],
  ["P", "PIPE"],
  ["CHANNEL", "C"],
  ["U", "C"],
  ["U-SHAPE", "C"],
  ["RECT", "RECTANGLE"],
  ["RC-SECTION", "RECTANGLE"],
  ["SQUARE", "RECTANGLE"],
  ["CIRCLE", "CIRCLE"],
  ["ROUND", "CIRCLE"],
  ["SRC", "SRC"],
  ["CFT", "CFT"],
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
  if (!obj || typeof obj !== "object") return;
  const cand =
    obj.section_type || obj.profile_type || obj.sectionType || obj.sectiontype;
  const norm = normalizeSectionType(cand);
  if (norm) {
    obj.section_type = norm;
  }
  return obj;
}

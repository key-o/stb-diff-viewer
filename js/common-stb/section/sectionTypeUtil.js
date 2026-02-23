/**
 * @fileoverview 統一断面タイプ正規化ユーティリティ
 *
 * 目的: 断面タイプの正規化責務をこのモジュールに集約する
 * 標準キー: SECTION_TYPE 準拠 (H, BOX, PIPE, C, L, T, FB, RECTANGLE, CIRCLE, CFT, SRC)
 *
 * @module common/stb/section/sectionTypeUtil
 */

import { SECTION_TYPE } from '../../constants/sectionTypes.js';
export { SECTION_TYPE };

const CANONICAL_TYPES = new Set(Object.values(SECTION_TYPE));
const STEEL_TYPES = new Set([
  SECTION_TYPE.H,
  SECTION_TYPE.BOX,
  SECTION_TYPE.PIPE,
  SECTION_TYPE.C,
  SECTION_TYPE.L,
  SECTION_TYPE.T,
  SECTION_TYPE.FB,
  SECTION_TYPE.CFT,
  SECTION_TYPE.SRC,
]);

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
  ['WIDE_FLANGE', 'H'],

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
  ['CROSS_H', 'H'],
  ['CROSS-H', 'H'],
  ['CROSS', 'H'],
  ['CRUCIFORM', 'H'],
  ['+', 'H'],

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

function toUpperToken(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().toUpperCase();
}

function inferSectionTypeFromDimensions(dimensions) {
  if (!dimensions || typeof dimensions !== 'object') {
    return undefined;
  }

  const hasDiameter =
    dimensions.outer_diameter ||
    dimensions.diameter ||
    dimensions.D ||
    dimensions.d ||
    dimensions.D_axial;
  if (hasDiameter) {
    if (dimensions.wall_thickness || dimensions.t || dimensions.thickness) {
      return SECTION_TYPE.PIPE;
    }
    return SECTION_TYPE.CIRCLE;
  }

  if (dimensions.outer_height && dimensions.outer_width && dimensions.wall_thickness) {
    return SECTION_TYPE.BOX;
  }

  if (
    dimensions.width &&
    dimensions.height &&
    (dimensions.thickness || dimensions.wall_thickness)
  ) {
    return SECTION_TYPE.BOX;
  }

  if (
    dimensions.overall_depth &&
    dimensions.overall_width &&
    dimensions.web_thickness &&
    dimensions.flange_thickness
  ) {
    return SECTION_TYPE.H;
  }

  if (
    dimensions.overall_depth &&
    dimensions.flange_width &&
    dimensions.web_thickness &&
    dimensions.flange_thickness
  ) {
    return SECTION_TYPE.C;
  }

  if (
    dimensions.depth &&
    dimensions.width &&
    dimensions.thickness &&
    !dimensions.overall_depth &&
    !dimensions.web_thickness
  ) {
    return SECTION_TYPE.L;
  }

  if (dimensions.radius && !dimensions.thickness && !dimensions.wall_thickness) {
    return SECTION_TYPE.CIRCLE;
  }

  if (
    dimensions.width &&
    dimensions.height &&
    !dimensions.thickness &&
    !dimensions.wall_thickness &&
    !dimensions.web_thickness &&
    !dimensions.flange_thickness
  ) {
    return SECTION_TYPE.RECTANGLE;
  }

  return undefined;
}

function toCanonicalType(value) {
  const normalized = normalizeProfileTypeToken(value);
  if (!normalized || normalized === 'UNKNOWN') {
    return undefined;
  }

  if (CANONICAL_TYPES.has(normalized)) {
    return normalized;
  }

  if (normalized === 'CROSS_H' || normalized === 'CROSS-H') {
    return SECTION_TYPE.H;
  }

  for (const type of CANONICAL_TYPES) {
    if (normalized.startsWith(type + '-') || normalized.startsWith(type + '_')) {
      return type;
    }
  }

  return undefined;
}

/**
 * 生のタイプ文字列を正規化
 * 不明なタイプはそのまま大文字化して返す
 *
 * @param {string} raw - 正規化前のタイプ文字列
 * @returns {string|undefined} 正規化されたタイプ文字列
 *
 * @example
 * normalizeProfileTypeToken('h-section') // => 'H'
 * normalizeProfileTypeToken('BOX')       // => 'BOX'
 * normalizeProfileTypeToken('unknown')   // => 'UNKNOWN'
 */
export function normalizeProfileTypeToken(raw) {
  if (!raw) return undefined;

  const up = toUpperToken(raw);

  // 既に正式なタイプ名ならそのまま返す
  if (CANONICAL_TYPES.has(up)) return up;

  // エイリアスマップで変換
  if (ALIAS_MAP.has(up)) return ALIAS_MAP.get(up);

  // 未知タイプはそのまま大文字化して返す（上位で処理）
  return up;
}

/**
 * 断面データから断面タイプを正規化して取得
 *
 * @param {Object} sectionData - 断面データ
 * @param {Object} [options]
 * @param {string} [options.defaultType='RECTANGLE'] - 候補が解決できない場合のデフォルト
 * @param {boolean} [options.inferFromDimensions=true] - 寸法推定を有効化
 * @returns {string|undefined} 正規化された断面タイプ
 */
export function resolveGeometryProfileType(sectionData, options = {}) {
  const inferFromDimensions = options.inferFromDimensions !== false;
  const fallbackDefault =
    Object.prototype.hasOwnProperty.call(options, 'defaultType') &&
    options.defaultType !== undefined
      ? options.defaultType
      : Object.prototype.hasOwnProperty.call(options, 'defaultType')
        ? undefined
        : SECTION_TYPE.RECTANGLE;

  if (!sectionData || typeof sectionData !== 'object') {
    return toCanonicalType(fallbackDefault);
  }

  const candidates = [
    sectionData.section_type,
    sectionData.dimensions?.profile_hint,
    sectionData.profile_type,
    sectionData.sectionType,
    sectionData.steelShape?.type,
  ];

  for (const candidate of candidates) {
    const resolved = toCanonicalType(candidate);
    if (resolved) {
      return resolved;
    }
  }

  if (inferFromDimensions) {
    const inferred = inferSectionTypeFromDimensions(sectionData.dimensions || sectionData);
    if (inferred) {
      return inferred;
    }
  }

  return toCanonicalType(fallbackDefault);
}

/**
 * オブジェクトに対して section_type を正規化し設定
 *
 * @param {Object} obj - 断面タイプを持つオブジェクト
 * @returns {Object} 正規化されたオブジェクト（破壊的変更）
 *
 * @example
 * const section = { section_type: 'h-section' };
 * resolveGeometryProfileTypeInPlace(section);
 * // section.section_type === 'H'
 */
export function resolveGeometryProfileTypeInPlace(obj) {
  if (!obj || typeof obj !== 'object') return undefined;

  const norm = resolveGeometryProfileType(obj, {
    defaultType: undefined,
    inferFromDimensions: true,
  });
  if (norm && CANONICAL_TYPES.has(norm)) {
    obj.section_type = norm;
  }

  return obj;
}

/**
 * 断面タイプが鉄骨タイプかどうかを判定
 *
 * @param {string} sectionType - 断面タイプ
 * @returns {boolean}
 */
export function isSteelType(sectionType) {
  const normalized = toCanonicalType(sectionType);
  if (!normalized) return false;
  return STEEL_TYPES.has(normalized);
}

/**
 * 断面タイプがRC系（矩形/円形）かどうかを判定
 *
 * @param {string} sectionType - 断面タイプ
 * @returns {boolean}
 */
export function isRcType(sectionType) {
  const normalized = toCanonicalType(sectionType);
  return normalized === SECTION_TYPE.RECTANGLE || normalized === SECTION_TYPE.CIRCLE;
}

/**
 * sectionTypeタグ名からSRC造か判定
 *
 * @param {Object} sectionData - 断面データ
 * @returns {boolean}
 */
export function isSrcBySectionTag(sectionData) {
  if (!sectionData || typeof sectionData !== 'object') return false;
  return /_SRC$/i.test(String(sectionData.sectionType || ''));
}

/**
 * 断面タイプが円形系かどうかを判定
 *
 * @param {string} sectionType - 断面タイプ
 * @returns {boolean}
 */
export function isCircular(sectionType) {
  const normalized = toCanonicalType(sectionType);
  return normalized === SECTION_TYPE.CIRCLE || normalized === SECTION_TYPE.PIPE;
}

/**
 * 断面タイプが中空系かどうかを判定
 *
 * @param {string} sectionType - 断面タイプ
 * @returns {boolean}
 */
export function isHollow(sectionType) {
  const normalized = toCanonicalType(sectionType);
  return normalized === SECTION_TYPE.PIPE || normalized === SECTION_TYPE.BOX;
}

/**
 * 断面データと期待タイプが一致するかを判定
 *
 * @param {Object} sectionData - 断面データ
 * @param {string} expectedType - 期待する断面タイプ
 * @returns {boolean}
 */
export function validateSectionType(sectionData, expectedType) {
  const resolved = resolveGeometryProfileType(sectionData, { defaultType: undefined });
  const expected = toCanonicalType(expectedType);
  return Boolean(resolved && expected && resolved === expected);
}

/**
 * isReferenceDirection を考慮した回転角度を計算
 *
 * @param {Object} sectionData - 断面データ
 * @param {number} [baseRotation=0] - 基本回転角度（度）
 * @returns {number}
 */
export function calculateRotationWithReference(sectionData, baseRotation = 0) {
  let rotation = Number(baseRotation) || 0;
  if (sectionData && sectionData.isReferenceDirection === false) {
    rotation += 90;
  }
  return rotation;
}

/**
 * 断面タイプの表示名を取得
 *
 * @param {string} sectionType - 断面タイプ
 * @returns {string}
 */
export function getSectionTypeDisplayName(sectionType) {
  const normalized = toCanonicalType(sectionType);
  if (!normalized) return '不明';

  const displayNames = {
    [SECTION_TYPE.H]: 'H形鋼',
    [SECTION_TYPE.BOX]: '角形鋼管',
    [SECTION_TYPE.PIPE]: '円形鋼管',
    [SECTION_TYPE.C]: '溝形鋼',
    [SECTION_TYPE.L]: '山形鋼',
    [SECTION_TYPE.T]: 'T形鋼',
    [SECTION_TYPE.FB]: 'フラットバー',
    [SECTION_TYPE.RECTANGLE]: '矩形',
    [SECTION_TYPE.CIRCLE]: '円形',
    [SECTION_TYPE.CFT]: 'CFT',
    [SECTION_TYPE.SRC]: 'SRC',
  };

  return displayNames[normalized] || normalized;
}


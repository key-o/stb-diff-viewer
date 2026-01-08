/**
 * @fileoverview 配筋情報抽出ユーティリティ
 *
 * 梁・柱の配筋（鉄筋配置）情報を STB バージョンに依存しないで抽出する
 * 3段階属性フォールバック：v2.0.2 → v1.x → legacy
 *
 * @module common/stb/utils/barArrangementExtractor
 */

import {
  getAttributeValue,
  getAttributeValueCascade,
  getChildElements,
  isElementTag,
} from './domHelpers.js';

/**
 * 複数の属性候補から値を取得（3段階フォールバック）
 * v2.0.2 → v1.x → legacy の順で属性を検索
 *
 * @param {Element} element - 対象要素
 * @param {string[]} attributeCandidates - 属性名の配列（優先順）
 * @param {string|number} [defaultValue='0'] - デフォルト値
 * @returns {string|number} 最初に見つかった属性値、またはデフォルト値
 *
 * @example
 * // v2.0.2 → v1.x → legacy の順で検索
 * const mainBarX = getAttributeWithFallback(element, [
 *   'N_main_X_1st',   // v2.0.2: 1段目主筋本数
 *   'N_main_X',       // v1.x: 主筋本数
 *   'count_main_X'    // legacy: レガシー名
 * ], '0');
 */
export function getAttributeWithFallback(
  element,
  attributeCandidates,
  defaultValue = '0'
) {
  if (!element || !Array.isArray(attributeCandidates) || attributeCandidates.length === 0) {
    return defaultValue;
  }

  const value = getAttributeValueCascade(element, attributeCandidates, defaultValue);
  return value && value !== '' ? value : defaultValue;
}

/**
 * 梁の主筋情報を抽出
 *
 * @param {Element} beamSection - 梁断面要素 (StbSecBeam_*, StbSecGirder_*)
 * @returns {Object} 主筋情報オブジェクト
 * @returns {string} return.N_main_X - X方向主筋本数
 * @returns {string} return.N_main_Y - Y方向主筋本数
 * @returns {string} return.D_main - 主筋径
 * @returns {string} return.D_main_X - X方向主筋径
 * @returns {string} return.D_main_Y - Y方向主筋径
 *
 * @example
 * const mainBar = extractBeamMainBar(beamSection);
 * console.log(mainBar.N_main_X); // "6"
 */
export function extractBeamMainBar(beamSection) {
  if (!beamSection) {
    return {
      N_main_X: '0',
      N_main_Y: '0',
      D_main: '0',
      D_main_X: '0',
      D_main_Y: '0',
    };
  }

  return {
    // v2.0.2: N_main_X_1st, v1.x: N_main_X, legacy: count_main_X
    N_main_X: getAttributeWithFallback(beamSection, [
      'N_main_X_1st',
      'N_main_X',
      'count_main_X',
    ]),
    // v2.0.2: N_main_Y_1st, v1.x: N_main_Y, legacy: count_main_Y
    N_main_Y: getAttributeWithFallback(beamSection, [
      'N_main_Y_1st',
      'N_main_Y',
      'count_main_Y',
    ]),
    // v2.0.2: D_main, v1.x: D_main, legacy: dia_main
    D_main: getAttributeWithFallback(beamSection, ['D_main', 'dia_main']),
    // v2.0.2: D_main_X, v1.x: D_main_X, legacy: dia_main_X
    D_main_X: getAttributeWithFallback(beamSection, ['D_main_X', 'dia_main_X']),
    // v2.0.2: D_main_Y, v1.x: D_main_Y, legacy: dia_main_Y
    D_main_Y: getAttributeWithFallback(beamSection, ['D_main_Y', 'dia_main_Y']),
  };
}

/**
 * 梁のあばら筋（横補強）情報を抽出
 *
 * @param {Element} beamSection - 梁断面要素
 * @returns {Object} あばら筋情報オブジェクト
 * @returns {string} return.N_stirrup - あばら筋本数
 * @returns {string} return.D_stirrup - あばら筋径
 * @returns {string} return.spacing - あばら筋間隔
 * @returns {string} return.spacing_1st - 支点部あばら筋間隔
 *
 * @example
 * const stirrup = extractStirrupInfo(beamSection);
 * console.log(stirrup.spacing); // "150"
 */
export function extractStirrupInfo(beamSection) {
  if (!beamSection) {
    return {
      N_stirrup: '0',
      D_stirrup: '0',
      spacing: '0',
      spacing_1st: '0',
    };
  }

  return {
    // v2.0.2: N_stirrup, v1.x: N_stirrup, legacy: count_stirrup
    N_stirrup: getAttributeWithFallback(beamSection, ['N_stirrup', 'count_stirrup']),
    // v2.0.2: D_stirrup, v1.x: D_stirrup, legacy: dia_stirrup
    D_stirrup: getAttributeWithFallback(beamSection, ['D_stirrup', 'dia_stirrup']),
    // v2.0.2: stirrup_spacing, v1.x: stirrup_spacing, legacy: pitch_stirrup
    spacing: getAttributeWithFallback(beamSection, [
      'stirrup_spacing',
      'pitch_stirrup',
    ]),
    // v2.0.2: stirrup_spacing_1st, v1.x: stirrup_spacing_1st, legacy: pitch_stirrup_1st
    spacing_1st: getAttributeWithFallback(beamSection, [
      'stirrup_spacing_1st',
      'pitch_stirrup_1st',
    ]),
  };
}

/**
 * 梁の腹筋（側面せん断補強）情報を抽出
 *
 * @param {Element} beamSection - 梁断面要素
 * @returns {Object} 腹筋情報オブジェクト
 * @returns {string} return.N_web - 腹筋本数
 * @returns {string} return.D_web - 腹筋径
 * @returns {string} return.spacing - 腹筋間隔
 *
 * @example
 * const webBar = extractWebBarInfo(beamSection);
 */
export function extractWebBarInfo(beamSection) {
  if (!beamSection) {
    return {
      N_web: '0',
      D_web: '0',
      spacing: '0',
    };
  }

  return {
    // v2.0.2: N_web, v1.x: N_web, legacy: count_web
    N_web: getAttributeWithFallback(beamSection, ['N_web', 'count_web']),
    // v2.0.2: D_web, v1.x: D_web, legacy: dia_web
    D_web: getAttributeWithFallback(beamSection, ['D_web', 'dia_web']),
    // v2.0.2: web_spacing, v1.x: web_spacing, legacy: pitch_web
    spacing: getAttributeWithFallback(beamSection, ['web_spacing', 'pitch_web']),
  };
}

/**
 * 柱の主筋情報を抽出
 *
 * @param {Element} columnSection - 柱断面要素 (StbSecColumn_*)
 * @returns {Object} 主筋情報オブジェクト
 * @returns {string} return.N_main - 主筋本数
 * @returns {string} return.D_main - 主筋径
 * @returns {string} return.N_main_X - X方向主筋本数（四角柱）
 * @returns {string} return.N_main_Y - Y方向主筋本数（四角柱）
 * @returns {string} return.D_main_X - X方向主筋径
 * @returns {string} return.D_main_Y - Y方向主筋径
 *
 * @example
 * const mainBar = extractMainBarInfo(columnSection);
 * console.log(mainBar.N_main); // "12"
 */
export function extractMainBarInfo(columnSection) {
  if (!columnSection) {
    return {
      N_main: '0',
      D_main: '0',
      N_main_X: '0',
      N_main_Y: '0',
      D_main_X: '0',
      D_main_Y: '0',
    };
  }

  return {
    // v2.0.2: N_main, v1.x: N_main, legacy: count_main
    N_main: getAttributeWithFallback(columnSection, ['N_main', 'count_main']),
    // v2.0.2: D_main, v1.x: D_main, legacy: dia_main
    D_main: getAttributeWithFallback(columnSection, ['D_main', 'dia_main']),
    // v2.0.2: N_main_X_1st, v1.x: N_main_X, legacy: count_main_X
    N_main_X: getAttributeWithFallback(columnSection, [
      'N_main_X_1st',
      'N_main_X',
      'count_main_X',
    ]),
    // v2.0.2: N_main_Y_1st, v1.x: N_main_Y, legacy: count_main_Y
    N_main_Y: getAttributeWithFallback(columnSection, [
      'N_main_Y_1st',
      'N_main_Y',
      'count_main_Y',
    ]),
    // v2.0.2: D_main_X, v1.x: D_main_X, legacy: dia_main_X
    D_main_X: getAttributeWithFallback(columnSection, [
      'D_main_X',
      'dia_main_X',
    ]),
    // v2.0.2: D_main_Y, v1.x: D_main_Y, legacy: dia_main_Y
    D_main_Y: getAttributeWithFallback(columnSection, [
      'D_main_Y',
      'dia_main_Y',
    ]),
  };
}

/**
 * 柱の帯筋（横補強）情報を抽出
 *
 * @param {Element} columnSection - 柱断面要素
 * @returns {Object} 帯筋情報オブジェクト
 * @returns {string} return.N_hoop - 帯筋本数
 * @returns {string} return.D_hoop - 帯筋径
 * @returns {string} return.spacing - 帯筋間隔
 * @returns {string} return.spacing_1st - 支点部帯筋間隔
 *
 * @example
 * const hoop = extractHoopInfo(columnSection);
 * console.log(hoop.spacing); // "100"
 */
export function extractHoopInfo(columnSection) {
  if (!columnSection) {
    return {
      N_hoop: '0',
      D_hoop: '0',
      spacing: '0',
      spacing_1st: '0',
    };
  }

  return {
    // v2.0.2: N_hoop, v1.x: N_hoop, legacy: count_hoop
    N_hoop: getAttributeWithFallback(columnSection, ['N_hoop', 'count_hoop']),
    // v2.0.2: D_hoop, v1.x: D_hoop, legacy: dia_hoop
    D_hoop: getAttributeWithFallback(columnSection, ['D_hoop', 'dia_hoop']),
    // v2.0.2: hoop_spacing, v1.x: hoop_spacing, legacy: pitch_hoop
    spacing: getAttributeWithFallback(columnSection, [
      'hoop_spacing',
      'pitch_hoop',
    ]),
    // v2.0.2: hoop_spacing_1st, v1.x: hoop_spacing_1st, legacy: pitch_hoop_1st
    spacing_1st: getAttributeWithFallback(columnSection, [
      'hoop_spacing_1st',
      'pitch_hoop_1st',
    ]),
  };
}

/**
 * ブレースの配筋情報を抽出
 * （ブレースは通常、単純な鋼材配置のため、主に寸法情報）
 *
 * @param {Element} braceSection - ブレース断面要素 (StbSecBrace_*)
 * @returns {Object} ブレース配筋情報オブジェクト
 * @returns {string} return.D - ブレース径または幅
 * @returns {string} return.width - ブレース幅（フラットバーの場合）
 * @returns {string} return.thickness - ブレース厚さ
 *
 * @example
 * const brace = extractBraceBarInfo(braceSection);
 */
export function extractBraceBarInfo(braceSection) {
  if (!braceSection) {
    return {
      D: '0',
      width: '0',
      thickness: '0',
    };
  }

  return {
    // v2.0.2: D, v1.x: D, legacy: dia
    D: getAttributeWithFallback(braceSection, ['D', 'dia']),
    // v2.0.2: width, v1.x: width, legacy: B
    width: getAttributeWithFallback(braceSection, ['width', 'B']),
    // v2.0.2: thickness, v1.x: thickness, legacy: t
    thickness: getAttributeWithFallback(braceSection, ['thickness', 't']),
  };
}

/**
 * 杭の配筋情報を抽出
 *
 * @param {Element} pileSection - 杭断面要素 (StbSecPile_*)
 * @returns {Object} 杭配筋情報オブジェクト
 * @returns {string} return.D - 杭径
 * @returns {string} return.N_main - 主筋本数
 * @returns {string} return.D_main - 主筋径
 * @returns {string} return.N_hoop - 帯筋本数
 * @returns {string} return.D_hoop - 帯筋径
 *
 * @example
 * const pileBar = extractPileBarInfo(pileSection);
 */
export function extractPileBarInfo(pileSection) {
  if (!pileSection) {
    return {
      D: '0',
      N_main: '0',
      D_main: '0',
      N_hoop: '0',
      D_hoop: '0',
    };
  }

  return {
    // v2.0.2: D, v1.x: D, legacy: dia
    D: getAttributeWithFallback(pileSection, ['D', 'dia']),
    // v2.0.2: N_main, v1.x: N_main, legacy: count_main
    N_main: getAttributeWithFallback(pileSection, ['N_main', 'count_main']),
    // v2.0.2: D_main, v1.x: D_main, legacy: dia_main
    D_main: getAttributeWithFallback(pileSection, ['D_main', 'dia_main']),
    // v2.0.2: N_hoop, v1.x: N_hoop, legacy: count_hoop
    N_hoop: getAttributeWithFallback(pileSection, ['N_hoop', 'count_hoop']),
    // v2.0.2: D_hoop, v1.x: D_hoop, legacy: dia_hoop
    D_hoop: getAttributeWithFallback(pileSection, ['D_hoop', 'dia_hoop']),
  };
}

/**
 * 壁の配筋情報を抽出
 *
 * @param {Element} wallSection - 壁断面要素 (StbSecWall_*)
 * @returns {Object} 壁配筋情報オブジェクト
 * @returns {string} return.N_main_h - 水平主筋本数
 * @returns {string} return.D_main_h - 水平主筋径
 * @returns {string} return.N_main_v - 鉛直主筋本数
 * @returns {string} return.D_main_v - 鉛直主筋径
 * @returns {string} return.spacing_h - 水平補強筋間隔
 * @returns {string} return.spacing_v - 鉛直補強筋間隔
 *
 * @example
 * const wallBar = extractWallBarInfo(wallSection);
 */
export function extractWallBarInfo(wallSection) {
  if (!wallSection) {
    return {
      N_main_h: '0',
      D_main_h: '0',
      N_main_v: '0',
      D_main_v: '0',
      spacing_h: '0',
      spacing_v: '0',
    };
  }

  return {
    // v2.0.2: N_main_h, v1.x: N_main_h, legacy: count_main_h
    N_main_h: getAttributeWithFallback(wallSection, [
      'N_main_h',
      'count_main_h',
    ]),
    // v2.0.2: D_main_h, v1.x: D_main_h, legacy: dia_main_h
    D_main_h: getAttributeWithFallback(wallSection, [
      'D_main_h',
      'dia_main_h',
    ]),
    // v2.0.2: N_main_v, v1.x: N_main_v, legacy: count_main_v
    N_main_v: getAttributeWithFallback(wallSection, [
      'N_main_v',
      'count_main_v',
    ]),
    // v2.0.2: D_main_v, v1.x: D_main_v, legacy: dia_main_v
    D_main_v: getAttributeWithFallback(wallSection, [
      'D_main_v',
      'dia_main_v',
    ]),
    // v2.0.2: shear_spacing_h, v1.x: shear_spacing_h, legacy: pitch_h
    spacing_h: getAttributeWithFallback(wallSection, [
      'shear_spacing_h',
      'pitch_h',
    ]),
    // v2.0.2: shear_spacing_v, v1.x: shear_spacing_v, legacy: pitch_v
    spacing_v: getAttributeWithFallback(wallSection, [
      'shear_spacing_v',
      'pitch_v',
    ]),
  };
}

/**
 * @fileoverview 驟咲ｭ区ュ蝣ｱ謚ｽ蜃ｺ繝ｦ繝ｼ繝・ぅ繝ｪ繝・ぅ
 *
 * 譴√・譟ｱ縺ｮ驟咲ｭ具ｼ磯延遲矩・鄂ｮ・画ュ蝣ｱ繧・STB 繝舌・繧ｸ繝ｧ繝ｳ縺ｫ萓晏ｭ倥＠縺ｪ縺・〒謚ｽ蜃ｺ縺吶ｋ
 * 3谿ｵ髫主ｱ樊ｧ繝輔か繝ｼ繝ｫ繝舌ャ繧ｯ・嘛2.0.2 竊・v1.x 竊・legacy
 *
 * @module common/stb/utils/barArrangementExtractor
 */

import { getAttributeValueCascade } from './domHelpers.js';

/**
 * 隍・焚縺ｮ螻樊ｧ蛟呵｣懊°繧牙､繧貞叙蠕暦ｼ・谿ｵ髫弱ヵ繧ｩ繝ｼ繝ｫ繝舌ャ繧ｯ・・
 * v2.0.2 竊・v1.x 竊・legacy 縺ｮ鬆・〒螻樊ｧ繧呈､懃ｴ｢
 *
 * @param {Element} element - 蟇ｾ雎｡隕∫ｴ
 * @param {string[]} attributeCandidates - 螻樊ｧ蜷阪・驟榊・・亥━蜈磯・ｼ・
 * @param {string|number} [defaultValue='0'] - 繝・ヵ繧ｩ繝ｫ繝亥､
 * @returns {string|number} 譛蛻昴↓隕九▽縺九▲縺溷ｱ樊ｧ蛟､縲√∪縺溘・繝・ヵ繧ｩ繝ｫ繝亥､
 *
 * @example
 * // v2.0.2 竊・v1.x 竊・legacy 縺ｮ鬆・〒讀懃ｴ｢
 * const mainBarX = getAttributeWithFallback(element, [
 *   'N_main_X_1st',   // v2.0.2: 1谿ｵ逶ｮ荳ｻ遲区悽謨ｰ
 *   'N_main_X',       // v1.x: 荳ｻ遲区悽謨ｰ
 *   'count_main_X'    // legacy: 繝ｬ繧ｬ繧ｷ繝ｼ蜷・
 * ], '0');
 */
export function getAttributeWithFallback(element, attributeCandidates, defaultValue = '0') {
  if (!element || !Array.isArray(attributeCandidates) || attributeCandidates.length === 0) {
    return defaultValue;
  }

  const value = getAttributeValueCascade(element, attributeCandidates, defaultValue);
  return value && value !== '' ? value : defaultValue;
}

/**
 * 譴√・荳ｻ遲区ュ蝣ｱ繧呈歓蜃ｺ
 *
 * @param {Element} beamSection - 譴∵妙髱｢隕∫ｴ (StbSecBeam_*, StbSecGirder_*)
 * @returns {Object} 荳ｻ遲区ュ蝣ｱ繧ｪ繝悶ず繧ｧ繧ｯ繝・
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
    N_main_X: getAttributeWithFallback(beamSection, ['N_main_X_1st', 'N_main_X', 'count_main_X']),
    // v2.0.2: N_main_Y_1st, v1.x: N_main_Y, legacy: count_main_Y
    N_main_Y: getAttributeWithFallback(beamSection, ['N_main_Y_1st', 'N_main_Y', 'count_main_Y']),
    // v2.0.2: D_main, v1.x: D_main, legacy: dia_main
    D_main: getAttributeWithFallback(beamSection, ['D_main', 'dia_main']),
    // v2.0.2: D_main_X, v1.x: D_main_X, legacy: dia_main_X
    D_main_X: getAttributeWithFallback(beamSection, ['D_main_X', 'dia_main_X']),
    // v2.0.2: D_main_Y, v1.x: D_main_Y, legacy: dia_main_Y
    D_main_Y: getAttributeWithFallback(beamSection, ['D_main_Y', 'dia_main_Y']),
  };
}

/**
 * 譴√・縺ゅ・繧臥ｭ具ｼ域ｨｪ陬懷ｼｷ・画ュ蝣ｱ繧呈歓蜃ｺ
 *
 * @param {Element} beamSection - 譴∵妙髱｢隕∫ｴ
 * @returns {Object} 縺ゅ・繧臥ｭ区ュ蝣ｱ繧ｪ繝悶ず繧ｧ繧ｯ繝・
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
    spacing: getAttributeWithFallback(beamSection, ['stirrup_spacing', 'pitch_stirrup']),
    // v2.0.2: stirrup_spacing_1st, v1.x: stirrup_spacing_1st, legacy: pitch_stirrup_1st
    spacing_1st: getAttributeWithFallback(beamSection, [
      'stirrup_spacing_1st',
      'pitch_stirrup_1st',
    ]),
  };
}

/**
 * 譴√・閻ｹ遲具ｼ亥・髱｢縺帙ｓ譁ｭ陬懷ｼｷ・画ュ蝣ｱ繧呈歓蜃ｺ
 *
 * @param {Element} beamSection - 譴∵妙髱｢隕∫ｴ
 * @returns {Object} 閻ｹ遲区ュ蝣ｱ繧ｪ繝悶ず繧ｧ繧ｯ繝・
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
 * 譟ｱ縺ｮ荳ｻ遲区ュ蝣ｱ繧呈歓蜃ｺ
 *
 * @param {Element} columnSection - 譟ｱ譁ｭ髱｢隕∫ｴ (StbSecColumn_*)
 * @returns {Object} 荳ｻ遲区ュ蝣ｱ繧ｪ繝悶ず繧ｧ繧ｯ繝・
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
    N_main_X: getAttributeWithFallback(columnSection, ['N_main_X_1st', 'N_main_X', 'count_main_X']),
    // v2.0.2: N_main_Y_1st, v1.x: N_main_Y, legacy: count_main_Y
    N_main_Y: getAttributeWithFallback(columnSection, ['N_main_Y_1st', 'N_main_Y', 'count_main_Y']),
    // v2.0.2: D_main_X, v1.x: D_main_X, legacy: dia_main_X
    D_main_X: getAttributeWithFallback(columnSection, ['D_main_X', 'dia_main_X']),
    // v2.0.2: D_main_Y, v1.x: D_main_Y, legacy: dia_main_Y
    D_main_Y: getAttributeWithFallback(columnSection, ['D_main_Y', 'dia_main_Y']),
  };
}

/**
 * 譟ｱ縺ｮ蟶ｯ遲具ｼ域ｨｪ陬懷ｼｷ・画ュ蝣ｱ繧呈歓蜃ｺ
 *
 * @param {Element} columnSection - 譟ｱ譁ｭ髱｢隕∫ｴ
 * @returns {Object} 蟶ｯ遲区ュ蝣ｱ繧ｪ繝悶ず繧ｧ繧ｯ繝・
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
    spacing: getAttributeWithFallback(columnSection, ['hoop_spacing', 'pitch_hoop']),
    // v2.0.2: hoop_spacing_1st, v1.x: hoop_spacing_1st, legacy: pitch_hoop_1st
    spacing_1st: getAttributeWithFallback(columnSection, ['hoop_spacing_1st', 'pitch_hoop_1st']),
  };
}

/**
 * 繝悶Ξ繝ｼ繧ｹ縺ｮ驟咲ｭ区ュ蝣ｱ繧呈歓蜃ｺ
 * ・医ヶ繝ｬ繝ｼ繧ｹ縺ｯ騾壼ｸｸ縲∝腰邏斐↑驪ｼ譚宣・鄂ｮ縺ｮ縺溘ａ縲∽ｸｻ縺ｫ蟇ｸ豕墓ュ蝣ｱ・・
 *
 * @param {Element} braceSection - 繝悶Ξ繝ｼ繧ｹ譁ｭ髱｢隕∫ｴ (StbSecBrace_*)
 * @returns {Object} 繝悶Ξ繝ｼ繧ｹ驟咲ｭ区ュ蝣ｱ繧ｪ繝悶ず繧ｧ繧ｯ繝・
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
 * 譚ｭ縺ｮ驟咲ｭ区ュ蝣ｱ繧呈歓蜃ｺ
 *
 * @param {Element} pileSection - 譚ｭ譁ｭ髱｢隕∫ｴ (StbSecPile_*)
 * @returns {Object} 譚ｭ驟咲ｭ区ュ蝣ｱ繧ｪ繝悶ず繧ｧ繧ｯ繝・
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
 * 螢√・驟咲ｭ区ュ蝣ｱ繧呈歓蜃ｺ
 *
 * @param {Element} wallSection - 螢∵妙髱｢隕∫ｴ (StbSecWall_*)
 * @returns {Object} 螢・・遲区ュ蝣ｱ繧ｪ繝悶ず繧ｧ繧ｯ繝・
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
    N_main_h: getAttributeWithFallback(wallSection, ['N_main_h', 'count_main_h']),
    // v2.0.2: D_main_h, v1.x: D_main_h, legacy: dia_main_h
    D_main_h: getAttributeWithFallback(wallSection, ['D_main_h', 'dia_main_h']),
    // v2.0.2: N_main_v, v1.x: N_main_v, legacy: count_main_v
    N_main_v: getAttributeWithFallback(wallSection, ['N_main_v', 'count_main_v']),
    // v2.0.2: D_main_v, v1.x: D_main_v, legacy: dia_main_v
    D_main_v: getAttributeWithFallback(wallSection, ['D_main_v', 'dia_main_v']),
    // v2.0.2: shear_spacing_h, v1.x: shear_spacing_h, legacy: pitch_h
    spacing_h: getAttributeWithFallback(wallSection, ['shear_spacing_h', 'pitch_h']),
    // v2.0.2: shear_spacing_v, v1.x: shear_spacing_v, legacy: pitch_v
    spacing_v: getAttributeWithFallback(wallSection, ['shear_spacing_v', 'pitch_v']),
  };
}

/**
 * @fileoverview プロファイルパラメータマッピングモジュール
 *
 * STB/JSON形式の寸法データをProfileCalculatorが期待する
 * 標準パラメータ形式に変換します。
 *
 * 様々な命名規則（STB形式、IFC形式、一般形式など）に対応し、
 * 統一的なパラメータ出力を提供します。
 *
 * @module ProfileParameterMapper
 */

import {
  getWidth,
  getHeight,
  getDiameter,
  getRadius,
  getThickness,
} from '../../../common-stb/data/dimensionNormalizer.js';

/**
 * 断面タイプに応じたプロファイルパラメータを準備
 *
 * @param {Object} dimensions - 入力寸法データ（様々な形式に対応）
 * @param {string} sectionType - 断面タイプ（'H', 'BOX', 'PIPE', 'RECTANGLE', 'CIRCLE'等）
 * @returns {Object} ProfileCalculator用の標準パラメータ
 *
 * @example
 * // H形鋼
 * const params = mapToProfileParams({ H: 400, B: 200, t1: 8, t2: 13 }, 'H');
 * // => { overallDepth: 400, overallWidth: 200, webThickness: 8, flangeThickness: 13 }
 *
 * @example
 * // RC矩形
 * const params = mapToProfileParams({ width: 600, height: 800 }, 'RECTANGLE');
 * // => { width: 600, height: 800 }
 */
export function mapToProfileParams(dimensions, sectionType) {
  if (!dimensions) {
    return getDefaultParams(sectionType);
  }

  const type = (sectionType || '').toUpperCase();

  switch (type) {
    case 'H':
    case 'I':
    case 'IBEAM':
    case 'H-SECTION':
      return mapHSectionParams(dimensions);

    case 'BOX':
    case 'BOX-SECTION':
    case 'SQUARE-SECTION':
      return mapBoxParams(dimensions);

    case 'PIPE':
    case 'PIPE-SECTION':
    case 'ROUND-SECTION':
      return mapPipeParams(dimensions);

    case 'RECTANGLE':
    case 'RECT':
    case 'RC-SECTION':
      return mapRectangleParams(dimensions);

    case 'CIRCLE':
      return mapCircleParams(dimensions);

    case 'C':
    case 'CHANNEL':
    case 'U-SHAPE':
      return mapChannelParams(dimensions);

    case 'L':
    case 'L-SHAPE':
      return mapLShapeParams(dimensions);

    case 'T':
    case 'T-SHAPE':
      return mapTShapeParams(dimensions);

    case 'CROSS_H':
      return mapCrossHParams(dimensions);

    default:
      // デフォルトは矩形として扱う
      return mapRectangleParams(dimensions);
  }
}

/**
 * H形鋼パラメータのマッピング
 * @private
 */
function mapHSectionParams(dims) {
  return {
    overallDepth: dims.overall_depth || dims.H || getHeight(dims) || dims.A || 450.0,
    overallWidth: dims.overall_width || dims.B || getWidth(dims) || 200.0,
    webThickness: dims.web_thickness || dims.t1 || dims.tw || 9.0,
    flangeThickness: dims.flange_thickness || dims.t2 || dims.tf || 14.0,
    filletRadius: dims.fillet_radius || dims.r || 13.0,
  };
}

/**
 * 角形鋼管パラメータのマッピング
 * @private
 */
function mapBoxParams(dims) {
  return {
    width: getWidth(dims) || dims.outer_width || dims.B || 150.0,
    height: getHeight(dims) || dims.outer_height || dims.A || 150.0,
    wallThickness: dims.wall_thickness || getThickness(dims) || dims.t || 9.0,
  };
}

/**
 * 円形鋼管パラメータのマッピング
 * @private
 */
function mapPipeParams(dims) {
  return {
    outerDiameter: getDiameter(dims) || dims.outer_diameter || dims.A || 150.0,
    wallThickness: getThickness(dims) || dims.wall_thickness || dims.t || 6.0,
    segments: dims.segments || 32,
  };
}

/**
 * 矩形断面パラメータのマッピング
 * @private
 */
function mapRectangleParams(dims) {
  return {
    width: getWidth(dims) || 400.0,
    height: getHeight(dims) || 400.0,
  };
}

/**
 * 円形断面パラメータのマッピング
 * @private
 */
function mapCircleParams(dims) {
  const radius = getRadius(dims);
  const diameter = getDiameter(dims);

  return {
    radius: radius || (diameter ? diameter / 2 : 100.0),
    segments: dims.segments || 32,
  };
}

/**
 * C形鋼（溝形鋼）パラメータのマッピング
 * @private
 */
function mapChannelParams(dims) {
  return {
    overallDepth: dims.overall_depth || dims.H || getHeight(dims) || dims.A || 300.0,
    flangeWidth: dims.flange_width || dims.B || getWidth(dims) || 90.0,
    webThickness: dims.web_thickness || dims.t1 || dims.tw || 9.0,
    flangeThickness: dims.flange_thickness || dims.t2 || dims.tf || 13.0,
  };
}

/**
 * L形鋼（山形鋼）パラメータのマッピング
 * @private
 */
function mapLShapeParams(dims) {
  return {
    depth: dims.overall_depth || dims.depth || dims.A || 65.0,
    width: dims.flange_width || getWidth(dims) || dims.B || 65.0,
    thickness: dims.web_thickness || getThickness(dims) || dims.t || 6.0,
  };
}

/**
 * T形鋼パラメータのマッピング
 * @private
 */
function mapTShapeParams(dims) {
  return {
    overallDepth: dims.overall_depth || dims.H || getHeight(dims) || 200.0,
    flangeWidth: dims.flange_width || dims.B || getWidth(dims) || 150.0,
    webThickness: dims.web_thickness || dims.t1 || dims.tw || 8.0,
    flangeThickness: dims.flange_thickness || dims.t2 || dims.tf || 12.0,
  };
}

/**
 * クロスH形鋼パラメータのマッピング
 *
 * X方向・Y方向それぞれのH鋼寸法を calculateCrossHProfile に渡す形式に変換する。
 * dims には _X サフィックス付きの寸法（X方向H鋼）と _Y サフィックス付きの寸法（Y方向H鋼）を期待する。
 * @private
 */
function mapCrossHParams(dims) {
  // X方向H鋼（垂直腕）
  const overallDepthX = dims.overallDepthX || dims.H_x || dims.H || getHeight(dims) || 400.0;
  const overallWidthX = dims.overallWidthX || dims.B_x || dims.B || getWidth(dims) || 200.0;

  // Y方向H鋼（水平腕）— 省略時はX方向と同一（対称クロス）
  const overallDepthY = dims.overallDepthY || dims.H_y || overallDepthX;
  const overallWidthY = dims.overallWidthY || dims.B_y || overallWidthX;

  return { overallDepthX, overallWidthX, overallDepthY, overallWidthY };
}

/**
 * デフォルトパラメータを取得
 * @param {string} sectionType - 断面タイプ
 * @returns {Object} デフォルトパラメータ
 */
function getDefaultParams(sectionType) {
  const type = (sectionType || '').toUpperCase();

  switch (type) {
    case 'H':
    case 'I':
    case 'IBEAM':
    case 'H-SECTION':
      return { overallDepth: 450.0, overallWidth: 200.0, webThickness: 9.0, flangeThickness: 14.0 };

    case 'BOX':
    case 'BOX-SECTION':
      return { width: 150.0, height: 150.0, wallThickness: 9.0 };

    case 'PIPE':
    case 'PIPE-SECTION':
      return { outerDiameter: 150.0, wallThickness: 6.0, segments: 32 };

    case 'CIRCLE':
      return { radius: 100.0, segments: 32 };

    case 'C':
    case 'CHANNEL':
      return { overallDepth: 300.0, flangeWidth: 90.0, webThickness: 9.0, flangeThickness: 13.0 };

    case 'L':
    case 'L-SHAPE':
      return { depth: 65.0, width: 65.0, thickness: 6.0 };

    case 'T':
    case 'T-SHAPE':
      return { overallDepth: 200.0, flangeWidth: 150.0, webThickness: 8.0, flangeThickness: 12.0 };

    case 'CROSS_H':
      return { overallDepthX: 400.0, overallWidthX: 200.0, overallDepthY: 400.0, overallWidthY: 200.0 };

    default:
      return { width: 400.0, height: 400.0 };
  }
}

/**
 * 断面タイプからプロファイル計算関数名を取得
 *
 * @param {string} sectionType - 断面タイプ
 * @returns {string} ProfileCalculatorの関数に対応するタイプ名
 */
export function normalizeProfileType(sectionType) {
  const type = (sectionType || '').toUpperCase();

  // H形鋼
  if (['H', 'I', 'IBEAM', 'H-SECTION'].includes(type)) return 'H';

  // 角形鋼管
  if (['BOX', 'BOX-SECTION', 'SQUARE-SECTION'].includes(type)) return 'BOX';

  // 円形鋼管
  if (['PIPE', 'PIPE-SECTION', 'ROUND-SECTION'].includes(type)) return 'PIPE';

  // 矩形（RC）
  if (['RECTANGLE', 'RECT', 'RC-SECTION'].includes(type)) return 'RECTANGLE';

  // 円形（RC）
  if (type === 'CIRCLE') return 'CIRCLE';

  // C形鋼
  if (['C', 'CHANNEL', 'U-SHAPE'].includes(type)) return 'C';

  // L形鋼
  if (['L', 'L-SHAPE'].includes(type)) return 'L';

  // T形鋼
  if (['T', 'T-SHAPE'].includes(type)) return 'T';

  // クロスH形鋼
  if (type === 'CROSS_H') return 'CROSS_H';

  return 'RECTANGLE'; // デフォルト
}

/**
 * 寸法データから断面タイプを推定
 *
 * @param {Object} dimensions - 寸法データ
 * @param {string} hint - ヒント（profile_hint等）
 * @returns {string} 推定された断面タイプ
 */
export function inferSectionTypeFromDimensions(dimensions, hint) {
  if (!dimensions) return 'RECTANGLE';

  // ヒントが明示されている場合
  if (hint) {
    const h = hint.toUpperCase();
    if (h === 'H' || h.includes('H-')) return 'H';
    if (h === 'BOX' || h.includes('BOX')) return 'BOX';
    if (h === 'PIPE' || h.includes('PIPE')) return 'PIPE';
    if (h === 'CIRCLE') return 'CIRCLE';
    if (h === 'RECTANGLE' || h === 'RECT') return 'RECTANGLE';
  }

  // profile_hint から推定
  const profileHint = dimensions.profile_hint;
  if (profileHint) {
    const ph = profileHint.toUpperCase();
    if (ph === 'CROSS_H') return 'CROSS_H';
    if (ph === 'CIRCLE') return 'CIRCLE';
    if (ph === 'PIPE') return 'PIPE';
    if (ph === 'H') return 'H';
    if (ph === 'BOX') return 'BOX';
  }

  // 寸法属性から推定
  const hasDiameter = getDiameter(dimensions) !== undefined;
  const hasRadius = getRadius(dimensions) !== undefined;
  const hasWallThickness = dimensions.wall_thickness !== undefined || dimensions.t !== undefined;

  // 直径があって壁厚がある → PIPE
  if (hasDiameter && hasWallThickness) return 'PIPE';

  // 直径のみ → CIRCLE
  if (hasDiameter || hasRadius) return 'CIRCLE';

  // H形鋼属性がある
  if (dimensions.H && dimensions.B && (dimensions.t1 || dimensions.t2)) return 'H';

  // フランジ・ウェブがある
  if (dimensions.flange_thickness || dimensions.web_thickness) {
    if (dimensions.flange_width) return 'C';
    return 'H';
  }

  // デフォルトは矩形
  return 'RECTANGLE';
}

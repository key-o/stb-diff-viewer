/**
 * @fileoverview プロファイル計算レイヤー（Pure JavaScript、Three.js非依存）
 *
 * 断面パラメータから頂点座標を計算する純粋な関数群。
 * Three.jsに依存せず、単体テスト可能。
 *
 * @module ProfileCalculator
 */

import { resolveProfileType } from '../../../constants/profileTypeAliases.js';

/**
 * プロファイルデータ型定義
 * @typedef {Object} ProfileData
 * @property {Array<{x: number, y: number}>} vertices - 外形頂点座標配列
 * @property {Array<Array<{x: number, y: number}>>} holes - 穴の頂点座標配列（オプション）
 * @property {Object} [_meta] - メタデータ（円形などの特殊情報）
 */

/**
 * H形鋼プロファイルの頂点座標を計算
 *
 * パラメータは以下の形式を受け入れます:
 * - camelCase: overallDepth, overallWidth, webThickness, flangeThickness
 * - snake_case: overall_depth, overall_width, web_thickness, flange_thickness
 * - STB形式: A, B, t1, t2
 * - height/width形式: height, width
 *
 * @param {Object} params - H形鋼パラメータ
 * @returns {ProfileData} プロファイルデータ
 */
export function calculateHShapeProfile(params = {}) {
  const overallDepth =
    params.overallDepth || params.overall_depth || params.A || params.height || 450.0;
  const overallWidth =
    params.overallWidth || params.overall_width || params.B || params.width || 200.0;
  const webThickness = params.webThickness || params.web_thickness || params.t1 || 9.0;
  const flangeThickness = params.flangeThickness || params.flange_thickness || params.t2 || 14.0;

  const halfWidth = overallWidth / 2;
  const halfDepth = overallDepth / 2;
  const halfWeb = webThickness / 2;
  const innerDepth = halfDepth - flangeThickness;

  const vertices = [
    { x: -halfWidth, y: halfDepth },
    { x: halfWidth, y: halfDepth },
    { x: halfWidth, y: innerDepth },
    { x: halfWeb, y: innerDepth },
    { x: halfWeb, y: -innerDepth },
    { x: halfWidth, y: -innerDepth },
    { x: halfWidth, y: -halfDepth },
    { x: -halfWidth, y: -halfDepth },
    { x: -halfWidth, y: -innerDepth },
    { x: -halfWeb, y: -innerDepth },
    { x: -halfWeb, y: innerDepth },
    { x: -halfWidth, y: innerDepth },
  ];

  return { vertices, holes: [] };
}

/**
 * BOX形鋼（角形鋼管）プロファイルの頂点座標を計算
 *
 * @param {Object} params - BOX形鋼パラメータ
 * @returns {ProfileData} プロファイルデータ
 */
export function calculateBoxProfile(params = {}) {
  const width = params.width || params.outer_width || params.B || 150.0;
  const height = params.height || params.outer_height || params.A || 150.0;
  const wallThickness = params.wallThickness || params.wall_thickness || params.t || 9.0;

  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const innerHalfWidth = halfWidth - wallThickness;
  const innerHalfHeight = halfHeight - wallThickness;

  const vertices = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ];

  const holes = [];
  if (innerHalfWidth > 0 && innerHalfHeight > 0) {
    holes.push([
      { x: -innerHalfWidth, y: -innerHalfHeight },
      { x: innerHalfWidth, y: -innerHalfHeight },
      { x: innerHalfWidth, y: innerHalfHeight },
      { x: -innerHalfWidth, y: innerHalfHeight },
    ]);
  }

  return { vertices, holes };
}

/**
 * PIPE形鋼（円形鋼管）プロファイルの頂点座標を計算
 *
 * @param {Object} params - PIPE形鋼パラメータ
 * @returns {ProfileData} プロファイルデータ（円弧情報含む）
 */
export function calculatePipeProfile(params = {}) {
  const outerDiameter =
    params.outerDiameter || params.outer_diameter || params.diameter || params.D || 150.0;
  const wallThickness =
    params.wallThickness || params.wall_thickness || params.thickness || params.t || 6.0;
  const segments = params.segments || 32;

  const outerRadius = outerDiameter / 2;
  const innerRadius = Math.max(0, outerRadius - wallThickness);

  const vertices = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    vertices.push({
      x: Math.cos(angle) * outerRadius,
      y: Math.sin(angle) * outerRadius,
    });
  }

  const holes = [];
  if (innerRadius > 0) {
    const holeVertices = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      holeVertices.push({
        x: Math.cos(-angle) * innerRadius,
        y: Math.sin(-angle) * innerRadius,
      });
    }
    holes.push(holeVertices);
  }

  return {
    vertices,
    holes,
    _meta: {
      type: 'circular',
      outerRadius,
      innerRadius,
    },
  };
}

/**
 * 矩形プロファイルの頂点座標を計算
 *
 * @param {Object} params - 矩形パラメータ
 * @returns {ProfileData} プロファイルデータ
 */
export function calculateRectangleProfile(params = {}) {
  const width = params.width || params.B || 400.0;
  const height = params.height || params.A || 400.0;

  const halfWidth = width / 2;
  const halfHeight = height / 2;

  const vertices = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ];

  return { vertices, holes: [] };
}

/**
 * 円形プロファイルの頂点座標を計算
 *
 * @param {Object} params - 円形パラメータ
 * @returns {ProfileData} プロファイルデータ
 */
export function calculateCircleProfile(params = {}) {
  const diameter = params.diameter || params.D || 0;
  const radius = params.radius || params.R || (diameter > 0 ? diameter / 2 : 100.0);
  const segments = params.segments || 32;

  const vertices = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    vertices.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  }

  return {
    vertices,
    holes: [],
    _meta: {
      type: 'circular',
      radius,
    },
  };
}

/**
 * チャンネル形（C形鋼）プロファイルの頂点座標を計算
 *
 * @param {Object} params - チャンネル形パラメータ
 * @returns {ProfileData} プロファイルデータ
 */
export function calculateChannelProfile(params = {}) {
  const overallDepth =
    params.overallDepth || params.overall_depth || params.A || params.height || 300.0;
  const flangeWidth = params.flangeWidth || params.flange_width || params.B || params.width || 90.0;
  const webThickness = params.webThickness || params.web_thickness || params.t1 || 9.0;
  const flangeThickness = params.flangeThickness || params.flange_thickness || params.t2 || 13.0;

  const xLeft = -flangeWidth / 2;
  const xWebRight = xLeft + webThickness;
  const xRight = flangeWidth / 2;
  const yBot = -overallDepth / 2;
  const yTop = overallDepth / 2;

  const vertices = [
    { x: xLeft, y: yBot },
    { x: xRight, y: yBot },
    { x: xRight, y: yBot + flangeThickness },
    { x: xWebRight, y: yBot + flangeThickness },
    { x: xWebRight, y: yTop - flangeThickness },
    { x: xRight, y: yTop - flangeThickness },
    { x: xRight, y: yTop },
    { x: xLeft, y: yTop },
    { x: xLeft, y: yTop - flangeThickness },
    { x: xLeft, y: yBot + flangeThickness },
    { x: xLeft, y: yBot },
  ];

  return { vertices, holes: [] };
}

/**
 * L形鋼プロファイルの頂点座標を計算
 *
 * @param {Object} params - L形鋼パラメータ
 * @returns {ProfileData} プロファイルデータ
 */
export function calculateLShapeProfile(params = {}) {
  const depth = params.depth || params.A || params.leg1 || params.height || 65.0;
  const width = params.width || params.B || params.leg2 || 65.0;
  const thickness = params.thickness || params.t1 || params.t || 6.0;

  const vertices = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: thickness },
    { x: thickness, y: thickness },
    { x: thickness, y: depth },
    { x: 0, y: depth },
  ];

  return { vertices, holes: [] };
}

/**
 * T形鋼プロファイルの頂点座標を計算
 *
 * @param {Object} params - T形鋼パラメータ
 * @returns {ProfileData} プロファイルデータ
 */
export function calculateTShapeProfile(params = {}) {
  const overallDepth =
    params.overallDepth || params.overall_depth || params.A || params.height || 200.0;
  const flangeWidth =
    params.flangeWidth || params.flange_width || params.B || params.width || 150.0;
  const webThickness = params.webThickness || params.web_thickness || params.t1 || 8.0;
  const flangeThickness = params.flangeThickness || params.flange_thickness || params.t2 || 12.0;

  const halfFlangeWidth = flangeWidth / 2;
  const halfWebThickness = webThickness / 2;

  const vertices = [
    { x: -halfFlangeWidth, y: 0 },
    { x: halfFlangeWidth, y: 0 },
    { x: halfFlangeWidth, y: flangeThickness },
    { x: halfWebThickness, y: flangeThickness },
    { x: halfWebThickness, y: overallDepth },
    { x: -halfWebThickness, y: overallDepth },
    { x: -halfWebThickness, y: flangeThickness },
    { x: -halfFlangeWidth, y: flangeThickness },
  ];

  return { vertices, holes: [] };
}

/**
 * 2L背合わせ（BACKTOBACK）プロファイルの頂点座標を計算
 *
 * @param {Object} params - L形鋼パラメータ
 * @returns {ProfileData} プロファイルデータ
 */
export function calculate2LBackToBackProfile({
  depth = 65.0,
  width = 65.0,
  thickness = 6.0,
  gap = 0,
} = {}) {
  const halfGap = gap / 2;

  const outerVertices = [
    { x: -width, y: 0 },
    { x: width, y: 0 },
    { x: width, y: depth },
    { x: -width, y: depth },
  ];

  const hole = [
    { x: -thickness - halfGap, y: thickness },
    { x: thickness + halfGap, y: thickness },
    { x: thickness + halfGap, y: depth },
    { x: -thickness - halfGap, y: depth },
  ];

  return { vertices: outerVertices, holes: [hole] };
}

/**
 * 2L並び（FACETOFACE）プロファイルの頂点座標を計算
 *
 * @param {Object} params - L形鋼パラメータ
 * @returns {ProfileData} プロファイルデータ
 */
export function calculate2LFaceToFaceProfile({
  depth = 65.0,
  width = 65.0,
  thickness = 6.0,
  gap = 0,
} = {}) {
  const halfGap = gap / 2;
  const topOffset = depth + halfGap;
  const bottomOffset = -halfGap;

  const outerVertices = [
    { x: 0, y: bottomOffset - depth },
    { x: width, y: bottomOffset - depth },
    { x: width, y: bottomOffset },
    { x: thickness, y: bottomOffset },
    { x: thickness, y: bottomOffset - thickness },
    { x: 0, y: bottomOffset - thickness },
    { x: 0, y: bottomOffset - depth },
    { x: 0, y: topOffset - depth },
    { x: thickness, y: topOffset - depth },
    { x: thickness, y: topOffset - thickness },
    { x: width, y: topOffset - thickness },
    { x: width, y: topOffset },
    { x: 0, y: topOffset },
    { x: 0, y: topOffset - depth },
  ];

  return { vertices: outerVertices, holes: [] };
}

/**
 * 2C背合わせ（BACKTOBACK）プロファイルの頂点座標を計算
 *
 * @param {Object} params - チャンネル形パラメータ
 * @returns {ProfileData} プロファイルデータ
 */
export function calculate2CBackToBackProfile({
  overallDepth = 300.0,
  flangeWidth = 90.0,
  webThickness = 9.0,
  flangeThickness = 13.0,
  gap = 0,
} = {}) {
  const halfGap = gap / 2;
  const xLeftOuter = -flangeWidth;
  const xLeftInner = -webThickness / 2 - halfGap;
  const xRightInner = webThickness / 2 + halfGap;
  const xRightOuter = flangeWidth;
  const yBot = -overallDepth / 2;
  const yTop = overallDepth / 2;

  const vertices = [
    { x: xLeftOuter, y: yBot },
    { x: xRightOuter, y: yBot },
    { x: xRightOuter, y: yTop },
    { x: xLeftOuter, y: yTop },
  ];

  const leftHole = [
    { x: xLeftOuter + flangeThickness, y: yBot + flangeThickness },
    { x: xLeftInner, y: yBot + flangeThickness },
    { x: xLeftInner, y: yTop - flangeThickness },
    { x: xLeftOuter + flangeThickness, y: yTop - flangeThickness },
  ];

  const rightHole = [
    { x: xRightInner, y: yBot + flangeThickness },
    { x: xRightOuter - flangeThickness, y: yBot + flangeThickness },
    { x: xRightOuter - flangeThickness, y: yTop - flangeThickness },
    { x: xRightInner, y: yTop - flangeThickness },
  ];

  return { vertices, holes: [leftHole, rightHole] };
}

/**
 * 2C腹合わせ（FACETOFACE）プロファイルの頂点座標を計算
 *
 * @param {Object} params - チャンネル形パラメータ
 * @returns {ProfileData} プロファイルデータ
 */
export function calculate2CFaceToFaceProfile({
  overallDepth = 300.0,
  flangeWidth = 90.0,
  webThickness = 9.0,
  flangeThickness = 13.0,
  gap = 0,
} = {}) {
  const halfGap = gap / 2;
  const xLeft = -flangeWidth / 2;
  const xWebLeft = xLeft + webThickness;
  const xRight = flangeWidth / 2;
  const yBotOuter = -overallDepth - halfGap;
  const yBotInner = -halfGap;
  const yTopInner = halfGap;
  const yTopOuter = overallDepth + halfGap;

  const vertices = [
    { x: xLeft, y: yBotOuter },
    { x: xRight, y: yBotOuter },
    { x: xRight, y: yTopOuter },
    { x: xLeft, y: yTopOuter },
  ];

  const hole = [
    { x: xWebLeft, y: yBotInner - flangeThickness },
    { x: xRight, y: yBotInner - flangeThickness },
    { x: xRight, y: yTopInner + flangeThickness },
    { x: xWebLeft, y: yTopInner + flangeThickness },
  ];

  return { vertices, holes: [hole] };
}

/**
 * 十字形プロファイルの頂点座標を計算
 *
 * @param {Object} params - 十字形パラメータ
 * @returns {ProfileData} プロファイルデータ
 */
export function calculateCrossProfile(params = {}) {
  const width = params.width || params.B || 200.0;
  const height = params.height || params.A || 200.0;
  const thickness = params.thickness || params.t || 12.0;

  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const halfThickness = thickness / 2;

  const vertices = [
    { x: -halfThickness, y: halfHeight },
    { x: halfThickness, y: halfHeight },
    { x: halfThickness, y: halfThickness },
    { x: halfWidth, y: halfThickness },
    { x: halfWidth, y: -halfThickness },
    { x: halfThickness, y: -halfThickness },
    { x: halfThickness, y: -halfHeight },
    { x: -halfThickness, y: -halfHeight },
    { x: -halfThickness, y: -halfThickness },
    { x: -halfWidth, y: -halfThickness },
    { x: -halfWidth, y: halfThickness },
    { x: -halfThickness, y: halfThickness },
  ];

  return { vertices, holes: [] };
}

/**
 * クロスH形鋼プロファイルの頂点座標を計算
 *
 * 2本のH形鋼を直交させたSRC造柱用の十字形断面。
 * X方向H鋼が垂直腕を、Y方向H鋼が水平腕を形成する。
 *
 * @param {Object} params - パラメータ
 * @param {number} params.overallDepthX  - X方向H鋼のせい（垂直全高）[mm]
 * @param {number} params.overallWidthX  - X方向H鋼のフランジ幅（垂直腕の幅）[mm]
 * @param {number} params.overallDepthY  - Y方向H鋼のせい（水平全幅）[mm]
 * @param {number} params.overallWidthY  - Y方向H鋼のフランジ幅（水平腕の高さ）[mm]
 * @returns {ProfileData} プロファイルデータ（12頂点の十字形）
 */
export function calculateCrossHProfile(params = {}) {
  // X方向H鋼: 垂直腕の寸法を決定
  const overallDepthX = params.overallDepthX || params.H_x || params.H || params.height || 400.0;
  const overallWidthX = params.overallWidthX || params.B_x || params.B || 200.0;

  // Y方向H鋼: 水平腕の寸法を決定（省略時はX方向と同一 = 対称クロス）
  const overallDepthY = params.overallDepthY || params.H_y || overallDepthX;
  const overallWidthY = params.overallWidthY || params.B_y || overallWidthX;

  const halfDepthX = overallDepthX / 2; // 垂直腕の半高さ
  const halfWidthX = overallWidthX / 2; // 垂直腕の半幅（= フランジ幅/2 of X H）
  const halfDepthY = overallDepthY / 2; // 水平腕の半全幅
  const halfWidthY = overallWidthY / 2; // 水平腕の半高さ（= フランジ幅/2 of Y H）

  // 12頂点の十字形断面（反時計回り）
  const vertices = [
    { x: -halfWidthX, y: halfDepthX }, // 垂直腕: 左上
    { x: halfWidthX, y: halfDepthX }, // 垂直腕: 右上
    { x: halfWidthX, y: halfWidthY }, // 内角: 右上
    { x: halfDepthY, y: halfWidthY }, // 水平腕: 右上
    { x: halfDepthY, y: -halfWidthY }, // 水平腕: 右下
    { x: halfWidthX, y: -halfWidthY }, // 内角: 右下
    { x: halfWidthX, y: -halfDepthX }, // 垂直腕: 右下
    { x: -halfWidthX, y: -halfDepthX }, // 垂直腕: 左下
    { x: -halfWidthX, y: -halfWidthY }, // 内角: 左下
    { x: -halfDepthY, y: -halfWidthY }, // 水平腕: 左下
    { x: -halfDepthY, y: halfWidthY }, // 水平腕: 左上
    { x: -halfWidthX, y: halfWidthY }, // 内角: 左上
  ];

  return { vertices, holes: [] };
}

/**
 * フラットバープロファイルの頂点座標を計算
 *
 * @param {Object} params - フラットバーパラメータ
 * @returns {ProfileData} プロファイルデータ
 */
export function calculateFlatProfile(params = {}) {
  const width = params.width || params.B || 100.0;
  const thickness = params.thickness || params.t || 12.0;

  const halfWidth = width / 2;
  const halfThickness = thickness / 2;

  const vertices = [
    { x: -halfWidth, y: -halfThickness },
    { x: halfWidth, y: -halfThickness },
    { x: halfWidth, y: halfThickness },
    { x: -halfWidth, y: halfThickness },
  ];

  return { vertices, holes: [] };
}

/**
 * 正規化タイプから計算関数へのマッピング
 * @type {Record<string, Function>}
 */
const CALCULATOR_MAP = {
  'H': calculateHShapeProfile,
  'BOX': calculateBoxProfile,
  'PIPE': calculatePipeProfile,
  'RECTANGLE': calculateRectangleProfile,
  'CIRCLE': calculateCircleProfile,
  'C': calculateChannelProfile,
  'L': calculateLShapeProfile,
  'T': calculateTShapeProfile,
  '2L-BB': calculate2LBackToBackProfile,
  '2L-FF': calculate2LFaceToFaceProfile,
  '2C-BB': calculate2CBackToBackProfile,
  '2C-FF': calculate2CFaceToFaceProfile,
  'CROSS': calculateCrossProfile,
  'CROSS_H': calculateCrossHProfile,
  'FB': calculateFlatProfile,
};

/**
 * プロファイルタイプとパラメータから適切な計算関数を選択
 *
 * @param {string} profileType - プロファイルタイプ
 * @param {Object} params - 断面パラメータ
 * @returns {ProfileData} プロファイルデータ
 */
export function calculateProfile(profileType, params) {
  const canonical = resolveProfileType(profileType);
  const calculator = canonical ? CALCULATOR_MAP[canonical] : null;

  if (!calculator) {
    console.warn(`Unsupported profile type: ${profileType}, using rectangle`);
    return calculateRectangleProfile(params);
  }

  return calculator(params);
}

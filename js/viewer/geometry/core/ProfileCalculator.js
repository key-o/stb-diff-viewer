/**
 * @fileoverview プロファイル計算レイヤー（Pure JavaScript、Three.js非依存）
 *
 * 断面パラメータから頂点座標を計算する純粋な関数群。
 * Three.jsに依存せず、単体テスト可能。
 *
 * @module ProfileCalculator
 */

/**
 * プロファイルデータ型定義
 * @typedef {Object} ProfileData
 * @property {Array<{x: number, y: number}>} vertices - 外形頂点座標配列
 * @property {Array<Array<{x: number, y: number}>>} holes - 穴の頂点座標配列（オプション）
 */

/**
 * H形鋼プロファイルの頂点座標を計算
 *
 * @param {Object} params - H形鋼パラメータ
 * @param {number} params.overallDepth - 全高（A寸法）
 * @param {number} params.overallWidth - 全幅（B寸法）
 * @param {number} params.webThickness - ウェブ厚（t1）
 * @param {number} params.flangeThickness - フランジ厚（t2）
 * @returns {ProfileData} プロファイルデータ
 */
export function calculateHShapeProfile({
  overallDepth = 450.0,
  overallWidth = 200.0,
  webThickness = 9.0,
  flangeThickness = 14.0
} = {}) {
  const halfWidth = overallWidth / 2;
  const halfDepth = overallDepth / 2;
  const halfWeb = webThickness / 2;

  const innerDepth = halfDepth - flangeThickness;

  // H形状の頂点座標（IFC仕様準拠：中心を原点とする、上から時計回り）
  const vertices = [
    { x: -halfWidth, y: halfDepth },        // Top-left
    { x: halfWidth, y: halfDepth },         // Top-right
    { x: halfWidth, y: innerDepth },        // Top flange inner-right
    { x: halfWeb, y: innerDepth },          // Web top-right
    { x: halfWeb, y: -innerDepth },         // Web bottom-right
    { x: halfWidth, y: -innerDepth },       // Bottom flange inner-right
    { x: halfWidth, y: -halfDepth },        // Bottom-right
    { x: -halfWidth, y: -halfDepth },       // Bottom-left
    { x: -halfWidth, y: -innerDepth },      // Bottom flange inner-left
    { x: -halfWeb, y: -innerDepth },        // Web bottom-left
    { x: -halfWeb, y: innerDepth },         // Web top-left
    { x: -halfWidth, y: innerDepth }       // Top flange inner-left
  ];

  return { vertices, holes: [] };
}

/**
 * BOX形鋼（角形鋼管）プロファイルの頂点座標を計算
 *
 * @param {Object} params - BOX形鋼パラメータ
 * @param {number} params.width - 幅
 * @param {number} params.height - 高さ
 * @param {number} params.wallThickness - 板厚
 * @returns {ProfileData} プロファイルデータ
 */
export function calculateBoxProfile({
  width = 150.0,
  height = 150.0,
  wallThickness = 9.0
} = {}) {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const innerHalfWidth = halfWidth - wallThickness;
  const innerHalfHeight = halfHeight - wallThickness;

  // 外形（時計回り）
  const vertices = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight }
  ];

  // 内部の穴（反時計回り）
  const holes = [];
  if (innerHalfWidth > 0 && innerHalfHeight > 0) {
    holes.push([
      { x: -innerHalfWidth, y: -innerHalfHeight },
      { x: innerHalfWidth, y: -innerHalfHeight },
      { x: innerHalfWidth, y: innerHalfHeight },
      { x: -innerHalfWidth, y: innerHalfHeight }
    ]);
  }

  return { vertices, holes };
}

/**
 * PIPE形鋼（円形鋼管）プロファイルの頂点座標を計算
 *
 * @param {Object} params - PIPE形鋼パラメータ
 * @param {number} params.outerDiameter - 外径
 * @param {number} params.wallThickness - 板厚
 * @param {number} params.segments - 分割数（デフォルト: 32）
 * @returns {ProfileData} プロファイルデータ（円弧情報含む）
 */
export function calculatePipeProfile({
  outerDiameter = 150.0,
  wallThickness = 6.0,
  segments = 32
} = {}) {
  const outerRadius = outerDiameter / 2;
  const innerRadius = Math.max(0, outerRadius - wallThickness);

  // 外形円（時計回り）
  const vertices = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    vertices.push({
      x: Math.cos(angle) * outerRadius,
      y: Math.sin(angle) * outerRadius
    });
  }

  // 内部円の穴（反時計回り）
  const holes = [];
  if (innerRadius > 0) {
    const holeVertices = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      holeVertices.push({
        x: Math.cos(-angle) * innerRadius,
        y: Math.sin(-angle) * innerRadius
      });
    }
    holes.push(holeVertices);
  }

  return {
    vertices,
    holes,
    // 円弧メタデータ（Three.js変換時に使用）
    _meta: {
      type: 'circular',
      outerRadius,
      innerRadius
    }
  };
}

/**
 * 矩形プロファイルの頂点座標を計算
 *
 * @param {Object} params - 矩形パラメータ
 * @param {number} params.width - 幅
 * @param {number} params.height - 高さ
 * @returns {ProfileData} プロファイルデータ
 */
export function calculateRectangleProfile({
  width = 400.0,
  height = 400.0
} = {}) {
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  const vertices = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight }
  ];

  return { vertices, holes: [] };
}

/**
 * 円形プロファイルの頂点座標を計算
 *
 * @param {Object} params - 円形パラメータ
 * @param {number} params.radius - 半径
 * @param {number} params.segments - 分割数（デフォルト: 32）
 * @returns {ProfileData} プロファイルデータ
 */
export function calculateCircleProfile({
  radius = 100.0,
  segments = 32
} = {}) {
  const vertices = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    vertices.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius
    });
  }

  return {
    vertices,
    holes: [],
    _meta: {
      type: 'circular',
      radius
    }
  };
}

/**
 * チャンネル形（C形鋼）プロファイルの頂点座標を計算
 *
 * @param {Object} params - チャンネル形パラメータ
 * @param {number} params.overallDepth - 全高
 * @param {number} params.flangeWidth - フランジ幅
 * @param {number} params.webThickness - ウェブ厚
 * @param {number} params.flangeThickness - フランジ厚
 * @returns {ProfileData} プロファイルデータ
 */
export function calculateChannelProfile({
  overallDepth = 300.0,
  flangeWidth = 90.0,
  webThickness = 9.0,
  flangeThickness = 13.0
} = {}) {
  // IFC U-Shape仕様準拠: 開口部を左側に配置、中心を原点とする
  const xLeft = -flangeWidth / 2;        // 外側左端（開口部側）
  const xWebRight = xLeft + webThickness; // ウェブ内側右端
  const xRight = flangeWidth / 2;         // 外側右端（フランジ側）
  const yBot = -overallDepth / 2;
  const yTop = overallDepth / 2;

  // U字形状の頂点座標（IFC準拠、反時計回り）
  const vertices = [
    { x: xLeft, y: yBot },                        // bottom-left outer
    { x: xRight, y: yBot },                       // bottom-right outer
    { x: xRight, y: yBot + flangeThickness },     // inner step up at bottom flange
    { x: xWebRight, y: yBot + flangeThickness },  // move to web inner edge
    { x: xWebRight, y: yTop - flangeThickness },  // up along web
    { x: xRight, y: yTop - flangeThickness },     // inner step at top flange
    { x: xRight, y: yTop },                       // top-right outer
    { x: xLeft, y: yTop },                        // top-left outer
    { x: xLeft, y: yTop - flangeThickness },      // down along left outer edge (no flange on open side)
    { x: xLeft, y: yBot + flangeThickness },      // continue down
    { x: xLeft, y: yBot }                        // close at bottom-left
  ];

  return { vertices, holes: [] };
}

/**
 * L形鋼プロファイルの頂点座標を計算
 *
 * @param {Object} params - L形鋼パラメータ
 * @param {number} params.depth - 高さ
 * @param {number} params.width - 幅
 * @param {number} params.thickness - 厚さ
 * @returns {ProfileData} プロファイルデータ
 */
export function calculateLShapeProfile({
  depth = 65.0,
  width = 65.0,
  thickness = 6.0
} = {}) {
  // L字形状（原点を左下角として、右方向にwidth、上方向にdepth）
  const vertices = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: thickness },
    { x: thickness, y: thickness },
    { x: thickness, y: depth },
    { x: 0, y: depth }
  ];

  return { vertices, holes: [] };
}

/**
 * T形鋼プロファイルの頂点座標を計算
 *
 * @param {Object} params - T形鋼パラメータ
 * @param {number} params.overallDepth - 全高
 * @param {number} params.flangeWidth - フランジ幅
 * @param {number} params.webThickness - ウェブ厚
 * @param {number} params.flangeThickness - フランジ厚
 * @returns {ProfileData} プロファイルデータ
 */
export function calculateTShapeProfile({
  overallDepth = 200.0,
  flangeWidth = 150.0,
  webThickness = 8.0,
  flangeThickness = 12.0
} = {}) {
  const halfFlangeWidth = flangeWidth / 2;
  const halfWebThickness = webThickness / 2;

  // T字形状（中心を原点とする）
  const vertices = [
    { x: -halfFlangeWidth, y: 0 },
    { x: halfFlangeWidth, y: 0 },
    { x: halfFlangeWidth, y: flangeThickness },
    { x: halfWebThickness, y: flangeThickness },
    { x: halfWebThickness, y: overallDepth },
    { x: -halfWebThickness, y: overallDepth },
    { x: -halfWebThickness, y: flangeThickness },
    { x: -halfFlangeWidth, y: flangeThickness }
  ];

  return { vertices, holes: [] };
}

/**
 * 2L背合わせ（BACKTOBACK）プロファイルの頂点座標を計算
 *
 * @param {Object} params - L形鋼パラメータ
 * @param {number} params.depth - 高さ
 * @param {number} params.width - 幅
 * @param {number} params.thickness - 厚さ
 * @param {number} [params.gap=0] - 2本のL形鋼の間隔（デフォルト: 0mm）
 * @returns {ProfileData} プロファイルデータ
 */
export function calculate2LBackToBackProfile({
  depth = 65.0,
  width = 65.0,
  thickness = 6.0,
  gap = 0
} = {}) {
  // 左側のL形（反転）
  const halfGap = gap / 2;
  const vertices = [
    // 左側のL形（背を中心に向けて配置）
    { x: -width, y: 0 },
    { x: -thickness - halfGap, y: 0 },
    { x: -thickness - halfGap, y: thickness },
    { x: -width, y: thickness },
    { x: -width, y: depth },
    { x: -thickness - halfGap, y: depth },
    { x: -thickness - halfGap, y: thickness },
    // 右側のL形（通常配置）
    { x: thickness + halfGap, y: thickness },
    { x: thickness + halfGap, y: depth },
    { x: width, y: depth },
    { x: width, y: thickness },
    { x: thickness + halfGap, y: thickness },
    { x: thickness + halfGap, y: 0 },
    { x: width, y: 0 },
    { x: width, y: thickness },
    { x: thickness + halfGap, y: thickness },
    { x: thickness + halfGap, y: 0 },
    { x: -thickness - halfGap, y: 0 }
  ];

  // 2つの独立した領域として定義（外周と穴）
  // 外周: 全体のバウンディングボックス
  const outerVertices = [
    { x: -width, y: 0 },
    { x: width, y: 0 },
    { x: width, y: depth },
    { x: -width, y: depth }
  ];

  // 穴: 中央の空洞部分
  const hole = [
    { x: -thickness - halfGap, y: thickness },
    { x: thickness + halfGap, y: thickness },
    { x: thickness + halfGap, y: depth },
    { x: -thickness - halfGap, y: depth }
  ];

  return { vertices: outerVertices, holes: [hole] };
}

/**
 * 2L並び（FACETOFACE）プロファイルの頂点座標を計算
 *
 * @param {Object} params - L形鋼パラメータ
 * @param {number} params.depth - 高さ
 * @param {number} params.width - 幅
 * @param {number} params.thickness - 厚さ
 * @param {number} [params.gap=0] - 2本のL形鋼の間隔（デフォルト: 0mm）
 * @returns {ProfileData} プロファイルデータ
 */
export function calculate2LFaceToFaceProfile({
  depth = 65.0,
  width = 65.0,
  thickness = 6.0,
  gap = 0
} = {}) {
  // 上側のL形と下側のL形を配置
  const halfGap = gap / 2;
  const topOffset = depth + halfGap;
  const bottomOffset = -halfGap;

  // 2つのL形を上下に配置
  const outerVertices = [
    // 下側のL形
    { x: 0, y: bottomOffset - depth },
    { x: width, y: bottomOffset - depth },
    { x: width, y: bottomOffset },
    { x: thickness, y: bottomOffset },
    { x: thickness, y: bottomOffset - thickness },
    { x: 0, y: bottomOffset - thickness },
    { x: 0, y: bottomOffset - depth },
    // 上側のL形
    { x: 0, y: topOffset - depth },
    { x: thickness, y: topOffset - depth },
    { x: thickness, y: topOffset - thickness },
    { x: width, y: topOffset - thickness },
    { x: width, y: topOffset },
    { x: 0, y: topOffset },
    { x: 0, y: topOffset - depth }
  ];

  // 簡略化: 2つの独立した形状として返す
  return { vertices: outerVertices, holes: [] };
}

/**
 * 2C背合わせ（BACKTOBACK）プロファイルの頂点座標を計算
 *
 * @param {Object} params - チャンネル形パラメータ
 * @param {number} params.overallDepth - 全高
 * @param {number} params.flangeWidth - フランジ幅
 * @param {number} params.webThickness - ウェブ厚
 * @param {number} params.flangeThickness - フランジ厚
 * @param {number} [params.gap=0] - 2本のC形鋼の間隔（デフォルト: 0mm）
 * @returns {ProfileData} プロファイルデータ
 */
export function calculate2CBackToBackProfile({
  overallDepth = 300.0,
  flangeWidth = 90.0,
  webThickness = 9.0,
  flangeThickness = 13.0,
  gap = 0
} = {}) {
  const halfGap = gap / 2;
  const xLeftOuter = -flangeWidth;
  const xLeftInner = -webThickness / 2 - halfGap;
  const xRightInner = webThickness / 2 + halfGap;
  const xRightOuter = flangeWidth;
  const yBot = -overallDepth / 2;
  const yTop = overallDepth / 2;

  // BOX形状に近い構成（中央にウェブが2本並ぶ）
  const vertices = [
    // 外周
    { x: xLeftOuter, y: yBot },
    { x: xRightOuter, y: yBot },
    { x: xRightOuter, y: yTop },
    { x: xLeftOuter, y: yTop }
  ];

  // 内側の穴（フランジとウェブの間の空洞）
  const leftHole = [
    { x: xLeftOuter + flangeThickness, y: yBot + flangeThickness },
    { x: xLeftInner, y: yBot + flangeThickness },
    { x: xLeftInner, y: yTop - flangeThickness },
    { x: xLeftOuter + flangeThickness, y: yTop - flangeThickness }
  ];

  const rightHole = [
    { x: xRightInner, y: yBot + flangeThickness },
    { x: xRightOuter - flangeThickness, y: yBot + flangeThickness },
    { x: xRightOuter - flangeThickness, y: yTop - flangeThickness },
    { x: xRightInner, y: yTop - flangeThickness }
  ];

  return { vertices, holes: [leftHole, rightHole] };
}

/**
 * 2C腹合わせ（FACETOFACE）プロファイルの頂点座標を計算
 *
 * @param {Object} params - チャンネル形パラメータ
 * @param {number} params.overallDepth - 全高
 * @param {number} params.flangeWidth - フランジ幅
 * @param {number} params.webThickness - ウェブ厚
 * @param {number} params.flangeThickness - フランジ厚
 * @param {number} [params.gap=0] - 2本のC形鋼の間隔（デフォルト: 0mm）
 * @returns {ProfileData} プロファイルデータ
 */
export function calculate2CFaceToFaceProfile({
  overallDepth = 300.0,
  flangeWidth = 90.0,
  webThickness = 9.0,
  flangeThickness = 13.0,
  gap = 0
} = {}) {
  const halfGap = gap / 2;
  const xLeft = -flangeWidth / 2;
  const xWebLeft = xLeft + webThickness;
  const xRight = flangeWidth / 2;
  const yBotOuter = -overallDepth - halfGap;
  const yBotInner = -halfGap;
  const yTopInner = halfGap;
  const yTopOuter = overallDepth + halfGap;

  // I形に近い構成（開口部が向き合う）
  const vertices = [
    // 外周
    { x: xLeft, y: yBotOuter },
    { x: xRight, y: yBotOuter },
    { x: xRight, y: yTopOuter },
    { x: xLeft, y: yTopOuter }
  ];

  // 中央の穴（開口部が向き合う空洞）
  const hole = [
    { x: xWebLeft, y: yBotInner - flangeThickness },
    { x: xRight, y: yBotInner - flangeThickness },
    { x: xRight, y: yTopInner + flangeThickness },
    { x: xWebLeft, y: yTopInner + flangeThickness }
  ];

  return { vertices, holes: [hole] };
}

/**
 * プロファイルタイプとパラメータから適切な計算関数を選択
 *
 * @param {string} profileType - プロファイルタイプ ('H', 'BOX', 'PIPE', 'RECTANGLE', 'CIRCLE', 'C', 'L', 'T')
 * @param {Object} params - 断面パラメータ
 * @returns {ProfileData} プロファイルデータ
 */
export function calculateProfile(profileType, params) {
  const type = profileType.toUpperCase();

  switch (type) {
    case 'H':
    case 'I':
    case 'IBEAM':
    case 'H-SECTION':
      return calculateHShapeProfile(params);

    case 'BOX':
    case 'BOX-SECTION':
    case 'SQUARE-SECTION':
      return calculateBoxProfile(params);

    case 'PIPE':
    case 'PIPE-SECTION':
    case 'ROUND-SECTION':
      return calculatePipeProfile(params);

    case 'RECTANGLE':
    case 'RECT':
    case 'RC-SECTION':
      return calculateRectangleProfile(params);

    case 'CIRCLE':
      return calculateCircleProfile(params);

    case 'C':
    case 'CHANNEL':
    case 'U-SHAPE':
      return calculateChannelProfile(params);

    case 'L':
    case 'L-SHAPE':
      return calculateLShapeProfile(params);

    case 'T':
    case 'T-SHAPE':
      return calculateTShapeProfile(params);

    default:
      console.warn(
        `Unsupported profile type: ${profileType}, using rectangle`
      );
      return calculateRectangleProfile(params);
  }
}

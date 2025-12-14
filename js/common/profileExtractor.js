/**
 * @fileoverview 断面プロファイル抽出・変換ユーティリティ
 *
 * STB断面情報からプロファイルデータを抽出し、IFC出力およびThree.js
 * ジオメトリ生成の両方で使用できる統一形式に変換する共有モジュール。
 *
 * 主な機能:
 * - STB断面情報からの統一プロファイル抽出 (extractProfileFromSection)
 * - IFCプロファイルタイプへのマッピング (mapToIFCProfileType)
 * - ProfileCalculator用パラメータ変換 (mapToCalculatorParams)
 * - 形状名/タイプからのプロファイルタイプ推定
 *
 * @module profileExtractor
 */

/**
 * IFC標準プロファイルタイプ定数
 * @enum {string}
 */
export const IFC_PROFILE_TYPES = {
  I_SHAPE: 'IfcIShapeProfileDef',
  RECTANGLE: 'IfcRectangleProfileDef',
  CIRCLE: 'IfcCircleProfileDef',
  HOLLOW_RECTANGLE: 'IfcRectangleHollowProfileDef',
  CIRCULAR_HOLLOW: 'IfcCircularHollowProfileDef',
  L_SHAPE: 'IfcLShapeProfileDef',
  T_SHAPE: 'IfcTShapeProfileDef',
  U_SHAPE: 'IfcUShapeProfileDef',
  C_SHAPE: 'IfcCShapeProfileDef',
  ARBITRARY_CLOSED: 'IfcArbitraryClosedProfileDef'
};

/**
 * 値を数値に変換するヘルパー関数
 * @param {*} value - 変換する値
 * @param {number} defaultValue - デフォルト値
 * @returns {number} 数値化された値
 */
export function toNumber(value, defaultValue) {
  if (value === null || value === undefined) return defaultValue;
  const num = parseFloat(value);
  // num >= 0 で0も有効な値として扱う（例：フィレット半径が0の場合）
  return isFinite(num) && num >= 0 ? num : defaultValue;
}

/**
 * 断面情報からプロファイルデータを抽出
 * @param {Object} section - 断面情報
 * @param {Map} steelSections - 鋼材断面マップ
 * @returns {Object} プロファイルデータ {type, params}
 */
export function extractProfileFromSection(section, steelSections) {
  // デフォルトプロファイル
  const defaultProfile = {
    type: 'RECTANGLE',
    params: { width: 300, height: 600 }
  };

  if (!section) return defaultProfile;

  const dims = section.dimensions || {};

  // 鋼材形状名から寸法を取得（profile_hint判定の前に実行）
  if (section.shapeName && steelSections) {
    const steelShape = steelSections.get(section.shapeName);
    if (steelShape) {
      Object.assign(dims, steelShape);
    }
  }

  // profile_hintが設定されていない場合、shapeName または steelShape.type から推定
  if (!dims.profile_hint && section.shapeName) {
    dims.profile_hint = inferProfileHintFromShapeName(section.shapeName);
  }
  if (!dims.profile_hint && dims.type) {
    // steelSectionsのtype属性からも推定可能（H, BCR, BCP, STK等）
    dims.profile_hint = inferProfileHintFromType(dims.type);
  }
  // extractSteelSections が設定した kind_struct を優先的に使用
  // (shapeName から推定できない場合のフォールバック)
  if (!dims.profile_hint && dims.kind_struct) {
    dims.profile_hint = dims.kind_struct;
  }
  // shapeTypeAttr からも推定（BCR, BCP, STK 等）
  if (!dims.profile_hint && dims.shapeTypeAttr) {
    dims.profile_hint = inferProfileHintFromType(dims.shapeTypeAttr);
  }

  // profile_hint（BOX、PIPE等）を優先、なければsection_typeを使用
  const sectionType = dims.profile_hint || section.section_type || section.sectionType || 'RECTANGLE';

  switch (sectionType.toUpperCase()) {
    case 'H':
    case 'I':
      return {
        type: 'H',
        params: {
          overallDepth: toNumber(dims.A, toNumber(dims.height, toNumber(dims.H, 400))),
          overallWidth: toNumber(dims.B, toNumber(dims.width, 200)),
          webThickness: toNumber(dims.t1, toNumber(dims.tw, 8)),
          flangeThickness: toNumber(dims.t2, toNumber(dims.tf, 13))
        }
      };
    case 'BOX':
      // StbSecRoll-BOX: t属性, StbSecBuild-BOX: t1/t2属性
      return {
        type: 'BOX',
        params: {
          width: toNumber(dims.B, toNumber(dims.width, 200)),
          height: toNumber(dims.A, toNumber(dims.height, 200)),
          wallThickness: toNumber(dims.t, toNumber(dims.t1, toNumber(dims.thickness, 9))),
          // フィレット半径（角丸半径）
          outerFilletRadius: toNumber(dims.r, null)
        }
      };
    case 'PIPE':
      return {
        type: 'PIPE',
        params: {
          diameter: toNumber(dims.D, toNumber(dims.diameter, 200)),
          wallThickness: toNumber(dims.t, toNumber(dims.thickness, 6))
        }
      };
    case 'L':
      return {
        type: 'L',
        params: {
          depth: toNumber(dims.A, toNumber(dims.height, 100)),
          width: toNumber(dims.B, toNumber(dims.width, 100)),
          // L形鋼はt1/t2（等辺の場合同じ値）またはtを使用
          thickness: toNumber(dims.t, toNumber(dims.t1, toNumber(dims.thickness, 7)))
        }
      };
    case 'C':
    case 'U':
      return {
        type: 'C',
        params: {
          depth: toNumber(dims.A, toNumber(dims.height, 200)),
          flangeWidth: toNumber(dims.B, toNumber(dims.width, 80)),
          webThickness: toNumber(dims.t1, toNumber(dims.tw, 7.5)),
          flangeThickness: toNumber(dims.t2, toNumber(dims.tf, 11)),
          filletRadius: toNumber(dims.r, 0)
        }
      };
    case 'FB':
      return {
        type: 'FB',
        params: {
          width: toNumber(dims.A, toNumber(dims.width, 100)),
          thickness: toNumber(dims.t, toNumber(dims.thickness, 9))
        }
      };
    case 'CIRCLE':
      return {
        type: 'CIRCLE',
        params: {
          diameter: toNumber(dims.D, toNumber(dims.diameter, dims.radius ? parseFloat(dims.radius) * 2 : 60))
        }
      };
    case 'T':
      return {
        type: 'T',
        params: {
          depth: toNumber(dims.A, toNumber(dims.H, toNumber(dims.height, 200))),
          flangeWidth: toNumber(dims.B, toNumber(dims.width, 150)),
          webThickness: toNumber(dims.t1, toNumber(dims.tw, 8)),
          flangeThickness: toNumber(dims.t2, toNumber(dims.tf, 12)),
          filletRadius: toNumber(dims.r, 0)
        }
      };
    case 'stb-diff-viewer':
      // stb-diff-viewerは外形コンクリート寸法で出力（IFCBeamExporterで矩形に変換）
      return {
        type: 'stb-diff-viewer',
        params: {
          width: toNumber(dims.width, toNumber(dims.width_X, toNumber(dims.B, 800))),
          height: toNumber(dims.height, toNumber(dims.width_Y, toNumber(dims.A, 800)))
        }
      };
    case 'CFT':
      // CFTは充填鋼管として出力（IFCBeamExporterで角形鋼管に変換）
      // StbSecRoll-BOX: t属性, StbSecBuild-BOX: t1/t2属性
      return {
        type: 'CFT',
        params: {
          width: toNumber(dims.B, toNumber(dims.width, 200)),
          height: toNumber(dims.A, toNumber(dims.height, 200)),
          wallThickness: toNumber(dims.t, toNumber(dims.t1, toNumber(dims.thickness, 9)))
        }
      };
    case 'RECTANGLE':
    case 'RC':
    default:
      return {
        type: 'RECTANGLE',
        params: {
          width: toNumber(dims.width, toNumber(dims.B, toNumber(dims.width_X, 300))),
          height: toNumber(dims.height, toNumber(dims.D, toNumber(dims.width_Y, 600)))
        }
      };
  }
}

/**
 * 形状名からプロファイルタイプを推定
 * @param {string} shapeName - 形状名 (例: "□-400x400x22x66", "H-250x250x9x14x13")
 * @returns {string|null} プロファイルタイプ
 */
export function inferProfileHintFromShapeName(shapeName) {
  if (!shapeName) return null;
  const upper = shapeName.toUpperCase();

  // BOX/角形鋼管
  if (upper.includes('□') || upper.includes('BOX') || upper.includes('BCP') || upper.includes('BCR')) {
    return 'BOX';
  }
  // H形鋼
  if (upper.startsWith('H-') || upper.startsWith('H ') || /^H\d/.test(upper)) {
    return 'H';
  }
  // 円形鋼管
  if (upper.includes('○') || upper.includes('PIPE') || upper.includes('STK') || upper.startsWith('P-')) {
    return 'PIPE';
  }
  // L形鋼
  if (upper.startsWith('L-') || upper.startsWith('L ') || /^L\d/.test(upper)) {
    return 'L';
  }
  // C形鋼（溝形鋼）
  if (upper.includes('[-') || upper.startsWith('C-') || upper.startsWith('C ')) {
    return 'C';
  }
  // T形鋼
  if (upper.startsWith('T-') || upper.startsWith('CT-')) {
    return 'T';
  }
  // フラットバー（平鋼）
  if (upper.startsWith('FB-') || upper.startsWith('FB ') || /^FB\d/.test(upper)) {
    return 'FB';
  }
  // 丸鋼（CIRCLE）
  // φ(小文字ファイ)はtoUpperCase()でΦ(大文字)に変換されるため、元のshapeNameも確認
  if (upper.startsWith('RB-') || shapeName.startsWith('φ') || shapeName.startsWith('Φ') || shapeName.includes('丸')) {
    return 'CIRCLE';
  }

  // 破損したUnicode文字（U+FFFD 置換文字）の処理
  // STBファイルがShift_JIS等でエンコードされ、UTF-8として読み込まれた場合に発生
  if (shapeName.includes('\uFFFD')) {
    // 寸法パターンから断面タイプを推定
    // □-AxBxtxr (BOX): 4つの数値 (例: □-250x250x14x35)
    // ○-Dxt (PIPE): 2つの数値 (例: ○-216.3x10)
    // キャプチャグループを使用してハイフンを除外した寸法部分を取得
    const dimMatch = shapeName.match(/-([\d.]+(?:x[\d.]+)*)/);
    if (dimMatch) {
      // dimMatch[1] にはハイフンなしの寸法文字列が入る（例: "250x250x14x35"）
      const dims = dimMatch[1].split('x');
      if (dims.length >= 3) {
        // 3つ以上の数値がある場合は BOX (AxBxt) または H形鋼
        // BOXは通常 AxBxt または AxBxtxr の形式
        // H形鋼は HxBxt1xt2xr の形式（5つの数値）
        if (dims.length === 5) {
          return 'H';
        }
        return 'BOX';
      } else if (dims.length === 2) {
        // 2つの数値がある場合は PIPE (Dxt)
        return 'PIPE';
      }
    }
  }

  return null;
}

/**
 * 鋼材type属性からプロファイルタイプを推定
 * @param {string} type - 鋼材タイプ (例: "H", "BCR", "BCP", "STK")
 * @returns {string|null} プロファイルタイプ
 */
export function inferProfileHintFromType(type) {
  if (!type) return null;
  const upper = type.toUpperCase();

  if (upper === 'H') return 'H';
  if (upper === 'BCR' || upper === 'BCP' || upper === 'STKR') return 'BOX';
  if (upper === 'STK' || upper === 'PIPE') return 'PIPE';
  if (upper === 'L') return 'L';
  if (upper === 'C') return 'C';
  if (upper === 'T' || upper === 'CT') return 'T';
  if (upper === 'FB') return 'FB';
  if (upper === 'RB' || upper === 'CIRCLE') return 'CIRCLE';

  return null;
}

/**
 * プロファイルから断面高さを取得
 * @param {Object} profile - プロファイル情報
 * @returns {number} 断面高さ (mm)
 */
export function getSectionHeight(profile) {
  if (!profile || !profile.params) return 0;

  const params = profile.params;
  const type = (profile.type || '').toUpperCase();

  switch (type) {
    case 'H':
    case 'I':
      return params.overallDepth || params.height || 400;
    case 'BOX':
    case 'CFT':
      return params.height || 200;
    case 'PIPE':
      return params.diameter || 200;
    case 'L':
      return params.depth || 100;
    case 'C':
      return params.depth || 200;
    case 'T':
      return params.depth || 200;
    case 'FB':
      return params.thickness || 9;
    case 'CIRCLE':
      return params.diameter || 60;
    case 'stb-diff-viewer':
    case 'RECTANGLE':
    default:
      return params.height || 600;
  }
}

/**
 * プロファイルから断面幅を取得
 * @param {Object} profile - プロファイル情報
 * @returns {number} 断面幅 (mm)
 */
export function getSectionWidth(profile) {
  if (!profile || !profile.params) return 0;

  const params = profile.params;
  const type = (profile.type || '').toUpperCase();

  switch (type) {
    case 'H':
    case 'I':
      return params.overallWidth || params.width || 200;
    case 'BOX':
    case 'CFT':
      return params.width || 200;
    case 'PIPE':
      return params.diameter || 200;
    case 'L':
      return params.width || 100;
    case 'C':
      return params.flangeWidth || 80;
    case 'T':
      return params.flangeWidth || 150;
    case 'FB':
      return params.width || 100;
    case 'CIRCLE':
      return params.diameter || 60;
    case 'stb-diff-viewer':
    case 'RECTANGLE':
    default:
      return params.width || 300;
  }
}

// ============================================================================
// IFCプロファイルマッピング関数
// ============================================================================

/**
 * 統一プロファイルタイプをIFCプロファイルタイプにマッピング
 * @param {string} profileType - 統一プロファイルタイプ (H, BOX, PIPE, etc.)
 * @returns {string} IFCプロファイルタイプ
 */
export function mapToIFCProfileType(profileType) {
  const type = (profileType || '').toUpperCase();
  const mapping = {
    'H': IFC_PROFILE_TYPES.I_SHAPE,
    'I': IFC_PROFILE_TYPES.I_SHAPE,
    'BOX': IFC_PROFILE_TYPES.HOLLOW_RECTANGLE,
    'PIPE': IFC_PROFILE_TYPES.CIRCULAR_HOLLOW,
    'L': IFC_PROFILE_TYPES.L_SHAPE,
    'T': IFC_PROFILE_TYPES.T_SHAPE,
    'C': IFC_PROFILE_TYPES.U_SHAPE,
    'U': IFC_PROFILE_TYPES.U_SHAPE,
    'FB': IFC_PROFILE_TYPES.RECTANGLE,
    'RECTANGLE': IFC_PROFILE_TYPES.RECTANGLE,
    'RC': IFC_PROFILE_TYPES.RECTANGLE,
    'stb-diff-viewer': IFC_PROFILE_TYPES.RECTANGLE,
    'CFT': IFC_PROFILE_TYPES.HOLLOW_RECTANGLE,
    'CIRCLE': IFC_PROFILE_TYPES.CIRCLE,
    // 組み合わせ断面（カスタムプロファイルとして出力）
    '2L_BACKTOBACK': IFC_PROFILE_TYPES.ARBITRARY_CLOSED,
    '2L_FACETOFACE': IFC_PROFILE_TYPES.ARBITRARY_CLOSED,
    '2C_BACKTOBACK': IFC_PROFILE_TYPES.ARBITRARY_CLOSED,
    '2C_FACETOFACE': IFC_PROFILE_TYPES.ARBITRARY_CLOSED
  };
  return mapping[type] || IFC_PROFILE_TYPES.RECTANGLE;
}

/**
 * 統一プロファイルをProfileCalculator用パラメータに変換
 * ProfileCalculator.jsの各calculate*関数が期待するパラメータ形式に変換
 *
 * @param {Object} profile - extractProfileFromSectionの戻り値 {type, params}
 * @returns {Object} ProfileCalculator用パラメータ
 */
export function mapToCalculatorParams(profile) {
  if (!profile || !profile.params) {
    return { width: 300, height: 600 };
  }

  const { type, params } = profile;
  const upperType = (type || '').toUpperCase();

  switch (upperType) {
    case 'H':
    case 'I':
      return {
        overallDepth: params.overallDepth || 400,
        overallWidth: params.overallWidth || 200,
        webThickness: params.webThickness || 8,
        flangeThickness: params.flangeThickness || 13
      };

    case 'BOX':
    case 'CFT':
      return {
        width: params.width || 200,
        height: params.height || 200,
        wallThickness: params.wallThickness || 9
      };

    case 'PIPE':
      return {
        outerDiameter: params.diameter || 200,
        wallThickness: params.wallThickness || 6
      };

    case 'L':
      return {
        depth: params.depth || 100,
        width: params.width || 100,
        thickness: params.thickness || 7
      };

    case 'C':
    case 'U':
      return {
        depth: params.depth || 200,
        flangeWidth: params.flangeWidth || 80,
        webThickness: params.webThickness || 7.5,
        flangeThickness: params.flangeThickness || 11,
        filletRadius: params.filletRadius || 0
      };

    case 'T':
      return {
        depth: params.depth || 200,
        flangeWidth: params.flangeWidth || 150,
        webThickness: params.webThickness || 8,
        flangeThickness: params.flangeThickness || 12,
        filletRadius: params.filletRadius || 0
      };

    case 'FB':
      // フラットバー: 矩形として扱う
      return {
        width: params.width || 100,
        height: params.thickness || 9
      };

    case 'CIRCLE':
      return {
        radius: (params.diameter || 60) / 2
      };

    case 'stb-diff-viewer':
    case 'RECTANGLE':
    case 'RC':
    default:
      return {
        width: params.width || 300,
        height: params.height || 600
      };
  }
}

/**
 * STB鋼材形状データから統一プロファイルを作成
 * IFCProfileMapping.jsのcreateProfileFromSTBに相当
 *
 * @param {Object} stbSteelShape - STB鋼材形状パラメータ (steelSectionsから取得)
 * @param {string} stbShapeType - STB形状タイプ識別子
 * @returns {Object} 統一プロファイル {type, params, ifcType, calculatorParams}
 */
export function createUnifiedProfile(stbSteelShape, stbShapeType) {
  // 仮のsectionオブジェクトを作成してextractProfileFromSectionを使用
  const section = {
    dimensions: { ...stbSteelShape, profile_hint: stbShapeType },
    shapeName: stbSteelShape?.name
  };

  const profile = extractProfileFromSection(section, null);

  return {
    type: profile.type,
    params: profile.params,
    ifcType: mapToIFCProfileType(profile.type),
    calculatorParams: mapToCalculatorParams(profile),
    profileName: `STB_${profile.type}_${stbSteelShape?.name || 'Custom'}`
  };
}

/**
 * 統一プロファイルをIFC標準パラメータ形式に変換
 * IFC仕様に準拠したPascalCaseパラメータ名を使用
 *
 * @param {Object} profile - extractProfileFromSectionの戻り値 {type, params}
 * @returns {Object} IFC標準パラメータ
 */
export function mapToIFCParams(profile) {
  if (!profile || !profile.params) {
    return { XDim: 100, YDim: 100 };
  }

  const { type, params } = profile;
  const upperType = (type || '').toUpperCase();

  switch (upperType) {
    case 'H':
    case 'I':
      return {
        OverallWidth: params.overallWidth || 200,
        OverallDepth: params.overallDepth || 400,
        WebThickness: params.webThickness || 8,
        FlangeThickness: params.flangeThickness || 13,
        FilletRadius: params.filletRadius || 0
      };

    case 'BOX':
    case 'CFT':
      return {
        XDim: params.width || 200,
        YDim: params.height || 200,
        WallThickness: params.wallThickness || 9,
        InnerFilletRadius: params.innerFilletRadius || 0,
        OuterFilletRadius: params.outerFilletRadius || 0
      };

    case 'PIPE':
      return {
        Radius: (params.diameter || 200) / 2,
        WallThickness: params.wallThickness || 6
      };

    case 'L':
      return {
        Depth: params.depth || 100,
        Width: params.width || 100,
        Thickness: params.thickness || 7,
        FilletRadius: params.filletRadius || 0,
        EdgeRadius: params.edgeRadius || 0
      };

    case 'C':
    case 'U':
      return {
        Depth: params.depth || 200,
        FlangeWidth: params.flangeWidth || 80,
        WebThickness: params.webThickness || 7.5,
        FlangeThickness: params.flangeThickness || 11,
        FilletRadius: params.filletRadius || 0,
        EdgeRadius: params.edgeRadius || 0
      };

    case 'T':
      return {
        Depth: params.depth || 200,
        FlangeWidth: params.flangeWidth || 150,
        WebThickness: params.webThickness || 8,
        FlangeThickness: params.flangeThickness || 12,
        FilletRadius: params.filletRadius || 0
      };

    case 'FB':
      // フラットバー: 矩形として扱う
      return {
        XDim: params.width || 100,
        YDim: params.thickness || 9
      };

    case 'CIRCLE':
      return {
        Radius: (params.diameter || 60) / 2
      };

    case 'stb-diff-viewer':
    case 'RECTANGLE':
    case 'RC':
    default:
      return {
        XDim: params.width || 300,
        YDim: params.height || 600
      };
  }
}

/**
 * STB鋼材形状からIFCプロファイル定義を作成
 * IFCProfileMapping.jsのcreateProfileFromSTB互換
 *
 * @param {Object} stbSteelShape - STB鋼材形状パラメータ
 * @param {string} stbShapeType - STB形状タイプ識別子
 * @returns {Object} IFCプロファイル定義 {ProfileType, ProfileName, ProfileParameters}
 */
export function createIFCProfileFromSTB(stbSteelShape, stbShapeType) {
  const unified = createUnifiedProfile(stbSteelShape, stbShapeType);

  return {
    ProfileType: unified.ifcType,
    ProfileName: unified.profileName,
    ProfileParameters: mapToIFCParams({ type: unified.type, params: unified.params })
  };
}

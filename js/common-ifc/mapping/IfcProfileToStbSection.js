/**
 * @fileoverview IFCプロファイル → STB断面パラメータの逆マッピング
 *
 * profileExtractor.js の mapToIFCProfileType の逆方向。
 * IFC標準プロファイル定義からSTB断面パラメータを復元する。
 *
 * @module IfcProfileToStbSection
 */

import * as WebIFC from 'web-ifc';

/**
 * IFCプロファイルエンティティからSTB断面情報を抽出
 * @param {Object} api - web-ifc IfcAPI
 * @param {number} modelID
 * @param {Object} profileEntity - web-ifc GetLine で取得したプロファイルエンティティ
 * @returns {{stbType: string, params: Object, name: string} | null}
 */
export function extractStbSectionFromProfile(api, modelID, profileEntity) {
  if (!profileEntity) return null;

  const profileName = profileEntity.ProfileName?.value || '';
  const type = profileEntity.type;

  switch (type) {
    case WebIFC.IFCISHAPEPROFILEDEF:
      return {
        stbType: 'H',
        params: {
          A: val(profileEntity.OverallDepth),
          B: val(profileEntity.OverallWidth),
          t1: val(profileEntity.WebThickness),
          t2: val(profileEntity.FlangeThickness),
          r: val(profileEntity.FilletRadius, 0),
        },
        name:
          profileName ||
          formatName('H', [
            val(profileEntity.OverallDepth),
            val(profileEntity.OverallWidth),
            val(profileEntity.WebThickness),
            val(profileEntity.FlangeThickness),
          ]),
      };

    case WebIFC.IFCRECTANGLEHOLLOWPROFILEDEF:
      return {
        stbType: 'BOX',
        params: {
          A: val(profileEntity.YDim),
          B: val(profileEntity.XDim),
          t: val(profileEntity.WallThickness),
          r: val(profileEntity.OuterFilletRadius, 0),
        },
        name:
          profileName ||
          formatName('BOX', [
            val(profileEntity.YDim),
            val(profileEntity.XDim),
            val(profileEntity.WallThickness),
          ]),
      };

    case WebIFC.IFCCIRCLEHOLLOWPROFILEDEF:
      return {
        stbType: 'PIPE',
        params: {
          D: val(profileEntity.Radius) * 2,
          t: val(profileEntity.WallThickness),
        },
        name:
          profileName ||
          formatName('PIPE', [val(profileEntity.Radius) * 2, val(profileEntity.WallThickness)]),
      };

    case WebIFC.IFCLSHAPEPROFILEDEF:
      return {
        stbType: 'L',
        params: {
          A: val(profileEntity.Depth),
          B: val(profileEntity.Width),
          t1: val(profileEntity.Thickness),
          t2: val(profileEntity.Thickness),
        },
        name:
          profileName ||
          formatName('L', [
            val(profileEntity.Depth),
            val(profileEntity.Width),
            val(profileEntity.Thickness),
          ]),
      };

    case WebIFC.IFCTSHAPEPROFILEDEF:
      return {
        stbType: 'T',
        params: {
          A: val(profileEntity.Depth),
          B: val(profileEntity.FlangeWidth),
          t1: val(profileEntity.WebThickness),
          t2: val(profileEntity.FlangeThickness),
        },
        name:
          profileName ||
          formatName('T', [
            val(profileEntity.Depth),
            val(profileEntity.FlangeWidth),
            val(profileEntity.WebThickness),
            val(profileEntity.FlangeThickness),
          ]),
      };

    case WebIFC.IFCUSHAPEPROFILEDEF:
      return {
        stbType: 'C',
        params: {
          A: val(profileEntity.Depth),
          B: val(profileEntity.FlangeWidth),
          t1: val(profileEntity.WebThickness),
          t2: val(profileEntity.FlangeThickness),
        },
        name:
          profileName ||
          formatName('C', [
            val(profileEntity.Depth),
            val(profileEntity.FlangeWidth),
            val(profileEntity.WebThickness),
            val(profileEntity.FlangeThickness),
          ]),
      };

    case WebIFC.IFCRECTANGLEPROFILEDEF:
      return {
        stbType: 'RECTANGLE',
        params: {
          width_X: val(profileEntity.XDim),
          width_Y: val(profileEntity.YDim),
        },
        name: profileName || formatName('RECT', [val(profileEntity.XDim), val(profileEntity.YDim)]),
      };

    case WebIFC.IFCCIRCLEPROFILEDEF:
      return {
        stbType: 'CIRCLE',
        params: {
          D: val(profileEntity.Radius) * 2,
        },
        name: profileName || formatName('CIRCLE', [val(profileEntity.Radius) * 2]),
      };

    default:
      return null;
  }
}

/**
 * STB断面パラメータから正規化キーを生成（重複排除用）
 * @param {string} stbType
 * @param {Object} params
 * @returns {string} 例: "H_400_200_8_13"
 */
export function buildSectionKey(stbType, params) {
  const values = Object.values(params)
    .map((v) => Math.round(v * 10) / 10)
    .join('_');
  return `${stbType}_${values}`;
}

/**
 * STB断面タイプに対応するXML要素名を返す
 * @param {string} stbType - H, BOX, PIPE, etc.
 * @returns {string} XML要素名 (例: "StbSecRoll-H")
 */
export function getStbSecSteelTagName(stbType) {
  const map = {
    H: 'StbSecRoll-H',
    BOX: 'StbSecRoll-BOX',
    PIPE: 'StbSecRoll-PIPE',
    L: 'StbSecRoll-L',
    T: 'StbSecRoll-T',
    C: 'StbSecRoll-C',
    FB: 'StbSecRoll-FB',
    CIRCLE: 'StbSecRoll-Bar',
  };
  return map[stbType] || `StbSecRoll-${stbType}`;
}

/** web-ifcの値オブジェクトから数値を取得 */
function val(ref, fallback = 0) {
  if (ref === null || ref === undefined) return fallback;
  if (typeof ref === 'number') return ref;
  return ref.value ?? fallback;
}

/** 断面名をフォーマット */
function formatName(prefix, dims) {
  return `${prefix}-${dims.join('x')}`;
}

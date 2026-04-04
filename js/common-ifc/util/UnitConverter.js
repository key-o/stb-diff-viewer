/**
 * @fileoverview IFC単位検出・変換ユーティリティ
 *
 * IFCモデルの長さ単位を検出し、STBのmm単位への変換係数を算出する。
 *
 * @module UnitConverter
 */

import * as WebIFC from 'web-ifc';

/** SI接頭辞 → mm変換係数（ドット有無の両方に対応） */
const SI_PREFIX_TO_MM = {
  MILLI: 1, // mm → mm
  CENTI: 10, // cm → mm
  DECI: 100, // dm → mm
  KILO: 1_000_000, // km → mm
};

/**
 * 接頭辞文字列を正規化（ドット除去・大文字化）
 * web-ifcは "MILLI"、STEP直読みでは ".MILLI." を返すことがある
 */
function normalizePrefix(prefix) {
  if (prefix === null || prefix === undefined) return null;
  return String(prefix)
    .replace(/^\.|\.$/g, '')
    .toUpperCase();
}

/**
 * IFCモデルから長さ単位のmm変換係数を検出する
 * @param {Object} api - web-ifc IfcAPI インスタンス
 * @param {number} modelID - モデルID
 * @returns {number} mm変換係数（IFC値 × 係数 = mm）
 */
export function detectLengthUnit(api, modelID) {
  try {
    const unitIds = api.GetLineIDsWithType(modelID, WebIFC.IFCUNITASSIGNMENT);
    if (unitIds.size() === 0) return 1000; // デフォルト: metre

    const unitAssignment = api.GetLine(modelID, unitIds.get(0));
    const units = unitAssignment.Units;
    if (!units) return 1000;

    for (const unitRef of units) {
      const unitId = unitRef?.value ?? unitRef;
      if (!unitId) continue;

      const unit = api.GetLine(modelID, unitId);
      if (!unit) continue;

      // IFCSIUNIT で LENGTHUNIT を探す
      if (unit.type === WebIFC.IFCSIUNIT) {
        const unitType = unit.UnitType?.value;
        if (unitType === 'LENGTHUNIT' || unitType === '.LENGTHUNIT.') {
          const rawPrefix = unit.Prefix?.value ?? null;
          const prefix = normalizePrefix(rawPrefix);
          if (prefix && SI_PREFIX_TO_MM[prefix] !== undefined) {
            return SI_PREFIX_TO_MM[prefix];
          }
          return 1000; // 接頭辞なし = metre
        }
      }

      // IFCCONVERSIONBASEDUNIT 対応（feet, inches）
      if (unit.type === WebIFC.IFCCONVERSIONBASEDUNIT) {
        const unitType = unit.UnitType?.value;
        if (unitType === 'LENGTHUNIT' || unitType === '.LENGTHUNIT.') {
          const name = unit.Name?.value?.toUpperCase() || '';
          if (name.includes('FOOT') || name.includes('FT')) return 304.8;
          if (name.includes('INCH') || name.includes('IN')) return 25.4;
        }
      }
    }
  } catch (e) {
    // 検出失敗時はメートル仮定
  }
  return 1000;
}

/**
 * 値をmm単位に変換
 * @param {number} value - IFC値
 * @param {number} factor - mm変換係数
 * @returns {number} mm値
 */
export function toMM(value, factor) {
  return value * factor;
}

/**
 * 座標オブジェクト {x,y,z} をmm単位に変換
 * @param {Object} point - {x, y, z}
 * @param {number} factor - mm変換係数
 * @returns {Object} mm値の {x, y, z}
 */
export function pointToMM(point, factor) {
  return {
    x: point.x * factor,
    y: point.y * factor,
    z: point.z * factor,
  };
}

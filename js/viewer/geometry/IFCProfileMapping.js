/**
 * Browser-agnostic IFC profile mapping utilities.
 * Contains only mapping and parameter transforms (no THREE import).
 *
 * NOTE: このモジュールはprofileExtractor.jsからの再エクスポートです。
 * 後方互換性のために維持されていますが、新規コードでは
 * profileExtractor.jsから直接インポートすることを推奨します。
 *
 * @deprecated profileExtractor.jsを直接使用してください
 */
import {
  IFC_PROFILE_TYPES,
  mapToIFCProfileType,
  mapToIFCParams,
  createIFCProfileFromSTB
} from '../../common/profileExtractor.js';
import { normalizeSectionType } from '../../common/sectionTypeUtil.js';

// 後方互換性のための再エクスポート
export { IFC_PROFILE_TYPES };

/**
 * Map STB shape types to IFC profile types
 * @param {string} stbShapeType - STB shape type
 * @returns {string} IFC profile type
 * @deprecated mapToIFCProfileType in profileExtractor.js を使用してください
 */
export function mapSTBToIFCProfileType(stbShapeType) {
  const typeNorm = normalizeSectionType(stbShapeType) || stbShapeType;
  return mapToIFCProfileType(typeNorm);
}

/**
 * Map STB parameters to IFC-standard parameters
 * @param {Object} stbShape - STB shape parameters
 * @param {string} stbShapeType - STB shape type
 * @returns {Object} IFC-compliant parameters
 * @deprecated createIFCProfileFromSTB in profileExtractor.js を使用してください
 */
export function mapSTBParametersToIFC(stbShape, stbShapeType) {
  const typeNorm = normalizeSectionType(stbShapeType) || stbShapeType;

  // profileExtractor.jsのcreateIFCProfileFromSTBを使用
  const ifcProfile = createIFCProfileFromSTB(stbShape, typeNorm);
  return ifcProfile.ProfileParameters;
}

/**
 * Create IFC profile from STB steel shape
 * @param {Object} stbSteelShape - STB steel shape parameters
 * @param {string} stbShapeType - STB shape type identifier
 * @returns {Object} IFC profile definition
 * @deprecated createIFCProfileFromSTB in profileExtractor.js を使用してください
 */
export function createProfileFromSTB(stbSteelShape, stbShapeType) {
  const typeNorm = normalizeSectionType(stbShapeType) || stbShapeType;
  return createIFCProfileFromSTB(stbSteelShape, typeNorm);
}

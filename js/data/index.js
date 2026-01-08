/**
 * @fileoverview データ層の統一エントリーポイント
 *
 * data/ フォルダ内のモジュールを一括でre-exportします。
 * アクセサ、ノーマライザ、バリデータを提供。
 */

// === Accessors ===
export {
  SECTION_TYPE,
  ensureUnifiedSectionType,
  normalizeSectionType,
  isSectionTypeRC,
  isSectionTypeS,
  isSectionTypeSRC,
  isSectionTypeCFT,
} from '../common-stb/section/sectionTypeUtil.js';

export {
  getSectionType,
  getWidth,
  getHeight,
  getDiameter,
  getThickness,
  isCircularSection,
  isHSection,
  isBuildUpSection,
  hasFlangeData,
  getFlangeWidth,
  getFlangeThickness,
  getWebThickness,
  getSectionDimensions,
} from './accessors/sectionDataAccessor.js';

export {
  getSectionHeight,
  getSectionWidth,
  extractDimensionsFromSection,
  extractDimensionsFromNodeOrElement,
  extractDimensionsFromAttributes,
  extractExtendedDimensions,
  measureProfileDimensions,
  computeOutlineExtent,
} from './accessors/profileExtractor.js';

export {
  WIDTH_KEYS,
  HEIGHT_KEYS,
  DIAMETER_KEYS,
  THICKNESS_KEYS,
  EXTENDED_PILE_KEYS,
} from '../common-stb/data/attributeKeys.js';

// === Normalizers ===
export {
  deriveDimensionsFromAttributes,
  normalizeAttributeValue,
  isExtendedPile,
} from '../common-stb/data/dimensionNormalizer.js';

// === Validators ===
export {
  VALIDATION_CONFIG,
  validateSectionDataComprehensive,
  validateSectionDimensions,
  validateSectionType,
  validateRequiredFields,
} from './validators/sectionDataValidator.js';

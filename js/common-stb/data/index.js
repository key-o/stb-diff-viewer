/**
 * @fileoverview STBデータモジュール エクスポート
 *
 * @module common/stb/data
 */

// 属性キー定義
export {
  WIDTH_KEYS,
  HEIGHT_KEYS,
  DIAMETER_KEYS,
  THICKNESS_KEYS,
  EXTENDED_PILE_KEYS,
  SECTION_TYPE_KEYS,
  RADIUS_KEYS,
  LENGTH_KEYS,
} from './attributeKeys.js';

// 寸法正規化
export {
  deriveDimensionsFromAttributes,
  extractDimensions,
  getWidth,
  getHeight,
  getDiameter,
  getRadius,
  getThickness,
  isCircularProfile,
  isRectangularProfile,
  validateDimensions,
  isExtendedPile,
} from './dimensionNormalizer.js';

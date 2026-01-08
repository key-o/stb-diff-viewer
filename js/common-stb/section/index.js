/**
 * @fileoverview STB断面モジュール統合エクスポート
 *
 * 断面タイプ正規化と断面抽出設定の共通モジュール。
 * MatrixCalcとStbDiffViewerの両方で使用されます。
 *
 * @module common/stb/section
 */

// 断面タイプ正規化ユーティリティ
export {
  SECTION_TYPE,
  normalizeSectionType,
  ensureUnifiedSectionType,
  isSteelSection,
  isConcreteSection,
  isCompositeSection,
} from './sectionTypeUtil.js';

// 断面抽出設定
export {
  SECTION_CONFIG,
  validateSectionConfig,
  getSupportedElementTypes,
  getSectionConfig,
  getElementTypeBySelector,
} from './sectionConfig.js';

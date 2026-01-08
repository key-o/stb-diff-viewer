/**
 * @fileoverview 要素情報表示モジュール公開API
 *
 * element-info ディレクトリ内のモジュールを統合し、外部向けAPIを提供します。
 */

// メインモジュールからエクスポート
export {
  displayElementInfo,
  refreshElementInfoPanel,
  getCurrentSelectedElement,
  setElementInfoProviders,
  toggleEditMode,
  exportModifications,
  clearModifications,
} from './ElementInfoDisplay.js';

// サブモジュールの再エクスポート（必要に応じて使用）
export { setElementInfoProviders as setProviders } from './ElementInfoProviders.js';
export {
  getAttributeImportanceLevel,
  getImportanceBasedBackgroundColor,
  getModelSourceBackgroundColor,
  getSingleValueBackgroundColor,
} from './ImportanceColors.js';
export {
  findSectionNode,
  findSteelSectionInfo,
  extractSectionData,
  generateEquivalenceSection,
  buildElementDataForLabels,
  getAttributesMap,
  renderShapeWithSteelInfo,
} from './SectionHelpers.js';
export {
  isEditMode,
  getCurrentEditingElement,
  getModifications,
  editAttributeValue,
  updateEditingSummary,
} from './EditMode.js';
export {
  renderComparisonRecursive,
  renderSectionInfo,
  generateTableStyles,
  setupCollapseHandlers,
} from './ComparisonRenderer.js';

/**
 * @fileoverview 要素情報表示モジュール公開API
 *
 * element-info ディレクトリ内のモジュールを統合し、外部向けAPIを提供します。
 */

export {
  displayElementInfo,
  displayMultiSelectionSummary,
  refreshElementInfoPanel,
  exportElementInfoAsJson,
  initializeExportJsonButton,
} from './ElementInfoController.js';

export {
  getCurrentEditingElement as getCurrentSelectedElement,
  getCurrentEditingElement,
  isEditMode,
  getModifications,
  editAttributeValue,
  updateEditingSummary,
  toggleEditMode,
  exportModifications,
  clearModifications,
  initializeEditModeButton,
} from './EditMode.js';

export {
  setElementInfoProviders,
  setElementInfoProviders as setProviders,
} from './ElementInfoProviders.js';

export { getAttributeImportanceLevel, getImportanceCircleHtml } from './ImportanceColors.js';
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
  renderComparisonRecursive,
  renderSectionInfo,
  generateTableStyles,
  setupCollapseHandlers,
} from './ComparisonRenderer.js';

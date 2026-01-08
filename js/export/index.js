/**
 * @fileoverview エクスポート機能統合モジュール
 *
 * 各種フォーマットへのエクスポート機能を統合的に提供します。
 */

// IFC エクスポート
export { IFCExporterBase } from './ifc/IFCExporterBase.js';
export { IFCBeamExporter, exportSingleBeamToIFC } from './ifc/IFCBeamExporter.js';
export { IFCSlabExporter, exportSingleSlabToIFC } from './ifc/IFCSlabExporter.js';
export { IFCWallExporter, exportSingleWallToIFC } from './ifc/IFCWallExporter.js';
export { IFCSTBExporter } from './ifc/IFCSTBExporter.js';
export { StepWriter, generateIfcGuid } from './ifc/StepWriter.js';

// DXF エクスポート
export { exportDxf, getExportStats } from './dxf/dxfExporter.js';
export {
  setDxfExporterProviders,
  EXPORTABLE_ELEMENT_TYPES,
  ELEMENT_TYPE_COLORS,
  canExportStbToDxf,
  exportStbToDxf,
  getStbExportStats,
  exportAllStoriesToDxf,
  exportAlongAllAxesToDxf,
  exportAlongAllAxesBothDirections,
  getAvailableStories,
  getAvailableAxes,
} from './dxf/stb-to-dxf/index.js';

// STB エクスポート
export {
  exportModifiedStb,
  exportStbDocument,
  validateDocumentForExport,
  generateModificationReport,
  exportValidatedStb,
  validateRepairAndExport,
  createExportConfig,
  getExportSummary,
  formatXml,
  downloadStbFile,
  downloadTextFile,
} from './stb/stbExporter.js';

// API 連携
export { IFCConverter, IFCConverterUI } from './api/ifcConverter.js';

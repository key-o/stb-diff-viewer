/**
 * @fileoverview STBデータエクスポートモジュール（橋渡しファイル）
 *
 * 共通モジュール (common/stb/export) からの再エクスポート。
 * StbDiffViewer固有のバリデーション機能を注入します。
 *
 * @module StbDiffViewer/export/stb/stbExporter
 */

// プロジェクト固有の依存関係をインポート
import { validateElement, isSchemaLoaded } from '../../common-stb/parser/xsdSchemaParser.js';
import { formatValidationReport } from '../../common-stb/validation/stbValidator.js';
import { formatRepairReport } from '../../common-stb/repair/stbRepairEngine.js';

// 共通モジュールをインポート
import {
  setLogger,
  setValidatorFunctions,
  setDynamicImportPaths,
  exportModifiedStb as _exportModifiedStb,
  exportStbDocument as _exportStbDocument,
  validateDocumentForExport as _validateDocumentForExport,
  generateModificationReport as _generateModificationReport,
  exportValidatedStb as _exportValidatedStb,
  validateRepairAndExport as _validateRepairAndExport,
  createExportConfig as _createExportConfig,
  getExportSummary as _getExportSummary,
  formatXml,
  downloadStbFile,
  downloadTextFile,
} from '../../common-stb/export/stbExporter.js';

// StbDiffViewer用ロガーを設定（console使用）
setLogger({
  debug: (...args) => {},
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
});

// バリデーション関数を注入
setValidatorFunctions({
  validateElement,
  isSchemaLoaded,
  formatValidationReport,
  formatRepairReport,
});

// 動的インポートパスを設定
setDynamicImportPaths({
  repair: '../../repair/stbRepairEngine.js',
  validator: '../../common-stb/validation/stbValidator.js',
});

// 全機能を再エクスポート
export {
  _exportModifiedStb as exportModifiedStb,
  _exportStbDocument as exportStbDocument,
  _validateDocumentForExport as validateDocumentForExport,
  _generateModificationReport as generateModificationReport,
  _exportValidatedStb as exportValidatedStb,
  _validateRepairAndExport as validateRepairAndExport,
  _createExportConfig as createExportConfig,
  _getExportSummary as getExportSummary,
  formatXml,
  downloadStbFile,
  downloadTextFile,
};

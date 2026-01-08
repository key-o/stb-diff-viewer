/**
 * @fileoverview STB修復エンジン（橋渡しファイル）
 *
 * 共通モジュール (common/stb/repair) からの再エクスポート。
 * StbDiffViewer固有のバリデーション機能を注入します。
 *
 * @module StbDiffViewer/repair/stbRepairEngine
 */

// プロジェクト固有の依存関係をインポート
import { parseElements } from '../common-stb/parser/stbXmlParser.js';
import { SEVERITY, CATEGORY, getRepairableIssues } from '../validation/stbValidator.js';

// 共通モジュールをインポート
import {
  setValidatorFunctions,
  REPAIR_ACTION as _REPAIR_ACTION,
  DEFAULT_VALUES as _DEFAULT_VALUES,
  VALUE_CONSTRAINTS as _VALUE_CONSTRAINTS,
  StbRepairEngine as _StbRepairEngine,
  formatRepairReport as _formatRepairReport,
  autoRepairDocument as _autoRepairDocument,
} from '../common-stb/repair/stbRepairEngine.js';

// バリデーション関数を注入
setValidatorFunctions({
  parseElements,
  SEVERITY,
  CATEGORY,
  getRepairableIssues,
});

// 全機能を再エクスポート
export const REPAIR_ACTION = _REPAIR_ACTION;
export const DEFAULT_VALUES = _DEFAULT_VALUES;
export const VALUE_CONSTRAINTS = _VALUE_CONSTRAINTS;
export const StbRepairEngine = _StbRepairEngine;
export const formatRepairReport = _formatRepairReport;
export const autoRepairDocument = _autoRepairDocument;

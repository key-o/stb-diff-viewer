/**
 * @fileoverview STBデータエクスポートモジュール（統合版）
 *
 * このファイルは、編集されたSTBデータをXMLファイルとしてエクスポートする機能を提供します:
 * - XMLドキュメントの生成とシリアライゼーション
 * - XSDスキーマに基づく修正データの反映
 * - ファイルダウンロード機能
 * - エクスポート前のバリデーション
 *
 * @module common/stb/export/stbExporter
 */

import { formatXml, downloadStbFile, downloadTextFile } from './xmlFormatter.js';

// ======================================================================
// 依存性注入（ロガーとバリデーション機能）
// ======================================================================

/**
 * デフォルトロガー（console使用）
 * @private
 */
const defaultLogger = {
  debug: (...args) => {},
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};

/**
 * 現在のロガー
 * @private
 */
let logger = defaultLogger;

/**
 * ロガーを設定
 * @param {Object} customLogger - カスタムロガー
 * @param {Function} [customLogger.debug] - デバッグログ関数
 * @param {Function} [customLogger.warn] - 警告ログ関数
 * @param {Function} [customLogger.error] - エラーログ関数
 */
export function setLogger(customLogger) {
  logger = { ...defaultLogger, ...customLogger };
}

/**
 * バリデーション関数のインジェクション用
 * @private
 */
let validatorFunctions = {
  validateElement: () => ({ valid: true }),
  isSchemaLoaded: () => false,
  formatValidationReport: (report) => JSON.stringify(report, null, 2),
  formatRepairReport: (report) => JSON.stringify(report, null, 2),
};

/**
 * バリデーション関数を設定
 * @param {Object} functions - バリデーション関数群
 * @param {Function} [functions.validateElement] - 要素バリデーション関数
 * @param {Function} [functions.isSchemaLoaded] - スキーマ読み込み確認関数
 * @param {Function} [functions.formatValidationReport] - バリデーションレポートフォーマット関数
 * @param {Function} [functions.formatRepairReport] - 修復レポートフォーマット関数
 */
export function setValidatorFunctions(functions) {
  validatorFunctions = { ...validatorFunctions, ...functions };
}

/**
 * 動的インポート用パス設定
 * @private
 */
let dynamicImportPaths = {
  repair: null,
  validator: null,
};

/**
 * 動的インポートパスを設定
 * @param {Object} paths - インポートパス
 * @param {string} [paths.repair] - 修復モジュールパス
 * @param {string} [paths.validator] - バリデーションモジュールパス
 */
export function setDynamicImportPaths(paths) {
  dynamicImportPaths = { ...dynamicImportPaths, ...paths };
}

// ======================================================================
// エクスポート関数
// ======================================================================

/**
 * STBドキュメントを修正してエクスポート
 * @param {Document} originalDoc - 元のXMLドキュメント
 * @param {Array<Object>} modifications - 修正データの配列
 * @param {string} filename - エクスポートファイル名
 * @returns {Promise<boolean>} エクスポート成功可否
 */
export async function exportModifiedStb(originalDoc, modifications, filename = 'modified.stb') {
  try {
    // 元ドキュメントのコピーを作成
    const modifiedDoc = originalDoc.cloneNode(true);

    // 修正を適用
    const validationResults = [];
    for (const mod of modifications) {
      const result = applyModification(modifiedDoc, mod);
      if (result.validation) {
        validationResults.push(result.validation);
      }
    }

    // バリデーション結果をコンソールに出力
    if (validationResults.length > 0) {
      logger.debug('Validation results:', validationResults);
    }

    // XMLを文字列にシリアライズ
    const serializer = new XMLSerializer();
    const xmlString = serializer.serializeToString(modifiedDoc);

    // フォーマット調整（改行とインデント）
    const formattedXml = formatXml(xmlString);

    // ファイルとしてダウンロード
    downloadStbFile(formattedXml, filename);

    logger.debug(`STB file exported successfully as ${filename}`);
    return true;
  } catch (error) {
    logger.error('Error exporting STB file:', error);
    return false;
  }
}

/**
 * STBドキュメントを指定バージョンでエクスポート
 * @param {Document} doc - XMLドキュメント
 * @param {Object} options - オプション
 * @param {string} options.filename - 出力ファイル名
 * @param {string} options.targetVersion - 目標バージョン ('2.0.2' or '2.1.0')
 * @returns {boolean} 成功可否
 */
export function exportStbDocument(doc, options = {}) {
  try {
    const { filename = 'export.stb', targetVersion = null } = options;
    const exportDoc = doc.cloneNode(true);

    if (targetVersion) {
      applyVersionOverrides(exportDoc, targetVersion);
    }

    const serializer = new XMLSerializer();
    const xmlString = serializer.serializeToString(exportDoc);
    const formattedXml = formatXml(xmlString);

    downloadStbFile(formattedXml, filename);
    return true;
  } catch (error) {
    logger.error('Error exporting STB document:', error);
    return false;
  }
}

/**
 * バージョン文字列を正規化
 * @param {string} version - バージョン文字列
 * @returns {string|null} 正規化されたバージョン
 */
function normalizeTargetVersion(version) {
  if (!version) return null;
  const v = String(version).trim();
  if (v === '210' || v === '2.1' || v === '2.1.0') return '2.1.0';
  if (v === '202' || v === '2.0' || v === '2.0.2') return '2.0.2';
  return v;
}

/**
 * バージョン属性をオーバーライド
 * @param {Document} doc - XMLドキュメント
 * @param {string} targetVersion - 目標バージョン
 */
function applyVersionOverrides(doc, targetVersion) {
  const normalized = normalizeTargetVersion(targetVersion);
  if (!normalized) return;

  const root = doc.documentElement;
  if (root) {
    root.setAttribute('version', normalized);
  }

  const stbCommon = doc.getElementsByTagName('StbCommon')[0];
  if (!stbCommon) return;

  if (normalized === '2.1.0') {
    if (!stbCommon.getAttribute('app_version')) {
      stbCommon.setAttribute('app_version', '1.0.0');
    }
    if (!stbCommon.getAttribute('project_name')) {
      stbCommon.setAttribute('project_name', 'Untitled Project');
    }
  } else if (normalized === '2.0.2') {
    stbCommon.removeAttribute('app_version');
    stbCommon.removeAttribute('project_name');
    stbCommon.removeAttribute('convert_app_version');
  }
}

/**
 * 単一の修正をXMLドキュメントに適用
 * @param {Document} doc - XMLドキュメント
 * @param {Object} modification - 修正データ {elementType, id, attribute, newValue}
 * @returns {Object} 適用結果とバリデーション情報
 */
function applyModification(doc, modification) {
  const { elementType, id, attribute, newValue } = modification;

  // 要素を検索
  const tagName = elementType === 'Node' ? 'StbNode' : `Stb${elementType}`;
  const element = doc.querySelector(`${tagName}[id="${id}"]`);

  if (!element) {
    logger.warn(`Element ${tagName} with ID ${id} not found`);
    return { success: false, error: 'Element not found' };
  }

  // 属性値を設定
  if (newValue === null || newValue === undefined || newValue === '') {
    element.removeAttribute(attribute);
  } else {
    element.setAttribute(attribute, newValue);
  }

  // XSDスキーマが利用可能な場合はバリデーション
  let validation = null;
  if (validatorFunctions.isSchemaLoaded()) {
    const currentAttributes = {};
    for (const attr of element.attributes) {
      currentAttributes[attr.name] = attr.value;
    }

    validation = validatorFunctions.validateElement(tagName, currentAttributes);
    validation.elementId = id;
    validation.elementType = elementType;
  }

  return {
    success: true,
    validation: validation,
  };
}

/**
 * エクスポート前の全体バリデーション
 * @param {Document} doc - XMLドキュメント
 * @returns {Object} バリデーション結果
 */
export function validateDocumentForExport(doc) {
  if (!validatorFunctions.isSchemaLoaded()) {
    return {
      valid: true,
      message: 'XSDスキーマが読み込まれていないため、バリデーションをスキップしました',
    };
  }

  const issues = [];

  // 全STB要素をチェック
  const stbElements = doc.querySelectorAll('[id]');
  stbElements.forEach((element) => {
    const tagName = element.tagName;
    if (!tagName.startsWith('Stb')) return;

    const id = element.getAttribute('id');
    const attributes = {};
    for (const attr of element.attributes) {
      attributes[attr.name] = attr.value;
    }

    const validation = validatorFunctions.validateElement(tagName, attributes);
    if (!validation.valid) {
      issues.push({
        elementType: tagName,
        elementId: id,
        errors: validation.errors,
      });
    }
  });

  return {
    valid: issues.length === 0,
    issues: issues,
    message:
      issues.length === 0
        ? '全ての要素がXSDスキーマに適合しています'
        : `${issues.length}個の要素にバリデーションエラーがあります`,
  };
}

/**
 * 修正データから差分レポートを生成
 * @param {Array<Object>} modifications - 修正データの配列
 * @returns {string} テキスト形式の差分レポート
 */
export function generateModificationReport(modifications) {
  if (modifications.length === 0) {
    return '修正はありませんでした。';
  }

  let report = `STB修正レポート\n`;
  report += `生成日時: ${new Date().toLocaleString('ja-JP')}\n`;
  report += `修正数: ${modifications.length}件\n\n`;

  modifications.forEach((mod, index) => {
    report += `${index + 1}. ${mod.elementType} (ID: ${mod.id})\n`;
    report += `   属性: ${mod.attribute}\n`;
    report += `   新しい値: ${mod.newValue}\n\n`;
  });

  return report;
}

/**
 * バリデート・修復済みドキュメントをエクスポート
 *
 * @param {Document} doc - エクスポートするXMLドキュメント
 * @param {Object} options - エクスポートオプション
 * @param {string} options.filename - ファイル名
 * @param {Object} options.validationReport - バリデーションレポート
 * @param {Object} options.repairReport - 修復レポート
 * @param {boolean} options.includeReport - レポートを含めるかどうか
 * @returns {boolean} 成功可否
 */
export function exportValidatedStb(doc, options = {}) {
  try {
    const {
      filename = 'validated.stb',
      validationReport = null,
      repairReport = null,
      includeReport = false,
    } = options;

    // XMLを文字列にシリアライズ
    const serializer = new XMLSerializer();
    const xmlString = serializer.serializeToString(doc);

    // フォーマット調整
    const formattedXml = formatXml(xmlString);

    // ファイルとしてダウンロード
    downloadStbFile(formattedXml, filename);

    // レポートを含める場合は別ファイルとしてダウンロード
    if (includeReport && (validationReport || repairReport)) {
      const reportContent = generateIntegratedExportReport(validationReport, repairReport);
      const reportFilename = filename.replace(/\.stb$/i, '_report.txt');
      downloadTextFile(reportContent, reportFilename);
    }

    logger.debug(`Validated STB file exported successfully as ${filename}`);
    return true;
  } catch (error) {
    logger.error('Error exporting validated STB file:', error);
    return false;
  }
}

/**
 * 統合エクスポートレポートを生成
 *
 * @param {Object} validationReport - バリデーションレポート
 * @param {Object} repairReport - 修復レポート
 * @returns {string} レポートテキスト
 */
function generateIntegratedExportReport(validationReport, repairReport) {
  let report = '';
  report += '='.repeat(60) + '\n';
  report += 'ST-Bridge エクスポートレポート\n';
  report += '='.repeat(60) + '\n';
  report += `生成日時: ${new Date().toLocaleString('ja-JP')}\n\n`;

  if (validationReport) {
    report += validatorFunctions.formatValidationReport(validationReport);
    report += '\n\n';
  }

  if (repairReport) {
    report += validatorFunctions.formatRepairReport(repairReport);
    report += '\n\n';
  }

  return report;
}

/**
 * ドキュメントをメモリ内でバリデート・修復してエクスポート
 *
 * @param {Document} originalDoc - 元のXMLドキュメント
 * @param {Object} validationReport - バリデーションレポート
 * @param {Object} repairOptions - 修復オプション
 * @param {string} filename - 出力ファイル名
 * @returns {Promise<Object>} エクスポート結果
 */
export async function validateRepairAndExport(
  originalDoc,
  validationReport,
  repairOptions = {},
  filename = 'repaired.stb',
) {
  try {
    // 動的インポートパスが設定されていない場合はエラー
    if (!dynamicImportPaths.repair || !dynamicImportPaths.validator) {
      throw new Error('Dynamic import paths not configured. Use setDynamicImportPaths() first.');
    }

    // 動的インポートで循環依存を回避
    const repairModule = await import(dynamicImportPaths.repair);
    const validatorModule = await import(dynamicImportPaths.validator);

    const { autoRepairDocument } = repairModule;
    const { validateStbDocument } = validatorModule;

    // 修復実行
    const { document: repairedDoc, report: repairReport } = autoRepairDocument(
      originalDoc.cloneNode(true),
      validationReport,
      repairOptions,
    );

    // 修復後の再バリデーション
    const revalidation = validateStbDocument(repairedDoc);

    // エクスポート
    const success = exportValidatedStb(repairedDoc, {
      filename,
      validationReport: revalidation,
      repairReport,
      includeReport: true,
    });

    return {
      success,
      repairedDocument: repairedDoc,
      repairReport,
      revalidation,
    };
  } catch (error) {
    logger.error('Error in validate-repair-export workflow:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * エクスポート設定を生成
 *
 * @param {Object} options - カスタムオプション
 * @returns {Object} エクスポート設定
 */
export function createExportConfig(options = {}) {
  return {
    filename: options.filename || `stb_export_${Date.now()}.stb`,
    includeReport: options.includeReport !== false,
    formatXml: options.formatXml !== false,
    validateBeforeExport: options.validateBeforeExport !== false,
    encoding: options.encoding || 'UTF-8',
  };
}

/**
 * エクスポート結果のサマリーを取得
 *
 * @param {Object} result - エクスポート結果
 * @returns {string} サマリーテキスト
 */
export function getExportSummary(result) {
  const lines = [];

  lines.push('--- エクスポートサマリー ---');
  lines.push(`成功: ${result.success ? 'はい' : 'いいえ'}`);

  if (result.error) {
    lines.push(`エラー: ${result.error}`);
  }

  if (result.repairReport) {
    lines.push(`修復数: ${result.repairReport.totalRepairs}`);
    lines.push(`成功した修復: ${result.repairReport.successCount}`);
    lines.push(`削除された要素: ${result.repairReport.removedElements?.length || 0}`);
  }

  if (result.revalidation) {
    lines.push(`再バリデーション結果: ${result.revalidation.valid ? '有効' : 'エラーあり'}`);
    if (!result.revalidation.valid) {
      lines.push(`残りのエラー: ${result.revalidation.statistics.errorCount}`);
    }
  }

  return lines.join('\n');
}

// フォーマッター関数も再エクスポート
export { formatXml, downloadStbFile, downloadTextFile };

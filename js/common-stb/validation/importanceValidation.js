/**
 * @fileoverview 重要度設定検証モジュール
 *
 * このファイルは、重要度設定の検証機能を提供します:
 * - 重要度レベルの妥当性検証
 * - 要素パスの形式検証
 * - 設定データの整合性チェック
 * - エラー報告とログ出力
 */

/* global XPathResult */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('validation/importanceValidation');

// 妥当な重要度レベルの定数
export const VALID_IMPORTANCE_LEVELS = [
  // 現行レベル
  'required',
  'optional',
  'unnecessary',
  'notApplicable',
  // 旧レベル（後方互換）
  'high',
  'medium',
  'low',
];

// 重要度レベルの日本語名マッピング
export const IMPORTANCE_LEVEL_NAMES = {
  required: '対象',
  optional: '対象',
  unnecessary: '対象',
  notApplicable: '対象外',
  high: '高重要度',
  medium: '中重要度',
  low: '低重要度',
};

/**
 * 重要度設定の妥当性を検証する
 * @param {Object} settings - 検証する設定オブジェクト
 * @returns {Object} 検証結果
 */
export function validateImportanceSettings(settings) {
  const errors = [];
  const warnings = [];

  if (!settings || typeof settings !== 'object') {
    errors.push('Settings must be a valid object');
    return { isValid: false, errors, warnings };
  }

  // 設定オブジェクトの構造検証
  const structureValidation = validateSettingsStructure(settings);
  errors.push(...structureValidation.errors);
  warnings.push(...structureValidation.warnings);

  // 要素設定の検証
  if (settings.elements) {
    const elementsValidation = validateElementsSettings(settings.elements);
    errors.push(...elementsValidation.errors);
    warnings.push(...elementsValidation.warnings);
  }

  // 属性設定の検証
  if (settings.attributes) {
    const attributesValidation = validateAttributesSettings(settings.attributes);
    errors.push(...attributesValidation.errors);
    warnings.push(...attributesValidation.warnings);
  }

  // XPathパターン設定の検証
  if (settings.xpathPatterns) {
    const xpathValidation = validateXPathPatterns(settings.xpathPatterns);
    errors.push(...xpathValidation.errors);
    warnings.push(...xpathValidation.warnings);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    summary: {
      totalChecked:
        Object.keys(settings.elements || {}).length +
        Object.keys(settings.attributes || {}).length +
        Object.keys(settings.xpathPatterns || {}).length,
      errorsCount: errors.length,
      warningsCount: warnings.length,
    },
  };
}

/**
 * 設定オブジェクトの構造を検証する
 * @param {Object} settings - 設定オブジェクト
 * @returns {Object} 検証結果
 */
function validateSettingsStructure(settings) {
  const errors = [];
  const warnings = [];

  // 必須プロパティの存在確認
  const requiredProperties = ['elements', 'attributes'];
  for (const prop of requiredProperties) {
    if (!settings.hasOwnProperty(prop)) {
      warnings.push(`Missing recommended property: ${prop}`);
    } else if (typeof settings[prop] !== 'object' || settings[prop] === null) {
      errors.push(`Property ${prop} must be an object`);
    }
  }

  // オプションプロパティの型確認
  if (settings.xpathPatterns && typeof settings.xpathPatterns !== 'object') {
    errors.push('Property xpathPatterns must be an object');
  }

  if (settings.lastModified && typeof settings.lastModified !== 'string') {
    warnings.push('Property lastModified should be a string (ISO date)');
  }

  return { errors, warnings };
}

/**
 * 要素設定を検証する
 * @param {Object} elements - 要素設定オブジェクト
 * @returns {Object} 検証結果
 */
function validateElementsSettings(elements) {
  const errors = [];
  const warnings = [];

  for (const [elementPath, importance] of Object.entries(elements)) {
    // 重要度レベルの検証
    if (!VALID_IMPORTANCE_LEVELS.includes(importance)) {
      errors.push(`Invalid importance level "${importance}" for element "${elementPath}"`);
    }

    // 要素パスの形式検証
    const pathValidation = validateElementPath(elementPath);
    if (!pathValidation.isValid) {
      if (pathValidation.severity === 'error') {
        errors.push(`Invalid element path "${elementPath}": ${pathValidation.message}`);
      } else {
        warnings.push(
          `Potentially invalid element path "${elementPath}": ${pathValidation.message}`,
        );
      }
    }

    // STB要素名の妥当性チェック
    if (!pathValidation.isStbElement) {
      warnings.push(`Element path "${elementPath}" does not appear to be a valid STB element`);
    }
  }

  return { errors, warnings };
}

/**
 * 属性設定を検証する
 * @param {Object} attributes - 属性設定オブジェクト
 * @returns {Object} 検証結果
 */
function validateAttributesSettings(attributes) {
  const errors = [];
  const warnings = [];

  for (const [attributePath, importance] of Object.entries(attributes)) {
    // 重要度レベルの検証
    if (!VALID_IMPORTANCE_LEVELS.includes(importance)) {
      errors.push(`Invalid importance level "${importance}" for attribute "${attributePath}"`);
    }

    // 属性パスの形式検証
    const pathValidation = validateAttributePath(attributePath);
    if (!pathValidation.isValid) {
      if (pathValidation.severity === 'error') {
        errors.push(`Invalid attribute path "${attributePath}": ${pathValidation.message}`);
      } else {
        warnings.push(
          `Potentially invalid attribute path "${attributePath}": ${pathValidation.message}`,
        );
      }
    }
  }

  return { errors, warnings };
}

/**
 * XPathパターン設定を検証する
 * @param {Object} xpathPatterns - XPathパターン設定オブジェクト
 * @returns {Object} 検証結果
 */
function validateXPathPatterns(xpathPatterns) {
  const errors = [];
  const warnings = [];

  for (const [xpath, importance] of Object.entries(xpathPatterns)) {
    // 重要度レベルの検証
    if (!VALID_IMPORTANCE_LEVELS.includes(importance)) {
      errors.push(`Invalid importance level "${importance}" for XPath pattern "${xpath}"`);
    }

    // XPath構文の基本的な検証
    const xpathValidation = validateXPathSyntax(xpath);
    if (!xpathValidation.isValid) {
      errors.push(`Invalid XPath syntax "${xpath}": ${xpathValidation.message}`);
    }
  }

  return { errors, warnings };
}

/**
 * 要素パスの妥当性を検証する
 * @param {string} elementPath - 検証する要素パス
 * @returns {Object} 検証結果
 */
export function validateElementPath(elementPath) {
  if (typeof elementPath !== 'string' || elementPath.length === 0) {
    return {
      isValid: false,
      severity: 'error',
      message: 'Element path must be a non-empty string',
      isStbElement: false,
    };
  }

  // STB要素の基本パターンチェック
  const stbElementPattern = /^(\/\/?)?(Stb[A-Za-z_][A-Za-z0-9_]*)/;
  const stbMatch = elementPath.match(stbElementPattern);

  if (stbMatch) {
    const elementName = stbMatch[2];

    // 既知のSTB要素名かチェック
    const knownElements = [
      'StbColumn',
      'StbGirder',
      'StbBeam',
      'StbBrace',
      'StbNode',
      'StbSlab',
      'StbWall',
      'StbStory',
      'StbAxis',
      'StbDrawingLineAxis',
      'StbDrawingArcAxis',
      'StbSecColumn_RC',
      'StbSecColumn_S',
      'StbSecColumn_SRC',
      'StbSecColumn_CFT',
      'StbSecBeam_RC',
      'StbSecBeam_S',
      'StbSecBeam_SRC',
      'StbSecBrace_S',
      'StbSecSlab_RC',
      'StbSecWall_RC',
    ];

    const isKnownElement = knownElements.some(
      (known) => elementName === known || elementName.startsWith(known),
    );

    return {
      isValid: true,
      severity: 'info',
      message: isKnownElement ? 'Valid STB element' : 'Unknown STB element',
      isStbElement: true,
      elementName,
    };
  }

  // XPath形式のチェック
  if (elementPath.startsWith('//') || elementPath.startsWith('/')) {
    return {
      isValid: true,
      severity: 'warning',
      message: 'XPath format detected but not STB element',
      isStbElement: false,
    };
  }

  // 単純な文字列の場合
  if (/^[A-Za-z][A-Za-z0-9_]*$/.test(elementPath)) {
    return {
      isValid: true,
      severity: 'warning',
      message: 'Simple element name format',
      isStbElement: elementPath.startsWith('Stb'),
    };
  }

  return {
    isValid: false,
    severity: 'error',
    message: 'Invalid element path format',
    isStbElement: false,
  };
}

/**
 * 属性パスの妥当性を検証する
 * @param {string} attributePath - 検証する属性パス
 * @returns {Object} 検証結果
 */
export function validateAttributePath(attributePath) {
  if (typeof attributePath !== 'string' || attributePath.length === 0) {
    return {
      isValid: false,
      severity: 'error',
      message: 'Attribute path must be a non-empty string',
    };
  }

  // @で始まる属性パターン
  if (attributePath.startsWith('@')) {
    const attrName = attributePath.substring(1);

    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(attrName)) {
      // 既知のSTB属性名かチェック
      const knownAttributes = [
        'id',
        'guid',
        'name',
        'material',
        'shape',
        'strength_concrete',
        'strength_rebar',
        'pos',
        'rotate',
        'offset',
        'id_node_start',
        'id_node_end',
        'id_node_bottom',
        'id_node_top',
      ];

      const isKnownAttribute = knownAttributes.includes(attrName);

      return {
        isValid: true,
        severity: isKnownAttribute ? 'info' : 'warning',
        message: isKnownAttribute ? 'Valid STB attribute' : 'Unknown STB attribute',
        attributeName: attrName,
      };
    } else {
      return {
        isValid: false,
        severity: 'error',
        message: 'Invalid attribute name format',
      };
    }
  }

  // 単純な属性名
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(attributePath)) {
    return {
      isValid: true,
      severity: 'warning',
      message: 'Attribute name without @ prefix',
      attributeName: attributePath,
    };
  }

  return {
    isValid: false,
    severity: 'error',
    message: 'Invalid attribute path format',
  };
}

/**
 * XPath構文の基本的な妥当性を検証する
 * @param {string} xpath - 検証するXPath文字列
 * @returns {Object} 検証結果
 */
export function validateXPathSyntax(xpath) {
  if (typeof xpath !== 'string' || xpath.length === 0) {
    return {
      isValid: false,
      message: 'XPath must be a non-empty string',
    };
  }

  try {
    // 基本的なXPath構文チェック

    // 括弧の対応チェック
    const openBrackets = (xpath.match(/\[/g) || []).length;
    const closeBrackets = (xpath.match(/\]/g) || []).length;
    if (openBrackets !== closeBrackets) {
      return {
        isValid: false,
        message: 'Unmatched brackets in XPath',
      };
    }

    // 引用符の対応チェック
    const singleQuotes = (xpath.match(/'/g) || []).length;
    const doubleQuotes = (xpath.match(/"/g) || []).length;
    if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) {
      return {
        isValid: false,
        message: 'Unmatched quotes in XPath',
      };
    }

    // 禁止文字のチェック
    if (/[<>]/.test(xpath)) {
      return {
        isValid: false,
        message: 'Invalid characters in XPath',
      };
    }

    // ブラウザのXPath評価を試行（エラーキャッチ）
    if (typeof document !== 'undefined' && document.evaluate) {
      // テスト用の空のXMLドキュメントを作成
      const testDoc = document.implementation.createDocument('', '', null);
      document.evaluate(xpath, testDoc, null, XPathResult.ANY_TYPE, null);
    }

    return {
      isValid: true,
      message: 'Valid XPath syntax',
    };
  } catch (error) {
    return {
      isValid: false,
      message: `XPath syntax error: ${error.message}`,
    };
  }
}

/**
 * 重要度レベル名を取得する
 * @param {string} level - 重要度レベル
 * @returns {string} 日本語の重要度レベル名
 */
export function getImportanceLevelName(level) {
  return IMPORTANCE_LEVEL_NAMES[level] || level;
}

/**
 * 検証結果をコンソールに出力する
 * @param {Object} validationResult - 検証結果
 * @param {string} context - コンテキスト情報
 */
export function logValidationResult(validationResult, context = '') {
  const prefix = context ? `[${context}] ` : '';

  if (validationResult.isValid) {
    log.info(`${prefix}✅ Validation passed`);
    if (validationResult.warnings && validationResult.warnings.length > 0) {
      log.warn(`${prefix}⚠️ Warnings:`, validationResult.warnings);
    }
  } else {
    log.error(`${prefix}❌ Validation failed`);
    log.error(`${prefix}Errors:`, validationResult.errors);
    if (validationResult.warnings && validationResult.warnings.length > 0) {
      log.warn(`${prefix}Warnings:`, validationResult.warnings);
    }
  }

  if (validationResult.summary) {
    log.info(`${prefix}Summary:`, validationResult.summary);
  }
}

/**
 * 検証エラーの詳細レポートを生成する
 * @param {Object} validationResult - 検証結果
 * @returns {string} レポート文字列
 */
export function generateValidationReport(validationResult) {
  const lines = [];

  lines.push('=== Importance Settings Validation Report ===');
  lines.push(`Validation Status: ${validationResult.isValid ? 'PASSED' : 'FAILED'}`);
  lines.push('');

  if (validationResult.summary) {
    lines.push('Summary:');
    lines.push(`  Total items checked: ${validationResult.summary.totalChecked}`);
    lines.push(`  Errors: ${validationResult.summary.errorsCount}`);
    lines.push(`  Warnings: ${validationResult.summary.warningsCount}`);
    lines.push('');
  }

  if (validationResult.errors && validationResult.errors.length > 0) {
    lines.push('Errors:');
    validationResult.errors.forEach((error, index) => {
      lines.push(`  ${index + 1}. ${error}`);
    });
    lines.push('');
  }

  if (validationResult.warnings && validationResult.warnings.length > 0) {
    lines.push('Warnings:');
    validationResult.warnings.forEach((warning, index) => {
      lines.push(`  ${index + 1}. ${warning}`);
    });
    lines.push('');
  }

  lines.push(`Report generated at: ${new Date().toISOString()}`);

  return lines.join('\n');
}

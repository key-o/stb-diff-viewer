/**
 * @fileoverview 断面データバリデーター
 *
 * 正規化されたデータが妥当であることを検証します。
 * データ消費者（ProfileBased generators等）が安全にデータを使用できることを保証します。
 *
 * 検証項目:
 * - 断面タイプが許容される値であること
 * - 寸法が妥当な範囲内であること（正の値、上限チェック等）
 * - 必須プロパティが存在すること
 * - データ型が正しいこと
 */

import { SECTION_TYPE } from '../../common-stb/section/sectionTypeUtil.js';
import {
  getSectionType,
  getWidth,
  getHeight,
  getDiameter,
  getThickness,
  isCircularSection,
} from '../accessors/sectionDataAccessor.js';

/**
 * バリデーション設定
 */
export const VALIDATION_CONFIG = {
  // 寸法の妥当な範囲（mm単位）
  dimensions: {
    min: 0.1, // 最小値: 0.1mm（ほぼゼロだが完全にゼロではない）
    max: 100000, // 最大値: 100m（構造部材として現実的な上限）
  },

  // 許容される断面タイプ（SECTION_TYPEから自動生成）
  allowedSectionTypes: Object.keys(SECTION_TYPE),

  // 警告を出す範囲（異常値の可能性）
  warningThresholds: {
    minWidth: 10, // 10mm未満は警告
    maxWidth: 10000, // 10m超は警告
    minHeight: 10, // 10mm未満は警告
    maxHeight: 50000, // 50m超は警告
    minDiameter: 10, // 10mm未満は警告
    maxDiameter: 5000, // 5m超は警告
    minThickness: 1, // 1mm未満は警告
    maxThickness: 1000, // 1m超は警告
  },
};

/**
 * バリデーション結果の型定義
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - 全体の妥当性
 * @property {string[]} errors - エラーメッセージ（データとして使用不可）
 * @property {string[]} warnings - 警告メッセージ（使用可能だが確認推奨）
 * @property {Object} checkedValues - チェックした値
 */

/**
 * 断面データを包括的にバリデーション
 *
 * @param {Object} sectionData - 検証対象の断面データ
 * @param {string} elementType - 要素タイプ（'Column', 'Beam'等）
 * @returns {ValidationResult} バリデーション結果
 */
export function validateSectionDataComprehensive(sectionData, elementType = 'Unknown') {
  const errors = [];
  const warnings = [];
  const checkedValues = {};

  if (!sectionData) {
    return {
      valid: false,
      errors: ['Section data is null or undefined'],
      warnings: [],
      checkedValues: {},
    };
  }

  // 1. 断面タイプのバリデーション
  const sectionTypeValidation = validateSectionType(sectionData);
  checkedValues.sectionType = sectionTypeValidation.value;
  errors.push(...sectionTypeValidation.errors);
  warnings.push(...sectionTypeValidation.warnings);

  // 2. 寸法のバリデーション
  const dimensionValidation = validateDimensions(sectionData, elementType);
  checkedValues.dimensions = dimensionValidation.values;
  errors.push(...dimensionValidation.errors);
  warnings.push(...dimensionValidation.warnings);

  // 3. データ型のバリデーション
  const typeValidation = validateDataTypes(sectionData);
  errors.push(...typeValidation.errors);
  warnings.push(...typeValidation.warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checkedValues,
  };
}

/**
 * 断面タイプのバリデーション
 *
 * @param {Object} sectionData - 断面データ
 * @returns {Object} バリデーション結果
 */
export function validateSectionType(sectionData) {
  const errors = [];
  const warnings = [];
  const sectionType = getSectionType(sectionData);

  if (!sectionType) {
    errors.push('Section type is missing');
    return { errors, warnings, value: undefined };
  }

  // 型チェック
  if (typeof sectionType !== 'string') {
    errors.push(`Section type must be a string, got ${typeof sectionType}`);
    return { errors, warnings, value: sectionType };
  }

  // 大文字チェック（正規化済みであるべき）
  if (sectionType !== sectionType.toUpperCase()) {
    warnings.push(
      `Section type "${sectionType}" is not uppercase. It should be normalized to "${sectionType.toUpperCase()}"`,
    );
  }

  // 許容される値のチェック
  if (!VALIDATION_CONFIG.allowedSectionTypes.includes(sectionType)) {
    // エイリアスの可能性をチェック
    const normalized = sectionType.toUpperCase();
    if (VALIDATION_CONFIG.allowedSectionTypes.includes(normalized)) {
      warnings.push(`Section type "${sectionType}" should be normalized to "${normalized}"`);
    } else {
      warnings.push(
        `Unknown section type: "${sectionType}". Allowed types: ${VALIDATION_CONFIG.allowedSectionTypes.join(', ')}`,
      );
    }
  }

  return { errors, warnings, value: sectionType };
}

/**
 * 寸法のバリデーション
 *
 * @param {Object} sectionData - 断面データ
 * @param {string} elementType - 要素タイプ
 * @returns {Object} バリデーション結果
 */
export function validateDimensions(sectionData, _elementType) {
  const errors = [];
  const warnings = [];
  const values = {};

  // まず、生の dimensions 値を直接チェック（NaN, Infinity等の検出）
  const rawDimsValidation = validateRawDimensionValues(sectionData);
  errors.push(...rawDimsValidation.errors);

  const isCircular = isCircularSection(sectionData);

  if (isCircular) {
    // 円形断面: 直径が必須
    const diameter = getDiameter(sectionData);
    values.diameter = diameter;

    if (diameter === undefined) {
      errors.push('Circular section is missing diameter');
    } else {
      const dimValidation = validateDimensionValue(diameter, 'diameter');
      errors.push(...dimValidation.errors);
      warnings.push(...dimValidation.warnings);
    }

    // 肉厚（オプション、鋼管の場合）
    const thickness = getThickness(sectionData);
    if (thickness !== undefined) {
      values.thickness = thickness;
      const thickValidation = validateDimensionValue(thickness, 'thickness');
      errors.push(...thickValidation.errors);
      warnings.push(...thickValidation.warnings);

      // 肉厚が直径より大きい場合はエラー
      if (diameter !== undefined && thickness >= diameter / 2) {
        errors.push(`Thickness (${thickness}mm) must be less than radius (${diameter / 2}mm)`);
      }
    }
  } else {
    // 矩形断面: 幅と高さが必須
    const width = getWidth(sectionData);
    const height = getHeight(sectionData);
    values.width = width;
    values.height = height;

    if (width === undefined && height === undefined) {
      errors.push('Section is missing both width and height');
    } else {
      if (width !== undefined) {
        const widthValidation = validateDimensionValue(width, 'width');
        errors.push(...widthValidation.errors);
        warnings.push(...widthValidation.warnings);
      } else {
        warnings.push('Width is missing (only height specified)');
      }

      if (height !== undefined) {
        const heightValidation = validateDimensionValue(height, 'height');
        errors.push(...heightValidation.errors);
        warnings.push(...heightValidation.warnings);
      } else {
        warnings.push('Height is missing (only width specified)');
      }
    }

    // 肉厚（オプション、鋼材の場合）
    const thickness = getThickness(sectionData);
    if (thickness !== undefined) {
      values.thickness = thickness;
      const thickValidation = validateDimensionValue(thickness, 'thickness');
      errors.push(...thickValidation.errors);
      warnings.push(...thickValidation.warnings);
    }
  }

  return { errors, warnings, values };
}

/**
 * 生のdimension値を直接チェック（NaN, Infinity等の検出）
 *
 * @param {Object} sectionData - 断面データ
 * @returns {Object} バリデーション結果
 */
function validateRawDimensionValues(sectionData) {
  const errors = [];

  if (!sectionData) return { errors };

  // dimensions オブジェクトまたは直接プロパティを取得
  const dims = sectionData.dimensions || sectionData;

  // 全ての数値プロパティをチェック
  const numericProps = [
    'width',
    'Width',
    'width_X',
    'width_Y',
    'height',
    'Height',
    'A',
    'B',
    'H',
    'h',
    'D',
    'd',
    'diameter',
    'Diameter',
    'thickness',
    't',
    't1',
    't2',
  ];

  for (const prop of numericProps) {
    if (prop in dims) {
      const value = dims[prop];

      // NaNチェック
      if (typeof value === 'number' && isNaN(value)) {
        errors.push(`${prop} is NaN (Not a Number)`);
      }

      // Infinityチェック
      if (value === Infinity || value === -Infinity) {
        errors.push(`${prop} is Infinity`);
      }
    }
  }

  return { errors };
}

/**
 * 個別の寸法値をバリデーション
 *
 * @param {number} value - 寸法値
 * @param {string} dimensionName - 寸法名（'width', 'height', 'diameter'等）
 * @returns {Object} バリデーション結果
 */
export function validateDimensionValue(value, dimensionName) {
  const errors = [];
  const warnings = [];

  // 数値型チェック
  const numValue = parseFloat(value);
  if (!isFinite(numValue)) {
    errors.push(`${dimensionName} must be a finite number, got "${value}"`);
    return { errors, warnings };
  }

  // 負の値チェック
  if (numValue < 0) {
    errors.push(`${dimensionName} must be positive, got ${numValue}mm`);
    return { errors, warnings };
  }

  // ゼロチェック
  if (numValue === 0) {
    errors.push(`${dimensionName} cannot be zero`);
    return { errors, warnings };
  }

  // 最小値チェック
  if (numValue < VALIDATION_CONFIG.dimensions.min) {
    errors.push(
      `${dimensionName} (${numValue}mm) is below minimum (${VALIDATION_CONFIG.dimensions.min}mm)`,
    );
  }

  // 最大値チェック
  if (numValue > VALIDATION_CONFIG.dimensions.max) {
    errors.push(
      `${dimensionName} (${numValue}mm) exceeds maximum (${VALIDATION_CONFIG.dimensions.max}mm)`,
    );
  }

  // 警告範囲チェック
  const warningKey = `min${dimensionName.charAt(0).toUpperCase() + dimensionName.slice(1)}`;
  const minWarning = VALIDATION_CONFIG.warningThresholds[warningKey];
  const maxWarningKey = warningKey.replace('min', 'max');
  const maxWarning = VALIDATION_CONFIG.warningThresholds[maxWarningKey];

  if (minWarning && numValue < minWarning) {
    warnings.push(
      `${dimensionName} (${numValue}mm) is unusually small (< ${minWarning}mm). Please verify.`,
    );
  }

  if (maxWarning && numValue > maxWarning) {
    warnings.push(
      `${dimensionName} (${numValue}mm) is unusually large (> ${maxWarning}mm). Please verify.`,
    );
  }

  return { errors, warnings };
}

/**
 * データ型のバリデーション
 *
 * @param {Object} sectionData - 断面データ
 * @returns {Object} バリデーション結果
 */
export function validateDataTypes(sectionData) {
  const errors = [];
  const warnings = [];

  if (typeof sectionData !== 'object') {
    errors.push(`Section data must be an object, got ${typeof sectionData}`);
    return { errors, warnings };
  }

  if (Array.isArray(sectionData)) {
    errors.push('Section data must be an object, not an array');
    return { errors, warnings };
  }

  return { errors, warnings };
}

/**
 * バリデーション結果をフォーマットして出力
 *
 * @param {ValidationResult} result - バリデーション結果
 * @param {string} sectionId - 断面ID（ログ用）
 * @returns {string} フォーマットされたメッセージ
 */
export function formatValidationResult(result, sectionId = 'unknown') {
  const lines = [`Validation result for section "${sectionId}":`];

  if (result.valid) {
    lines.push('✓ Valid');
  } else {
    lines.push('✗ Invalid');
  }

  if (result.errors.length > 0) {
    lines.push('\nErrors:');
    result.errors.forEach((error, i) => {
      lines.push(`  ${i + 1}. ${error}`);
    });
  }

  if (result.warnings.length > 0) {
    lines.push('\nWarnings:');
    result.warnings.forEach((warning, i) => {
      lines.push(`  ${i + 1}. ${warning}`);
    });
  }

  if (Object.keys(result.checkedValues).length > 0) {
    lines.push('\nChecked values:');
    Object.entries(result.checkedValues).forEach(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        lines.push(`  ${key}:`);
        Object.entries(value).forEach(([k, v]) => {
          lines.push(`    ${k}: ${v}`);
        });
      } else {
        lines.push(`  ${key}: ${value}`);
      }
    });
  }

  return lines.join('\n');
}

/**
 * 簡易バリデーション（後方互換性のため）
 * sectionDataAccessor.jsのvalidateSectionDataと同等
 *
 * @param {Object} sectionData - 断面データ
 * @returns {Object} 簡易バリデーション結果 { valid, errors }
 */
export function validateSectionDataSimple(sectionData) {
  const result = validateSectionDataComprehensive(sectionData);
  return {
    valid: result.valid,
    errors: result.errors,
  };
}

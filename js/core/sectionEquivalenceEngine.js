/**
 * @fileoverview 断面等価性評価エンジン
 *
 * このモジュールは、モデルA/B間の構造要素の断面を比較し、
 * 構造的に等価かどうかを評価する機能を提供します。
 *
 * **主要機能**:
 * - 断面タイプの正規化と互換性判定
 * - 形状パラメータの比較（許容誤差考慮）
 * - 材質・強度の比較
 * - 評価結果の詳細レポート生成
 *
 * @module sectionEquivalenceEngine
 */

import { normalizeSectionType } from '../common/sectionTypeUtil.js';

/**
 * 断面等価性評価の設定
 */
export const EQUIVALENCE_CONFIG = {
  // 許容誤差（パーセント）
  tolerances: {
    dimension: 1.0,      // 寸法: 1%
    strength: 5.0,       // 強度: 5%
    area: 2.0,           // 断面積: 2%
    moment: 3.0          // 断面二次モーメント: 3%
  },

  // 材質の互換性マッピング
  materialCompatibility: {
    'SS400': ['SS400', 'SN400'],
    'SN400': ['SS400', 'SN400', 'SN490'],
    'SN490': ['SN490', 'SM490', 'SN400'],
    'SM490': ['SM490', 'SN490'],
    'SS540': ['SS540'],
    // コンクリート
    'FC18': ['FC18'],
    'FC21': ['FC21'],
    'FC24': ['FC24'],
    'FC27': ['FC27'],
    'FC30': ['FC30'],
    'FC33': ['FC33'],
    'FC36': ['FC36']
  },

  // 断面タイプの互換性マッピング
  sectionTypeCompatibility: {
    'H': ['H', 'I'],
    'I': ['H', 'I'],
    'BOX': ['BOX', 'SQUARE'],
    'SQUARE': ['BOX', 'SQUARE'],
    'PIPE': ['PIPE', 'ROUND'],
    'ROUND': ['PIPE', 'ROUND'],
    'C': ['C', 'CHANNEL'],
    'CHANNEL': ['C', 'CHANNEL'],
    'L': ['L'],
    'T': ['T'],
    'RECTANGLE': ['RECTANGLE'],
    'CIRCLE': ['CIRCLE'],
    'CFT': ['CFT'],
    'stb-diff-viewer': ['stb-diff-viewer']
  }
};

/**
 * 断面データを評価用に正規化
 *
 * @param {Object} sectionData - 断面データオブジェクト
 * @param {string} elementType - 要素タイプ（'Column', 'Beam'等）
 * @returns {Object} 正規化された断面データ
 */
export function normalizeSectionData(sectionData, elementType) {
  if (!sectionData || typeof sectionData !== 'object') {
    return null;
  }

  return {
    type: normalizeSectionType(
      sectionData.type ||
      sectionData.section_type ||
      sectionData.profile_type ||
      sectionData.sectionType  // キャメルケース形式もサポート
    ),
    material: (sectionData.material || sectionData.strength_name || '')?.toString().trim().toUpperCase(),
    dimensions: extractDimensions(sectionData, elementType),
    properties: extractProperties(sectionData)
  };
}

/**
 * 2つの断面の等価性を評価
 *
 * @param {Object} sectionA - モデルAの断面データ
 * @param {Object} sectionB - モデルBの断面データ
 * @param {string} elementType - 要素タイプ（'Column', 'Beam'等）
 * @returns {Object} 評価結果 {isEquivalent, checks, summary, passRate}
 */
export function evaluateSectionEquivalence(sectionA, sectionB, elementType) {
  if (!sectionA || !sectionB) {
    return {
      isEquivalent: false,
      checks: [],
      summary: 'Missing section data',
      passRate: '0.0'
    };
  }

  // 正規化
  const normA = normalizeSectionData(sectionA, elementType);
  const normB = normalizeSectionData(sectionB, elementType);

  if (!normA || !normB) {
    return {
      isEquivalent: false,
      checks: [],
      summary: 'Failed to normalize section data',
      passRate: '0.0'
    };
  }

  // チェック実行
  const checks = [
    checkSectionType(normA, normB),
    checkDimensions(normA, normB),
    checkMaterial(normA, normB),
    checkStrength(normA, normB),
    checkProperties(normA, normB)
  ];

  // 結果集計
  const passedChecks = checks.filter(c => c.passed).length;
  const totalChecks = checks.length;
  const isEquivalent = passedChecks === totalChecks;

  return {
    isEquivalent,
    checks,
    summary: `${passedChecks} / ${totalChecks} checks passed`,
    passRate: (passedChecks / totalChecks * 100).toFixed(1)
  };
}

/**
 * 断面タイプのチェック
 *
 * @param {Object} normA - 正規化された断面Aのデータ
 * @param {Object} normB - 正規化された断面Bのデータ
 * @returns {Object} チェック結果
 */
function checkSectionType(normA, normB) {
  const typeA = normA.type;
  const typeB = normB.type;

  if (!typeA || !typeB) {
    return {
      category: 'Section Type',
      name: 'Type Data',
      passed: false,
      details: 'Missing section type data'
    };
  }

  // 完全一致
  if (typeA === typeB) {
    return {
      category: 'Section Type',
      name: 'Type Match',
      passed: true,
      details: `Both: ${typeA}`
    };
  }

  // 互換性チェック
  const compatibleTypes = EQUIVALENCE_CONFIG.sectionTypeCompatibility[typeA] || [];
  const isCompatible = compatibleTypes.includes(typeB);

  return {
    category: 'Section Type',
    name: 'Type Compatibility',
    passed: isCompatible,
    details: isCompatible
      ? `Compatible: ${typeA} ≈ ${typeB}`
      : `Incompatible: ${typeA} ≠ ${typeB}`
  };
}

/**
 * 寸法のチェック
 *
 * @param {Object} normA - 正規化された断面Aのデータ
 * @param {Object} normB - 正規化された断面Bのデータ
 * @returns {Object} チェック結果
 */
function checkDimensions(normA, normB) {
  const dimA = normA.dimensions;
  const dimB = normB.dimensions;

  if (!dimA || !dimB || Object.keys(dimA).length === 0 || Object.keys(dimB).length === 0) {
    return {
      category: 'Dimensions',
      name: 'Dimension Data',
      passed: true, // データがない場合はスキップ
      details: 'No dimension data available',
      subChecks: []
    };
  }

  const subChecks = [];
  const tolerance = EQUIVALENCE_CONFIG.tolerances.dimension;

  // 共通の寸法キーをチェック
  const commonKeys = Object.keys(dimA).filter(k => k in dimB);

  if (commonKeys.length === 0) {
    return {
      category: 'Dimensions',
      name: 'Dimension Data',
      passed: true,
      details: 'No common dimensions to compare',
      subChecks: []
    };
  }

  for (const key of commonKeys) {
    const valA = parseFloat(dimA[key]);
    const valB = parseFloat(dimB[key]);

    if (isNaN(valA) || isNaN(valB)) continue;

    const diff = Math.abs(valA - valB);
    const diffPercent = valA !== 0 ? (diff / Math.abs(valA) * 100) : 0;
    const passed = diffPercent <= tolerance;

    subChecks.push({
      name: key,
      passed,
      details: `${valA.toFixed(1)} vs ${valB.toFixed(1)} (${diffPercent.toFixed(2)}%)`
    });
  }

  const allPassed = subChecks.every(c => c.passed);

  return {
    category: 'Dimensions',
    name: 'Dimension Comparison',
    passed: allPassed,
    subChecks,
    details: allPassed
      ? `All ${subChecks.length} dimensions within ${tolerance}% tolerance`
      : `Some dimensions exceed ${tolerance}% tolerance`
  };
}

/**
 * 材質のチェック
 *
 * @param {Object} normA - 正規化された断面Aのデータ
 * @param {Object} normB - 正規化された断面Bのデータ
 * @returns {Object} チェック結果
 */
function checkMaterial(normA, normB) {
  const matA = normA.material;
  const matB = normB.material;

  if (!matA || !matB) {
    return {
      category: 'Material',
      name: 'Material Data',
      passed: true, // データがない場合はスキップ
      details: 'Material data not available'
    };
  }

  // 完全一致
  if (matA === matB) {
    return {
      category: 'Material',
      name: 'Material Match',
      passed: true,
      details: `Both: ${matA}`
    };
  }

  // 互換性チェック
  const compatibleMaterials = EQUIVALENCE_CONFIG.materialCompatibility[matA] || [];
  const isCompatible = compatibleMaterials.includes(matB);

  return {
    category: 'Material',
    name: 'Material Compatibility',
    passed: isCompatible,
    details: isCompatible
      ? `Compatible: ${matA} ≈ ${matB}`
      : `Incompatible: ${matA} ≠ ${matB}`
  };
}

/**
 * 強度のチェック
 *
 * @param {Object} normA - 正規化された断面Aのデータ
 * @param {Object} normB - 正規化された断面Bのデータ
 * @returns {Object} チェック結果
 */
function checkStrength(normA, normB) {
  // 材質から強度を推定
  const strengthA = estimateStrength(normA.material);
  const strengthB = estimateStrength(normB.material);

  if (!strengthA || !strengthB) {
    return {
      category: 'Strength',
      name: 'Strength Data',
      passed: true, // データがない場合はスキップ
      details: 'Strength data not available'
    };
  }

  const tolerance = EQUIVALENCE_CONFIG.tolerances.strength;
  const diff = Math.abs(strengthA - strengthB);
  const diffPercent = strengthA !== 0 ? (diff / strengthA * 100) : 0;
  const passed = diffPercent <= tolerance;

  return {
    category: 'Strength',
    name: 'Yield Strength',
    passed,
    details: `${strengthA} vs ${strengthB} N/mm² (${diffPercent.toFixed(1)}%)`
  };
}

/**
 * 断面性能のチェック
 *
 * @param {Object} normA - 正規化された断面Aのデータ
 * @param {Object} normB - 正規化された断面Bのデータ
 * @returns {Object} チェック結果
 */
function checkProperties(normA, normB) {
  const propA = normA.properties;
  const propB = normB.properties;

  if (!propA || !propB || Object.keys(propA).length === 0 || Object.keys(propB).length === 0) {
    return {
      category: 'Properties',
      name: 'Property Data',
      passed: true, // データがない場合はスキップ
      details: 'Property data not available',
      subChecks: []
    };
  }

  const subChecks = [];

  // 断面積チェック
  if (propA.area && propB.area) {
    const areaA = parseFloat(propA.area);
    const areaB = parseFloat(propB.area);

    if (!isNaN(areaA) && !isNaN(areaB)) {
      const tolerance = EQUIVALENCE_CONFIG.tolerances.area;
      const diff = Math.abs(areaA - areaB);
      const diffPercent = areaA !== 0 ? (diff / areaA * 100) : 0;
      const passed = diffPercent <= tolerance;

      subChecks.push({
        name: 'Area',
        passed,
        details: `${areaA.toFixed(1)} vs ${areaB.toFixed(1)} mm² (${diffPercent.toFixed(1)}%)`
      });
    }
  }

  const allPassed = subChecks.length === 0 || subChecks.every(c => c.passed);

  return {
    category: 'Properties',
    name: 'Section Properties',
    passed: allPassed,
    subChecks,
    details: subChecks.length > 0
      ? `${subChecks.filter(c => c.passed).length} / ${subChecks.length} properties OK`
      : 'No properties to check'
  };
}

/**
 * 寸法を抽出
 *
 * @param {Object} sectionData - 断面データ
 * @param {string} elementType - 要素タイプ
 * @returns {Object} 抽出された寸法データ
 */
function extractDimensions(sectionData, elementType) {
  if (!sectionData) return {};

  // ネストされたdimensionsオブジェクトがある場合はそれを使用、なければsectionData自体を使用
  const dims = sectionData.dimensions || sectionData;

  // 断面タイプに応じた寸法抽出
  const type = normalizeSectionType(sectionData.type || sectionData.section_type || sectionData.profile_type);
  const result = {};

  switch (type) {
    case 'H':
    case 'I':
      if (dims.A || dims.height) result.height = dims.A || dims.height;
      if (dims.B || dims.width) result.width = dims.B || dims.width;
      if (dims.t1 || dims.tw || dims.webThickness) {
        result.webThickness = dims.t1 || dims.tw || dims.webThickness;
      }
      if (dims.t2 || dims.tf || dims.flangeThickness) {
        result.flangeThickness = dims.t2 || dims.tf || dims.flangeThickness;
      }
      break;

    case 'BOX':
    case 'SQUARE':
      if (dims.A || dims.height) result.height = dims.A || dims.height;
      if (dims.B || dims.width) result.width = dims.B || dims.width;
      if (dims.t || dims.thickness) result.thickness = dims.t || dims.thickness;
      break;

    case 'PIPE':
    case 'ROUND':
      if (dims.D || dims.diameter) result.diameter = dims.D || dims.diameter;
      if (dims.t || dims.thickness) result.thickness = dims.t || dims.thickness;
      break;

    case 'RECTANGLE':
      if (dims.width || dims.D || dims.B) {
        result.width = dims.width || dims.D || dims.B;
      }
      if (dims.height || dims.depth || dims.D2 || dims.A) {
        result.height = dims.height || dims.depth || dims.D2 || dims.A;
      }
      break;

    case 'CIRCLE':
      if (dims.diameter || dims.D) {
        result.diameter = dims.diameter || dims.D;
      }
      break;

    default:
      // 未知のタイプの場合、一般的な寸法を抽出
      if (dims.A) result.A = dims.A;
      if (dims.B) result.B = dims.B;
      if (dims.D) result.D = dims.D;
      if (dims.t) result.t = dims.t;
      if (dims.width) result.width = dims.width;
      if (dims.height) result.height = dims.height;
      break;
  }

  return result;
}

/**
 * 断面性能を抽出
 *
 * @param {Object} sectionData - 断面データ
 * @returns {Object} 抽出された断面性能データ
 */
function extractProperties(sectionData) {
  if (!sectionData) return {};

  const result = {};

  if (sectionData.area || sectionData.A_section) {
    result.area = sectionData.area || sectionData.A_section;
  }
  if (sectionData.Iy || sectionData.moment_y) {
    result.momentY = sectionData.Iy || sectionData.moment_y;
  }
  if (sectionData.Iz || sectionData.moment_z) {
    result.momentZ = sectionData.Iz || sectionData.moment_z;
  }

  return result;
}

/**
 * 材質から降伏強度を推定
 *
 * @param {string} material - 材質名
 * @returns {number|null} 推定降伏強度 (N/mm²)、または推定不可の場合はnull
 */
function estimateStrength(material) {
  if (!material) return null;

  const mat = material.toUpperCase();

  const strengthMap = {
    // 鋼材
    'SS400': 235,
    'SN400': 235,
    'SN490': 325,
    'SM490': 325,
    'SS540': 400,
    'SN400B': 235,
    'SN400C': 235,
    'SN490B': 325,
    'SN490C': 325,
    // コンクリート（圧縮強度）
    'FC18': 18,
    'FC21': 21,
    'FC24': 24,
    'FC27': 27,
    'FC30': 30,
    'FC33': 33,
    'FC36': 36,
    'FC40': 40,
    'FC45': 45,
    'FC50': 50
  };

  return strengthMap[mat] || null;
}

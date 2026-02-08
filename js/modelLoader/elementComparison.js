/**
 * @fileoverview 要素比較・処理モジュール
 *
 * このモジュールはモデル間の構造要素比較を処理します：
 * - 要素解析と抽出
 * - モデル比較ロジック実行
 * - 要素分類（共通、Aのみ、Bのみ）
 * - レンダリング用境界計算
 *
 * 保守性向上のため、巨大なcompareModels()関数から抽出されました。
 */

import * as THREE from 'three';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('modelLoader:comparison');
import { parseElements } from '../common-stb/parser/stbXmlParser.js';
import {
  compareElements,
  compareElementsWithImportance,
  compareElementsWithTolerance,
  lineElementKeyExtractor,
  polyElementKeyExtractor,
  nodeElementKeyExtractor,
} from '../common-stb/comparison/comparator.js';
import { SUPPORTED_ELEMENTS } from '../constants/elementTypes.js';
import { COMPARISON_KEY_TYPE } from '../config/comparisonKeyConfig.js';
import { getToleranceConfig } from '../config/toleranceConfig.js';
import { getImportanceManager } from '../app/importanceManager.js';

/**
 * Process element comparison for all supported element types
 * @param {Object} modelData - Model data from processing
 * @param {Array<string>} selectedElementTypes - Selected element types
 * @param {Object} options - Comparison options
 * @param {boolean} [options.useImportanceFiltering=true] - Use importance-based filtering
 * @param {string[]} [options.targetImportanceLevels=null] - Target importance levels for filtering
 * @param {string} [options.comparisonKeyType] - Comparison key type (POSITION_BASED or GUID_BASED)
 * @returns {Object} Comparison results
 */
export function processElementComparison(modelData, selectedElementTypes, options = {}) {
  const { modelADocument, modelBDocument, nodeMapA, nodeMapB } = modelData;

  const comparisonResults = new Map();
  const modelBounds = new THREE.Box3();

  const { comparisonKeyType = COMPARISON_KEY_TYPE.POSITION_BASED } = options;

  for (const elementType of SUPPORTED_ELEMENTS) {
    if (elementType === 'Axis' || elementType === 'Story') continue;

    const isSelected = selectedElementTypes.includes(elementType);

    let elementsA = [];
    let elementsB = [];

    // Undefined要素は特別な処理が必要（StbUndefinedタグは存在しない）
    // stbStructureReader.jsのparseStbFileで抽出されたundefinedElementsを使用
    // ここでは空の結果を返し、viewModes.jsのredrawUndefinedElementsForViewModeで処理
    if (elementType === 'Undefined') {
      comparisonResults.set(elementType, {
        matched: [],
        onlyA: [],
        onlyB: [],
        elementType,
        isSelected,
        elementsA: [],
        elementsB: [],
      });
      continue;
    }

    try {
      // Parse elements from both models
      elementsA = parseElements(modelADocument, 'Stb' + elementType);
      elementsB = parseElements(modelBDocument, 'Stb' + elementType);

      // Perform comparison with importance options
      const comparisonResult = compareElementsByType(
        elementType,
        elementsA,
        elementsB,
        nodeMapA,
        nodeMapB,
        { ...options, comparisonKeyType },
      );

      // Store comparison result
      comparisonResults.set(elementType, {
        ...comparisonResult,
        elementType,
        isSelected,
        elementsA,
        elementsB,
      });
    } catch (error) {
      logger.error(`Error processing ${elementType}:`, error);
      logger.error(`Error stack:`, error.stack);
      logger.error(`Elements A length: ${elementsA ? elementsA.length : 'undefined'}`);
      logger.error(`Elements B length: ${elementsB ? elementsB.length : 'undefined'}`);
      logger.error(`Node map A size: ${nodeMapA ? nodeMapA.size : 'undefined'}`);
      logger.error(`Node map B size: ${nodeMapB ? nodeMapB.size : 'undefined'}`);
      comparisonResults.set(elementType, {
        matched: [],
        onlyA: [],
        onlyB: [],
        elementType,
        isSelected,
        elementsA: elementsA || [],
        elementsB: elementsB || [],
        error: error.message,
      });
    }
  }

  return {
    comparisonResults,
    modelBounds,
  };
}

/**
 * Compare elements by their type using appropriate key extractor
 * @param {string} elementType - Type of element
 * @param {Array} elementsA - Elements from model A
 * @param {Array} elementsB - Elements from model B
 * @param {Map} nodeMapA - Node map for model A
 * @param {Map} nodeMapB - Node map for model B
 * @param {Object} options - Comparison options
 * @param {boolean} [options.useImportanceFiltering=true] - Use importance-based filtering
 * @param {string[]} [options.targetImportanceLevels=null] - Target importance levels for filtering
 * @param {string} [options.comparisonKeyType] - Comparison key type (POSITION_BASED or GUID_BASED)
 * @returns {Object} Comparison result
 */
function compareElementsByType(
  elementType,
  elementsA,
  elementsB,
  nodeMapA,
  nodeMapB,
  options = {},
) {
  const {
    useImportanceFiltering = true,
    targetImportanceLevels = null,
    comparisonKeyType = COMPARISON_KEY_TYPE.POSITION_BASED,
  } = options;

  let comparisonResult = null;

  // Get tolerance configuration
  const toleranceConfig = getToleranceConfig();
  const useToleranceComparison = toleranceConfig.enabled && !toleranceConfig.strictMode;

  // Create comparison function based on tolerance and importance filtering settings
  const performComparison = (keyExtractor) => {
    try {
      // Use tolerance-based comparison if enabled
      if (useToleranceComparison) {
        const toleranceResult = compareElementsWithTolerance(
          elementsA,
          elementsB,
          nodeMapA,
          nodeMapB,
          keyExtractor,
          toleranceConfig,
        );

        // Convert 5-level tolerance result to 3-level result for compatibility
        // TODO: Update rendering pipeline to support 5-level classification
        return {
          matched: [...toleranceResult.exact, ...toleranceResult.withinTolerance],
          onlyA: toleranceResult.onlyA,
          onlyB: toleranceResult.onlyB,
          // Preserve tolerance-specific data for future use
          _toleranceData: {
            exact: toleranceResult.exact,
            withinTolerance: toleranceResult.withinTolerance,
            mismatch: toleranceResult.mismatch,
          },
        };
      }

      // Use importance-based comparison
      if (useImportanceFiltering) {
        const manager = getImportanceManager();
        // マネージャーの依存性（isInitialized）を隠蔽して関数のみ渡す
        const importanceLookup = manager.isInitialized
          ? (path) => manager.getImportanceLevel(path)
          : null;

        return compareElementsWithImportance(
          elementsA,
          elementsB,
          nodeMapA,
          nodeMapB,
          keyExtractor,
          'Stb' + elementType,
          { targetImportanceLevels, importanceLookup },
        );
      } else {
        return compareElements(elementsA, elementsB, nodeMapA, nodeMapB, keyExtractor);
      }
    } catch (error) {
      logger.error(`Error in performComparison for ${elementType}:`, error);
      throw error;
    }
  };

  try {
    switch (elementType) {
      case 'Node':
        comparisonResult = performComparison(nodeElementKeyExtractor);
        break;

      case 'Column':
        comparisonResult = performComparison((el, nm) =>
          lineElementKeyExtractor(el, nm, 'id_node_bottom', 'id_node_top', comparisonKeyType),
        );
        break;

      case 'Post':
        comparisonResult = performComparison((el, nm) =>
          lineElementKeyExtractor(el, nm, 'id_node_bottom', 'id_node_top', comparisonKeyType),
        );
        break;

      case 'Girder':
      case 'Beam':
        comparisonResult = performComparison((el, nm) =>
          lineElementKeyExtractor(el, nm, 'id_node_start', 'id_node_end', comparisonKeyType),
        );
        break;

      case 'Brace':
        comparisonResult = performComparison((el, nm) =>
          lineElementKeyExtractor(el, nm, 'id_node_start', 'id_node_end', comparisonKeyType),
        );
        break;

      case 'Slab':
      case 'Wall':
        comparisonResult = performComparison((el, nm) =>
          polyElementKeyExtractor(el, nm, 'StbNodeIdOrder', comparisonKeyType),
        );
        break;

      case 'Pile':
        // Pile要素は2ノード形式（id_node_bottom/top）または1ノード形式（id_node + level_top）
        // lineElementKeyExtractorは1ノード形式にもフォールバック対応
        comparisonResult = performComparison((el, nm) =>
          lineElementKeyExtractor(el, nm, 'id_node_bottom', 'id_node_top', comparisonKeyType),
        );
        break;

      case 'Footing':
        // Footing要素は1ノード形式（id_node + level_bottom）
        // lineElementKeyExtractorの1ノードフォールバックで対応
        comparisonResult = performComparison((el, nm) =>
          lineElementKeyExtractor(el, nm, 'id_node_bottom', 'id_node_top', comparisonKeyType),
        );
        break;

      case 'FoundationColumn':
        comparisonResult = performComparison((el, nm) =>
          lineElementKeyExtractor(el, nm, 'id_node_bottom', 'id_node_top', comparisonKeyType),
        );
        break;

      case 'Parapet':
        comparisonResult = performComparison((el, nm) =>
          lineElementKeyExtractor(el, nm, 'id_node_start', 'id_node_end', comparisonKeyType),
        );
        break;

      case 'StripFooting':
        comparisonResult = performComparison((el, nm) =>
          lineElementKeyExtractor(el, nm, 'id_node_start', 'id_node_end', comparisonKeyType),
        );
        break;

      case 'Joint':
        // 継手は梁・柱に関連付けられた定義なので、IDベースで比較
        comparisonResult = performComparison((el) => el.id);
        break;

      default:
        logger.warn(`Unknown element type for comparison: ${elementType}`);
        comparisonResult = {
          matched: [],
          onlyA: [...elementsA],
          onlyB: [...elementsB],
        };
    }
  } catch (error) {
    logger.error(`Error in switch statement for ${elementType}:`, error);
    throw error;
  }

  return (
    comparisonResult || {
      matched: [],
      onlyA: [],
      onlyB: [],
    }
  );
}

/**
 * Calculate element bounds for camera fitting
 * @param {Map} comparisonResults - Results from element comparison
 * @param {Map} nodeMapA - Node map for model A
 * @param {Map} nodeMapB - Node map for model B
 * @returns {THREE.Box3} Combined bounding box
 */
export function calculateElementBounds(comparisonResults, nodeMapA, nodeMapB) {
  const bounds = new THREE.Box3();

  // Add all node positions to bounds
  for (const node of nodeMapA.values()) {
    bounds.expandByPoint(new THREE.Vector3(node.x, node.y, node.z));
  }

  for (const node of nodeMapB.values()) {
    bounds.expandByPoint(new THREE.Vector3(node.x, node.y, node.z));
  }

  // If bounds are empty, create a default bounds
  if (bounds.isEmpty()) {
    bounds.expandByPoint(new THREE.Vector3(-1000, -1000, -1000));
    bounds.expandByPoint(new THREE.Vector3(1000, 1000, 1000));
    logger.warn('No valid geometry found, using default bounds');
  }

  return bounds;
}

/**
 * Get element comparison statistics
 * @param {Map} comparisonResults - Results from element comparison
 * @returns {Object} Statistics summary
 */
export function getComparisonStatistics(comparisonResults) {
  const stats = {
    totalElements: 0,
    matchedElements: 0,
    onlyAElements: 0,
    onlyBElements: 0,
    elementTypes: {},
    selectedTypes: [],
    errors: [],
  };

  for (const [elementType, result] of comparisonResults.entries()) {
    const typeStats = {
      matched: result.matched.length,
      onlyA: result.onlyA.length,
      onlyB: result.onlyB.length,
      total: result.matched.length + result.onlyA.length + result.onlyB.length,
      isSelected: result.isSelected,
    };

    stats.elementTypes[elementType] = typeStats;
    stats.totalElements += typeStats.total;
    stats.matchedElements += typeStats.matched;
    stats.onlyAElements += typeStats.onlyA;
    stats.onlyBElements += typeStats.onlyB;

    if (result.isSelected) {
      stats.selectedTypes.push(elementType);
    }

    if (result.error) {
      stats.errors.push({
        elementType,
        error: result.error,
      });
    }
  }

  return stats;
}

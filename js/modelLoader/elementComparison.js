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
import { parseElements } from '../parser/stbXmlParser.js';
import {
  compareElements,
  compareElementsWithImportance,
  compareElementsWithTolerance,
  lineElementKeyExtractor,
  polyElementKeyExtractor,
  nodeElementKeyExtractor
} from '../comparator.js';
import { SUPPORTED_ELEMENTS } from '../viewer/index.js';
import { COMPARISON_KEY_TYPE } from '../config/comparisonKeyConfig.js';
import { getToleranceConfig } from '../config/toleranceConfig.js';

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
export function processElementComparison(
  modelData,
  selectedElementTypes,
  options = {}
) {
  const { modelADocument, modelBDocument, nodeMapA, nodeMapB } = modelData;

  const comparisonResults = new Map();
  const modelBounds = new THREE.Box3();

  const { comparisonKeyType = COMPARISON_KEY_TYPE.POSITION_BASED } = options;

  console.log('=== Starting Element Comparison ===');
  console.log('Supported elements:', SUPPORTED_ELEMENTS);
  console.log('Comparison key type:', comparisonKeyType);

  for (const elementType of SUPPORTED_ELEMENTS) {
    if (elementType === 'Axis' || elementType === 'Story') continue;

    const isSelected = selectedElementTypes.includes(elementType);
    console.log(`--- Processing ${elementType} (Selected: ${isSelected}) ---`);

    let elementsA = [];
    let elementsB = [];

    try {
      // Parse elements from both models
      elementsA = parseElements(modelADocument, 'Stb' + elementType);
      elementsB = parseElements(modelBDocument, 'Stb' + elementType);

      console.log(
        `${elementType} - Model A: ${elementsA.length}, Model B: ${elementsB.length}`
      );

      // Perform comparison with importance options
      const comparisonResult = compareElementsByType(
        elementType,
        elementsA,
        elementsB,
        nodeMapA,
        nodeMapB,
        { ...options, comparisonKeyType }
      );

      // Store comparison result
      comparisonResults.set(elementType, {
        ...comparisonResult,
        elementType,
        isSelected,
        elementsA,
        elementsB
      });

      console.log(`${elementType} comparison complete:`, {
        matched: comparisonResult.matched.length,
        onlyA: comparisonResult.onlyA.length,
        onlyB: comparisonResult.onlyB.length
      });
    } catch (error) {
      console.error(`Error processing ${elementType}:`, error);
      console.error(`Error stack:`, error.stack);
      console.error(
        `Elements A length: ${elementsA ? elementsA.length : 'undefined'}`
      );
      console.error(
        `Elements B length: ${elementsB ? elementsB.length : 'undefined'}`
      );
      console.error(
        `Node map A size: ${nodeMapA ? nodeMapA.size : 'undefined'}`
      );
      console.error(
        `Node map B size: ${nodeMapB ? nodeMapB.size : 'undefined'}`
      );
      comparisonResults.set(elementType, {
        matched: [],
        onlyA: [],
        onlyB: [],
        elementType,
        isSelected,
        elementsA: elementsA || [],
        elementsB: elementsB || [],
        error: error.message
      });
    }
  }

  console.log('=== Element Comparison Complete ===');

  return {
    comparisonResults,
    modelBounds
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
  options = {}
) {
  const {
    useImportanceFiltering = true,
    targetImportanceLevels = null,
    comparisonKeyType = COMPARISON_KEY_TYPE.POSITION_BASED
  } = options;

  let comparisonResult = null;

  console.log(`compareElementsByType called for ${elementType}:`, {
    elementsACount: elementsA.length,
    elementsBCount: elementsB.length,
    useImportanceFiltering,
    targetImportanceLevels
  });

  // Get tolerance configuration
  const toleranceConfig = getToleranceConfig();
  const useToleranceComparison = toleranceConfig.enabled && !toleranceConfig.strictMode;

  // Create comparison function based on tolerance and importance filtering settings
  const performComparison = (keyExtractor) => {
    try {
      // Use tolerance-based comparison if enabled
      if (useToleranceComparison) {
        console.log(`Using tolerance-based comparison for ${elementType}`, toleranceConfig);
        const toleranceResult = compareElementsWithTolerance(
          elementsA,
          elementsB,
          nodeMapA,
          nodeMapB,
          keyExtractor,
          toleranceConfig
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
            mismatch: toleranceResult.mismatch
          }
        };
      }

      // Use importance-based comparison
      if (useImportanceFiltering) {
        console.log(`Using importance-based comparison for ${elementType}`);
        return compareElementsWithImportance(
          elementsA,
          elementsB,
          nodeMapA,
          nodeMapB,
          keyExtractor,
          'Stb' + elementType,
          { targetImportanceLevels }
        );
      } else {
        console.log(`Using basic comparison for ${elementType}`);
        return compareElements(
          elementsA,
          elementsB,
          nodeMapA,
          nodeMapB,
          keyExtractor
        );
      }
    } catch (error) {
      console.error(`Error in performComparison for ${elementType}:`, error);
      throw error;
    }
  };

  try {
    switch (elementType) {
      case 'Node':
        console.log(`Processing Node elements`);
        comparisonResult = performComparison(nodeElementKeyExtractor);
        break;

      case 'Column':
        console.log(`Processing Column elements with bottom/top nodes`);
        comparisonResult = performComparison((el, nm) =>
          lineElementKeyExtractor(
            el,
            nm,
            'id_node_bottom',
            'id_node_top',
            comparisonKeyType
          )
        );
        break;

      case 'Girder':
      case 'Beam':
        console.log(`Processing ${elementType} elements with start/end nodes`);
        comparisonResult = performComparison((el, nm) =>
          lineElementKeyExtractor(
            el,
            nm,
            'id_node_start',
            'id_node_end',
            comparisonKeyType
          )
        );
        break;

      case 'Brace':
        console.log(`Processing Brace elements with start/end nodes`);
        comparisonResult = performComparison((el, nm) =>
          lineElementKeyExtractor(
            el,
            nm,
            'id_node_start',
            'id_node_end',
            comparisonKeyType
          )
        );
        break;

      case 'Slab':
      case 'Wall':
        console.log(`Processing ${elementType} elements with node order`);
        comparisonResult = performComparison((el, nm) =>
          polyElementKeyExtractor(el, nm, 'StbNodeIdOrder', comparisonKeyType)
        );
        break;

      default:
        console.warn(`Unknown element type for comparison: ${elementType}`);
        comparisonResult = {
          matched: [],
          onlyA: [...elementsA],
          onlyB: [...elementsB]
        };
    }
  } catch (error) {
    console.error(`Error in switch statement for ${elementType}:`, error);
    throw error;
  }

  return (
    comparisonResult || {
      matched: [],
      onlyA: [],
      onlyB: []
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
    console.warn('No valid geometry found, using default bounds');
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
    errors: []
  };

  for (const [elementType, result] of comparisonResults.entries()) {
    const typeStats = {
      matched: result.matched.length,
      onlyA: result.onlyA.length,
      onlyB: result.onlyB.length,
      total: result.matched.length + result.onlyA.length + result.onlyB.length,
      isSelected: result.isSelected
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
        error: result.error
      });
    }
  }

  return stats;
}

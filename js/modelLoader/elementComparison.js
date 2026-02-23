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
import { normalizeComparisonResult, getCategoryCounts } from '../data/normalizeComparisonResult.js';
import { COMPARISON_CATEGORY } from '../constants/comparisonCategories.js';

const logger = createLogger('modelLoader:comparison');
import {
  parseElements,
  buildNodeStoryAxisLookup,
} from '../common-stb/import/parser/stbXmlParser.js';
import { extractAllSections } from '../common-stb/import/extractor/sectionExtractor.js';
import {
  compareElements,
  compareElementsWithImportance,
  compareElementsWithTolerance,
  lineElementKeyExtractor,
  polyElementKeyExtractor,
  nodeElementKeyExtractor,
} from '../common-stb/comparison/comparator.js';
import { normalizeSectionData } from '../app/sectionEquivalenceEngine.js';
import { SUPPORTED_ELEMENTS } from '../constants/elementTypes.js';
import { COMPARISON_KEY_TYPE } from '../config/comparisonKeyConfig.js';
import { getToleranceConfig } from '../config/toleranceConfig.js';
import { getImportanceManager } from '../app/importanceManager.js';

const SECTION_MAP_KEY_BY_ELEMENT_TYPE = {
  Column: 'columnSections',
  Post: 'postSections',
  Girder: 'girderSections',
  Beam: 'beamSections',
  Brace: 'braceSections',
  Slab: 'slabSections',
  Wall: 'wallSections',
  Parapet: 'parapetSections',
  Pile: 'pileSections',
  Footing: 'footingSections',
  FoundationColumn: 'foundationcolumnSections',
};

function getElementAttribute(element, attributeName) {
  if (!element) return null;
  if (typeof element.getAttribute === 'function') {
    return element.getAttribute(attributeName);
  }
  const value = element[attributeName];
  return value !== undefined && value !== null ? String(value) : null;
}

function getSectionIdFromElement(element) {
  return getElementAttribute(element, 'id_section') || getElementAttribute(element, 'id_sec');
}

function getSectionDataFromMap(sectionMap, sectionId) {
  if (!(sectionMap instanceof Map) || !sectionId) return null;

  const candidates = new Set([sectionId, String(sectionId)]);
  const numericId = Number(sectionId);
  if (!Number.isNaN(numericId)) {
    candidates.add(numericId);
    candidates.add(String(numericId));
  }

  const parsedInteger = Number.parseInt(sectionId, 10);
  if (!Number.isNaN(parsedInteger)) {
    candidates.add(parsedInteger);
    candidates.add(String(parsedInteger));
  }

  for (const candidate of candidates) {
    if (sectionMap.has(candidate)) {
      return sectionMap.get(candidate);
    }
  }

  return null;
}

function toStableComparableObject(value) {
  if (Array.isArray(value)) {
    return value.map((item) => toStableComparableObject(item));
  }

  if (value && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      const normalizedValue = toStableComparableObject(value[key]);
      if (normalizedValue !== undefined) {
        sorted[key] = normalizedValue;
      }
    }
    return sorted;
  }

  return value;
}

function buildSectionCompositionSignature(sectionData, elementType) {
  if (!sectionData || typeof sectionData !== 'object') return null;

  const normalizedSection = normalizeSectionData(sectionData, elementType);
  const signaturePayload = {
    normalizedSection,
    mode: sectionData.mode ?? null,
    shapeName: sectionData.shapeName ?? null,
    sectionType: sectionData.sectionType ?? null,
    section_type: sectionData.section_type ?? null,
    profile_type: sectionData.profile_type ?? null,
    id_steel: sectionData.id_steel ?? null,
    dimensions: sectionData.dimensions ?? null,
    properties: sectionData.properties ?? null,
    shapes: sectionData.shapes ?? null,
    steelVariants: sectionData.steelVariants ?? null,
    sameNotSamePattern: sectionData.sameNotSamePattern ?? null,
    multiSectionType: sectionData.multiSectionType ?? null,
    concreteProfile: sectionData.concreteProfile ?? null,
    isSRC: sectionData.isSRC ?? null,
    isReferenceDirection: sectionData.isReferenceDirection ?? null,
  };

  return JSON.stringify(toStableComparableObject(signaturePayload));
}

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
  const sectionMapsA = modelADocument ? extractAllSections(modelADocument) : null;
  const sectionMapsB = modelBDocument ? extractAllSections(modelBDocument) : null;

  const { comparisonKeyType = COMPARISON_KEY_TYPE.POSITION_BASED } = options;

  // STORY_AXIS_BASED モード用: ノード所属情報ルックアップを構築
  let storyAxisLookupA = null;
  let storyAxisLookupB = null;
  if (comparisonKeyType === COMPARISON_KEY_TYPE.STORY_AXIS_BASED) {
    storyAxisLookupA = modelADocument ? buildNodeStoryAxisLookup(modelADocument) : new Map();
    storyAxisLookupB = modelBDocument ? buildNodeStoryAxisLookup(modelBDocument) : new Map();
  }

  // Axis の XML タグ名は 'StbParallelAxis'（'StbAxis' ではない）
  const ELEMENT_TAG_OVERRIDES = { Axis: 'StbParallelAxis' };

  for (const elementType of SUPPORTED_ELEMENTS) {
    const isSelected = selectedElementTypes.includes(elementType);

    let elementsA = [];
    let elementsB = [];

    // Undefined要素は特別な処理が必要（StbUndefinedタグは存在しない）
    // stbStructureReader.jsのparseStbFileで抽出されたundefinedElementsを使用
    // ここでは空の結果を返し、viewModes.jsのredrawUndefinedElementsForViewModeで処理
    if (elementType === 'Undefined') {
      const emptyResult = normalizeComparisonResult({ matched: [], onlyA: [], onlyB: [] });
      comparisonResults.set(elementType, {
        ...emptyResult,
        elementType,
        isSelected,
        elementsA: [],
        elementsB: [],
      });
      continue;
    }

    try {
      // Parse elements from both models
      const xmlTagName = ELEMENT_TAG_OVERRIDES[elementType] || 'Stb' + elementType;
      elementsA = parseElements(modelADocument, xmlTagName);
      elementsB = parseElements(modelBDocument, xmlTagName);

      // Perform comparison with importance options
      const rawComparisonResult = compareElementsByType(
        elementType,
        elementsA,
        elementsB,
        nodeMapA,
        nodeMapB,
        {
          ...options,
          comparisonKeyType,
          modelADocument,
          modelBDocument,
          sectionMapsA,
          sectionMapsB,
          storyAxisLookupA,
          storyAxisLookupB,
        },
      );

      // Normalize to canonical 5-category format
      const comparisonResult = normalizeComparisonResult(rawComparisonResult);

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
      logger.error(`Elements A length: ${elementsA.length}`);
      logger.error(`Elements B length: ${elementsB.length}`);
      logger.error(`Node map A size: ${nodeMapA.size}`);
      logger.error(`Node map B size: ${nodeMapB.size}`);
      const errorResult = normalizeComparisonResult({ matched: [], onlyA: [], onlyB: [] });
      comparisonResults.set(elementType, {
        ...errorResult,
        elementType,
        isSelected,
        elementsA,
        elementsB,
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
    modelADocument = null,
    modelBDocument = null,
    sectionMapsA = null,
    sectionMapsB = null,
    storyAxisLookupA = null,
    storyAxisLookupB = null,
  } = options;

  let comparisonResult = null;

  // Get tolerance configuration
  const toleranceConfig = getToleranceConfig();
  const useToleranceComparison = toleranceConfig.enabled && !toleranceConfig.strictMode;
  const compareOptions = {
    classifyNullKeysAsOnly:
      comparisonKeyType === COMPARISON_KEY_TYPE.GUID_BASED ||
      comparisonKeyType === COMPARISON_KEY_TYPE.STORY_AXIS_BASED,
  };
  const sectionMapKey = SECTION_MAP_KEY_BY_ELEMENT_TYPE[elementType] || null;
  const sectionSignatureCacheA = new Map();
  const sectionSignatureCacheB = new Map();

  const resolveSectionMapsForElement = (element, nodeMapRef) => {
    if (nodeMapRef === nodeMapA) {
      return sectionMapsA;
    }
    if (nodeMapRef === nodeMapB) {
      return sectionMapsB;
    }

    const ownerDocument = element?.ownerDocument;
    if (ownerDocument && ownerDocument === modelADocument) {
      return sectionMapsA;
    }
    if (ownerDocument && ownerDocument === modelBDocument) {
      return sectionMapsB;
    }

    return null;
  };

  const resolveStoryAxisLookup = (nodeMapRef) => {
    if (nodeMapRef === nodeMapA) return storyAxisLookupA;
    if (nodeMapRef === nodeMapB) return storyAxisLookupB;
    return null;
  };

  const resolveSectionSignature = (element, nodeMapRef) => {
    if (!sectionMapKey) {
      return null;
    }

    const sectionId = getSectionIdFromElement(element);
    if (!sectionId) {
      return null;
    }

    const sectionMaps = resolveSectionMapsForElement(element, nodeMapRef);
    const sectionMap = sectionMaps?.[sectionMapKey];
    if (!(sectionMap instanceof Map)) {
      return null;
    }

    const cache = sectionMaps === sectionMapsA ? sectionSignatureCacheA : sectionSignatureCacheB;
    const cacheKey = String(sectionId);
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    const sectionData = getSectionDataFromMap(sectionMap, sectionId);
    if (!sectionData) {
      cache.set(cacheKey, null);
      return null;
    }

    const signature = buildSectionCompositionSignature(sectionData, elementType);
    cache.set(cacheKey, signature);
    return signature;
  };

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
          comparisonKeyType,
          compareOptions,
        );

        // Return 5-level tolerance result directly
        return toleranceResult;
      }

      // Use importance-based comparison
      if (useImportanceFiltering) {
        const manager = getImportanceManager();
        // マネージャーの依存性（isInitialized）を隠蔽して関数のみ渡す
        const importanceLookup = manager.isInitialized
          ? (element, elementType) => manager.getElementImportance(element, elementType)
          : null;

        return compareElementsWithImportance(
          elementsA,
          elementsB,
          nodeMapA,
          nodeMapB,
          keyExtractor,
          'Stb' + elementType,
          { targetImportanceLevels, importanceLookup, compareOptions },
        );
      } else {
        return compareElements(
          elementsA,
          elementsB,
          nodeMapA,
          nodeMapB,
          keyExtractor,
          compareOptions,
        );
      }
    } catch (error) {
      logger.error(`Error in performComparison for ${elementType}:`, error);
      throw error;
    }
  };

  const getGuidPreferredKey = (element, fallbackKey) => {
    if (comparisonKeyType !== COMPARISON_KEY_TYPE.GUID_BASED) {
      return fallbackKey;
    }
    const guid = getElementAttribute(element, 'guid');
    if (guid && guid.trim() !== '') {
      return `guid:${guid.trim()}`;
    }
    // GUIDモードでGUIDが無い要素は比較対象から除外（nullを返す）
    return null;
  };

  const createLineExtractor = (startAttr, endAttr) => {
    return (element, nodeMap) =>
      lineElementKeyExtractor(element, nodeMap, startAttr, endAttr, comparisonKeyType, {
        sectionSignatureResolver: (targetElement) =>
          resolveSectionSignature(targetElement, nodeMap),
        storyAxisLookup: resolveStoryAxisLookup(nodeMap),
      });
  };

  const createPolyExtractor = (nodeOrderTag = 'StbNodeIdOrder') => {
    return (element, nodeMap) =>
      polyElementKeyExtractor(element, nodeMap, nodeOrderTag, comparisonKeyType, {
        sectionSignatureResolver: (targetElement) =>
          resolveSectionSignature(targetElement, nodeMap),
        storyAxisLookup: resolveStoryAxisLookup(nodeMap),
      });
  };

  try {
    switch (elementType) {
      case 'Node':
        comparisonResult = performComparison((el, nm) =>
          nodeElementKeyExtractor(el, nm, comparisonKeyType, {
            storyAxisLookup: resolveStoryAxisLookup(nm),
          }),
        );
        break;

      case 'Column':
        comparisonResult = performComparison(createLineExtractor('id_node_bottom', 'id_node_top'));
        break;

      case 'Post':
        comparisonResult = performComparison(createLineExtractor('id_node_bottom', 'id_node_top'));
        break;

      case 'Girder':
      case 'Beam':
        comparisonResult = performComparison(createLineExtractor('id_node_start', 'id_node_end'));
        break;

      case 'Brace':
        comparisonResult = performComparison(createLineExtractor('id_node_start', 'id_node_end'));
        break;

      case 'Slab':
      case 'Wall':
        comparisonResult = performComparison(createPolyExtractor('StbNodeIdOrder'));
        break;

      case 'Pile':
        // Pile要素は2ノード形式（id_node_bottom/top）または1ノード形式（id_node + level_top）
        // lineElementKeyExtractorは1ノード形式にもフォールバック対応
        comparisonResult = performComparison(createLineExtractor('id_node_bottom', 'id_node_top'));
        break;

      case 'Footing':
        // Footing要素は1ノード形式（id_node + level_bottom）
        // lineElementKeyExtractorの1ノードフォールバックで対応
        comparisonResult = performComparison(createLineExtractor('id_node_bottom', 'id_node_top'));
        break;

      case 'FoundationColumn':
        comparisonResult = performComparison(createLineExtractor('id_node_bottom', 'id_node_top'));
        break;

      case 'Parapet':
        comparisonResult = performComparison(createLineExtractor('id_node_start', 'id_node_end'));
        break;

      case 'StripFooting':
        comparisonResult = performComparison(createLineExtractor('id_node_start', 'id_node_end'));
        break;

      case 'Joint':
        // 継手は梁・柱に関連付けられた定義なので、IDベースで比較
        comparisonResult = performComparison((el) => {
          const id = getElementAttribute(el, 'id');
          return {
            key: getGuidPreferredKey(el, id ? `joint:${id}` : null),
            data: { id, guid: getElementAttribute(el, 'guid') || undefined },
          };
        });
        break;

      case 'Story':
        // 階はname属性（"1F", "2F"等）でマッチング
        comparisonResult = performComparison((el) => {
          const name = getElementAttribute(el, 'name');
          const id = getElementAttribute(el, 'id');
          const fallbackKey = name ? `story:${name}` : null;
          return {
            key: getGuidPreferredKey(el, fallbackKey),
            data: { id, name, guid: getElementAttribute(el, 'guid') || undefined },
          };
        });
        break;

      case 'Axis':
        // 通り芯は親グループ名 + name属性でマッチング
        comparisonResult = performComparison((el) => {
          const name = getElementAttribute(el, 'name');
          const id = getElementAttribute(el, 'id');
          const groupName =
            (typeof el?.parentElement?.getAttribute === 'function'
              ? el.parentElement.getAttribute('group_name')
              : null) || '';
          const fallbackKey = name ? `axis:${groupName}:${name}` : null;
          return {
            key: getGuidPreferredKey(el, fallbackKey),
            data: { id, name, guid: getElementAttribute(el, 'guid') || undefined },
          };
        });
        break;

      default:
        logger.warn(`Unknown element type for comparison: ${elementType}`);
        comparisonResult = {
          matched: [],
          mismatch: [],
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
      mismatch: [],
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
    // 5カテゴリ詳細
    exactElements: 0,
    withinToleranceElements: 0,
    attributeMismatchElements: 0,
    elementTypes: {},
    selectedTypes: [],
    errors: [],
  };

  for (const [elementType, result] of comparisonResults.entries()) {
    const counts = getCategoryCounts(result);
    const typeStats = {
      matched: counts.matched,
      exact: counts.exact,
      withinTolerance: counts.withinTolerance,
      attributeMismatch: counts.attributeMismatch,
      onlyA: counts.onlyA,
      onlyB: counts.onlyB,
      total: counts.total,
      isSelected: result.isSelected,
    };

    stats.elementTypes[elementType] = typeStats;
    stats.totalElements += typeStats.total;
    stats.matchedElements += typeStats.matched;
    stats.exactElements += typeStats.exact;
    stats.withinToleranceElements += typeStats.withinTolerance;
    stats.attributeMismatchElements += typeStats.attributeMismatch;
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

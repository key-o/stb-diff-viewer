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

const logger = createLogger('modelLoader:comparison');
import {
  parseElements,
  buildNodeStoryAxisLookup,
  computeAxisGeometryKey,
} from '../common-stb/import/parser/stbXmlParser.js';
import { extractAllSections } from '../common-stb/import/extractor/sectionExtractor.js';
import {
  compareElements,
  compareElementsWithImportance,
  compareElementsWithTolerance,
  lineElementKeyExtractor,
  lineElementKeyExtractorV2,
  polyElementKeyExtractor,
  polyElementKeyExtractorV2,
  nodeElementKeyExtractor,
} from '../common-stb/comparison/comparator.js';
import {
  compareStbDefinitions,
  STB_DEFINITION_ELEMENT_TYPE,
} from '../common-stb/comparison/stbDefinitionComparator.js';
import { isCrossSoftwareModeEnabled } from '../config/crossSoftwareConfig.js';
import { compareStructuralAttributeDetails } from '../common-stb/comparison/attributeComparator.js';
import {
  buildGeometryShapeSignature,
  isGeometrySignatureSupported,
} from '../common-stb/comparison/geometryShapeSignature.js';
import { getLoaderNormalizeSectionData, getLoaderImportanceManager } from './loaderDependencies.js';
import { SUPPORTED_ELEMENTS, STB_TAG_NAMES } from '../constants/elementTypes.js';
import {
  COMPARISON_KEY_TYPE,
  getPlacementModeForKeyType,
  SECTION_MATCH_CRITERION,
  DEFAULT_SECTION_MATCH_CRITERION,
  STORY_AXIS_MATCH_CRITERION,
  DEFAULT_STORY_AXIS_MATCH_CRITERION,
  sectionCriterionNeedsStoryLookup,
} from '../config/comparisonKeyConfig.js';
import { getToleranceConfig } from '../config/toleranceConfig.js';
import { filterWallsByViewerElementType } from '../common-stb/walls/wallClassification.js';

const SECTION_MAP_KEY_BY_ELEMENT_TYPE = {
  Column: 'columnSections',
  Post: 'postSections',
  Girder: 'girderSections',
  Beam: 'beamSections',
  Brace: 'braceSections',
  Slab: 'slabSections',
  ShearWall: 'wallSections',
  Wall: 'wallSections',
  Parapet: 'parapetSections',
  Pile: 'pileSections',
  Footing: 'footingSections',
  FoundationColumn: 'foundationcolumnSections',
  IsolatingDevice: 'isolatingDeviceSections',
  DampingDevice: 'dampingDeviceSections',
  FrameDampingDevice: 'dampingDeviceSections',
};

const extractedSectionsCache = new WeakMap();
const storyAxisLookupCache = new WeakMap();

/**
 * 指定ドキュメントの比較用キャッシュ（断面抽出・階/通り芯ルックアップ）を無効化する。
 * XMLドキュメントを編集した後、再比較の前に呼び出すこと。
 * @param {Document} document - 編集されたXMLドキュメント
 */
export function invalidateComparisonCachesForDocument(document) {
  if (!document) return;
  extractedSectionsCache.delete(document);
  storyAxisLookupCache.delete(document);
}

const WALL_TYPE_ALIASES = new Set(['ShearWall', 'StbShearWall']);

/**
 * 要素種別 → 「第一Node」を指す節点参照属性の候補リスト。
 * 線材は始点/下端、面材は頂点列（StbNodeIdOrder の先頭）を第一Nodeとする。
 * PLACEMENT_FIRST_NODE_STORY の所属階キー生成に用いる。
 */
const FIRST_NODE_ATTR_BY_ELEMENT_TYPE = {
  Column: ['id_node_bottom', 'id_node'],
  Post: ['id_node_bottom', 'id_node'],
  FoundationColumn: ['id_node_bottom', 'id_node'],
  Girder: ['id_node_start'],
  Beam: ['id_node_start'],
  Brace: ['id_node_start'],
  Parapet: ['id_node_start'],
  Pile: ['id_node_bottom', 'id_node'],
  Footing: ['id_node_bottom', 'id_node'],
  StripFooting: ['id_node_start'],
  IsolatingDevice: ['id_node_start', 'id_node'],
  DampingDevice: ['id_node_start', 'id_node'],
};

/**
 * 要素の「第一Node」の節点IDを取得する。
 * 線材は属性候補から、面材(Slab/Wall)は StbNodeIdOrder の先頭 id_node から解決する。
 * @param {Element} element - STB配置要素
 * @param {string} elementType - 正規化済み要素種別
 * @returns {string|null} 第一Nodeの節点ID（取得不可なら null）
 */
function getFirstNodeId(element, elementType) {
  const attrs = FIRST_NODE_ATTR_BY_ELEMENT_TYPE[elementType];
  if (attrs) {
    for (const attr of attrs) {
      const id = getElementAttribute(element, attr);
      if (id != null && String(id).trim() !== '') {
        return String(id).trim();
      }
    }
    return null;
  }

  // 面材（Slab / Wall / ShearWall）: 頂点列の先頭を第一Nodeとする。
  // querySelector 非対応の XML パーサ（xmldom 等）でも動くよう getElementsByTagName へフォールバック。
  const getFirstChildByTag = (parent, tag) => {
    if (!parent) return null;
    if (typeof parent.querySelector === 'function') {
      return parent.querySelector(tag);
    }
    if (typeof parent.getElementsByTagName === 'function') {
      return parent.getElementsByTagName(tag)[0] || null;
    }
    return null;
  };

  const order = getFirstChildByTag(element, 'StbNodeIdOrder');
  const firstNode = getFirstChildByTag(order, 'StbNodeId');
  const id = getElementAttribute(firstNode, 'id_node') || getElementAttribute(firstNode, 'id');
  if (id != null && String(id).trim() !== '') {
    return String(id).trim();
  }

  // StbNodeIdOrder がテキスト形式（"1 2 3 4"）の場合の先頭ノードID
  const orderText = order && order.textContent ? String(order.textContent).trim() : '';
  const firstToken = orderText.split(/\s+/)[0];
  return firstToken ? firstToken : null;
}

export function normalizeComparisonElementType(elementType) {
  return WALL_TYPE_ALIASES.has(elementType) ? 'Wall' : elementType;
}

export function getCachedExtractedSections(document) {
  if (!document) return null;
  if (extractedSectionsCache.has(document)) {
    return extractedSectionsCache.get(document);
  }

  const extractedSections = extractAllSections(document);
  extractedSectionsCache.set(document, extractedSections);
  return extractedSections;
}

function getCachedStoryAxisLookup(document) {
  if (!document) return new Map();
  if (storyAxisLookupCache.has(document)) {
    return storyAxisLookupCache.get(document);
  }

  const lookup = buildNodeStoryAxisLookup(document);
  storyAxisLookupCache.set(document, lookup);
  return lookup;
}

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

  const normalizeSectionData = getLoaderNormalizeSectionData();
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
 * @param {string} [options.comparisonKeyType] - Comparison key type (POSITION_NODE_ONLY, POSITION_WITH_OFFSET, POSITION_WITH_ROTATE, GUID_BASED, etc.)
 * @param {boolean} [options.crossSoftwareMode] - 異ソフト間比較モード（未指定時は crossSoftwareConfig の値）。
 *   有効時、断面定義の対応キーの floor を StbStory の標高/順序で正準化する。
 * @returns {Object} Comparison results
 */
export function processElementComparison(modelData, selectedElementTypes, options = {}) {
  const { modelADocument, modelBDocument, nodeMapA, nodeMapB } = modelData;

  const comparisonResults = new Map();
  const modelBounds = new THREE.Box3();
  // キャッシュ付き断面抽出を使用（同一ドキュメントへの重複抽出を回避）
  const sectionMapsA = modelADocument ? getCachedExtractedSections(modelADocument) : null;
  const sectionMapsB = modelBDocument ? getCachedExtractedSections(modelBDocument) : null;

  const {
    comparisonKeyType = COMPARISON_KEY_TYPE.POSITION_NODE_ONLY,
    sectionMatchCriterion = DEFAULT_SECTION_MATCH_CRITERION,
    storyAxisMatchCriterion = DEFAULT_STORY_AXIS_MATCH_CRITERION,
  } = options;

  // STORY_AXIS_BASED モード / 第一Node所属階の断面基準用: ノード所属情報ルックアップを構築
  let storyAxisLookupA = null;
  let storyAxisLookupB = null;
  if (
    comparisonKeyType === COMPARISON_KEY_TYPE.STORY_AXIS_BASED ||
    sectionCriterionNeedsStoryLookup(sectionMatchCriterion)
  ) {
    storyAxisLookupA = modelADocument ? buildNodeStoryAxisLookup(modelADocument) : new Map();
    storyAxisLookupB = modelBDocument ? buildNodeStoryAxisLookup(modelBDocument) : new Map();
  }

  const comparisonContext = {
    modelADocument,
    modelBDocument,
    nodeMapA,
    nodeMapB,
    sectionMapsA,
    sectionMapsB,
    storyAxisLookupA,
    storyAxisLookupB,
    comparisonKeyType,
    sectionMatchCriterion,
    storyAxisMatchCriterion,
    options,
  };

  const normalizedSelectedElementTypes = new Set(
    Array.isArray(selectedElementTypes)
      ? selectedElementTypes.map((elementType) => normalizeComparisonElementType(elementType))
      : [],
  );

  for (const elementType of SUPPORTED_ELEMENTS) {
    if (normalizeComparisonElementType(elementType) !== elementType) {
      continue;
    }

    const isSelected = normalizedSelectedElementTypes.has(elementType);
    const result = compareSingleElementTypeInternal(elementType, isSelected, comparisonContext);
    comparisonResults.set(elementType, result);
  }

  if (options.includeDefinitionComparison !== false) {
    const crossSoftwareMode = options.crossSoftwareMode ?? isCrossSoftwareModeEnabled();
    comparisonResults.set(
      STB_DEFINITION_ELEMENT_TYPE,
      compareStbDefinitions(modelADocument, modelBDocument, {
        canonicalizeFloors: crossSoftwareMode,
      }),
    );
  }

  return {
    comparisonResults,
    modelBounds,
  };
}

/**
 * 単一要素タイプの再比較を実行する（編集後の差分同期用）
 * @param {string} elementType - 要素タイプ
 * @param {Object} modelData - モデルデータ
 * @param {Object} [options={}] - 比較オプション
 * @returns {Object} normalizeComparisonResult 済みの結果オブジェクト
 */
export function recompareSingleElementType(elementType, modelData, options = {}) {
  const { modelADocument, modelBDocument, nodeMapA, nodeMapB } = modelData;
  const sectionMapsA = getCachedExtractedSections(modelADocument);
  const sectionMapsB = getCachedExtractedSections(modelBDocument);

  const {
    comparisonKeyType = COMPARISON_KEY_TYPE.POSITION_NODE_ONLY,
    sectionMatchCriterion = DEFAULT_SECTION_MATCH_CRITERION,
    storyAxisMatchCriterion = DEFAULT_STORY_AXIS_MATCH_CRITERION,
  } = options;

  let storyAxisLookupA = null;
  let storyAxisLookupB = null;
  if (
    comparisonKeyType === COMPARISON_KEY_TYPE.STORY_AXIS_BASED ||
    sectionCriterionNeedsStoryLookup(sectionMatchCriterion)
  ) {
    storyAxisLookupA = getCachedStoryAxisLookup(modelADocument);
    storyAxisLookupB = getCachedStoryAxisLookup(modelBDocument);
  }

  const comparisonContext = {
    modelADocument,
    modelBDocument,
    nodeMapA,
    nodeMapB,
    sectionMapsA,
    sectionMapsB,
    storyAxisLookupA,
    storyAxisLookupB,
    comparisonKeyType,
    sectionMatchCriterion,
    storyAxisMatchCriterion,
    options,
  };

  return compareSingleElementTypeInternal(
    normalizeComparisonElementType(elementType),
    true,
    comparisonContext,
  );
}

// Axis の XML タグ名は StbParallelAxis（StbAxis ではない）
const ELEMENT_TAG_OVERRIDES = { Axis: STB_TAG_NAMES.PARALLEL_AXIS, ShearWall: STB_TAG_NAMES.WALL };

// 単一タイプが複数のSTBタグを束ねる場合の追加タグ。
// 通り芯（Axis）は平行に加えて円弧（StbArcAxis）・放射（StbRadialAxis）も比較対象にする。
const ELEMENT_EXTRA_TAGS = {
  Axis: [STB_TAG_NAMES.ARC_AXIS, STB_TAG_NAMES.RADIAL_AXIS],
};

/**
 * 要素タイプに対応する全STBタグをパースして返す。
 * 主タグに加え、ELEMENT_EXTRA_TAGS に定義された追加タグ（円弧/放射通り芯など）も含める。
 * @param {Document} doc - STB XMLドキュメント
 * @param {string} elementType - 要素タイプ
 * @param {string} primaryTag - 主タグ名
 * @returns {Array<Element>} パースした要素配列
 */
function parseElementsForType(doc, elementType, primaryTag) {
  const elements = parseElements(doc, primaryTag);
  const extraTags = ELEMENT_EXTRA_TAGS[elementType];
  if (extraTags) {
    for (const tag of extraTags) {
      elements.push(...parseElements(doc, tag));
    }
  }
  return elements;
}

// 比較では壁を 'Wall' カテゴリに統合する（normalizeComparisonElementType）ため、
// kind_wall によるフィルタは行わない。耐震壁（WALL_SHEAR）もここで比較対象に含める。
// 表示側の種別絞り込みは elementRedrawConfig の elementFilter が担当する。
function filterElementsByViewerType(elementType, elements) {
  if (elementType === 'ShearWall') {
    return filterWallsByViewerElementType(elementType, elements);
  }
  return elements;
}

function getImportanceElementType(elementType) {
  return ELEMENT_TAG_OVERRIDES[elementType] || `Stb${elementType}`;
}

/**
 * 単一要素タイプの比較を実行する内部関数
 * @param {string} elementType - 要素タイプ
 * @param {boolean} isSelected - 選択状態
 * @param {Object} ctx - 比較コンテキスト
 * @returns {Object} 比較結果
 */
function compareSingleElementTypeInternal(elementType, isSelected, ctx) {
  const {
    modelADocument,
    modelBDocument,
    nodeMapA,
    nodeMapB,
    sectionMapsA,
    sectionMapsB,
    storyAxisLookupA,
    storyAxisLookupB,
    comparisonKeyType,
    sectionMatchCriterion,
    storyAxisMatchCriterion,
    options,
  } = ctx;

  let elementsA = [];
  let elementsB = [];

  // 配置要素として比較できない疑似タイプは空結果で早期リターンする。
  // - Undefined: StbUndefined タグは存在しない（未定義断面を参照する要素の集約用）
  // - Joint: StbJoint タグは存在せず、継手は位置を持たない定義要素のため
  //   StbDefinition 比較（compareStbDefinitions）で StbJointBeam*/StbJointColumn* として扱う
  if (elementType === 'Undefined' || elementType === 'Joint') {
    const emptyResult = normalizeComparisonResult({ matched: [], onlyA: [], onlyB: [] });
    return {
      ...emptyResult,
      elementType,
      isSelected,
      elementsA: [],
      elementsB: [],
    };
  }

  try {
    // Parse elements from both models
    const xmlTagName = ELEMENT_TAG_OVERRIDES[elementType] || 'Stb' + elementType;
    elementsA = filterElementsByViewerType(
      elementType,
      parseElementsForType(modelADocument, elementType, xmlTagName),
    );
    elementsB = filterElementsByViewerType(
      elementType,
      parseElementsForType(modelBDocument, elementType, xmlTagName),
    );

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
        sectionMatchCriterion,
        storyAxisMatchCriterion,
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

    return {
      ...comparisonResult,
      elementType,
      isSelected,
      elementsA,
      elementsB,
    };
  } catch (error) {
    logger.error(`Error processing ${elementType}:`, error);
    logger.error(`Error stack:`, error.stack);
    logger.error(`Elements A length: ${elementsA.length}`);
    logger.error(`Elements B length: ${elementsB.length}`);
    logger.error(`Node map A size: ${nodeMapA.size}`);
    logger.error(`Node map B size: ${nodeMapB.size}`);
    const errorResult = normalizeComparisonResult({ matched: [], onlyA: [], onlyB: [] });
    return {
      ...errorResult,
      elementType,
      isSelected,
      elementsA,
      elementsB,
      error: error.message,
    };
  }
}

/**
 * 断面一致基準に従い、対応キー用/型差分用の断面シグネチャリゾルバを生成する。
 * 権威ある比較（compareElementsByType）と描画パス（elementRedrawCore）で同一ロジックを共有し、
 * 3D着色と差分サマリーの断面対応を一致させる（F2）。
 *
 * @param {Object} params
 * @param {string} params.elementType - 要素タイプ
 * @param {string} [params.sectionMatchCriterion] - SECTION_MATCH_CRITERION の値
 * @param {Map} params.nodeMapA - モデルAのノードマップ（断面マップの帰属判定に使用）
 * @param {Map} params.nodeMapB - モデルBのノードマップ
 * @param {Object} params.sectionMapsA - モデルAの抽出済み断面マップ群
 * @param {Object} params.sectionMapsB - モデルBの抽出済み断面マップ群
 * @param {Document} [params.modelADocument] - モデルAのXMLドキュメント（ownerDocument帰属判定用）
 * @param {Document} [params.modelBDocument] - モデルBのXMLドキュメント
 * @returns {{sectionMapKey: string|null, resolveSectionKeyPart: Function, resolveSectionContentSignature: Function}}
 */
export function createSectionKeyResolvers({
  elementType,
  sectionMatchCriterion = DEFAULT_SECTION_MATCH_CRITERION,
  nodeMapA,
  nodeMapB,
  sectionMapsA,
  sectionMapsB,
  modelADocument = null,
  modelBDocument = null,
  storyAxisLookupA = null,
  storyAxisLookupB = null,
}) {
  const sectionMapKey = SECTION_MAP_KEY_BY_ELEMENT_TYPE[elementType] || null;

  const resolveStoryLookupForNodeMap = (nodeMapRef) => {
    if (nodeMapRef === nodeMapA) return storyAxisLookupA;
    if (nodeMapRef === nodeMapB) return storyAxisLookupB;
    return null;
  };

  // 第一Nodeの所属階名を対応キー成分として生成する（PLACEMENT_FIRST_NODE_STORY 用）。
  const buildFirstNodeStoryKeyPart = (element, nodeMapRef) => {
    const nodeId = getFirstNodeId(element, elementType);
    if (!nodeId) return null;
    const lookup = resolveStoryLookupForNodeMap(nodeMapRef);
    const storyName = lookup instanceof Map ? lookup.get(nodeId)?.storyName : null;
    return storyName != null && String(storyName).trim() !== ''
      ? `story:${String(storyName).trim()}`
      : null;
  };
  const sectionDataCacheA = new Map();
  const sectionDataCacheB = new Map();
  const sectionSignatureCacheA = new Map();
  const sectionSignatureCacheB = new Map();
  const geometrySignatureCacheA = new Map();
  const geometrySignatureCacheB = new Map();

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

  // 断面データ（name・内容シグネチャ双方の元）を id_section から解決（キャッシュ付き）
  const resolveSectionData = (element, nodeMapRef) => {
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

    const cache = sectionMaps === sectionMapsA ? sectionDataCacheA : sectionDataCacheB;
    const cacheKey = String(sectionId);
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    const sectionData = getSectionDataFromMap(sectionMap, sectionId) || null;
    cache.set(cacheKey, sectionData);
    return sectionData;
  };

  // 梁/大梁: 断面の「作成されるジオメトリ立体形状」を唯一の等価条件とする GSS を解決（キャッシュ付き）。
  const resolveGeometrySignature = (element, nodeMapRef) => {
    if (!isGeometrySignatureSupported(null, elementType)) {
      return null;
    }
    const sectionId = getSectionIdFromElement(element);
    if (!sectionId) {
      return null;
    }
    const sectionMaps = resolveSectionMapsForElement(element, nodeMapRef);
    if (!sectionMaps) {
      return null;
    }
    const cache = sectionMaps === sectionMapsA ? geometrySignatureCacheA : geometrySignatureCacheB;
    const cacheKey = String(sectionId);
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }
    const sectionData = resolveSectionData(element, nodeMapRef);
    const gss = sectionData ? buildGeometryShapeSignature(sectionData, elementType) : null;
    cache.set(cacheKey, gss);
    return gss;
  };

  // 断面名称キー（無ければ構成シグネチャへフォールバック）を生成する共通ヘルパー。
  const buildNameKeyPart = (element, nodeMapRef) => {
    const sectionData = resolveSectionData(element, nodeMapRef);
    if (!sectionData) {
      return null;
    }
    const name = sectionData.name;
    if (name != null && String(name).trim() !== '') {
      return `name:${String(name).trim()}`;
    }
    return buildSectionCompositionSignature(sectionData, elementType);
  };

  // 比較キー用: 断面一致基準(sectionMatchCriterion)に従い、対応キーへ混ぜる断面シグネチャを生成する。
  // 返り値 null のとき断面はキーに含まれず、部材は配置のみで対応付けられる。
  // PLACEMENT_INHERIT は配置対応の結果を断面同定に流用する（断面をキーに入れず、断面差は型差分）。
  const resolveSectionKeyPart = (element, nodeMapRef) => {
    if (!sectionMapKey) {
      return null;
    }

    switch (sectionMatchCriterion) {
      case SECTION_MATCH_CRITERION.PLACEMENT_INHERIT:
        // 断面をキーに入れず配置のみで対応付ける。断面差は配置一致後の type 属性差として表示する。
        return null;

      case SECTION_MATCH_CRITERION.PLACEMENT_FIRST_NODE_STORY:
        // 配置対応の継承に加え、第一Nodeの所属階名だけをキーに混ぜる（断面自体はキーに入れない）。
        return buildFirstNodeStoryKeyPart(element, nodeMapRef);

      case SECTION_MATCH_CRITERION.SECTION_ID: {
        const sectionId = getSectionIdFromElement(element);
        return sectionId ? `secid:${String(sectionId).trim()}` : null;
      }

      case SECTION_MATCH_CRITERION.GUID: {
        const guid = resolveSectionData(element, nodeMapRef)?.guid;
        return guid != null && String(guid).trim() !== '' ? `secguid:${String(guid).trim()}` : null;
      }

      case SECTION_MATCH_CRITERION.NAME:
      // 名称＋階正準化（異ソフト間）は部材レベルでは名称ベースで対応付ける。
      // 階正準化は crossSoftwareConfig 経由で断面定義ツリー側に作用する（別レイヤー）。
      case SECTION_MATCH_CRITERION.NAME_FLOOR_CANONICAL:
        return buildNameKeyPart(element, nodeMapRef);

      case SECTION_MATCH_CRITERION.GEOMETRY_SHAPE: {
        const gss = resolveGeometrySignature(element, nodeMapRef);
        if (gss != null) {
          return `geom:${gss}`;
        }
        const sectionData = resolveSectionData(element, nodeMapRef);
        return sectionData ? buildSectionCompositionSignature(sectionData, elementType) : null;
      }

      case SECTION_MATCH_CRITERION.ALL_ATTRIBUTES: {
        const sectionData = resolveSectionData(element, nodeMapRef);
        return sectionData ? buildSectionCompositionSignature(sectionData, elementType) : null;
      }

      default:
        return null;
    }
  };

  // 属性比較用: 断面の内容シグネチャ（配置一致後に断面差を type 差分として検出する。キャッシュ付き）。
  const resolveSectionContentSignature = (element, nodeMapRef) => {
    if (!sectionMapKey) {
      return null;
    }

    const sectionId = getSectionIdFromElement(element);
    if (!sectionId) {
      return null;
    }

    const sectionMaps = resolveSectionMapsForElement(element, nodeMapRef);
    if (!sectionMaps) {
      return null;
    }

    const cache = sectionMaps === sectionMapsA ? sectionSignatureCacheA : sectionSignatureCacheB;
    const cacheKey = String(sectionId);
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    // 配置系(PLACEMENT_*) / GEOMETRY_SHAPE: 形状（梁/大梁=GSS）を優先し型差分の判断条件とする。
    // NAME / SECTION_ID / GUID / ALL_ATTRIBUTES: 対応キーより細かい断面差を型差分として提示するため全構成シグネチャを用いる。
    const preferGeometry =
      sectionMatchCriterion === SECTION_MATCH_CRITERION.PLACEMENT_INHERIT ||
      sectionMatchCriterion === SECTION_MATCH_CRITERION.PLACEMENT_FIRST_NODE_STORY ||
      sectionMatchCriterion === SECTION_MATCH_CRITERION.GEOMETRY_SHAPE;

    let signature;
    const geometrySignature = preferGeometry ? resolveGeometrySignature(element, nodeMapRef) : null;
    if (geometrySignature != null) {
      signature = `geom:${geometrySignature}`;
    } else {
      const sectionData = resolveSectionData(element, nodeMapRef);
      signature = sectionData ? buildSectionCompositionSignature(sectionData, elementType) : null;
    }
    cache.set(cacheKey, signature);
    return signature;
  };

  return { sectionMapKey, resolveSectionKeyPart, resolveSectionContentSignature };
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
 * @param {string} [options.comparisonKeyType] - Comparison key type (POSITION_NODE_ONLY, POSITION_WITH_OFFSET, POSITION_WITH_ROTATE, GUID_BASED, etc.)
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
    comparisonKeyType = COMPARISON_KEY_TYPE.POSITION_NODE_ONLY,
    sectionMatchCriterion = DEFAULT_SECTION_MATCH_CRITERION,
    storyAxisMatchCriterion = DEFAULT_STORY_AXIS_MATCH_CRITERION,
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

  const resolveStoryAxisLookup = (nodeMapRef) => {
    if (nodeMapRef === nodeMapA) return storyAxisLookupA;
    if (nodeMapRef === nodeMapB) return storyAxisLookupB;
    return null;
  };

  // 断面一致基準に従う対応キー/型差分リゾルバ（描画パスと共有）
  const { resolveSectionKeyPart, resolveSectionContentSignature } = createSectionKeyResolvers({
    elementType,
    sectionMatchCriterion,
    nodeMapA,
    nodeMapB,
    sectionMapsA,
    sectionMapsB,
    modelADocument,
    modelBDocument,
    storyAxisLookupA,
    storyAxisLookupB,
  });

  // 構造属性＋断面内容の双方を比較する属性コンパレータ。
  // 配置＋断面name が一致した部材ペアについて、断面の内容差を attributeMismatch として検出する。
  const attributeComparator = (dataA, dataB) => {
    const elementA = dataA?.rawElement || dataA?.element || dataA;
    const elementB = dataB?.rawElement || dataB?.element || dataB;
    const instanceComparison = compareStructuralAttributeDetails(elementA, elementB);
    const signatureA = resolveSectionContentSignature(elementA, nodeMapA);
    const signatureB = resolveSectionContentSignature(elementB, nodeMapB);
    const hasInstanceDiff = !instanceComparison.matches;
    const hasTypeDiff = signatureA !== signatureB;

    if (!hasInstanceDiff && !hasTypeDiff) {
      return { matches: true };
    }

    const attributeMismatchKind =
      hasInstanceDiff && hasTypeDiff ? 'both' : hasTypeDiff ? 'type' : 'instance';

    return {
      matches: false,
      attributeMismatchKind,
      attributeDiffScope: {
        instance: hasInstanceDiff,
        type: hasTypeDiff,
      },
      attributeDiffDetails: {
        instance: instanceComparison.differences,
        type: hasTypeDiff
          ? {
              sectionSignatureA: signatureA,
              sectionSignatureB: signatureB,
            }
          : null,
      },
    };
  };

  const compareOptions = {
    attributeComparator,
    classifyNullKeysAsOnly:
      comparisonKeyType === COMPARISON_KEY_TYPE.GUID_BASED ||
      comparisonKeyType === COMPARISON_KEY_TYPE.STORY_AXIS_BASED,
  };

  // Create comparison function based on tolerance and importance filtering settings
  const getEffectiveKeyType = (supportsGeometryCenterDirection) => {
    if (
      comparisonKeyType === COMPARISON_KEY_TYPE.GEOMETRY_CENTER_DIRECTION_BASED &&
      !supportsGeometryCenterDirection
    ) {
      return COMPARISON_KEY_TYPE.POSITION_NODE_ONLY;
    }
    return comparisonKeyType;
  };

  const performComparison = (keyExtractor, keyTypeOverride = comparisonKeyType) => {
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
          keyTypeOverride,
          compareOptions,
        );

        // Return 5-level tolerance result directly
        return toleranceResult;
      }

      // Use importance-based comparison
      if (useImportanceFiltering) {
        const manager = getLoaderImportanceManager();
        // マネージャーの依存性（isInitialized）を隠蔽して関数のみ渡す
        const importanceLookup =
          manager && manager.isInitialized
            ? (element, elementType) => manager.getElementImportance(element, elementType)
            : null;

        return compareElementsWithImportance(
          elementsA,
          elementsB,
          nodeMapA,
          nodeMapB,
          keyExtractor,
          getImportanceElementType(elementType),
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

  // 配置比較モード: キータイプが+オフセット/+回転系であれば V2 extractor を使用
  const placementMode = getPlacementModeForKeyType(comparisonKeyType);
  const useV2 =
    placementMode !== getPlacementModeForKeyType(COMPARISON_KEY_TYPE.POSITION_NODE_ONLY);

  const createLineExtractor = (startAttr, endAttr) => {
    return (element, nodeMap) => {
      const options = {
        sectionSignatureResolver: (targetElement) => resolveSectionKeyPart(targetElement, nodeMap),
        storyAxisLookup: resolveStoryAxisLookup(nodeMap),
      };
      return useV2
        ? lineElementKeyExtractorV2(
            element,
            nodeMap,
            startAttr,
            endAttr,
            placementMode,
            comparisonKeyType,
            options,
          )
        : lineElementKeyExtractor(element, nodeMap, startAttr, endAttr, comparisonKeyType, options);
    };
  };

  const createPolyExtractor = (nodeOrderTag = 'StbNodeIdOrder') => {
    return (element, nodeMap) => {
      const options = {
        sectionSignatureResolver: (targetElement) => resolveSectionKeyPart(targetElement, nodeMap),
        storyAxisLookup: resolveStoryAxisLookup(nodeMap),
      };
      return useV2
        ? polyElementKeyExtractorV2(
            element,
            nodeMap,
            nodeOrderTag,
            placementMode,
            comparisonKeyType,
            options,
          )
        : polyElementKeyExtractor(element, nodeMap, nodeOrderTag, comparisonKeyType, options);
    };
  };

  try {
    switch (elementType) {
      case 'Node':
        comparisonResult = performComparison(
          (el, nm) =>
            nodeElementKeyExtractor(el, nm, comparisonKeyType, {
              storyAxisLookup: resolveStoryAxisLookup(nm),
            }),
          getEffectiveKeyType(false),
        );
        break;

      case 'Column':
        comparisonResult = performComparison(
          createLineExtractor('id_node_bottom', 'id_node_top'),
          getEffectiveKeyType(true),
        );
        break;

      case 'Post':
        comparisonResult = performComparison(
          createLineExtractor('id_node_bottom', 'id_node_top'),
          getEffectiveKeyType(true),
        );
        break;

      case 'Girder':
      case 'Beam':
        comparisonResult = performComparison(
          createLineExtractor('id_node_start', 'id_node_end'),
          getEffectiveKeyType(true),
        );
        break;

      case 'Brace':
        comparisonResult = performComparison(
          createLineExtractor('id_node_start', 'id_node_end'),
          getEffectiveKeyType(true),
        );
        break;

      case 'Slab':
      case 'ShearWall':
      case 'Wall':
      case 'FrameDampingDevice':
        comparisonResult = performComparison(
          createPolyExtractor('StbNodeIdOrder'),
          getEffectiveKeyType(true),
        );
        break;

      case 'Pile':
        // Pile要素は2ノード形式（id_node_bottom/top）または1ノード形式（id_node + level_top）
        // lineElementKeyExtractorは1ノード形式にもフォールバック対応
        comparisonResult = performComparison(
          createLineExtractor('id_node_bottom', 'id_node_top'),
          getEffectiveKeyType(true),
        );
        break;

      case 'Footing':
        // Footing要素は1ノード形式（id_node + level_bottom）
        // lineElementKeyExtractorの1ノードフォールバックで対応
        comparisonResult = performComparison(
          createLineExtractor('id_node_bottom', 'id_node_top'),
          getEffectiveKeyType(true),
        );
        break;

      case 'FoundationColumn':
        comparisonResult = performComparison(
          createLineExtractor('id_node_bottom', 'id_node_top'),
          getEffectiveKeyType(true),
        );
        break;

      case 'Parapet':
        comparisonResult = performComparison(
          createLineExtractor('id_node_start', 'id_node_end'),
          getEffectiveKeyType(true),
        );
        break;

      case 'StripFooting':
        comparisonResult = performComparison(
          createLineExtractor('id_node_start', 'id_node_end'),
          getEffectiveKeyType(true),
        );
        break;

      case 'IsolatingDevice':
      case 'DampingDevice':
        comparisonResult = performComparison(
          createLineExtractor('id_node_start', 'id_node_end'),
          getEffectiveKeyType(true),
        );
        break;

      // 'Joint' はここに到達しない（compareSingleElementTypeInternal で早期リターン）。
      // 継手は StbDefinition 比較で定義要素として扱う。

      case 'Story':
        // 階の対応キー: 既定は name（"1F","2F"等）、幾何位置基準では標高(height)で対応付ける。
        // GEOMETRY では階名の表記差（"1F" vs "1FL"）を無視し、原点0からの高さ=level で同定する。
        comparisonResult = performComparison((el) => {
          const name = getElementAttribute(el, 'name');
          const id = getElementAttribute(el, 'id');
          let fallbackKey = null;
          if (storyAxisMatchCriterion === STORY_AXIS_MATCH_CRITERION.GEOMETRY) {
            const height = parseFloat(getElementAttribute(el, 'height'));
            // 標高も computeAxisGeometryKey と同じ 10mm グリッドへ量子化する
            fallbackKey = Number.isFinite(height) ? `story:h:${Math.round(height / 10)}` : null;
          } else {
            fallbackKey = name ? `story:${name}` : null;
          }
          return {
            key: getGuidPreferredKey(el, fallbackKey),
            data: { id, name, guid: getElementAttribute(el, 'guid') || undefined },
          };
        }, getEffectiveKeyType(false));
        break;

      case 'Axis':
        // 通り芯の対応キー:
        // - 既定（NAME）: 軸種別（平行/円弧/放射）+ 親グループ名 + name。軸種別をキーに
        //   含めるのは、別種の通り芯で group_name+name が偶然一致した際の誤対応を防ぐため。
        // - 幾何位置（GEOMETRY）: 原点＋距離から算出した実座標で対応付け、符号（name）の
        //   表記差を無視する（computeAxisGeometryKey を使用）。
        comparisonResult = performComparison((el) => {
          const name = getElementAttribute(el, 'name');
          const id = getElementAttribute(el, 'id');
          const axisKind = el?.tagName || el?.nodeName || '';
          let fallbackKey = null;
          if (storyAxisMatchCriterion === STORY_AXIS_MATCH_CRITERION.GEOMETRY) {
            const geometryKey = computeAxisGeometryKey(el);
            fallbackKey = geometryKey ? `axis:${geometryKey}` : null;
          } else {
            const groupName =
              (typeof el?.parentElement?.getAttribute === 'function'
                ? el.parentElement.getAttribute('group_name')
                : null) || '';
            fallbackKey = name ? `axis:${axisKind}:${groupName}:${name}` : null;
          }
          return {
            key: getGuidPreferredKey(el, fallbackKey),
            data: { id, name, guid: getElementAttribute(el, 'guid') || undefined },
          };
        }, getEffectiveKeyType(false));
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

/**
 * @fileoverview モデル文書処理モジュール
 *
 * このモジュールはSTBモデル文書の処理と解析を処理します：
 * - モデル文書読み込みと検証
 * - ノードマップ構築
 * - 階と軸データ抽出
 * - 文書状態管理
 *
 * 保守性向上のため、巨大なcompareModels()関数から抽出されました。
 */

import { loadStbXmlAutoEncoding } from '../common-stb/stbXmlLoader.js';
import { buildNodeMap, parseStories, parseAxes } from '../common-stb/parser/stbXmlParser.js';
import { extractAllSections } from '../common-stb/parser/sectionExtractor.js';
import { detectStbVersion, getVersionInfo } from '../common-stb/parser/utils/versionDetector.js';
import { parseStbCalData } from '../common-stb/parser/stbCalDataParser.js';
import { setState } from '../app/globalState.js';

/**
 * Process model documents and extract structural data
 * @param {File|null} fileA - Model A file
 * @param {File|null} fileB - Model B file
 * @returns {Object} Processing result with model data
 * @throws {TypeError} If fileA or fileB is provided but not a File object
 * @throws {Error} If both fileA and fileB are null
 */
export async function processModelDocuments(fileA, fileB) {
  // Validate input parameters
  if (fileA !== null && !(fileA instanceof File)) {
    const error = new TypeError('fileA must be a File object if provided');
    console.error('Model processing validation failed:', error);
    throw error;
  }

  if (fileB !== null && !(fileB instanceof File)) {
    const error = new TypeError('fileB must be a File object if provided');
    console.error('Model processing validation failed:', error);
    throw error;
  }

  // At least one file must be provided
  if (fileA === null && fileB === null) {
    const error = new Error('At least one model file (fileA or fileB) must be provided');
    console.error('Model processing validation failed:', error);
    throw error;
  }

  let modelADocument = null;
  let modelBDocument = null;
  let nodeMapA = new Map();
  let nodeMapB = new Map();
  let stories = [];
  let axesData = { xAxes: [], yAxes: [] };
  const sectionMaps = {
    columnSections: new Map(),
    postSections: new Map(),
    girderSections: new Map(),
    beamSections: new Map(),
    braceSections: new Map(),
    pileSections: new Map(),
    footingSections: new Map(),
    foundationcolumnSections: new Map(),
    slabSections: new Map(),
    wallSections: new Map(),
  };

  // Version information
  let versionA = null;
  let versionB = null;

  // Calculation data (StbCalData)
  let calDataA = null;
  let calDataB = null;

  try {
    // Process Model A
    if (fileA) {
      const resultA = await processModelFile(fileA, 'A');
      modelADocument = resultA.document;
      nodeMapA = resultA.nodeMap;
      stories.push(...resultA.stories);
      axesData = resultA.axesData;
      versionA = resultA.version;
      calDataA = resultA.calData;

      // Merge section data from Model A
      mergeSectionMaps(sectionMaps, resultA.sectionMaps);
    }

    // Process Model B
    if (fileB) {
      const resultB = await processModelFile(fileB, 'B');
      modelBDocument = resultB.document;
      nodeMapB = resultB.nodeMap;
      versionB = resultB.version;
      calDataB = resultB.calData;

      // If Model A doesn't exist, use Model B's story and axis data
      if (!fileA) {
        stories.length = 0;
        stories.push(...resultB.stories);
        axesData = resultB.axesData;
      }

      // Merge section data from Model B
      mergeSectionMaps(sectionMaps, resultB.sectionMaps);
    }

    // Section maps will be stored in global state by modelLoader.js as 'sectionsData'

    // Remove duplicates from stories and sort by height
    const uniqueStoriesMap = new Map();
    stories.forEach((s) => uniqueStoriesMap.set(s.height, s));
    stories = Array.from(uniqueStoriesMap.values()).sort((a, b) => a.height - b.height);

    // Build version info object
    const versionInfo = {
      versionA: versionA || 'unknown',
      versionB: versionB || 'unknown',
      isCrossVersion: versionA && versionB && versionA !== versionB,
    };

    return {
      success: true,
      modelADocument,
      modelBDocument,
      nodeMapA,
      nodeMapB,
      stories,
      axesData,
      sectionMaps,
      versionInfo,
      calDataA,
      calDataB,
    };
  } catch (error) {
    console.error('Model processing failed:', error);
    return {
      success: false,
      error: error.message,
      modelADocument: null,
      modelBDocument: null,
      nodeMapA: new Map(),
      nodeMapB: new Map(),
      stories: [],
      axesData: { xAxes: [], yAxes: [] },
      versionInfo: { versionA: null, versionB: null, isCrossVersion: false },
      calDataA: null,
      calDataB: null,
    };
  }
}

/**
 * Process a single model file
 * @param {File} file - Model file to process
 * @param {string} modelId - Model identifier ('A' or 'B')
 * @returns {Object} Processing result for single model
 */
async function processModelFile(file, modelId) {
  try {
    // Load and parse STB XML document
    const document = await loadStbXmlAutoEncoding(file);
    if (!document) {
      throw new Error(`モデル${modelId}の解析に失敗しました。`);
    }

    // Detect STB version
    const version = detectStbVersion(document);
    const versionInfo = getVersionInfo(document);

    // Build node map
    const nodeMap = buildNodeMap(document);

    // Parse stories
    const stories = parseStories(document);

    // Parse axes
    const axesData = parseAxes(document);

    // Extract section data (unified)
    const sectionMaps = extractAllSections(document);

    // Parse calculation data (StbCalData) for load visualization
    const calData = parseStbCalData(document);

    // Set document in global state
    if (modelId === 'A') {
      setState('models.documentA', document);
      window.docA = document; // 後方互換性（非推奨）
    } else {
      setState('models.documentB', document);
      window.docB = document; // 後方互換性（非推奨）
    }

    return {
      document,
      nodeMap,
      stories,
      axesData,
      sectionMaps,
      calData,
      version,
      versionInfo,
    };
  } catch (error) {
    console.error(`Failed to process Model ${modelId}:`, error);
    throw new Error(`モデル${modelId}の処理中にエラーが発生しました: ${error.message}`);
  }
}

/**
 * Clear model processing state
 */
export function clearModelProcessingState() {
  // Clear global state
  setState('models.documentA', null);
  setState('models.documentB', null);
  // 後方互換性のためwindowも維持（非推奨）
  window.docA = null;
  window.docB = null;
}

/**
 * Merge section maps from multiple models
 * @param {Object} targetMaps - Target section maps to merge into
 * @param {Object} sourceMaps - Source section maps to merge from
 */
function mergeSectionMaps(targetMaps, sourceMaps) {
  if (!sourceMaps) return;

  // すべての要素タイプの断面データをマージ
  const sectionTypes = [
    'columnSections',
    'postSections',
    'girderSections',
    'beamSections',
    'braceSections',
    'pileSections',
    'footingSections',
    'foundationcolumnSections',
    'slabSections',
    'wallSections',
  ];

  sectionTypes.forEach((sectionType) => {
    if (sourceMaps[sectionType]) {
      sourceMaps[sectionType].forEach((value, key) => {
        if (!targetMaps[sectionType]) {
          targetMaps[sectionType] = new Map();
        }
        targetMaps[sectionType].set(key, value);
      });
    }
  });
}

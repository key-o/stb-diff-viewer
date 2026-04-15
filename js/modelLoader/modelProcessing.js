/**
 * @fileoverview モデル文書処理モジュール
 *
 * STBモデル文書の読み込み・解析・断面抽出を行う純粋な変換層。
 * globalState への書き込みは行わない（呼び出し元が担当）。
 */

import { loadStbXmlAutoEncoding } from '../common-stb/import/loader/stbXmlLoader.js';
import { buildNodeMap, parseStories, parseAxes } from '../common-stb/import/parser/stbXmlParser.js';
import { extractAllSections } from '../common-stb/import/extractor/sectionExtractor.js';
import {
  detectStbVersion,
  getVersionInfo,
} from '../common-stb/import/parser/utils/versionDetector.js';
import { parseStbCalData } from '../common-stb/import/extractor/StbCalDataExtractor.js';
import { getLoaderSetState } from './loaderDependencies.js';

/**
 * Process model documents and extract structural data.
 * When both files are provided, they are parsed in parallel using Promise.all.
 * Throws on failure (caller should catch).
 * @param {File|null} fileA - Model A file
 * @param {File|null} fileB - Model B file
 * @returns {Promise<Object>} Processing result with model data
 * @throws {TypeError} If fileA or fileB is provided but not a File object
 * @throws {Error} If both fileA and fileB are null or processing fails
 */
export async function processModelDocuments(fileA, fileB) {
  if (fileA !== null && !(fileA instanceof File)) {
    throw new TypeError('fileA must be a File object if provided');
  }
  if (fileB !== null && !(fileB instanceof File)) {
    throw new TypeError('fileB must be a File object if provided');
  }
  if (fileA === null && fileB === null) {
    throw new Error('At least one model file (fileA or fileB) must be provided');
  }

  // Process Model A and B in parallel when both are provided
  const [resultA, resultB] = await Promise.all([
    fileA ? processModelFile(fileA) : Promise.resolve(null),
    fileB ? processModelFile(fileB) : Promise.resolve(null),
  ]);

  // Use Model A's stories/axes, or fall back to Model B's
  const primaryResult = resultA || resultB;
  let stories = [...primaryResult.stories];
  const axesData = primaryResult.axesData;

  // Merge stories from both models and deduplicate by height
  if (resultA && resultB) {
    const uniqueStoriesMap = new Map();
    for (const s of resultA.stories) uniqueStoriesMap.set(s.height, s);
    for (const s of resultB.stories) uniqueStoriesMap.set(s.height, s);
    stories = Array.from(uniqueStoriesMap.values()).sort((a, b) => a.height - b.height);
  }

  // Merge section maps
  const sectionMaps = resultA?.sectionMaps || {};
  if (resultB) {
    mergeSectionMaps(sectionMaps, resultB.sectionMaps);
  }

  // Build version info
  const versionA = resultA?.version || null;
  const versionB = resultB?.version || null;
  const versionInfo = {
    versionA: versionA || 'unknown',
    versionB: versionB || 'unknown',
    isCrossVersion: versionA && versionB && versionA !== versionB,
    sourceTypeA: resultA?.sourceType || 'stb',
    sourceTypeB: resultB?.sourceType || 'stb',
    ifcSchemaA: resultA?.ifcSchema || null,
    ifcSchemaB: resultB?.ifcSchema || null,
  };

  return {
    modelADocument: resultA?.document || null,
    modelBDocument: resultB?.document || null,
    nodeMapA: resultA?.nodeMap || new Map(),
    nodeMapB: resultB?.nodeMap || new Map(),
    stories,
    axesData,
    sectionMaps,
    versionInfo,
    calDataA: resultA?.calData || null,
    calDataB: resultB?.calData || null,
  };
}

/**
 * ファイルがIFC形式かどうかを判定
 * @param {File} file - チェック対象ファイル
 * @returns {boolean}
 */
function isIfcFile(file) {
  return file.name.toLowerCase().endsWith('.ifc');
}

/**
 * Process a single model file (pure transformation, no side effects)
 * Supports STB (XML) and IFC files.
 * All importers return a unified ImportResult: { document, metadata }.
 * @param {File} file - Model file to process
 * @returns {Promise<Object>} Processing result for single model
 */
async function processModelFile(file) {
  /** @type {import('../constants/importTypes.js').ImportResult} */
  let importResult;

  if (isIfcFile(file)) {
    const { convertIfcToStbDocument } = await import('../common-ifc/IfcToStbBridge.js');
    importResult = await convertIfcToStbDocument(file);
  } else {
    importResult = await loadStbXmlAutoEncoding(file);
  }

  const { document, metadata } = importResult;

  if (!document) {
    throw new Error('モデルファイルの解析に失敗しました。');
  }

  return {
    document,
    nodeMap: buildNodeMap(document),
    stories: parseStories(document),
    axesData: parseAxes(document),
    sectionMaps: extractAllSections(document),
    calData: metadata.calData || parseStbCalData(document),
    version: detectStbVersion(document),
    versionInfo: getVersionInfo(document),
    sourceType: metadata.sourceType,
    ifcSchema: metadata.ifcSchema || null,
  };
}

/**
 * Clear model processing state
 */
export function clearModelProcessingState() {
  const setState = getLoaderSetState();
  setState('models.documentA', null);
  setState('models.documentB', null);
}

/**
 * Merge section maps from source into target
 * @param {Object} targetMaps - Target section maps to merge into
 * @param {Object} sourceMaps - Source section maps to merge from
 */
function mergeSectionMaps(targetMaps, sourceMaps) {
  if (!sourceMaps) return;

  for (const [sectionType, sourceMap] of Object.entries(sourceMaps)) {
    if (!sourceMap || typeof sourceMap.forEach !== 'function') continue;
    if (!targetMaps[sectionType]) {
      targetMaps[sectionType] = new Map();
    }
    sourceMap.forEach((value, key) => {
      targetMaps[sectionType].set(key, value);
    });
  }
}

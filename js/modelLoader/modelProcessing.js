/**
 * @fileoverview Model document processing module
 *
 * This module handles STB model document processing and parsing:
 * - Model document loading and validation
 * - Node map construction
 * - Story and axis data extraction
 * - Document state management
 *
 * Extracted from the massive compareModels() function for better maintainability.
 */

import { loadStbXmlAutoEncoding } from "../viewer/utils/utils.js";
import {
  buildNodeMap,
  parseStories,
  parseAxes,
  extractAllSections,
} from "../parser/stbXmlParser.js";
import { setState } from "../core/globalState.js";

/**
 * Process model documents and extract structural data
 * @param {File|null} fileA - Model A file
 * @param {File|null} fileB - Model B file
 * @returns {Object} Processing result with model data
 */
export async function processModelDocuments(fileA, fileB) {
  let modelADocument = null;
  let modelBDocument = null;
  let nodeMapA = new Map();
  let nodeMapB = new Map();
  let stories = [];
  let axesData = { xAxes: [], yAxes: [] };
  let sectionMaps = { columnSections: new Map(), beamSections: new Map(), braceSections: new Map() };

  try {
    // Process Model A
    if (fileA) {
      const resultA = await processModelFile(fileA, 'A');
      modelADocument = resultA.document;
      nodeMapA = resultA.nodeMap;
      stories.push(...resultA.stories);
      axesData = resultA.axesData;
      
      // Merge section data from Model A
      mergeSectionMaps(sectionMaps, resultA.sectionMaps);
    }

    // Process Model B
    if (fileB) {
      const resultB = await processModelFile(fileB, 'B');
      modelBDocument = resultB.document;
      nodeMapB = resultB.nodeMap;
      
      // If Model A doesn't exist, use Model B's story and axis data
      if (!fileA) {
        stories.length = 0;
        stories.push(...resultB.stories);
        axesData = resultB.axesData;
      }
      
      // Merge section data from Model B
      mergeSectionMaps(sectionMaps, resultB.sectionMaps);
    }

    // Store section maps in global state for label generation
    setState('model.sectionMaps', sectionMaps);
    console.log(`Stored section maps: ${sectionMaps.columnSections.size} column sections, ${sectionMaps.beamSections.size} beam sections, ${sectionMaps.braceSections.size} brace sections`);

    // Remove duplicates from stories and sort by height
    const uniqueStoriesMap = new Map();
    stories.forEach((s) => uniqueStoriesMap.set(s.height, s));
    stories = Array.from(uniqueStoriesMap.values()).sort(
      (a, b) => a.height - b.height
    );

    return {
      success: true,
      modelADocument,
      modelBDocument,
      nodeMapA,
      nodeMapB,
      stories,
      axesData,
      sectionMaps
    };

  } catch (error) {
    console.error("Model processing failed:", error);
    return {
      success: false,
      error: error.message,
      modelADocument: null,
      modelBDocument: null,
      nodeMapA: new Map(),
      nodeMapB: new Map(),
      stories: [],
      axesData: { xAxes: [], yAxes: [] }
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
    console.log(`Processing Model ${modelId}:`, file.name);
    
    // Load and parse STB XML document
    const document = await loadStbXmlAutoEncoding(file);
    if (!document) {
      throw new Error(`モデル${modelId}の解析に失敗しました。`);
    }

    // Build node map
    const nodeMap = buildNodeMap(document);
    console.log(`Model ${modelId}: Built node map with ${nodeMap.size} nodes`);

    // Parse stories
    const stories = parseStories(document);
    console.log(`Model ${modelId}: Parsed ${stories.length} stories`);

    // Parse axes
    const axesData = parseAxes(document);
    console.log(`Model ${modelId}: Parsed axes - X: ${axesData.xAxes.length}, Y: ${axesData.yAxes.length}`);

    // Extract section data (unified)
    const sectionMaps = extractAllSections(document);

    // Set global reference for legacy compatibility
    if (modelId === 'A') {
      window.docA = document;
    } else {
      window.docB = document;
    }

    return {
      document,
      nodeMap,
      stories,
      axesData,
      sectionMaps
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
  // Clear global window references
  window.docA = null;
  window.docB = null;
  
  console.log("Model processing state cleared");
}

/**
 * Validate model document structure
 * @param {Document} document - XML document to validate
 * @param {string} modelId - Model identifier
 * @returns {Object} Validation result
 */
export function validateModelDocument(document, modelId) {
  const validation = {
    isValid: true,
    warnings: [],
    errors: []
  };

  if (!document) {
    validation.isValid = false;
    validation.errors.push(`Model ${modelId}: Document is null or undefined`);
    return validation;
  }

  // Check for STB namespace
  const stbElements = document.getElementsByTagName('StbModel');
  if (stbElements.length === 0) {
    validation.warnings.push(`Model ${modelId}: No StbModel root element found`);
  }

  // Check for nodes
  const nodeElements = document.getElementsByTagName('StbNode');
  if (nodeElements.length === 0) {
    validation.warnings.push(`Model ${modelId}: No nodes found`);
  } else {
    console.log(`Model ${modelId}: Found ${nodeElements.length} nodes`);
  }

  // Check for basic structural elements
  const structuralElements = [
    'StbColumn', 'StbGirder', 'StbBeam', 'StbBrace', 'StbSlab', 'StbWall'
  ];
  
  let totalElements = 0;
  structuralElements.forEach(elementType => {
    const elements = document.getElementsByTagName(elementType);
    totalElements += elements.length;
    if (elements.length > 0) {
      console.log(`Model ${modelId}: Found ${elements.length} ${elementType} elements`);
    }
  });

  if (totalElements === 0) {
    validation.warnings.push(`Model ${modelId}: No structural elements found`);
  }

  return validation;
}

/**
 * Merge section maps from multiple models
 * @param {Object} targetMaps - Target section maps to merge into
 * @param {Object} sourceMaps - Source section maps to merge from
 */
function mergeSectionMaps(targetMaps, sourceMaps) {
  if (!sourceMaps) return;
  
  // Merge column sections
  if (sourceMaps.columnSections) {
    sourceMaps.columnSections.forEach((value, key) => {
      targetMaps.columnSections.set(key, value);
    });
  }
  
  // Merge beam sections
  if (sourceMaps.beamSections) {
    sourceMaps.beamSections.forEach((value, key) => {
      targetMaps.beamSections.set(key, value);
    });
  }
  
  // Merge brace sections
  if (sourceMaps.braceSections) {
    sourceMaps.braceSections.forEach((value, key) => {
      targetMaps.braceSections.set(key, value);
    });
  }
}
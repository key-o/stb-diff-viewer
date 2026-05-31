/**
 * @fileoverview 隕∫ｴ蜍慕噪譖ｴ譁ｰ繝｢繧ｸ繝･繝ｼ繝ｫ
 *
 * 縺薙・繝｢繧ｸ繝･繝ｼ繝ｫ縺ｯ縲∝句挨隕∫ｴ縺ｮ繧ｸ繧ｪ繝｡繝医Μ繧偵Μ繧｢繝ｫ繧ｿ繧､繝縺ｧ譖ｴ譁ｰ縺吶ｋ讖溯・繧呈署萓帙＠縺ｾ縺・
 * - 迚ｹ螳夊ｦ∫ｴ縺ｮ繝｡繝・す繝･讀懃ｴ｢
 * - 繧ｸ繧ｪ繝｡繝医Μ縺ｮ蜀咲函謌舌→鄂ｮ縺肴鋤縺・
 * - XML繝峨く繝･繝｡繝ｳ繝医→縺ｮ蜷梧悄
 *
 * 邱ｨ髮・ｩ溯・縺ｨ繧ｸ繧ｪ繝｡繝医Μ陦ｨ遉ｺ縺ｮ邨ｱ蜷医ｒ螳溽樟縺励∪縺吶・
 */

import * as THREE from 'three';
import { createLogger } from '../utils/logger.js';
import { getViewerState } from './stateProvider.js';

const logger = createLogger('ElementUpdater');
import { elementGroups } from './core/core.js';
import { ProfileBasedColumnGenerator } from './geometry/generators/ProfileBasedColumnGenerator.js';
import { ProfileBasedPostGenerator } from './geometry/generators/ProfileBasedPostGenerator.js';
import { ProfileBasedBeamGenerator } from './geometry/generators/ProfileBasedBeamGenerator.js';
import { ProfileBasedBraceGenerator } from './geometry/generators/ProfileBasedBraceGenerator.js';
import { IsolatingDeviceGenerator } from './geometry/generators/IsolatingDeviceGenerator.js';
import { DampingDeviceGenerator } from './geometry/generators/DampingDeviceGenerator.js';
import { PileGenerator } from './geometry/generators/PileGenerator.js';
import { FootingGenerator } from './geometry/generators/FootingGenerator.js';
import { extractAllSections } from '../common-stb/import/extractor/sectionExtractor.js';
import { scheduleRender } from '../utils/renderScheduler.js';

/**
 * 繧ｰ繝ｫ繝ｼ繝怜・縺九ｉ迚ｹ螳壹・隕∫ｴID繧呈戟縺､繝｡繝・す繝･繧呈､懃ｴ｢
 * @param {THREE.Group} group - 讀懃ｴ｢蟇ｾ雎｡繧ｰ繝ｫ繝ｼ繝・
 * @param {string} elementId - 隕∫ｴID
 * @param {string} modelSource - "modelA" 縺ｾ縺溘・ "modelB" 縺ｾ縺溘・ "matched"
 * @returns {THREE.Mesh|null} 隕九▽縺九▲縺溘Γ繝・す繝･縲√∪縺溘・ null
 */
function findMeshByElementId(group, elementId, modelSource) {
  if (!group || !group.children) return null;

  for (const child of group.children) {
    if (child.userData) {
      // 繝｢繝・ΝA縺ｮ隕∫ｴ繧呈爾縺・
      if (modelSource === 'modelA' && child.userData.elementIdA === elementId) {
        return child;
      }
      // 繝｢繝・ΝB縺ｮ隕∫ｴ繧呈爾縺・
      if (modelSource === 'modelB' && child.userData.elementIdB === elementId) {
        return child;
      }
      // 繝槭ャ繝√＠縺溯ｦ∫ｴ・井ｸ｡譁ｹ縺ｮID繧呈戟縺､・・
      if (
        modelSource === 'matched' &&
        (child.userData.elementIdA === elementId || child.userData.elementIdB === elementId)
      ) {
        return child;
      }
      // 蜊倅ｸ隕∫ｴ・・lementId繧呈戟縺､・・
      if (child.userData.elementId === elementId) {
        return child;
      }
    }
  }

  return null;
}

/**
 * XML繝峨く繝･繝｡繝ｳ繝医°繧芽ｦ∫ｴ繝・・繧ｿ繧貞叙蠕・
 * @param {Document} doc - XML繝峨く繝･繝｡繝ｳ繝・
 * @param {string} elementType - 隕∫ｴ繧ｿ繧､繝暦ｼ・Column", "Beam"遲会ｼ・
 * @param {string} elementId - 隕∫ｴID
 * @returns {Element|null} XML隕∫ｴ
 */
function getElementFromDocument(doc, elementType, elementId) {
  if (!doc) return null;

  const tagName = elementType === 'Node' ? 'StbNode' : `Stb${elementType}`;
  return doc.querySelector(`${tagName}[id="${elementId}"]`);
}

/**
 * 繝弱・繝峨・繝・・繧貞叙蠕暦ｼ・ML繝峨く繝･繝｡繝ｳ繝医°繧画ｧ狗ｯ会ｼ・
 * @param {Document} doc - XML繝峨く繝･繝｡繝ｳ繝・
 * @returns {Map<string, THREE.Vector3>} 繝弱・繝峨・繝・・
 */
function buildNodeMapFromDocument(doc) {
  const nodeMap = new Map();

  if (!doc) return nodeMap;

  const nodes = doc.querySelectorAll('StbNode');
  nodes.forEach((node) => {
    const id = node.getAttribute('id');
    const x = parseFloat(node.getAttribute('X') || 0);
    const y = parseFloat(node.getAttribute('Y') || 0);
    const z = parseFloat(node.getAttribute('Z') || 0);

    nodeMap.set(id, new THREE.Vector3(x, y, z));
  });

  return nodeMap;
}

/**
 * 迚ｹ螳夊ｦ∫ｴ縺ｮ繧ｸ繧ｪ繝｡繝医Μ繧貞・逕滓・
 * @param {string} elementType - "Column", "Beam", "Pile"遲・
 * @param {string} elementId - 隕∫ｴID
 * @param {string} modelSource - "modelA" 縺ｾ縺溘・ "modelB"
 * @returns {Promise<boolean>} 譖ｴ譁ｰ謌仙粥蜿ｯ蜷ｦ
 */
export async function regenerateElementGeometry(elementType, elementId, modelSource = 'modelA') {
  try {
    // 1. 繧ｰ繝ｫ繝ｼ繝励→繝峨く繝･繝｡繝ｳ繝医ｒ蜿門ｾ・
    const group = elementGroups[elementType];
    if (!group) {
      logger.error(`Element group not found: ${elementType}`);
      return false;
    }

    const doc =
      modelSource === 'modelA'
        ? getViewerState('models.documentA')
        : getViewerState('models.documentB');
    if (!doc) {
      logger.error(`Document not found: ${modelSource}`);
      return false;
    }

    // 2. 蜿､縺・Γ繝・す繝･繧貞炎髯､
    const oldMesh = findMeshByElementId(group, elementId, modelSource);
    if (oldMesh) {
      group.remove(oldMesh);

      // 繧ｸ繧ｪ繝｡繝医Μ縺ｨ繝槭ユ繝ｪ繧｢繝ｫ繧堤ｴ譽・
      if (oldMesh.geometry) oldMesh.geometry.dispose();
      if (oldMesh.material) {
        if (Array.isArray(oldMesh.material)) {
          oldMesh.material.forEach((mat) => mat.dispose());
        } else {
          oldMesh.material.dispose();
        }
      }
    }

    // 3. XML縺九ｉ譖ｴ譁ｰ縺輔ｌ縺溯ｦ∫ｴ繝・・繧ｿ繧貞叙蠕・
    const elementNode = getElementFromDocument(doc, elementType, elementId);
    if (!elementNode) {
      logger.error(`Element not found in document: ${elementId}`);
      return false;
    }

    // 4. 蠢・ｦ√↑繝・・繧ｿ繧呈ｧ狗ｯ・
    const nodeMap = buildNodeMapFromDocument(doc);
    const sections = extractAllSections(doc);

    // 5. 隕∫ｴ繧ｿ繧､繝励↓蠢懊§縺ｦ繧ｸ繧ｪ繝｡繝医Μ繧堤函謌・
    const newMesh = await generateMeshForElement(elementType, elementNode, nodeMap, sections);

    if (!newMesh) {
      logger.error(`Failed to generate mesh for ${elementId}`);
      return false;
    }

    // 6. 譁ｰ縺励＞繝｡繝・す繝･繧偵げ繝ｫ繝ｼ繝励↓霑ｽ蜉
    group.add(newMesh);

    // 7. 繝ｬ繝ｳ繝繝ｪ繝ｳ繧ｰ譖ｴ譁ｰ繧偵Μ繧ｯ繧ｨ繧ｹ繝・
    scheduleRender();

    return true;
  } catch (error) {
    logger.error(`Error regenerating ${elementType} ${elementId}:`, error);
    return false;
  }
}

/**
 * 隕∫ｴ繧ｿ繧､繝励↓蠢懊§縺ｦ繝｡繝・す繝･繧堤函謌・
 * @param {string} elementType - 隕∫ｴ繧ｿ繧､繝・
 * @param {Element} elementNode - XML隕∫ｴ繝弱・繝・
 * @param {Map} nodeMap - 繝弱・繝峨・繝・・
 * @param {Object} sections - 譁ｭ髱｢繝・・繧ｿ
 * @returns {Promise<THREE.Mesh|null>} 逕滓・縺輔ｌ縺溘Γ繝・す繝･
 */
async function generateMeshForElement(elementType, elementNode, nodeMap, sections) {
  // 隕∫ｴ繝・・繧ｿ繧偵が繝悶ず繧ｧ繧ｯ繝医↓螟画鋤
  const elementData = xmlNodeToObject(elementNode);

  try {
    switch (elementType) {
      case 'Column':
        return generateColumnMesh(elementData, nodeMap, sections);

      case 'Post':
        return generatePostMesh(elementData, nodeMap, sections);

      case 'Beam':
      case 'Girder':
        return generateBeamMesh(elementData, nodeMap, sections, elementType);

      case 'Brace':
        return generateBraceMesh(elementData, nodeMap, sections);

      case 'IsolatingDevice':
        return generateIsolatingDeviceMesh(elementData, nodeMap, sections);

      case 'DampingDevice':
        return generateDampingDeviceMesh(elementData, nodeMap, sections);

      case 'Pile':
        return generatePileMesh(elementData, nodeMap, sections);

      case 'Footing':
        return generateFootingMesh(elementData, nodeMap, sections);

      default:
        logger.warn(`Unsupported element type: ${elementType}`);
        return null;
    }
  } catch (error) {
    logger.error(`Error generating mesh for ${elementType}:`, error);
    return null;
  }
}

/**
 * XML隕∫ｴ繝弱・繝峨ｒJavaScript繧ｪ繝悶ず繧ｧ繧ｯ繝医↓螟画鋤
 * @param {Element} node - XML隕∫ｴ繝弱・繝・
 * @returns {Object} 螟画鋤縺輔ｌ縺溘が繝悶ず繧ｧ繧ｯ繝・
 */
function xmlNodeToObject(node) {
  const obj = {};

  // 蜈ｨ螻樊ｧ繧貞叙蠕・
  Array.from(node.attributes).forEach((attr) => {
    obj[attr.name] = attr.value;
  });

  return obj;
}

/**
 * 譟ｱ繝｡繝・す繝･繧堤函謌・
 */
function generateColumnMesh(columnData, nodeMap, sections) {
  const meshes = ProfileBasedColumnGenerator.createColumnMeshes(
    [columnData],
    nodeMap,
    sections.columnSections,
    sections.steelSections,
    'Column',
    false, // isJsonInput
  );

  return meshes.length > 0 ? meshes[0] : null;
}

/**
 * 繝昴せ繝医Γ繝・す繝･繧堤函謌・
 */
function generatePostMesh(postData, nodeMap, sections) {
  const meshes = ProfileBasedPostGenerator.createPostMeshes(
    [postData],
    nodeMap,
    sections.postSections || sections.columnSections,
    sections.steelSections,
    'Post',
    false,
  );

  return meshes.length > 0 ? meshes[0] : null;
}

/**
 * 譴√Γ繝・す繝･繧堤函謌・
 */
function generateBeamMesh(beamData, nodeMap, sections, elementType) {
  // elementType 縺ｫ蠢懊§縺ｦ驕ｩ蛻・↑譁ｭ髱｢繝槭ャ繝励ｒ驕ｸ謚・
  const sectionMap =
    elementType === 'Girder'
      ? sections.girderSections || sections.beamSections
      : sections.beamSections || sections.girderSections;

  const meshes = ProfileBasedBeamGenerator.createBeamMeshes(
    [beamData],
    nodeMap,
    sectionMap,
    sections.steelSections,
    elementType,
    false,
  );

  return meshes.length > 0 ? meshes[0] : null;
}

/**
 * 繝悶Ξ繝ｼ繧ｹ繝｡繝・す繝･繧堤函謌・
 */
function generateBraceMesh(braceData, nodeMap, sections) {
  const meshes = ProfileBasedBraceGenerator.createBraceMeshes(
    [braceData],
    nodeMap,
    sections.braceSections,
    sections.steelSections,
    'Brace',
    false,
  );

  return meshes.length > 0 ? meshes[0] : null;
}

/**
 * 蜈埼怫陬・ｽｮ繝｡繝・す繝･繧堤函謌・
 */
function generateIsolatingDeviceMesh(deviceData, nodeMap, sections) {
  const meshes = IsolatingDeviceGenerator.createIsolatingDeviceMeshes(
    [deviceData],
    nodeMap,
    sections.isolatingDeviceSections || sections.isolatingdeviceSections || new Map(),
    sections.steelSections,
    'IsolatingDevice',
    false,
  );

  return meshes.length > 0 ? meshes[0] : null;
}

/**
 * 蛻ｶ謖ｯ陬・ｽｮ繝｡繝・す繝･繧堤函謌・
 */
function generateDampingDeviceMesh(deviceData, nodeMap, sections) {
  const meshes = DampingDeviceGenerator.createDampingDeviceMeshes(
    [deviceData],
    nodeMap,
    sections.dampingDeviceSections || sections.dampingdeviceSections || new Map(),
    sections.steelSections,
    'DampingDevice',
    false,
  );

  return meshes.length > 0 ? meshes[0] : null;
}

/**
 * 譚ｭ繝｡繝・す繝･繧堤函謌・
 */
function generatePileMesh(pileData, nodeMap, sections) {
  const meshes = PileGenerator.createPileMeshes(
    [pileData],
    nodeMap,
    sections.pileSections,
    'Pile',
    false,
  );

  return meshes.length > 0 ? meshes[0] : null;
}

/**
 * 蝓ｺ遉弱Γ繝・す繝･繧堤函謌・
 */
function generateFootingMesh(footingData, nodeMap, sections) {
  const meshes = FootingGenerator.createFootingMeshes(
    [footingData],
    nodeMap,
    sections.footingSections,
    'Footing',
    false,
  );

  return meshes.length > 0 ? meshes[0] : null;
}

/**
 * 隍・焚隕∫ｴ縺ｮ繧ｸ繧ｪ繝｡繝医Μ繧剃ｸ諡ｬ蜀咲函謌・
 * @param {Array<{elementType: string, elementId: string}>} elements - 隕∫ｴ繝ｪ繧ｹ繝・
 * @param {string} modelSource - "modelA" 縺ｾ縺溘・ "modelB"
 * @returns {Promise<Object>} 譖ｴ譁ｰ邨先棡縺ｮ邨ｱ險・
 */
export async function regenerateMultipleElements(elements, modelSource = 'modelA') {
  const results = {
    success: 0,
    failed: 0,
    total: elements.length,
  };

  for (const { elementType, elementId } of elements) {
    const success = await regenerateElementGeometry(elementType, elementId, modelSource);
    if (success) {
      results.success++;
    } else {
      results.failed++;
    }
  }

  return results;
}

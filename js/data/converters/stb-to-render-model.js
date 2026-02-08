/**
 * STB to RenderModel Converter
 *
 * STBパーサーの出力をRenderModel形式に変換します。
 * これにより、パーサー層と描画層の間のデータ形式を明確に分離します。
 *
 * @module data/converters/stb-to-render-model
 */

import { createEmptyRenderModel } from '../../constants/renderModelTypes.js';
import {
  createNodePositionMap,
  getNodePosition,
  calculateBoundingBox,
  getSectionById,
  convertToRenderSection,
} from './render-model-utils.js';

// ============================================
// メイン変換関数
// ============================================

/**
 * STBパース結果をRenderModelに変換
 *
 * @param {Object} stbData - パーサーからの出力
 * @param {Object} [options={}] - 変換オプション
 * @param {boolean} [options.includeNodes=true] - 節点を含める
 * @param {boolean} [options.calculateBounds=true] - バウンディングボックス計算
 * @returns {import('../../viewer/types/render-model.js').StbRenderModel}
 */
export function convertToRenderModel(stbData, options = {}) {
  if (!stbData) {
    return createEmptyRenderModel();
  }

  const { includeNodes = true, calculateBounds = true } = options;

  // 節点マップを作成（座標参照用）
  const nodeMap = createNodePositionMap(stbData.nodes || []);

  // 断面情報
  const sections = stbData.sections || {};

  // 各要素を変換
  const renderModel = {
    nodes: includeNodes ? convertNodes(stbData.nodes) : [],
    columns: convertLinearElements(stbData.columns, nodeMap, sections, 'Column'),
    posts: convertLinearElements(stbData.posts, nodeMap, sections, 'Post'),
    girders: convertGirders(stbData.girders, nodeMap, sections),
    beams: convertLinearElements(stbData.beams, nodeMap, sections, 'Beam'),
    braces: convertLinearElements(stbData.braces, nodeMap, sections, 'Brace'),
    slabs: convertSlabs(stbData.slabs, nodeMap),
    walls: convertWalls(stbData.walls, nodeMap, stbData.openings),
    footings: convertFootings(stbData.footings, nodeMap),
    piles: convertPiles(stbData.piles, nodeMap),
    foundationColumns: convertLinearElements(
      stbData.foundationColumns,
      nodeMap,
      sections,
      'FoundationColumn',
    ),
    parapets: convertParapets(stbData.parapets, nodeMap, sections),
    stripFootings: convertStripFootings(stbData.stripFootings, nodeMap),
    joints: convertJoints(stbData.joints, nodeMap),
    axes: convertAxes(stbData.axes),
    stories: convertStories(stbData.stories),
    meta: {
      fileName: stbData.meta?.fileName || null,
      stbVersion: stbData.meta?.version || null,
      boundingBox: calculateBounds ? calculateBoundingBox(stbData.nodes) : null,
    },
  };

  return renderModel;
}

// ============================================
// 節点変換
// ============================================

/**
 * 節点を変換
 * @param {Array} nodes - STB節点配列
 * @returns {import('../../viewer/types/render-elements.js').RenderNode[]}
 */
function convertNodes(nodes) {
  if (!nodes || !Array.isArray(nodes)) {
    return [];
  }

  return nodes.map((node) => ({
    id: String(node.id),
    x: parseFloat(node.x) || 0,
    y: parseFloat(node.y) || 0,
    z: parseFloat(node.z) || 0,
  }));
}

// ============================================
// 線状要素変換
// ============================================

/**
 * 線状要素を変換（汎用）
 * @param {Array} elements - 要素配列
 * @param {Map} nodeMap - 節点位置マップ
 * @param {Object} sections - 断面情報
 * @param {string} elementType - 要素タイプ
 * @returns {Array}
 */
function convertLinearElements(elements, nodeMap, sections, elementType) {
  if (!elements || !Array.isArray(elements)) {
    return [];
  }

  return elements.map((element) => {
    const startNodeId = element.idNodeStart || element.id_node_start;
    const endNodeId = element.idNodeEnd || element.id_node_end;
    const sectionId = element.idSection || element.id_section;

    const startPos = getNodePosition(nodeMap, startNodeId);
    const endPos = getNodePosition(nodeMap, endNodeId);
    const section = getSectionById(sectionId, sections);

    return {
      id: String(element.id),
      name: element.name || '',
      elementType,
      idNodeStart: String(startNodeId),
      idNodeEnd: String(endNodeId),
      startPos,
      endPos,
      kindStructure: element.kindStructure || element.kind_structure || 'RC',
      rotate: parseFloat(element.rotate) || 0,
      section: convertToRenderSection(section || element.section),
    };
  });
}

/**
 * 大梁を変換（ハンチ対応）
 * @param {Array} girders - 大梁配列
 * @param {Map} nodeMap - 節点位置マップ
 * @param {Object} sections - 断面情報
 * @returns {import('../../viewer/types/render-elements.js').RenderGirder[]}
 */
function convertGirders(girders, nodeMap, sections) {
  if (!girders || !Array.isArray(girders)) {
    return [];
  }

  return girders.map((girder) => {
    const startNodeId = girder.idNodeStart || girder.id_node_start;
    const endNodeId = girder.idNodeEnd || girder.id_node_end;
    const sectionId = girder.idSection || girder.id_section;

    const startPos = getNodePosition(nodeMap, startNodeId);
    const endPos = getNodePosition(nodeMap, endNodeId);
    const section = getSectionById(sectionId, sections);

    const result = {
      id: String(girder.id),
      name: girder.name || '',
      elementType: 'Girder',
      idNodeStart: String(startNodeId),
      idNodeEnd: String(endNodeId),
      startPos,
      endPos,
      kindStructure: girder.kindStructure || girder.kind_structure || 'RC',
      isFoundation: girder.isFoundation || girder.is_foundation || false,
      section: convertToRenderSection(section || girder.section),
    };

    // ハンチ情報
    if (girder.haunchStart) {
      result.haunchStart = convertHaunch(girder.haunchStart);
    }
    if (girder.haunchEnd) {
      result.haunchEnd = convertHaunch(girder.haunchEnd);
    }

    return result;
  });
}

/**
 * ハンチ情報を変換
 * @param {Object} haunch - ハンチ情報
 * @returns {import('../../viewer/types/render-elements.js').RenderHaunch}
 */
function convertHaunch(haunch) {
  return {
    width: parseFloat(haunch.width) || 0,
    height: parseFloat(haunch.height) || 0,
    length: parseFloat(haunch.length) || 0,
  };
}

// ============================================
// 面状要素変換
// ============================================

/**
 * スラブを変換
 * @param {Array} slabs - スラブ配列
 * @param {Map} nodeMap - 節点位置マップ
 * @returns {import('../../viewer/types/render-elements.js').RenderSlab[]}
 */
function convertSlabs(slabs, nodeMap) {
  if (!slabs || !Array.isArray(slabs)) {
    return [];
  }

  return slabs.map((slab) => {
    const nodeIds = slab.nodeIds || slab.node_ids || [];
    const vertices = nodeIds.map((id) => getNodePosition(nodeMap, id));

    return {
      id: String(slab.id),
      name: slab.name || '',
      elementType: 'Slab',
      nodeIds: nodeIds.map(String),
      vertices,
      thickness: parseFloat(slab.thickness) || 0,
      level: parseFloat(slab.level) || 0,
      openings: convertOpenings(slab.openings, nodeMap),
    };
  });
}

/**
 * 壁を変換
 * @param {Array} walls - 壁配列
 * @param {Map} nodeMap - 節点位置マップ
 * @param {Array} openings - 開口配列
 * @returns {import('../../viewer/types/render-elements.js').RenderWall[]}
 */
function convertWalls(walls, nodeMap, openings) {
  if (!walls || !Array.isArray(walls)) {
    return [];
  }

  // 開口をマップ化
  const openingMap = new Map();
  if (openings && Array.isArray(openings)) {
    openings.forEach((opening) => {
      const parentId = opening.parentId || opening.parent_id;
      if (parentId) {
        if (!openingMap.has(parentId)) {
          openingMap.set(parentId, []);
        }
        openingMap.get(parentId).push(opening);
      }
    });
  }

  return walls.map((wall) => {
    const startNodeId = wall.idNodeStart || wall.id_node_start;
    const endNodeId = wall.idNodeEnd || wall.id_node_end;

    const startPos = getNodePosition(nodeMap, startNodeId);
    const endPos = getNodePosition(nodeMap, endNodeId);
    const wallOpenings = openingMap.get(wall.id) || wall.openings || [];

    return {
      id: String(wall.id),
      name: wall.name || '',
      elementType: 'Wall',
      idNodeStart: String(startNodeId),
      idNodeEnd: String(endNodeId),
      startPos,
      endPos,
      thickness: parseFloat(wall.thickness) || 0,
      bottomLevel: parseFloat(wall.bottomLevel || wall.bottom_level) || 0,
      topLevel: parseFloat(wall.topLevel || wall.top_level) || 0,
      openings: convertOpenings(wallOpenings, nodeMap),
    };
  });
}

/**
 * パラペットを変換
 * @param {Array} parapets - パラペット配列
 * @param {Map} nodeMap - 節点位置マップ
 * @param {Object} sections - 断面情報
 * @returns {import('../../viewer/types/render-elements.js').RenderParapet[]}
 */
function convertParapets(parapets, nodeMap, _sections) {
  if (!parapets || !Array.isArray(parapets)) {
    return [];
  }

  return parapets.map((parapet) => {
    const startNodeId = parapet.idNodeStart || parapet.id_node_start;
    const endNodeId = parapet.idNodeEnd || parapet.id_node_end;

    const startPos = getNodePosition(nodeMap, startNodeId);
    const endPos = getNodePosition(nodeMap, endNodeId);

    return {
      id: String(parapet.id),
      name: parapet.name || '',
      elementType: 'Parapet',
      idNodeStart: String(startNodeId),
      idNodeEnd: String(endNodeId),
      startPos,
      endPos,
      thickness: parseFloat(parapet.thickness) || 0,
      height: parseFloat(parapet.height) || 0,
    };
  });
}

/**
 * 開口を変換
 * @param {Array} openings - 開口配列
 * @param {Map} nodeMap - 節点位置マップ
 * @returns {import('../../viewer/types/render-elements.js').RenderOpening[]}
 */
function convertOpenings(openings, nodeMap) {
  if (!openings || !Array.isArray(openings)) {
    return [];
  }

  return openings.map((opening) => {
    const nodeIds = opening.nodeIds || opening.node_ids || [];
    const vertices = nodeIds.map((id) => getNodePosition(nodeMap, id));

    return {
      id: String(opening.id),
      nodeIds: nodeIds.map(String),
      vertices,
    };
  });
}

// ============================================
// 基礎要素変換
// ============================================

/**
 * 基礎を変換
 * @param {Array} footings - 基礎配列
 * @param {Map} nodeMap - 節点位置マップ
 * @returns {import('../../viewer/types/render-elements.js').RenderFooting[]}
 */
function convertFootings(footings, nodeMap) {
  if (!footings || !Array.isArray(footings)) {
    return [];
  }

  return footings.map((footing) => {
    const nodeId = footing.idNode || footing.id_node;
    const position = getNodePosition(nodeMap, nodeId);

    return {
      id: String(footing.id),
      name: footing.name || '',
      elementType: 'Footing',
      idNode: String(nodeId),
      position,
      width: parseFloat(footing.width) || 0,
      length: parseFloat(footing.length) || 0,
      thickness: parseFloat(footing.thickness) || 0,
      rotate: parseFloat(footing.rotate) || 0,
    };
  });
}

/**
 * 杭を変換
 * @param {Array} piles - 杭配列
 * @param {Map} nodeMap - 節点位置マップ
 * @returns {import('../../viewer/types/render-elements.js').RenderPile[]}
 */
function convertPiles(piles, nodeMap) {
  if (!piles || !Array.isArray(piles)) {
    return [];
  }

  return piles.map((pile) => {
    const nodeId = pile.idNode || pile.id_node;
    const position = getNodePosition(nodeMap, nodeId);

    return {
      id: String(pile.id),
      name: pile.name || '',
      elementType: 'Pile',
      idNode: String(nodeId),
      position,
      diameter: parseFloat(pile.diameter) || 0,
      length: parseFloat(pile.length) || 0,
    };
  });
}

/**
 * 布基礎を変換
 * @param {Array} stripFootings - 布基礎配列
 * @param {Map} nodeMap - 節点位置マップ
 * @returns {import('../../viewer/types/render-elements.js').RenderStripFooting[]}
 */
function convertStripFootings(stripFootings, nodeMap) {
  if (!stripFootings || !Array.isArray(stripFootings)) {
    return [];
  }

  return stripFootings.map((stripFooting) => {
    const startNodeId = stripFooting.idNodeStart || stripFooting.id_node_start;
    const endNodeId = stripFooting.idNodeEnd || stripFooting.id_node_end;

    const startPos = getNodePosition(nodeMap, startNodeId);
    const endPos = getNodePosition(nodeMap, endNodeId);

    return {
      id: String(stripFooting.id),
      name: stripFooting.name || '',
      elementType: 'StripFooting',
      idNodeStart: String(startNodeId),
      idNodeEnd: String(endNodeId),
      startPos,
      endPos,
      width: parseFloat(stripFooting.width) || 0,
      thickness: parseFloat(stripFooting.thickness) || 0,
    };
  });
}

// ============================================
// 継手変換
// ============================================

/**
 * 継手を変換
 * @param {Array} joints - 継手配列
 * @param {Map} nodeMap - 節点位置マップ
 * @returns {import('../../viewer/types/render-elements.js').RenderJoint[]}
 */
function convertJoints(joints, nodeMap) {
  if (!joints || !Array.isArray(joints)) {
    return [];
  }

  return joints.map((joint) => {
    const nodeId = joint.idNode || joint.id_node;
    const position = getNodePosition(nodeMap, nodeId);

    return {
      id: String(joint.id),
      name: joint.name || '',
      elementType: 'Joint',
      jointType: joint.jointType || joint.joint_type || 'BeamShapeH',
      idNode: String(nodeId),
      position,
      kindJoint: joint.kindJoint || joint.kind_joint || 'WELD',
      section: joint.section ? convertToRenderSection(joint.section) : null,
    };
  });
}

// ============================================
// 通り芯・階変換
// ============================================

/**
 * 通り芯を変換
 * @param {Array} axes - 通り芯配列
 * @returns {import('../../viewer/types/render-elements.js').RenderAxis[]}
 */
function convertAxes(axes) {
  if (!axes || !Array.isArray(axes)) {
    return [];
  }

  return axes.map((axis) => ({
    id: String(axis.id),
    name: axis.name || '',
    direction: axis.direction || 'X',
    position: parseFloat(axis.position) || 0,
  }));
}

/**
 * 階情報を変換
 * @param {Array} stories - 階配列
 * @returns {import('../../viewer/types/render-elements.js').RenderStory[]}
 */
function convertStories(stories) {
  if (!stories || !Array.isArray(stories)) {
    return [];
  }

  return stories.map((story) => ({
    id: String(story.id),
    name: story.name || '',
    height: parseFloat(story.height) || 0,
    level: parseFloat(story.level) || 0,
  }));
}

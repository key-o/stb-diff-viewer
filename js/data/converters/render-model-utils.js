/**
 * RenderModel Utilities - 共通ユーティリティ関数
 *
 * RenderModelの生成・操作に使用する共通関数を提供します。
 *
 * @module data/converters/render-model-utils
 */

import { createPosition } from '../../constants/renderModelTypes.js';

// ============================================
// 節点マップ
// ============================================

/**
 * 節点IDから座標へのマップを作成
 * @param {Array<{id: string, x: number, y: number, z: number}>} nodes - 節点配列
 * @returns {Map<string, import('../../viewer/types/render-elements.js').RenderPosition>}
 */
export function createNodePositionMap(nodes) {
  if (!nodes || !Array.isArray(nodes)) {
    return new Map();
  }

  return new Map(
    nodes.map((node) => [
      String(node.id),
      createPosition(parseFloat(node.x) || 0, parseFloat(node.y) || 0, parseFloat(node.z) || 0),
    ]),
  );
}

/**
 * 節点IDから座標を取得
 * @param {Map} nodeMap - 節点マップ
 * @param {string} nodeId - 節点ID
 * @returns {import('../../viewer/types/render-elements.js').RenderPosition}
 */
export function getNodePosition(nodeMap, nodeId) {
  const pos = nodeMap.get(String(nodeId));
  if (!pos) {
    console.warn(`Node not found: ${nodeId}`);
    return createPosition(0, 0, 0);
  }
  return pos;
}

// ============================================
// バウンディングボックス
// ============================================

/**
 * 節点配列からバウンディングボックスを計算
 * @param {Array<{x: number, y: number, z: number}>} nodes - 節点配列
 * @returns {import('../viewer/types/render-model.js').RenderBoundingBox}
 */
export function calculateBoundingBox(nodes) {
  const zero = { x: 0, y: 0, z: 0 };
  if (!nodes?.length) return { min: zero, max: zero, center: zero };

  const xs = [],
    ys = [],
    zs = [];
  for (const n of nodes) {
    xs.push(parseFloat(n.x) || 0);
    ys.push(parseFloat(n.y) || 0);
    zs.push(parseFloat(n.z) || 0);
  }

  const min = { x: Math.min(...xs), y: Math.min(...ys), z: Math.min(...zs) };
  const max = { x: Math.max(...xs), y: Math.max(...ys), z: Math.max(...zs) };
  return {
    min,
    max,
    center: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 },
  };
}

// ============================================
// 断面情報
// ============================================

/** 断面カテゴリ名 */
const SECTION_CATEGORIES = [
  'columnSections',
  'postSections',
  'girderSections',
  'beamSections',
  'braceSections',
  'foundationColumnSections',
];

/**
 * 断面マップから断面情報を取得
 * @param {string} sectionId - 断面ID
 * @param {Object} sections - 断面情報オブジェクト
 * @returns {Object|null}
 */
export function getSectionById(sectionId, sections) {
  if (!sectionId || !sections) {
    return null;
  }

  const id = String(sectionId);
  for (const category of SECTION_CATEGORIES) {
    const map = sections[category];
    if (!map) continue;
    const section = map.has ? map.get(id) : map[id];
    if (section) return section;
  }
  return null;
}

/**
 * 断面情報をRenderSection形式に変換
 * @param {Object} section - 断面情報
 * @returns {import('../../viewer/types/render-elements.js').RenderSection}
 */
export function convertToRenderSection(section) {
  if (!section) {
    return {
      id: '',
      name: '',
      shape: 'RECTANGLE',
      dimensions: {},
    };
  }

  return {
    id: String(section.id || ''),
    name: section.name || '',
    shape: normalizeShapeType(section.shape || section.profileType || 'RECTANGLE'),
    dimensions: extractDimensions(section),
    steelShape: section.steelShape || null,
  };
}

/**
 * 形状タイプを正規化
 * @param {string} shape - 形状タイプ
 * @returns {string}
 */
function normalizeShapeType(shape) {
  const shapeMap = {
    RECT: 'RECTANGLE',
    RECTANGLE: 'RECTANGLE',
    CIRCLE: 'CIRCLE',
    PIPE: 'PIPE',
    H: 'H',
    BOX: 'BOX',
    L: 'L',
    T: 'T',
    C: 'C',
  };

  const upperShape = String(shape).toUpperCase();
  return shapeMap[upperShape] || upperShape;
}

/** 抽出対象の寸法プロパティ */
const DIMENSION_PROPS = [
  'width',
  'height',
  'depth',
  'diameter',
  'thickness',
  'flangeWidth',
  'flangeThickness',
  'webThickness',
];

/**
 * 断面から寸法を抽出
 * @param {Object} section - 断面情報
 * @returns {import('../../viewer/types/render-elements.js').RenderDimensions}
 */
function extractDimensions(section) {
  const dimensions = {};

  for (const prop of DIMENSION_PROPS) {
    if (section[prop] != null) {
      dimensions[prop] = parseFloat(section[prop]);
    }
  }

  if (section.dimensions) {
    Object.assign(dimensions, section.dimensions);
  }

  return dimensions;
}

// ============================================
// 差分ステータス
// ============================================

/**
 * 差分ステータスを作成
 * @param {'added'|'removed'|'modified'|'unchanged'} status - 状態
 * @param {'modelA'|'modelB'} [source] - ソース
 * @param {Object} [changes] - 変更詳細
 * @returns {import('../../viewer/types/render-elements.js').RenderDiffStatus}
 */
export function createDiffStatus(status, source = null, changes = null) {
  return {
    status,
    source,
    changes,
  };
}

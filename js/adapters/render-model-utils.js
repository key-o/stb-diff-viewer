/**
 * RenderModel Utilities - 共通ユーティリティ関数
 *
 * RenderModelの生成・操作に使用する共通関数を提供します。
 *
 * @module adapters/render-model-utils
 */

import { createPosition } from '../viewer/types/index.js';

// ============================================
// 節点マップ
// ============================================

/**
 * 節点IDから座標へのマップを作成
 * @param {Array<{id: string, x: number, y: number, z: number}>} nodes - 節点配列
 * @returns {Map<string, import('../viewer/types/render-elements.js').RenderPosition>}
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
 * @returns {import('../viewer/types/render-elements.js').RenderPosition}
 */
export function getNodePosition(nodeMap, nodeId) {
  const pos = nodeMap.get(String(nodeId));
  if (pos) {
    return pos;
  }
  // フォールバック
  console.warn(`Node not found: ${nodeId}`);
  return createPosition(0, 0, 0);
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
  if (!nodes || nodes.length === 0) {
    return {
      min: createPosition(0, 0, 0),
      max: createPosition(0, 0, 0),
      center: createPosition(0, 0, 0),
    };
  }

  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };

  nodes.forEach((node) => {
    const x = parseFloat(node.x) || 0;
    const y = parseFloat(node.y) || 0;
    const z = parseFloat(node.z) || 0;

    min.x = Math.min(min.x, x);
    min.y = Math.min(min.y, y);
    min.z = Math.min(min.z, z);
    max.x = Math.max(max.x, x);
    max.y = Math.max(max.y, y);
    max.z = Math.max(max.z, z);
  });

  return {
    min: createPosition(min.x, min.y, min.z),
    max: createPosition(max.x, max.y, max.z),
    center: createPosition((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2),
  };
}

// ============================================
// 断面情報
// ============================================

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

  // 各断面カテゴリを検索
  const categories = [
    'columnSections',
    'postSections',
    'girderSections',
    'beamSections',
    'braceSections',
    'foundationColumnSections',
  ];

  for (const category of categories) {
    const categoryMap = sections[category];
    if (categoryMap && categoryMap.has) {
      const section = categoryMap.get(String(sectionId));
      if (section) {
        return section;
      }
    } else if (categoryMap && typeof categoryMap === 'object') {
      const section = categoryMap[String(sectionId)];
      if (section) {
        return section;
      }
    }
  }

  return null;
}

/**
 * 断面情報をRenderSection形式に変換
 * @param {Object} section - 断面情報
 * @returns {import('../viewer/types/render-elements.js').RenderSection}
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

/**
 * 断面から寸法を抽出
 * @param {Object} section - 断面情報
 * @returns {import('../viewer/types/render-elements.js').RenderDimensions}
 */
function extractDimensions(section) {
  const dimensions = {};

  // 共通プロパティ
  if (section.width != null) dimensions.width = parseFloat(section.width);
  if (section.height != null) dimensions.height = parseFloat(section.height);
  if (section.depth != null) dimensions.depth = parseFloat(section.depth);
  if (section.diameter != null) dimensions.diameter = parseFloat(section.diameter);
  if (section.thickness != null) dimensions.thickness = parseFloat(section.thickness);

  // H形鋼用
  if (section.flangeWidth != null) dimensions.flangeWidth = parseFloat(section.flangeWidth);
  if (section.flangeThickness != null)
    dimensions.flangeThickness = parseFloat(section.flangeThickness);
  if (section.webThickness != null) dimensions.webThickness = parseFloat(section.webThickness);

  // dimensions プロパティがある場合
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
 * @returns {import('../viewer/types/render-elements.js').RenderDiffStatus}
 */
export function createDiffStatus(status, source = null, changes = null) {
  return {
    status,
    source,
    changes,
  };
}

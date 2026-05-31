/**
 * @fileoverview IFC/STBエクスポートデータ収集
 *
 * IFC/STBエクスポート用の各要素データを収集・変換する機能を提供します。
 *
 * @module ui/events/exportHandlers/ifcDataCollector
 */

import {
  getOrParseStructureData,
  extractProfileFromSection,
  convertToMultiSectionData,
} from './commonDataCollector.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('ifcDataCollector');

// ================================================================
// 汎用データ収集ファクトリ
// ================================================================

/**
 * 要素データ収集の共通パターンをファクトリ化
 *
 * @param {Array<Object>} sources - 収集ソース定義の配列
 * @param {string} sources[].elementKey - elementData内の要素配列キー
 * @param {string} sources[].sectionKey - sectionMaps内の断面マップキー
 * @param {Function} sources[].converterFn - 変換関数
 * @param {string} [sources[].elementType] - 要素タイプ文字列（converterFnに渡す）
 * @param {Object} [options] - オプション
 * @param {boolean} [options.needsSteelSections=false] - steelSectionsをconverterFnに渡すか
 * @param {Function} [options.extraDataExtractor] - structureDataから追加データを抽出する関数
 * @returns {Promise<Array>} 変換済みデータの配列
 */
async function collectElementDataForExport(sources, options = {}) {
  const result = [];

  const structureData = await getOrParseStructureData();
  if (!structureData) return result;

  const { nodeMap, steelSections, elementData, sectionMaps } = structureData;
  const extraData = options.extraDataExtractor ? options.extraDataExtractor(structureData) : {};

  for (const source of sources) {
    const elements = elementData[source.elementKey] || [];
    const sections = sectionMaps[source.sectionKey];

    for (const element of elements) {
      // converterFnの引数を構築: (element, nodeMap, sections, [steelSections], [elementType], ...extraData)
      const args = [element, nodeMap, sections];
      if (options.needsSteelSections) args.push(steelSections);
      if (source.elementType) args.push(source.elementType);
      // 追加データを個別引数として渡す
      if (extraData.args) args.push(...extraData.args);

      const entry = source.converterFn(...args);
      if (entry) result.push(entry);
    }
  }

  return result;
}

// ================================================================
// 共通ヘルパー関数
// ================================================================

/**
 * 要素データ変換の共通処理を抽出
 * ノード取得、セクション抽出、プロファイル抽出、回転角度取得などを統一処理
 * @private
 * @param {Object} element - 要素データ
 * @param {Map} nodeMap - ノードマップ
 * @param {Map} sectionMap - セクションマップ
 * @param {Object} config - 設定オプション
 * @param {string|Array} [config.nodeKeys] - ノード取得設定
 *   単一ノード: 'id_node' → {nodeId, nodeKey: 'id_node'}
 *   複数キー: ['id_node_start', 'id_node_end'] → {nodes, nodeKeys}
 * @param {string} [config.sectionKey='id_section'] - 断面キー
 * @param {Map} [config.steelSections] - 鋼材断面マップ
 * @param {number} [config.minNodeCount] - ノード最小数チェック
 * @returns {Object|null} 共通情報: { nodes, nodeIds, section, profile, rotation, errors: [] }
 */
function _extractCommonElementData(element, nodeMap, sectionMap, config = {}) {
  const result = {
    section: null,
    profile: null,
    rotation: 0,
    errors: [],
    nodes: [],
    nodeIds: [],
  };

  try {
    // (1) ノード取得とバリデーション
    const nodeConfig = config.nodeKeys || 'id_node';
    const minNodeCount = config.minNodeCount || 0;

    if (typeof nodeConfig === 'string') {
      // 単一ノード取得
      const node = nodeMap.get(element[nodeConfig]);
      if (!node) {
        result.errors.push(`ノードが見つかりません: ${element.id} (${nodeConfig})`);
      } else {
        result.nodes.push(node);
        result.nodeIds.push(element[nodeConfig]);
      }
    } else if (Array.isArray(nodeConfig)) {
      // 複数ノード取得
      for (const key of nodeConfig) {
        const node = nodeMap.get(element[key]);
        if (!node) {
          result.errors.push(`ノードが見つかりません: ${element.id} (${key})`);
        } else {
          result.nodes.push(node);
          result.nodeIds.push(element[key]);
        }
      }
    }

    // 最小ノード数チェック
    if (minNodeCount > 0 && result.nodes.length < minNodeCount) {
      result.errors.push(
        `ノード数不足: ${element.id} (期待: ${minNodeCount}, 実際: ${result.nodes.length})`,
      );
      return result;
    }

    // (2) セクション情報抽出
    const sectionKey = config.sectionKey || 'id_section';
    if (sectionKey && element[sectionKey]) {
      result.section = sectionMap.get(element[sectionKey]);
    }

    // (3) プロファイル抽出（steelSectionsがある場合）
    if (result.section && config.steelSections) {
      result.profile = extractProfileFromSection(result.section, config.steelSections);
    }

    // (4) 回転角度取得
    result.rotation = element.rotate || element.angle || 0;

    return result;
  } catch (error) {
    result.errors.push(`データ抽出エラー: ${error.message}`);
    return result;
  }
}

/**
 * ノード座標にオフセットを適用
 * @private
 * @param {Object} node - ノード座標
 * @param {Object} element - 要素データ
 * @param {string} prefix - オフセットキープレフィックス（例: 'offset_start_', 'offset_bottom_'）
 * @param {string} [zAxis='z'] - Z軸の適用方式: 'apply' = オフセット適用, 'skip' = 適用しない
 * @returns {Object} オフセット適用後の座標 {x, y, z}
 */
function _applyNodeOffset(node, element, prefix, zAxis = 'apply') {
  const offsetX = element[`${prefix}X`] || 0;
  const offsetY = element[`${prefix}Y`] || 0;
  const offsetZ = zAxis === 'apply' ? element[`${prefix}Z`] || 0 : 0;

  return {
    x: node.x + offsetX,
    y: node.y + offsetY,
    z: node.z + offsetZ,
  };
}

/**
 * 複数ノードのオフセット適用（メッシュ頂点など）
 * @private
 * @param {Array<number>} nodeIds - ノードID配列
 * @param {Map} nodeMap - ノードマップ
 * @param {Object} element - 要素データ
 * @param {Map|Object} [offsetsSource] - オフセット情報の取得元
 * @param {string} [offsetKeyPrefix] - オフセットキープレフィックス
 * @returns {Array<Object>|null} 頂点座標配列、またはエラー時はnull
 */
function _applyOffsetsToVertices(nodeIds, nodeMap, element, offsetsSource, offsetKeyPrefix) {
  const vertices = [];

  for (const nodeId of nodeIds) {
    const node = nodeMap.get(nodeId);
    if (!node) {
      log.warn(`頂点ノード ${nodeId} が見つかりません`);
      return null;
    }

    let offsetX = 0,
      offsetY = 0,
      offsetZ = 0;
    if (offsetsSource) {
      const offset = offsetsSource.get ? offsetsSource.get(nodeId) : offsetsSource[nodeId];
      if (offset) {
        offsetX = offset[`${offsetKeyPrefix || 'offset_'}X`] || 0;
        offsetY = offset[`${offsetKeyPrefix || 'offset_'}Y`] || 0;
        offsetZ = offset[`${offsetKeyPrefix || 'offset_'}Z`] || 0;
      }
    }

    vertices.push({
      x: node.x + offsetX,
      y: node.y + offsetY,
      z: node.z + offsetZ,
    });
  }

  return vertices;
}

/**
 * セクションから寸法値を抽出
 * @private
 * @param {Object} section - セクションデータ
 * @param {Array<string>} keys - 優先順位付き寸法キー（例: ['D', 'diameter']）
 * @param {*} defaultValue - 見つからない場合のデフォルト値
 * @returns {*} 見つかった寸法値またはデフォルト値
 */
function _extractDimensionFromSection(section, keys, defaultValue) {
  if (!section) return defaultValue;

  for (const key of keys) {
    // トップレベル
    if (section[key] !== undefined) return section[key];
    // dimensions オブジェクト内
    if (section.dimensions && section.dimensions[key] !== undefined) {
      return section.dimensions[key];
    }
  }

  return defaultValue;
}

// ================================================================
// 梁データ収集・変換
// ================================================================

/**
 * 現在のモデルから梁データを収集
 * @returns {Promise<Array>} IFCBeamExporter用の梁データ配列
 */
export function collectBeamDataForExport() {
  return collectElementDataForExport(
    [
      {
        elementKey: 'girderElements',
        sectionKey: 'girderSections',
        converterFn: convertElementToBeamData,
        elementType: 'Girder',
      },
      {
        elementKey: 'beamElements',
        sectionKey: 'beamSections',
        converterFn: convertElementToBeamData,
        elementType: 'Beam',
      },
    ],
    { needsSteelSections: true },
  );
}

/**
 * STB要素をIFCBeamExporter用のデータに変換
 * 天端基準配置をサポート（水平梁・傾斜梁両方に対応）
 * マルチセクション（ハンチ）梁にも対応
 */
function convertElementToBeamData(element, nodeMap, sectionMap, steelSections, elementType) {
  try {
    // 共通データ抽出
    const commonData = _extractCommonElementData(element, nodeMap, sectionMap, {
      nodeKeys: ['id_node_start', 'id_node_end'],
      sectionKey: 'id_section',
      steelSections,
      minNodeCount: 2,
    });

    if (commonData.errors.length > 0) {
      log.warn(`梁 ${element.id}:`, commonData.errors.join(', '));
      return null;
    }

    const [startNode, endNode] = commonData.nodes;
    const { section, profile, rotation } = commonData;

    // オフセット情報を取得（STBの梁はXYZ方向のオフセットを持つ）
    const startPoint = _applyNodeOffset(startNode, element, 'offset_start_', 'apply');
    const endPoint = _applyNodeOffset(endNode, element, 'offset_end_', 'apply');

    // マルチセクション（ハンチ）梁の検出（配置モード決定のため先に判定）
    let isMultiSection = false;
    let multiSectionData = null;
    if (section && (section.mode === 'double' || section.mode === 'multi') && section.shapes) {
      // 梁長を計算（ジョイント位置計算に必要）
      const dx = endNode.x - startNode.x;
      const dy = endNode.y - startNode.y;
      const dz = endNode.z - startNode.z;
      const beamLength = Math.sqrt(dx * dx + dy * dy + dz * dz);

      multiSectionData = convertToMultiSectionData(section, steelSections, element, beamLength);
      if (multiSectionData) {
        isMultiSection = true;
      }
    }

    // SRC造の場合、鉄骨プロファイルも抽出（ビューアと同様に複合断面を出力）
    let steelProfile = null;
    if (section?.isSRC && section.steelProfile) {
      const steelSectionData = {
        dimensions: section.steelProfile.dimensions,
        shapeName: section.shapeName,
      };
      steelProfile = extractProfileFromSection(steelSectionData, steelSections);
    }

    // 基本データ
    const beamData = {
      name: element.name || element.id || `${elementType}-${element.id}`,
      startPoint,
      endPoint,
      profile,
      rotation,
      // IFCエクスポートで天端基準配置を使用（単一断面・多断面両方）
      placementMode: 'center',
      sectionHeight: 0,
      stbType: elementType === 'Beam' ? 'StbBeam' : 'StbGirder',
    };

    // SRC造の場合、鉄骨プロファイルを追加
    if (steelProfile) {
      beamData.isSRC = true;
      beamData.steelProfile = steelProfile;
    }

    // マルチセクションデータを設定
    if (isMultiSection && multiSectionData) {
      beamData.isMultiSection = true;
      beamData.sections = multiSectionData.sections;
      // 多断面梁でも天端基準配置を使用
      beamData.placementMode = 'center';
    }

    return beamData;
  } catch (error) {
    log.warn(`要素変換エラー (${element.id}):`, error);
    return null;
  }
}

// ================================================================
// 柱データ収集・変換
// ================================================================

/**
 * 現在のモデルから柱データを収集
 * @returns {Promise<Array>} IFCBeamExporter用の柱データ配列
 */
export function collectColumnDataForExport() {
  return collectElementDataForExport(
    [
      {
        elementKey: 'columnElements',
        sectionKey: 'columnSections',
        converterFn: convertColumnToExportData,
        elementType: 'Column',
      },
      {
        elementKey: 'postElements',
        sectionKey: 'postSections',
        converterFn: convertColumnToExportData,
        elementType: 'Post',
      },
    ],
    { needsSteelSections: true },
  );
}

/**
 * 柱要素をエクスポート用データに変換
 * @param {Object} element - 柱要素
 * @param {Map} nodeMap - ノードマップ
 * @param {Map} sectionMap - 断面マップ
 * @param {Map} steelSections - 鋼材断面マップ
 * @param {string} elementType - 要素タイプ
 * @returns {Object|null} エクスポート用データ
 */
function convertColumnToExportData(element, nodeMap, sectionMap, steelSections, elementType) {
  try {
    // 共通データ抽出
    const commonData = _extractCommonElementData(element, nodeMap, sectionMap, {
      nodeKeys: ['id_node_bottom', 'id_node_top'],
      sectionKey: 'id_section',
      steelSections,
      minNodeCount: 2,
    });

    if (commonData.errors.length > 0) {
      log.warn(`柱 ${element.id}:`, commonData.errors.join(', '));
      return null;
    }

    const [bottomNode, topNode] = commonData.nodes;
    const { section, profile, rotation } = commonData;

    // isReferenceDirectionを取得（断面データから）
    // デフォルトはtrue（STB仕様: 未指定時はtrue）
    const isReferenceDirection = section?.isReferenceDirection !== false;

    // SRC造の場合、鉄骨プロファイルも抽出（ビューアと同様に複合断面を出力）
    let steelProfile = null;
    if (section?.isSRC && section.steelProfile) {
      const steelSectionData = {
        dimensions: section.steelProfile.dimensions,
        shapeName: section.shapeName,
      };
      steelProfile = extractProfileFromSection(steelSectionData, steelSections);
    }

    // オフセット情報を取得（STBの柱はXY方向のオフセットを持つ）
    const bottomPoint = _applyNodeOffset(bottomNode, element, 'offset_bottom_', 'skip');
    const topPoint = _applyNodeOffset(topNode, element, 'offset_top_', 'skip');

    const result = {
      name: element.name || element.id || `${elementType}-${element.id}`,
      bottomPoint,
      topPoint,
      profile,
      rotation,
      isReferenceDirection,
      stbType: elementType === 'Post' ? 'StbPost' : 'StbColumn',
    };

    // SRC造の場合、鉄骨プロファイルを追加
    if (steelProfile) {
      result.isSRC = true;
      result.steelProfile = steelProfile;
    }

    return result;
  } catch (error) {
    log.warn(`柱変換エラー (${element.id}):`, error);
    return null;
  }
}

// ================================================================
// ブレースデータ収集・変換
// ================================================================

/**
 * 現在のモデルからブレースデータを収集
 * @returns {Promise<Array>} IFCBeamExporter用のブレースデータ配列
 */
export function collectBraceDataForExport() {
  return collectElementDataForExport(
    [
      {
        elementKey: 'braceElements',
        sectionKey: 'braceSections',
        converterFn: convertBraceToExportData,
      },
    ],
    { needsSteelSections: true },
  );
}

/**
 * ブレース要素をエクスポート用データに変換
 * @param {Object} element - ブレース要素
 * @param {Map} nodeMap - ノードマップ
 * @param {Map} sectionMap - 断面マップ
 * @param {Map} steelSections - 鋼材断面マップ
 * @returns {Object|null} エクスポート用データ
 */
function convertBraceToExportData(element, nodeMap, sectionMap, steelSections) {
  try {
    // 共通データ抽出
    const commonData = _extractCommonElementData(element, nodeMap, sectionMap, {
      nodeKeys: ['id_node_start', 'id_node_end'],
      sectionKey: 'id_section',
      steelSections,
      minNodeCount: 2,
    });

    if (commonData.errors.length > 0) {
      log.warn(`ブレース ${element.id}:`, commonData.errors.join(', '));
      return null;
    }

    const [startNode, endNode] = commonData.nodes;
    const { profile, rotation } = commonData;

    return {
      name: element.name || element.id || `Brace-${element.id}`,
      startPoint: { x: startNode.x, y: startNode.y, z: startNode.z },
      endPoint: { x: endNode.x, y: endNode.y, z: endNode.z },
      profile,
      rotation,
    };
  } catch (error) {
    log.warn(`ブレース変換エラー (${element.id}):`, error);
    return null;
  }
}

// ================================================================
// 床データ収集・変換
// ================================================================

/**
 * 現在のモデルから床データを収集
 * @returns {Promise<Array>} IFCSTBExporter用の床データ配列
 */
export function collectSlabDataForExport() {
  return collectElementDataForExport([
    {
      elementKey: 'slabElements',
      sectionKey: 'slabSections',
      converterFn: convertSlabToExportData,
    },
  ]);
}

/**
 * 床要素をエクスポート用データに変換
 * @param {Object} element - 床要素
 * @param {Map} nodeMap - ノードマップ
 * @param {Map} sectionMap - 断面マップ
 * @returns {Object|null} エクスポート用データ
 */
function convertSlabToExportData(element, nodeMap, sectionMap) {
  try {
    const nodeIds = element.node_ids;
    if (!nodeIds || nodeIds.length < 3) {
      log.warn(`床 ${element.id}: ノードが3点未満`);
      return null;
    }

    // 頂点座標を取得（オフセット適用）
    const offsets = element.offsets || new Map();
    const vertices = _applyOffsetsToVertices(nodeIds, nodeMap, element, offsets, 'offset_');

    if (!vertices) {
      return null;
    }

    // 断面データから厚さを取得
    const thickness = _extractDimensionFromSection(
      sectionMap.get(element.id_section),
      ['depth', 't', 'thickness'],
      150,
    );

    // 床タイプを決定
    let predefinedType = 'FLOOR';
    if (element.isFoundation) {
      predefinedType = 'BASESLAB';
    } else if (element.kind_slab === 'ROOF') {
      predefinedType = 'ROOF';
    }

    return {
      name: element.name || `Slab_${element.id}`,
      vertices,
      thickness,
      predefinedType,
    };
  } catch (error) {
    log.warn(`床変換エラー (${element.id}):`, error);
    return null;
  }
}

// ================================================================
// 壁データ収集・変換
// ================================================================

/**
 * 現在のモデルから壁データを収集
 * @returns {Promise<Array>} IFCSTBExporter用の壁データ配列
 */
export function collectWallDataForExport() {
  return collectElementDataForExport(
    [
      {
        elementKey: 'wallElements',
        sectionKey: 'wallSections',
        converterFn: convertWallToExportData,
      },
    ],
    {
      extraDataExtractor: ({ elementData }) => ({
        args: [elementData.openingElements || new Map()],
      }),
    },
  );
}

/**
 * 壁要素をエクスポート用データに変換
 * @param {Object} element - 壁要素
 * @param {Map} nodeMap - ノードマップ
 * @param {Map} sectionMap - 断面マップ
 * @param {Map} openingElements - 開口情報マップ
 * @returns {Object|null} エクスポート用データ
 */
function convertWallToExportData(element, nodeMap, sectionMap, openingElements = new Map()) {
  try {
    const nodeIds = element.node_ids;
    if (!nodeIds || nodeIds.length < 4) {
      log.warn(`壁 ${element.id}: ノードが4点未満`);
      return null;
    }

    // 頂点座標を取得（オフセット適用）
    const offsets = element.offsets || new Map();
    const vertices = _applyOffsetsToVertices(nodeIds, nodeMap, element, offsets, 'offset_');

    if (!vertices) {
      return null;
    }

    // 4点から壁の始点・終点・高さを計算
    const p0 = vertices[0];
    const p1 = vertices[1];
    const p2 = vertices[2];
    const p3 = vertices[3];

    const bottomZ = Math.min(p0.z, p1.z);
    const topZ = Math.max(p2.z, p3.z);
    const height = topZ - bottomZ;

    if (height <= 0) {
      log.warn(`壁 ${element.id}: 高さが0以下`);
      return null;
    }

    const startPoint = { x: p0.x, y: p0.y, z: bottomZ };
    const endPoint = { x: p1.x, y: p1.y, z: bottomZ };

    // 断面データから厚さを取得
    const thickness = _extractDimensionFromSection(
      sectionMap.get(element.id_section),
      ['t', 'thickness'],
      200,
    );

    // 壁タイプを決定
    let predefinedType = 'STANDARD';
    if (element.kind_wall === 'WALL_SHEAR') {
      predefinedType = 'SHEAR';
    } else if (element.kind_wall === 'WALL_PARTITION') {
      predefinedType = 'PARTITIONING';
    }

    // 開口情報を収集
    const openings = [];
    if (openingElements && openingElements.size > 0) {
      // STB 2.0.2の場合: 壁のopen_idsを使用
      if (element.open_ids && element.open_ids.length > 0) {
        for (const openId of element.open_ids) {
          const opening = openingElements.get(openId);
          if (opening) {
            openings.push({
              id: opening.id,
              name: opening.name,
              positionX: opening.position_X,
              positionY: opening.position_Y,
              width: opening.length_X,
              height: opening.length_Y,
              rotate: opening.rotate,
            });
          }
        }
      } else {
        // STB 2.1.0の場合: id_memberを使用して壁と開口を関連付け
        for (const opening of openingElements.values()) {
          if (opening.kind_member === 'WALL' && String(opening.id_member) === String(element.id)) {
            openings.push({
              id: opening.id,
              name: opening.name,
              positionX: opening.position_X,
              positionY: opening.position_Y,
              width: opening.length_X,
              height: opening.length_Y,
              rotate: opening.rotate,
            });
          }
        }
      }
    }

    return {
      name: element.name || `Wall_${element.id}`,
      startPoint,
      endPoint,
      height,
      thickness,
      predefinedType,
      kindStructure: element.kind_structure || 'RC',
      openings,
    };
  } catch (error) {
    log.warn(`壁変換エラー (${element.id}):`, error);
    return null;
  }
}

// ================================================================
// 杭データ収集・変換
// ================================================================

/**
 * 現在のモデルから杭データを収集
 * @returns {Promise<Array>} IFCSTBExporter用の杭データ配列
 */
export function collectPileDataForExport() {
  return collectElementDataForExport([
    {
      elementKey: 'pileElements',
      sectionKey: 'pileSections',
      converterFn: convertPileToExportData,
    },
  ]);
}

/**
 * 杭要素をエクスポート用データに変換
 * @param {Object} element - 杭要素
 * @param {Map} nodeMap - ノードマップ
 * @param {Map} sectionMap - 断面マップ
 * @returns {Object|null} エクスポート用データ
 */
function convertPileToExportData(element, nodeMap, sectionMap) {
  try {
    let topPoint, bottomPoint;

    if (element.pileFormat === '2node') {
      // 2ノード形式
      const commonData = _extractCommonElementData(element, nodeMap, sectionMap, {
        nodeKeys: ['id_node_bottom', 'id_node_top'],
        sectionKey: 'id_section',
        minNodeCount: 2,
      });

      if (commonData.errors.length > 0) {
        log.warn(`杭 ${element.id}:`, commonData.errors.join(', '));
        return null;
      }

      const [bottomNode, topNode] = commonData.nodes;
      topPoint = {
        x: topNode.x + (element.offset_top_X || 0),
        y: topNode.y + (element.offset_top_Y || 0),
        z: topNode.z,
      };
      bottomPoint = {
        x: bottomNode.x + (element.offset_bottom_X || 0),
        y: bottomNode.y + (element.offset_bottom_Y || 0),
        z: bottomNode.z,
      };
    } else if (element.pileFormat === '1node') {
      // 1ノード形式
      const commonData = _extractCommonElementData(element, nodeMap, sectionMap, {
        nodeKeys: 'id_node',
        sectionKey: 'id_section',
        minNodeCount: 1,
      });

      if (commonData.errors.length > 0) {
        log.warn(`杭 ${element.id}:`, commonData.errors.join(', '));
        return null;
      }

      const [node] = commonData.nodes;
      const offsetX = element.offset_X || 0;
      const offsetY = element.offset_Y || 0;
      const lengthAll = element.length_all || 10000; // デフォルト10m
      const levelTop = element.level_top !== undefined ? element.level_top : node.z;

      // 杭頭位置（level_topが杭頭のレベル）
      topPoint = {
        x: node.x + offsetX,
        y: node.y + offsetY,
        z: levelTop,
      };
      // 杭底位置（杭頭から杭長さ分下）
      bottomPoint = {
        x: node.x + offsetX,
        y: node.y + offsetY,
        z: levelTop - lengthAll,
      };
    } else {
      log.warn(`杭 ${element.id}: 不明な形式`);
      return null;
    }

    // 断面データから直径と肉厚を取得
    let diameter = 600; // デフォルト600mm
    let wallThickness = null;
    let predefinedType = 'DRIVEN';
    let constructionType = 'PREFAB_STEEL';

    if (sectionMap) {
      const sectionData = sectionMap.get(element.id_section);
      if (sectionData) {
        diameter = _extractDimensionFromSection(sectionData, ['D', 'diameter'], 600);
        wallThickness = _extractDimensionFromSection(sectionData, ['t', 'wallThickness'], null);
      }
    }

    // 杭種別からIFCタイプを決定
    if (element.kind_structure === 'CAST' || element.kind === 'KIND_CAST') {
      predefinedType = 'BORED';
      constructionType = 'CAST_IN_PLACE';
      wallThickness = null; // 場所打ち杭は中実
    } else if (element.kind_structure === 'ST' || element.kind === 'KIND_ST') {
      predefinedType = 'DRIVEN';
      constructionType = 'PREFAB_STEEL';
    } else if (element.kind_structure === 'PC' || element.kind === 'KIND_PHC') {
      predefinedType = 'DRIVEN';
      constructionType = 'PRECAST_CONCRETE';
    }

    return {
      name: element.name || `Pile_${element.id}`,
      topPoint,
      bottomPoint,
      diameter,
      wallThickness,
      predefinedType,
      constructionType,
    };
  } catch (error) {
    log.warn(`杭変換エラー (${element.id}):`, error);
    return null;
  }
}

// ================================================================
// 基礎データ収集・変換
// ================================================================

/**
 * 現在のモデルから基礎データを収集
 * @returns {Promise<Array>} IFCSTBExporter用の基礎データ配列
 */
export function collectFootingDataForExport() {
  return collectElementDataForExport([
    {
      elementKey: 'footingElements',
      sectionKey: 'footingSections',
      converterFn: convertFootingToExportData,
    },
  ]);
}

/**
 * 基礎要素をエクスポート用データに変換
 * @param {Object} element - 基礎要素
 * @param {Map} nodeMap - ノードマップ
 * @param {Map} sectionMap - 断面マップ
 * @returns {Object|null} エクスポート用データ
 */
function convertFootingToExportData(element, nodeMap, sectionMap) {
  try {
    // 共通データ抽出
    const commonData = _extractCommonElementData(element, nodeMap, sectionMap, {
      nodeKeys: 'id_node',
      sectionKey: 'id_section',
      minNodeCount: 1,
    });

    if (commonData.errors.length > 0) {
      log.warn(`基礎 ${element.id}:`, commonData.errors.join(', '));
      return null;
    }

    const [node] = commonData.nodes;
    const { section } = commonData;

    const offsetX = element.offset_X || 0;
    const offsetY = element.offset_Y || 0;
    const levelBottom = element.level_bottom || 0;
    const rotation = element.rotate || 0;

    // 断面データから寸法を取得
    const width_X = _extractDimensionFromSection(
      section,
      ['width_X', 'width', 'overall_width'],
      1500,
    );
    const width_Y = _extractDimensionFromSection(
      section,
      ['width_Y', 'height', 'overall_depth'],
      1500,
    );
    const depth = _extractDimensionFromSection(section, ['depth', 'thickness', 't'], 500);

    // 基礎タイプを決定（長方形基礎はPAD_FOOTING、細長い場合はSTRIP_FOOTING）
    const predefinedType =
      width_X / width_Y > 3 || width_Y / width_X > 3 ? 'STRIP_FOOTING' : 'PAD_FOOTING';

    // IFCでは基礎上端を原点として下方向に押し出すため、
    // position.z は基礎上端のレベル（= 底面レベル + 深さ）
    return {
      name: element.name || `Footing_${element.id}`,
      position: {
        x: node.x + offsetX,
        y: node.y + offsetY,
        z: levelBottom + depth, // 基礎上端のレベル
      },
      width_X,
      width_Y,
      depth,
      rotation,
      predefinedType,
    };
  } catch (error) {
    log.warn(`基礎変換エラー (${element.id}):`, error);
    return null;
  }
}

// ================================================================
// 基礎柱データ収集・変換
// ================================================================

/**
 * 現在のモデルから基礎柱データを収集
 * @returns {Promise<Array>} IFCSTBExporter用の基礎柱データ配列
 */
export function collectFoundationColumnDataForExport() {
  return collectElementDataForExport(
    [
      {
        elementKey: 'foundationColumnElements',
        sectionKey: 'foundationcolumnSections',
        converterFn: convertFoundationColumnToExportData,
      },
    ],
    { needsSteelSections: true },
  );
}

/**
 * 基礎柱要素をエクスポート用データに変換
 * StbFoundationColumn は1節点（id_node）+ FD/WR二重断面構造
 * @param {Object} element - 基礎柱要素
 * @param {Map} nodeMap - ノードマップ
 * @param {Map} sectionMap - 断面マップ
 * @param {Map} steelSections - 鋼材断面マップ
 * @returns {Object|null} エクスポート用データ
 */
function convertFoundationColumnToExportData(element, nodeMap, sectionMap, steelSections) {
  try {
    // 共通データ抽出
    const commonData = _extractCommonElementData(element, nodeMap, sectionMap, {
      nodeKeys: 'id_node',
      steelSections,
      minNodeCount: 1,
    });

    if (commonData.errors.length > 0) {
      log.warn(`基礎柱 ${element.id}:`, commonData.errors.join(', '));
      return null;
    }

    const [baseNode] = commonData.nodes;
    const lengthFD = element.length_FD || 0;
    const lengthWR = element.length_WR || 0;
    const totalLength = lengthFD + lengthWR;

    if (totalLength <= 0) {
      log.warn(`基礎柱 ${element.id}: 長さが0です`);
      return null;
    }

    // FD断面の取得
    let profileFD = null;
    if (element.id_section_FD && lengthFD > 0) {
      const numericFDId = parseInt(element.id_section_FD, 10);
      const sectionFDId = isNaN(numericFDId) ? element.id_section_FD : numericFDId;
      const sectionFD = sectionMap.get(sectionFDId);
      profileFD = sectionFD ? extractProfileFromSection(sectionFD, steelSections) : null;
    }

    // WR断面の取得
    let profileWR = null;
    if (element.id_section_WR && lengthWR > 0) {
      const numericWRId = parseInt(element.id_section_WR, 10);
      const sectionWRId = isNaN(numericWRId) ? element.id_section_WR : numericWRId;
      const sectionWR = sectionMap.get(sectionWRId);
      profileWR = sectionWR ? extractProfileFromSection(sectionWR, steelSections) : null;
    }

    if (!profileFD && !profileWR) {
      log.warn(`基礎柱 ${element.id}: FD/WR断面が両方見つかりません`);
      return null;
    }

    const baseX = baseNode.x + (element.offset_FD_X || 0);
    const baseY = baseNode.y + (element.offset_FD_Y || 0);
    const baseZ = baseNode.z + (element.offset_Z || 0);

    return {
      name: element.name || `FoundationColumn_${element.id}`,
      topPoint: { x: baseX, y: baseY, z: baseZ },
      bottomPoint: { x: baseX, y: baseY, z: baseZ - totalLength },
      lengthFD,
      lengthWR,
      profileFD,
      profileWR,
      rotation: element.rotate || 0,
    };
  } catch (error) {
    log.warn(`基礎柱変換エラー (${element.id}):`, error);
    return null;
  }
}

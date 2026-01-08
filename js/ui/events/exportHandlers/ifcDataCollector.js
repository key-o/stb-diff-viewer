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
  getSectionHeight,
  calculateProfileVertices,
  convertToMultiSectionData,
} from './commonDataCollector.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('ifcDataCollector');

// ================================================================
// 梁データ収集・変換
// ================================================================

/**
 * 現在のモデルから梁データを収集
 * @returns {Promise<Array>} IFCBeamExporter用の梁データ配列
 */
export async function collectBeamDataForExport() {
  const beamData = [];

  const structureData = await getOrParseStructureData();
  if (!structureData) return beamData;

  const { nodeMap, steelSections, elementData, sectionMaps } = structureData;
  const girderElements = elementData.girderElements || [];
  const beamElements = elementData.beamElements || [];
  const girderSections = sectionMaps.girderSections || new Map();
  const beamSections = sectionMaps.beamSections || new Map();

  // 大梁を処理
  for (const girder of girderElements) {
    const beam = convertElementToBeamData(girder, nodeMap, girderSections, steelSections, 'Girder');
    if (beam) beamData.push(beam);
  }

  // 小梁を処理
  for (const beam of beamElements) {
    const beamEntry = convertElementToBeamData(beam, nodeMap, beamSections, steelSections, 'Beam');
    if (beamEntry) beamData.push(beamEntry);
  }

  return beamData;
}

/**
 * STB要素をIFCBeamExporter用のデータに変換
 * 天端基準配置をサポート（水平梁・傾斜梁両方に対応）
 * マルチセクション（ハンチ）梁にも対応
 */
function convertElementToBeamData(element, nodeMap, sectionMap, steelSections, elementType) {
  try {
    const startNode = nodeMap.get(element.id_node_start);
    const endNode = nodeMap.get(element.id_node_end);

    if (!startNode || !endNode) {
      log.warn(`ノードが見つかりません: ${element.id}`);
      return null;
    }

    // 断面情報を取得
    const section = sectionMap.get(element.id_section);
    const profile = extractProfileFromSection(section, steelSections);

    // 断面高さを取得（天端基準調整用）
    const sectionHeight = getSectionHeight(profile);

    // 回転角度を取得
    const rotation = element.rotate || element.angle || 0;

    // オフセット情報を取得（STBの梁はXYZ方向のオフセットを持つ）
    const offsetStartX = element.offset_start_X || 0;
    const offsetStartY = element.offset_start_Y || 0;
    const offsetStartZ = element.offset_start_Z || 0;
    const offsetEndX = element.offset_end_X || 0;
    const offsetEndY = element.offset_end_Y || 0;
    const offsetEndZ = element.offset_end_Z || 0;

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

    // 基本データ
    const beamData = {
      name: element.name || element.id || `${elementType}-${element.id}`,
      startPoint: {
        x: startNode.x + offsetStartX,
        y: startNode.y + offsetStartY,
        z: startNode.z + offsetStartZ,
      },
      endPoint: {
        x: endNode.x + offsetEndX,
        y: endNode.y + offsetEndY,
        z: endNode.z + offsetEndZ,
      },
      profile,
      rotation,
      // IFCエクスポートで天端基準配置を使用（単一断面・多断面両方）
      placementMode: 'top-aligned',
      sectionHeight: sectionHeight,
    };

    // マルチセクションデータを設定
    if (isMultiSection && multiSectionData) {
      beamData.isMultiSection = true;
      beamData.sections = multiSectionData.sections;
      // 多断面梁でも天端基準配置を使用
      beamData.placementMode = 'top-aligned';
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
export async function collectColumnDataForExport() {
  const columnData = [];

  const structureData = await getOrParseStructureData();
  if (!structureData) return columnData;

  const { nodeMap, steelSections, elementData, sectionMaps } = structureData;
  const columnElements = elementData.columnElements || [];
  const postElements = elementData.postElements || [];
  const columnSections = sectionMaps.columnSections || new Map();
  const postSections = sectionMaps.postSections || new Map();

  // 柱を処理
  for (const column of columnElements) {
    const col = convertColumnToExportData(column, nodeMap, columnSections, steelSections, 'Column');
    if (col) columnData.push(col);
  }

  // 間柱を処理
  for (const post of postElements) {
    const col = convertColumnToExportData(post, nodeMap, postSections, steelSections, 'Post');
    if (col) columnData.push(col);
  }

  return columnData;
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
    const bottomNode = nodeMap.get(element.id_node_bottom);
    const topNode = nodeMap.get(element.id_node_top);

    if (!bottomNode || !topNode) {
      log.warn(`ノードが見つかりません: ${element.id}`);
      return null;
    }

    // 断面情報を取得
    const section = sectionMap.get(element.id_section);
    const profile = extractProfileFromSection(section, steelSections);

    // 回転角度を取得
    const rotation = element.rotate || element.angle || 0;

    // isReferenceDirectionを取得（断面データから）
    // デフォルトはtrue（STB仕様: 未指定時はtrue）
    const isReferenceDirection = section?.isReferenceDirection !== false;

    // オフセット情報を取得（STBの柱はXY方向のオフセットを持つ）
    const offsetBottomX = element.offset_bottom_X || 0;
    const offsetBottomY = element.offset_bottom_Y || 0;
    const offsetTopX = element.offset_top_X || 0;
    const offsetTopY = element.offset_top_Y || 0;

    return {
      name: element.name || element.id || `${elementType}-${element.id}`,
      bottomPoint: {
        x: bottomNode.x + offsetBottomX,
        y: bottomNode.y + offsetBottomY,
        z: bottomNode.z,
      },
      topPoint: {
        x: topNode.x + offsetTopX,
        y: topNode.y + offsetTopY,
        z: topNode.z,
      },
      profile,
      rotation,
      isReferenceDirection,
    };
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
export async function collectBraceDataForExport() {
  const braceData = [];

  const structureData = await getOrParseStructureData();
  if (!structureData) return braceData;

  const { nodeMap, steelSections, elementData, sectionMaps } = structureData;
  const braceElements = elementData.braceElements || [];
  const braceSections = sectionMaps.braceSections || new Map();

  // ブレースを処理
  for (const brace of braceElements) {
    const br = convertBraceToExportData(brace, nodeMap, braceSections, steelSections);
    if (br) braceData.push(br);
  }

  return braceData;
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
    const startNode = nodeMap.get(element.id_node_start);
    const endNode = nodeMap.get(element.id_node_end);

    if (!startNode || !endNode) {
      log.warn(`ノードが見つかりません: ${element.id}`);
      return null;
    }

    // 断面情報を取得
    const section = sectionMap.get(element.id_section);
    const profile = extractProfileFromSection(section, steelSections);

    // 回転角度を取得
    const rotation = element.rotate || element.angle || 0;

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
export async function collectSlabDataForExport() {
  const slabData = [];

  const structureData = await getOrParseStructureData();
  if (!structureData) return slabData;

  const { nodeMap, elementData, sectionMaps } = structureData;
  const slabElements = elementData.slabElements || [];
  const slabSections = sectionMaps.slabSections || new Map();

  for (const slab of slabElements) {
    const slabEntry = convertSlabToExportData(slab, nodeMap, slabSections);
    if (slabEntry) slabData.push(slabEntry);
  }

  return slabData;
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
    const vertices = [];
    const offsets = element.offsets || new Map();

    for (const nodeId of nodeIds) {
      const node = nodeMap.get(nodeId);
      if (!node) {
        log.warn(`床 ${element.id}: ノード ${nodeId} が見つかりません`);
        return null;
      }

      const offset = offsets.get ? offsets.get(nodeId) : offsets[nodeId];
      const offsetX = offset?.offset_X || 0;
      const offsetY = offset?.offset_Y || 0;
      const offsetZ = offset?.offset_Z || 0;

      vertices.push({
        x: node.x + offsetX,
        y: node.y + offsetY,
        z: node.z + offsetZ,
      });
    }

    // 断面データから厚さを取得
    let thickness = 150;
    if (sectionMap) {
      const sectionData = sectionMap.get(element.id_section);
      if (sectionData) {
        thickness =
          sectionData.depth ||
          sectionData.dimensions?.depth ||
          sectionData.t ||
          sectionData.thickness ||
          150;
      }
    }

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
export async function collectWallDataForExport() {
  const wallData = [];

  const structureData = await getOrParseStructureData();
  if (!structureData) return wallData;

  const { nodeMap, elementData, sectionMaps } = structureData;
  const wallElements = elementData.wallElements || [];
  const wallSections = sectionMaps.wallSections || new Map();
  const openingElements = elementData.openingElements || new Map();

  for (const wall of wallElements) {
    const wallEntry = convertWallToExportData(wall, nodeMap, wallSections, openingElements);
    if (wallEntry) wallData.push(wallEntry);
  }

  return wallData;
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
    const vertices = [];
    const offsets = element.offsets || new Map();

    for (const nodeId of nodeIds) {
      const node = nodeMap.get(nodeId);
      if (!node) {
        log.warn(`壁 ${element.id}: ノード ${nodeId} が見つかりません`);
        return null;
      }

      const offset = offsets.get ? offsets.get(nodeId) : offsets[nodeId];
      const offsetX = offset?.offset_X || 0;
      const offsetY = offset?.offset_Y || 0;
      const offsetZ = offset?.offset_Z || 0;

      vertices.push({
        x: node.x + offsetX,
        y: node.y + offsetY,
        z: node.z + offsetZ,
      });
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
    let thickness = 200;
    if (sectionMap) {
      const sectionData = sectionMap.get(element.id_section);
      if (sectionData) {
        thickness =
          sectionData.t ||
          sectionData.thickness ||
          sectionData.dimensions?.t ||
          sectionData.dimensions?.thickness ||
          200;
      }
    }

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
        for (const [_openId, opening] of openingElements) {
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
export async function collectPileDataForExport() {
  const pileData = [];

  const structureData = await getOrParseStructureData();
  if (!structureData) return pileData;

  const { nodeMap, elementData, sectionMaps } = structureData;
  const pileElements = elementData.pileElements || [];
  const pileSections = sectionMaps.pileSections || new Map();

  for (const pile of pileElements) {
    const pileEntry = convertPileToExportData(pile, nodeMap, pileSections);
    if (pileEntry) pileData.push(pileEntry);
  }

  return pileData;
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
      const bottomNode = nodeMap.get(element.id_node_bottom);
      const topNode = nodeMap.get(element.id_node_top);

      if (!bottomNode || !topNode) {
        log.warn(`杭 ${element.id}: ノードが見つかりません`);
        return null;
      }

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
      // STBでは id_node で参照するノードのXY座標と、level_top（杭頭レベル）を使用
      const node = nodeMap.get(element.id_node);
      if (!node) {
        log.warn(`杭 ${element.id}: ノードが見つかりません`);
        return null;
      }

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
        diameter =
          sectionData.D ||
          sectionData.diameter ||
          sectionData.dimensions?.D ||
          sectionData.dimensions?.diameter ||
          600;
        wallThickness =
          sectionData.t || sectionData.wallThickness || sectionData.dimensions?.t || null;
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
export async function collectFootingDataForExport() {
  const footingData = [];

  const structureData = await getOrParseStructureData();
  if (!structureData) return footingData;

  const { nodeMap, elementData, sectionMaps } = structureData;
  const footingElements = elementData.footingElements || [];
  const footingSections = sectionMaps.footingSections || new Map();

  for (const footing of footingElements) {
    const footingEntry = convertFootingToExportData(footing, nodeMap, footingSections);
    if (footingEntry) footingData.push(footingEntry);
  }

  return footingData;
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
    const node = nodeMap.get(element.id_node);
    if (!node) {
      log.warn(`基礎 ${element.id}: ノードが見つかりません`);
      return null;
    }

    const offsetX = element.offset_X || 0;
    const offsetY = element.offset_Y || 0;
    const levelBottom = element.level_bottom || 0;
    const rotation = element.rotate || 0;

    // 断面データから寸法を取得
    let width_X = 1500; // デフォルト1.5m
    let width_Y = 1500;
    let depth = 500; // デフォルト500mm

    if (sectionMap) {
      const sectionData = sectionMap.get(element.id_section);
      if (sectionData) {
        const dims = sectionData.dimensions || {};
        // 注: deriveDimensionsFromAttributesはwidth_X→width, width_Y→heightに変換する
        width_X =
          dims.width_X ||
          dims.width ||
          dims.overall_width ||
          sectionData.width_X ||
          sectionData.width ||
          1500;
        width_Y =
          dims.width_Y ||
          dims.height ||
          dims.overall_depth ||
          sectionData.width_Y ||
          sectionData.height ||
          1500;
        // 基礎の深さはthicknessまたはdepthとして格納される
        depth =
          dims.depth ||
          dims.thickness ||
          dims.t ||
          sectionData.depth ||
          sectionData.thickness ||
          sectionData.t ||
          500;
      }
    }

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
export async function collectFoundationColumnDataForExport() {
  const foundationColumnData = [];

  const structureData = await getOrParseStructureData();
  if (!structureData) return foundationColumnData;

  const { nodeMap, steelSections, elementData, sectionMaps } = structureData;
  const foundationColumnElements = elementData.foundationColumnElements || [];
  const foundationColumnSections = sectionMaps.foundationcolumnSections || new Map();

  for (const fc of foundationColumnElements) {
    const fcEntry = convertFoundationColumnToExportData(
      fc,
      nodeMap,
      foundationColumnSections,
      steelSections,
    );
    if (fcEntry) foundationColumnData.push(fcEntry);
  }

  return foundationColumnData;
}

/**
 * 基礎柱要素をエクスポート用データに変換
 * @param {Object} element - 基礎柱要素
 * @param {Map} nodeMap - ノードマップ
 * @param {Map} sectionMap - 断面マップ
 * @param {Map} steelSections - 鋼材断面マップ
 * @returns {Object|null} エクスポート用データ
 */
function convertFoundationColumnToExportData(element, nodeMap, sectionMap, steelSections) {
  try {
    const bottomNode = nodeMap.get(element.id_node_bottom);
    const topNode = nodeMap.get(element.id_node_top);

    if (!bottomNode || !topNode) {
      log.warn(`基礎柱 ${element.id}: ノードが見つかりません`);
      return null;
    }

    // 断面情報を取得
    const section = sectionMap.get(element.id_section);
    const profile = extractProfileFromSection(section, steelSections);

    // 回転角度を取得
    const rotation = element.rotate || 0;

    // オフセット情報を取得
    const offsetBottomX = element.offset_bottom_X || 0;
    const offsetBottomY = element.offset_bottom_Y || 0;
    const offsetTopX = element.offset_top_X || 0;
    const offsetTopY = element.offset_top_Y || 0;

    return {
      name: element.name || `FoundationColumn_${element.id}`,
      bottomPoint: {
        x: bottomNode.x + offsetBottomX,
        y: bottomNode.y + offsetBottomY,
        z: bottomNode.z,
      },
      topPoint: {
        x: topNode.x + offsetTopX,
        y: topNode.y + offsetTopY,
        z: topNode.z,
      },
      profile,
      rotation,
    };
  } catch (error) {
    log.warn(`基礎柱変換エラー (${element.id}):`, error);
    return null;
  }
}

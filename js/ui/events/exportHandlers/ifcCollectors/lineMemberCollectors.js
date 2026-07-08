/**
 * @fileoverview 線材（梁・柱・ブレース）のIFC/STBエクスポートデータ収集・変換
 *
 * @module ui/events/exportHandlers/ifcCollectors/lineMemberCollectors
 */

import { convertToMultiSectionData } from '../commonDataCollector.js';
import { STB_TAG_NAMES } from '../../../../constants/elementTypes.js';
import { createLogger } from '../../../../utils/logger.js';
import {
  collectElementDataForExport,
  extractCommonElementData,
  applyNodeOffset,
  extractSteelProfile,
} from './collectorHelpers.js';

const log = createLogger('ifcDataCollector');

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
    const commonData = extractCommonElementData(element, nodeMap, sectionMap, {
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
    const startPoint = applyNodeOffset(startNode, element, 'offset_start_', 'apply');
    const endPoint = applyNodeOffset(endNode, element, 'offset_end_', 'apply');

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
    const steelProfile = extractSteelProfile(section, steelSections);

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
      stbType: elementType === 'Beam' ? STB_TAG_NAMES.BEAM : STB_TAG_NAMES.GIRDER,
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
    const commonData = extractCommonElementData(element, nodeMap, sectionMap, {
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
    const steelProfile = extractSteelProfile(section, steelSections);

    // オフセット情報を取得（STBの柱はXY方向のオフセットを持つ）
    const bottomPoint = applyNodeOffset(bottomNode, element, 'offset_bottom_', 'skip');
    const topPoint = applyNodeOffset(topNode, element, 'offset_top_', 'skip');

    const result = {
      name: element.name || element.id || `${elementType}-${element.id}`,
      bottomPoint,
      topPoint,
      profile,
      rotation,
      isReferenceDirection,
      stbType: elementType === 'Post' ? STB_TAG_NAMES.POST : STB_TAG_NAMES.COLUMN,
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
    const commonData = extractCommonElementData(element, nodeMap, sectionMap, {
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

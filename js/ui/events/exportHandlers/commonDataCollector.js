/**
 * @fileoverview 共通データ収集ユーティリティ
 *
 * エクスポート機能で共通して使用されるデータ収集・変換ユーティリティを提供します。
 *
 * @module ui/events/exportHandlers/commonDataCollector
 */

import {
  extractProfileFromSection,
  getSectionHeight,
  mapToCalculatorParams,
} from '../../../data/accessors/profileExtractor.js';
import {
  calculateHShapeProfile,
  calculateBoxProfile,
  calculatePipeProfile,
  calculateRectangleProfile,
  calculateLShapeProfile,
  calculateChannelProfile,
  calculateTShapeProfile,
} from '../../../viewer/geometry/core/ProfileCalculator.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('commonDataCollector');

/**
 * globalStateからパース済み構造データを取得、なければXMLから抽出
 * @returns {Promise<Object>} 構造データ {nodeMap, steelSections, elementData, sectionMaps}
 */
export async function getOrParseStructureData() {
  const { getState } = await import('../../../app/globalState.js');

  // globalStateからパース済みデータを確認
  const cachedNodeMap = getState('models.nodeMapRawA') || getState('models.nodeMapRawB');
  const cachedSteelSections = getState('models.steelSections');
  const cachedElementData = getState('models.elementData');
  const cachedSectionMaps = getState('models.sectionMaps');

  // パース済みデータが利用可能か確認
  const hasCachedData =
    cachedNodeMap &&
    cachedNodeMap.size > 0 &&
    cachedSteelSections &&
    cachedElementData &&
    cachedSectionMaps;

  if (hasCachedData) {
    return {
      nodeMap: cachedNodeMap,
      steelSections: cachedSteelSections,
      elementData: cachedElementData,
      sectionMaps: cachedSectionMaps,
    };
  }

  // フォールバック: XMLから抽出
  const modelADocument = getState('models.documentA');
  const modelBDocument = getState('models.documentB');
  const xmlDoc = modelADocument || modelBDocument;

  if (!xmlDoc) {
    log.warn('IFC Export: XMLドキュメントが見つかりません');
    return null;
  }

  // パーサーをインポート
  const {
    buildNodeMap,
    extractGirderElements,
    extractBeamElements,
    extractColumnElements,
    extractPostElements,
    extractBraceElements,
    extractSlabElements,
    extractWallElements,
    extractSteelSections,
    extractOpeningElements,
    extractPileElements,
    extractFootingElements,
    extractFoundationColumnElements,
  } = await import('../../../parser/stbXmlParser.js');

  const { extractAllSections } = await import('../../../parser/sectionExtractor.js');

  // データを抽出
  const nodeMap = buildNodeMap(xmlDoc);
  const steelSections = extractSteelSections(xmlDoc);
  const allSections = extractAllSections(xmlDoc);
  const openingElements = extractOpeningElements(xmlDoc);

  return {
    nodeMap,
    steelSections,
    elementData: {
      girderElements: extractGirderElements(xmlDoc),
      beamElements: extractBeamElements(xmlDoc),
      columnElements: extractColumnElements(xmlDoc),
      postElements: extractPostElements(xmlDoc),
      braceElements: extractBraceElements(xmlDoc),
      slabElements: extractSlabElements(xmlDoc),
      wallElements: extractWallElements(xmlDoc),
      openingElements: openingElements,
      pileElements: extractPileElements(xmlDoc),
      footingElements: extractFootingElements(xmlDoc),
      foundationColumnElements: extractFoundationColumnElements(xmlDoc),
    },
    sectionMaps: {
      girderSections: allSections.girderSections || new Map(),
      beamSections: allSections.beamSections || new Map(),
      columnSections: allSections.columnSections || new Map(),
      postSections: allSections.postSections || new Map(),
      braceSections: allSections.braceSections || new Map(),
      slabSections: allSections.slabSections || new Map(),
      wallSections: allSections.wallSections || new Map(),
      pileSections: allSections.pileSections || new Map(),
      footingSections: allSections.footingSections || new Map(),
      foundationcolumnSections: allSections.foundationcolumnSections || new Map(),
    },
  };
}

/**
 * プロファイルタイプから頂点計算関数を取得
 * @param {string} profileType - プロファイルタイプ (H, BOX, PIPE等)
 * @returns {Function|null} 頂点計算関数
 */
export function getProfileCalculator(profileType) {
  const type = (profileType || '').toUpperCase();
  switch (type) {
    case 'H':
    case 'I':
      return calculateHShapeProfile;
    case 'BOX':
    case 'CFT':
      return calculateBoxProfile;
    case 'PIPE':
      return calculatePipeProfile;
    case 'L':
      return calculateLShapeProfile;
    case 'C':
    case 'U':
      return calculateChannelProfile;
    case 'T':
      return calculateTShapeProfile;
    case 'RECTANGLE':
    case 'RC':
    case 'stb-diff-viewer':
    default:
      return calculateRectangleProfile;
  }
}

/**
 * プロファイルから断面頂点を計算（天端基準に変換）
 * ProfileCalculatorは中心基準の頂点を返すため、天端基準に変換する
 * @param {Object} profile - プロファイル情報 {type, params}
 * @returns {Array<{x: number, y: number}>} 断面頂点配列（天端がy=0）
 */
export function calculateProfileVertices(profile) {
  if (!profile) return null;

  const calculator = getProfileCalculator(profile.type);
  if (!calculator) return null;

  const params = mapToCalculatorParams(profile);
  const result = calculator(params);

  if (!result?.vertices) return null;

  // 中心基準から天端基準に変換
  // ProfileCalculatorの頂点は中心基準（y: -H/2 ~ +H/2）
  // IFC出力では天端基準（y: 0 ~ -H）が必要
  const maxY = Math.max(...result.vertices.map((v) => v.y));
  const topAlignedVertices = result.vertices.map((v) => ({
    x: v.x,
    y: v.y - maxY, // 天端をy=0に移動
  }));

  return topAlignedVertices;
}

/**
 * 位置指定文字列を0-1の相対位置に変換
 * @param {string} pos - 位置指定 (START, CENTER, END, HAUNCH_S, HAUNCH_E等)
 * @param {Array} allShapes - 全形状配列
 * @param {Object} element - 梁要素
 * @param {number} beamLength - 梁の長さ (mm)
 * @returns {number} 相対位置 (0-1)
 */
export function convertPositionToRatio(pos, allShapes, element, beamLength) {
  const posUpper = (pos || 'CENTER').toUpperCase();

  // ジョイント長さ（要素にある場合）
  const jointStart = parseFloat(element.joint_start) || 0;
  const jointEnd = parseFloat(element.joint_end) || 0;

  // ハンチ長さ（要素にある場合）
  // haunch_start/haunch_end は絶対距離(mm)なので相対値に変換が必要
  // ここでは簡易的に0.15 (15%)をデフォルトハンチ長さとする
  const defaultHaunchRatio = 0.15;

  switch (posUpper) {
    case 'START':
    case 'TOP':
      // START断面は常に梁の始点（位置0）
      return 0;
    case 'HAUNCH_S':
      return defaultHaunchRatio;
    case 'CENTER': {
      // 2断面(START/CENTER)の場合、CENTERはハンチ終了位置
      // 3断面以上の場合、CENTERは中央
      const hasStart = allShapes.some((s) => (s.pos || '').toUpperCase() === 'START');
      const hasEnd = allShapes.some((s) => (s.pos || '').toUpperCase() === 'END');
      if (hasStart && !hasEnd) {
        // START+CENTERの2断面: CENTERはジョイント終了位置
        if (jointStart > 0 && beamLength > 0) {
          return jointStart / beamLength;
        }
        return defaultHaunchRatio;
      } else if (!hasStart && hasEnd) {
        // CENTER+ENDの2断面: CENTERはジョイント開始位置
        if (jointEnd > 0 && beamLength > 0) {
          return (beamLength - jointEnd) / beamLength;
        }
        return 1 - defaultHaunchRatio;
      }
      return 0.5;
    }
    case 'HAUNCH_E':
      return 1 - defaultHaunchRatio;
    case 'END':
    case 'BOTTOM':
      // END断面は常に梁の終点（位置1）
      return 1;
    default: {
      // 数値の場合はそのまま使用
      const numValue = parseFloat(pos);
      if (!isNaN(numValue)) {
        return numValue <= 1 ? numValue : numValue / 100; // パーセンテージか相対値か
      }
      return 0.5;
    }
  }
}

/**
 * マルチセクション断面情報をIFC出力用の形式に変換
 * @param {Object} section - 断面情報 (mode, shapes配列を含む)
 * @param {Map} steelSections - 鋼材断面マップ
 * @param {Object} element - 梁要素 (joint_start, joint_end, haunch_start, haunch_end を含む可能性)
 * @param {number} beamLength - 梁の長さ (mm) - ジョイント位置計算に使用
 * @returns {Object|null} マルチセクションデータ {sections: [{pos, vertices}]}
 */
export function convertToMultiSectionData(section, steelSections, element, beamLength) {
  try {
    const shapes = section.shapes;
    if (!shapes || shapes.length < 2) return null;

    const sections = [];

    for (const shape of shapes) {
      // 位置を0-1の相対値に変換
      const pos = convertPositionToRatio(shape.pos, shapes, element, beamLength);

      // 形状名から断面寸法を取得
      let profile = null;
      if (shape.shapeName && steelSections) {
        const steelShape = steelSections.get(shape.shapeName);
        if (steelShape) {
          profile = extractProfileFromSection(
            {
              dimensions: steelShape,
              shapeName: shape.shapeName,
            },
            steelSections,
          );
        }
      }

      // 形状がvariantに含まれている場合
      if (!profile && shape.variant?.shape && steelSections) {
        const steelShape = steelSections.get(shape.variant.shape);
        if (steelShape) {
          profile = extractProfileFromSection(
            {
              dimensions: steelShape,
              shapeName: shape.variant.shape,
            },
            steelSections,
          );
        }
      }

      if (!profile) {
        log.warn(
          `マルチセクション断面の形状が見つかりません: ${shape.shapeName || shape.variant?.shape}`,
        );
        continue;
      }

      // プロファイルから頂点を計算
      const vertices = calculateProfileVertices(profile);
      if (!vertices || vertices.length < 3) {
        log.warn(`マルチセクション断面の頂点計算に失敗: ${shape.shapeName}`);
        continue;
      }

      sections.push({ pos, vertices });
    }

    // 位置でソート
    sections.sort((a, b) => a.pos - b.pos);

    if (sections.length < 2) return null;

    // 端点に断面がない場合は補完（CENTER+ENDのみ、START+CENTERのみの場合）
    // STARTがない場合（pos=0.0がない）→ 最初の断面をpos=0.0に追加
    const hasStart = sections.some((s) => s.pos < 0.01);
    if (!hasStart && sections.length > 0) {
      const firstSection = sections[0];
      sections.unshift({
        pos: 0.0,
        vertices: [...firstSection.vertices],
      });
    }

    // ENDがない場合（pos=1.0がない）→ 最後の断面をpos=1.0に追加
    const hasEnd = sections.some((s) => s.pos > 0.99);
    if (!hasEnd && sections.length > 0) {
      const lastSection = sections[sections.length - 1];
      sections.push({
        pos: 1.0,
        vertices: [...lastSection.vertices],
      });
    }

    // 最終ソート
    sections.sort((a, b) => a.pos - b.pos);

    return { sections };
  } catch (error) {
    log.warn('マルチセクションデータ変換エラー:', error);
    return null;
  }
}

// 再エクスポート（外部から使用されるユーティリティ）
export { extractProfileFromSection, getSectionHeight };

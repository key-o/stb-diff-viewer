/**
 * @fileoverview SS7 CSV → STB DOM 変換ブリッジ
 *
 * ブラウザの File オブジェクトから SS7 CSV を読み込み、
 * STB XML DOM Document に変換して返す。
 * 既存の STB パーサー・比較・描画パイプラインにそのまま投入可能。
 *
 * @module Ss7ToStbBridge
 */

import { generateSs7ToStbXml } from './Ss7ToStbXmlGenerator.js';
import { validateJsonSchema } from '../common-stb/validation/jsonSchemaValidator.js';
import { parseSs7Csv, extractHeaderInfo } from './importer/ss7CsvParser.js';
import {
  parseAxes,
  parseStories,
  parseNodeVerticalMovements,
  parseNodeUnifications,
  parseFloorStoryPairs,
  parseAxisDeviations,
  parseMemberEccentricities,
  parseGirderLevelAdjustments,
  parseSpecificGirderEccentricities,
  parseSpecificGirderLevelAdjustments,
  parseStoryConcretes,
} from './importer/gridLevelParser.js';
import { parseAllSections } from './importer/sections/all-sections.js';
import { parseColumnPlacements, parseContinuousColumns } from './importer/members/column.js';
import { parseGirderPlacements } from './importer/members/girder.js';
import { parseBracePlacements } from './importer/members/brace.js';
import {
  parseWallPlacements,
  parseWallOpeningPlacements,
  parseOutOfFrameWallPlacements,
} from './importer/members/wall.js';
import { parseSubBeamPlacements } from './importer/members/sub-beam.js';
import { parseCantileverGirderPlacements } from './importer/members/cantilever-girder.js';
import {
  parseCantileverSlabPlacements,
  parseCantileverSlabShapes,
} from './importer/members/cantilever-slab.js';
import { parseParapetPlacements } from './importer/members/parapet.js';
import { parseFloorPlacements } from './importer/members/slab.js';
import { parsePilePlacements } from './importer/members/pile.js';
import { parseFloorGroupShapes, parseFloorGroupLayouts } from './importer/sections/floor-group.js';

/**
 * SS7 CSV File を STB XML DOM Document に変換
 * @param {File} file - ブラウザの File オブジェクト
 * @param {Object} [options]
 * @param {function} [options.onProgress] - 進捗コールバック
 * @returns {Promise<XMLDocument>} STB XML DOM Document
 */
export async function convertSs7ToStbDocument(file, options = {}) {
  const { onProgress } = options;

  // 1. ファイル読み込み（Shift-JIS → UTF-8）
  if (onProgress) onProgress({ stage: 'reading', progress: 0 });
  const arrayBuffer = await file.arrayBuffer();
  const csvText = new TextDecoder('shift-jis').decode(arrayBuffer);

  // 2. CSVパース
  if (onProgress) onProgress({ stage: 'parsing', progress: 20 });
  const sections = parseSs7Csv(csvText);

  // 3. データ抽出
  if (onProgress) onProgress({ stage: 'extracting', progress: 40 });
  const header = extractHeaderInfo(csvText);
  const axes = parseAxes(sections);
  const stories = parseStories(sections);
  const sectionData = parseAllSections(sections);
  const columnPlacements = parseColumnPlacements(sections);
  const continuousColumns = parseContinuousColumns(sections);
  const girderPlacements = parseGirderPlacements(sections);
  const bracePlacements = parseBracePlacements(sections);
  const wallPlacements = parseWallPlacements(sections);
  const wallOpeningPlacements = parseWallOpeningPlacements(sections);
  const outOfFrameWallPlacements = parseOutOfFrameWallPlacements(sections);
  const subBeamPlacements = parseSubBeamPlacements(sections);
  const cantileverGirderPlacements = parseCantileverGirderPlacements(sections);
  const cantileverSlabPlacements = parseCantileverSlabPlacements(sections);
  const cantileverSlabShapes = parseCantileverSlabShapes(sections);
  const parapetPlacements = parseParapetPlacements(sections);
  const floorPlacements = parseFloorPlacements(sections);
  const pilePlacements = parsePilePlacements(sections);
  const floorGroupShapes = parseFloorGroupShapes(sections);
  const floorGroupLayouts = parseFloorGroupLayouts(sections);
  const nodeVerticalMovements = parseNodeVerticalMovements(sections);
  const nodeUnifications = parseNodeUnifications(sections);
  const floorStoryPairs = parseFloorStoryPairs(sections);
  const axisDeviations = parseAxisDeviations(sections);
  const memberEccentricities = parseMemberEccentricities(sections);
  const girderLevelAdjustments = parseGirderLevelAdjustments(sections);
  const specificGirderEccentricities = parseSpecificGirderEccentricities(sections);
  const specificGirderLevelAdjustments = parseSpecificGirderLevelAdjustments(sections);
  const storyConcretes = parseStoryConcretes(sections, stories);

  const ss7Data = {
    header,
    axes,
    stories,
    sections: sectionData,
    columnPlacements,
    continuousColumns,
    girderPlacements,
    bracePlacements,
    wallPlacements,
    wallOpeningPlacements,
    outOfFrameWallPlacements,
    subBeamPlacements,
    cantileverGirderPlacements,
    cantileverSlabPlacements,
    cantileverSlabShapes,
    parapetPlacements,
    floorPlacements,
    pilePlacements,
    floorGroupShapes,
    floorGroupLayouts,
    nodeVerticalMovements,
    nodeUnifications,
    floorStoryPairs,
    axisDeviations,
    memberEccentricities,
    girderLevelAdjustments,
    specificGirderEccentricities,
    specificGirderLevelAdjustments,
    storyConcretes,
  };

  // 4. STB XML生成
  if (onProgress) onProgress({ stage: 'converting', progress: 60 });
  const xml = generateSs7ToStbXml(ss7Data);

  // 5. DOMパース
  if (onProgress) onProgress({ stage: 'loading', progress: 80 });
  const parser = new DOMParser();
  const document = parser.parseFromString(xml, 'application/xml');

  // パースエラーチェック
  const parseError = document.querySelector('parsererror');
  if (parseError) {
    throw new Error(`SS7→STB変換結果のXMLパースに失敗しました: ${parseError.textContent}`);
  }

  // スキーマ検証（スキーマが読み込まれていれば非ブロッキングで実施）
  const schemaIssues = validateJsonSchema(document, { version: '2.1.0' });
  const schemaErrors = schemaIssues.filter((i) => i.severity === 'error');
  if (schemaErrors.length > 0) {
    console.warn(
      '[SS7→STB] スキーマ違反が検出されました:',
      schemaErrors.map((e) => e.message),
    );
    // 安全網: スキーマエラー残存時にDOM操作で不足属性を補完
    const repairs = repairSs7ConversionGaps(document);
    if (repairs.length > 0) {
      console.info(`[SS7→STB] 安全網修復: ${repairs.length}件の属性を補完しました`);
    }
  }

  if (onProgress) onProgress({ stage: 'done', progress: 100 });
  return document;
}

/**
 * SS7→STB変換固有の安全網修復
 * XML生成で不足した必須属性をDOM操作で補完する
 * @param {XMLDocument} doc
 * @returns {Array<{element: string, attribute: string, value: string}>}
 */
function repairSs7ConversionGaps(doc) {
  const repairs = [];

  // StbGirder / StbBeam: isFoundation が欠落していれば補完
  for (const tag of ['StbGirder', 'StbBeam']) {
    for (const el of doc.querySelectorAll(tag)) {
      if (!el.hasAttribute('isFoundation')) {
        el.setAttribute('isFoundation', 'false');
        repairs.push({ element: tag, attribute: 'isFoundation', value: 'false' });
      }
    }
  }

  // StbSlab: kind_slab / isFoundation が欠落していれば補完
  for (const el of doc.querySelectorAll('StbSlab')) {
    if (!el.hasAttribute('kind_slab')) {
      el.setAttribute('kind_slab', 'NORMAL');
      repairs.push({ element: 'StbSlab', attribute: 'kind_slab', value: 'NORMAL' });
    }
    if (!el.hasAttribute('isFoundation')) {
      el.setAttribute('isFoundation', 'false');
      repairs.push({ element: 'StbSlab', attribute: 'isFoundation', value: 'false' });
    }
  }

  // StbWall: kind_layout が欠落していれば補完
  for (const el of doc.querySelectorAll('StbWall')) {
    if (!el.hasAttribute('kind_layout')) {
      el.setAttribute('kind_layout', 'ON_GIRDER');
      repairs.push({ element: 'StbWall', attribute: 'kind_layout', value: 'ON_GIRDER' });
    }
  }

  // StbBrace: offset_* → aim_offset_* リネーム（旧属性名が残っていれば）
  for (const el of doc.querySelectorAll('StbBrace')) {
    for (const suffix of ['start_X', 'start_Y', 'start_Z', 'end_X', 'end_Y', 'end_Z']) {
      const oldAttr = `offset_${suffix}`;
      const newAttr = `aim_offset_${suffix}`;
      if (el.hasAttribute(oldAttr) && !el.hasAttribute(newAttr)) {
        el.setAttribute(newAttr, el.getAttribute(oldAttr));
        el.removeAttribute(oldAttr);
        repairs.push({
          element: 'StbBrace',
          attribute: `${oldAttr}→${newAttr}`,
          value: el.getAttribute(newAttr),
        });
      }
    }
  }

  // StbBeam: kind_beam は StbBeam スキーマに存在しないため削除
  for (const el of doc.querySelectorAll('StbBeam')) {
    if (el.hasAttribute('kind_beam')) {
      el.removeAttribute('kind_beam');
      repairs.push({ element: 'StbBeam', attribute: 'kind_beam', value: '(removed)' });
    }
  }

  return repairs;
}

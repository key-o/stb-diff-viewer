/**
 * sections/all-sections.js - 断面パーサー統合関数
 *
 * 責務: 全断面タイプを一括でパースして返す
 *
 * ported from MatrixCalc for StbDiffViewer
 */

import { parseSColumnSections } from './s-column.js';
import { parseRCColumnSections } from './rc-column.js';
import { parseSBeamSections } from './s-beam.js';
import { parseSSubBeamSections } from './s-sub-beam.js';
import { parseSCantileverBeamSections } from './s-canti-beam.js';
import { parseRCBeamSections, parseRCSubBeamSections } from './rc-beam.js';
import { parseBraceSections } from './brace.js';
import { parseWallSections, parseOutOfFrameWallSections } from './wall.js';
import { parseFloorSections } from './floor.js';
import { parseParapetSections } from './parapet.js';
import { parseStandardMaterials } from './standard-materials.js';
import { parsePileSections, parsePileFoundationSections } from './pile.js';

/**
 * 全ての断面情報を抽出
 * @param {Map} sections - パース済みセクション
 * @returns {Object} {columns: Array, beams: Array, braces: Array, walls: Array, floors: Array, parapets: Array}
 */
export function parseAllSections(sections) {
  const materialDefaults = parseStandardMaterials(sections);
  const columnSections = parseSColumnSections(sections);
  const rcColumnSections = parseRCColumnSections(sections, materialDefaults);
  const beamSections = parseSBeamSections(sections);
  const sSubBeamSections = parseSSubBeamSections(sections);
  const sCantileverBeamSections = parseSCantileverBeamSections(sections);
  const rcBeamSections = parseRCBeamSections(sections, materialDefaults);
  const rcSubBeamSections = parseRCSubBeamSections(sections);
  const braceSections = parseBraceSections(sections);
  const wallSections = parseWallSections(sections);
  const outOfFrameWallSections = parseOutOfFrameWallSections(sections);
  const floorSections = parseFloorSections(sections);
  const parapetSections = parseParapetSections(sections);
  const pileSections = parsePileSections(sections);
  const pileFoundationSections = parsePileFoundationSections(sections);

  return {
    columns: [...columnSections, ...rcColumnSections],
    beams: [
      ...beamSections,
      ...sSubBeamSections,
      ...sCantileverBeamSections,
      ...rcBeamSections,
      ...rcSubBeamSections,
    ],
    braces: braceSections,
    walls: wallSections,
    outOfFrameWalls: outOfFrameWallSections,
    floors: floorSections,
    parapets: parapetSections,
    piles: pileSections,
    pileFoundations: pileFoundationSections,
    materialDefaults,
  };
}

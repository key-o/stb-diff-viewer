/**
 * members/wall.js
 * SS7 壁配置パーサー
 */

import { getSection, sectionToObjects } from '../ss7CsvParser.js';
import {
  WALL_PLACEMENT_KEYS,
  WALL_OPENING_PLACEMENT_KEYS,
  OUT_OF_FRAME_WALL_PLACEMENT_KEYS,
  getValue,
  getNumericValue,
  getIntValue,
} from '../key-mappings.js';
import { parseFrameAxisString } from './utils.js';
import { inferAxisSystem, parseAxisIntersectionString } from '../axis-utils.js';

/**
 * 壁配置を抽出
 * @param {Map} sections
 * @returns {Array}
 */
export function parseWallPlacements(sections) {
  const section = getSection(sections, '壁配置');
  if (!section || !section.data) {
    return [];
  }
  const axisSystem = inferAxisSystem(sections);

  const rows = sectionToObjects(section);
  const result = [];

  for (const row of rows) {
    const floor = getValue(row, WALL_PLACEMENT_KEYS.story);
    const frameStr = getValue(row, WALL_PLACEMENT_KEYS.axis, '');
    const symbol = getValue(row, WALL_PLACEMENT_KEYS.symbol);

    const parsed = parseFrameAxisString(frameStr, axisSystem);
    if (!parsed) {
      continue;
    }

    result.push({
      floor,
      frame: parsed.frame,
      frameAxis: parsed.frameAxis,
      startAxis: parsed.startAxis,
      endAxis: parsed.endAxis,
      symbol,
      type: 'wall',
    });
  }

  return result;
}

/**
 * 壁開口配置を抽出
 * @param {Map} sections
 * @returns {Array}
 */
export function parseWallOpeningPlacements(sections) {
  const section = getSection(sections, '壁開口配置');
  if (!section || !section.data) return [];
  const axisSystem = inferAxisSystem(sections);

  const rows = sectionToObjects(section);
  const result = [];

  for (const row of rows) {
    const floor = getValue(row, WALL_OPENING_PLACEMENT_KEYS.story);
    const frameStr = getValue(row, WALL_OPENING_PLACEMENT_KEYS.axis, '');
    const counter = getIntValue(row, WALL_OPENING_PLACEMENT_KEYS.counter, 1);
    const holdType = getIntValue(row, WALL_OPENING_PLACEMENT_KEYS.holdType, 11);
    const l1 = getNumericValue(row, WALL_OPENING_PLACEMENT_KEYS.l1);
    const l2 = getNumericValue(row, WALL_OPENING_PLACEMENT_KEYS.l2);
    const h1 = getNumericValue(row, WALL_OPENING_PLACEMENT_KEYS.h1);
    const h2 = getNumericValue(row, WALL_OPENING_PLACEMENT_KEYS.h2);

    const parsed = parseFrameAxisString(frameStr, axisSystem);
    if (!parsed) continue;

    result.push({
      floor,
      counter,
      holdType,
      l1,
      l2,
      h1,
      h2,
      frame: parsed.frame,
      frameAxis: parsed.frameAxis,
      startAxis: parsed.startAxis,
      endAxis: parsed.endAxis,
    });
  }

  return result;
}

/**
 * フレーム外雑壁配置を抽出
 * @param {Map} sections
 * @returns {Array}
 */
export function parseOutOfFrameWallPlacements(sections) {
  const section = getSection(sections, 'フレーム外雑壁配置');
  if (!section || !section.data) return [];
  const axisSystem = inferAxisSystem(sections);

  const rows = sectionToObjects(section, { handleDuplicates: 'suffix' });
  const result = [];

  for (const row of rows) {
    const id = getIntValue(row, OUT_OF_FRAME_WALL_PLACEMENT_KEYS.id, 0);
    const axisStr = getValue(row, OUT_OF_FRAME_WALL_PLACEMENT_KEYS.axis, '');
    const floorFrom = getValue(row, OUT_OF_FRAME_WALL_PLACEMENT_KEYS.floor, '');
    const floorTo = getValue(row, OUT_OF_FRAME_WALL_PLACEMENT_KEYS.floorTo, '') || floorFrom;
    const startX = getNumericValue(row, OUT_OF_FRAME_WALL_PLACEMENT_KEYS.startX, 0);
    const startY = getNumericValue(row, OUT_OF_FRAME_WALL_PLACEMENT_KEYS.startY, 0);
    const endX = getNumericValue(row, OUT_OF_FRAME_WALL_PLACEMENT_KEYS.endX, 0);
    const endY = getNumericValue(row, OUT_OF_FRAME_WALL_PLACEMENT_KEYS.endY, 0);
    const symbol = getValue(row, OUT_OF_FRAME_WALL_PLACEMENT_KEYS.symbol, '');
    const considerWeightStr = getValue(row, OUT_OF_FRAME_WALL_PLACEMENT_KEYS.considerWeight, '');
    const considerWeight = considerWeightStr === '考慮する';

    // 軸-軸から参照軸交点を解析
    const axisPair = parseAxisIntersectionString(axisStr, axisSystem);

    result.push({
      id,
      axis: axisStr.trim(),
      axisPair,
      floorFrom,
      floorTo,
      startX,
      startY,
      endX,
      endY,
      symbol,
      considerWeight,
    });
  }

  return result;
}

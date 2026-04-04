/**
 * members/slab.js
 * SS7 床配置パーサー
 */

import { getSection, sectionToObjects } from '../ss7CsvParser.js';
import { FLOOR_LAYOUT_KEYS, getValue, getIntValue, getNumericValue } from '../key-mappings.js';
import { parse4AxisGridRange } from './utils.js';
import { inferAxisSystem } from '../axis-utils.js';

/**
 * 床配置を抽出
 * @param {Map} sections - パース済みセクション
 * @returns {Array<{story: string, xStart: string, xEnd: string, yStart: string, yEnd: string,
 *   symbol: string, type: string, indices: number[], doubleType: string,
 *   rotation: number, floorGroupNo: number}>}
 */
export function parseFloorPlacements(sections) {
  const section = getSection(sections, '床配置');
  if (!section || !section.data) {
    return [];
  }
  const axisSystem = inferAxisSystem(sections);

  const rows = sectionToObjects(section);
  const result = [];

  for (const row of rows) {
    const story = getValue(row, FLOOR_LAYOUT_KEYS.level);
    const surfaceStr = getValue(row, FLOOR_LAYOUT_KEYS.surface, '');
    const symbol = getValue(row, FLOOR_LAYOUT_KEYS.symbol, '');

    if (!story || !symbol) continue;

    const grid = parse4AxisGridRange(surfaceStr, axisSystem);
    if (!grid) continue;

    const indices = [
      getIntValue(row, FLOOR_LAYOUT_KEYS.index1, 0),
      getIntValue(row, FLOOR_LAYOUT_KEYS.index2, 0),
      getIntValue(row, FLOOR_LAYOUT_KEYS.index3, 0),
      getIntValue(row, FLOOR_LAYOUT_KEYS.index4, 0),
      getIntValue(row, FLOOR_LAYOUT_KEYS.index5, 0),
    ];

    result.push({
      story,
      xStart: grid.xStart,
      xEnd: grid.xEnd,
      yStart: grid.yStart,
      yEnd: grid.yEnd,
      symbol,
      type: 'slab',
      indices,
      doubleType: getValue(row, FLOOR_LAYOUT_KEYS.doubleType, '上'),
      rotation: getNumericValue(row, FLOOR_LAYOUT_KEYS.rotation, 0),
      floorGroupNo: getIntValue(row, FLOOR_LAYOUT_KEYS.floorGroupNo, 1),
    });
  }

  return result;
}

/**
 * members/parapet.js
 * SS7 パラペット配置パーサー
 */

import { getSection, sectionToObjects } from '../ss7CsvParser.js';
import { PARAPET_PLACEMENT_KEYS, getValue, getNumericValue } from '../key-mappings.js';
import { parseFrameAxisString } from './utils.js';
import { inferAxisSystem } from '../axis-utils.js';

/**
 * パラペット配置を抽出
 * @param {Map} sections
 * @returns {Array}
 */
export function parseParapetPlacements(sections) {
  const section = getSection(sections, 'パラペット配置');
  if (!section || !section.data) {
    return [];
  }
  const axisSystem = inferAxisSystem(sections);

  const rows = sectionToObjects(section);
  const result = [];

  for (const row of rows) {
    const story = getValue(row, PARAPET_PLACEMENT_KEYS.story);
    const frameStr = getValue(row, PARAPET_PLACEMENT_KEYS.frameAxis, '');
    const symbol = getValue(row, PARAPET_PLACEMENT_KEYS.symbol);
    const height = getNumericValue(row, PARAPET_PLACEMENT_KEYS.height, 0);
    const tipMovement = getNumericValue(row, PARAPET_PLACEMENT_KEYS.tipMovement, 0);

    if (!symbol) continue;

    const parsed = parseFrameAxisString(frameStr, axisSystem);
    if (!parsed) {
      continue;
    }

    result.push({
      story,
      frame: parsed.frame,
      frameAxis: parsed.frameAxis,
      startAxis: parsed.startAxis,
      endAxis: parsed.endAxis,
      symbol,
      height,
      tipMovement,
      type: 'parapet',
    });
  }

  return result;
}

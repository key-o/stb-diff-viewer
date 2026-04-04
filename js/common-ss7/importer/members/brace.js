/**
 * members/brace.js
 * SS7 ブレース配置パーサー
 */

import { getSection, sectionToObjects } from '../ss7CsvParser.js';
import { BRACE_PLACEMENT_KEYS, getValue, getNumericValue } from '../key-mappings.js';
import { parseFrameAxisString } from './utils.js';
import { inferAxisSystem } from '../axis-utils.js';

const log = {
  debug: (...args) => console.debug('[SS7Brace]', ...args),
  warn: (...args) => console.warn('[SS7Brace]', ...args),
};

/**
 * ブレース配置を抽出
 * @param {Map} sections
 * @returns {Array}
 */
export function parseBracePlacements(sections) {
  const section = getSection(sections, '鉛直ブレース配置');
  if (!section || !section.data) {
    return [];
  }
  const axisSystem = inferAxisSystem(sections);

  const rows = sectionToObjects(section);
  const result = [];

  for (const row of rows) {
    const floor = getValue(row, BRACE_PLACEMENT_KEYS.story);
    const frameStr = getValue(row, BRACE_PLACEMENT_KEYS.frame, '');
    const symbol = getValue(row, BRACE_PLACEMENT_KEYS.symbol);
    const braceType = getValue(row, BRACE_PLACEMENT_KEYS.braceType, 'X形');
    const pair = getValue(row, BRACE_PLACEMENT_KEYS.pair, '両方');
    const eccLeft = getNumericValue(row, BRACE_PLACEMENT_KEYS.eccLeft, 0);
    const eccRight = getNumericValue(row, BRACE_PLACEMENT_KEYS.eccRight, 0);
    const throughFloorDir = getValue(row, BRACE_PLACEMENT_KEYS.throughFloorDir, '');
    const throughSpanDir = getValue(row, BRACE_PLACEMENT_KEYS.throughSpanDir, '');

    const parsed = parseFrameAxisString(frameStr, axisSystem);
    if (!parsed) {
      log.warn(`ブレース配置のフレーム解析に失敗: ${frameStr}`);
      continue;
    }

    const isKType = braceType.includes('K') || braceType.includes('k');
    const isKUpper = braceType.includes('上') || braceType.toLowerCase().includes('upper');
    const isKLower = braceType.includes('下') || braceType.toLowerCase().includes('lower');

    result.push({
      floor,
      frame: parsed.frame,
      frameAxis: parsed.frameAxis,
      startAxis: parsed.startAxis,
      endAxis: parsed.endAxis,
      direction: parsed.direction,
      symbol,
      braceType,
      isKType,
      isKUpper,
      isKLower,
      pair,
      eccentricityLeft: eccLeft,
      eccentricityRight: eccRight,
      throughFloorDir,
      throughSpanDir,
      type: 'brace',
    });
  }

  log.debug(`[parseBracePlacements] ${result.length}件のブレース配置をパースしました`);
  return result;
}

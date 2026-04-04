/**
 * sections/floor.js
 * SS7 床断面パーサー
 */

import { getSection, sectionToObjects } from '../ss7CsvParser.js';
import { FLOOR_SECTION_KEYS, getValue, getNumericValue } from '../key-mappings.js';

const SECTION_NAMES = [
  '床断面',
  'デッキ床断面',
  'RC床断面',
  '片持床断面',
  '片持デッキ床断面',
  '片持RC床断面',
];

/**
 * 床断面を抽出
 * @param {Map} sections - パース済みセクション
 * @returns {Array<{symbol: string, t: number, te: number, deckHeight: number, concrete: string, type: string}>}
 */
export function parseFloorSections(sections) {
  const result = [];

  for (const sectionName of SECTION_NAMES) {
    const section = getSection(sections, sectionName);
    if (!section || !section.data) continue;

    const isDeck = sectionName.includes('デッキ');
    const isCanti = sectionName.includes('片持');
    const rows = sectionToObjects(section);

    for (const row of rows) {
      const symbol = getValue(row, FLOOR_SECTION_KEYS.symbol);
      if (!symbol) continue;

      const direction = getValue(row, FLOOR_SECTION_KEYS.direction, '');
      result.push({
        symbol,
        t: getNumericValue(row, FLOOR_SECTION_KEYS.t, 0),
        te: getNumericValue(row, FLOOR_SECTION_KEYS.te, 0),
        deckHeight: isDeck ? getNumericValue(row, FLOOR_SECTION_KEYS.deckHeight, 0) : 0,
        concrete: getValue(row, FLOOR_SECTION_KEYS.concrete, ''),
        type: isDeck ? 'deck' : 'rc',
        isCanti,
        direction,
      });
    }
  }

  return result;
}

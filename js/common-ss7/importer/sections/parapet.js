/**
 * sections/parapet.js
 * SS7 パラペット断面パーサー
 */

import { getSection, sectionToObjects } from '../ss7CsvParser.js';
import { PARAPET_SECTION_KEYS, getValue, getNumericValue } from '../key-mappings.js';

/**
 * パラペット断面をパース
 * @param {Map} sections
 * @returns {Array}
 */
export function parseParapetSections(sections) {
  const section = getSection(sections, 'パラペット断面');
  if (!section || !section.data) {
    return [];
  }

  const rows = sectionToObjects(section);

  return rows
    .map((row) => {
      const symbol = getValue(row, PARAPET_SECTION_KEYS.symbol);
      if (!symbol) return null;

      const thickness = getNumericValue(row, PARAPET_SECTION_KEYS.thickness, 0);
      const rawMaterial = getValue(row, PARAPET_SECTION_KEYS.material, 'Fc21');
      const material = rawMaterial || 'Fc21';

      return {
        symbol,
        name: symbol,
        thickness,
        material,
      };
    })
    .filter(Boolean);
}

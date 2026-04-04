/**
 * sections/s-sub-beam.js
 * SS7 S小梁断面パーサー
 */

import { getSection, sectionToObjects } from '../ss7CsvParser.js';
import { S_SUB_BEAM_SECTION_KEYS, getValue } from '../key-mappings.js';

function normalizeSteelMaterial(value) {
  if (!value || value === '標準') return 'SN400B';
  return value;
}

export function parseSSubBeamSections(sections) {
  const section = getSection(sections, 'S小梁断面');
  if (!section || !section.data) return [];

  return sectionToObjects(section)
    .map((row) => {
      const symbol = getValue(row, S_SUB_BEAM_SECTION_KEYS.symbol);
      if (!symbol) return null;

      return {
        id: `sec_ssubbeam_${symbol}`,
        name: symbol,
        symbol,
        story: '',
        type: 's',
        memberType: 'beam',
        memberClass: 'subBeam',
        shape: getValue(row, S_SUB_BEAM_SECTION_KEYS.shape, 'H'),
        sectionName: getValue(row, S_SUB_BEAM_SECTION_KEYS.sectionName, ''),
        material: normalizeSteelMaterial(getValue(row, S_SUB_BEAM_SECTION_KEYS.material, 'SN400B')),
        dims: { width: 0, height: 0 },
      };
    })
    .filter(Boolean);
}

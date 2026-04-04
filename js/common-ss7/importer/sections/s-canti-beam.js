/**
 * sections/s-canti-beam.js
 * SS7 S片持梁断面パーサー
 */

import { getSection, sectionToObjects } from '../ss7CsvParser.js';
import { S_CANTI_BEAM_SECTION_KEYS, getNumericValue, getValue } from '../key-mappings.js';

function normalizeSteelMaterial(value) {
  if (!value || value === '標準') return 'SN400B';
  return value;
}

export function parseSCantileverBeamSections(sections) {
  const section = getSection(sections, 'S片持梁断面');
  if (!section || !section.data) return [];

  return sectionToObjects(section)
    .map((row) => {
      const symbol = getValue(row, S_CANTI_BEAM_SECTION_KEYS.symbol);
      if (!symbol) return null;

      return {
        id: `sec_scantibeam_${symbol}`,
        name: symbol,
        symbol,
        story: '',
        type: 's',
        memberType: 'beam',
        memberClass: 'cantilever',
        isCanti: true,
        isOutin: true,
        haunchLength: getNumericValue(row, S_CANTI_BEAM_SECTION_KEYS.haunchLength, 0),
        shape: getValue(row, S_CANTI_BEAM_SECTION_KEYS.shape, 'H'),
        sectionName:
          getValue(row, S_CANTI_BEAM_SECTION_KEYS.sectionNameRoot, '') ||
          getValue(row, S_CANTI_BEAM_SECTION_KEYS.sectionNameTip, ''),
        material: normalizeSteelMaterial(
          getValue(row, S_CANTI_BEAM_SECTION_KEYS.material, 'SN400B'),
        ),
        dims: { width: 0, height: 0 },
      };
    })
    .filter(Boolean);
}

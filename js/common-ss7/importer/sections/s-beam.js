/**
 * sections/s-beam.js - S梁断面パーサー (stub)
 *
 * ported from MatrixCalc for StbDiffViewer
 */

import { getSection, sectionToObjects } from '../ss7CsvParser.js';
import { S_BEAM_SECTION_KEYS, getValue } from '../key-mappings.js';

export function parseSBeamSections(sections) {
  const section = getSection(sections, 'S梁断面');
  if (!section || !section.data) return [];
  const rows = sectionToObjects(section);
  return rows
    .map((row) => {
      const symbol = getValue(row, S_BEAM_SECTION_KEYS.symbol);
      if (!symbol) return null;
      const story = getValue(row, S_BEAM_SECTION_KEYS.story);
      const sectionName =
        getValue(row, S_BEAM_SECTION_KEYS.sectionNameCenter, '') ||
        getValue(row, S_BEAM_SECTION_KEYS.sectionNameLeft, '');
      return {
        id: `sec_sbeam_${story}_${symbol}`,
        name: symbol,
        symbol,
        story,
        type: 's',
        memberType: 'beam',
        shape: getValue(row, S_BEAM_SECTION_KEYS.shape, 'H'),
        sectionName,
        material: getValue(row, S_BEAM_SECTION_KEYS.materialLeft, 'SN400B'),
        dims: { width: 0, height: 0 },
      };
    })
    .filter(Boolean);
}

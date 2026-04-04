/**
 * sections/brace.js - ブレース断面パーサー (stub)
 *
 * ported from MatrixCalc for StbDiffViewer
 */

import { sectionToObjects } from '../ss7CsvParser.js';
import { BRACE_SECTION_KEYS, getValue } from '../key-mappings.js';

export function parseBraceSections(sections) {
  const braceRows = [];
  for (const section of sections.values()) {
    if (!section.data) continue;
    if (
      (section.name && section.name.startsWith('鉛直ブレース断面')) ||
      section.name === 'Sブレース断面'
    ) {
      braceRows.push(...sectionToObjects(section));
    }
  }
  return braceRows.length === 0 ? [] : parseBraceRows(braceRows);
}

function parseBraceRows(rows) {
  return rows
    .map((row) => {
      const symbol = getValue(row, BRACE_SECTION_KEYS.symbol);
      if (!symbol) return null;
      const story = getValue(row, BRACE_SECTION_KEYS.story);
      return {
        id: `sec_brace_${story}_${symbol}`,
        name: symbol,
        symbol,
        story,
        type: 's',
        memberType: 'brace',
        shape: getValue(row, BRACE_SECTION_KEYS.shape, ''),
        sectionName: getValue(row, BRACE_SECTION_KEYS.sectionName, ''),
        material: getValue(row, BRACE_SECTION_KEYS.material, 'SN400B'),
        dims: { width: 0, height: 0 },
      };
    })
    .filter(Boolean);
}

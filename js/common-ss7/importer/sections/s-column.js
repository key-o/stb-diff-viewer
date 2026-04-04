/**
 * sections/s-column.js - S柱断面パーサー (stub)
 *
 * ported from MatrixCalc for StbDiffViewer
 */

import { getSection, sectionToObjects } from '../ss7CsvParser.js';
import {
  EXPOSED_COLUMN_BASE_KEYS,
  S_COLUMN_SECTION_KEYS,
  getNumericValue,
  getValue,
} from '../key-mappings.js';

function parseAnchorBolt(raw) {
  const match = String(raw || '').match(/(M\d+)\s*:\s*(.+)$/);
  if (!match) {
    return {
      name: String(raw || ''),
      kind: '',
    };
  }
  return {
    name: match[1],
    kind: match[2].trim(),
  };
}

function parseExposedColumnBases(sections) {
  const section = getSection(sections, '露出柱脚断面');
  if (!section || !section.data) return new Map();

  const rows = sectionToObjects(section);
  const result = new Map();
  for (const row of rows) {
    const floor = getValue(row, EXPOSED_COLUMN_BASE_KEYS.floor);
    const symbol = getValue(row, EXPOSED_COLUMN_BASE_KEYS.symbol);
    if (!floor || !symbol) continue;

    const anchor = parseAnchorBolt(getValue(row, EXPOSED_COLUMN_BASE_KEYS.anchorBoltName, ''));
    result.set(`${floor}_${symbol}`, {
      plate: {
        widthX: getNumericValue(row, EXPOSED_COLUMN_BASE_KEYS.plateDx, 0),
        widthY: getNumericValue(row, EXPOSED_COLUMN_BASE_KEYS.plateDy, 0),
        thickness: getNumericValue(row, EXPOSED_COLUMN_BASE_KEYS.plateThickness, 0),
        corner: getNumericValue(row, EXPOSED_COLUMN_BASE_KEYS.plateCorner, 0),
        dtX: getNumericValue(row, EXPOSED_COLUMN_BASE_KEYS.plateDtX, 0),
        dtY: getNumericValue(row, EXPOSED_COLUMN_BASE_KEYS.plateDtY, 0),
        material: getValue(row, EXPOSED_COLUMN_BASE_KEYS.plateMaterial, 'SN400B'),
        holeDiameter: getNumericValue(row, EXPOSED_COLUMN_BASE_KEYS.holeDiameter, 0),
      },
      anchorBolt: {
        name: anchor.name,
        kind: anchor.kind,
        total: getNumericValue(row, EXPOSED_COLUMN_BASE_KEYS.anchorBoltTotal, 0),
        countX: getNumericValue(row, EXPOSED_COLUMN_BASE_KEYS.anchorBoltCountX, 0),
        countY: getNumericValue(row, EXPOSED_COLUMN_BASE_KEYS.anchorBoltCountY, 0),
        length: getNumericValue(row, EXPOSED_COLUMN_BASE_KEYS.anchorBoltLength, 0),
        effectiveLength: getNumericValue(
          row,
          EXPOSED_COLUMN_BASE_KEYS.anchorBoltEffectiveLength,
          0,
        ),
        material: getValue(row, EXPOSED_COLUMN_BASE_KEYS.anchorBoltMaterial, 'SNR400'),
        hardware: getValue(row, EXPOSED_COLUMN_BASE_KEYS.baseHardware, ''),
      },
      foundation: {
        widthX: getNumericValue(row, EXPOSED_COLUMN_BASE_KEYS.foundationDx, 0),
        widthY: getNumericValue(row, EXPOSED_COLUMN_BASE_KEYS.foundationDy, 0),
        height: getNumericValue(row, EXPOSED_COLUMN_BASE_KEYS.foundationHeight, 0),
      },
    });
  }
  return result;
}

export function parseSColumnSections(sections) {
  const section = getSection(sections, 'S柱断面');
  if (!section || !section.data) return [];
  const rows = sectionToObjects(section);
  const exposedBaseMap = parseExposedColumnBases(sections);
  return rows
    .map((row) => {
      const symbol = getValue(row, S_COLUMN_SECTION_KEYS.symbol);
      if (!symbol) return null;
      const floor = getValue(row, S_COLUMN_SECTION_KEYS.floor);
      const sectionName = getValue(row, S_COLUMN_SECTION_KEYS.sectionName, '');
      return {
        id: `sec_scol_${floor}_${symbol}`,
        name: symbol,
        symbol,
        floor,
        story: floor,
        type: 's',
        memberType: 'column',
        shape: getValue(row, S_COLUMN_SECTION_KEYS.shape, 'H'),
        sectionName,
        material: getValue(row, S_COLUMN_SECTION_KEYS.material, 'SN400B'),
        dims: { width: 0, height: 0 },
        exposedBase: exposedBaseMap.get(`${floor}_${symbol}`) || null,
      };
    })
    .filter(Boolean);
}

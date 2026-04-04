/**
 * members/cantilever-girder.js
 * SS7 片持梁配置パーサー
 */

import { getSection, sectionToObjects } from '../ss7CsvParser.js';
import { CANTILEVER_GIRDER_PLACEMENT_KEYS, getNumericValue, getValue } from '../key-mappings.js';
import { inferAxisSystem, parseAxisIntersectionString } from '../axis-utils.js';

export function parseCantileverGirderPlacements(sections) {
  const section = getSection(sections, '片持梁配置');
  if (!section || !section.data) return [];

  const axisSystem = inferAxisSystem(sections);
  return sectionToObjects(section)
    .map((row) => {
      const story = getValue(row, CANTILEVER_GIRDER_PLACEMENT_KEYS.story);
      const axis = parseAxisIntersectionString(
        getValue(row, CANTILEVER_GIRDER_PLACEMENT_KEYS.axis, ''),
        axisSystem,
      );
      const symbol = getValue(row, CANTILEVER_GIRDER_PLACEMENT_KEYS.symbol);
      if (!story || !axis || !symbol) return null;

      return {
        story,
        xAxis: axis.xAxis,
        yAxis: axis.yAxis,
        direction: getValue(row, CANTILEVER_GIRDER_PLACEMENT_KEYS.direction, ''),
        symbol,
        length: getNumericValue(row, CANTILEVER_GIRDER_PLACEMENT_KEYS.length, 0),
        offsetXY: getNumericValue(row, CANTILEVER_GIRDER_PLACEMENT_KEYS.offsetXY, 0),
        offsetZ: getNumericValue(row, CANTILEVER_GIRDER_PLACEMENT_KEYS.offsetZ, 0),
        type: 'cantileverGirder',
      };
    })
    .filter(Boolean);
}

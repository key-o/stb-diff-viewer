/**
 * members/cantilever-slab.js
 * SS7 片持床配置パーサー
 */

import { getSection, sectionToObjects } from '../ss7CsvParser.js';
import {
  CANTILEVER_SLAB_PLACEMENT_KEYS,
  CANTILEVER_SLAB_SHAPE_KEYS,
  getIntValue,
  getNumericValue,
  getValue,
} from '../key-mappings.js';
import { inferAxisSystem, parseFrameAxisString } from '../axis-utils.js';

/**
 * 片持床形状配置をパース（跳出し方向・長さ）
 * @param {Map} sections
 * @returns {Array<{story,frame,frameAxis,startAxis,endAxis,level,counter,direction,length,tipMovement}>}
 */
export function parseCantileverSlabShapes(sections) {
  const section = getSection(sections, '片持床形状配置');
  if (!section || !section.data) return [];

  const axisSystem = inferAxisSystem(sections);
  return sectionToObjects(section)
    .map((row) => {
      const story = getValue(row, CANTILEVER_SLAB_SHAPE_KEYS.story);
      const frame = parseFrameAxisString(
        getValue(row, CANTILEVER_SLAB_SHAPE_KEYS.frameAxis, ''),
        axisSystem,
      );
      if (!story || !frame) return null;

      return {
        story,
        frame: frame.frame,
        frameAxis: frame.frameAxis,
        startAxis: frame.startAxis,
        endAxis: frame.endAxis,
        level: getValue(row, CANTILEVER_SLAB_SHAPE_KEYS.level, '上'),
        counter: getNumericValue(row, CANTILEVER_SLAB_SHAPE_KEYS.counter, 1),
        direction: getValue(row, CANTILEVER_SLAB_SHAPE_KEYS.direction, ''),
        length: getNumericValue(row, CANTILEVER_SLAB_SHAPE_KEYS.length, 0),
        tipMovement: getNumericValue(row, CANTILEVER_SLAB_SHAPE_KEYS.tipMovement, 0),
        rangeLeft: getNumericValue(row, CANTILEVER_SLAB_SHAPE_KEYS.rangeLeft, 0),
        rangeRight: getNumericValue(row, CANTILEVER_SLAB_SHAPE_KEYS.rangeRight, 0),
      };
    })
    .filter(Boolean);
}

export function parseCantileverSlabPlacements(sections) {
  const section = getSection(sections, '片持床配置');
  if (!section || !section.data) return [];

  const axisSystem = inferAxisSystem(sections);
  return sectionToObjects(section)
    .map((row) => {
      const story = getValue(row, CANTILEVER_SLAB_PLACEMENT_KEYS.story);
      const frame = parseFrameAxisString(
        getValue(row, CANTILEVER_SLAB_PLACEMENT_KEYS.frameAxis, ''),
        axisSystem,
      );
      const symbol = getValue(row, CANTILEVER_SLAB_PLACEMENT_KEYS.symbol);
      if (!story || !frame || !symbol) return null;

      const index1 = getIntValue(row, CANTILEVER_SLAB_PLACEMENT_KEYS.index1, 0);
      return {
        story,
        frame: frame.frame,
        frameAxis: frame.frameAxis,
        startAxis: frame.startAxis,
        endAxis: frame.endAxis,
        symbol,
        level: getValue(row, CANTILEVER_SLAB_PLACEMENT_KEYS.level, '上'),
        counter: getNumericValue(row, CANTILEVER_SLAB_PLACEMENT_KEYS.counter, 0),
        indices: [index1, 0, 0, 0, 0],
        regionNo: getNumericValue(row, CANTILEVER_SLAB_PLACEMENT_KEYS.regionNo, 0),
        angle: getNumericValue(row, CANTILEVER_SLAB_PLACEMENT_KEYS.angle, 0),
        type: 'cantileverSlab',
      };
    })
    .filter(Boolean);
}

/**
 * members/sub-beam.js
 * SS7 小梁配置パーサー
 */

import { getSection, sectionToObjects } from '../ss7CsvParser.js';
import { SUB_BEAM_PLACEMENT_KEYS, getValue, getNumericValue } from '../key-mappings.js';
import { parseFrameAxisString, parse4AxisGridRange, parseFlipString } from './utils.js';
import { inferAxisSystem } from '../axis-utils.js';

const log = {
  debug: (...args) => console.debug('[SS7SubBeam]', ...args),
  warn: (...args) => console.warn('[SS7SubBeam]', ...args),
};

/**
 * 小梁配置を抽出
 *
 * SS7形式では2種類のフォーマットがある:
 * - 4軸形式（グリッド範囲形式）: 層, 面(Y1-Y2-X1-X2), 二重, 1次～5次, 床組領域No, 符号, 反転, 自動判定
 * - 3軸形式（フレーム形式）: 層, フレーム-軸-軸, 符号, オフセット, 反転, 二重
 *
 * @param {Map} sections - パース済みセクション
 * @returns {Array} 小梁配置の配列
 */
export function parseSubBeamPlacements(sections) {
  const section = getSection(sections, '小梁配置');
  if (!section || !section.data) {
    return [];
  }
  const axisSystem = inferAxisSystem(sections);

  const rows = sectionToObjects(section);
  const result = [];

  for (const row of rows) {
    const story = getValue(row, SUB_BEAM_PLACEMENT_KEYS.story);

    // 4軸形式の場合は「面」キー、3軸形式の場合は「フレーム-軸-軸」キーを使用
    const surfaceStr = getValue(row, SUB_BEAM_PLACEMENT_KEYS.surface, '');
    const frameAxisStr = getValue(row, SUB_BEAM_PLACEMENT_KEYS.frameAxis, '');
    const gridStr = surfaceStr || frameAxisStr;

    // まず4軸形式（グリッド範囲）を試す
    const grid4Axis = parse4AxisGridRange(gridStr, axisSystem);
    if (grid4Axis) {
      const level = getValue(row, SUB_BEAM_PLACEMENT_KEYS.level, '上');
      const indices = [
        getNumericValue(row, SUB_BEAM_PLACEMENT_KEYS.index1, 0),
        getNumericValue(row, SUB_BEAM_PLACEMENT_KEYS.index2, 0),
        getNumericValue(row, SUB_BEAM_PLACEMENT_KEYS.index3, 0),
        getNumericValue(row, SUB_BEAM_PLACEMENT_KEYS.index4, 0),
        getNumericValue(row, SUB_BEAM_PLACEMENT_KEYS.index5, 0),
      ];
      const regionNo = getNumericValue(row, SUB_BEAM_PLACEMENT_KEYS.regionNo, 1);
      const symbol = getValue(row, SUB_BEAM_PLACEMENT_KEYS.symbol, '');
      const flipStr = getValue(row, SUB_BEAM_PLACEMENT_KEYS.flip4);
      const autoDirection = getValue(row, SUB_BEAM_PLACEMENT_KEYS.autoDirection, '自動判定');

      if (symbol === 'ダミー') continue;

      result.push({
        story,
        gridRange: gridStr.trim(),
        xStart: grid4Axis.xStart,
        xEnd: grid4Axis.xEnd,
        yStart: grid4Axis.yStart,
        yEnd: grid4Axis.yEnd,
        level,
        indices,
        regionNo,
        symbol,
        flip: parseFlipString(flipStr),
        autoDirection,
        format: '4axis',
        type: 'subbeam',
      });
    } else {
      // 3軸形式を試す
      const parsed = parseFrameAxisString(gridStr, axisSystem);
      if (!parsed) {
        log.warn(`小梁配置のフレーム解析に失敗: ${gridStr}`);
        continue;
      }

      const symbol = getValue(row, SUB_BEAM_PLACEMENT_KEYS.symbol);
      const offset = getNumericValue(row, SUB_BEAM_PLACEMENT_KEYS.offset, 0);
      const flipStr = getValue(row, SUB_BEAM_PLACEMENT_KEYS.flip3);
      const level = getValue(row, SUB_BEAM_PLACEMENT_KEYS.level, '上');

      if (symbol === 'ダミー') continue;

      result.push({
        story,
        frame: parsed.frame,
        frameAxis: parsed.frameAxis,
        startAxis: parsed.startAxis,
        endAxis: parsed.endAxis,
        direction: parsed.direction,
        symbol,
        offset,
        flip: parseFlipString(flipStr),
        level,
        format: '3axis',
        type: 'subbeam',
      });
    }
  }

  log.debug(`[parseSubBeamPlacements] ${result.length}件の小梁配置をパースしました`);
  return result;
}

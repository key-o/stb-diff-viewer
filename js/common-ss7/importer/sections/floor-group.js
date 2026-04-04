/**
 * sections/floor-group.js
 * SS7 床組形状・床組配置パーサー
 */

import { getSection, sectionToObjects } from '../ss7CsvParser.js';
import {
  FLOOR_GROUP_SHAPE_KEYS,
  FLOOR_GROUP_LAYOUT_KEYS,
  getValue,
  getNumericValue,
  getBoolValue,
} from '../key-mappings.js';
import { parse4AxisGridRange } from '../members/utils.js';
import { inferAxisSystem } from '../axis-utils.js';

/**
 * 床組形状を抽出
 *
 * CSV列構造（位置固定）:
 *   0:ID, 1:小梁の架け方, 2:小梁本数/X, 3:Y,
 *   4-13: 床組形状 1-10, 14-23: スパンX 1-10, 24-33: スパンY 1-10,
 *   34: 床組角度
 *
 * 重複ヘッダー（"2","3",...が複数グループで出現）の影響を避けるため、
 * 位置ベースでアクセスする。
 *
 * @param {Map} sections - パース済みセクション
 * @returns {Array<{id: string, direction: string, subBeamCountX: number, subBeamCountY: number,
 *   spansX: number[], spansY: number[], shapeRefs: string[], angle: number}>}
 */
export function parseFloorGroupShapes(sections) {
  const section = getSection(sections, '床組形状');
  if (!section || !section.data) return [];

  // キーベースの列では重複ヘッダーの _N suffix に依存してしまうため、
  // ヘッダーとデータ配列を直接位置参照する。
  // ただしID/方向/本数は固定位置の一意ヘッダーなのでキーベースでも可。
  const rows = sectionToObjects(section);
  const rawData = section.data; // 生データ配列
  const result = [];

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const raw = rawData[ri];

    const id = getValue(row, FLOOR_GROUP_SHAPE_KEYS.id);
    if (!id) continue;

    // 位置ベースで繰り返しグループを取得
    // 床組形状参照: columns 4-13
    // 位置情報を保持する: 空スロットは null、末尾の null はトリム
    // これにより shapeRefs[i] が null のサブパネルはリーフ（小梁なし）として扱われる
    const rawRefs = [];
    let lastNonZeroIdx = -1;
    for (let i = 4; i <= 13; i++) {
      const v = raw[i];
      const hasRef = v && v !== '0' && v.trim() !== '';
      rawRefs.push(hasRef ? String(v) : null);
      if (hasRef) lastNonZeroIdx = rawRefs.length - 1;
    }
    const shapeRefs = lastNonZeroIdx >= 0 ? rawRefs.slice(0, lastNonZeroIdx + 1) : [];

    // スパンX: columns 14-23
    const spansX = [];
    for (let i = 14; i <= 23; i++) {
      const v = parseFloat(raw[i]) || 0;
      if (v > 0) spansX.push(v);
    }

    // スパンY: columns 24-33
    const spansY = [];
    for (let i = 24; i <= 33; i++) {
      const v = parseFloat(raw[i]) || 0;
      if (v > 0) spansY.push(v);
    }

    result.push({
      id: String(id),
      direction: getValue(row, FLOOR_GROUP_SHAPE_KEYS.direction, ''),
      subBeamCountX: getNumericValue(row, FLOOR_GROUP_SHAPE_KEYS.subBeamCountX, 0),
      subBeamCountY: getNumericValue(row, FLOOR_GROUP_SHAPE_KEYS.subBeamCountY, 0),
      spansX,
      spansY,
      shapeRefs,
      angle: raw[34] ? parseFloat(raw[34]) || 0 : 0,
    });
  }

  return result;
}

/**
 * 床組配置を抽出
 * @param {Map} sections - パース済みセクション
 * @returns {Array<{story: string, xStart: string, xEnd: string, yStart: string, yEnd: string,
 *   shapeId: string, flipX: boolean, flipY: boolean, angle: number, level: string}>}
 */
export function parseFloorGroupLayouts(sections) {
  const section = getSection(sections, '床組配置');
  if (!section || !section.data) return [];

  const axisSystem = inferAxisSystem(sections);
  const rows = sectionToObjects(section);
  const result = [];

  for (const row of rows) {
    const story = getValue(row, FLOOR_GROUP_LAYOUT_KEYS.story);
    const gridRangeStr = getValue(row, FLOOR_GROUP_LAYOUT_KEYS.gridRange, '');
    const shapeId = getValue(row, FLOOR_GROUP_LAYOUT_KEYS.shapeId);

    if (!story || !shapeId) continue;

    const grid = parse4AxisGridRange(gridRangeStr, axisSystem);
    if (!grid) continue;

    result.push({
      story,
      xStart: grid.xStart,
      xEnd: grid.xEnd,
      yStart: grid.yStart,
      yEnd: grid.yEnd,
      shapeId: String(shapeId),
      flipX: getBoolValue(row, FLOOR_GROUP_LAYOUT_KEYS.flipX),
      flipY: getBoolValue(row, FLOOR_GROUP_LAYOUT_KEYS.flipY),
      angle: getNumericValue(row, FLOOR_GROUP_LAYOUT_KEYS.angle, 0),
      level: getValue(row, FLOOR_GROUP_LAYOUT_KEYS.level, '上'),
    });
  }

  return result;
}

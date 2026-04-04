/**
 * members/column.js
 * SS7 柱配置パーサー
 *
 * ported from MatrixCalc for StbDiffViewer
 */

import { getSection, sectionToObjects } from '../ss7CsvParser.js';
import {
  COLUMN_PLACEMENT_KEYS,
  CONTINUOUS_COLUMN_KEYS,
  getValue,
  getBoolValue,
} from '../key-mappings.js';
import { inferAxisSystem, parseAxisIntersectionString } from '../axis-utils.js';

const log = {
  debug: (...args) => console.debug('[SS7Column]', ...args),
  warn: (...args) => console.warn('[SS7Column]', ...args),
  error: (...args) => console.error('[SS7Column]', ...args),
};

/**
 * 柱配置を抽出
 * @param {Map} sections - パース済みセクション
 * @returns {Array}
 */
export function parseColumnPlacements(sections) {
  const section = getSection(sections, '柱配置');
  if (!section || !section.data) {
    return [];
  }
  const axisSystem = inferAxisSystem(sections);

  const rows = sectionToObjects(section);
  const result = [];

  for (const row of rows) {
    // キーベースアクセス
    const floor = getValue(row, COLUMN_PLACEMENT_KEYS.floor);
    const axisStr = getValue(row, COLUMN_PLACEMENT_KEYS.axis, '');
    const symbol = getValue(row, COLUMN_PLACEMENT_KEYS.symbol);
    const flipX = getBoolValue(row, COLUMN_PLACEMENT_KEYS.flipX, ['YES']);
    const flipY = getBoolValue(row, COLUMN_PLACEMENT_KEYS.flipY, ['YES']);

    // 軸名を解析
    const parsedAxes = parseAxisIntersectionString(axisStr, axisSystem);
    if (!parsedAxes) {
      log.warn(`柱配置の軸解析に失敗: ${axisStr}`);
      continue;
    }

    result.push({
      floor: floor,
      xAxis: parsedAxes.xAxis,
      yAxis: parsedAxes.yAxis,
      symbol: symbol,
      flipX: flipX,
      flipY: flipY,
      type: 'column',
    });
  }

  return result;
}

/**
 * 通し柱情報を抽出
 * @param {Map} sections
 * @returns {Map<string, boolean>} 軸-軸 → 通し柱フラグ
 */
/**
 * フロアラベルを正規化する（例: "2MFL" → "2M", "2MF" → "2M", "RFL" → "R"）
 * Generator側の normalizeSectionFloorLabel と同じ変換ルール。
 */
function normalizeFloorLabel(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/MFL$/, 'M')
    .replace(/FL$/, '')
    .replace(/MF$/, 'M')
    .replace(/F$/, '');
}

/**
 * 通し柱情報を抽出
 * @param {Map} sections
 * @returns {Set<string>} "正規化フロア_xAxis_yAxis" の組み合わせセット（xAxis/yAxis両順）
 */
export function parseContinuousColumns(sections) {
  const section = getSection(sections, '通し柱');
  if (!section || !section.data) {
    return new Set();
  }

  const rows = sectionToObjects(section);
  const result = new Set();

  for (const row of rows) {
    const story = getValue(row, CONTINUOUS_COLUMN_KEYS.story);
    const axisStr = getValue(row, CONTINUOUS_COLUMN_KEYS.axis, '');
    const isContinuous = getBoolValue(row, CONTINUOUS_COLUMN_KEYS.isContinuous, ['する']);

    if (!isContinuous || !story || !axisStr.trim()) continue;

    const normalizedFloor = normalizeFloorLabel(story);
    // "X3 - Y2" → ["X3", "Y2"]
    const parts = axisStr
      .split('-')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length !== 2) continue;
    const [a, b] = parts;
    result.add(`${normalizedFloor}_${a}_${b}`);
    result.add(`${normalizedFloor}_${b}_${a}`);
  }

  return result;
}

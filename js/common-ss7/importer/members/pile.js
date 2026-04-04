/**
 * members/pile.js - 杭配置パーサー
 *
 * 責務: SS7 CSV から杭基礎配置をパース
 *
 * 対象セクション: '杭基礎配置'
 *
 * ported from MatrixCalc for StbDiffViewer
 */

import { getSection } from '../ss7CsvParser.js';
import { inferAxisSystem, parseAxisIntersectionString } from '../axis-utils.js';

const log = {
  debug: (...args) => console.debug('[SS7PilePlacement]', ...args),
  warn: (...args) => console.warn('[SS7PilePlacement]', ...args),
};

/**
 * 杭基礎配置をパース
 *
 * ヘッダー: 層, 軸-軸, 基礎符号, 基礎底面, 向き, 回転角
 *
 * @param {Map} sections - パース済みセクション
 * @returns {Array<Object>} 杭配置オブジェクト配列
 */
export function parsePilePlacements(sections) {
  const section = getSection(sections, '杭基礎配置');
  if (!section || !section.data) {
    return [];
  }

  const axisSystem = inferAxisSystem(sections);
  const result = [];

  for (const row of section.data) {
    const story = (row[0] || '').trim();
    const axisStr = (row[1] || '').trim();
    const foundationSymbol = (row[2] || '').trim();
    const baseLevel = parseFloat(row[3]);
    const orientation = (row[4] || '').trim();
    const rotation = parseFloat(row[5]) || 0;

    if (!story || !axisStr || !foundationSymbol) continue;

    const parsedAxes = parseAxisIntersectionString(axisStr, axisSystem);
    if (!parsedAxes) {
      log.warn(`杭基礎配置の軸解析に失敗: "${axisStr}"`);
      continue;
    }

    result.push({
      story,
      xAxis: parsedAxes.xAxis,
      yAxis: parsedAxes.yAxis,
      foundationSymbol,
      baseLevel: isNaN(baseLevel) ? 0 : baseLevel,
      orientation,
      rotation,
    });
  }

  log.debug(`parsePilePlacements: ${result.length} 件`);
  return result;
}

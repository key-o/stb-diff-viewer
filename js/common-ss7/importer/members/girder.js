/**
 * members/girder.js
 * SS7 大梁配置パーサー
 *
 * ported from MatrixCalc for StbDiffViewer
 */

import { getSection, sectionToObjects } from '../ss7CsvParser.js';
import { GIRDER_PLACEMENT_KEYS, getValue } from '../key-mappings.js';
import { parseFrameAxisString, parseFlipString } from './utils.js';
import { inferAxisSystem } from '../axis-utils.js';

const log = {
  debug: (...args) => console.debug('[SS7Girder]', ...args),
  warn: (...args) => console.warn('[SS7Girder]', ...args),
  error: (...args) => console.error('[SS7Girder]', ...args),
};

/**
 * 大梁配置を抽出
 * @param {Map} sections - パース済みセクション
 * @returns {Array}
 */
export function parseGirderPlacements(sections) {
  const section = getSection(sections, '大梁配置');
  if (!section || !section.data) {
    return [];
  }
  const axisSystem = inferAxisSystem(sections);

  const rows = sectionToObjects(section);
  const result = [];

  for (const row of rows) {
    // キーベースアクセス
    const story = getValue(row, GIRDER_PLACEMENT_KEYS.story);
    const frameStr = getValue(row, GIRDER_PLACEMENT_KEYS.frameAxis, '');
    const symbol = getValue(row, GIRDER_PLACEMENT_KEYS.symbol);
    const flipStr = getValue(row, GIRDER_PLACEMENT_KEYS.flip, '');

    // ダミー梁はスキップ
    if (symbol === 'ダミー') {
      continue;
    }

    // フレーム-軸-軸を解析
    const parsed = parseFrameAxisString(frameStr, axisSystem);
    if (!parsed) {
      log.warn(`大梁配置のフレーム解析に失敗: ${frameStr}`);
      continue;
    }

    result.push({
      story: story,
      frame: parsed.frame, // フレーム軸 (Y3, X2, ...)
      frameAxis: parsed.frameAxis,
      startAxis: parsed.startAxis, // 開始軸
      endAxis: parsed.endAxis, // 終了軸
      symbol: symbol,
      flip: parseFlipString(flipStr),
      type: 'girder',
    });
  }

  return result;
}

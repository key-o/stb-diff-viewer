/**
 * members/utils.js
 * 部材配置パーサー共通ユーティリティ
 *
 * ported from MatrixCalc for StbDiffViewer
 */

import {
  parseFrameAxisString as parseFrameAxisStringInternal,
  parse4AxisGridRange as parse4AxisGridRangeInternal,
} from '../axis-utils.js';

/**
 * フレーム-軸-軸文字列を解析
 * @param {string} str - " Y3 - X3 - X4" のような文字列
 * @param {Object|null} [axisSystem]
 * @returns {Object|null} {frame, startAxis, endAxis, direction}
 */
export function parseFrameAxisString(str, axisSystem = null) {
  return parseFrameAxisStringInternal(str, axisSystem);
}

/**
 * 4軸グリッド範囲文字列を解析
 * @param {string} str - " Y2 - Y3 - X2 - X3" のような文字列
 * @param {Object|null} [axisSystem]
 * @returns {Object|null} { yStart, yEnd, xStart, xEnd }
 */
export function parse4AxisGridRange(str, axisSystem = null) {
  return parse4AxisGridRangeInternal(str, axisSystem);
}

/**
 * 反転配置文字列を解析
 * @param {string} str - "左-右", "右-左" など
 * @returns {Object}
 */
export function parseFlipString(str) {
  if (!str) {
    return { left: false, right: false };
  }

  return {
    left: str.includes('右-左'),
    right: str.includes('左-右'),
  };
}

/**
 * 階名から層名への変換マップを作成
 * 柱配置は階名(1F, 2F)、梁配置は層名(1FL, 2FL)を使用する
 * @param {Array} stories - 層情報
 * @returns {Map<string, string>} 階名 → 層名
 */
export function createFloorToStoryMap(stories) {
  const map = new Map();

  for (const story of stories) {
    // 層名から階名を推定
    // 1FL → 1F, 2FL → 2F, RFL → RF, 2MFL → 2MF
    let floorName = story.name;
    floorName = floorName.replace(/FL$/, 'F').replace(/MFL$/, 'MF');
    map.set(floorName, story.name);
  }

  return map;
}

/**
 * 層名から上下の層を取得
 * 柱は階の上下に渡って配置される
 * @param {string} floorName - 階名
 * @param {Array} stories - 層情報（上から下の順）
 * @param {Map} floorToStoryMap
 * @returns {Object} {bottomStory, topStory}
 */
export function getColumnStories(floorName, stories, floorToStoryMap) {
  // 階名に対応する層を見つける
  // 1F階の柱は 1FL → 2FL の間
  // 2F階の柱は 2FL → RFL の間

  // 柱の底面は階名に対応する層
  const bottomStoryName = floorToStoryMap.get(floorName);
  if (!bottomStoryName) {
    return null;
  }

  // 層リストで下の層のインデックスを探す
  const bottomIndex = stories.findIndex((s) => s.name === bottomStoryName);
  if (bottomIndex < 0) {
    return null;
  }

  // 上の層は1つ上（インデックスは1つ小さい）
  const topIndex = bottomIndex - 1;
  if (topIndex < 0) {
    return null;
  }

  return {
    bottomStory: stories[bottomIndex],
    topStory: stories[topIndex],
  };
}

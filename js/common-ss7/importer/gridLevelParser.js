/**
 * gridLevelParser.js
 * SS7 CSVからグリッド（軸）とレベル（層）情報を抽出する
 *
 * ported from MatrixCalc for StbDiffViewer
 */

import { getSection, sectionToObjects } from './ss7CsvParser.js';
import {
  inferAxisSystem,
  parseAxisIntersectionString,
  parseFrameAxisString,
} from './axis-utils.js';
import {
  STORY_KEYS,
  FLOOR_KEYS,
  SPAN_KEYS,
  STORY_HEIGHT_KEYS,
  STRUCTURE_TYPE_KEYS,
  NODE_VERTICAL_MOVEMENT_KEYS,
  NODE_UNIFICATION_KEYS,
  AXIS_DEVIATION_KEYS,
  MEMBER_ECCENTRICITY_KEYS,
  GIRDER_LEVEL_ADJUSTMENT_KEYS,
  getValue,
  getNumericValue,
} from './key-mappings.js';

const log = {
  debug: (...args) => console.debug('[SS7GridLevel]', ...args),
  warn: (...args) => console.warn('[SS7GridLevel]', ...args),
  error: (...args) => console.error('[SS7GridLevel]', ...args),
};

/**
 * 軸情報を抽出
 * @param {Map} sections - パース済みセクション
 * @returns {Object} {xAxes: Array, yAxes: Array}
 */
export function parseAxes(sections) {
  const axisSystem = inferAxisSystem(sections);
  const spanSection = getSection(sections, '基準スパン長');

  if (axisSystem.xAxisNames.length === 0 && axisSystem.yAxisNames.length === 0) {
    log.warn('軸名セクションが見つかりません、または軸分類に失敗しました');
    return { xAxes: [], yAxes: [] };
  }

  // キーベースアクセス: スパン長を取得してマップを作成
  const spanMap = new Map();
  if (spanSection && spanSection.data) {
    const spanRows = sectionToObjects(spanSection);
    for (const row of spanRows) {
      const spanKey = (getValue(row, SPAN_KEYS.axisRange, '') || '').trim();
      const spanValue = getNumericValue(row, SPAN_KEYS.length, 0);
      if (spanKey) {
        // 軸名は normalizeAxisName() で大文字化されるため、スパンキーも大文字に統一して一致させる
        spanMap.set(spanKey.toUpperCase(), spanValue);
      }
    }
  }

  // X軸の座標を計算
  const xAxes = calculateAxisPositions(axisSystem.xAxisNames, spanMap);

  // Y軸の座標を計算
  const yAxes = calculateAxisPositions(axisSystem.yAxisNames, spanMap);

  return { xAxes, yAxes };
}

/**
 * 軸位置を計算
 * @param {string[]} axisNames - 軸名の配列
 * @param {Map} spanMap - スパン長のマップ
 * @returns {Array} 軸情報の配列
 */
function calculateAxisPositions(axisNames, spanMap) {
  const axes = [];
  let position = 0;

  // 軸名をソート（X1, X2, X3... または Y1, Y1a, Y2...）
  const sortedNames = sortAxisNames(axisNames);

  for (let i = 0; i < sortedNames.length; i++) {
    const name = sortedNames[i];

    axes.push({
      id: `axis_${name}`,
      name: name,
      position: position, // mm
    });

    // 次の軸との間のスパン長を取得
    if (i < sortedNames.length - 1) {
      const nextName = sortedNames[i + 1];
      // 様々なハイフン/マイナス文字に対応
      // U+002D: HYPHEN-MINUS (-)
      // U+2212: MINUS SIGN (−)
      // U+FF0D: FULLWIDTH HYPHEN-MINUS (－)
      // 順方向: name-nextName
      const spanKeyHyphen = `${name}-${nextName}`;
      const spanKeyMinus = `${name}−${nextName}`;
      const spanKeyFullwidth = `${name}－${nextName}`;
      // 逆方向: nextName-name （SS7のY軸スパンは降順で定義されている場合がある）
      const spanKeyHyphenRev = `${nextName}-${name}`;
      const spanKeyMinusRev = `${nextName}−${name}`;
      const spanKeyFullwidthRev = `${nextName}－${name}`;

      let span =
        spanMap.get(spanKeyHyphen) ||
        spanMap.get(spanKeyMinus) ||
        spanMap.get(spanKeyFullwidth) ||
        spanMap.get(spanKeyHyphenRev) ||
        spanMap.get(spanKeyMinusRev) ||
        spanMap.get(spanKeyFullwidthRev) ||
        0;

      // スペース付きのキーも試す
      if (span === 0) {
        for (const [key, value] of spanMap) {
          const cleanKey = key.replace(/\s+/g, '');
          if (
            cleanKey === spanKeyHyphen.replace(/\s+/g, '') ||
            cleanKey === spanKeyMinus.replace(/\s+/g, '') ||
            cleanKey === spanKeyFullwidth.replace(/\s+/g, '') ||
            cleanKey === spanKeyHyphenRev.replace(/\s+/g, '') ||
            cleanKey === spanKeyMinusRev.replace(/\s+/g, '') ||
            cleanKey === spanKeyFullwidthRev.replace(/\s+/g, '')
          ) {
            span = value;
            break;
          }
        }
      }
      position += span;
    }
  }

  return axes;
}

/**
 * 軸名をソート（X1, X2, X3... または Y1, Y1a, Y2...）
 * @param {string[]} names
 * @returns {string[]}
 */
function sortAxisNames(names) {
  return [...names].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }),
  );
}

/**
 * 層情報を抽出
 * @param {Map} sections - パース済みセクション
 * @returns {Array} 層情報の配列
 */
export function parseStories(sections) {
  const storySection = getSection(sections, '層名');
  const floorSection = getSection(sections, '階名');
  const heightSection = getSection(sections, '標準階高');
  const structureSection = getSection(sections, '各層主体構造');

  if (!storySection) {
    log.warn('層名セクションが見つかりません');
    return [];
  }

  // キーベースアクセス: 層名を抽出
  const storyRows = sectionToObjects(storySection);
  const storyNames = storyRows.map((row) => getValue(row, STORY_KEYS.name)).filter(Boolean);

  // キーベースアクセス: 階高マップを作成（階名→階高）
  const heightMap = new Map();
  if (heightSection && heightSection.data) {
    const heightRows = sectionToObjects(heightSection);
    for (const row of heightRows) {
      const floorName = getValue(row, STORY_HEIGHT_KEYS.floor);
      const height = getNumericValue(row, STORY_HEIGHT_KEYS.height, 0);
      if (floorName) {
        heightMap.set(floorName, height);
      }
    }
  }

  // キーベースアクセス: 階名を抽出（上から下の順）
  const floorNames = floorSection
    ? sectionToObjects(floorSection)
        .map((row) => getValue(row, FLOOR_KEYS.name))
        .filter(Boolean)
    : [];

  // キーベースアクセス: 主体構造マップを作成（層名→構造種別）
  const structureMap = new Map();
  if (structureSection && structureSection.data) {
    const structureRows = sectionToObjects(structureSection);
    for (const row of structureRows) {
      const storyName = getValue(row, STRUCTURE_TYPE_KEYS.story);
      const structure = getValue(row, STRUCTURE_TYPE_KEYS.type); // S, RC, SRC など
      if (storyName) {
        structureMap.set(storyName, structure);
      }
    }
  }

  // 層名は上から下の順なので逆順にする（下から上へ）
  const reversedStories = [...storyNames].reverse();
  const reversedFloors = [...floorNames].reverse();

  // 地上階の基準点を見つける（1SL, 1FL, または最初の地上階）
  // 地下階はBで始まる（B1SL, B1FL, B2SL等）
  const groundLevelIndex = findGroundLevelIndex(reversedStories);

  // まず全ての層に相対的な高さを設定
  const stories = [];
  const heights = [];
  let cumulativeHeight = 0;

  for (let i = 0; i < reversedStories.length; i++) {
    heights.push(cumulativeHeight);

    // 次の層への階高を加算
    if (i < reversedFloors.length) {
      const floorName = reversedFloors[i];
      const floorHeight = heightMap.get(floorName) || 0;
      cumulativeHeight += floorHeight;
    }
  }

  // 参照STBでは基準層が +100mm シフトしているため、同じ基準を採用する。
  // RC2 系サンプルで全層一律 -100mm の差分が出るのを防ぐ。
  const storyBaseOffset = 100;

  // 地上階（1SL/1FL）を基準として高さを調整
  const groundLevelHeight = heights[groundLevelIndex] || 0;

  for (let i = 0; i < reversedStories.length; i++) {
    const storyName = reversedStories[i];
    const structure = structureMap.get(storyName) || 'S';
    const adjustedHeight = heights[i] - groundLevelHeight;

    stories.push({
      id: `story_${storyName}`,
      name: storyName,
      height: adjustedHeight + storyBaseOffset, // mm（地上階基準、地下は負の値）
      kind_structure: structure,
    });
  }

  // 上から下の順に戻す
  const result = stories.reverse();

  // デバッグログ
  log.debug('[parseStories] 層レベル:');
  for (const s of result) {
    log.debug(`  ${s.name}: ${s.height}mm`);
  }

  return result;
}

/**
 * 地上階の基準インデックスを見つける
 * 層は下から上の順（reversedStories）で渡される
 * @param {string[]} reversedStories - 下から上の順の層名配列
 * @returns {number} 地上階のインデックス（見つからない場合は0）
 */
function findGroundLevelIndex(reversedStories) {
  // 1SL, 1FL を探す（地上1階の床レベル）
  for (let i = 0; i < reversedStories.length; i++) {
    const name = reversedStories[i];
    if (name === '1SL' || name === '1FL') {
      return i;
    }
  }

  // 見つからない場合、最初の非地下階を探す
  for (let i = 0; i < reversedStories.length; i++) {
    const name = reversedStories[i];
    // 地下階はBで始まる
    if (!name.startsWith('B')) {
      return i;
    }
  }

  // 全て地下階の場合は0
  return 0;
}

/**
 * 階名と層名の対応関係を作成
 * SS7では層名（1FL, 2FL...）と階名（1F, 2F...）が別
 * @param {Map} sections
 * @returns {Map<string, string>} 層名 → 階名
 */
export function createStoryFloorMap(sections) {
  const storySection = getSection(sections, '層名');
  const floorSection = getSection(sections, '階名');

  if (!storySection || !floorSection) {
    return new Map();
  }

  // キーベースアクセス
  const storyNames = sectionToObjects(storySection)
    .map((row) => getValue(row, STORY_KEYS.name))
    .filter(Boolean);
  const floorNames = sectionToObjects(floorSection)
    .map((row) => getValue(row, FLOOR_KEYS.name))
    .filter(Boolean);

  const map = new Map();

  // 層名と階名を対応付け（簡易的なマッチング）
  // 1FL → 1F, 2FL → 2F, RFL → RF など
  for (const storyName of storyNames) {
    // 'FL' を 'F' に変換、'MFL' を 'MF' に変換
    const floorName = storyName.replace(/FL$/, 'F').replace(/MFL$/, 'MF');
    if (floorNames.includes(floorName)) {
      map.set(storyName, floorName);
    }
  }

  return map;
}

/**
 * 位置インデックスに基づく「階名 → 層名（スパン底）」マッピングを作成
 * 層名・階名リストを下から上の順に並べ、同インデックスの対応を使う。
 * これにより "1MF" のようにサフィックス変換で得られない階名も正しく対応できる。
 * @param {Map} sections - パース済みセクション
 * @returns {Map<string, string>} 階名 → 層名（そのスパンの底の層）
 */
export function parseFloorStoryPairs(sections) {
  const storySection = getSection(sections, '層名');
  const floorSection = getSection(sections, '階名');
  if (!storySection || !floorSection) return new Map();

  const storyNames = sectionToObjects(storySection)
    .map((row) => getValue(row, STORY_KEYS.name))
    .filter(Boolean);
  const floorNames = sectionToObjects(floorSection)
    .map((row) => getValue(row, FLOOR_KEYS.name))
    .filter(Boolean);

  // 上から下→逆順で下から上に
  const revStories = [...storyNames].reverse();
  const revFloors = [...floorNames].reverse();

  const map = new Map();
  for (let i = 0; i < Math.min(revFloors.length, revStories.length); i++) {
    map.set(revFloors[i], revStories[i]);
  }
  return map;
}

/**
 * グリッド座標からノードIDを生成
 * @param {string} xAxisName - X軸名
 * @param {string} yAxisName - Y軸名
 * @param {string} storyName - 層名
 * @returns {string}
 */
export function generateNodeId(xAxisName, yAxisName, storyName) {
  return `${xAxisName}_${yAxisName}_${storyName}`;
}

/**
 * 節点の上下移動を抽出
 * SS7では特定の節点をZ方向に移動させることができる
 * @param {Map} sections - パース済みセクション
 * @returns {Array<{story: string, xAxis: string, yAxis: string, deltaZ: number}>}
 */
export function parseNodeVerticalMovements(sections) {
  const section = getSection(sections, '節点の上下移動');
  if (!section || !section.data) {
    return [];
  }
  const axisSystem = inferAxisSystem(sections);

  const rows = sectionToObjects(section);
  const result = [];

  for (const row of rows) {
    // キーベースアクセス
    // 形式: 層, 軸-軸, ΔZ
    const story = (getValue(row, NODE_VERTICAL_MOVEMENT_KEYS.story, '') || '').trim();
    const axisStr = (getValue(row, NODE_VERTICAL_MOVEMENT_KEYS.axis, '') || '').trim();
    const deltaZ = getNumericValue(row, NODE_VERTICAL_MOVEMENT_KEYS.deltaZ, 0);

    if (!story || !axisStr || deltaZ === 0) {
      continue;
    }

    // 軸-軸を解析（X軸-Y軸 の形式）
    const parsedAxes = parseAxisIntersectionString(axisStr, axisSystem);
    if (!parsedAxes) {
      log.warn(`節点の上下移動: 軸解析に失敗: ${axisStr}`);
      continue;
    }

    result.push({
      story,
      xAxis: parsedAxes.xAxis,
      yAxis: parsedAxes.yAxis,
      deltaZ, // mm（正: 上方向、負: 下方向）
    });
  }

  log.debug(`[parseNodeVerticalMovements] ${result.length}件の節点上下移動をパース`);
  return result;
}

/**
 * 節点の同一化を抽出
 * SS7では複数の節点を同一視（結合）することができる
 * @param {Map} sections - パース済みセクション
 * @returns {Array<{fromStory: string, fromX: string, fromY: string, toStory: string, toX: string, toY: string}>}
 */
export function parseNodeUnifications(sections) {
  const section = getSection(sections, '節点の同一化');
  if (!section || !section.data) {
    return [];
  }
  const axisSystem = inferAxisSystem(sections);

  const rows = sectionToObjects(section);
  const result = [];

  for (const row of rows) {
    // キーベースアクセス
    // 形式: 移動元層, 移動元軸-軸, 移動先層, 移動先軸-軸
    // 例: "1FL", " X5 - Y1", "1FL", " X5 - Y1a"
    const fromStory = (getValue(row, NODE_UNIFICATION_KEYS.fromStory, '') || '').trim();
    const fromAxisStr = (getValue(row, NODE_UNIFICATION_KEYS.fromAxis, '') || '').trim();
    const toStory = (getValue(row, NODE_UNIFICATION_KEYS.toStory, '') || '').trim();
    const toAxisStr = (getValue(row, NODE_UNIFICATION_KEYS.toAxis, '') || '').trim();

    if (!fromStory || !fromAxisStr || !toStory || !toAxisStr) {
      continue;
    }

    // 移動元の軸を解析
    const fromAxes = parseAxisIntersectionString(fromAxisStr, axisSystem);
    if (!fromAxes) {
      log.warn(`節点の同一化: 移動元軸解析に失敗: ${fromAxisStr}`);
      continue;
    }

    const toAxes = parseAxisIntersectionString(toAxisStr, axisSystem);
    if (!toAxes) {
      log.warn(`節点の同一化: 移動先軸解析に失敗: ${toAxisStr}`);
      continue;
    }

    result.push({
      fromStory,
      fromX: fromAxes.xAxis,
      fromY: fromAxes.yAxis,
      toStory,
      toX: toAxes.xAxis,
      toY: toAxes.yAxis,
    });
  }

  log.debug(`[parseNodeUnifications] ${result.length}件の節点同一化をパース`);
  return result;
}

/**
 * 軸振れ（XY平面内の軸交点偏差）を抽出
 * セクション名: '軸振れ'
 * @param {Map} sections - パース済みセクション
 * @returns {Array<{xAxis: string, yAxis: string, deltaX: number, deltaY: number}>}
 */
export function parseAxisDeviations(sections) {
  const section = getSection(sections, '軸振れ');
  if (!section || !section.data) return [];
  const axisSystem = inferAxisSystem(sections);
  const rows = sectionToObjects(section);
  const result = [];
  for (const row of rows) {
    const axisStr = (getValue(row, AXIS_DEVIATION_KEYS.axis, '') || '').trim();
    const deltaX = getNumericValue(row, AXIS_DEVIATION_KEYS.deltaX, 0);
    const deltaY = getNumericValue(row, AXIS_DEVIATION_KEYS.deltaY, 0);
    if (!axisStr || (deltaX === 0 && deltaY === 0)) continue;
    const parsed = parseAxisIntersectionString(axisStr, axisSystem);
    if (!parsed) {
      log.warn(`軸振れ: 軸解析に失敗: ${axisStr}`);
      continue;
    }
    result.push({ xAxis: parsed.xAxis, yAxis: parsed.yAxis, deltaX, deltaY });
  }
  log.debug(`[parseAxisDeviations] ${result.length}件の軸振れをパース`);
  return result;
}

/**
 * 部材の寄り（フレーム単位の部材偏心距離）を抽出
 * セクション名: '部材の寄り'
 * @param {Map} sections - パース済みセクション
 * @returns {Map<string, {columnOffset: number, girderOffset: number, wallOffset: number}>}
 *   key: 軸名（大文字正規化済み、例: 'Y1', 'X3'）
 */
export function parseMemberEccentricities(sections) {
  const section = getSection(sections, '部材の寄り');
  if (!section || !section.data) return new Map();
  const rows = sectionToObjects(section);
  const result = new Map();
  for (const row of rows) {
    const frame = (getValue(row, MEMBER_ECCENTRICITY_KEYS.frame, '') || '').trim();
    if (!frame) continue;
    result.set(frame.toUpperCase(), {
      columnOffset: getNumericValue(row, MEMBER_ECCENTRICITY_KEYS.columnOffset, 0),
      girderOffset: getNumericValue(row, MEMBER_ECCENTRICITY_KEYS.girderOffset, 0),
      wallOffset: getNumericValue(row, MEMBER_ECCENTRICITY_KEYS.wallOffset, 0),
      control: (getValue(row, MEMBER_ECCENTRICITY_KEYS.control, '') || '').trim(),
    });
  }
  log.debug(`[parseMemberEccentricities] ${result.size}フレームの部材寄りをパース`);
  return result;
}

/**
 * 梁のレベル調整を抽出
 * セクション名: '梁のレベル調整'
 * @param {Map} sections - パース済みセクション
 * @returns {Map<string, number>}  key: 層名, value: レベル調整量(mm)
 */
export function parseGirderLevelAdjustments(sections) {
  const section = getSection(sections, '梁のレベル調整');
  if (!section || !section.data) return new Map();
  const rows = sectionToObjects(section);
  const result = new Map();
  for (const row of rows) {
    const story = (getValue(row, GIRDER_LEVEL_ADJUSTMENT_KEYS.story, '') || '').trim();
    const level = getNumericValue(row, GIRDER_LEVEL_ADJUSTMENT_KEYS.level, 0);
    if (story) result.set(story, level);
  }
  log.debug(`[parseGirderLevelAdjustments] ${result.size}層の梁レベル調整をパース`);
  return result;
}

/**
 * 大梁ごとの寄りを抽出
 * セクション名: '大梁の寄り'
 * @param {Map} sections - パース済みセクション
 * @returns {Map<string, {offset: number, control: string}>}
 *   key: "story|frameAxis|frame|startAxis|endAxis"
 */
export function parseSpecificGirderEccentricities(sections) {
  const section = getSection(sections, '大梁の寄り');
  if (!section || !section.data) return new Map();

  const axisSystem = inferAxisSystem(sections);
  const rows = sectionToObjects(section);
  const result = new Map();

  for (const row of rows) {
    const story = (getValue(row, ['層', '層名'], '') || '').trim();
    const frameAxisStr = (getValue(row, ['フレーム-軸-軸'], '') || '').trim();
    const control = (getValue(row, ['押え', '押さえ'], '') || '').trim();
    const offset = getNumericValue(row, ['寸法'], 0);
    if (!story || !frameAxisStr) continue;

    const parsed = parseFrameAxisString(frameAxisStr, axisSystem);
    if (!parsed) continue;

    const key = `${story}|${parsed.frameAxis}|${parsed.frame}|${parsed.startAxis}|${parsed.endAxis}`;
    result.set(key, { offset, control });
  }

  return result;
}

/**
 * 大梁ごとのレベル調整を抽出
 * セクション名: '大梁のレベル調整'
 * @param {Map} sections - パース済みセクション
 * @returns {Map<string, {level: number, control: string}>}
 *   key: "story|frameAxis|frame|startAxis|endAxis"
 */
export function parseSpecificGirderLevelAdjustments(sections) {
  const section = getSection(sections, '大梁のレベル調整');
  if (!section || !section.data) return new Map();

  const axisSystem = inferAxisSystem(sections);
  const rows = sectionToObjects(section);
  const result = new Map();

  for (const row of rows) {
    const story = (getValue(row, ['層', '層名'], '') || '').trim();
    const frameAxisStr = (getValue(row, ['フレーム-軸-軸'], '') || '').trim();
    const control = (getValue(row, ['押え', '押さえ'], '') || '').trim();
    const level = getNumericValue(row, ['寸法'], 0);
    if (!story || !frameAxisStr) continue;

    const parsed = parseFrameAxisString(frameAxisStr, axisSystem);
    if (!parsed) continue;

    const key = `${story}|${parsed.frameAxis}|${parsed.frame}|${parsed.startAxis}|${parsed.endAxis}`;
    result.set(key, { level, control });
  }

  return result;
}

/**
 * 「コンクリート材料（階毎）」から層ごとのコンクリート強度を取得
 *
 * セクション列順: 層(from), 層(to), 大梁, 柱, 壁, 床, 小梁, 片持梁, 片持床
 *
 * @param {Map} sections - パース済みセクション
 * @param {Array} stories - parseStories() の戻り値
 * @returns {Map<string, {floor: string, cantiFloor: string}>} 層名 → コンクリート強度
 */
export function parseStoryConcretes(sections, stories) {
  const section = getSection(sections, 'コンクリート材料（階毎）');
  if (!section || !section.data || section.data.length === 0) return new Map();

  const storyHeightMap = new Map(stories.map((s) => [s.name, s.height]));
  const result = new Map();

  for (const row of section.data) {
    // 層名に付く "(B1F)" "(1F)" 等の注記を除去
    const fromRaw = (row[0] || '').replace(/\([^)]+\)$/, '').trim();
    const toRaw = (row[1] || '').replace(/\([^)]+\)$/, '').trim();
    const floorConcrete = (row[5] || '').trim();
    const cantiFloorConcrete = (row[8] || '').trim();

    if (!fromRaw || !toRaw) continue;

    const fromHeight = storyHeightMap.get(fromRaw);
    const toHeight = storyHeightMap.get(toRaw);
    if (fromHeight === undefined || toHeight === undefined) continue;

    const minH = Math.min(fromHeight, toHeight);
    const maxH = Math.max(fromHeight, toHeight);

    for (const story of stories) {
      if (story.height >= minH && story.height <= maxH) {
        result.set(story.name, { floor: floorConcrete, cantiFloor: cantiFloorConcrete });
      }
    }
  }

  log.debug(`[parseStoryConcretes] ${result.size}層のコンクリート強度をパース`);
  return result;
}

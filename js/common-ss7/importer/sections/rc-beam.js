/**
 * sections/rc-beam.js - RC梁断面パーサー
 *
 * 責務: SS7 CSV から RC造梁（大梁・小梁）の断面情報をパース
 *
 * 対象セクション: 'RC梁断面', 'RC小梁断面'
 *
 * ported from MatrixCalc for StbDiffViewer
 */

import { getSection, sectionToObjects } from '../ss7CsvParser.js';
import { RC_BEAM_SECTION_KEYS, getValue, getNumericValue, getIntValue } from '../key-mappings.js';
import { formatStoryForSectionName } from '../utils/story-formatter.js';

const log = {
  debug: (...args) => console.debug('[SS7RCBeam]', ...args),
  warn: (...args) => console.warn('[SS7RCBeam]', ...args),
  error: (...args) => console.error('[SS7RCBeam]', ...args),
};

/**
 * 主筋本数文字列をパースする（例: "4/4" → {first: 4, second: 4}）
 * @param {string} value - 本数文字列
 * @returns {{first: number, second: number}} 1段目と2段目の本数
 */
function parseRebarCount(value) {
  if (!value) return { first: 0, second: 0 };

  const str = String(value).trim();
  if (str.includes('/')) {
    const [first, second] = str.split('/').map((s) => parseInt(s.trim(), 10) || 0);
    return { first, second };
  }
  return { first: parseInt(str, 10) || 0, second: 0 };
}

/**
 * RC梁断面を抽出
 * @param {Map} sections - パース済みセクション
 * @param {Object|null} materialDefaults - parseStandardMaterials の結果
 * @returns {Array}
 */
export function parseRCBeamSections(sections, materialDefaults = null) {
  const section = getSection(sections, 'RC梁断面');
  if (!section || !section.data) {
    return [];
  }

  // 重複ヘッダー対応のためsuffix modeを使用
  const rows = sectionToObjects(section, { handleDuplicates: 'suffix' });
  const result = [];
  const sectionMap = new Map();

  for (const row of rows) {
    // キーベースアクセス
    // 形式: 層, 梁符号, 添字, ハンチ左, ハンチ右, 左端b, 左端D, 中央b, 中央D, ...
    const story = getValue(row, RC_BEAM_SECTION_KEYS.story);
    const symbol = getValue(row, RC_BEAM_SECTION_KEYS.symbol);
    const suffix = getValue(row, RC_BEAM_SECTION_KEYS.suffix);
    const haunchLeft = getNumericValue(row, RC_BEAM_SECTION_KEYS.haunchLeft, 0);
    const haunchRight = getNumericValue(row, RC_BEAM_SECTION_KEYS.haunchRight, 0);
    const widthLeft = getNumericValue(row, RC_BEAM_SECTION_KEYS.leftB, 0);
    const depthLeft = getNumericValue(row, RC_BEAM_SECTION_KEYS.leftD, 0);
    const width = getNumericValue(row, RC_BEAM_SECTION_KEYS.centerB, 0) || widthLeft;
    const depth = getNumericValue(row, RC_BEAM_SECTION_KEYS.centerD, 0) || depthLeft;
    const widthRight = getNumericValue(row, RC_BEAM_SECTION_KEYS.rightB, 0);
    const depthRight = getNumericValue(row, RC_BEAM_SECTION_KEYS.rightD, 0);
    const material = getValue(row, RC_BEAM_SECTION_KEYS.material, 'Fc21');

    // コンクリート荷重剛性用寸法（梁のレベル調整による打増し効果を含む）
    const loadWidthLeft = getNumericValue(row, RC_BEAM_SECTION_KEYS.loadLeftB, 0);
    const loadDepthLeft = getNumericValue(row, RC_BEAM_SECTION_KEYS.loadLeftD, 0);
    const loadWidth = getNumericValue(row, RC_BEAM_SECTION_KEYS.loadCenterB, 0) || loadWidthLeft;
    const loadDepth = getNumericValue(row, RC_BEAM_SECTION_KEYS.loadCenterD, 0) || loadDepthLeft;
    const loadWidthRight = getNumericValue(row, RC_BEAM_SECTION_KEYS.loadRightB, 0);
    const loadDepthRight = getNumericValue(row, RC_BEAM_SECTION_KEYS.loadRightD, 0);

    // 鉄筋情報のパース
    const rebar = parseRCBeamRebar(row);

    // ハンチ情報（0でない場合のみ）
    const haunch =
      haunchLeft > 0 || haunchRight > 0
        ? {
            left: haunchLeft,
            right: haunchRight,
          }
        : null;

    // reinforcement 形式に変換（section-converter.js互換）
    const reinforcement = rebar ? convertRebarToReinforcementFormat(rebar, materialDefaults) : null;

    // 階層プレフィックスを生成（例: "2F" → "2"）
    const storyPrefix = story ? formatStoryForSectionName(story) : '';

    const sectionData = {
      id: `sec_beam_${story}_${symbol}_${suffix || '1'}`,
      name: `${storyPrefix}${symbol}`, // 階層プレフィックス + 符号（添字は含めない）
      symbol: symbol,
      suffix: suffix,
      story: story,
      shape: 'rect',
      sectionName: `RC ${width}x${depth}`,
      material: material,
      type: 'rc',
      memberType: 'beam',
      dims: {
        width: width,
        height: depth,
      },
      dimsForStiffness:
        loadDepth > 0 && loadDepth !== depth
          ? { width: loadWidth || width, height: loadDepth }
          : null,
      dimsLeft: widthLeft > 0 ? { width: widthLeft, height: depthLeft } : null,
      dimsRight: widthRight > 0 ? { width: widthRight, height: depthRight } : null,
      dimsLeftForStiffness:
        loadDepthLeft > 0 && loadDepthLeft !== depthLeft
          ? { width: loadWidthLeft || widthLeft, height: loadDepthLeft }
          : null,
      dimsRightForStiffness:
        loadDepthRight > 0 && loadDepthRight !== depthRight
          ? { width: loadWidthRight || widthRight, height: loadDepthRight }
          : null,
      haunch: haunch,
      rebar: rebar,
      reinforcement: reinforcement, // 追加: 耐力計算用
    };

    // 層+符号+添字でキーを構成（同じ符号でも層が異なれば別断面）
    const key = `${story}_${symbol}_${suffix || '1'}`;
    if (!sectionMap.has(key)) {
      sectionMap.set(key, sectionData);
      result.push(sectionData);
    }
  }

  log.debug(`[parseRCBeamSections] ${result.length}件のRC梁断面をパースしました`);
  return result;
}

/**
 * 1つの位置（左端/中央/右端）の鉄筋情報をSTB形式に変換
 * @param {Object} mainData - main.left/center/right
 * @param {Object} shearData - shear.left/center/right
 * @param {Object} beamDef - デフォルト値
 * @param {Function} getMaterial - 径→材料のデフォルト解決関数
 * @returns {Object} STB形式の鉄筋情報
 */
function buildPositionRebar(mainData, shearData, beamDef, getMaterial) {
  const topDiameterStr = mainData.top?.diameter || beamDef.mainDiameter || 'D25';
  const bottomDiameterStr = mainData.bottom?.diameter || beamDef.mainDiameter || 'D25';
  const stirrupDiameterStr = shearData.diameter || beamDef.shearDiameter || 'D13';
  const mainDiameterStr = bottomDiameterStr || topDiameterStr;

  const parseRebarDiameter = (diameterStr) => {
    if (!diameterStr) return 0;
    const match = String(diameterStr).match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  };

  const topDiameter = parseRebarDiameter(topDiameterStr);
  const bottomDiameter = parseRebarDiameter(bottomDiameterStr);
  const stirrupDiameter = parseRebarDiameter(stirrupDiameterStr);

  const mainMat =
    mainData.bottom?.material || mainData.top?.material || getMaterial(mainDiameterStr);
  const stirrupMat = shearData.material || getMaterial(stirrupDiameterStr);

  const getCount = (obj, key1, key2) => {
    if (!obj) return 0;
    return obj[key1] || obj[key2] || 0;
  };

  const top1st = getCount(mainData.top, 'first', 'count1st');
  const top2nd = getCount(mainData.top, 'second', 'count2nd');
  const bottom1st = getCount(mainData.bottom, 'first', 'count1st');
  const bottom2nd = getCount(mainData.bottom, 'second', 'count2nd');

  return {
    D_main: bottomDiameter || topDiameter || 0,
    N_main_top_1st: top1st,
    N_main_top_2nd: top2nd,
    N_main_top_total: top1st + top2nd,
    N_main_bottom_1st: bottom1st,
    N_main_bottom_2nd: bottom2nd,
    N_main_bottom_total: bottom1st + bottom2nd,
    D_stirrup: stirrupDiameter || 0,
    N_stirrup: shearData.count || 0,
    pitch_stirrup: shearData.pitch || 100,
    mainBarMaterialId: mainMat,
    mainDiameter: mainDiameterStr,
    stirrupDiameter: stirrupDiameterStr,
    strength_main: mainMat,
    strength_stirrup: stirrupMat,
    // dt1値（芯かぶり）
    dt_top: mainData.top?.dt || 0,
    dt_bottom: mainData.bottom?.dt || 0,
  };
}

/**
 * 2つの位置の鉄筋情報が同一かどうかを判定
 */
function isRebarEqual(a, b) {
  if (!a || !b) return a === b;
  return (
    a.N_main_top_1st === b.N_main_top_1st &&
    a.N_main_top_2nd === b.N_main_top_2nd &&
    a.N_main_bottom_1st === b.N_main_bottom_1st &&
    a.N_main_bottom_2nd === b.N_main_bottom_2nd &&
    a.D_main === b.D_main &&
    a.D_stirrup === b.D_stirrup &&
    a.N_stirrup === b.N_stirrup &&
    a.pitch_stirrup === b.pitch_stirrup &&
    a.mainDiameter === b.mainDiameter &&
    a.stirrupDiameter === b.stirrupDiameter &&
    a.strength_main === b.strength_main &&
    a.strength_stirrup === b.strength_stirrup
  );
}

/**
 * rebar形式をreinforcement.beam形式に変換
 * @param {Object} rebar - parseRCBeamRebarの結果
 * @param {Object|null} defaults - parseStandardMaterials の結果
 * @returns {Object} reinforcement形式（beam: 中央部, start/end: 端部, isThreeTypes: 3区分フラグ）
 */
function convertRebarToReinforcementFormat(rebar, defaults = null) {
  if (!rebar || !rebar.main) {
    return null;
  }

  const beamDef = defaults?.beam ?? {};
  const getMaterial = defaults?.getMaterial ?? (() => 'SD345');

  const leftMain = rebar.main.left || {};
  const centerMain = rebar.main.center || {};
  const rightMain = rebar.main.right || {};
  const leftShear = rebar.shear?.left || {};
  const centerShear = rebar.shear?.center || {};
  const rightShear = rebar.shear?.right || {};

  const start = buildPositionRebar(leftMain, leftShear, beamDef, getMaterial);
  const center = buildPositionRebar(centerMain, centerShear, beamDef, getMaterial);
  const end = buildPositionRebar(rightMain, rightShear, beamDef, getMaterial);

  // 3区分か統一配筋かを判定
  const isThreeTypes = !isRebarEqual(start, center) || !isRebarEqual(center, end);

  log.debug(
    `[convertRebarToReinforcementFormat] isThreeTypes=${isThreeTypes}, center D_main=${center.D_main}, BottomTotal=${center.N_main_bottom_total}`,
  );

  return {
    // beam: 中央部（後方互換）
    beam: center,
    // 3区分出力用
    start,
    center,
    end,
    isThreeTypes,
  };
}

/**
 * RC梁断面の鉄筋情報をパース（キーベースアクセス）
 * @param {Object} row - キーベースの行データ
 * @returns {Object|null} 鉄筋情報（main: {left, center, right}, shear: {left, center, right}）
 */
function parseRCBeamRebar(row) {
  // 主筋情報（左端/中央/右端）
  // 本数は "4" または "4/4"（2段筋の場合）の形式
  const leftTop = parseRebarCount(getValue(row, RC_BEAM_SECTION_KEYS.mainRebarCountLeftTop, '0'));
  const leftBottom = parseRebarCount(
    getValue(row, RC_BEAM_SECTION_KEYS.mainRebarCountLeftBottom, '0'),
  );
  const centerTop = parseRebarCount(
    getValue(row, RC_BEAM_SECTION_KEYS.mainRebarCountCenterTop, '0'),
  );
  const centerBottom = parseRebarCount(
    getValue(row, RC_BEAM_SECTION_KEYS.mainRebarCountCenterBottom, '0'),
  );
  const rightTop = parseRebarCount(getValue(row, RC_BEAM_SECTION_KEYS.mainRebarCountRightTop, '0'));
  const rightBottom = parseRebarCount(
    getValue(row, RC_BEAM_SECTION_KEYS.mainRebarCountRightBottom, '0'),
  );

  // 主筋径（空の場合はnull → デフォルト径を使用）
  const diaLeftTop = getValue(row, RC_BEAM_SECTION_KEYS.mainRebarDiaLeftTop, '');
  const diaLeftBottom = getValue(row, RC_BEAM_SECTION_KEYS.mainRebarDiaLeftBottom, '');
  const diaCenterTop = getValue(row, RC_BEAM_SECTION_KEYS.mainRebarDiaCenterTop, '');
  const diaCenterBottom = getValue(row, RC_BEAM_SECTION_KEYS.mainRebarDiaCenterBottom, '');
  const diaRightTop = getValue(row, RC_BEAM_SECTION_KEYS.mainRebarDiaRightTop, '');
  const diaRightBottom = getValue(row, RC_BEAM_SECTION_KEYS.mainRebarDiaRightBottom, '');

  // 主筋材料
  const matLeftTop = getValue(row, RC_BEAM_SECTION_KEYS.mainRebarMatLeftTop, '');
  const matLeftBottom = getValue(row, RC_BEAM_SECTION_KEYS.mainRebarMatLeftBottom, '');
  const matCenterTop = getValue(row, RC_BEAM_SECTION_KEYS.mainRebarMatCenterTop, '');
  const matCenterBottom = getValue(row, RC_BEAM_SECTION_KEYS.mainRebarMatCenterBottom, '');
  const matRightTop = getValue(row, RC_BEAM_SECTION_KEYS.mainRebarMatRightTop, '');
  const matRightBottom = getValue(row, RC_BEAM_SECTION_KEYS.mainRebarMatRightBottom, '');

  // dt1（主筋の芯かぶり）
  const dt1LeftTop = getNumericValue(row, RC_BEAM_SECTION_KEYS.mainRebarDt1LeftTop, 0);
  const dt1LeftBottom = getNumericValue(row, RC_BEAM_SECTION_KEYS.mainRebarDt1LeftBottom, 0);
  const dt1CenterTop = getNumericValue(row, RC_BEAM_SECTION_KEYS.mainRebarDt1CenterTop, 0);
  const dt1CenterBottom = getNumericValue(row, RC_BEAM_SECTION_KEYS.mainRebarDt1CenterBottom, 0);
  const dt1RightTop = getNumericValue(row, RC_BEAM_SECTION_KEYS.mainRebarDt1RightTop, 0);
  const dt1RightBottom = getNumericValue(row, RC_BEAM_SECTION_KEYS.mainRebarDt1RightBottom, 0);

  // 2段筋本数
  const secondLeftTop = getIntValue(row, RC_BEAM_SECTION_KEYS.mainRebar2CountLeftTop, 0);
  const secondLeftBottom = getIntValue(row, RC_BEAM_SECTION_KEYS.mainRebar2CountLeftBottom, 0);
  const secondCenterTop = getIntValue(row, RC_BEAM_SECTION_KEYS.mainRebar2CountCenterTop, 0);
  const secondCenterBottom = getIntValue(row, RC_BEAM_SECTION_KEYS.mainRebar2CountCenterBottom, 0);
  const secondRightTop = getIntValue(row, RC_BEAM_SECTION_KEYS.mainRebar2CountRightTop, 0);
  const secondRightBottom = getIntValue(row, RC_BEAM_SECTION_KEYS.mainRebar2CountRightBottom, 0);

  // main構造を作成（model-converter.jsが期待する形式: main.center.top.count 等）
  const main = {
    left: {
      top: {
        count: leftTop.first + (leftTop.second || secondLeftTop),
        count1st: leftTop.first,
        count2nd: leftTop.second || secondLeftTop,
        diameter: diaLeftTop || null,
        material: matLeftTop || null,
        dt: dt1LeftTop,
      },
      bottom: {
        count: leftBottom.first + (leftBottom.second || secondLeftBottom),
        count1st: leftBottom.first,
        count2nd: leftBottom.second || secondLeftBottom,
        diameter: diaLeftBottom || null,
        material: matLeftBottom || null,
        dt: dt1LeftBottom,
      },
    },
    center: {
      top: {
        count: centerTop.first + (centerTop.second || secondCenterTop),
        count1st: centerTop.first,
        count2nd: centerTop.second || secondCenterTop,
        diameter: diaCenterTop || null,
        material: matCenterTop || null,
        dt: dt1CenterTop,
      },
      bottom: {
        count: centerBottom.first + (centerBottom.second || secondCenterBottom),
        count1st: centerBottom.first,
        count2nd: centerBottom.second || secondCenterBottom,
        diameter: diaCenterBottom || null,
        material: matCenterBottom || null,
        dt: dt1CenterBottom,
      },
    },
    right: {
      top: {
        count: rightTop.first + (rightTop.second || secondRightTop),
        count1st: rightTop.first,
        count2nd: rightTop.second || secondRightTop,
        diameter: diaRightTop || null,
        material: matRightTop || null,
        dt: dt1RightTop,
      },
      bottom: {
        count: rightBottom.first + (rightBottom.second || secondRightBottom),
        count1st: rightBottom.first,
        count2nd: rightBottom.second || secondRightBottom,
        diameter: diaRightBottom || null,
        material: matRightBottom || null,
        dt: dt1RightBottom,
      },
    },
  };

  // あばら筋情報（左端/中央/右端）
  const stirrupCountLeft = getIntValue(row, RC_BEAM_SECTION_KEYS.stirrupCountLeft, 0);
  const stirrupCountCenter = getIntValue(row, RC_BEAM_SECTION_KEYS.stirrupCountCenter, 0);
  const stirrupCountRight = getIntValue(row, RC_BEAM_SECTION_KEYS.stirrupCountRight, 0);

  const stirrupDiaLeft = getValue(row, RC_BEAM_SECTION_KEYS.stirrupDiaLeft, '');
  const stirrupDiaCenter = getValue(row, RC_BEAM_SECTION_KEYS.stirrupDiaCenter, '');
  const stirrupDiaRight = getValue(row, RC_BEAM_SECTION_KEYS.stirrupDiaRight, '');

  const stirrupPitchLeft = getNumericValue(row, RC_BEAM_SECTION_KEYS.stirrupPitchLeft, 0);
  const stirrupPitchCenter = getNumericValue(row, RC_BEAM_SECTION_KEYS.stirrupPitchCenter, 0);
  const stirrupPitchRight = getNumericValue(row, RC_BEAM_SECTION_KEYS.stirrupPitchRight, 0);

  const stirrupMatLeft = getValue(row, RC_BEAM_SECTION_KEYS.stirrupMatLeft, '');
  const stirrupMatCenter = getValue(row, RC_BEAM_SECTION_KEYS.stirrupMatCenter, '');
  const stirrupMatRight = getValue(row, RC_BEAM_SECTION_KEYS.stirrupMatRight, '');

  const shear = {
    left: {
      count: stirrupCountLeft,
      diameter: stirrupDiaLeft || null,
      pitch: stirrupPitchLeft,
      material: stirrupMatLeft || null,
    },
    center: {
      count: stirrupCountCenter,
      diameter: stirrupDiaCenter || null,
      pitch: stirrupPitchCenter,
      material: stirrupMatCenter || null,
    },
    right: {
      count: stirrupCountRight,
      diameter: stirrupDiaRight || null,
      pitch: stirrupPitchRight,
      material: stirrupMatRight || null,
    },
  };

  // 有効な鉄筋情報があるかチェック
  const hasMainRebar =
    main.left.top.count > 0 ||
    main.left.bottom.count > 0 ||
    main.center.top.count > 0 ||
    main.center.bottom.count > 0 ||
    main.right.top.count > 0 ||
    main.right.bottom.count > 0;

  const hasShearRebar = shear.left.count > 0 || shear.center.count > 0 || shear.right.count > 0;

  if (!hasMainRebar && !hasShearRebar) {
    return null;
  }

  return {
    main: hasMainRebar ? main : null,
    shear: hasShearRebar ? shear : null,
  };
}

/**
 * RC小梁断面を抽出（'RC小梁断面' セクション）
 *
 * RC梁断面とは異なり、層・添字・ハンチがなく、
 * 符号 / b / D / 材料 の簡易フォーマット。
 * @param {Map} sections - パース済みセクション
 * @returns {Array}
 */
export function parseRCSubBeamSections(sections) {
  const section = getSection(sections, 'RC小梁断面');
  if (!section || !section.data) {
    return [];
  }

  const rows = sectionToObjects(section, { handleDuplicates: 'suffix' });
  const result = [];

  for (const row of rows) {
    const symbol = row['梁符号'] || '';
    if (!symbol) continue;

    const width = parseFloat(row['b']) || 0;
    const depth = parseFloat(row['D']) || 0;
    const material = row['材料'] || 'Fc21';

    result.push({
      id: `sec_subbeam_${symbol}`,
      name: symbol,
      symbol,
      suffix: null,
      story: null,
      shape: 'rect',
      sectionName: `RC ${width}x${depth}`,
      material,
      type: 'rc',
      memberType: 'beam',
      dims: { width, height: depth },
      dimsForStiffness: null,
      dimsLeft: null,
      dimsRight: null,
      dimsLeftForStiffness: null,
      dimsRightForStiffness: null,
      haunch: null,
      rebar: null,
      reinforcement: null,
    });
  }

  log.debug(`[parseRCSubBeamSections] ${result.length}件のRC小梁断面をパースしました`);
  return result;
}

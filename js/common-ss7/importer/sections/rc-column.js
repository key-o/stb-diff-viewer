/**
 * sections/rc-column.js - RC柱断面パーサー
 *
 * 責務: SS7 CSV から RC造柱の断面情報をパース
 *
 * 対象セクション: 'RC柱断面'
 *
 * ported from MatrixCalc for StbDiffViewer
 */

import { getSection, sectionToObjects } from '../ss7CsvParser.js';
import { RC_COLUMN_SECTION_KEYS, getValue, getNumericValue, getIntValue } from '../key-mappings.js';
import { formatStoryForSectionName } from '../utils/story-formatter.js';

const log = {
  debug: (...args) => console.debug('[SS7RCColumn]', ...args),
  warn: (...args) => console.warn('[SS7RCColumn]', ...args),
  error: (...args) => console.error('[SS7RCColumn]', ...args),
};

/**
 * RC柱断面を抽出
 * @param {Map} sections - パース済みセクション
 * @param {Object|null} materialDefaults - parseStandardMaterials の結果
 * @returns {Array}
 */
export function parseRCColumnSections(sections, materialDefaults = null) {
  const section = getSection(sections, 'RC柱断面');
  if (!section || !section.data) {
    return [];
  }

  // 重複ヘッダー対応のためsuffix modeを使用
  const rows = sectionToObjects(section, { handleDuplicates: 'suffix' });
  const result = [];
  const sectionMap = new Map();

  for (const row of rows) {
    // キーベースアクセス
    // 形式: 階, 柱符号, 添字, コンクリート/形状, Dx, Dy, 材料, 荷重剛性用Dx, 荷重剛性用Dy, ...
    const floor = getValue(row, RC_COLUMN_SECTION_KEYS.floor);
    const symbol = getValue(row, RC_COLUMN_SECTION_KEYS.symbol);
    const suffix = getValue(row, RC_COLUMN_SECTION_KEYS.suffix);
    const shape = getValue(row, RC_COLUMN_SECTION_KEYS.shape);
    const dx = getNumericValue(row, RC_COLUMN_SECTION_KEYS.dx, 0);
    const dy = getNumericValue(row, RC_COLUMN_SECTION_KEYS.dy, 0);
    const loadDx = getNumericValue(row, RC_COLUMN_SECTION_KEYS.loadDx, 0);
    const loadDy = getNumericValue(row, RC_COLUMN_SECTION_KEYS.loadDy, 0);
    const material = getValue(row, RC_COLUMN_SECTION_KEYS.material, 'Fc21');

    if (!symbol) continue;

    // 鉄筋情報のパース（キーベースアクセス）
    const rebar = parseRCColumnRebar(row, materialDefaults);

    // 階層プレフィックスを生成（例: "2F" → "2"）
    const storyPrefix = floor ? formatStoryForSectionName(floor) : '';

    const sectionData = {
      id: `sec_col_${floor}_${symbol}_${suffix || '1'}`,
      name: `${storyPrefix}${symbol}`, // 階層プレフィックス + 符号（添字は含めない）
      symbol: symbol,
      suffix: suffix,
      floor: floor,
      story: floor, // 階名をstoryとして保存（断面検索で使用）
      shape: shape === '□' ? 'rect' : shape,
      sectionName: `RC ${dx}x${dy}`,
      material: material || 'Fc21',
      type: 'rc',
      memberType: 'column',
      dims: {
        width: dx,
        height: dy,
      },
      rebar: rebar,
      dimsForLoad:
        (loadDx > 0 && loadDx !== dx) || (loadDy > 0 && loadDy !== dy)
          ? { width: loadDx || dx, height: loadDy || dy }
          : null,
    };

    // 同じ階・符号・添字がなければ追加（階ごとに異なる断面を保持）
    const key = `${floor}_${symbol}_${suffix || '1'}`;
    if (!sectionMap.has(key)) {
      sectionMap.set(key, sectionData);
      result.push(sectionData);
    }
  }

  log.debug(`[parseRCColumnSections] ${result.length}件のRC柱断面をパースしました`);
  return result;
}

/**
 * RC柱断面の鉄筋情報をパース（キーベースアクセス）
 * @param {Object} row - キーベースの行データ
 * @param {Object|null} defaults - parseStandardMaterials の結果
 * @returns {Object} 鉄筋情報
 */
function parseRCColumnRebar(row, defaults = null) {
  const colDef = defaults?.column ?? {};
  const getMaterial = defaults?.getMaterial ?? (() => 'SD345');

  const resolveMainDia = (val) => val || colDef.mainDiameter || 'D25';
  const resolveShearDia = (val) => val || colDef.shearDiameter || 'D13';

  // 主筋情報
  const main = {
    topX: getIntValue(row, RC_COLUMN_SECTION_KEYS.mainRebarCountTopX, 0),
    topY: getIntValue(row, RC_COLUMN_SECTION_KEYS.mainRebarCountTopY, 0),
    bottomX: getIntValue(row, RC_COLUMN_SECTION_KEYS.mainRebarCountBottomX, 0),
    bottomY: getIntValue(row, RC_COLUMN_SECTION_KEYS.mainRebarCountBottomY, 0),
    diameter: {
      topX: resolveMainDia(getValue(row, RC_COLUMN_SECTION_KEYS.mainRebarDiaTopX, '')),
      topY: resolveMainDia(getValue(row, RC_COLUMN_SECTION_KEYS.mainRebarDiaTopY, '')),
      bottomX: resolveMainDia(getValue(row, RC_COLUMN_SECTION_KEYS.mainRebarDiaBottomX, '')),
      bottomY: resolveMainDia(getValue(row, RC_COLUMN_SECTION_KEYS.mainRebarDiaBottomY, '')),
    },
    material: {
      topX:
        getValue(row, RC_COLUMN_SECTION_KEYS.mainRebarMatTopX, '') ||
        getMaterial(colDef.mainDiameter),
      topY:
        getValue(row, RC_COLUMN_SECTION_KEYS.mainRebarMatTopY, '') ||
        getMaterial(colDef.mainDiameter),
      bottomX:
        getValue(row, RC_COLUMN_SECTION_KEYS.mainRebarMatBottomX, '') ||
        getMaterial(colDef.mainDiameter),
      bottomY:
        getValue(row, RC_COLUMN_SECTION_KEYS.mainRebarMatBottomY, '') ||
        getMaterial(colDef.mainDiameter),
    },
    dt: { topX: 0, topY: 0, bottomX: 0, bottomY: 0 },
    cover: { topX: 0, topY: 0, bottomX: 0, bottomY: 0 },
    distribution: { top: '', bottom: '' },
  };

  // 芯鉄筋情報（キーマッピング未定義のためnull）
  const core = null;

  // 帯筋情報
  const shearDia = resolveShearDia(getValue(row, RC_COLUMN_SECTION_KEYS.hoopDiameter, ''));
  const shear = {
    countX: getIntValue(row, RC_COLUMN_SECTION_KEYS.hoopCountX, 0),
    countY: getIntValue(row, RC_COLUMN_SECTION_KEYS.hoopCountY, 0),
    diameter: shearDia,
    pitch: getNumericValue(row, RC_COLUMN_SECTION_KEYS.hoopPitch, 0),
    material: getValue(row, RC_COLUMN_SECTION_KEYS.hoopMaterial, '') || getMaterial(shearDia),
  };

  // 有効な鉄筋情報があるかチェック
  const hasMainRebar = main.topX > 0 || main.topY > 0 || main.bottomX > 0 || main.bottomY > 0;
  const hasShearRebar = shear.countX > 0 || shear.countY > 0;

  if (!hasMainRebar && !hasShearRebar) {
    return null;
  }

  return {
    main: hasMainRebar ? main : null,
    core: core,
    shear: hasShearRebar ? shear : null,
    cover: colDef.cover ?? 40,
  };
}

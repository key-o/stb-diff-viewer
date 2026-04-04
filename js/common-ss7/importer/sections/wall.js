/**
 * sections/wall.js
 * SS7 壁断面パーサー（配筋情報対応）
 *
 * ported from MatrixCalc for StbDiffViewer
 */

import { getSection, sectionToObjects } from '../ss7CsvParser.js';
import {
  WALL_SECTION_KEYS,
  OUT_OF_FRAME_WALL_SECTION_KEYS,
  getValue,
  getNumericValue,
  getIntValue,
} from '../key-mappings.js';

/**
 * 壁断面をパース（配筋情報含む）
 * @param {Map} sections
 * @returns {Array}
 */
export function parseWallSections(sections) {
  const section = getSection(sections, '壁断面');
  if (!section || !section.data) {
    return [];
  }

  // 重複ヘッダー（径1/ピッチ/材料1 が縦筋・横筋で重複）に suffix 方式で対応
  const rows = sectionToObjects(section, { handleDuplicates: 'suffix' });

  return rows
    .map((row) => {
      // 必須項目の取得
      const symbol = getValue(row, WALL_SECTION_KEYS.symbol);
      if (!symbol) return null;

      const rawT = parseFloat(getValue(row, WALL_SECTION_KEYS.thickness));
      const t = Number.isFinite(rawT) ? rawT : 0;
      const rawWeight = parseFloat(getValue(row, WALL_SECTION_KEYS.weight));
      const wallWeight = Number.isFinite(rawWeight) ? rawWeight : 0;
      const rawFinish = parseFloat(getValue(row, WALL_SECTION_KEYS.finishLoad));
      const wallFinishLoad = Number.isFinite(rawFinish) ? rawFinish : 0;
      const rawMaterial = getValue(row, WALL_SECTION_KEYS.material, '');
      const materialSpecified = rawMaterial.trim() !== '';
      const material = rawMaterial || 'Fc21';

      // Fc値を抽出
      let fc = 21;
      if (material) {
        const fcMatch = material.match(/Fc(\d+)/);
        if (fcMatch) {
          fc = parseInt(fcMatch[1], 10);
        }
      }

      // 配筋情報の抽出
      const reinforcement = parseWallReinforcement(row);

      return {
        type: 'rc',
        id: `sec_wall_${symbol}`,
        symbol: symbol,
        name: symbol,
        sectionName: `W-${t}`,
        shape: 'WALL',
        dims: {
          thickness: t,
        },
        wallWeight: wallWeight,
        wallFinishLoad: wallFinishLoad,
        material: material,
        materialSpecified,
        concrete: {
          Fc: fc,
        },
        reinforcement,
      };
    })
    .filter(Boolean);
}

/**
 * 壁断面の配筋情報を抽出
 * SS7 CSV の「配筋」列: 0=なし, 1=シングル, 2=ダブル, マイナス値=mm²直接入力
 * @param {Object} row - sectionToObjects の1行
 * @returns {Object|null}
 */
function parseWallReinforcement(row) {
  const cover = getNumericValue(row, WALL_SECTION_KEYS.cover, 0);
  const vertArr = getIntValue(row, WALL_SECTION_KEYS.verticalArrangement, 0);
  const vertDia = getValue(row, WALL_SECTION_KEYS.verticalDia, '');
  const vertPitch = getNumericValue(row, WALL_SECTION_KEYS.verticalPitch, 0);
  const vertMat = getValue(row, WALL_SECTION_KEYS.verticalMat, '');
  const horzArr = getIntValue(row, WALL_SECTION_KEYS.horizontalArrangement, 0);
  const horzDia = getValue(row, WALL_SECTION_KEYS.horizontalDia, '');
  const horzPitch = getNumericValue(row, WALL_SECTION_KEYS.horizontalPitch, 0);
  const horzMat = getValue(row, WALL_SECTION_KEYS.horizontalMat, '');

  // 配筋データがない場合は null（かぶりのみ指定でも縦横とも配筋0なら意味なし）
  if (vertArr === 0 && horzArr === 0) {
    return null;
  }

  return {
    cover,
    vertical: {
      arrangement: vertArr, // 0=なし, 1=シングル, 2=ダブル
      dia: vertDia || null,
      pitch: vertPitch,
      material: vertMat || null,
    },
    horizontal: {
      arrangement: horzArr,
      dia: horzDia || null,
      pitch: horzPitch,
      material: horzMat || null,
    },
  };
}

/**
 * フレーム外雑壁断面をパース
 * @param {Map} sections
 * @returns {Array}
 */
export function parseOutOfFrameWallSections(sections) {
  const section = getSection(sections, 'フレーム外雑壁断面');
  if (!section || !section.data) {
    return [];
  }

  const rows = sectionToObjects(section);

  return rows
    .map((row) => {
      const symbol = getValue(row, OUT_OF_FRAME_WALL_SECTION_KEYS.symbol);
      if (!symbol) return null;

      const rawT = parseFloat(getValue(row, OUT_OF_FRAME_WALL_SECTION_KEYS.thickness));
      const t = Number.isFinite(rawT) ? rawT : 0;
      const rawFinish = parseFloat(getValue(row, OUT_OF_FRAME_WALL_SECTION_KEYS.finishWeight));
      const finishLoad = Number.isFinite(rawFinish) ? rawFinish : 0;
      const rawWeight = parseFloat(getValue(row, OUT_OF_FRAME_WALL_SECTION_KEYS.totalWeight));
      const weight = Number.isFinite(rawWeight) ? rawWeight : 0;
      const rawMaterial = getValue(row, OUT_OF_FRAME_WALL_SECTION_KEYS.material, '');
      const material = rawMaterial || '標準';

      // Fc値を抽出（'標準'の場合はデフォルト）
      let fc = 21;
      if (material && material !== '標準') {
        const fcMatch = material.match(/Fc(\d+)/);
        if (fcMatch) {
          fc = parseInt(fcMatch[1], 10);
        }
      }

      return {
        type: 'rc',
        id: `sec_ofw_${symbol}`,
        symbol,
        name: symbol,
        sectionName: `OFW-${t}`,
        shape: 'WALL',
        dims: { thickness: t },
        wallWeight: weight,
        wallFinishLoad: finishLoad,
        material,
        materialSpecified: rawMaterial.trim() !== '' && rawMaterial !== '標準',
        concrete: { Fc: fc },
      };
    })
    .filter(Boolean);
}

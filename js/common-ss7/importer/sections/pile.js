/**
 * sections/pile.js - 杭断面パーサー
 *
 * 責務: SS7 CSV から場所打ち杭断面・杭基礎断面をパース
 *
 * 対象セクション:
 *   - '場所打ち杭断面'
 *   - '場所打ち杭基礎断面'
 *
 * ported from MatrixCalc for StbDiffViewer
 */

import { getSection } from '../ss7CsvParser.js';

const log = {
  debug: (...args) => console.debug('[SS7Pile]', ...args),
  warn: (...args) => console.warn('[SS7Pile]', ...args),
};

/**
 * 場所打ち杭断面をパース
 *
 * ヘッダー列インデックス（2段ヘッダーをマージした場合）:
 *   0: 杭符号
 *   1: タイプ
 *   2: 杭長/杭頭 (m)
 *   4: 杭解析長 (m)
 *   5: 杭径/杭頭 (mm)
 *   7: 拡底径 (mm)
 *   8: コンクリート材料/杭頭
 *   35: 杭全長 (m)
 *
 * @param {Map} sections - パース済みセクション
 * @returns {Array<Object>} 杭断面オブジェクト配列
 */
export function parsePileSections(sections) {
  const section = getSection(sections, '場所打ち杭断面');
  if (!section || !section.data) {
    return [];
  }

  const result = [];
  const seen = new Set();

  for (const row of section.data) {
    const symbol = (row[0] || '').trim();
    if (!symbol) continue;

    const type = (row[1] || '').trim();
    const lengthHeadM = parseFloat(row[2]);
    const lengthTotalM = parseFloat(row[35]);
    const diameter = parseInt(row[5], 10);
    const diameterExpanded = parseInt(row[7], 10);
    const concrete = (row[8] || 'Fc21').trim();

    if (isNaN(lengthHeadM) || isNaN(lengthTotalM) || isNaN(diameter)) {
      log.warn(
        `杭断面 ${symbol}: 数値パース失敗 (lengthHead=${row[2]}, lengthTotal=${row[35]}, diameter=${row[5]})`,
      );
      continue;
    }

    if (seen.has(symbol)) continue;
    seen.add(symbol);

    result.push({
      id: `sec_pile_${symbol}`,
      symbol,
      type,
      lengthHead: lengthHeadM * 1000,
      lengthTotal: lengthTotalM * 1000,
      diameter,
      diameterExpanded: isNaN(diameterExpanded) ? diameter : diameterExpanded,
      concrete: concrete || 'Fc21',
    });
  }

  log.debug(`parsePileSections: ${result.length} 件`);
  return result;
}

/**
 * 場所打ち杭基礎断面をパース
 *
 * ヘッダー列インデックス（2段ヘッダーをマージした場合）:
 *   0: 基礎符号
 *   1: 杭符号
 *   2: 杭本数
 *   3: タイプ
 *   4: 隅切り
 *   5: 杭間隔/Px (mm)
 *   6: 杭間隔/Py (mm)
 *   7: へりあき/Ex (mm)
 *   8: へりあき/Ey (mm)
 *   9: コンクリート/せい (mm) ※フーチング高さ
 *   10: Df
 *   11: 材料（コンクリート）
 *   12: 埋込長 (mm)
 *
 * フーチング幅は「杭径 + 2×へりあき」で計算（杭断面情報と組み合わせて使用）
 *
 * @param {Map} sections - パース済みセクション
 * @returns {Array<Object>} 杭基礎断面オブジェクト配列
 */
export function parsePileFoundationSections(sections) {
  const section = getSection(sections, '場所打ち杭基礎断面');
  if (!section || !section.data) {
    return [];
  }

  const result = [];

  for (const row of section.data) {
    const symbol = (row[0] || '').trim();
    if (!symbol) continue;

    const pileSymbol = (row[1] || '').trim();
    const pileCount = parseInt(row[2], 10) || 1;
    const edgeX = parseFloat(row[7]) || 0; // へりあきX (mm)
    const edgeY = parseFloat(row[8]) || 0; // へりあきY (mm)
    const height = parseInt(row[9], 10);
    const df = parseFloat(row[10]) || 0;
    const concrete = (row[11] || '').trim();
    const embedment = parseInt(row[12], 10);

    if (!pileSymbol) {
      log.warn(`杭基礎断面 ${symbol}: 杭符号が空`);
      continue;
    }

    result.push({
      symbol,
      pileSymbol,
      pileCount,
      edgeX,
      edgeY,
      height: isNaN(height) ? 0 : height,
      df,
      concrete: concrete || '',
      embedment: isNaN(embedment) ? 0 : embedment,
    });
  }

  log.debug(`parsePileFoundationSections: ${result.length} 件`);
  return result;
}

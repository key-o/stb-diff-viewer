/**
 * @fileoverview RC柱断面リストDXF出力モジュール
 *
 * RC柱断面リストのグリッドデータをDXFファイルとして出力します。
 * 断面外形・帯筋・主筋をDXFエンティティ（LINE, CIRCLE）として描画し、
 * 符号・寸法などのラベルをTEXTとして出力します。
 *
 * @module ui/sectionList/SectionListDxfExporter
 */

import { generateDxfContent, downloadDxf } from '../../../export/dxf/stb-to-dxf/index.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('ui/SectionListDxfExporter');

/** DXFレイヤー名 */
const LAYERS = {
  CONCRETE: 'CONCRETE',
  HOOP: 'HOOP',
  REBAR: 'REBAR',
  LABEL: 'LABEL',
  BORDER: 'BORDER',
};

/** テキスト高さ (mm) */
const LABEL_H = 150;
const DIM_H = 100;

/** セル間マージン (mm) */
const CELL_GAP = 400;

/** 行ヘッダー幅 (mm) */
const ROW_HEADER_W = 700;

/** 列ヘッダー高さ (mm) - 符号行 + 断面名行 + 余白 */
const COL_HEADER_H = 600;

/** 情報行エリア高さ (mm) - コンクリート, 主筋X/Y, フープ の3行分 */
const INFO_AREA_H = LABEL_H * 6;

/**
 * 鉄筋径文字列 (例: "D25") からミリメートル換算の半径を返す
 * @param {string} dia - "D25" など
 * @returns {number} 半径 (mm)
 */
function barRadius(dia) {
  if (!dia) return 6;
  const m = String(dia).match(/\d+/);
  return m ? parseInt(m[0]) / 2 : 6;
}

/**
 * JIS鉄筋凡例に対応したDXFシンボルを lines2D / circles2D に追記する
 * @param {Array} lines2D
 * @param {Array} circles2D
 * @param {string} dia - "D25" など
 * @param {number} cx - 中心X (mm)
 * @param {number} cy - 中心Y (mm)
 * @param {string} layer - レイヤー名
 */
function addRebarSymbol(lines2D, circles2D, dia, cx, cy, layer) {
  const r = barRadius(dia);
  const n = dia ? parseInt(String(dia).match(/\d+/)?.[0] || '0', 10) : 0;

  if (n <= 0 || n <= 12) {
    // D10相当: 塗りつぶし円（DXFでは通常の実線円で代用）
    circles2D.push({ center: { x: cx, y: cy }, radius: r, layer });
  } else if (n === 13) {
    // D13: × (クロス)
    const s = r * 0.9;
    lines2D.push({ start: { x: cx - s, y: cy - s }, end: { x: cx + s, y: cy + s }, layer });
    lines2D.push({ start: { x: cx - s, y: cy + s }, end: { x: cx + s, y: cy - s }, layer });
  } else if (n <= 16) {
    // D16: 斜線入り円 (⊘)
    circles2D.push({ center: { x: cx, y: cy }, radius: r, layer });
    const d = r * 0.707;
    lines2D.push({ start: { x: cx - d, y: cy - d }, end: { x: cx + d, y: cy + d }, layer });
  } else if (n <= 22) {
    // D19/D22: 中空円または塗りつぶし円
    circles2D.push({ center: { x: cx, y: cy }, radius: r, layer });
  } else if (n <= 25) {
    // D25: 中心点付き円 (⊙)
    circles2D.push({ center: { x: cx, y: cy }, radius: r, layer });
    circles2D.push({ center: { x: cx, y: cy }, radius: r * 0.15, layer });
  } else if (n <= 29) {
    // D29: ×印入り円 (⊗)
    circles2D.push({ center: { x: cx, y: cy }, radius: r, layer });
    const d = r * 0.6;
    lines2D.push({ start: { x: cx - d, y: cy - d }, end: { x: cx + d, y: cy + d }, layer });
    lines2D.push({ start: { x: cx - d, y: cy + d }, end: { x: cx + d, y: cy - d }, layer });
  } else {
    // D32以上: 二重円 (◎)
    circles2D.push({ center: { x: cx, y: cy }, radius: r, layer });
    circles2D.push({ center: { x: cx, y: cy }, radius: r * 0.65, layer });
  }
}

/**
 * 矩形を4本の線分に変換
 * @param {number} x - 左下X
 * @param {number} y - 左下Y
 * @param {number} w - 幅
 * @param {number} h - 高さ
 * @param {string} layer - レイヤー名
 * @returns {Array<Object>} LINE エンティティ配列
 */
function rectLines(x, y, w, h, layer) {
  return [
    { start: { x, y }, end: { x: x + w, y }, layer },
    { start: { x: x + w, y }, end: { x: x + w, y: y + h }, layer },
    { start: { x: x + w, y: y + h }, end: { x, y: y + h }, layer },
    { start: { x, y: y + h }, end: { x, y }, layer },
  ];
}

/**
 * 矩形断面の主筋位置を計算（SVGレンダラーと同一ロジック）
 * @param {number} countX - X方向本数（片側）
 * @param {number} countY - Y方向本数（片側）
 * @param {number} xLeft  - 主筋左端X
 * @param {number} xRight - 主筋右端X
 * @param {number} yTop   - 主筋上端Y
 * @param {number} yBottom - 主筋下端Y
 * @returns {Array<{x: number, y: number}>}
 */
function calcRectRebarPos(countX, countY, xLeft, xRight, yTop, yBottom) {
  const pos = [];

  // 4隅
  pos.push({ x: xLeft, y: yTop });
  pos.push({ x: xRight, y: yTop });
  pos.push({ x: xLeft, y: yBottom });
  pos.push({ x: xRight, y: yBottom });

  // 左辺・右辺 (X方向)
  if (countX > 2) {
    for (let i = 1; i <= countX - 2; i++) {
      const y = yTop + ((yBottom - yTop) * i) / (countX - 1);
      pos.push({ x: xLeft, y });
      pos.push({ x: xRight, y });
    }
  }

  // 上辺・下辺 (Y方向)
  if (countY > 2) {
    for (let i = 1; i <= countY - 2; i++) {
      const x = xLeft + ((xRight - xLeft) * i) / (countY - 1);
      pos.push({ x, y: yTop });
      pos.push({ x, y: yBottom });
    }
  }

  return pos;
}

/**
 * 断面1セル分のエンティティを生成
 * @param {Array} lines2D - 線分配列（追記先）
 * @param {Array} circles2D - 円配列（追記先）
 * @param {Array} texts2D - テキスト配列（追記先）
 * @param {Object} sectionData - 断面データ
 * @param {number} cx - 断面エリア中心X (mm)
 * @param {number} cy - 断面エリア中心Y (mm)
 * @param {number} infoBaseY - 情報行エリアの上端Y（断面エリア下端）(mm)
 */
function drawSectionEntities(lines2D, circles2D, texts2D, sectionData, cx, cy, infoBaseY) {
  const isCircular = sectionData.isCircular || sectionData.diameter > 0;
  const cover = sectionData.cover || 50;
  const mainBar = sectionData.mainBar || {};
  const hoop = sectionData.hoop || {};

  const mBarR = barRadius(mainBar.dia);
  const hoopR = barRadius(hoop.dia);

  if (isCircular) {
    const D = sectionData.diameter || 500;
    const outerR = D / 2;
    const count = mainBar.count || mainBar.countX || 8;

    // コンクリート外形
    circles2D.push({ center: { x: cx, y: cy }, radius: outerR, layer: LAYERS.CONCRETE });

    // 帯筋
    const hoopCenterR = outerR - cover - hoopR;
    if (hoopCenterR > 0) {
      circles2D.push({ center: { x: cx, y: cy }, radius: hoopCenterR, layer: LAYERS.HOOP });
    }

    // 主筋
    const rebarCenterR = outerR - cover - hoopR * 2 - mBarR;
    if (rebarCenterR > 0) {
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
        const bx = cx + rebarCenterR * Math.cos(angle);
        const by = cy + rebarCenterR * Math.sin(angle);
        addRebarSymbol(lines2D, circles2D, mainBar.dia, bx, by, LAYERS.REBAR);
      }
    }

    // 寸法テキスト（断面下・右）
    texts2D.push({
      position: { x: cx - DIM_H, y: cy - outerR - 180 },
      text: `${D}`,
      layer: LAYERS.LABEL,
      height: DIM_H,
    });
    texts2D.push({
      position: { x: cx + outerR + 80, y: cy - DIM_H / 2 },
      text: `${D}`,
      layer: LAYERS.LABEL,
      height: DIM_H,
    });

    // 主筋本数ラベル（左側 = 総本数の半数）
    const halfCount = Math.floor(count / 2);
    if (halfCount > 0) {
      texts2D.push({
        position: { x: cx - outerR - 250, y: cy - DIM_H / 2 },
        text: `${halfCount}`,
        layer: LAYERS.LABEL,
        height: DIM_H,
      });
    }
  } else {
    const W = sectionData.width || 500;
    const H = sectionData.height || 500;
    const x0 = cx - W / 2;
    const y0 = cy - H / 2;

    // コンクリート外形
    lines2D.push(...rectLines(x0, y0, W, H, LAYERS.CONCRETE));

    // 帯筋（フープ中心 = cover + hoopR）
    const hoopOffset = cover + hoopR;
    const hoopX = x0 + hoopOffset;
    const hoopY = y0 + hoopOffset;
    const hoopW = W - hoopOffset * 2;
    const hoopH = H - hoopOffset * 2;
    if (hoopW > 0 && hoopH > 0) {
      lines2D.push(...rectLines(hoopX, hoopY, hoopW, hoopH, LAYERS.HOOP));
    }

    // 主筋（中心 = cover + hoopDia + mBarR）
    const rebarOffset = cover + hoopR * 2 + mBarR;
    const countX = mainBar.countX || mainBar.count || 4;
    const countY = mainBar.countY || mainBar.count || 4;
    const xLeft = x0 + rebarOffset;
    const xRight = x0 + W - rebarOffset;
    const yTop = y0 + rebarOffset;
    const yBottom = y0 + H - rebarOffset;
    calcRectRebarPos(countX, countY, xLeft, xRight, yTop, yBottom).forEach((p) => {
      addRebarSymbol(lines2D, circles2D, mainBar.dia, p.x, p.y, LAYERS.REBAR);
    });

    // 寸法テキスト（断面下・右）
    texts2D.push({
      position: { x: cx - DIM_H, y: y0 - 180 },
      text: `${W}`,
      layer: LAYERS.LABEL,
      height: DIM_H,
    });
    texts2D.push({
      position: { x: x0 + W + 80, y: cy - DIM_H / 2 },
      text: `${H}`,
      layer: LAYERS.LABEL,
      height: DIM_H,
    });

    // 主筋本数ラベル（左側 = X方向片面本数、上部 = Y方向片面本数）
    texts2D.push({
      position: { x: x0 - 250, y: cy - DIM_H / 2 },
      text: `${countX}`,
      layer: LAYERS.LABEL,
      height: DIM_H,
    });
    texts2D.push({
      position: { x: cx - DIM_H / 2, y: y0 + H + 120 },
      text: `${countY}`,
      layer: LAYERS.LABEL,
      height: DIM_H,
    });
  }

  // 情報行テキスト（断面エリア下の infoBaseY から下方向へ）
  const labelX = cx - (isCircular ? sectionData.diameter : sectionData.width || 500) / 2;

  // コンクリート寸法
  const concreteText = isCircular
    ? `${sectionData.diameter || ''}x`
    : `${sectionData.width || ''}x${sectionData.height || ''}`;
  texts2D.push({
    position: { x: labelX, y: infoBaseY - LABEL_H * 1.5 },
    text: concreteText,
    layer: LAYERS.LABEL,
    height: LABEL_H,
  });

  // 主筋X/Y
  if (mainBar.dia) {
    let rebarText;
    if (isCircular) {
      const cnt = mainBar.count || mainBar.countX || 0;
      rebarText = `${cnt} - ${mainBar.dia}/0 -`;
    } else {
      const nX = mainBar.countX || 0;
      const nY = mainBar.countY || 0;
      rebarText = `${2 * nX} - ${mainBar.dia}/${2 * nY} - ${mainBar.dia}`;
    }
    texts2D.push({
      position: { x: labelX, y: infoBaseY - LABEL_H * 3.0 },
      text: rebarText,
      layer: LAYERS.LABEL,
      height: LABEL_H,
    });
  }

  // フープ記号 + テキスト
  if (hoop.dia) {
    const pitch = hoop.pitch ? `@${hoop.pitch}` : '';
    const hoopTextY = infoBaseY - LABEL_H * 4.5;
    const symSize = LABEL_H * 0.5; // 記号サイズ
    const symCy = hoopTextY + symSize / 2;
    if (isCircular) {
      // 円形断面: 小円記号
      circles2D.push({
        center: { x: labelX + symSize / 2, y: symCy },
        radius: symSize / 2,
        layer: LAYERS.HOOP,
      });
    } else {
      // 矩形断面: 小正方形記号
      lines2D.push(...rectLines(labelX, hoopTextY, symSize, symSize, LAYERS.HOOP));
    }
    texts2D.push({
      position: { x: labelX + symSize + 30, y: hoopTextY },
      text: `- ${hoop.dia}${pitch}`,
      layer: LAYERS.LABEL,
      height: LABEL_H,
    });
  }
}

/**
 * バウンドを更新
 * @param {Object} bounds - {min, max}
 * @param {number} x
 * @param {number} y
 */
function updateBounds(bounds, x, y) {
  bounds.min.x = Math.min(bounds.min.x, x);
  bounds.min.y = Math.min(bounds.min.y, y);
  bounds.max.x = Math.max(bounds.max.x, x);
  bounds.max.y = Math.max(bounds.max.y, y);
}

/**
 * RC柱断面リストグリッドをDXFファイルとしてエクスポート
 * @param {Object} gridData - extractColumnSectionGrid の戻り値
 * @param {string} [filename='rc-column-section-list'] - 出力ファイル名（拡張子なし）
 * @param {string} [stbName=''] - タイトルに表示するSTBファイル名
 * @returns {Promise<void>}
 */
export async function exportColumnSectionListToDxf(
  gridData,
  filename = 'rc-column-section-list',
  stbName = '',
) {
  const { stories, symbols, grid } = gridData;

  if (!stories?.length || !symbols?.length) {
    log.warn('断面データが空のためDXFを出力できません');
    return;
  }

  // セルサイズを断面の最大寸法から算出
  let maxDim = 600;
  stories.forEach((story) => {
    symbols.forEach((symbol) => {
      const sec = grid.get(story.id)?.get(symbol);
      const data = Array.isArray(sec) ? sec[0] : sec;
      if (!data) return;
      const dim = Math.max(data.width || 0, data.height || 0, data.diameter || 0);
      if (dim > maxDim) maxDim = dim;
    });
  });

  const SECTION_AREA_H = maxDim + CELL_GAP * 2;
  const CELL_W = maxDim + CELL_GAP * 2;
  const CELL_H = SECTION_AREA_H + INFO_AREA_H;

  const lines2D = [];
  const circles2D = [];
  const texts2D = [];
  const bounds = { min: { x: Infinity, y: Infinity }, max: { x: -Infinity, y: -Infinity } };

  // テーブル全体の境界計算
  const tableLeft = 0;
  const tableRight = ROW_HEADER_W + symbols.length * CELL_W;
  const tableTop = COL_HEADER_H;
  const tableBottom = -(stories.length * CELL_H);

  // タイトル（STBファイル名）
  if (stbName) {
    texts2D.push({
      position: { x: tableLeft + 40, y: tableTop + LABEL_H + 50 },
      text: stbName,
      layer: LAYERS.LABEL,
      height: LABEL_H,
    });
    updateBounds(bounds, tableLeft, tableTop + LABEL_H * 2);
  }

  // 外枠線
  lines2D.push(
    ...rectLines(
      tableLeft,
      tableBottom,
      tableRight - tableLeft,
      tableTop - tableBottom,
      LAYERS.BORDER,
    ),
  );
  // 列ヘッダー/データ間区切り線
  lines2D.push({
    start: { x: tableLeft, y: 0 },
    end: { x: tableRight, y: 0 },
    layer: LAYERS.BORDER,
  });
  // 行ヘッダー縦区切り線
  lines2D.push({
    start: { x: ROW_HEADER_W, y: tableBottom },
    end: { x: ROW_HEADER_W, y: tableTop },
    layer: LAYERS.BORDER,
  });
  // 各列の縦区切り線
  symbols.forEach((_, ci) => {
    if (ci < symbols.length - 1) {
      const x = ROW_HEADER_W + (ci + 1) * CELL_W;
      lines2D.push({ start: { x, y: tableBottom }, end: { x, y: tableTop }, layer: LAYERS.BORDER });
    }
  });
  // 各行の横区切り線
  stories.forEach((_, ri) => {
    if (ri < stories.length - 1) {
      const y = -(ri + 1) * CELL_H;
      lines2D.push({ start: { x: tableLeft, y }, end: { x: tableRight, y }, layer: LAYERS.BORDER });
    }
  });

  // 列ヘッダー Row1 - 「符号」ラベル + 各符号名
  const symRowY = COL_HEADER_H - LABEL_H - 80;
  texts2D.push({
    position: { x: 40, y: symRowY },
    text: '符号',
    layer: LAYERS.LABEL,
    height: LABEL_H,
  });
  symbols.forEach((symbol, ci) => {
    const cx = ROW_HEADER_W + ci * CELL_W + CELL_W / 2;
    texts2D.push({
      position: { x: cx - symbol.length * LABEL_H * 0.3, y: symRowY },
      text: symbol,
      layer: LAYERS.LABEL,
      height: LABEL_H,
    });
    updateBounds(bounds, cx, symRowY + LABEL_H);
  });

  // 列ヘッダー Row2 - 「断面名」ラベル + 「全断面」per symbol
  const subRowY = LABEL_H + 80;
  texts2D.push({
    position: { x: 40, y: subRowY },
    text: '断面名',
    layer: LAYERS.LABEL,
    height: LABEL_H,
  });
  symbols.forEach((_, ci) => {
    const cx = ROW_HEADER_W + ci * CELL_W + CELL_W / 2;
    texts2D.push({
      position: { x: cx - LABEL_H * 1.5, y: subRowY },
      text: '全断面',
      layer: LAYERS.LABEL,
      height: LABEL_H,
    });
  });

  // 「階」ラベル（ヘッダー左端・符号行と同じ高さ）
  texts2D.push({
    position: { x: 10, y: symRowY },
    text: '階',
    layer: LAYERS.LABEL,
    height: LABEL_H,
  });

  // 行（階）ループ：データ行は y=0 から下方向へ
  stories.forEach((story, ri) => {
    const cellTopY = -(ri * CELL_H); // ヘッダー直下から開始
    // 断面エリア中心Y
    const cy = cellTopY - SECTION_AREA_H / 2;
    // 情報行エリアの上端
    const infoBaseY = cellTopY - SECTION_AREA_H;

    // 行ヘッダー
    texts2D.push({
      position: { x: 40, y: cy },
      text: '断面',
      layer: LAYERS.LABEL,
      height: LABEL_H,
    });
    texts2D.push({
      position: { x: 40, y: cy - LABEL_H * 1.5 },
      text: story.name || story.id,
      layer: LAYERS.LABEL,
      height: LABEL_H,
    });

    // 情報行ラベル（行ヘッダー）
    texts2D.push({
      position: { x: 40, y: infoBaseY - LABEL_H * 1.5 },
      text: 'コンクリート',
      layer: LAYERS.LABEL,
      height: LABEL_H,
    });
    texts2D.push({
      position: { x: 40, y: infoBaseY - LABEL_H * 3.0 },
      text: '主筋/帯筋X/Y',
      layer: LAYERS.LABEL,
      height: LABEL_H,
    });
    texts2D.push({
      position: { x: 40, y: infoBaseY - LABEL_H * 4.5 },
      text: 'フープ',
      layer: LAYERS.LABEL,
      height: LABEL_H,
    });

    symbols.forEach((symbol, ci) => {
      const cellLeftX = ROW_HEADER_W + ci * CELL_W;
      const secCx = cellLeftX + CELL_W / 2;

      const rawSec = grid.get(story.id)?.get(symbol);
      const sectionData = Array.isArray(rawSec) ? rawSec[0] : rawSec;

      if (sectionData) {
        drawSectionEntities(lines2D, circles2D, texts2D, sectionData, secCx, cy, infoBaseY);
      }

      updateBounds(bounds, cellLeftX, cellTopY - CELL_H);
      updateBounds(bounds, cellLeftX + CELL_W, cellTopY);
    });
  });

  // バウンド補正（空の場合のフォールバック）
  if (!isFinite(bounds.min.x)) {
    bounds.min = { x: 0, y: -10000 };
    bounds.max = { x: 10000, y: 0 };
  }

  const layerNames = Object.values(LAYERS);

  log.info('断面リストDXF生成', {
    stories: stories.length,
    symbols: symbols.length,
    lines: lines2D.length,
    circles: circles2D.length,
    texts: texts2D.length,
    stbName,
  });

  const dxfContent = generateDxfContent(bounds, layerNames, lines2D, texts2D, circles2D);
  await downloadDxf(dxfContent, filename);
}

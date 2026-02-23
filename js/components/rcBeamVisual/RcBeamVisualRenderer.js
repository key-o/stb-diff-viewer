/**
 * @fileoverview RC梁断面ビジュアルレンダラー
 *
 * SVGを使用してRC梁の断面図を描画します。
 * 梁特有の配筋（上端筋・下端筋・腹筋・スターラップ）に対応しています。
 * 矩形断面のみサポート、複数位置（LEFT/CENTER/RIGHT）の断面図を生成可能です。
 *
 * RcColumnVisualRendererを参考に実装
 */

import {
  addBarSymbolDefs,
  placeBarSymbol as placeBarSymbolBase,
  createSvgElement,
} from '../rcColumnVisual/rebarSymbolDefs.js';

const BEAM_BAR_PREFIX = 'beam-bar';

/**
 * 梁用の鉄筋シンボル配置ラッパー
 */
function placeBarSymbol(svg, dia, cx, cy, scale = 1) {
  placeBarSymbolBase(svg, dia, cx, cy, scale, BEAM_BAR_PREFIX);
}

function parseBarDiameterMm(dia, fallback = 25) {
  const match = String(dia || '')
    .toUpperCase()
    .match(/[DT](\d+)/);
  if (!match) return fallback;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * RC梁断面描画クラス
 */
export class RcBeamVisualRenderer {
  constructor(options = {}) {
    this.settings = {
      barRadius: options.barRadius || 6,
      barScale: options.barScale || 0.8,
      maxWidth: options.maxWidth || 120,
      maxHeight: options.maxHeight || 120,
      padding: options.padding || 20,
      showDimensions: options.showDimensions !== false,
    };
  }

  /**
   * 梁断面をSVG文字列として描画
   * @param {Object} beamData - 梁断面データ
   *   {width, depth, cover: {top, bottom}, topBar, bottomBar, stirrup, webBar}
   * @returns {string} SVG文字列
   */
  renderToString(beamData, renderOptions = {}) {
    const svg = this.renderToElement(beamData, renderOptions);
    return svg ? svg.outerHTML : '';
  }

  /**
   * 梁断面をSVG要素として描画
   * @param {Object} beamData - 梁断面データ
   * @returns {SVGElement}
   */
  renderToElement(beamData, renderOptions = {}) {
    if (!beamData) {
      console.warn('[RcBeamVisualRenderer] beamData is null or undefined');
      return null;
    }
    if (!beamData.width || !beamData.depth) {
      console.warn('[RcBeamVisualRenderer] Invalid dimensions:', {
        width: beamData.width,
        depth: beamData.depth,
        beamData,
      });
      return null;
    }

    const { width, depth, cover = {}, topBar, bottomBar, stirrup, webBar } = beamData;
    const { maxWidth, maxHeight, padding } = this.settings;

    // スケーリング計算
    const scale =
      Number.isFinite(renderOptions.fixedScale) && renderOptions.fixedScale > 0
        ? renderOptions.fixedScale
        : Math.min((maxWidth - padding * 2) / width, (maxHeight - padding * 2) / depth);

    const svgWidth = width * scale + padding * 2;
    const svgHeight = depth * scale + padding * 2;

    const svg = createSvgElement('svg', {
      width: svgWidth,
      height: svgHeight,
      viewBox: `0 0 ${svgWidth} ${svgHeight}`,
      xmlns: 'http://www.w3.org/2000/svg',
    });

    // 鉄筋シンボル定義を追加
    addBarSymbolDefs(svg, BEAM_BAR_PREFIX);

    // 背景
    svg.appendChild(
      createSvgElement('rect', {
        x: 0,
        y: 0,
        width: svgWidth,
        height: svgHeight,
        fill: 'white',
      }),
    );

    const rectX = padding;
    const rectY = padding;
    const rectW = width * scale;
    const rectH = depth * scale;

    // コンクリート外形（矩形）
    svg.appendChild(
      createSvgElement('rect', {
        x: rectX,
        y: rectY,
        width: rectW,
        height: rectH,
        fill: '#f8f8f8',
        stroke: 'black',
        'stroke-width': 2,
      }),
    );

    // スターラップ（U字型フープ）
    this.drawStirrup(svg, rectX, rectY, rectW, rectH, cover, stirrup, scale);

    // 上端筋
    this.drawTopRebars(svg, topBar, rectX, rectY, rectW, cover, scale);

    // 下端筋
    this.drawBottomRebars(svg, bottomBar, rectX, rectY, rectW, rectH, cover, scale);

    // 腹筋（側面の補助筋）
    if (webBar && webBar.count > 0) {
      this.drawWebRebars(svg, webBar, rectX, rectY, rectW, rectH, cover, scale);
    }

    // 寸法表示
    if (this.settings.showDimensions) {
      this.drawDimensions(svg, width, depth, rectX, rectY, rectW, rectH);
    }

    return svg;
  }

  /**
   * スターラップ（U字型）を描画
   * @private
   */
  drawStirrup(svg, rectX, rectY, rectW, rectH, cover, stirrup, scale) {
    if (!stirrup || !stirrup.dia) return;

    const coverTop = (cover.top || 40) * scale;
    const coverBottom = (cover.bottom || 40) * scale;
    const coverLeft = (cover.left || cover.top || 40) * scale;
    const coverRight = (cover.right || cover.top || 40) * scale;

    const stirrupLeft = rectX + coverLeft - 1;
    const stirrupRight = rectX + rectW - coverRight + 1;
    const stirrupTop = rectY + coverTop - 2;
    const stirrupBottom = rectY + rectH - coverBottom + 2;

    svg.appendChild(
      createSvgElement('rect', {
        x: stirrupLeft,
        y: stirrupTop,
        width: stirrupRight - stirrupLeft,
        height: stirrupBottom - stirrupTop,
        fill: 'none',
        stroke: '#666',
        'stroke-width': 1.5,
      }),
    );
  }

  /**
   * 上端筋を描画（水平配置、複数本の場合は等間隔）
   * @private
   */
  drawTopRebars(svg, topBar, rectX, rectY, rectW, cover, scale) {
    if (!topBar || topBar.count <= 0) return;

    const coverTop = (cover.top || 40) * scale;
    const coverLeft = (cover.left || cover.top || 40) * scale;
    const coverRight = (cover.right || cover.top || 40) * scale;
    const dia = topBar.dia || 'D25';
    const { xPositions, barHalf, symbolScale } = this.computeBarLayout(
      topBar.count,
      dia,
      rectX,
      rectW,
      coverLeft,
      coverRight,
      scale,
    );
    const y = rectY + coverTop + barHalf;
    xPositions.forEach((x) => {
      placeBarSymbol(svg, dia, x, y, symbolScale);
    });
  }

  /**
   * 下端筋を描画（水平配置、複数本の場合は等間隔）
   * @private
   */
  drawBottomRebars(svg, bottomBar, rectX, rectY, rectW, rectH, cover, scale) {
    if (!bottomBar || bottomBar.count <= 0) return;

    const coverBottom = (cover.bottom || 40) * scale;
    const coverLeft = (cover.left || cover.top || 40) * scale;
    const coverRight = (cover.right || cover.top || 40) * scale;
    const dia = bottomBar.dia || 'D25';
    const { xPositions, barHalf, symbolScale } = this.computeBarLayout(
      bottomBar.count,
      dia,
      rectX,
      rectW,
      coverLeft,
      coverRight,
      scale,
    );
    const y = rectY + rectH - coverBottom - barHalf;
    xPositions.forEach((x) => {
      placeBarSymbol(svg, dia, x, y, symbolScale);
    });
  }

  /**
   * 腹筋を描画（側面に垂直配置）
   * 梁せいが大きい場合に側面（左右）に配置される補助筋
   * @private
   */
  drawWebRebars(svg, webBar, rectX, rectY, rectW, rectH, cover, scale) {
    if (!webBar || webBar.count <= 0) return;

    const coverTop = (cover.top || 40) * scale;
    const coverBottom = (cover.bottom || 40) * scale;
    const coverLeft = (cover.left || coverTop) * scale;
    const coverRight = (cover.right || coverTop) * scale;
    const barHalf = this.computeBarHalfSize(webBar.dia || 'D13', scale);
    const dia = webBar.dia || 'D13';

    // 左右両側に配置
    const xLeft = rectX + coverLeft + barHalf;
    const xRight = rectX + rectW - coverRight - barHalf;

    // 上端筋と下端筋の間の領域を均等に分割
    const usableHeight = rectH - coverTop - coverBottom - barHalf * 2;
    const spacing = usableHeight / (webBar.count + 1);

    // 複数本の腹筋を垂直方向に配置
    for (let i = 1; i <= webBar.count; i++) {
      const y = rectY + coverTop + barHalf + spacing * i;

      // 左側腹筋
      placeBarSymbol(svg, dia, xLeft, y, this.computeBarSymbolScale(dia, scale) * 0.9);

      // 右側腹筋
      placeBarSymbol(svg, dia, xRight, y, this.computeBarSymbolScale(dia, scale) * 0.9);
    }
  }

  /**
   * 寸法表示（幅×せい）
   * @private
   */
  drawDimensions(svg, width, depth, rectX, rectY, rectW, rectH) {
    const dimStyle = {
      'font-size': '10px',
      'font-family': 'sans-serif',
      fill: '#666',
    };

    // 幅表示
    const widthText = createSvgElement('text', {
      x: rectX + rectW / 2,
      y: rectY - 8,
      'text-anchor': 'middle',
      ...dimStyle,
    });
    widthText.textContent = `${width}`;
    svg.appendChild(widthText);

    // せい表示
    const depthText = createSvgElement('text', {
      x: rectX - 12,
      y: rectY + rectH / 2,
      'text-anchor': 'middle',
      'writing-mode': 'tb',
      ...dimStyle,
    });
    depthText.textContent = `${depth}`;
    svg.appendChild(depthText);
  }

  /**
   * 鉄筋配置（X方向）を計算
   * @private
   */
  computeBarLayout(count, dia, rectX, rectW, coverStart, coverEnd, sectionScale) {
    const safeCount = Math.max(1, Number.parseInt(count, 10) || 1);
    const barHalf = this.computeBarHalfSize(
      dia,
      sectionScale,
      safeCount,
      rectW,
      coverStart,
      coverEnd,
    );
    const symbolScale = this.computeBarSymbolScale(dia, sectionScale, barHalf);
    const startX = rectX + coverStart + barHalf;
    const endX = rectX + rectW - coverEnd - barHalf;

    if (safeCount === 1 || endX <= startX) {
      return { xPositions: [rectX + rectW / 2], barHalf, symbolScale };
    }

    const spacing = (endX - startX) / (safeCount - 1);
    const xPositions = [];
    for (let i = 0; i < safeCount; i++) {
      xPositions.push(startX + spacing * i);
    }

    return { xPositions, barHalf, symbolScale };
  }

  /**
   * 表示上の鉄筋半径(px)を計算
   * @private
   */
  computeBarHalfSize(dia, sectionScale, count = 1, rectW = 0, coverStart = 0, coverEnd = 0) {
    const diaMm = parseBarDiameterMm(dia);
    const nominalHalf = (diaMm * sectionScale) / 2;
    const maxByLayout = Math.max(
      0.9,
      (rectW - coverStart - coverEnd - (count - 1) * 1.2) / (count * 2),
    );
    return Math.max(0.9, Math.min(4.2, nominalHalf, maxByLayout));
  }

  /**
   * 鉄筋シンボルのスケールを算出
   * @private
   */
  computeBarSymbolScale(dia, sectionScale, barHalf = null) {
    const desiredHalf = barHalf ?? this.computeBarHalfSize(dia, sectionScale);
    // D25シンボル半径6を基準
    const baseHalf = 6;
    return (desiredHalf / baseHalf) * this.settings.barScale;
  }
}

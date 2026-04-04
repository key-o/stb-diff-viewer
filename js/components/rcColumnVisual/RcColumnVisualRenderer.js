/**
 * @fileoverview RC柱断面ビジュアルレンダラー
 *
 * SVGを使用してRC柱の断面図を描画します。
 * 断面リスト用に最適化されており、コンテナ非依存でSVG文字列を生成可能です。
 * 矩形・円形断面に対応し、主筋・芯鉄筋・帯筋を描画します。
 */

import {
  addBarSymbolDefs,
  placeBarSymbol as placeBarSymbolBase,
  createSvgElement,
} from './rebarSymbolDefs.js';

const COL_BAR_PREFIX = 'col-bar';

/**
 * 柱用の鉄筋シンボル配置ラッパー
 */
function placeBarSymbol(svg, dia, cx, cy, scale = 1) {
  placeBarSymbolBase(svg, dia, cx, cy, scale, COL_BAR_PREFIX);
}

/**
 * RC柱断面描画クラス
 */
export class RcColumnVisualRenderer {
  constructor(options = {}) {
    this.settings = {
      barRadius: options.barRadius || 7,
      barScale: options.barScale || 1.0,
      maxWidth: options.maxWidth || 150,
      maxHeight: options.maxHeight || 150,
      padding: options.padding || 25,
      showDimensions: options.showDimensions !== false,
    };
  }

  /**
   * 矩形断面をSVG文字列として描画
   * @param {Object} sectionData - 断面データ
   * @returns {string} SVG文字列
   */
  renderRectangularToString(sectionData) {
    const svg = this.renderRectangularToElement(sectionData);
    return svg.outerHTML;
  }

  /**
   * 矩形断面をSVG要素として描画
   * @param {Object} sectionData - 断面データ
   * @returns {SVGElement}
   */
  renderRectangularToElement(sectionData) {
    const { width, height, cover = 50, mainBar, hoop, coreBar } = sectionData;
    const { maxWidth, maxHeight, padding } = this.settings;

    const scale = Math.min((maxWidth - padding * 2) / width, (maxHeight - padding * 2) / height);

    const svgWidth = width * scale + padding * 2;
    const svgHeight = height * scale + padding * 2;

    const svg = createSvgElement('svg', {
      width: svgWidth,
      height: svgHeight,
      viewBox: `0 0 ${svgWidth} ${svgHeight}`,
      xmlns: 'http://www.w3.org/2000/svg',
    });

    addBarSymbolDefs(svg, COL_BAR_PREFIX);

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
    const rectH = height * scale;

    // コンクリート外形
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

    const coverScaled = cover * scale;

    // 帯筋描画（外周フープ + 多脚中間フープ）
    if (hoop && hoop.dia) {
      const hoopLeft = rectX + coverScaled - 3;
      const hoopRight = rectX + rectW - coverScaled + 3;
      const hoopTop = rectY + coverScaled - 3;
      const hoopBottom = rectY + rectH - coverScaled + 3;

      // 外周フープ
      svg.appendChild(
        createSvgElement('rect', {
          x: hoopLeft,
          y: hoopTop,
          width: hoopRight - hoopLeft,
          height: hoopBottom - hoopTop,
          fill: 'none',
          stroke: '#666',
          'stroke-width': 1.5,
        }),
      );

      // 多脚フープ（中間フープ線）
      const bandCountX = hoop.countX || 0;
      const bandCountY = hoop.countY || 0;

      // X方向の帯筋が3本以上 → 外周矩形(2本)を除いた中間フープ線を描画
      if (bandCountX > 2) {
        const innerLegs = bandCountX - 2;
        for (let i = 1; i <= innerLegs; i++) {
          const y = hoopTop + ((hoopBottom - hoopTop) * i) / (innerLegs + 1);
          svg.appendChild(
            createSvgElement('line', {
              x1: hoopLeft,
              y1: y,
              x2: hoopRight,
              y2: y,
              stroke: '#999',
              'stroke-width': 1,
              'stroke-dasharray': '3,2',
            }),
          );
        }
      }

      // Y方向の帯筋が3本以上 → 外周矩形(2本)を除いた中間フープ線を描画
      if (bandCountY > 2) {
        const innerLegs = bandCountY - 2;
        for (let i = 1; i <= innerLegs; i++) {
          const x = hoopLeft + ((hoopRight - hoopLeft) * i) / (innerLegs + 1);
          svg.appendChild(
            createSvgElement('line', {
              x1: x,
              y1: hoopTop,
              x2: x,
              y2: hoopBottom,
              stroke: '#999',
              'stroke-width': 1,
              'stroke-dasharray': '3,2',
            }),
          );
        }
      }
    }

    // 主筋配置
    this.renderRectangularRebars({
      svg,
      mainBar,
      rectBounds: { x: rectX, y: rectY, width: rectW, height: rectH },
      coverScaled,
    });

    // 芯鉄筋（中子筋）配置
    if (coreBar && (coreBar.countX > 0 || coreBar.countY > 0)) {
      this.renderCoreRebars({
        svg,
        coreBar,
        rectBounds: { x: rectX, y: rectY, width: rectW, height: rectH },
        coverScaled,
      });
    }

    // 寸法表示
    if (this.settings.showDimensions) {
      const dimStyle = { 'font-size': '10px', 'font-family': 'sans-serif', fill: '#666' };

      const xText = createSvgElement('text', {
        x: rectX + rectW / 2,
        y: rectY - 6,
        'text-anchor': 'middle',
        ...dimStyle,
      });
      xText.textContent = `${width}`;
      svg.appendChild(xText);

      const yText = createSvgElement('text', {
        x: rectX - 6,
        y: rectY + rectH / 2,
        'text-anchor': 'middle',
        'writing-mode': 'tb',
        ...dimStyle,
      });
      yText.textContent = `${height}`;
      svg.appendChild(yText);
    }

    return svg;
  }

  /**
   * @typedef {Object} RectangularRebarConfig
   * @property {SVGElement} svg - 描画先SVG要素
   * @property {Object} mainBar - 主筋設定
   * @property {{x: number, y: number, width: number, height: number}} rectBounds - 断面の矩形座標
   * @property {number} coverScaled - スケール済みかぶり厚さ
   */

  /**
   * 矩形断面の周囲配筋を描画
   * @param {RectangularRebarConfig} config - 矩形鉄筋設定
   * @private
   */
  renderRectangularRebars(config) {
    const { svg, mainBar, rectBounds, coverScaled } = config;
    const { x: rectX, y: rectY, width: rectW, height: rectH } = rectBounds;

    if (!mainBar || (!mainBar.countX && !mainBar.count) || (mainBar.countX || mainBar.count) <= 0)
      return;

    const countX = mainBar.countX || mainBar.count;
    const countY = mainBar.countY || mainBar.count;
    const dia = mainBar.dia || 'D25';
    const barRadius = this.settings.barRadius;

    const xLeft = rectX + coverScaled + barRadius;
    const xRight = rectX + rectW - coverScaled - barRadius;
    const yTop = rectY + coverScaled + barRadius;
    const yBottom = rectY + rectH - coverScaled - barRadius;

    const positions = this.calculateRectangularRebarPositions(
      countX,
      countY,
      xLeft,
      xRight,
      yTop,
      yBottom,
    );

    positions.forEach((pos) => {
      placeBarSymbol(svg, dia, pos.x, pos.y, this.settings.barScale);
    });
  }

  /**
   * 矩形断面の主筋位置を計算
   * @private
   */
  calculateRectangularRebarPositions(countX, countY, xLeft, xRight, yTop, yBottom) {
    const positions = [];

    if (countX <= 0 && countY <= 0) return positions;

    // 4隅
    positions.push({ x: xLeft, y: yTop });
    positions.push({ x: xRight, y: yTop });
    positions.push({ x: xLeft, y: yBottom });
    positions.push({ x: xRight, y: yBottom });

    // X方向筋：左辺と右辺
    if (countX > 2) {
      const intermediateX = countX - 2;
      for (let i = 0; i < intermediateX; i++) {
        const y = yTop + ((yBottom - yTop) * (i + 1)) / (intermediateX + 1);
        positions.push({ x: xLeft, y });
        positions.push({ x: xRight, y });
      }
    }

    // Y方向筋：上辺と下辺
    if (countY > 2) {
      const intermediateY = countY - 2;
      for (let i = 0; i < intermediateY; i++) {
        const x = xLeft + ((xRight - xLeft) * (i + 1)) / (intermediateY + 1);
        positions.push({ x, y: yTop });
        positions.push({ x, y: yBottom });
      }
    }

    return positions;
  }

  /**
   * @typedef {Object} CoreRebarConfig
   * @property {SVGElement} svg - 描画先SVG要素
   * @property {Object} coreBar - 芯鉄筋設定
   * @property {{x: number, y: number, width: number, height: number}} rectBounds - 断面の矩形座標
   * @property {number} coverScaled - スケール済みかぶり厚さ
   */

  /**
   * 芯鉄筋（中子筋）を描画
   * @param {CoreRebarConfig} config - 芯鉄筋設定
   * @private
   */
  renderCoreRebars(config) {
    const { svg, coreBar, rectBounds, coverScaled } = config;
    const { x: rectX, y: rectY, width: rectW, height: rectH } = rectBounds;

    const countX = coreBar.countX || 0;
    const countY = coreBar.countY || 0;
    const dia = coreBar.dia || 'D25';

    // 芯鉄筋の位置（主筋の内側、フープの内側に配置）
    const br = this.settings.barRadius;
    const xLeft = rectX + coverScaled + br;
    const xRight = rectX + rectW - coverScaled - br;
    const yTop = rectY + coverScaled + br;
    const yBottom = rectY + rectH - coverScaled - br;

    const coreScale = this.settings.barScale * 0.9;

    // countX: X方向の芯筋 → 左辺・右辺に半分ずつ縦方向に配置
    if (countX > 0) {
      const perSide = Math.ceil(countX / 2);
      const spacingY = (yBottom - yTop) / (perSide + 1);
      for (let i = 1; i <= perSide; i++) {
        const y = yTop + spacingY * i;
        placeBarSymbol(svg, dia, xLeft, y, coreScale);
        // 残り本数がある限り右辺にも配置
        if (i + perSide <= countX) {
          placeBarSymbol(svg, dia, xRight, y, coreScale);
        }
      }
    }

    // countY: Y方向の芯筋 → 上辺・下辺に半分ずつ横方向に配置
    if (countY > 0) {
      const perSide = Math.ceil(countY / 2);
      const spacingX = (xRight - xLeft) / (perSide + 1);
      for (let i = 1; i <= perSide; i++) {
        const x = xLeft + spacingX * i;
        placeBarSymbol(svg, dia, x, yTop, coreScale);
        if (i + perSide <= countY) {
          placeBarSymbol(svg, dia, x, yBottom, coreScale);
        }
      }
    }
  }

  /**
   * 円形断面をSVG文字列として描画
   * @param {Object} sectionData - 断面データ
   * @returns {string} SVG文字列
   */
  renderCircularToString(sectionData) {
    const svg = this.renderCircularToElement(sectionData);
    return svg.outerHTML;
  }

  /**
   * 円形断面をSVG要素として描画
   * @param {Object} sectionData - 断面データ
   * @returns {SVGElement}
   */
  renderCircularToElement(sectionData) {
    const { diameter, cover = 50, mainBar, hoop } = sectionData;
    const { maxWidth, maxHeight, padding } = this.settings;

    const maxSize = Math.min(maxWidth, maxHeight);
    const scale = (maxSize - padding * 2) / diameter;

    const svgWidth = diameter * scale + padding * 2;
    const svgHeight = diameter * scale + padding * 2;

    const svg = createSvgElement('svg', {
      width: svgWidth,
      height: svgHeight,
      viewBox: `0 0 ${svgWidth} ${svgHeight}`,
      xmlns: 'http://www.w3.org/2000/svg',
    });

    addBarSymbolDefs(svg, COL_BAR_PREFIX);

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

    const centerX = svgWidth / 2;
    const centerY = svgHeight / 2;
    const radiusScaled = (diameter / 2) * scale;

    // コンクリート外形
    svg.appendChild(
      createSvgElement('circle', {
        cx: centerX,
        cy: centerY,
        r: radiusScaled,
        fill: '#f8f8f8',
        stroke: 'black',
        'stroke-width': 2,
      }),
    );

    // 帯筋描画
    if (hoop && hoop.dia) {
      const coverScaled = cover * scale;
      const hoopRadius = radiusScaled - coverScaled;

      svg.appendChild(
        createSvgElement('circle', {
          cx: centerX,
          cy: centerY,
          r: hoopRadius,
          fill: 'none',
          stroke: '#666',
          'stroke-width': 1.5,
        }),
      );
    }

    // 主筋配置
    this.renderCircularRebars(svg, mainBar, centerX, centerY, radiusScaled, cover * scale);

    // 寸法表示
    if (this.settings.showDimensions) {
      const dimStyle = { 'font-size': '10px', 'font-family': 'sans-serif', fill: '#666' };

      const diaText = createSvgElement('text', {
        x: centerX,
        y: centerY - radiusScaled - 6,
        'text-anchor': 'middle',
        ...dimStyle,
      });
      diaText.textContent = `φ${diameter}`;
      svg.appendChild(diaText);
    }

    return svg;
  }

  /**
   * 円形断面の周囲配筋を描画
   * @private
   */
  renderCircularRebars(svg, mainBar, centerX, centerY, radiusScaled, coverScaled) {
    if (!mainBar || !mainBar.count || mainBar.count <= 0) return;

    const { count, dia = 'D25' } = mainBar;
    const barRadius = this.settings.barRadius;

    const rebarRadius = radiusScaled - coverScaled - barRadius;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
      const x = centerX + rebarRadius * Math.cos(angle);
      const y = centerY + rebarRadius * Math.sin(angle);
      placeBarSymbol(svg, dia, x, y, this.settings.barScale);
    }
  }

  /**
   * 断面データからSVG文字列を生成（形状自動判定）
   * @param {Object} sectionData - 断面データ
   * @returns {string} SVG文字列
   */
  renderToString(sectionData) {
    if (sectionData.diameter) {
      return this.renderCircularToString(sectionData);
    } else {
      return this.renderRectangularToString(sectionData);
    }
  }

  /**
   * 断面データからSVG要素を生成（形状自動判定）
   * @param {Object} sectionData - 断面データ
   * @returns {SVGElement}
   */
  renderToElement(sectionData) {
    if (sectionData.diameter) {
      return this.renderCircularToElement(sectionData);
    } else {
      return this.renderRectangularToElement(sectionData);
    }
  }
}

export default RcColumnVisualRenderer;

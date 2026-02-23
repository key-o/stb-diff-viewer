/**
 * @fileoverview RC梁断面リストテーブルレンダラー
 *
 * グリッド形式（階×符号）のRC梁断面リストテーブルをHTMLとして描画します。
 * 各セルに複数位置の断面図（LEFT/CENTER/RIGHT）と詳細情報を埋め込みます。
 *
 * @module ui/sectionList/BeamSectionListRenderer
 */

import { BaseSectionListRenderer } from './BaseSectionListRenderer.js';
import { RcBeamVisualRenderer } from '../../../components/rcBeamVisual/index.js';

/**
 * RC梁断面リストテーブルレンダラー
 */
export class BeamSectionListRenderer extends BaseSectionListRenderer {
  constructor(options = {}) {
    const svgRenderer = new RcBeamVisualRenderer({
      maxWidth: options.svgWidth || 100,
      maxHeight: options.svgHeight || 100,
      padding: options.svgPadding || 15,
      barScale: options.barScale || 0.8,
      showDimensions: false,
    });

    super(svgRenderer);

    this.scaleOptions = {
      scaleDenominator:
        Number(options.scaleDenominator) > 0 ? Number(options.scaleDenominator) : 40,
      previewDpi: Number(options.previewDpi) > 0 ? Number(options.previewDpi) : 96,
      maxDiagramWidth: Number(options.maxDiagramWidth) > 0 ? Number(options.maxDiagramWidth) : 90,
      maxDiagramHeight:
        Number(options.maxDiagramHeight) > 0 ? Number(options.maxDiagramHeight) : 90,
    };

    this.lastComputedScale = null;
    this.coverThickness =
      Number(options.coverThickness) > 0 ? Number(options.coverThickness) : null;

    this.options = {
      showPositionLabels: options.showPositionLabels !== false,
      compactMode: options.compactMode || false,
    };
  }

  // --- Abstract method implementations ---

  /** @override */
  getEmptyMessage() {
    return 'RC梁断面データがありません';
  }

  /** @override */
  getGridTableClassName() {
    return 'beam-section-grid-table';
  }

  /** @override */
  getGridCellData(grid, storyId, symbol) {
    return grid.get(`${storyId}:${symbol}`);
  }

  /** @override */
  getSectionIdentifiers(sectionData) {
    const dedupeId = sectionData?.sectionId || sectionData?.id || '';
    const labelId = sectionData?.sectionId || '';
    return { dedupeId, labelId };
  }

  // --- Virtual hook overrides ---

  /** @override */
  onBeforeGridRender(data) {
    this.lastComputedScale = this.computeUnifiedScale(data);
  }

  /** @override */
  onEmptyGrid() {
    this.lastComputedScale = null;
  }

  // --- Beam-specific methods ---

  /**
   * 断面セルの内容をレンダリング
   * @param {Object} sectionData - 断面データ
   * @returns {string} HTMLストリング
   */
  renderSectionCell(sectionData) {
    const parts = [];

    // ラッパーdivで囲む（flexboxレイアウト用）
    parts.push('<div class="section-cell-content beam-section-cell">');

    // 符号名（例："3F G1"）
    parts.push(`<div class="section-cell-name">${this.escapeHtml(sectionData.symbolNames)}</div>`);

    // 位置構成パターン表示
    const patternLabel = this.getPositionPatternLabel(sectionData.positionPattern);
    if (patternLabel) {
      parts.push(`<div class="section-cell-pattern">${patternLabel}</div>`);
    }

    // 複数位置の断面図を横並び表示
    parts.push('<div class="beam-positions-container">');

    const positionKeys = this.getRenderablePositionKeys(sectionData.positions);

    positionKeys.forEach((position) => {
      const positionData = sectionData.positions[position];
      if (positionData) {
        parts.push('<div class="beam-position-item">');

        // 位置ラベル
        if (this.options.showPositionLabels && positionKeys.length > 1) {
          const posLabel = this.getPositionLabel(position);
          parts.push(`<div class="position-label">${posLabel}</div>`);
        }

        // SVG断面図
        // cover情報をpositionDataに追加（RcBeamVisualRendererが必要とする）
        const beamDataForSvg = {
          ...positionData,
          cover: this.resolveRenderCover(sectionData.cover),
        };
        const svgString = this.svgRenderer.renderToString(beamDataForSvg, {
          fixedScale: this.lastComputedScale?.scale,
        });
        parts.push(`<div class="beam-section-diagram">${svgString}</div>`);

        // 寸法表示
        parts.push(`<div class="position-dims">${positionData.width}×${positionData.depth}</div>`);

        parts.push('</div>');
      }
    });

    parts.push('</div>'); // beam-positions-container

    // 詳細情報テーブル
    parts.push('<div class="section-cell-specs">');
    parts.push('<table class="section-specs-table beam-specs-table">');

    // コンクリート・強度
    const concreteStrength = sectionData.concrete?.strength || 'Fc21';
    parts.push(
      `<tr><td class="spec-label">コンクリート</td><td class="spec-value">${concreteStrength}</td></tr>`,
    );

    // 上端筋（複数位置対応）
    const topBarText = this.formatMultiPositionBar(sectionData.positions, 'topBar', positionKeys);
    parts.push(
      `<tr><td class="spec-label">上端筋</td><td class="spec-value">${topBarText}</td></tr>`,
    );

    // 下端筋（複数位置対応）
    const bottomBarText = this.formatMultiPositionBar(
      sectionData.positions,
      'bottomBar',
      positionKeys,
    );
    parts.push(
      `<tr><td class="spec-label">下端筋</td><td class="spec-value">${bottomBarText}</td></tr>`,
    );

    // スターラップ（複数位置対応）
    const stirrupText = this.formatMultiPositionStirrup(
      sectionData.positions,
      'stirrup',
      positionKeys,
    );
    parts.push(
      `<tr><td class="spec-label">スターラップ</td><td class="spec-value">${stirrupText}</td></tr>`,
    );

    // 腹筋（存在する場合のみ）
    const webBarText = this.formatMultiPositionBar(sectionData.positions, 'webBar', positionKeys);
    if (webBarText !== '-' && webBarText.trim() !== '') {
      parts.push(
        `<tr><td class="spec-label">腹筋</td><td class="spec-value">${webBarText}</td></tr>`,
      );
    }

    parts.push('</table>');
    parts.push('</div>');

    // ラッパー閉じタグ
    parts.push('</div>');

    return parts.join('');
  }

  /**
   * 描画対象の位置キーを取得
   * LEFT/CENTER/RIGHT/SAME を優先し、無い場合は order 順でフォールバックする
   * @param {Object} positions - 位置別データ
   * @returns {Array<string>} 描画順の位置キー
   */
  getRenderablePositionKeys(positions) {
    if (!positions) return [];

    const preferred = ['LEFT', 'CENTER', 'RIGHT', 'SAME'].filter((key) => positions[key]);
    if (preferred.length > 0) {
      return preferred;
    }

    return Object.entries(positions)
      .sort(([, a], [, b]) => (a?.order ?? 0) - (b?.order ?? 0))
      .map(([key]) => key);
  }

  /**
   * 複数位置の配筋情報をフォーマット
   * @param {Object} positions - 位置別配筋データ
   * @param {string} barKey - 配筋キー（topBar/bottomBar/webBar）
   * @param {Array<string>} positionKeys - 有効な位置キーの配列
   * @returns {string} フォーマット済み文字列
   */
  formatMultiPositionBar(positions, barKey, positionKeys) {
    const parts = [];

    // 複数位置がある場合は、各位置の値を表示
    if (positionKeys.length > 1) {
      parts.push('<div class="multi-position-spec">');

      positionKeys.forEach((position) => {
        const positionData = positions[position];
        const bar = positionData?.[barKey];

        const posLabel = this.getPositionLabel(position);
        if (bar && bar.count > 0) {
          parts.push(
            `<span class="position-spec">${posLabel}: ${bar.count}-${bar.dia} (${bar.grade})</span>`,
          );
        } else {
          parts.push(`<span class="position-spec">${posLabel}: なし</span>`);
        }
      });

      parts.push('</div>');
    } else {
      // 単一位置の場合
      const position = positionKeys[0];
      const bar = positions[position]?.[barKey];

      if (bar && bar.count > 0) {
        parts.push(`${bar.count}-${bar.dia} (${bar.grade})`);
      } else {
        parts.push('-');
      }
    }

    return parts.join('');
  }

  /**
   * 複数位置のスターラップをフォーマット
   * @param {Object} positions - 位置別配筋データ
   * @param {string} stirrupKey - スターラップキー
   * @param {Array<string>} positionKeys - 有効な位置キーの配列
   * @returns {string} フォーマット済み文字列
   */
  formatMultiPositionStirrup(positions, stirrupKey, positionKeys) {
    const parts = [];

    if (positionKeys.length > 1) {
      parts.push('<div class="multi-position-spec">');

      positionKeys.forEach((position) => {
        const positionData = positions[position];
        const stirrup = positionData?.[stirrupKey];

        const posLabel = this.getPositionLabel(position);
        if (stirrup) {
          parts.push(
            `<span class="position-spec">${posLabel}: ${stirrup.count}-${stirrup.dia}@${stirrup.pitch}</span>`,
          );
        } else {
          parts.push(`<span class="position-spec">${posLabel}: なし</span>`);
        }
      });

      parts.push('</div>');
    } else {
      const position = positionKeys[0];
      const stirrup = positions[position]?.[stirrupKey];

      if (stirrup) {
        parts.push(`${stirrup.count}-${stirrup.dia}@${stirrup.pitch}`);
      } else {
        parts.push('-');
      }
    }

    return parts.join('');
  }

  /**
   * 位置文字列を日本語ラベルに変換
   * @param {string} position - 位置（LEFT/CENTER/RIGHT/SAME）
   * @returns {string} 日本語ラベル
   */
  getPositionLabel(position) {
    const labels = {
      LEFT: '左端',
      CENTER: '中央',
      RIGHT: '右端',
      SAME: '全',
    };
    return labels[position] || position;
  }

  /**
   * 位置構成パターンを日本語ラベルに変換
   * @param {string} pattern - パターン（SAME/END_CENTER/THREE等）
   * @returns {string} 日本語ラベル
   */
  getPositionPatternLabel(pattern) {
    const labels = {
      SAME: '全断面同一',
      END_CENTER: '端部・中央',
      THREE: '左端・中央・右端',
      LEFT_CENTER_SHARED: '左端・中央（共有）',
      RIGHT_CENTER_SHARED: '中央・右端（共有）',
    };
    return labels[pattern] || '';
  }

  /**
   * 現在の描画縮尺ラベルを取得
   * @returns {string}
   */
  getScaleLabel() {
    if (!this.lastComputedScale?.effectiveDenominator) {
      return '';
    }
    return `縮尺 1/${this.lastComputedScale.effectiveDenominator}`;
  }

  /**
   * 縮尺分母を設定
   * @param {number} denominator - 1/n の n
   */
  setScaleDenominator(denominator) {
    const value = Number(denominator);
    if (Number.isFinite(value) && value > 0) {
      this.scaleOptions.scaleDenominator = value;
    }
  }

  /**
   * 描画時のかぶり厚さ（mm）を設定
   * @param {number|null} thickness - nullでXML値を使用
   */
  setCoverThickness(thickness) {
    const value = Number(thickness);
    this.coverThickness = Number.isFinite(value) && value > 0 ? value : null;
  }

  /**
   * 断面グリッド全体の共通縮尺を算出
   * @param {Object} data - グリッドデータ
   * @returns {{scale:number, effectiveDenominator:string}|null}
   */
  computeUnifiedScale(data) {
    const dims = this.collectBeamDimensions(data?.grid);
    if (dims.maxWidth <= 0 || dims.maxDepth <= 0) {
      return null;
    }

    const mmToPx = this.scaleOptions.previewDpi / 25.4;
    const baseScale = mmToPx / this.scaleOptions.scaleDenominator;
    const padding = this.svgRenderer?.settings?.padding || 0;
    const usableWidth = Math.max(1, this.scaleOptions.maxDiagramWidth - padding * 2);
    const usableHeight = Math.max(1, this.scaleOptions.maxDiagramHeight - padding * 2);
    const fitScale = Math.min(usableWidth / dims.maxWidth, usableHeight / dims.maxDepth);
    const finalScale = Math.min(baseScale, fitScale);

    const effectiveDenominator = mmToPx / finalScale;
    return {
      scale: finalScale,
      effectiveDenominator:
        effectiveDenominator >= 100
          ? Math.round(effectiveDenominator).toString()
          : effectiveDenominator.toFixed(1),
    };
  }

  /**
   * グリッド内の最大梁幅・梁せいを抽出
   * @param {Map} grid - グリッドデータ
   * @returns {{maxWidth:number, maxDepth:number}}
   */
  collectBeamDimensions(grid) {
    let maxWidth = 0;
    let maxDepth = 0;

    if (!(grid instanceof Map)) {
      return { maxWidth, maxDepth };
    }

    grid.forEach((sectionDataOrList) => {
      const list = Array.isArray(sectionDataOrList) ? sectionDataOrList : [sectionDataOrList];
      list.forEach((sectionData) => {
        const positions = sectionData?.positions || {};
        Object.values(positions).forEach((positionData) => {
          const width = Number(positionData?.width) || 0;
          const depth = Number(positionData?.depth) || 0;
          if (width > maxWidth) maxWidth = width;
          if (depth > maxDepth) maxDepth = depth;
        });
      });
    });

    return { maxWidth, maxDepth };
  }

  /**
   * 描画用かぶりを決定
   * @param {Object} sourceCover - 抽出済みかぶり情報
   * @returns {{top:number,bottom:number,left:number,right:number}}
   */
  resolveRenderCover(sourceCover) {
    const base = {
      top: Number(sourceCover?.top) || 40,
      bottom: Number(sourceCover?.bottom) || 40,
      left: Number(sourceCover?.left) || Number(sourceCover?.top) || 40,
      right: Number(sourceCover?.right) || Number(sourceCover?.top) || 40,
    };

    if (this.coverThickness) {
      return {
        top: this.coverThickness,
        bottom: this.coverThickness,
        left: this.coverThickness,
        right: this.coverThickness,
      };
    }

    return base;
  }
}

export default BeamSectionListRenderer;

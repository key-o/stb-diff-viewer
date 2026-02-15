/**
 * @fileoverview RC梁断面リストテーブルレンダラー
 *
 * グリッド形式（階×符号）のRC梁断面リストテーブルをHTMLとして描画します。
 * 各セルに複数位置の断面図（LEFT/CENTER/RIGHT）と詳細情報を埋め込みます。
 *
 * @module ui/sectionList/BeamSectionListRenderer
 */

import { RcBeamVisualRenderer } from '../../../components/rcBeamVisual/index.js';

/**
 * RC梁断面リストテーブルレンダラー
 */
export class BeamSectionListRenderer {
  constructor(options = {}) {
    this.svgRenderer = new RcBeamVisualRenderer({
      maxWidth: options.svgWidth || 100,
      maxHeight: options.svgHeight || 100,
      padding: options.svgPadding || 15,
      barScale: options.barScale || 0.8,
      showDimensions: false,
    });

    this.options = {
      showPositionLabels: options.showPositionLabels !== false,
      compactMode: options.compactMode || false,
    };
  }

  /**
   * グリッド形式で梁断面リストテーブルをレンダリング
   * @param {Object} data - extractBeamSectionGridの出力
   *   { stories: Array, symbols: Array, grid: Map }
   * @param {HTMLElement} container - 描画先コンテナ
   */
  renderGrid(data, container) {
    if (!container) return;

    const { stories, symbols, grid } = data;

    if (!symbols || symbols.length === 0 || !stories || stories.length === 0) {
      container.innerHTML = '<div class="section-list-empty">RC梁断面データがありません</div>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'beam-section-grid-table';

    // ヘッダー行
    const thead = this.renderGridHeader(symbols);
    table.appendChild(thead);

    // ボディ行
    const tbody = this.renderGridBody(stories, symbols, grid);
    table.appendChild(tbody);

    // コンテナをクリアしてテーブルを追加
    container.innerHTML = '';
    container.appendChild(table);
  }

  /**
   * グリッドのヘッダー行を生成
   * @param {Array<string>} symbols - 符号一覧
   * @returns {HTMLElement} thead要素
   */
  renderGridHeader(symbols) {
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    // 階列ヘッダー（左端固定列）
    const thFloor = document.createElement('th');
    thFloor.className = 'section-grid-header-floor';
    thFloor.textContent = '階';
    headerRow.appendChild(thFloor);

    // 各符号列のヘッダー
    symbols.forEach((symbol) => {
      const thSymbol = document.createElement('th');
      thSymbol.className = 'section-grid-header-symbol';
      thSymbol.textContent = symbol;
      headerRow.appendChild(thSymbol);
    });

    thead.appendChild(headerRow);
    return thead;
  }

  /**
   * グリッドのボディ行を生成
   * @param {Array} stories - 階一覧
   * @param {Array<string>} symbols - 符号一覧
   * @param {Map} grid - グリッドデータ（キー: "階ID:符号"）
   * @returns {HTMLElement} tbody要素
   */
  renderGridBody(stories, symbols, grid) {
    const tbody = document.createElement('tbody');

    stories.forEach((story) => {
      const tr = document.createElement('tr');

      // 階セル（左端固定列）
      const tdFloor = document.createElement('td');
      tdFloor.className = 'section-grid-floor-cell';
      tdFloor.textContent = story.name;
      tr.appendChild(tdFloor);

      // 各符号のセル
      symbols.forEach((symbol) => {
        const tdSection = document.createElement('td');
        tdSection.className = 'section-grid-section-cell';

        // グリッドキーを構築：階ID:符号
        const gridKey = `${story.id}:${symbol}`;
        const sectionData = grid.get(gridKey);

        if (sectionData) {
          if (Array.isArray(sectionData)) {
            tdSection.innerHTML = this.renderSectionVariants(sectionData);
          } else {
            tdSection.innerHTML = this.renderSectionCell(sectionData);
          }
        } else {
          // 空セル
          tdSection.innerHTML = '<div class="section-cell-empty">-</div>';
          tdSection.classList.add('empty');
        }

        tr.appendChild(tdSection);
      });

      tbody.appendChild(tr);
    });

    return tbody;
  }

  /**
   * 同一セル内に複数断面がある場合のレンダリング
   * @param {Array<Object>} sectionDataList - 断面データ配列
   * @returns {string} HTML文字列
   */
  renderSectionVariants(sectionDataList) {
    const uniqueVariants = [];
    const seenSectionIds = new Set();

    sectionDataList.forEach((sectionData) => {
      const sectionId = sectionData?.sectionId || sectionData?.id || '';
      const dedupeKey = `${sectionId}:${sectionData?.symbolNames || ''}`;
      if (!seenSectionIds.has(dedupeKey)) {
        seenSectionIds.add(dedupeKey);
        uniqueVariants.push(sectionData);
      }
    });

    if (uniqueVariants.length === 1) {
      return this.renderSectionCell(uniqueVariants[0]);
    }

    const parts = ['<div class="section-cell-variants">'];
    uniqueVariants.forEach((sectionData, index) => {
      const label = sectionData?.sectionId
        ? `断面${index + 1} (ID: ${this.escapeHtml(sectionData.sectionId)})`
        : `断面${index + 1}`;
      parts.push('<div class="section-cell-variant">');
      parts.push(`<div class="section-cell-variant-label">${label}</div>`);
      parts.push(this.renderSectionCell(sectionData));
      parts.push('</div>');
    });
    parts.push('</div>');

    return parts.join('');
  }

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
          cover: sectionData.cover || { top: 40, bottom: 40, left: 40, right: 40 },
        };
        console.log('[BeamSectionListRenderer] Rendering position:', {
          position,
          beamDataForSvg,
          symbol: sectionData.symbolNames,
        });
        const svgString = this.svgRenderer.renderToString(beamDataForSvg);
        console.log('[BeamSectionListRenderer] SVG result:', {
          hasString: !!svgString,
          length: svgString?.length || 0,
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
   * HTMLエスケープ
   * @param {string} str - 文字列
   * @returns {string}
   */
  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

export default BeamSectionListRenderer;

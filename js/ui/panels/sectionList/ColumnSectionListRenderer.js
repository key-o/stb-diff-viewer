/**
 * @fileoverview RC柱断面リストテーブルレンダラー
 *
 * 構造図形式のRC柱断面リストテーブルをHTMLとして描画します。
 * 各セルにSVG断面図と詳細情報を埋め込みます。
 *
 * @module ui/sectionList/ColumnSectionListRenderer
 */

import { RcColumnVisualRenderer } from '../../../components/rcColumnVisual/index.js';

/**
 * RC柱断面リストテーブルレンダラー
 */
export class ColumnSectionListRenderer {
  constructor(options = {}) {
    this.svgRenderer = new RcColumnVisualRenderer({
      maxWidth: options.svgWidth || 120,
      maxHeight: options.svgHeight || 120,
      padding: options.svgPadding || 20,
      barScale: options.barScale || 0.8,
      showDimensions: false,
    });

    this.options = {
      showCoreBar: options.showCoreBar !== false,
      showStirrupGrade: options.showStirrupGrade !== false,
      compactMode: options.compactMode || false,
    };
  }

  /**
   * 断面リストテーブルをレンダリング
   * @param {Object} data - extractColumnSectionListの出力
   * @param {HTMLElement} container - 描画先コンテナ
   */
  render(data, container) {
    if (!container) return;

    const { sections } = data;

    if (!sections || sections.length === 0) {
      container.innerHTML = '<div class="section-list-empty">RC柱断面データがありません</div>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'column-section-list-table';

    // ヘッダー行
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    // 階列ヘッダー
    const thFloor = document.createElement('th');
    thFloor.className = 'section-list-header-floor';
    thFloor.textContent = '階';
    headerRow.appendChild(thFloor);

    // 符号列ヘッダー
    const thSymbol = document.createElement('th');
    thSymbol.className = 'section-list-header-symbol';
    thSymbol.textContent = '符号';
    headerRow.appendChild(thSymbol);

    // 断面列ヘッダー
    const thSection = document.createElement('th');
    thSection.className = 'section-list-header-section';
    thSection.textContent = '断面詳細';
    headerRow.appendChild(thSection);

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // ボディ行
    const tbody = document.createElement('tbody');

    sections.forEach((row) => {
      const tr = document.createElement('tr');

      // 階セル
      const tdFloor = document.createElement('td');
      tdFloor.className = 'section-list-floor-cell';
      tdFloor.textContent = row.storyName;
      tr.appendChild(tdFloor);

      // 符号セル
      const tdSymbol = document.createElement('td');
      tdSymbol.className = 'section-list-symbol-cell';
      tdSymbol.textContent = row.symbol;
      tr.appendChild(tdSymbol);

      // 断面詳細セル
      const tdSection = document.createElement('td');
      tdSection.className = 'section-list-section-cell';
      tdSection.innerHTML = this.renderSectionCell(row.sectionData);
      tr.appendChild(tdSection);

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);

    // コンテナをクリアしてテーブルを追加
    container.innerHTML = '';
    container.appendChild(table);
  }

  /**
   * 断面セルの内容をレンダリング
   * @param {Object} sectionData - 断面データ
   * @returns {string} HTMLストリング
   */
  renderSectionCell(sectionData) {
    const parts = [];

    // ラッパーdivで囲む（flexboxレイアウト用）
    parts.push('<div class="section-cell-content">');

    // 符号名（例: "9C1, 10C1"）
    parts.push(`<div class="section-cell-name">${this.escapeHtml(sectionData.symbolNames)}</div>`);

    // 断面図（SVG）
    const svgData = this.prepareSvgData(sectionData);
    const svgString = this.svgRenderer.renderToString(svgData);
    parts.push(`<div class="section-cell-diagram">${svgString}</div>`);

    // 詳細情報テーブル
    parts.push('<div class="section-cell-specs">');
    parts.push('<table class="section-specs-table">');

    // コンクリート寸法・強度
    const dimText = this.formatDimensions(sectionData);
    const concreteStrength = sectionData.concrete?.strength || 'Fc21';
    parts.push(
      `<tr><td class="spec-label">B×D</td><td class="spec-value">${dimText} (${concreteStrength})</td></tr>`,
    );

    // 主筋
    const mainBarText = this.formatMainBar(sectionData);
    parts.push(
      `<tr><td class="spec-label">主筋</td><td class="spec-value">${mainBarText}</td></tr>`,
    );

    // 材料（主筋）
    if (sectionData.mainBar?.grade) {
      parts.push(
        `<tr><td class="spec-label">材料</td><td class="spec-value">${sectionData.mainBar.grade}</td></tr>`,
      );
    }

    // 1段目dt
    const dtText = this.formatDt(sectionData);
    if (dtText) {
      parts.push(
        `<tr><td class="spec-label">1段目dt</td><td class="spec-value">${dtText}</td></tr>`,
      );
    }

    // 芯鉄筋
    if (this.options.showCoreBar && sectionData.coreBar) {
      const coreBarText = this.formatCoreBar(sectionData);
      if (coreBarText) {
        parts.push(
          `<tr><td class="spec-label">芯鉄筋</td><td class="spec-value">${coreBarText}</td></tr>`,
        );
      }
    }

    // 帯筋
    const hoopText = this.formatHoop(sectionData);
    parts.push(`<tr><td class="spec-label">帯筋</td><td class="spec-value">${hoopText}</td></tr>`);

    parts.push('</table>');
    parts.push('</div>');

    // ラッパー閉じタグ
    parts.push('</div>');

    return parts.join('');
  }

  /**
   * SVGレンダリング用のデータを準備
   * @param {Object} sectionData - 断面データ
   * @returns {Object} SVGレンダラー用データ
   */
  prepareSvgData(sectionData) {
    if (sectionData.isCircular || sectionData.diameter > 0) {
      return {
        diameter: sectionData.diameter,
        cover: sectionData.cover || 50,
        mainBar: {
          count: sectionData.mainBar?.count || sectionData.mainBar?.countX || 8,
          dia: sectionData.mainBar?.dia || 'D25',
        },
        hoop: sectionData.hoop,
      };
    } else {
      return {
        width: sectionData.width,
        height: sectionData.height,
        cover: sectionData.cover || 50,
        mainBar: {
          countX: sectionData.mainBar?.countX || 4,
          countY: sectionData.mainBar?.countY || 4,
          dia: sectionData.mainBar?.dia || 'D25',
        },
        hoop: sectionData.hoop,
        coreBar: sectionData.coreBar,
      };
    }
  }

  /**
   * 寸法をフォーマット
   * @param {Object} sectionData - 断面データ
   * @returns {string}
   */
  formatDimensions(sectionData) {
    if (sectionData.isCircular || sectionData.diameter > 0) {
      return `φ${sectionData.diameter}`;
    } else {
      return `${sectionData.width}×${sectionData.height}`;
    }
  }

  /**
   * 主筋をフォーマット
   * @param {Object} sectionData - 断面データ
   * @returns {string}
   */
  formatMainBar(sectionData) {
    const { mainBar } = sectionData;
    if (!mainBar) return '-';

    if (sectionData.isCircular || sectionData.diameter > 0) {
      // 円形断面: 従来通り
      return `${mainBar.count}-${mainBar.dia}`;
    } else {
      // 矩形断面: 常にX/Y方向を分けて表示
      const x = mainBar.countX || 0;
      const y = mainBar.countY || 0;
      const dia = mainBar.dia || 'D25';
      return `X: ${x}-${dia} / Y: ${y}-${dia}`;
    }
  }

  /**
   * 1段目dtをフォーマット
   * @param {Object} sectionData - 断面データ
   * @returns {string}
   */
  formatDt(sectionData) {
    const { mainBar } = sectionData;
    if (!mainBar) return '';

    if (sectionData.isCircular || sectionData.diameter > 0) {
      return mainBar.dt ? `${mainBar.dt}mm` : '';
    } else {
      const dtX = mainBar.dtX;
      const dtY = mainBar.dtY;

      if (dtX && dtY && dtX !== dtY) {
        return `X: ${dtX}mm / Y: ${dtY}mm`;
      } else if (dtX || dtY) {
        return `${dtX || dtY}mm`;
      }
      return '';
    }
  }

  /**
   * 芯鉄筋をフォーマット
   * @param {Object} sectionData - 断面データ
   * @returns {string}
   */
  formatCoreBar(sectionData) {
    const { coreBar } = sectionData;
    if (!coreBar) return '';

    const parts = [];

    if (coreBar.countX > 0 || coreBar.countY > 0) {
      if (coreBar.countX === coreBar.countY) {
        parts.push(`${coreBar.countX}-${coreBar.dia}`);
      } else {
        if (coreBar.countX > 0) parts.push(`X: ${coreBar.countX}-${coreBar.dia}`);
        if (coreBar.countY > 0) parts.push(`Y: ${coreBar.countY}-${coreBar.dia}`);
      }
    }

    if (coreBar.position > 0) {
      parts.push(`位置: ${coreBar.position}mm`);
    }

    return parts.join(' / ');
  }

  /**
   * 帯筋をフォーマット
   * @param {Object} sectionData - 断面データ
   * @returns {string}
   */
  formatHoop(sectionData) {
    const { hoop } = sectionData;
    if (!hoop) return '-';

    let text = '';

    // X/Y方向の本数を追加
    if (hoop.countX > 0 || hoop.countY > 0) {
      text += `X: ${hoop.countX || 0}本 / Y: ${hoop.countY || 0}本 `;
    }

    text += `${hoop.dia}@${hoop.pitch}`;

    if (hoop.dia2 && hoop.pitch2) {
      text += ` / ${hoop.dia2}@${hoop.pitch2}`;
    }

    if (this.options.showStirrupGrade && hoop.grade) {
      text += ` (${hoop.grade})`;
    }

    return text;
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

  /**
   * グリッド形式で断面リストテーブルをレンダリング
   * @param {Object} data - extractColumnSectionGridの出力
   * @param {HTMLElement} container - 描画先コンテナ
   */
  renderGrid(data, container) {
    if (!container) return;

    const { stories, symbols, grid } = data;

    if (!symbols || symbols.length === 0 || !stories || stories.length === 0) {
      container.innerHTML = '<div class="section-list-empty">RC柱断面データがありません</div>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'column-section-grid-table';

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
   * @param {Map} grid - グリッドデータ
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
      const floorMap = grid.get(story.id);
      symbols.forEach((symbol) => {
        const tdSection = document.createElement('td');
        tdSection.className = 'section-grid-section-cell';

        const sectionData = floorMap?.get(symbol);
        if (sectionData) {
          // 既存のrenderSectionCell()を再利用
          tdSection.innerHTML = this.renderSectionCell(sectionData);
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
}

export default ColumnSectionListRenderer;

/**
 * @fileoverview RC柱断面リストパネル
 *
 * フローティングウィンドウとしてRC柱断面リストを表示するパネルコンポーネント。
 * FloatingWindowManagerを使用してウィンドウ管理を行います。
 *
 * @module ui/sectionList/ColumnSectionListPanel
 */

import { floatingWindowManager } from '../floatingWindowManager.js';
import {
  extractColumnSectionList,
  extractColumnSectionGrid,
} from '../../../data/extractors/columnSectionListExtractor.js';
import { ColumnSectionListRenderer } from './ColumnSectionListRenderer.js';
import { exportToPdf } from './ColumnSectionListExporter.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('ui/ColumnSectionListPanel');

const WINDOW_ID = 'column-section-list-window';

/**
 * RC柱断面リストパネルクラス
 */
export class ColumnSectionListPanel {
  constructor() {
    this.renderer = new ColumnSectionListRenderer();
    this.currentData = null;
    this.currentDoc = null;
    this.isInitialized = false;
  }

  /**
   * パネルを初期化
   */
  init() {
    if (this.isInitialized) return;

    // ウィンドウHTMLを生成
    this.createWindowElement();

    // FloatingWindowManagerに登録
    floatingWindowManager.registerWindow({
      windowId: WINDOW_ID,
      toggleButtonId: 'showColumnSectionListBtn',
      closeButtonId: `close-${WINDOW_ID}-btn`,
      headerId: `${WINDOW_ID}-header`,
      draggable: true,
      resizable: true,
      autoShow: false,
      onShow: () => this.onShow(),
      onHide: () => this.onHide(),
    });

    // イベントリスナーを設定
    this.setupEventListeners();

    this.isInitialized = true;
    log.info('ColumnSectionListPanel initialized');
  }

  /**
   * ウィンドウ要素を生成
   */
  createWindowElement() {
    const windowEl = document.createElement('div');
    windowEl.id = WINDOW_ID;
    windowEl.className = 'floating-window column-section-list-window hidden';
    windowEl.innerHTML = `
      <div class="float-window-header" id="${WINDOW_ID}-header">
        <span class="float-window-title">RC柱断面リスト</span>
        <div class="float-window-controls">
          <button class="float-window-btn section-list-export-btn" id="section-list-export-pdf-btn" title="PDF出力">
            PDF
          </button>
          <button class="float-window-btn section-list-refresh-btn" id="section-list-refresh-btn" title="更新">
            ↻
          </button>
          <button class="float-window-btn" id="close-${WINDOW_ID}-btn">✕</button>
        </div>
      </div>
      <div class="float-window-content section-list-content">
        <div class="section-list-toolbar">
          <div class="section-list-source-selector">
            <label>
              <input type="radio" name="section-list-source" value="A" checked>
              モデルA
            </label>
            <label>
              <input type="radio" name="section-list-source" value="B">
              モデルB
            </label>
          </div>
          <div class="section-list-info" id="section-list-info"></div>
        </div>
        <div class="section-list-table-wrapper" id="section-list-table-container">
          <div class="section-list-loading">データを読み込んでいます...</div>
        </div>
      </div>
    `;

    document.body.appendChild(windowEl);
  }

  /**
   * イベントリスナーを設定
   */
  setupEventListeners() {
    // PDF出力ボタン
    const exportBtn = document.getElementById('section-list-export-pdf-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.handleExportPdf());
    }

    // 更新ボタン
    const refreshBtn = document.getElementById('section-list-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refresh());
    }

    // ソース切り替え
    const sourceRadios = document.querySelectorAll('input[name="section-list-source"]');
    sourceRadios.forEach((radio) => {
      radio.addEventListener('change', (e) => this.handleSourceChange(e.target.value));
    });
  }

  /**
   * ウィンドウ表示時のコールバック
   */
  onShow() {
    log.info('ColumnSectionListPanel shown');
    this.refresh();
  }

  /**
   * ウィンドウ非表示時のコールバック
   */
  onHide() {
    log.info('ColumnSectionListPanel hidden');
  }

  /**
   * データソースを変更
   * @param {string} source - 'A' または 'B'
   */
  handleSourceChange(source) {
    log.info(`Source changed to: ${source}`);
    this.refresh(source);
  }

  /**
   * データを更新・再描画
   * @param {string} [source] - データソース（'A' または 'B'）
   */
  refresh(source) {
    const container = document.getElementById('section-list-table-container');
    const infoEl = document.getElementById('section-list-info');

    if (!container) return;

    // ソースを取得
    if (!source) {
      const checkedRadio = document.querySelector('input[name="section-list-source"]:checked');
      source = checkedRadio ? checkedRadio.value : 'A';
    }

    // XMLドキュメントを取得
    const xmlDoc = source === 'A' ? window.docA : window.docB;

    if (!xmlDoc) {
      container.innerHTML = `<div class="section-list-empty">モデル${source}が読み込まれていません</div>`;
      if (infoEl) infoEl.textContent = '';
      return;
    }

    // ローディング表示
    container.innerHTML = '<div class="section-list-loading">データを抽出しています...</div>';

    // 非同期で処理（UIブロックを避ける）
    setTimeout(() => {
      try {
        // グリッド形式でデータを抽出
        this.currentData = extractColumnSectionGrid(xmlDoc);
        this.currentDoc = xmlDoc;

        // 情報を更新（階 × 符号の形式）
        if (infoEl) {
          const floorCount = this.currentData.stories?.length || 0;
          const symbolCount = this.currentData.symbols?.length || 0;
          infoEl.textContent = `${floorCount}階 × ${symbolCount}符号`;
        }

        // コンテナにgrid-modeクラスを追加（CSS用）
        container.classList.add('grid-mode');

        // グリッド形式でテーブルをレンダリング
        this.renderer.renderGrid(this.currentData, container);

        log.info('Section grid rendered', {
          floors: this.currentData.stories?.length,
          symbols: this.currentData.symbols?.length,
          totalCells:
            (this.currentData.stories?.length || 0) * (this.currentData.symbols?.length || 0),
        });
      } catch (error) {
        log.error('Error rendering section grid:', error);
        container.innerHTML = `<div class="section-list-error">エラー: ${error.message}</div>`;
      }
    }, 10);
  }

  /**
   * PDF出力を処理
   */
  async handleExportPdf() {
    const tableContainer = document.getElementById('section-list-table-container');
    const table =
      tableContainer?.querySelector('.column-section-grid-table') ||
      tableContainer?.querySelector('.column-section-list-table');

    if (!table) {
      alert('出力するテーブルがありません');
      return;
    }

    const exportBtn = document.getElementById('section-list-export-pdf-btn');
    if (exportBtn) {
      exportBtn.disabled = true;
      exportBtn.textContent = '...';
    }

    try {
      await exportToPdf(table, 'rc-column-section-list.pdf');
      log.info('PDF exported successfully');
    } catch (error) {
      log.error('PDF export failed:', error);
      alert(`PDF出力に失敗しました: ${error.message}`);
    } finally {
      if (exportBtn) {
        exportBtn.disabled = false;
        exportBtn.textContent = 'PDF';
      }
    }
  }

  /**
   * パネルを表示
   */
  show() {
    floatingWindowManager.showWindow(WINDOW_ID);
  }

  /**
   * パネルを非表示
   */
  hide() {
    floatingWindowManager.hideWindow(WINDOW_ID);
  }

  /**
   * パネルの表示/非表示を切り替え
   */
  toggle() {
    floatingWindowManager.toggleWindow(WINDOW_ID);
  }

  /**
   * パネルが表示されているか確認
   * @returns {boolean}
   */
  isVisible() {
    return floatingWindowManager.isWindowVisible(WINDOW_ID);
  }
}

// シングルトンインスタンス
let panelInstance = null;

/**
 * パネルインスタンスを取得（遅延初期化）
 * @returns {ColumnSectionListPanel}
 */
export function getColumnSectionListPanel() {
  if (!panelInstance) {
    panelInstance = new ColumnSectionListPanel();
  }
  return panelInstance;
}

/**
 * パネルを初期化
 */
export function initColumnSectionListPanel() {
  const panel = getColumnSectionListPanel();
  panel.init();
  return panel;
}

export default ColumnSectionListPanel;

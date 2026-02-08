/**
 * @fileoverview RC梁断面リストパネル
 *
 * フローティングウィンドウとしてRC梁断面リストを表示するパネルコンポーネント。
 * FloatingWindowManagerを使用してウィンドウ管理を行います。
 *
 * @module ui/sectionList/BeamSectionListPanel
 */

import { floatingWindowManager } from '../floatingWindowManager.js';
import { extractBeamSectionGrid } from '../../../data/extractors/beamSectionListExtractor.js';
import { BeamSectionListRenderer } from './BeamSectionListRenderer.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('ui/BeamSectionListPanel');

const WINDOW_ID = 'beam-section-list-window';

/**
 * RC梁断面リストパネルクラス
 */
export class BeamSectionListPanel {
  constructor() {
    this.renderer = new BeamSectionListRenderer();
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
      toggleButtonId: 'showBeamSectionListBtn',
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
    log.info('BeamSectionListPanel initialized');
  }

  /**
   * ウィンドウ要素を生成
   */
  createWindowElement() {
    const windowEl = document.createElement('div');
    windowEl.id = WINDOW_ID;
    windowEl.className = 'floating-window beam-section-list-window hidden';
    windowEl.innerHTML = `
      <div class="float-window-header" id="${WINDOW_ID}-header">
        <span class="float-window-title">RC梁断面リスト</span>
        <div class="float-window-controls">
          <button class="float-window-btn section-list-refresh-btn" id="beam-section-list-refresh-btn" title="更新">
            ↻
          </button>
          <button class="float-window-btn" id="close-${WINDOW_ID}-btn">✕</button>
        </div>
      </div>
      <div class="float-window-content section-list-content">
        <div class="section-list-toolbar">
          <div class="section-list-source-selector">
            <label>
              <input type="radio" name="beam-section-list-source" value="A" checked>
              モデルA
            </label>
            <label>
              <input type="radio" name="beam-section-list-source" value="B">
              モデルB
            </label>
          </div>
          <div class="section-list-info" id="beam-section-list-info"></div>
        </div>
        <div class="section-list-table-wrapper" id="beam-section-list-table-container">
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
    // 更新ボタン
    const refreshBtn = document.getElementById('beam-section-list-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refresh());
    }

    // ソース切り替え
    const sourceRadios = document.querySelectorAll('input[name="beam-section-list-source"]');
    sourceRadios.forEach((radio) => {
      radio.addEventListener('change', (e) => this.handleSourceChange(e.target.value));
    });
  }

  /**
   * ウィンドウ表示時のコールバック
   */
  onShow() {
    log.info('BeamSectionListPanel shown');
    this.refresh();
  }

  /**
   * ウィンドウ非表示時のコールバック
   */
  onHide() {
    log.info('BeamSectionListPanel hidden');
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
    const container = document.getElementById('beam-section-list-table-container');
    const infoEl = document.getElementById('beam-section-list-info');

    if (!container) return;

    // ソースを取得
    if (!source) {
      const checkedRadio = document.querySelector('input[name="beam-section-list-source"]:checked');
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
        this.currentData = extractBeamSectionGrid(xmlDoc);
        this.currentDoc = xmlDoc;

        console.log('[BeamSectionListPanel] Extracted grid data:', {
          stories: this.currentData.stories,
          symbols: this.currentData.symbols,
          grid: Array.from(this.currentData.grid.entries()).slice(0, 3), // 最初の3件
        });

        // 情報を更新（階 × 符号の形式）
        if (infoEl) {
          const floorCount = this.currentData.stories?.length || 0;
          const symbolCount = this.currentData.symbols?.length || 0;
          infoEl.textContent = `${floorCount}階 × ${symbolCount}符号`;
        }

        // データが空でないか確認
        if (!this.currentData.stories || this.currentData.stories.length === 0) {
          console.warn('[BeamSectionListPanel] No stories found');
        }
        if (!this.currentData.symbols || this.currentData.symbols.length === 0) {
          console.warn('[BeamSectionListPanel] No beam symbols found');
        }

        // コンテナにgrid-modeクラスを追加（CSS用）
        container.classList.add('grid-mode');

        // グリッド形式でテーブルをレンダリング
        this.renderer.renderGrid(this.currentData, container);

        log.info('Beam section grid rendered', {
          floors: this.currentData.stories?.length,
          symbols: this.currentData.symbols?.length,
          totalCells:
            (this.currentData.stories?.length || 0) * (this.currentData.symbols?.length || 0),
        });
      } catch (error) {
        log.error('Error rendering beam section grid:', error);
        console.error('[BeamSectionListPanel] Stack trace:', error.stack);
        container.innerHTML = `<div class="section-list-error">エラー: ${error.message}</div>`;
      }
    }, 10);
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
}

/**
 * グローバルなシングルトンインスタンス
 */
let beamSectionListPanel = null;

/**
 * RC梁断面リストパネルを取得（シングルトン）
 * @returns {BeamSectionListPanel}
 */
export function getBeamSectionListPanel() {
  if (!beamSectionListPanel) {
    beamSectionListPanel = new BeamSectionListPanel();
  }
  return beamSectionListPanel;
}

/**
 * RC梁断面リストパネルを初期化
 */
export function initBeamSectionListPanel() {
  const panel = getBeamSectionListPanel();
  panel.init();
}

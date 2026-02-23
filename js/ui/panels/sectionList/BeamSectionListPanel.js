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
import { getState } from '../../../app/globalState.js';

const log = createLogger('ui/BeamSectionListPanel');

const WINDOW_ID = 'beam-section-list-window';

/**
 * RC梁断面リストパネルクラス
 */
export class BeamSectionListPanel {
  constructor() {
    this.renderSettings = {
      scaleDenominator: 40,
      coverThickness: null,
    };
    this.renderer = new BeamSectionListRenderer({
      scaleDenominator: this.renderSettings.scaleDenominator,
      coverThickness: this.renderSettings.coverThickness,
    });
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
          <div class="section-list-render-settings">
            <label>
              縮尺
              <select id="beam-section-scale-select">
                <option value="20">1/20</option>
                <option value="30">1/30</option>
                <option value="40" selected>1/40</option>
                <option value="50">1/50</option>
                <option value="75">1/75</option>
                <option value="100">1/100</option>
              </select>
            </label>
            <label>
              かぶり
              <input id="beam-section-cover-input" type="number" min="10" max="120" step="5" placeholder="自動" title="空欄でXML値を使用">
              mm
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

    const scaleSelect = document.getElementById('beam-section-scale-select');
    if (scaleSelect) {
      scaleSelect.addEventListener('change', () => {
        this.updateRenderSettingsFromControls();
        this.rerenderCurrentData();
      });
    }

    const coverInput = document.getElementById('beam-section-cover-input');
    if (coverInput) {
      const applyCoverChange = () => {
        this.updateRenderSettingsFromControls();
        this.rerenderCurrentData();
      };
      coverInput.addEventListener('change', applyCoverChange);
      coverInput.addEventListener('blur', applyCoverChange);
    }
  }

  /**
   * ウィンドウ表示時のコールバック
   */
  onShow() {
    log.info('BeamSectionListPanel shown');
    this.updateRenderSettingsFromControls();
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
    const xmlDoc = source === 'A' ? getState('models.documentA') : getState('models.documentB');

    if (!xmlDoc) {
      container.innerHTML = `<div class="section-list-empty">モデル${source}が読み込まれていません</div>`;
      if (infoEl) infoEl.textContent = '';
      return;
    }

    // ローディング表示
    container.innerHTML = '<div class="section-list-loading">データを抽出しています...</div>';
    this.updateRenderSettingsFromControls();

    // 非同期で処理（UIブロックを避ける）
    setTimeout(() => {
      try {
        // グリッド形式でデータを抽出
        this.currentData = extractBeamSectionGrid(xmlDoc);
        this.currentDoc = xmlDoc;

        // コンテナにgrid-modeクラスを追加（CSS用）
        container.classList.add('grid-mode');

        // グリッド形式でテーブルをレンダリング
        this.renderer.renderGrid(this.currentData, container);

        // 情報を更新（階 × 符号 + 縮尺）
        if (infoEl) {
          const floorCount = this.currentData.stories?.length || 0;
          const symbolCount = this.currentData.symbols?.length || 0;
          const scaleLabel = this.renderer.getScaleLabel();
          const coverLabel = this.renderSettings.coverThickness
            ? `かぶり ${this.renderSettings.coverThickness}mm`
            : 'かぶり 自動';
          infoEl.textContent = scaleLabel
            ? `${floorCount}階 × ${symbolCount}符号 | ${scaleLabel} | ${coverLabel}`
            : `${floorCount}階 × ${symbolCount}符号 | ${coverLabel}`;
        }

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

  /**
   * ツールバーから描画設定を反映
   */
  updateRenderSettingsFromControls() {
    const scaleSelect = document.getElementById('beam-section-scale-select');
    const coverInput = document.getElementById('beam-section-cover-input');

    const scaleDenominator = Number(scaleSelect?.value || this.renderSettings.scaleDenominator);
    const coverText = String(coverInput?.value || '').trim();
    const coverThickness = coverText === '' ? null : Number(coverText);

    this.renderSettings.scaleDenominator = Number.isFinite(scaleDenominator)
      ? scaleDenominator
      : this.renderSettings.scaleDenominator;
    this.renderSettings.coverThickness =
      Number.isFinite(coverThickness) && coverThickness > 0 ? coverThickness : null;

    this.renderer.setScaleDenominator(this.renderSettings.scaleDenominator);
    this.renderer.setCoverThickness(this.renderSettings.coverThickness);
  }

  /**
   * 既存抽出データで再描画
   */
  rerenderCurrentData() {
    const container = document.getElementById('beam-section-list-table-container');
    const infoEl = document.getElementById('beam-section-list-info');
    if (!container) return;
    if (!this.currentData) {
      this.refresh();
      return;
    }

    this.renderer.renderGrid(this.currentData, container);

    if (infoEl) {
      const floorCount = this.currentData.stories?.length || 0;
      const symbolCount = this.currentData.symbols?.length || 0;
      const scaleLabel = this.renderer.getScaleLabel();
      const coverLabel = this.renderSettings.coverThickness
        ? `かぶり ${this.renderSettings.coverThickness}mm`
        : 'かぶり 自動';
      infoEl.textContent = scaleLabel
        ? `${floorCount}階 × ${symbolCount}符号 | ${scaleLabel} | ${coverLabel}`
        : `${floorCount}階 × ${symbolCount}符号 | ${coverLabel}`;
    }
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

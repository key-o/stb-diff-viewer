/**
 * @fileoverview 差分ステータスフィルタパネル
 *
 * このファイルは、差分ステータス別のフィルタリングUIを提供します:
 * - チェックボックスによる個別ステータスの表示/非表示切り替え
 * - プリセットボタンによるクイックフィルタ
 * - 統計表示
 * - 色付けモード設定パネル内に配置
 *
 * 注: 凡例の動的生成機能が追加されています。
 *     静的HTMLが存在しない場合は config/diffFilterConfig.js から動的生成します。
 */

import { globalDiffStatusFilter, DIFF_STATUS_VALUES } from './diffStatusFilter.js';
import { getDiffLegendRenderer } from './diffLegendRenderer.js';
import { initializeDiffLegendCSS } from '../../utils/cssGenerator.js';
import { DIFF_CATEGORIES } from '../../config/diffFilterConfig.js';
import { eventBus, DiffStatusEvents } from '../../app/events/index.js';

/**
 * 差分ステータスフィルタパネルクラス
 */
export class DiffStatusPanel {
  constructor() {
    this.isInitialized = false;
    this.filter = globalDiffStatusFilter;

    this.setupEventListeners();
  }

  /**
   * イベントリスナーを設定
   */
  setupEventListeners() {
    // フィルタ変更時にUI更新
    eventBus.on(DiffStatusEvents.FILTER_CHANGED, () => {
      this.updateUI();
    });

    eventBus.on(DiffStatusEvents.FILTER_APPLIED, (data) => {
      this.updateStats(data);
    });
  }

  /**
   * パネルを初期化
   * 静的HTMLが存在すればそれを使用し、なければ動的生成
   */
  initialize() {
    if (this.isInitialized) return;

    // CSS動的生成（常に実行 - 設定ファイルの色を確実に適用）
    initializeDiffLegendCSS();

    // 静的HTMLの要素が存在するか確認
    const diffFilterSettings = document.getElementById('diff-filter-settings');
    if (!diffFilterSettings) {
      console.warn('[DiffStatusPanel] diff-filter-settings element not found');
      return;
    }

    // 凡例コンテナが存在するか確認
    const legendContainer = document.getElementById('diff-filter-legend');
    if (!legendContainer || legendContainer.children.length === 0) {
      // 静的HTMLがない場合は動的生成
      this.generateLegendDynamically();
    }

    this.bindEvents();
    this.isInitialized = true;

    console.log('[Event] DiffStatusPanel初期化完了');
  }

  /**
   * 凡例を動的生成
   * @private
   */
  generateLegendDynamically() {
    const renderer = getDiffLegendRenderer();

    // 凡例コンテナを探す
    let legendContainer = document.getElementById('diff-filter-legend');
    if (!legendContainer) {
      // コンテナが存在しない場合、diff-filter-settings内に作成
      const diffFilterSettings = document.getElementById('diff-filter-settings');
      if (diffFilterSettings) {
        legendContainer = document.createElement('div');
        legendContainer.id = 'diff-filter-legend';
        legendContainer.className = 'color-legend-container';
        diffFilterSettings.appendChild(legendContainer);
      }
    }

    if (legendContainer) {
      // 凡例を生成して挿入（コンテナ自体は残し、中身だけ生成）
      const legendItems = DIFF_CATEGORIES.sort((a, b) => a.order - b.order)
        .map((cat) => renderer.renderCategoryItem(cat))
        .join('\n');
      legendContainer.innerHTML = legendItems;
      console.log('[Event] 差分フィルタ凡例を動的生成しました');
    }
  }

  /**
   * イベントを関連付け
   */
  bindEvents() {
    // プリセットボタン（diff-filter-settings内のものだけを対象）
    const diffFilterSettings = document.getElementById('diff-filter-settings');
    if (diffFilterSettings) {
      diffFilterSettings.querySelectorAll('.preset-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const preset = e.target.dataset.preset;
          this.filter.applyPreset(preset);
          this.updatePresetButtons(preset);
        });
      });
    }

    // 個別フィルタチェックボックス（6カテゴリ）
    DIFF_STATUS_VALUES.forEach((status) => {
      const checkbox = document.getElementById(`diff-filter-${status}`);
      if (checkbox) {
        checkbox.addEventListener('change', () => {
          this.filter.toggleDiffStatus(status);
        });
      }
    });

    // 行全体クリックでチェックボックスをトグル
    document.querySelectorAll('.diff-filter-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        // チェックボックス自体のクリックは除外
        if (e.target.type === 'checkbox') return;

        const checkbox = item.querySelector('.diff-filter-checkbox');
        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change'));
        }
      });
    });
  }

  /**
   * UIを更新
   */
  updateUI() {
    const activeFilters = this.filter.activeFilters;

    // チェックボックスの状態を更新（6カテゴリ）
    DIFF_STATUS_VALUES.forEach((status) => {
      const checkbox = document.getElementById(`diff-filter-${status}`);
      if (checkbox) {
        checkbox.checked = activeFilters.has(status);
      }
    });

    // 統計を更新
    this.updateStats(this.filter.getStats());

    // プリセットボタンの状態を更新
    this.updatePresetButtonsFromState();
  }

  /**
   * 統計を更新
   * @param {Object} stats - 統計情報
   */
  updateStats(stats) {
    if (!stats) return;

    // 総数と表示数を更新
    const visibleCount = document.getElementById('diff-visible-count');
    const totalCount = document.getElementById('diff-total-count');

    if (visibleCount) visibleCount.textContent = stats.visibleElements || 0;
    if (totalCount) totalCount.textContent = stats.totalElements || 0;

    // ステータス別カウントを更新
    if (stats.byStatus) {
      Object.entries(stats.byStatus).forEach(([status, data]) => {
        const countElement = document.getElementById(`diff-count-${status}`);
        if (countElement) {
          countElement.textContent = data.total || 0;
        }
      });
    }
  }

  /**
   * プリセットボタンの状態を更新
   * @param {string} activePreset - アクティブなプリセット名
   */
  updatePresetButtons(activePreset) {
    // diff-filter-settings内のプリセットボタンだけを対象
    const diffFilterSettings = document.getElementById('diff-filter-settings');
    if (diffFilterSettings) {
      diffFilterSettings.querySelectorAll('.preset-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.preset === activePreset);
      });
    }
  }

  /**
   * 現在のフィルタ状態からプリセットボタンを更新
   */
  updatePresetButtonsFromState() {
    const activeFilters = Array.from(this.filter.activeFilters).sort().join(',');
    let matchedPreset = null;

    // プリセットと一致するか確認
    for (const [name, preset] of Object.entries(this.filter.presets)) {
      const presetFilters = Array.from(preset.levels).sort().join(',');
      if (activeFilters === presetFilters) {
        matchedPreset = name;
        break;
      }
    }

    this.updatePresetButtons(matchedPreset);
  }
}

// シングルトンインスタンス
let diffStatusPanelInstance = null;

/**
 * DiffStatusPanelのシングルトンインスタンスを取得
 * @returns {DiffStatusPanel} インスタンス
 */
function getDiffStatusPanel() {
  if (!diffStatusPanelInstance) {
    diffStatusPanelInstance = new DiffStatusPanel();
  }
  return diffStatusPanelInstance;
}

/**
 * 差分ステータスパネルを初期化
 * @returns {DiffStatusPanel} 初期化済みのインスタンス
 */
export function initializeDiffStatusPanel() {
  const panel = getDiffStatusPanel();
  panel.initialize();
  return panel;
}

export default DiffStatusPanel;

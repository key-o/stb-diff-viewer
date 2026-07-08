/**
 * @fileoverview 差分ステータスフィルタパネル
 *
 * このファイルは、差分ステータス別のフィルタリングUIを提供します:
 * - サマリー数値クリックによる表示ステータス・要素タイプ絞り込み
 * - プリセットボタンによるクイックフィルタ
 * - 統計表示・要素タイプ絞り込みチップ
 * - 差分サマリーウィンドウ内に配置（config/windowConfig.js の diff-summary テンプレート）
 */

import { globalDiffStatusFilter, DIFF_STATUS_VALUES } from './diffStatusFilter.js';
import { initializeDiffLegendCSS } from '../../utils/cssGenerator.js';
import { DIFF_STATUS_NAMES } from '../../config/diffFilterConfig.js';
import { getElementTypeFilterLabel } from '../../config/elementLabels.js';
import { eventBus, DiffStatusEvents, ComparisonEvents } from '../../data/events/index.js';
import { getDiffStatusCounts } from '../../data/normalizeComparisonResult.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('ui:panels:diffStatusPanel');

/**
 * 差分ステータスフィルタパネルクラス
 */
export class DiffStatusPanel {
  constructor() {
    this.isInitialized = false;
    this.filter = globalDiffStatusFilter;
    this.comparisonStatusCounts = null;
    this.comparisonTypeStatusCounts = null;
    this.handleDocumentClick = this.handleDocumentClick.bind(this);

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

    eventBus.on(ComparisonEvents.UPDATE_STATISTICS, (data) => {
      this.comparisonStatusCounts = this.calculateRenderableStatusCounts(data?.comparisonResults);
      this.updateStats(this.filter.getStats());
    });
  }

  /**
   * パネルを初期化
   * 差分サマリー内のビューフィルタ表示を初期化
   */
  initialize() {
    if (this.isInitialized) return;

    // CSS動的生成（常に実行 - 設定ファイルの色を確実に適用）
    initializeDiffLegendCSS();

    this.bindEvents();
    this.isInitialized = true;
    this.updateUI();

    log.info('[Event] DiffStatusPanel初期化完了');
  }

  /**
   * イベントを関連付け
   */
  bindEvents() {
    document.addEventListener('click', this.handleDocumentClick);
  }

  /**
   * 動的に再生成される差分サマリー内のフィルタ操作を処理する。
   * @param {MouseEvent} e
   */
  handleDocumentClick(e) {
    const presetButton = e.target.closest('#diff-filter-settings .preset-btn');
    if (presetButton) {
      const preset = presetButton.dataset.preset;
      this.filter.applyPreset(preset);
      this.updatePresetButtons(preset);
      return;
    }

    if (e.target.closest('#diff-filter-active-type .diff-filter-type-clear')) {
      this.filter.setElementTypeFilter(null);
    }
  }

  /**
   * UIを更新
   */
  updateUI() {
    // 統計を更新
    this.updateStats(this.filter.getStats());

    // 要素タイプ絞り込みチップを更新
    this.updateTypeFilterChip();

    this.updateViewFilterState();

    // プリセットボタンの状態を更新
    this.updatePresetButtonsFromState();
  }

  /**
   * サマリー数値クリックで適用された表示条件のラベルを更新
   */
  updateViewFilterState() {
    const state = document.getElementById('diff-view-filter-state');
    if (!state) return;

    const filters = Array.from(this.filter.activeFilters);
    const statusLabel = this.getActiveStatusLabel(filters);
    const criteriaLabel = this.getActiveCriteriaLabel(this.filter.activeCriteria);
    const typeLabel = getElementTypeFilterLabel(this.filter.activeElementType) || null;
    const parts = [typeLabel, criteriaLabel, statusLabel].filter(Boolean);

    state.textContent = parts.join(' / ');
    state.title = parts.join(' / ');
  }

  /**
   * 現在のステータス絞り込みを短い表示名に変換する
   * @param {Array<string>} filters
   * @returns {string}
   */
  getActiveStatusLabel(filters) {
    if (filters.length === 0) return '非表示';
    if (filters.length === DIFF_STATUS_VALUES.length) return '全表示';

    const labels = filters.map((status) => DIFF_STATUS_NAMES[status] || status);
    if (labels.length <= 2) {
      return labels.join('、');
    }
    return `${labels.slice(0, 2).join('、')} 他${labels.length - 2}`;
  }

  /**
   * 位置・インスタンス属性・断面属性の追加条件を短い表示名に変換する
   * @param {Object|null} criteria
   * @returns {string|null}
   */
  getActiveCriteriaLabel(criteria) {
    if (!criteria) return null;

    const labels = [];
    if (criteria.positionStates?.includes('exact')) labels.push('位置完全');
    if (criteria.positionStates?.includes('withinTolerance')) labels.push('位置誤差内');
    if (criteria.instanceStates?.includes('match')) labels.push('属性一致');
    if (criteria.instanceStates?.includes('mismatch')) labels.push('属性不一致');
    if (criteria.sectionStates?.includes('match')) labels.push('断面一致');
    if (criteria.sectionStates?.includes('mismatch')) labels.push('断面不一致');

    return labels.length > 0 ? labels.join('、') : null;
  }

  /**
   * 要素タイプ絞り込みの状態チップを更新
   */
  updateTypeFilterChip() {
    const chip = document.getElementById('diff-filter-active-type');
    if (!chip) return;

    const elementType = this.filter.activeElementType;
    if (!elementType) {
      chip.hidden = true;
      chip.replaceChildren();
      return;
    }

    const label = document.createElement('span');
    label.className = 'diff-filter-type-label';
    label.textContent = `絞り込み中: ${getElementTypeFilterLabel(elementType)}`;

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'diff-filter-type-clear';
    clearBtn.title = '要素タイプの絞り込みを解除';
    clearBtn.textContent = '✕';

    chip.replaceChildren(label, clearBtn);
    chip.hidden = false;
  }

  /**
   * 統計を更新
   * @param {Object} stats - 統計情報
   */
  updateStats(stats) {
    if (!stats) return;

    const visibleCount = document.getElementById('diff-visible-count');
    const totalCount = document.getElementById('diff-total-count');

    // 比較結果がある場合は、凡例・総数・表示数のすべてを「比較結果（データ）側の
    // 3D描画可能要素」を単一基準に統一する。これにより
    //   - 凡例カテゴリの合計 === 総数
    //   - 総数 === 差分サマリーの「3D表示対象」
    // が保証され、パネル内・パネル間で数がずれない。
    // 非描画のSTB定義は calculateRenderableStatusCounts で既に除外済み。
    if (this.comparisonStatusCounts) {
      const activeFilters = this.filter.activeFilters;
      const activeType = this.filter.activeElementType;
      const activeCriteria = this.filter.activeCriteria;
      // タイプ絞り込み中は、表示数の集計元をそのタイプのステータス集計に切り替える
      // （3D描画対象にないタイプの場合は空集計 = 表示 0）。
      // activeType は配列（例: 断面カテゴリ「梁」= 大梁+小梁）を許容し、その場合は合算する。
      const visibleSource = activeType
        ? this._sumTypeStatusCounts(activeType)
        : this.comparisonStatusCounts;
      let total = 0;
      let visible = 0;
      Object.entries(this.comparisonStatusCounts).forEach(([status, count]) => {
        total += count;
        if (activeFilters.has(status)) visible += visibleSource[status] || 0;
      });
      if (visibleCount) {
        visibleCount.textContent =
          activeCriteria && typeof stats.visibleElements === 'number'
            ? stats.visibleElements
            : visible;
      }
      if (totalCount) totalCount.textContent = total;
      return;
    }

    // 比較結果が無い場合（単一モデル読み込み等）は従来通りシーン統計を使用
    if (visibleCount) visibleCount.textContent = stats.visibleElements || 0;
    if (totalCount) totalCount.textContent = stats.totalElements || 0;
  }

  /**
   * 指定タイプ（単一 or 配列）のステータス集計を合算して返す。
   * @param {string|string[]} activeType
   * @returns {Object<string, number>} status → count
   */
  _sumTypeStatusCounts(activeType) {
    const types = Array.isArray(activeType) ? activeType : [activeType];
    const summed = {};
    for (const type of types) {
      const counts = this.comparisonTypeStatusCounts?.[type];
      if (!counts) continue;
      for (const [status, count] of Object.entries(counts)) {
        summed[status] = (summed[status] || 0) + count;
      }
    }
    return summed;
  }

  /**
   * 比較結果から3D表示可能な差分ステータス数を集計する。
   * 副作用として要素タイプ別の内訳を this.comparisonTypeStatusCounts に保持する
   * （要素タイプ絞り込み時の「3D表示中」算出に使用）。
   * @param {Map|Object} comparisonResults
   * @returns {Object.<string, number>}
   */
  calculateRenderableStatusCounts(comparisonResults) {
    const counts = Object.fromEntries(DIFF_STATUS_VALUES.map((status) => [status, 0]));
    this.comparisonTypeStatusCounts = {};
    if (!comparisonResults) {
      return counts;
    }

    const entries =
      comparisonResults instanceof Map
        ? comparisonResults.entries()
        : Object.entries(comparisonResults);

    for (const [elementType, result] of entries) {
      if (!result || result.isRenderable === false) continue;
      const resultCounts = getDiffStatusCounts(result);
      const typeCounts = {};
      for (const status of DIFF_STATUS_VALUES) {
        const count = resultCounts[status] || 0;
        counts[status] += count;
        typeCounts[status] = count;
      }
      this.comparisonTypeStatusCounts[elementType] = typeCounts;
    }

    return counts;
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

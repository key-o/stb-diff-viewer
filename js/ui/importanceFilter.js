/**
 * @fileoverview 重要度フィルタリング機能
 *
 * このファイルは、重要度レベル別の要素表示フィルタリング機能を提供します:
 * - 重要度レベル別の表示切り替え
 * - 一括選択・解除機能
 * - プリセットフィルタ（高重要度のみ等）
 * - フィルタ状態のステータス表示
 * - リアルタイムフィルタリング
 *
 * ユーザーは必要な重要度レベルの要素のみを表示することで、
 * 作業に集中でき、視覚的ノイズを削減できます。
 */

import {
  IMPORTANCE_LEVELS,
  IMPORTANCE_LEVEL_NAMES,
} from "../core/importanceManager.js";
import { getState, setState } from "../core/globalState.js";
import { applyImportanceVisibilityFilter } from "../viewer/rendering/materials.js";

/**
 * 重要度フィルタリングクラス
 * 重要度レベル別の表示切り替えを管理
 */
export class ImportanceFilter {
  constructor() {
    this.activeFilters = new Set(Object.values(IMPORTANCE_LEVELS)); // デフォルト: 全て表示
    this.presets = this.createDefaultPresets();
    this.isEnabled = true;
    this.filterHistory = [];
    this.maxHistorySize = 10;

    this.setupEventListeners();
  }

  /**
   * デフォルトプリセットを作成
   * @returns {Object} プリセット定義
   */
  createDefaultPresets() {
    return {
      all: {
        name: "全て表示",
        levels: new Set(Object.values(IMPORTANCE_LEVELS)),
        description: "すべての重要度レベルを表示",
      },
      highOnly: {
        name: "高重要度のみ",
        levels: new Set([IMPORTANCE_LEVELS.REQUIRED]),
        description: "高重要度の要素のみ表示",
      },
      mediumHigh: {
        name: "中・高重要度",
        levels: new Set([
          IMPORTANCE_LEVELS.REQUIRED,
          IMPORTANCE_LEVELS.OPTIONAL,
        ]),
        description: "中重要度と高重要度の要素を表示",
      },
      lowExcluded: {
        name: "低重要度除外",
        levels: new Set([
          IMPORTANCE_LEVELS.REQUIRED,
          IMPORTANCE_LEVELS.OPTIONAL,
        ]),
        description: "低重要度と対象外を除いた要素を表示",
      },
      differencesOnly: {
        name: "差分のみ（カスタム）",
        levels: new Set([
          IMPORTANCE_LEVELS.REQUIRED,
          IMPORTANCE_LEVELS.OPTIONAL,
        ]),
        description: "差分要素で重要度が高い要素のみ表示",
      },
    };
  }

  /**
   * イベントリスナーを設定
   */
  setupEventListeners() {
    // フィルタ変更通知を受信
    window.addEventListener("importanceFilterChanged", (event) => {
      this.handleFilterChange(event.detail);
    });

    // 重要度設定変更時のフィルタ再適用
    window.addEventListener("importanceSettingsChanged", (event) => {
      if (this.isEnabled) {
        this.applyFilter();
      }
    });

    // 比較結果更新時のフィルタ再適用
    window.addEventListener("updateComparisonStatistics", (event) => {
      if (this.isEnabled) {
        setTimeout(() => this.applyFilter(), 100); // 少し遅らせて実行
      }
    });
  }

  /**
   * 特定重要度レベルの表示切り替え
   * @param {string} level - 重要度レベル
   */
  toggleImportanceLevel(level) {
    if (!Object.values(IMPORTANCE_LEVELS).includes(level)) {
      console.warn(`Invalid importance level: ${level}`);
      return;
    }

    const wasActive = this.activeFilters.has(level);

    if (wasActive) {
      this.activeFilters.delete(level);
    } else {
      this.activeFilters.add(level);
    }

    this.saveToHistory();
    this.applyFilter();
    this.notifyFilterChange("toggle", {
      level,
      wasActive,
      isActive: !wasActive,
    });
  }

  /**
   * 複数の重要度レベルを一括設定
   * @param {Set<string>} levels - 表示する重要度レベルのSet
   */
  setActiveFilters(levels) {
    const previousFilters = new Set(this.activeFilters);
    this.activeFilters = new Set(levels);

    this.saveToHistory();
    this.applyFilter();
    this.notifyFilterChange("bulk", {
      previousFilters,
      currentFilters: this.activeFilters,
    });
  }

  /**
   * 全ての重要度レベルを表示
   */
  showAllLevels() {
    this.setActiveFilters(new Set(Object.values(IMPORTANCE_LEVELS)));
  }

  /**
   * 全ての重要度レベルを非表示
   */
  hideAllLevels() {
    this.setActiveFilters(new Set());
  }

  /**
   * プリセットフィルタを適用
   * @param {string} presetName - プリセット名
   */
  applyPreset(presetName) {
    const preset = this.presets[presetName];
    if (!preset) {
      console.warn(`Unknown preset: ${presetName}`);
      return;
    }

    this.setActiveFilters(new Set(preset.levels));
    this.notifyFilterChange("preset", { presetName, preset });
  }

  /**
   * フィルタを適用
   */
  applyFilter() {
    if (!this.isEnabled) {
      console.log("Importance filter is disabled");
      return;
    }

    try {
      const elementGroups = getState("elementGroups");
      if (!elementGroups) {
        console.log("No element groups available for filtering");
        return;
      }

      let totalElements = 0;
      let visibleElements = 0;

      // elementGroups may be an object, so use its values
      Object.values(elementGroups).forEach((group) => {
        if (!group || !group.children) return;
        group.children.forEach((element) => {
          totalElements++;
          // 重要度情報を取得
          const importance = element.userData.importance;
          const shouldBeVisible = this.shouldElementBeVisible(importance);
          // 可視性を設定
          element.visible = shouldBeVisible;
          if (shouldBeVisible) {
            visibleElements++;
          }
        });
      });

      // 描画更新を要求
      this.requestRender();

      console.log(
        `Importance filter applied: ${visibleElements}/${totalElements} elements visible`
      );

      // フィルタ適用完了を通知
      this.notifyFilterApplied({
        totalElements,
        visibleElements,
        activeFilters: Array.from(this.activeFilters),
      });
    } catch (error) {
      console.error("Failed to apply importance filter:", error);
    }
  }

  /**
   * 要素が表示されるべきかを判定
   * @param {string} importance - 要素の重要度
   * @returns {boolean} 表示すべきかどうか
   */
  shouldElementBeVisible(importance) {
    // 重要度情報がない場合はREQUIREDとして扱う
    const effectiveImportance = importance || IMPORTANCE_LEVELS.REQUIRED;
    return this.activeFilters.has(effectiveImportance);
  }

  /**
   * 描画更新を要求
   */
  requestRender() {
    const viewer = getState("viewer");
    if (viewer && typeof viewer.requestRender === "function") {
      viewer.requestRender();
    }

    // カスタム描画更新イベントを発行
    window.dispatchEvent(
      new CustomEvent("requestRender", {
        detail: {
          reason: "importanceFilter",
          timestamp: new Date().toISOString(),
        },
      })
    );
  }

  /**
   * フィルタ履歴に保存
   */
  saveToHistory() {
    const currentState = {
      filters: new Set(this.activeFilters),
      timestamp: new Date().toISOString(),
    };

    this.filterHistory.unshift(currentState);

    // 履歴サイズ制限
    if (this.filterHistory.length > this.maxHistorySize) {
      this.filterHistory = this.filterHistory.slice(0, this.maxHistorySize);
    }
  }

  /**
   * 前の状態に戻す
   */
  undo() {
    if (this.filterHistory.length > 1) {
      // 現在の状態を除いて次の状態を取得
      this.filterHistory.shift();
      const previousState = this.filterHistory[0];

      this.activeFilters = new Set(previousState.filters);
      this.applyFilter();
      this.notifyFilterChange("undo", { previousState });

      return true;
    }
    return false;
  }

  /**
   * フィルタの有効/無効を切り替え
   * @param {boolean} enabled - 有効化するかどうか
   */
  setEnabled(enabled) {
    const wasEnabled = this.isEnabled;
    this.isEnabled = enabled;

    if (enabled && !wasEnabled) {
      // 有効化時: フィルタを適用
      this.applyFilter();
    } else if (!enabled && wasEnabled) {
      // 無効化時: すべての要素を表示
      this.showAllElements();
    }

    this.notifyFilterChange("enabledToggle", { enabled, wasEnabled });
  }

  /**
   * すべての要素を表示（フィルタ無効化時）
   */
  showAllElements() {
    try {
      const elementGroups = getState("elementGroups");
      if (!elementGroups) return;

      elementGroups.forEach((group) => {
        if (!group || !group.children) return;
        group.children.forEach((element) => {
          element.visible = true;
        });
      });

      this.requestRender();
    } catch (error) {
      console.error("Failed to show all elements:", error);
    }
  }

  /**
   * フィルタ変更を通知
   * @param {string} action - 実行されたアクション
   * @param {Object} details - 詳細情報
   */
  notifyFilterChange(action, details = {}) {
    window.dispatchEvent(
      new CustomEvent("importanceFilterChanged", {
        detail: {
          action,
          activeFilters: Array.from(this.activeFilters),
          isEnabled: this.isEnabled,
          timestamp: new Date().toISOString(),
          ...details,
        },
      })
    );
  }

  /**
   * フィルタ適用完了を通知
   * @param {Object} stats - 統計情報
   */
  notifyFilterApplied(stats) {
    window.dispatchEvent(
      new CustomEvent("importanceFilterApplied", {
        detail: {
          ...stats,
          isEnabled: this.isEnabled,
          timestamp: new Date().toISOString(),
        },
      })
    );
  }

  /**
   * フィルタ変更を処理
   * @param {Object} details - 変更詳細
   */
  handleFilterChange(details) {
    // 外部からのフィルタ変更要求を処理
    if (details.action === "setFilters" && details.filters) {
      this.setActiveFilters(new Set(details.filters));
    } else if (details.action === "toggleLevel" && details.level) {
      this.toggleImportanceLevel(details.level);
    } else if (details.action === "applyPreset" && details.preset) {
      this.applyPreset(details.preset);
    }
  }

  /**
   * 現在のフィルタ状態を取得
   * @returns {Object} フィルタ状態情報
   */
  getFilterState() {
    return {
      activeFilters: Array.from(this.activeFilters),
      isEnabled: this.isEnabled,
      presets: Object.keys(this.presets),
      history: this.filterHistory.map((h) => ({
        filters: Array.from(h.filters),
        timestamp: h.timestamp,
      })),
    };
  }

  /**
   * 統計情報を取得
   * @returns {Object} フィルタ統計
   */
  getStats() {
    const elementGroups = getState("elementGroups");
    if (!elementGroups) {
      return {
        totalElements: 0,
        visibleElements: 0,
        hiddenElements: 0,
        filterEfficiency: 0,
      };
    }

    let totalElements = 0;
    let visibleElements = 0;

    // elementGroups may be an object, so use its values
    Object.values(elementGroups).forEach((group) => {
      if (!group || !group.children) return;
      group.children.forEach((element) => {
        totalElements++;
        if (element.visible) {
          visibleElements++;
        }
      });
    });

    const hiddenElements = totalElements - visibleElements;
    const filterEfficiency =
      totalElements > 0 ? (hiddenElements / totalElements) * 100 : 0;

    return {
      totalElements,
      visibleElements,
      hiddenElements,
      filterEfficiency: Math.round(filterEfficiency * 100) / 100,
      activeFilterCount: this.activeFilters.size,
      isEnabled: this.isEnabled,
    };
  }

  /**
   * デバッグ情報を出力
   */
  debug() {
    console.group("ImportanceFilter Debug Info");
    console.log("Active filters:", Array.from(this.activeFilters));
    console.log("Is enabled:", this.isEnabled);
    console.log("Presets:", this.presets);
    console.log("History:", this.filterHistory);
    console.log("Stats:", this.getStats());
    console.groupEnd();
  }
}

/**
 * フィルタ状態インジケーター
 * UIでフィルタ状態を表示するためのヘルパークラス
 */
export class FilterStatusIndicator {
  constructor(containerElement) {
    this.container = containerElement;
    this.filter = null;
    this.isVisible = false;

    this.createElement();
    this.setupEventListeners();
  }

  /**
   * インジケーター要素を作成
   */
  createElement() {
    const indicatorHTML = `
      <div id="importance-filter-indicator" class="filter-indicator" style="display: none;">
        <div class="filter-status">
          <span class="filter-icon">🔍</span>
          <span class="filter-text">フィルタ: </span>
          <span class="filter-count">-/-</span>
        </div>
        <div class="filter-controls">
          <button class="filter-btn" data-action="showAll" title="すべて表示">全</button>
          <button class="filter-btn" data-action="hideAll" title="すべて非表示">無</button>
          <button class="filter-btn" data-action="undo" title="元に戻す">↶</button>
          <button class="filter-btn toggle-btn" data-action="toggle" title="フィルタ切り替え">●</button>
        </div>
      </div>
    `;

    this.container.insertAdjacentHTML("beforeend", indicatorHTML);
    this.element = document.getElementById("importance-filter-indicator");

    this.addStyles();
  }

  /**
   * スタイルを追加
   */
  addStyles() {
    const styles = `
      <style id="filter-indicator-styles">
        .filter-indicator {
          position: fixed;
          bottom: 20px;
          left: 20px;
          background: rgba(255, 255, 255, 0.95);
          border: 1px solid #ddd;
          border-radius: 6px;
          padding: 8px 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          font-size: 12px;
          z-index: 999;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .filter-status {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        
        .filter-icon {
          font-size: 14px;
        }
        
        .filter-text {
          font-weight: bold;
          color: #333;
        }
        
        .filter-count {
          color: #666;
          font-family: monospace;
        }
        
        .filter-controls {
          display: flex;
          gap: 4px;
        }
        
        .filter-btn {
          padding: 2px 6px;
          border: 1px solid #ccc;
          border-radius: 3px;
          background: white;
          cursor: pointer;
          font-size: 10px;
          transition: all 0.2s;
        }
        
        .filter-btn:hover {
          background: #f0f0f0;
        }
        
        .filter-btn.toggle-btn.active {
          background: #007bff;
          color: white;
          border-color: #007bff;
        }
      </style>
    `;

    if (!document.getElementById("filter-indicator-styles")) {
      document.head.insertAdjacentHTML("beforeend", styles);
    }
  }

  /**
   * イベントリスナーを設定
   */
  setupEventListeners() {
    // ボタンクリックイベント
    this.element.addEventListener("click", (e) => {
      if (e.target.classList.contains("filter-btn")) {
        const action = e.target.dataset.action;
        this.handleAction(action);
      }
    });

    // フィルタ状態変更の監視
    window.addEventListener("importanceFilterChanged", (event) => {
      this.updateDisplay(event.detail);
    });

    window.addEventListener("importanceFilterApplied", (event) => {
      this.updateStats(event.detail);
    });
  }

  /**
   * フィルタインスタンスを設定
   * @param {ImportanceFilter} filter - フィルタインスタンス
   */
  setFilter(filter) {
    this.filter = filter;
    this.updateDisplay();
  }

  /**
   * アクションを処理
   * @param {string} action - アクション名
   */
  handleAction(action) {
    if (!this.filter) return;

    switch (action) {
      case "showAll":
        this.filter.showAllLevels();
        break;
      case "hideAll":
        this.filter.hideAllLevels();
        break;
      case "undo":
        this.filter.undo();
        break;
      case "toggle":
        this.filter.setEnabled(!this.filter.isEnabled);
        break;
    }
  }

  /**
   * 表示を更新
   * @param {Object} details - 更新詳細
   */
  updateDisplay(details = {}) {
    if (!this.filter) return;

    const stats = this.filter.getStats();
    const isActive =
      this.filter.isEnabled &&
      this.filter.activeFilters.size < Object.values(IMPORTANCE_LEVELS).length;

    // 表示/非表示の制御
    this.element.style.display = isActive ? "flex" : "none";

    // 統計表示の更新
    this.updateStats(stats);

    // トグルボタンの状態更新
    const toggleBtn = this.element.querySelector('[data-action="toggle"]');
    toggleBtn.classList.toggle("active", this.filter.isEnabled);
  }

  /**
   * 統計表示を更新
   * @param {Object} stats - 統計情報
   */
  updateStats(stats) {
    const countElement = this.element.querySelector(".filter-count");
    countElement.textContent = `${stats.visibleElements}/${stats.totalElements}`;

    // 効率性に応じた色分け
    if (stats.filterEfficiency > 50) {
      countElement.style.color = "#28a745"; // 緑: 高効率
    } else if (stats.filterEfficiency > 20) {
      countElement.style.color = "#ffc107"; // 黄: 中効率
    } else {
      countElement.style.color = "#666"; // グレー: 低効率
    }
  }

  /**
   * インジケーターの表示/非表示
   * @param {boolean} visible - 表示するかどうか
   */
  setVisible(visible) {
    this.isVisible = visible;
    this.element.style.display = visible ? "flex" : "none";
  }
}

// グローバルフィルタインスタンス
export const globalImportanceFilter = new ImportanceFilter();

/**
 * フィルタシステムの初期化
 * @param {HTMLElement} indicatorContainer - インジケーター配置先
 * @returns {Object} フィルタとインジケーターのインスタンス
 */
export function initializeImportanceFilterSystem(
  indicatorContainer = document.body
) {
  const indicator = new FilterStatusIndicator(indicatorContainer);
  indicator.setFilter(globalImportanceFilter);

  console.log("Importance filter system initialized");

  return {
    filter: globalImportanceFilter,
    indicator,
  };
}

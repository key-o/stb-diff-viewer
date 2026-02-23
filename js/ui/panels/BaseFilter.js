/**
 * @fileoverview フィルタリング基底クラス
 *
 * DiffStatusFilter と ImportanceFilter 間で共有される
 * フィルタリングロジックを集約。
 *
 * 抽出元:
 * - diffStatusFilter.js: applyFilter, showAllElements, requestRender, etc.
 * - importanceFilter.js: applyFilter, showAllElements, requestRender, etc.
 */

import { getState } from '../../app/globalState.js';
import { sceneController } from '../../app/controllers/sceneController.js';
import { scheduleRender } from '../../utils/renderScheduler.js';

/**
 * フィルタリング基底クラス
 * @abstract
 */
export class BaseFilter {
  /**
   * @param {Object} options
   * @param {Object} options.log - ロガーインスタンス
   * @param {Object} options.eventBus - イベントバス
   * @param {Object} options.events - イベント定義 { FILTER_CHANGED, FILTER_APPLIED }
   * @param {string} options.filterName - フィルタ名（ログ用）
   */
  constructor(options) {
    this._log = options.log;
    this._eventBus = options.eventBus;
    this._events = options.events;
    this._filterName = options.filterName;
    this.activeFilters = new Set();
    this.isEnabled = true;
    this.filterHistory = [];
    this.maxHistorySize = 10;
  }

  /**
   * 複数のフィルタ値を一括設定
   * @param {Set<string>} values - 表示するフィルタ値のSet
   */
  setActiveFilters(values) {
    const previousFilters = new Set(this.activeFilters);
    this.activeFilters = new Set(values);

    this.saveToHistory();
    this.applyFilter();
    this.notifyFilterChange('bulk', {
      previousFilters,
      currentFilters: this.activeFilters,
    });
  }

  /**
   * フィルタを適用
   * @abstract サブクラスで要素からフィルタ値を抽出するロジックを提供
   */
  applyFilter() {
    if (!this.isEnabled) {
      this._log.info(`${this._filterName} filter is disabled`);
      return;
    }

    try {
      if (
        !sceneController.getElementGroups() ||
        Object.keys(sceneController.getElementGroups()).length === 0
      ) {
        this._log.info('No element groups available for filtering');
        return;
      }

      let totalElements = 0;
      let visibleElements = 0;

      Object.values(sceneController.getElementGroups()).forEach((group) => {
        if (!group || !group.children) return;
        group.children.forEach((element) => {
          totalElements++;
          const filterValue = this._getFilterValueFromElement(element);
          const shouldBeVisible = this.shouldElementBeVisible(filterValue);
          element.visible = shouldBeVisible;
          if (shouldBeVisible) {
            visibleElements++;
          }
        });
      });

      this.requestRender();

      this._log.info(
        `${this._filterName} filter applied: ${visibleElements}/${totalElements} elements visible`,
      );

      this._onFilterApplied(totalElements, visibleElements);
    } catch (error) {
      this._log.error(`Failed to apply ${this._filterName} filter:`, error);
    }
  }

  /**
   * 要素からフィルタ値を取得（サブクラスでオーバーライド）
   * @abstract
   * @param {THREE.Object3D} element
   * @returns {string}
   */
  _getFilterValueFromElement(_element) {
    throw new Error('_getFilterValueFromElement must be implemented');
  }

  /**
   * フィルタ適用完了後のコールバック（サブクラスでオーバーライド可）
   * @param {number} totalElements
   * @param {number} visibleElements
   */
  _onFilterApplied(totalElements, visibleElements) {
    this.notifyFilterApplied({
      totalElements,
      visibleElements,
      activeFilters: Array.from(this.activeFilters),
    });
  }

  /**
   * 要素が表示されるべきかを判定
   * @param {string} filterValue - 要素のフィルタ値
   * @returns {boolean}
   */
  shouldElementBeVisible(filterValue) {
    return this.activeFilters.has(filterValue);
  }

  /**
   * 描画更新を要求
   */
  requestRender() {
    const viewer = getState('viewer');
    if (viewer && typeof viewer.requestRender === 'function') {
      viewer.requestRender();
    }

    scheduleRender();

    window.dispatchEvent(
      new CustomEvent('requestRender', {
        detail: {
          reason: this._filterName,
          timestamp: new Date().toISOString(),
        },
      }),
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

    if (this.filterHistory.length > this.maxHistorySize) {
      this.filterHistory = this.filterHistory.slice(0, this.maxHistorySize);
    }
  }

  /**
   * 前の状態に戻す
   */
  undo() {
    if (this.filterHistory.length > 1) {
      this.filterHistory.shift();
      const previousState = this.filterHistory[0];

      this.activeFilters = new Set(previousState.filters);
      this.applyFilter();
      this.notifyFilterChange('undo', { previousState });

      return true;
    }
    return false;
  }

  /**
   * フィルタの有効/無効を切り替え
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    const wasEnabled = this.isEnabled;
    this.isEnabled = enabled;

    if (enabled && !wasEnabled) {
      this.applyFilter();
    } else if (!enabled && wasEnabled) {
      this.showAllElements();
    }

    this.notifyFilterChange('enabledToggle', { enabled, wasEnabled });
  }

  /**
   * すべての要素を表示（フィルタ無効化時）
   */
  showAllElements() {
    try {
      if (
        !sceneController.getElementGroups() ||
        Object.keys(sceneController.getElementGroups()).length === 0
      )
        return;

      Object.values(sceneController.getElementGroups()).forEach((group) => {
        if (!group || !group.children) return;
        group.children.forEach((element) => {
          element.visible = true;
        });
      });

      this.requestRender();
    } catch (error) {
      this._log.error('Failed to show all elements:', error);
    }
  }

  /**
   * フィルタ変更を通知
   * @param {string} action
   * @param {Object} details
   */
  notifyFilterChange(action, details = {}) {
    this._eventBus.emit(this._events.FILTER_CHANGED, {
      action,
      activeFilters: Array.from(this.activeFilters),
      isEnabled: this.isEnabled,
      timestamp: new Date().toISOString(),
      ...details,
    });
  }

  /**
   * フィルタ適用完了を通知
   * @param {Object} stats
   */
  notifyFilterApplied(stats) {
    this._eventBus.emit(this._events.FILTER_APPLIED, {
      ...stats,
      isEnabled: this.isEnabled,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 現在のフィルタ状態を取得
   * @returns {Object}
   */
  getFilterState() {
    return {
      activeFilters: Array.from(this.activeFilters),
      isEnabled: this.isEnabled,
      presets: Object.keys(this.presets || {}),
      history: this.filterHistory.map((h) => ({
        filters: Array.from(h.filters),
        timestamp: h.timestamp,
      })),
    };
  }

  /**
   * 基本統計情報を取得
   * @returns {Object}
   */
  getStats() {
    if (
      !sceneController.getElementGroups() ||
      Object.keys(sceneController.getElementGroups()).length === 0
    ) {
      return {
        totalElements: 0,
        visibleElements: 0,
        hiddenElements: 0,
        filterEfficiency: 0,
      };
    }

    let totalElements = 0;
    let visibleElements = 0;

    Object.values(sceneController.getElementGroups()).forEach((group) => {
      if (!group || !group.children) return;
      group.children.forEach((element) => {
        totalElements++;
        if (element.visible) {
          visibleElements++;
        }
      });
    });

    const hiddenElements = totalElements - visibleElements;
    const filterEfficiency = totalElements > 0 ? (hiddenElements / totalElements) * 100 : 0;

    return {
      totalElements,
      visibleElements,
      hiddenElements,
      filterEfficiency: Math.round(filterEfficiency * 100) / 100,
      activeFilterCount: this.activeFilters.size,
      isEnabled: this.isEnabled,
    };
  }
}

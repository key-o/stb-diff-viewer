/**
 * @fileoverview 差分ステータスフィルタリング機能
 *
 * このファイルは、差分ステータス別の要素表示フィルタリング機能を提供します:
 * - 差分ステータス別の表示切り替え（matched, onlyA, onlyB）
 * - 一括選択・解除機能
 * - プリセットフィルタ（差分のみ、両方にある部材のみ等）
 * - フィルタ状態のステータス表示
 * - リアルタイムフィルタリング
 *
 * ユーザーは必要な差分ステータスの要素のみを表示することで、
 * 差分確認作業に集中でき、視覚的ノイズを削減できます。
 *
 * 注: 差分カテゴリ、プリセットの定義は config/diffFilterConfig.js に統合されています。
 */

import { getState } from '../../app/globalState.js';
import { UI_TIMING } from '../../config/uiTimingConfig.js';
import { eventBus, DiffStatusEvents, ComparisonEvents } from '../../app/events/index.js';
import { sceneController } from '../../app/controllers/sceneController.js';
import { createLogger } from '../../utils/logger.js';
import { BaseFilter } from './BaseFilter.js';

// 設定ファイルから定義をインポート
import {
  DIFF_STATUS,
  DIFF_STATUS_VALUES,
  getPresetsForFilter,
  DIFF_FILTER_UI_CONFIG,
} from '../../config/diffFilterConfig.js';

// 他モジュールからの利便性のため再エクスポート
export { DIFF_STATUS_VALUES };

const log = createLogger('diffStatusFilter');

/**
 * 差分ステータスフィルタリングクラス
 * 差分ステータス別の表示切り替えを管理
 */
export class DiffStatusFilter extends BaseFilter {
  constructor() {
    super({
      log,
      eventBus,
      events: DiffStatusEvents,
      filterName: 'DiffStatus',
    });
    this.activeFilters = new Set(DIFF_STATUS_VALUES); // デフォルト: 6カテゴリ全て表示
    this.presets = this.createDefaultPresets();

    this.setupEventListeners();
  }

  /**
   * デフォルトプリセットを作成
   * config/diffFilterConfig.js から設定を読み込み
   * @returns {Object} プリセット定義
   */
  createDefaultPresets() {
    // 設定ファイルからプリセットを読み込み
    const locale = DIFF_FILTER_UI_CONFIG.locale || 'ja';
    return getPresetsForFilter(locale);
  }

  /**
   * イベントリスナーを設定
   */
  setupEventListeners() {
    // フィルタ変更通知を受信（EventBus経由）
    eventBus.on(DiffStatusEvents.FILTER_CHANGED, (data) => {
      this.handleFilterChange(data);
    });

    // 比較結果更新時のフィルタ再適用（EventBus経由）
    eventBus.on(ComparisonEvents.UPDATE_STATISTICS, (_data) => {
      if (this.isEnabled) {
        setTimeout(() => this.applyFilter(), UI_TIMING.FILTER_APPLY_DELAY_MS);
      }
    });

    // 比較完了時にもフィルタを適用
    eventBus.on(ComparisonEvents.COMPLETED, () => {
      if (this.isEnabled) {
        setTimeout(() => this.applyFilter(), UI_TIMING.FILTER_APPLY_DELAY_MS);
      }
    });
  }

  /**
   * 特定差分ステータスの表示切り替え
   * @param {string} status - 差分ステータス
   */
  toggleDiffStatus(status) {
    // 新しい6カテゴリに含まれるか、レガシーmismatchかをチェック
    if (!DIFF_STATUS_VALUES.includes(status) && status !== DIFF_STATUS.MISMATCH) {
      log.warn(`Invalid diff status: ${status}`);
      return;
    }
    // レガシーmismatchはattributeMismatchとして扱う
    const effectiveStatus =
      status === DIFF_STATUS.MISMATCH ? DIFF_STATUS.ATTRIBUTE_MISMATCH : status;

    const wasActive = this.activeFilters.has(effectiveStatus);

    if (wasActive) {
      this.activeFilters.delete(effectiveStatus);
    } else {
      this.activeFilters.add(effectiveStatus);
    }

    this.saveToHistory();
    this.applyFilter();
    this.notifyFilterChange('toggle', {
      status: effectiveStatus,
      wasActive,
      isActive: !wasActive,
    });
  }

  /**
   * 全ての差分ステータスを表示
   */
  showAllStatuses() {
    this.setActiveFilters(new Set(DIFF_STATUS_VALUES));
  }

  /**
   * 全ての差分ステータスを非表示
   */
  hideAllStatuses() {
    this.setActiveFilters(new Set());
  }

  /**
   * プリセットフィルタを適用
   * @param {string} presetName - プリセット名
   */
  applyPreset(presetName) {
    const preset = this.presets[presetName];
    if (!preset) {
      log.warn(`Unknown preset: ${presetName}`);
      return;
    }

    this.setActiveFilters(new Set(preset.levels));
    this.notifyFilterChange('preset', { presetName, preset });

    // プリセット適用イベントを発行
    eventBus.emit(DiffStatusEvents.PRESET_APPLIED, {
      presetName,
      preset,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 要素からフィルタ値（差分ステータス）を取得
   * @param {THREE.Object3D} element
   * @returns {string}
   */
  _getFilterValueFromElement(element) {
    return this.getDiffStatusFromElement(element);
  }

  /**
   * 要素が表示されるべきかを判定
   * @param {string} diffStatus - 要素の差分ステータス
   * @returns {boolean} 表示すべきかどうか
   */
  shouldElementBeVisible(diffStatus) {
    // 差分ステータス情報がない場合はMATCHEDとして扱う
    const effectiveStatus = diffStatus || DIFF_STATUS.MATCHED;
    return this.activeFilters.has(effectiveStatus);
  }

  /**
   * フィルタ適用完了後のコールバック（統計情報付き）
   * @param {number} _totalElements
   * @param {number} _visibleElements
   */
  _onFilterApplied(_totalElements, _visibleElements) {
    this.notifyFilterApplied(this.getStats());
  }

  /**
   * 要素から差分ステータスを取得
   * 6カテゴリ分類: matched, onlyA, onlyB, positionTolerance, attributeMismatch, combined
   * @param {THREE.Object3D} element - 3D要素
   * @returns {string} 差分ステータス
   */
  getDiffStatusFromElement(element) {
    if (!element.userData) {
      // userDataがない場合は単一モデル判定へ
      return this._getSingleModelStatus();
    }

    // 比較モードでない場合（単一モデル読み込み時）を先にチェック
    // 比較情報がない要素は単一モデルとして扱う
    const hasComparisonInfo =
      element.userData.positionState ||
      element.userData.attributeState ||
      element.userData.diffStatus ||
      element.userData.comparisonState ||
      (element.userData.modelSource &&
        element.userData.modelSource !== 'solid' &&
        element.userData.modelSource !== 'line');

    if (!hasComparisonInfo) {
      return this._getSingleModelStatus();
    }

    // 新しい6カテゴリ形式: positionState と attributeState を組み合わせて判定
    const positionState = element.userData.positionState; // 'exact' | 'withinTolerance' | 'mismatch'
    const attributeState = element.userData.attributeState; // 'matched' | 'mismatch'

    if (positionState && attributeState) {
      return this.determineStatusFromStates(positionState, attributeState);
    }

    // diffStatus プロパティを確認（レガシー対応）
    if (element.userData.diffStatus) {
      const status = element.userData.diffStatus;
      // status オブジェクトの場合
      if (typeof status === 'object' && status.status) {
        switch (status.status) {
          case 'added':
            return DIFF_STATUS.ONLY_B;
          case 'removed':
            return DIFF_STATUS.ONLY_A;
          case 'modified':
            // modified の場合、positionState/attributeState で細分化を試みる
            if (positionState === 'withinTolerance' && attributeState === 'mismatch') {
              return DIFF_STATUS.COMBINED;
            }
            if (positionState === 'withinTolerance') {
              return DIFF_STATUS.POSITION_TOLERANCE;
            }
            return DIFF_STATUS.ATTRIBUTE_MISMATCH;
          case 'unchanged':
            return DIFF_STATUS.MATCHED;
          default:
            // 新しいステータス値をそのまま返す
            if (DIFF_STATUS_VALUES.includes(status.status)) {
              return status.status;
            }
            return status.status;
        }
      }
      // 文字列の場合
      if (typeof status === 'string') {
        // レガシー mismatch を attributeMismatch に変換
        if (status === 'mismatch') {
          return DIFF_STATUS.ATTRIBUTE_MISMATCH;
        }
        return status;
      }
    }

    // comparisonState プロパティを確認（レガシー対応）
    if (element.userData.comparisonState) {
      const state = element.userData.comparisonState;
      // レガシー mismatch を attributeMismatch に変換
      if (state === 'mismatch') {
        return DIFF_STATUS.ATTRIBUTE_MISMATCH;
      }
      return state;
    }

    // modelSource から推測
    if (element.userData.modelSource) {
      const source = element.userData.modelSource;
      if (source === 'A') return DIFF_STATUS.ONLY_A;
      if (source === 'B') return DIFF_STATUS.ONLY_B;
      if (source === 'both' || source === 'matched') {
        // toleranceState と attributeState を組み合わせて6カテゴリ判定
        const toleranceState = element.userData.toleranceState;
        const attrState = element.userData.attributeState || 'matched';

        if (toleranceState === 'withinTolerance') {
          if (attrState === 'mismatch') {
            return DIFF_STATUS.COMBINED;
          }
          return DIFF_STATUS.POSITION_TOLERANCE;
        }
        if (toleranceState === 'exact' || toleranceState === undefined) {
          if (attrState === 'mismatch') {
            return DIFF_STATUS.ATTRIBUTE_MISMATCH;
          }
          return DIFF_STATUS.MATCHED;
        }
      }
    }

    // デフォルトはmatched（両モデルが読み込まれている場合の未分類要素）
    return DIFF_STATUS.MATCHED;
  }

  /**
   * 単一モデル読み込み時のステータスを取得
   * @private
   * @returns {string} 差分ステータス
   */
  _getSingleModelStatus() {
    const modelBDocument = getState('models.documentB');
    const modelADocument = getState('models.documentA');

    // モデルAのみが読み込まれている場合
    if (modelADocument && !modelBDocument) {
      return DIFF_STATUS.ONLY_A;
    }
    // モデルBのみが読み込まれている場合
    if (modelBDocument && !modelADocument) {
      return DIFF_STATUS.ONLY_B;
    }
    // 両方読み込まれていないか、両方読み込まれている場合
    return DIFF_STATUS.MATCHED;
  }

  /**
   * positionState と attributeState から6カテゴリステータスを決定
   * @param {string} positionState - 位置状態 ('exact' | 'withinTolerance' | 'mismatch')
   * @param {string} attributeState - 属性状態 ('matched' | 'mismatch')
   * @returns {string} 差分ステータス
   */
  determineStatusFromStates(positionState, attributeState) {
    // 位置が許容差超過の場合はマッチング失敗（onlyA/onlyBとして別処理）
    if (positionState === 'mismatch') {
      // この状態は通常到達しない（マッチング段階で除外されるため）
      return DIFF_STATUS.ATTRIBUTE_MISMATCH;
    }

    // 位置完全一致
    if (positionState === 'exact') {
      if (attributeState === 'matched') {
        return DIFF_STATUS.MATCHED;
      }
      return DIFF_STATUS.ATTRIBUTE_MISMATCH;
    }

    // 位置許容差内
    if (positionState === 'withinTolerance') {
      if (attributeState === 'matched') {
        return DIFF_STATUS.POSITION_TOLERANCE;
      }
      return DIFF_STATUS.COMBINED;
    }

    // デフォルト
    return DIFF_STATUS.MATCHED;
  }

  /**
   * フィルタ変更を処理
   * @param {Object} details - 変更詳細
   */
  handleFilterChange(details) {
    // 外部からのフィルタ変更要求を処理
    if (details.action === 'setFilters' && details.filters) {
      this.setActiveFilters(new Set(details.filters));
    } else if (details.action === 'toggleStatus' && details.status) {
      this.toggleDiffStatus(details.status);
    } else if (details.action === 'applyPreset' && details.preset) {
      this.applyPreset(details.preset);
    }
  }

  /**
   * 統計情報を取得（ステータス別の内訳付き）
   * @returns {Object} フィルタ統計
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
        byStatus: {},
      };
    }

    let totalElements = 0;
    let visibleElements = 0;
    const byStatus = {};
    // 6カテゴリすべてを初期化
    DIFF_STATUS_VALUES.forEach((status) => {
      byStatus[status] = { total: 0, visible: 0 };
    });

    Object.values(sceneController.getElementGroups()).forEach((group) => {
      if (!group || !group.children) return;
      group.children.forEach((element) => {
        totalElements++;
        const diffStatus = this.getDiffStatusFromElement(element);

        if (byStatus[diffStatus]) {
          byStatus[diffStatus].total++;
          if (element.visible) {
            byStatus[diffStatus].visible++;
          }
        }

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
      byStatus,
    };
  }

  /**
   * デバッグ情報を出力
   */
  debug() {
    log.info('DiffStatusFilter Debug Info');
    log.info('Active filters:', Array.from(this.activeFilters));
    log.info('Is enabled:', this.isEnabled);
    log.info('Presets:', this.presets);
    log.info('History:', this.filterHistory);
    log.info('Stats:', this.getStats());
    log.infoEnd();
  }
}

// グローバルフィルタインスタンス
export const globalDiffStatusFilter = new DiffStatusFilter();

/**
 * フィルタシステムの初期化
 * @returns {Object} フィルタのインスタンス
 */
export function initializeDiffStatusFilterSystem() {
  log.info('Diff status filter system initialized');
  return {
    filter: globalDiffStatusFilter,
  };
}

export default DiffStatusFilter;

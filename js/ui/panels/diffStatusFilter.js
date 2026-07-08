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

import { getState } from '../../data/state/globalState.js';
import { getElementIds } from '../../app/controllers/interaction/selectionInfoUtils.js';
import { UI_TIMING } from '../../config/uiTimingConfig.js';
import { eventBus, DiffStatusEvents, ComparisonEvents } from '../../data/events/index.js';
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
    this.activeElementType = null; // null = 全要素タイプを表示
    this.activeCriteria = null; // positionState / attributeMismatchKind などの追加条件
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
   * プリセットは「全体に対する見え方」を選ぶ操作のため、要素タイプ絞り込みは解除する
   * @param {string} presetName - プリセット名
   */
  applyPreset(presetName) {
    const preset = this.presets[presetName];
    if (!preset) {
      log.warn(`Unknown preset: ${presetName}`);
      return;
    }

    this.activeElementType = null;
    this.activeCriteria = null;
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
   * 要素タイプ絞り込みを設定する
   * @param {string|null} elementType - 表示する要素タイプ（null で解除）
   */
  setElementTypeFilter(elementType) {
    if (this.activeElementType === elementType) return;

    this.activeElementType = elementType || null;
    this.applyFilter();
    this.notifyFilterChange('elementType', { elementType: this.activeElementType });
  }

  /**
   * 差分ステータスと要素タイプ絞り込みを同時に設定して一括適用する
   * （差分サマリーのグラフ・表クリックから使用。applyFilter を1回で済ませる）
   * @param {Iterable<string>} statuses - 表示する差分ステータス
   * @param {string|string[]|null} [elementType] - 表示する要素タイプ（配列で複数タイプ、null で全タイプ）
   * @param {Object|null} [criteria] - 位置/属性種別などの追加条件
   */
  applyStatusAndTypeFilter(statuses, elementType = null, criteria = null) {
    const previousFilters = new Set(this.activeFilters);
    this.activeFilters = new Set(statuses);
    this.activeElementType = elementType || null;
    this.activeCriteria = normalizeCriteria(criteria);

    this.saveToHistory();
    this.applyFilter();
    this.notifyFilterChange('bulk', {
      previousFilters,
      currentFilters: this.activeFilters,
      elementType: this.activeElementType,
      criteria: this.activeCriteria,
    });
  }

  /**
   * 要素タイプ（グループ）単位の可視判定。
   * activeElementType は単一タイプ（文字列）または複数タイプ（配列）を許容する。
   * 配列の場合はいずれかに一致すれば可視（例: 断面カテゴリ「梁」= 大梁+小梁）。
   * @param {string} groupType - 要素グループのタイプ名
   * @returns {boolean}
   */
  _isElementTypeVisible(groupType) {
    const active = this.activeElementType;
    if (!active) return true;
    return Array.isArray(active) ? active.includes(groupType) : groupType === active;
  }

  /**
   * 要素からフィルタ値（差分ステータス）を取得
   * @param {THREE.Object3D} element
   * @returns {string}
   */
  _getFilterValueFromElement(element) {
    return {
      status: this.getDiffStatusFromElement(element),
      element,
    };
  }

  /**
   * 要素が表示されるべきかを判定
   * @param {string} diffStatus - 要素の差分ステータス
   * @returns {boolean} 表示すべきかどうか
   */
  shouldElementBeVisible(diffStatus) {
    if (diffStatus && typeof diffStatus === 'object') {
      const effectiveStatus = diffStatus.status || DIFF_STATUS.MATCHED;
      return (
        this.activeFilters.has(effectiveStatus) &&
        this.doesElementMatchActiveCriteria(diffStatus.element, effectiveStatus)
      );
    }

    // 差分ステータス情報がない場合はMATCHEDとして扱う
    const effectiveStatus = diffStatus || DIFF_STATUS.MATCHED;
    return this.activeFilters.has(effectiveStatus);
  }

  /**
   * 現在の追加条件に3D要素が一致するか判定する
   * @param {THREE.Object3D} element
   * @param {string} diffStatus
   * @returns {boolean}
   */
  doesElementMatchActiveCriteria(element, diffStatus) {
    if (!this.activeCriteria) return true;
    const axes = getElementDiffAxes(element, diffStatus);
    const criteria = this.activeCriteria;

    if (criteria.positionStates && !criteria.positionStates.includes(axes.positionState)) {
      return false;
    }
    if (criteria.instanceStates && !criteria.instanceStates.includes(axes.instanceState)) {
      return false;
    }
    if (criteria.sectionStates && !criteria.sectionStates.includes(axes.sectionState)) {
      return false;
    }
    // 断面定義id絞り込み（差分サマリーの断面タブ数値セルクリック）:
    // 該当断面を参照する配置要素（対応ペア matched を含む）を表示する。
    // A/Bで id_section 番号が衝突しうるため、要求モデル側（criteria.modelSource）に
    // 応じて照合する id_section を選ぶ:
    //   - A側: userData.sectionId（matched メッシュも A側 id_section を持つ）
    //   - B側: matched は elementIdB から docB を引いた id_section、
    //          B片側メッシュは userData.sectionId（B側 id_section）
    if (criteria.sectionIds) {
      if (!this._matchesSectionIdCriteria(element, criteria)) return false;
    }
    return true;
  }

  /**
   * sectionIds 条件に対し、要求モデル側の id_section で要素を照合する。
   * @param {THREE.Object3D} element
   * @param {{sectionIds: string[], modelSource?: 'A'|'B'}} criteria
   * @returns {boolean}
   */
  _matchesSectionIdCriteria(element, criteria) {
    const source = element?.userData?.modelSource;
    const wanted = criteria.modelSource;

    // 要求モデル側と描画メッシュの整合。matched は A/B どちらの要求にも該当しうる。
    if (wanted === 'A' && source !== 'A' && source !== 'matched') return false;
    if (wanted === 'B' && source !== 'B' && source !== 'matched') return false;

    const wantedIds = criteria.sectionIds;
    if (wanted === 'B') {
      const idB = this._getBSideSectionId(element);
      return idB != null && wantedIds.includes(String(idB));
    }
    if (wanted === 'A') {
      const idA = element?.userData?.sectionId;
      return idA != null && wantedIds.includes(String(idA));
    }
    // モデル側指定なし（対応セル等）: A側 / B側 id_section のどちらかが含まれれば表示
    const idA = element?.userData?.sectionId;
    if (idA != null && wantedIds.includes(String(idA))) return true;
    const idB = this._getBSideSectionId(element);
    return idB != null && wantedIds.includes(String(idB));
  }

  /**
   * 要素の B側 id_section を解決する。
   * B片側メッシュは userData.sectionId がそのまま B側 id_section。
   * matched メッシュは B側 id_section を持たないため、elementIdB から
   * documentB の配置要素を引いて取得し、userData にメモ化する。
   * @param {THREE.Object3D} element
   * @returns {string|null}
   */
  _getBSideSectionId(element) {
    const userData = element?.userData;
    if (!userData) return null;
    if (userData.modelSource === 'B') return userData.sectionId ?? null;
    if (userData.modelSource !== 'matched') return null;

    if (userData._sectionIdB !== undefined) return userData._sectionIdB;

    const { idB } = getElementIds(userData);
    const docB = getState('models.documentB');
    let resolved = null;
    if (idB != null && docB && userData.elementType) {
      const node = docB.querySelector(`Stb${userData.elementType}[id="${idB}"]`);
      const idSection = node?.getAttribute?.('id_section');
      if (idSection != null) resolved = String(idSection);
    }
    userData._sectionIdB = resolved; // メモ化（次回以降の docB 参照を回避）
    return resolved;
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

    const positionState = element.userData.positionState; // 'exact' | 'withinTolerance' | 'mismatch'
    const attributeState = element.userData.attributeState; // 'matched' | 'mismatch'

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

    // 新しい6カテゴリ形式: positionState と attributeState を組み合わせて判定
    if (positionState && attributeState) {
      return this.determineStatusFromStates(positionState, attributeState);
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
   * 指定した断面定義id集合を参照する配置要素が3Dシーンに存在するか判定する。
   * トグル状態や現在のフィルタに依存せず、userData.sectionId を直接走査する
   * （断面タブ数値セルの「未使用断面定義→生XMLフォールバック」判定に使う）。
   * @param {string[]} sectionIds - 断面定義の rawElement@id 集合
   * @param {string|null} [modelSource] - 'A' | 'B' に限定する場合に指定
   * @returns {boolean} 参照する配置要素が1つでも存在すれば true
   */
  hasElementsReferencingSectionIds(sectionIds, modelSource = null) {
    const groups = sceneController.getElementGroups();
    if (!groups) return false;
    const ids = (sectionIds || []).map(String);
    if (ids.length === 0) return false;
    // doesElementMatchActiveCriteria と同じ side 別照合で「参照する配置要素の有無」を判定する。
    // （フィルタで表示される要素とフォールバック判定の母集団を一致させるため）
    const criteria = { sectionIds: ids };
    if (modelSource) criteria.modelSource = modelSource;
    return Object.values(groups).some((group) => {
      if (!group || !group.children) return false;
      return group.children.some((element) => this._matchesSectionIdCriteria(element, criteria));
    });
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

function normalizeCriteria(criteria) {
  if (!criteria || typeof criteria !== 'object') return null;
  const normalized = {};
  for (const key of ['positionStates', 'instanceStates', 'sectionStates', 'sectionIds']) {
    if (Array.isArray(criteria[key]) && criteria[key].length > 0) {
      normalized[key] = [...criteria[key]];
    }
  }
  // modelSource は sectionIds 絞り込みの補助（'A' | 'B'）
  if (criteria.modelSource === 'A' || criteria.modelSource === 'B') {
    normalized.modelSource = criteria.modelSource;
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function getElementDiffAxes(element, diffStatus) {
  const userData = element?.userData || {};
  const positionState =
    userData.positionState ||
    (diffStatus === DIFF_STATUS.POSITION_TOLERANCE || diffStatus === DIFF_STATUS.COMBINED
      ? 'withinTolerance'
      : 'exact');
  const kind = getAttributeMismatchKind(userData, diffStatus);

  return {
    positionState,
    instanceState: kind === 'instance' || kind === 'both' ? 'mismatch' : 'match',
    sectionState: kind === 'type' || kind === 'both' ? 'mismatch' : 'match',
  };
}

function getAttributeMismatchKind(userData, diffStatus) {
  if (userData.attributeMismatchKind) return userData.attributeMismatchKind;
  switch (diffStatus) {
    case DIFF_STATUS.ATTRIBUTE_MISMATCH_INSTANCE:
      return 'instance';
    case DIFF_STATUS.ATTRIBUTE_MISMATCH_TYPE:
      return 'type';
    case DIFF_STATUS.ATTRIBUTE_MISMATCH_BOTH:
      return 'both';
    default:
      return null;
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

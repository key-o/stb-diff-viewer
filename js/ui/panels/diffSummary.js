/**
 * @fileoverview 差分サマリー表示機能
 *
 * このファイルは、モデル比較後の差分結果をUI上にサマリー表示する機能を提供します:
 * - 要素タイプ別の差分統計表示
 * - 一致・差分・追加・削除要素の数値表示
 * - 視覚的な差分概要の提供
 */

import { eventBus, ComparisonEvents, DiffStatusEvents } from '../../data/events/index.js';
import { floatingWindowManager } from './floatingWindowManager.js';
import { ELEMENT_LABELS } from '../../config/elementLabels.js';
import { getCategoryCounts, getDiffStatusCounts } from '../../data/normalizeComparisonResult.js';
import { COMPARISON_CATEGORY } from '../../constants/comparisonCategories.js';
import { DIFF_STATUS, DIFF_STATUS_VALUES } from '../../config/diffFilterConfig.js';
import { globalDiffStatusFilter } from './diffStatusFilter.js';
import { showRawXmlForAllDefinitionDiffs, showRawXmlForDefinitionIds } from './rawXmlDiffViewer.js';
import {
  STB_DEFINITION_ELEMENT_TYPE,
  classifyDefinitionGroup,
} from '../../common-stb/comparison/stbDefinitionComparator.js';
import { showSectionCorrespondenceTable } from './sectionCorrespondenceTable.js';
import {
  getCurrentVersionInfo,
  shouldShowVersionSpecificDifferences,
  setShowVersionSpecificDifferences,
} from './versionPanel.js';
import { isCrossSoftwareModeEnabled } from '../../config/crossSoftwareConfig.js';
import { checkBuildingPrecondition } from '../../common-stb/comparison/buildingPreconditionChecker.js';
import {
  findOneSidedCategories,
  computeScopeAdjustedRate,
} from '../../common-stb/comparison/scopeReconciliation.js';
import { getState } from '../../data/state/globalState.js';
import { showWarning } from '../common/toast.js';
import { storageHelper } from '../../utils/storageHelper.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('ui:panels:diffSummary');

// 差分一覧ボタンのハンドラ参照（重複登録防止用）
let diffListBtnHandler = null;

// サマリー内クリック→フィルタ適用の委譲ハンドラを登録済みか
let summaryFilterClickBound = false;

// 直近の統計データ（列グループの折りたたみ切替時に再描画するため保持）
let lastStats = null;

/** 差分サマリーを表示するフローティングウィンドウのID */
const DIFF_SUMMARY_WINDOW_ID = 'diff-summary-float';

// ---------------------------------------------------------------------------
// 要素タイプ別テーブルの分類軸の折りたたみ状態
// 配置要素テーブルは「対応要素数」を親とし、その下に位置 / 属性 / 断面 の
// 3つの分類軸（それぞれ一致/不一致に分解）をぶら下げた3段ヘッダで表示する。
// 各軸は個別に展開/折りたたみでき、折りたたむと代表列（summaryKey）だけを表示する。
// ---------------------------------------------------------------------------

const GROUP_COLLAPSE_STORAGE_KEY = 'diffSummary:groupCollapse';

/**
 * 既定は全軸を展開する。
 * 折りたたむと配置要素の断面不一致（水色）・属性不一致（オレンジ）の列が隠れ、
 * 3Dジオメトリの色との対応が取れなくなるため。
 * キーは各分類軸の key（position / instance / section）。
 */
const DEFAULT_GROUP_COLLAPSE = { position: false, instance: false, section: false };

function loadGroupCollapse() {
  const saved = storageHelper.get(GROUP_COLLAPSE_STORAGE_KEY);
  return { ...DEFAULT_GROUP_COLLAPSE, ...(saved && typeof saved === 'object' ? saved : {}) };
}

let groupCollapse = loadGroupCollapse();

function getGroupCollapse() {
  return groupCollapse;
}

function toggleGroupCollapse(key) {
  groupCollapse = { ...groupCollapse, [key]: !groupCollapse[key] };
  storageHelper.set(GROUP_COLLAPSE_STORAGE_KEY, groupCollapse);
}

// ---------------------------------------------------------------------------
// サマリー表示（4カテゴリ）→ 差分フィルタステータス（9カテゴリ）の対応表
// グラフ・表のクリック絞り込みに使用する
// ---------------------------------------------------------------------------

/** 属性不一致としてまとめて扱うステータス群 */
const ATTRIBUTE_MISMATCH_STATUSES = [
  DIFF_STATUS.ATTRIBUTE_MISMATCH,
  DIFF_STATUS.ATTRIBUTE_MISMATCH_INSTANCE,
  DIFF_STATUS.ATTRIBUTE_MISMATCH_TYPE,
  DIFF_STATUS.ATTRIBUTE_MISMATCH_BOTH,
  DIFF_STATUS.COMBINED,
];

/** サマリーの4カテゴリ列に対応するステータス群 */
const SUMMARY_CATEGORY_STATUSES = {
  corresponding: [
    DIFF_STATUS.MATCHED,
    DIFF_STATUS.POSITION_TOLERANCE,
    ...ATTRIBUTE_MISMATCH_STATUSES,
  ],
  matched: [DIFF_STATUS.MATCHED, DIFF_STATUS.POSITION_TOLERANCE],
  onlyA: [DIFF_STATUS.ONLY_A],
  onlyB: [DIFF_STATUS.ONLY_B],
  attributeMismatch: ATTRIBUTE_MISMATCH_STATUSES,
};

const PAIRED_STATUSES = [
  DIFF_STATUS.MATCHED,
  DIFF_STATUS.POSITION_TOLERANCE,
  ...ATTRIBUTE_MISMATCH_STATUSES,
];

const POSITION_EXACT_STATUSES = [
  DIFF_STATUS.MATCHED,
  DIFF_STATUS.ATTRIBUTE_MISMATCH,
  DIFF_STATUS.ATTRIBUTE_MISMATCH_INSTANCE,
  DIFF_STATUS.ATTRIBUTE_MISMATCH_TYPE,
  DIFF_STATUS.ATTRIBUTE_MISMATCH_BOTH,
];

const POSITION_TOLERANCE_STATUSES = [
  DIFF_STATUS.POSITION_TOLERANCE,
  DIFF_STATUS.COMBINED,
  DIFF_STATUS.ATTRIBUTE_MISMATCH,
  DIFF_STATUS.ATTRIBUTE_MISMATCH_INSTANCE,
  DIFF_STATUS.ATTRIBUTE_MISMATCH_TYPE,
  DIFF_STATUS.ATTRIBUTE_MISMATCH_BOTH,
];

const DIFF_STATUS_VALUE_CLASSES = {
  [DIFF_STATUS.MATCHED]: 'diff-stat-matched',
  [DIFF_STATUS.ONLY_A]: 'diff-stat-only-a',
  [DIFF_STATUS.ONLY_B]: 'diff-stat-only-b',
  [DIFF_STATUS.POSITION_TOLERANCE]: 'diff-stat-position-tolerance',
  [DIFF_STATUS.ATTRIBUTE_MISMATCH]: 'diff-stat-attribute-mismatch',
  [DIFF_STATUS.ATTRIBUTE_MISMATCH_INSTANCE]: 'diff-stat-attribute-mismatch-instance',
  [DIFF_STATUS.ATTRIBUTE_MISMATCH_TYPE]: 'diff-stat-attribute-mismatch-type',
  [DIFF_STATUS.ATTRIBUTE_MISMATCH_BOTH]: 'diff-stat-attribute-mismatch-both',
  [DIFF_STATUS.COMBINED]: 'diff-stat-combined',
};

const DIFF_STATUS_COLOR_VARS = {
  [DIFF_STATUS.MATCHED]: 'var(--color-matched)',
  [DIFF_STATUS.ONLY_A]: 'var(--color-only-a)',
  [DIFF_STATUS.ONLY_B]: 'var(--color-only-b)',
  [DIFF_STATUS.POSITION_TOLERANCE]: 'var(--color-position-tolerance)',
  [DIFF_STATUS.ATTRIBUTE_MISMATCH]: 'var(--color-attribute-mismatch)',
  [DIFF_STATUS.ATTRIBUTE_MISMATCH_INSTANCE]: 'var(--color-attribute-mismatch-instance)',
  [DIFF_STATUS.ATTRIBUTE_MISMATCH_TYPE]: 'var(--color-attribute-mismatch-type)',
  [DIFF_STATUS.ATTRIBUTE_MISMATCH_BOTH]: 'var(--color-attribute-mismatch-both)',
  [DIFF_STATUS.COMBINED]: 'var(--color-combined)',
};

// ---------------------------------------------------------------------------
// 要素タイプ別テーブルの列定義（グループ単位）
// 各列は per(typeStats) / tot(stats) で値を取り出し、cls/statuses/criteria で
// 色付けとクリック絞り込みを規定する。折りたたみ時は summaryKey の列のみ表示する。
// section グループ（断面定義）は非描画のSTB定義があるときだけ表示する。
// ---------------------------------------------------------------------------

// 「全体」= 軸を持たない先頭の固定列（A計 / B計 / 対応）。
// 「対応」は3つの分類軸すべての親（=分母）となる列。
const FLAT_LEADING_COLUMNS = [
  {
    key: 'modelA',
    label: 'A計',
    title: 'モデルA側の要素数',
    per: (s) => s.totalModelA,
    tot: (s) => s.totalModelA,
    cls: 'diff-cell-total',
    statuses: DIFF_STATUS_VALUES,
  },
  {
    key: 'modelB',
    label: 'B計',
    title: 'モデルB側の要素数',
    per: (s) => s.totalModelB,
    tot: (s) => s.totalModelB,
    cls: 'diff-cell-total',
    statuses: DIFF_STATUS_VALUES,
  },
  {
    key: 'corresponding',
    label: '対応',
    title: 'モデルA/Bで対応した要素数（位置・属性・断面の各分類軸の親）',
    per: (s) => s.corresponding,
    tot: (s) => s.totalCorresponding,
    cls: 'diff-stat-matched',
    statuses: SUMMARY_CATEGORY_STATUSES.corresponding,
  },
];

// 配置要素テーブルの分類軸。いずれも「対応要素数」を分母に、一致/不一致へ分解する。
// 各軸は個別に折りたたみでき、折りたたむと summaryKey の代表列だけを表示する。
// 断面軸は「配置属性の特例で大分類を占める」ため marker を付けて視覚的に強調する。
const PLACEMENT_AXES = [
  {
    key: 'position',
    label: '位置',
    summaryKey: 'positionExact',
    columns: [
      {
        key: 'positionExact',
        label: '一致',
        title: '位置が完全一致した対応要素数',
        per: (s) => s.matchDimensions?.positionExact,
        tot: (s) => s.matchDimensions.positionExact,
        cls: 'diff-stat-matched',
        statuses: POSITION_EXACT_STATUSES,
        criteria: { positionStates: ['exact'] },
      },
      {
        key: 'positionTolerance',
        label: '許容差',
        title: '位置が許容差内だった対応要素数',
        per: (s) => s.matchDimensions?.positionTolerance,
        tot: (s) => s.matchDimensions.positionTolerance,
        cls: DIFF_STATUS_VALUE_CLASSES[DIFF_STATUS.POSITION_TOLERANCE],
        statuses: POSITION_TOLERANCE_STATUSES,
        criteria: { positionStates: ['withinTolerance'] },
      },
    ],
  },
  {
    key: 'instance',
    label: '属性',
    summaryKey: 'instanceMatch',
    columns: [
      {
        key: 'instanceMatch',
        label: '一致',
        title: '対応要素のうちインスタンス属性が一致した数',
        per: (s) => s.matchDimensions?.instanceMatch,
        tot: (s) => s.matchDimensions.instanceMatch,
        cls: 'diff-stat-matched',
        statuses: PAIRED_STATUSES,
        criteria: { instanceStates: ['match'] },
      },
      {
        key: 'instanceMismatch',
        label: '不一致',
        title: '対応要素のうちインスタンス属性が不一致の数',
        per: (s) => s.matchDimensions?.instanceMismatch,
        tot: (s) => s.matchDimensions.instanceMismatch,
        cls: DIFF_STATUS_VALUE_CLASSES[DIFF_STATUS.ATTRIBUTE_MISMATCH_INSTANCE],
        statuses: [DIFF_STATUS.ATTRIBUTE_MISMATCH_INSTANCE, DIFF_STATUS.ATTRIBUTE_MISMATCH_BOTH],
        criteria: { instanceStates: ['mismatch'] },
      },
    ],
  },
  {
    key: 'section',
    label: '断面',
    marker: '●',
    summaryKey: 'sectionMatch',
    columns: [
      {
        key: 'sectionMatch',
        label: '一致',
        title: '配置要素の対応ペアで、参照断面・タイプ情報が一致した数',
        per: (s) => s.matchDimensions?.sectionMatch,
        tot: (s) => s.matchDimensions.sectionMatch,
        cls: 'diff-stat-matched',
        statuses: PAIRED_STATUSES,
        criteria: { sectionStates: ['match'] },
      },
      {
        key: 'sectionMismatch',
        label: '不一致',
        title: '配置要素の対応ペアで、参照断面・タイプ情報が不一致の数',
        per: (s) => s.matchDimensions?.sectionMismatch,
        tot: (s) => s.matchDimensions.sectionMismatch,
        cls: DIFF_STATUS_VALUE_CLASSES[DIFF_STATUS.ATTRIBUTE_MISMATCH_TYPE],
        statuses: [DIFF_STATUS.ATTRIBUTE_MISMATCH_TYPE, DIFF_STATUS.ATTRIBUTE_MISMATCH_BOTH],
        criteria: { sectionStates: ['mismatch'] },
      },
    ],
  },
];

/** 常に表示する「A/Bのみ」列（折りたたみ対象外） */
const AB_ONLY_COLUMNS = [
  {
    key: 'onlyA',
    label: 'Aのみ',
    title: 'モデルAにのみある要素数',
    per: (s) => s.onlyA,
    tot: (s) => s.totalOnlyA,
    cls: 'diff-stat-only-a',
    statuses: SUMMARY_CATEGORY_STATUSES.onlyA,
  },
  {
    key: 'onlyB',
    label: 'Bのみ',
    title: 'モデルBにのみある要素数',
    per: (s) => s.onlyB,
    tot: (s) => s.totalOnlyB,
    cls: 'diff-stat-only-b',
    statuses: SUMMARY_CATEGORY_STATUSES.onlyB,
  },
];

const TYPE_TABLE_WIDTH_TERMS = {
  name: 'var(--diff-type-name-width)',
  metric: 'var(--diff-type-metric-width)',
};

/**
 * 軸内で実際に表示する列を返す（折りたたみ時は代表列のみ）
 * @param {Object} axis - 分類軸（PLACEMENT_AXES の要素）
 * @param {Object} collapse - 折りたたみ状態
 * @returns {Array<Object>} 表示する列
 */
function getAxisColumns(axis, collapse) {
  if (collapse[axis.key]) {
    return [axis.columns.find((c) => c.key === axis.summaryKey)];
  }
  return axis.columns;
}

/**
 * クリックでフィルタ適用可能にする data 属性を生成する
 * @param {Array<string>} statuses - 適用する差分ステータス群
 * @param {string} [elementType] - 要素タイプ絞り込み（省略時は全タイプ）
 * @returns {string} HTML属性文字列
 */
function filterClickAttrs(statuses, elementType, criteria = null) {
  let attrs = ` data-filter-statuses="${statuses.join(' ')}"`;
  if (elementType) {
    attrs += ` data-filter-type="${elementType}"`;
  }
  if (criteria?.positionStates) {
    attrs += ` data-filter-position-states="${criteria.positionStates.join(' ')}"`;
  }
  if (criteria?.instanceStates) {
    attrs += ` data-filter-instance-states="${criteria.instanceStates.join(' ')}"`;
  }
  if (criteria?.sectionStates) {
    attrs += ` data-filter-section-states="${criteria.sectionStates.join(' ')}"`;
  }
  return attrs;
}

/**
 * サマリー内のクリック→フィルタ適用の委譲ハンドラを登録する（初回のみ）
 * コンテンツは innerHTML で再生成されるため、コンテナに一度だけ委譲登録する
 * @param {HTMLElement} contentElement - #diff-summary-content
 */
function bindSummaryFilterClicks(contentElement) {
  if (summaryFilterClickBound) return;
  summaryFilterClickBound = true;

  contentElement.addEventListener('click', (e) => {
    // 列グループの折りたたみトグルを最優先で処理する
    const toggle = e.target.closest('[data-group-toggle]');
    if (toggle && contentElement.contains(toggle)) {
      toggleGroupCollapse(toggle.dataset.groupToggle);
      if (lastStats) {
        renderSummaryContent(contentElement, lastStats);
      }
      return;
    }

    // 定義タブ（断面/接合/開口/STB定義）の切り替え
    const defTab = e.target.closest('[data-def-tab]');
    if (defTab && contentElement.contains(defTab)) {
      activeDefTab = defTab.dataset.defTab;
      if (lastStats) {
        renderSummaryContent(contentElement, lastStats);
      }
      log.info('[Event] サマリークリック: 定義タブ切替', { tab: activeDefTab });
      return;
    }

    // 断面タブの数値セル: 該当断面（断面定義id集合）を参照する配置要素のみを3D表示に絞り込む
    const sectionDefCell = e.target.closest('[data-section-def-ids]');
    if (sectionDefCell && contentElement.contains(sectionDefCell)) {
      const ids = sectionDefCell.dataset.sectionDefIds.split(' ').filter(Boolean);
      const statuses = sectionDefCell.dataset.sectionDefStatuses.split(' ').filter(Boolean);
      const elemTypes = (sectionDefCell.dataset.sectionDefElemTypes || '')
        .split(' ')
        .filter(Boolean);
      const modelSource = sectionDefCell.dataset.sectionDefModelSource || null;
      const category = sectionDefCell.dataset.sectionDefCategory || '';
      const criteria = { sectionIds: ids };
      if (modelSource) criteria.modelSource = modelSource;
      // 参照する配置要素が実在しない未使用断面定義は3Dに何も出ないため、生XML表示へフォールバックする。
      // フィルタ適用前・トグル状態非依存で判定する（applySummaryFilter のトグルで判定が壊れないように）。
      if (!globalDiffStatusFilter.hasElementsReferencingSectionIds(ids, modelSource)) {
        showRawXmlForDefinitionIds(ids, { label: category });
        log.info('[Event] サマリークリック: 未使用断面定義→生XMLフォールバック', {
          idCount: ids.length,
          category,
        });
        return;
      }
      applySummaryFilter(
        statuses,
        elemTypes.length === 0 ? null : elemTypes.length === 1 ? elemTypes[0] : elemTypes,
        criteria,
      );
      log.info('[Event] サマリークリック: 断面定義→配置要素フィルタ', {
        idCount: ids.length,
        statuses,
        elemTypes,
        modelSource,
      });
      return;
    }

    // 断面カテゴリ行: 紐づく配置要素（複数タイプ可）のみを3D表示に絞り込む
    const sectionFilter = e.target.closest('[data-section-element-types]');
    if (sectionFilter && contentElement.contains(sectionFilter)) {
      const types = sectionFilter.dataset.sectionElementTypes.split(' ').filter(Boolean);
      applySummaryFilter(DIFF_STATUS_VALUES, types.length === 1 ? types[0] : types, null);
      log.info('[Event] サマリークリック: 断面カテゴリ→配置要素フィルタ', { types });
      return;
    }

    // 接合/開口/STB定義のカテゴリ行/数値セル: 該当グループの差分を生XML表示する。
    // 数値セルは data-raw-xml-categories で表示カテゴリ（情報不一致/A/Bのみ等）を限定する。
    const rawXmlGroup = e.target.closest('[data-raw-xml-group]');
    if (rawXmlGroup && contentElement.contains(rawXmlGroup)) {
      const categories = (rawXmlGroup.dataset.rawXmlCategories || '').split(' ').filter(Boolean);
      showRawXmlForAllDefinitionDiffs(STB_DEFINITION_ELEMENT_TYPE, {
        group: rawXmlGroup.dataset.rawXmlGroup,
        categories: categories.length > 0 ? categories : null,
      });
      log.info('[Event] サマリークリック: 定義グループの生XML表示', {
        group: rawXmlGroup.dataset.rawXmlGroup,
        categories,
      });
      return;
    }

    // 非ジオメトリ（非描画）タイプは3D絞り込みできないため、生XMLで確認できるようにする
    const rawXmlTarget = e.target.closest('[data-raw-xml-type]');
    if (rawXmlTarget && contentElement.contains(rawXmlTarget)) {
      showRawXmlForAllDefinitionDiffs(rawXmlTarget.dataset.rawXmlType);
      log.info('[Event] サマリークリック: 非ジオメトリ要素の生XML表示');
      return;
    }

    const target = e.target.closest('[data-filter-statuses]');
    if (!target || !contentElement.contains(target)) return;

    const statuses = target.dataset.filterStatuses.split(' ').filter(Boolean);
    const elementType = target.dataset.filterType || null;
    const criteria = parseFilterCriteria(target.dataset);
    applySummaryFilter(statuses, elementType, criteria);
  });
}

function parseFilterCriteria(dataset) {
  const criteria = {};
  if (dataset.filterPositionStates) {
    criteria.positionStates = dataset.filterPositionStates.split(' ').filter(Boolean);
  }
  if (dataset.filterInstanceStates) {
    criteria.instanceStates = dataset.filterInstanceStates.split(' ').filter(Boolean);
  }
  if (dataset.filterSectionStates) {
    criteria.sectionStates = dataset.filterSectionStates.split(' ').filter(Boolean);
  }
  return Object.keys(criteria).length > 0 ? criteria : null;
}

/**
 * クリックされた項目に応じて差分フィルタを適用する。
 * 現在の絞り込みと同一の場合は解除（全表示）としてトグル動作する。
 * @param {Array<string>} statuses - 差分ステータス群
 * @param {string|null} elementType - 要素タイプ（null = 全タイプ）
 */
function applySummaryFilter(statuses, elementType, criteria = null) {
  const filter = globalDiffStatusFilter;
  const isSameSelection =
    isSameElementType(filter.activeElementType, elementType) &&
    filter.activeFilters.size === statuses.length &&
    statuses.every((status) => filter.activeFilters.has(status)) &&
    isSameCriteria(filter.activeCriteria, criteria);

  if (isSameSelection) {
    filter.applyStatusAndTypeFilter(DIFF_STATUS_VALUES, null, null);
    log.info('[Event] サマリークリック: 絞り込み解除');
  } else {
    filter.applyStatusAndTypeFilter(statuses, elementType, criteria);
    log.info('[Event] サマリークリック: フィルタ適用', { statuses, elementType, criteria });
  }
}

/** activeElementType（文字列 / 配列 / null）の同値判定 */
function isSameElementType(a, b) {
  const norm = (v) => (Array.isArray(v) ? [...v].sort() : v == null ? [] : [v]);
  const na = norm(a);
  const nb = norm(b);
  return na.length === nb.length && na.every((t, i) => t === nb[i]);
}

function isSameCriteria(a, b) {
  const normalize = (criteria) =>
    JSON.stringify({
      positionStates: [...(criteria?.positionStates || [])].sort(),
      instanceStates: [...(criteria?.instanceStates || [])].sort(),
      sectionStates: [...(criteria?.sectionStates || [])].sort(),
      sectionIds: [...(criteria?.sectionIds || [])].map(String).sort(),
      modelSource: criteria?.modelSource || null,
    });
  return normalize(a) === normalize(b);
}

/**
 * 差分結果のサマリーを表示する
 * @param {Object} comparisonResults - 比較結果オブジェクト
 * @param {string} [reason] - 統計更新の要因（'modelComparison' 等）
 * @param {boolean} [hasBothModels] - モデルA/Bが両方揃っているか（単一モデルでは自動表示しない）
 */
function updateDiffSummary(comparisonResults, reason, hasBothModels) {
  const contentElement = document.getElementById('diff-summary-content');

  if (!contentElement || !comparisonResults) {
    return;
  }

  // 統計データを集計（列グループ折りたたみの再描画で使い回すため保持）
  const stats = calculateDiffStatistics(comparisonResults);
  // 異ソフト間比較モード時の付加情報（C2プリコンディション・A5スコープ調停）。モードOFF時は null。
  stats.crossSoftware = buildCrossSoftwareInfo(comparisonResults, stats);
  lastStats = stats;

  // グラフ・表クリック→フィルタ適用／列折りたたみの委譲ハンドラを登録（初回のみ）
  bindSummaryFilterClicks(contentElement);

  // 表示を更新（HTML生成 + ボタン類のイベント配線）
  renderSummaryContent(contentElement, stats);

  // C2: 新規比較の完了時、別建物の可能性があればトーストでも警告する
  // （サマリー内の警告ブロックに加えて、見落とし防止の即時通知）
  const precondition = stats.crossSoftware?.precondition;
  if (
    reason === 'modelComparison' &&
    precondition &&
    precondition.judgeable &&
    !precondition.similar
  ) {
    showWarning(buildPreconditionWarningMessage(precondition), { duration: 10000 });
    log.warn('[Data] 異ソフト間比較: 別建物の可能性を検出しました', precondition);
  }

  // 結果が無ければウィンドウを閉じる。
  // 新規比較実行時は、両モデルが揃っている場合のみ結果ウィンドウを自動表示する。
  // 単一モデル時は全要素が「モデルAのみ」となり比較情報を持たないため、
  // 自動表示せず（既に開いていれば閉じて）3Dの要素タイプ別カラーと矛盾しないようにする。
  // 編集中の再比較（editRecomparison）では開いている場合のみ中身を更新し、勝手に開閉しない。
  if (stats.totalElements === 0) {
    floatingWindowManager.hideWindow(DIFF_SUMMARY_WINDOW_ID);
  } else if (reason === 'modelComparison') {
    if (hasBothModels) {
      floatingWindowManager.showWindow(DIFF_SUMMARY_WINDOW_ID);
    } else {
      floatingWindowManager.hideWindow(DIFF_SUMMARY_WINDOW_ID);
    }
  }
}

/**
 * サマリー本体のHTMLを生成し、ボタン類のイベントを配線する。
 * 列グループの折りたたみ切替時にも再利用する（委譲ハンドラは別途一度だけ登録済み）。
 * @param {HTMLElement} contentElement - #diff-summary-content
 * @param {Object} stats - 統計データ
 */
function renderSummaryContent(contentElement, stats) {
  contentElement.innerHTML = generateSummaryHTML(stats, getGroupCollapse());
  eventBus.emit(DiffStatusEvents.FILTER_CHANGED, { action: 'summaryRendered' });

  // 差分一覧ボタンのイベントリスナーを設定（innerHTMLで要素が再作成されるため都度付け直す）
  const diffListBtn = document.getElementById('open-diff-list-from-summary');
  if (diffListBtn) {
    if (!diffListBtnHandler) {
      diffListBtnHandler = () => {
        if (typeof window.toggleDiffList === 'function') {
          window.toggleDiffList();
        }
      };
    }
    diffListBtn.addEventListener('click', diffListBtnHandler);
  }

  // バージョンフィルタチェックボックスのイベントリスナーを設定
  const versionFilterCheckbox = document.getElementById('version-diff-filter');
  if (versionFilterCheckbox) {
    versionFilterCheckbox.addEventListener('change', (e) => {
      setShowVersionSpecificDifferences(e.target.checked);
      log.info('[DiffSummary] バージョン差分フィルタ変更:', e.target.checked);
    });
  }

  // 断面対応表ボタン（異ソフト間比較モード時のみ描画される）
  const sectionCorrespondenceBtn = document.getElementById('open-section-correspondence-btn');
  if (sectionCorrespondenceBtn) {
    sectionCorrespondenceBtn.addEventListener('click', () => {
      showSectionCorrespondenceTable();
    });
  }
}

// ---------------------------------------------------------------------------
// 異ソフト間比較モードの付加情報（C2 プリコンディション / A5 スコープ調停）
// ---------------------------------------------------------------------------

/**
 * 異ソフト間比較モード時の付加情報を構築する。
 * モードOFF、またはモデルA/Bが揃っていない場合は null（既存表示は不変）。
 *
 * @param {Object} comparisonResults - 比較結果
 * @param {Object} stats - calculateDiffStatistics の集計値
 * @returns {{
 *   precondition: Object|null,
 *   oneSidedCategories: Array<Object>,
 *   oneSidedTypes: Set<string>,
 *   scopeAdjusted: Object|null,
 * }|null}
 */
function buildCrossSoftwareInfo(comparisonResults, stats) {
  if (!isCrossSoftwareModeEnabled()) return null;
  const documentA = getState('models.documentA');
  const documentB = getState('models.documentB');
  if (!documentA || !documentB) return null;

  const precondition = checkBuildingPrecondition(documentA, documentB);
  const oneSidedCategories = findOneSidedCategories(comparisonResults);
  return {
    precondition,
    oneSidedCategories,
    oneSidedTypes: new Set(oneSidedCategories.map((note) => note.elementType)),
    scopeAdjusted: computeScopeAdjustedRate(stats, oneSidedCategories),
  };
}

/**
 * C2 プリコンディション警告のメッセージを生成する。
 * @param {Object} precondition - checkBuildingPrecondition の結果
 * @returns {string} 警告メッセージ
 */
function buildPreconditionWarningMessage(precondition) {
  const { story, axis } = precondition.details;
  const parts = [];
  if (story) {
    parts.push(`階標高一致 ${story.matchedCount}/${Math.max(story.countA, story.countB)}`);
  }
  if (axis) {
    parts.push(`通り芯一致 ${axis.matchedCount}/${Math.max(axis.countA, axis.countB)}`);
  }
  const scorePct = `${(precondition.score * 100).toFixed(1)}%`;
  return (
    `別建物の可能性: 階・通り芯の構成が大きく異なります（類似度 ${scorePct}、${parts.join('・')}）。` +
    '異ソフト間比較モードは同一建物の比較を想定しています。'
  );
}

/**
 * 異ソフト間比較モードの注記ブロック（C2 警告 / A5 カテゴリ注記）を生成する。
 * @param {Object} stats - 統計データ（crossSoftware を含みうる）
 * @returns {string} HTML文字列（モードOFF時は空文字）
 */
function generateCrossSoftwareNotices(stats) {
  const info = stats.crossSoftware;
  if (!info) return '';

  let html = '';

  // C2: 同一建物プリコンディション警告
  const precondition = info.precondition;
  if (precondition && precondition.judgeable && !precondition.similar) {
    const { story, axis } = precondition.details;
    const detailParts = [];
    if (story) {
      detailParts.push(
        `階数 A:${story.countA} / B:${story.countB}（標高一致 ${story.matchedCount}件）`,
      );
    }
    if (axis) {
      detailParts.push(
        `通り芯 A:${axis.countA} / B:${axis.countB}（距離一致 ${axis.matchedCount}件）`,
      );
    }
    html += `
      <div class="diff-cross-precondition">
        <span class="diff-cross-precondition-icon">⚠️</span>
        <span class="diff-cross-precondition-text">
          <strong>別建物の可能性</strong>（類似度 ${(precondition.score * 100).toFixed(1)}%）:
          ${detailParts.join('・')}。
          異ソフト間比較モードは同一建物の比較を想定しています。
        </span>
      </div>
    `;
  }

  // A5: 片側欠落カテゴリの注記（onlyA/onlyB の羅列ではなくスコープ差として提示）
  if (info.oneSidedCategories.length > 0) {
    const items = info.oneSidedCategories
      .map((note) => {
        const label = getElementTypeDisplayName(note.elementType);
        const presentModel = note.presentIn === 'A' ? 'モデルA' : 'モデルB';
        const missingModel = note.presentIn === 'A' ? 'モデルB' : 'モデルA';
        return `<li>${label}: ${presentModel}のみ ${note.count}件（${missingModel}は本カテゴリを出力していません）</li>`;
      })
      .join('');
    const adjusted = info.scopeAdjusted;
    const adjustedLine = adjusted
      ? `<div class="diff-cross-scope-adjusted">スコープ調停後の対応率:
          <strong>${formatPct(stats.totalCorresponding, adjusted.adjustedTotal)}</strong>
          （片側のみのカテゴリ ${adjusted.excludedCount}件 を分母から除外、${stats.totalCorresponding} / ${adjusted.adjustedTotal}）</div>`
      : '';
    html += `
      <div class="diff-cross-scope-note">
        <div class="diff-cross-scope-title">📌 カテゴリ注記（片側のみ出力）</div>
        <ul class="diff-cross-scope-list">${items}</ul>
        ${adjustedLine}
        <div class="diff-cross-scope-hint">ソフトの出力範囲（スコープ）の違いによる差の可能性があります</div>
      </div>
    `;
  }

  return html;
}

/**
 * 比較結果から統計データを計算する
 * @param {Object} comparisonResults - 比較結果オブジェクト
 * @returns {Object} 統計データ
 */
export function calculateDiffStatistics(comparisonResults) {
  const stats = {
    totalElements: 0,
    totalRenderable: 0,
    totalNonRenderable: 0,
    totalModelA: 0,
    totalModelB: 0,
    totalCorresponding: 0,
    totalMatched: 0,
    totalExact: 0,
    totalWithinTolerance: 0,
    totalAttributeMismatch: 0,
    totalOnlyA: 0,
    totalOnlyB: 0,
    statusCounts: {},
    elementTypes: {},
    matchDimensions: createEmptyMatchDimensions(),
    sectionDefinitionDimensions: createEmptySectionDefinitionDimensions(),
  };

  // 要素タイプ別に統計を計算
  const entries =
    comparisonResults instanceof Map
      ? comparisonResults.entries()
      : Object.entries(comparisonResults);

  for (const [elementType, result] of entries) {
    if (!result || typeof result !== 'object') continue;

    const counts = getCategoryCounts(result);
    const matched = counts.exact + counts.withinTolerance;
    const attributeMismatch = counts.attributeMismatch;
    const corresponding = matched + attributeMismatch;
    const onlyA = counts.onlyA;
    const onlyB = counts.onlyB;
    const total = counts.total;
    const statusCounts = getDiffStatusCounts(result);

    if (total > 0) {
      const isRenderable = result.isRenderable !== false;
      const dimensions = isRenderable
        ? computeMatchDimensions(result)
        : createEmptyMatchDimensions();
      const sectionDefinitionDimensions = !isRenderable
        ? computeSectionDefinitionDimensions(result)
        : createEmptySectionDefinitionDimensions();
      stats.elementTypes[elementType] = {
        totalModelA: corresponding + onlyA,
        totalModelB: corresponding + onlyB,
        corresponding,
        matched,
        exact: counts.exact,
        withinTolerance: counts.withinTolerance,
        attributeMismatch,
        onlyA,
        onlyB,
        total,
        statusCounts,
        matchDimensions: dimensions,
        sectionDefinitionDimensions,
        // 3D描画されないタイプ（STB定義等）はクリック絞り込みの対象外にする
        isRenderable,
      };

      stats.totalElements += total;
      stats.totalModelA += corresponding + onlyA;
      stats.totalModelB += corresponding + onlyB;
      // 3D描画可否で総数を内訳（非描画=STB定義など）。色付けフィルタとの数の差の説明に使う。
      if (result.isRenderable === false) {
        stats.totalNonRenderable += total;
      } else {
        stats.totalRenderable += total;
      }
      stats.totalCorresponding += corresponding;
      stats.totalMatched += matched;
      stats.totalExact += counts.exact;
      stats.totalWithinTolerance += counts.withinTolerance;
      stats.totalAttributeMismatch += attributeMismatch;
      stats.totalOnlyA += onlyA;
      stats.totalOnlyB += onlyB;
      for (const [status, count] of Object.entries(statusCounts)) {
        stats.statusCounts[status] = (stats.statusCounts[status] || 0) + count;
      }
      accumulateMatchDimensions(stats.matchDimensions, dimensions);
      accumulateSectionDefinitionDimensions(
        stats.sectionDefinitionDimensions,
        sectionDefinitionDimensions,
      );
    }
  }

  return stats;
}

/** 断面・タイプ差とみなす attributeMismatchKind */
const SECTION_MISMATCH_KINDS = new Set(['type', 'both']);
/** インスタンス属性差とみなす attributeMismatchKind */
const INSTANCE_MISMATCH_KINDS = new Set(['instance', 'both']);

/**
 * 一致次元マトリクス用の空カウンタを生成する
 * @returns {Object}
 */
function createEmptyMatchDimensions() {
  return {
    pairsTotal: 0,
    positionExact: 0,
    positionTolerance: 0,
    fullMatch: 0,
    sectionMatch: 0,
    sectionMismatch: 0,
    sectionUnknown: 0,
    instanceMatch: 0,
    instanceMismatch: 0,
    instanceUnknown: 0,
  };
}

function createEmptySectionDefinitionDimensions() {
  return {
    sameNameMatch: 0,
    sameNameMismatch: 0,
    groups: createEmptyDefinitionGroups(),
  };
}

/**
 * 断面グループ内の定義要素を部材カテゴリ（柱・大梁・小梁・壁 …）に分類する。
 * 色付けモードの断面比較と同じく「同一とみなす断面設定」の粒度で集計する。
 *
 * 大梁/小梁は断面タグだけでは分けられない（StbSecBeam_* を共有する）ため、
 * 断面要素の kind_beam="GIRDER" 属性で判定する。属性が無いモデルでは「梁」に集約する。
 *
 * @param {string|undefined} tag - タグ名
 * @param {Element|null} [rawElement] - 元XML要素（kind_beam 参照用）
 * @returns {string} カテゴリラベル（判別不能時は 'その他'）
 */
function categorizeSectionDefinition(tag, rawElement = null) {
  if (!tag || typeof tag !== 'string') return 'その他';

  // StbSecXxx_YY / StbSecXxx から部材名 Xxx を取り出す
  const body = tag.replace(/^StbSec/, '').replace(/_(RC|S|SRC|CFT)$/, '');

  // 梁の大梁/小梁は kind_beam 属性で判定（無ければ「梁」に集約）
  if (tag.startsWith('StbSecGirder')) return '大梁';
  if (tag.startsWith('StbSecBeam')) {
    const kind = rawElement?.getAttribute?.('kind_beam');
    if (kind === 'GIRDER') return '大梁';
    if (kind === 'BEAM') return '小梁';
    return '梁';
  }

  for (const [keyword, label] of SECTION_DEFINITION_CATEGORY_RULES) {
    if (body.includes(keyword)) return label;
  }
  return 'その他';
}

/**
 * 部材名キーワード → カテゴリラベルの割り当て。
 * より限定的なキーワード（FoundationColumn 等）を先に判定する。
 * 梁（Girder/Beam）は categorizeSectionDefinition 側で kind_beam を見て判定するため含めない。
 *
 * StbSecOpen_RC（開口寸法定義）は StbSec 接頭辞のため section グループに入る。
 * StbOpen/StbOpenArrangement（開口配置）の「開口」タブとは別物なので
 * 「開口寸法」ラベルで区別する。
 */
const SECTION_DEFINITION_CATEGORY_RULES = [
  ['FoundationColumn', '基礎柱'],
  ['StripFooting', '布基礎'],
  ['Footing', '基礎'],
  ['Foundation', '基礎'],
  ['Pile', '杭'],
  ['Post', '間柱'],
  ['Column', '柱'],
  ['Brace', 'ブレース'],
  ['Slab', 'スラブ'],
  ['Parapet', 'パラペット'],
  ['Wall', '壁'],
  ['Open', '開口寸法'],
  ['Undefined', '未定義'],
];

/**
 * 両モデルに存在するペア（exact + withinTolerance + attributeMismatch）を
 * 位置・断面/タイプ・インスタンス属性の各次元で一致/相違に分類する。
 *
 * exact/withinTolerance は属性一致なので断面・インスタンスとも「一致」。
 * attributeMismatch は attributeMismatchKind（instance/type/both）で分類し、
 * 分類情報が無いもの（多くの節点等）は「未分類」に計上する。
 *
 * @param {Object} result - 正規化された比較結果
 * @returns {Object} 次元別カウンタ
 */
function computeMatchDimensions(result) {
  const dims = createEmptyMatchDimensions();

  const exactCount = result[COMPARISON_CATEGORY.EXACT]?.length || 0;
  dims.pairsTotal += exactCount;
  dims.positionExact += exactCount;
  dims.fullMatch += exactCount;
  dims.sectionMatch += exactCount;
  dims.instanceMatch += exactCount;

  const withinToleranceCount = result[COMPARISON_CATEGORY.WITHIN_TOLERANCE]?.length || 0;
  dims.pairsTotal += withinToleranceCount;
  dims.positionTolerance += withinToleranceCount;
  dims.sectionMatch += withinToleranceCount;
  dims.instanceMatch += withinToleranceCount;

  for (const item of result[COMPARISON_CATEGORY.ATTRIBUTE_MISMATCH] || []) {
    dims.pairsTotal++;
    if (item.positionState === 'withinTolerance') dims.positionTolerance++;
    else dims.positionExact++;

    const kind = item.attributeMismatchKind;
    if (kind == null) {
      dims.sectionUnknown++;
      dims.instanceUnknown++;
    } else {
      if (SECTION_MISMATCH_KINDS.has(kind)) dims.sectionMismatch++;
      else dims.sectionMatch++;
      if (INSTANCE_MISMATCH_KINDS.has(kind)) dims.instanceMismatch++;
      else dims.instanceMatch++;
    }
  }

  return dims;
}

/**
 * 次元カウンタを加算集計する
 * @param {Object} target - 集計先
 * @param {Object} source - 加算元
 */
function accumulateMatchDimensions(target, source) {
  for (const key of Object.keys(target)) {
    target[key] += source[key] || 0;
  }
}

/** STB定義の大分類グループ（タブ順） */
const DEFINITION_GROUPS = ['section', 'joint', 'open', 'other'];

/**
 * 断面定義カテゴリ別カウンタの空オブジェクトを生成する。
 * ids は各区分に属する断面定義の id（= 配置要素の id_section）を集め、
 * 数値セルクリック時に「該当断面を参照する配置要素」を3D絞り込みするために使う。
 */
function createEmptySectionCategoryCounts() {
  return {
    corresponding: 0,
    sameNameMatch: 0,
    sameNameMismatch: 0,
    onlyA: 0,
    onlyB: 0,
    ids: { sameNameMatch: [], sameNameMismatch: [], onlyA: [], onlyB: [] },
  };
}

/** グループ×カテゴリ集計の空オブジェクトを生成する */
function createEmptyDefinitionGroups() {
  const groups = {};
  for (const group of DEFINITION_GROUPS) {
    groups[group] = { byCategory: {} };
  }
  return groups;
}

/**
 * 定義要素を grouped byCategory に振り分けて指定フィールドを加算する。
 * @param {Object} groups - グループ×カテゴリ集計
 * @param {Array} items - 比較アイテム配列
 * @param {string} field - 加算するフィールド（sameNameMatch 等）
 * @param {(item: Object) => {tag: string, rawElement: Element|null, ids: string[]}} pick
 *   - タグ・要素・断面定義id（配置要素の id_section 突合用）の取り出し
 */
function tallyIntoGroups(groups, items, field, pick) {
  for (const item of items || []) {
    const { tag, rawElement, ids } = pick(item);
    const group = classifyDefinitionGroup(tag);
    const category =
      group === 'section'
        ? categorizeSectionDefinition(tag, rawElement)
        : DEFINITION_GROUP_SINGLE_CATEGORY[group];
    const byCategory = groups[group].byCategory;
    const bucket = (byCategory[category] ||= createEmptySectionCategoryCounts());
    bucket[field]++;
    if (field === 'sameNameMatch' || field === 'sameNameMismatch') bucket.corresponding++;
    // 断面グループのみ、配置要素との突合に使う断面定義idを区分別に蓄積する
    if (group === 'section' && Array.isArray(ids)) {
      for (const id of ids) {
        if (id != null && id !== '') bucket.ids[field].push(String(id));
      }
    }
  }
}

/** 断面定義比較アイテムの片側データから断面定義id（rawElement@id）を取り出す */
function pickDefinitionId(src) {
  const el = src?.rawElement;
  if (el && typeof el.getAttribute === 'function') {
    return el.getAttribute('id');
  }
  return src?.id ?? null;
}

/** 断面以外のグループは単一カテゴリ行にまとめる（内訳を持たない） */
const DEFINITION_GROUP_SINGLE_CATEGORY = {
  joint: '継手',
  open: '開口',
  other: 'STB定義',
};

function computeSectionDefinitionDimensions(result) {
  // 対応ペアは dataA/dataB を持ち、片側のみは要素そのもの（rawElement を持つ）。
  // 対応ペアは両モデルの断面定義idを集める（配置要素の id_section は A/B で異なりうるため）。
  const pairPick = (item) => {
    const src = item.dataA ?? item.dataB ?? item;
    const ids = [pickDefinitionId(item.dataA), pickDefinitionId(item.dataB)].filter(
      (id) => id != null && id !== '',
    );
    return { tag: src.tag, rawElement: src.rawElement ?? null, ids };
  };
  const soloPick = (item) => {
    const id = pickDefinitionId(item);
    return { tag: item.tag, rawElement: item.rawElement ?? null, ids: id != null ? [id] : [] };
  };

  const groups = createEmptyDefinitionGroups();
  tallyIntoGroups(groups, result[COMPARISON_CATEGORY.EXACT], 'sameNameMatch', pairPick);
  tallyIntoGroups(
    groups,
    result[COMPARISON_CATEGORY.ATTRIBUTE_MISMATCH],
    'sameNameMismatch',
    pairPick,
  );
  tallyIntoGroups(groups, result[COMPARISON_CATEGORY.ONLY_A], 'onlyA', soloPick);
  tallyIntoGroups(groups, result[COMPARISON_CATEGORY.ONLY_B], 'onlyB', soloPick);

  return {
    sameNameMatch: result[COMPARISON_CATEGORY.EXACT]?.length || 0,
    sameNameMismatch: result[COMPARISON_CATEGORY.ATTRIBUTE_MISMATCH]?.length || 0,
    groups,
  };
}

function accumulateSectionDefinitionDimensions(target, source) {
  target.sameNameMatch += source.sameNameMatch || 0;
  target.sameNameMismatch += source.sameNameMismatch || 0;
  for (const group of DEFINITION_GROUPS) {
    const targetByCat = target.groups[group].byCategory;
    for (const [category, counts] of Object.entries(source.groups?.[group]?.byCategory || {})) {
      const bucket = (targetByCat[category] ||= createEmptySectionCategoryCounts());
      for (const key of Object.keys(bucket)) {
        if (key === 'ids') continue; // ids はオブジェクト。下で配列連結する
        bucket[key] += counts[key] || 0;
      }
      // 断面定義idの区分別配列を連結する
      for (const field of Object.keys(bucket.ids)) {
        const srcIds = counts.ids?.[field];
        if (Array.isArray(srcIds) && srcIds.length > 0) {
          bucket.ids[field].push(...srcIds);
        }
      }
    }
  }
}

/**
 * 統計データからHTMLを生成する
 * @param {Object} stats - 統計データ
 * @param {Object} [collapse] - 要素タイプ別表の列グループ折りたたみ状態
 * @returns {string} HTML文字列
 */
export function generateSummaryHTML(stats, collapse = getGroupCollapse()) {
  if (stats.totalElements === 0) {
    return '<div class="diff-stat-item">比較対象の要素がありません</div>';
  }

  let html = '';

  // クロスバージョン警告を先頭に表示
  const versionInfo = getCurrentVersionInfo();
  if (versionInfo.isCrossVersion) {
    html += `
      <div class="version-notice cross-version" style="display: flex; align-items: flex-start; gap: 8px; padding: 8px; margin-bottom: 10px; background: var(--bg-secondary, #f3f4f6); border-radius: 4px; border-left: 3px solid var(--color-warning, #d97706);">
        <span style="font-size: var(--font-size-base);">⚠️</span>
        <span style="font-size: var(--font-size-sm); color: var(--text-primary, #374151);">異なるバージョン間の比較です</span>
      </div>
      <div class="version-filter-option" style="margin-bottom: 10px; padding: 8px; background: var(--bg-secondary, #f3f4f6); border-radius: 4px;">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: var(--font-size-sm);">
          <input type="checkbox" id="version-diff-filter" ${shouldShowVersionSpecificDifferences() ? 'checked' : ''} style="width: 14px; height: 14px; cursor: pointer;">
          <span>バージョン固有の差異も表示</span>
        </label>
      </div>
    `;
  }

  // 異ソフト間比較モードの注記（C2 別建物警告 / A5 片側欠落カテゴリ）。モードOFF時は空文字。
  html += generateCrossSoftwareNotices(stats);

  const total = stats.totalElements;

  // 要素タイプ別の数値表を最上部に配置する（走査の起点となるため）
  html += generateTypeTable(stats, collapse);

  // 見出し: 対応率（比較キーずれ等の兆候にすぐ気付けるよう最上部に大きく表示）
  html += `
    <div class="diff-summary-headline">
      <span class="diff-headline-label">対応率</span>
      <span class="diff-headline-value diff-stat-matched">${formatPct(stats.totalCorresponding, total)}</span>
      <span class="diff-headline-sub">${stats.totalCorresponding} / ${total}</span>
    </div>
  `;

  // 集計範囲の注記: サマリーは全比較対象、色付けフィルタは3D描画要素のみ。
  // 非描画のSTB定義（断面・継手定義など）を含む場合、両者の総数がずれる理由を明示する。
  html += generateScopeNote(stats);

  // 割合バー（4カテゴリの構成比を視覚化）
  html += generateProportionBar(stats);

  // 凡例（バーと対応。0件でも並びを崩さず常に4行表示）
  html += '<div class="diff-legend">';
  html += renderLegendRow(
    '✅',
    '対応要素あり',
    stats.totalCorresponding,
    total,
    'diff-stat-matched',
    SUMMARY_CATEGORY_STATUSES.corresponding,
  );
  // 対応要素の階層分解（完全一致 / 位置許容差内 / 属性差あり）
  html += renderSubLegendRow(
    '完全一致',
    stats.totalExact,
    total,
    [DIFF_STATUS.MATCHED],
    DIFF_STATUS_VALUE_CLASSES[DIFF_STATUS.MATCHED],
  );
  if (stats.totalWithinTolerance > 0) {
    html += renderSubLegendRow(
      '位置許容差内',
      stats.totalWithinTolerance,
      total,
      [DIFF_STATUS.POSITION_TOLERANCE],
      DIFF_STATUS_VALUE_CLASSES[DIFF_STATUS.POSITION_TOLERANCE],
    );
  }
  // 「属性差あり」を diffStatus 別の色付きサブ行に分解し、各行の文字色を3Dジオメトリ色に一致させる。
  // インスタンス=橙 / 断面・タイプ=シアン / 両方=紫 / 位置許容差＋属性差(combined)=紫 / 未分類=橙。
  // 各ステータス数の合計は totalAttributeMismatch と一致するため、対応要素あり内訳の総和は保たれる。
  const attributeBreakdown = [
    [
      'インスタンス属性差',
      stats.statusCounts?.attributeMismatchInstance,
      DIFF_STATUS.ATTRIBUTE_MISMATCH_INSTANCE,
    ],
    [
      '断面・タイプ差',
      stats.statusCounts?.attributeMismatchType,
      DIFF_STATUS.ATTRIBUTE_MISMATCH_TYPE,
    ],
    [
      '両方（属性＋タイプ）',
      stats.statusCounts?.attributeMismatchBoth,
      DIFF_STATUS.ATTRIBUTE_MISMATCH_BOTH,
    ],
    ['位置許容差＋属性差', stats.statusCounts?.combined, DIFF_STATUS.COMBINED],
    ['属性差（未分類）', stats.statusCounts?.attributeMismatch, DIFF_STATUS.ATTRIBUTE_MISMATCH],
  ];
  for (const [label, count, status] of attributeBreakdown) {
    if (count > 0) {
      html += renderSubLegendRow(label, count, total, [status], DIFF_STATUS_VALUE_CLASSES[status]);
    }
  }
  html += renderLegendRow(
    '🔵',
    'モデルAのみ',
    stats.totalOnlyA,
    total,
    'diff-stat-only-a',
    SUMMARY_CATEGORY_STATUSES.onlyA,
  );
  html += renderLegendRow(
    '🔴',
    'モデルBのみ',
    stats.totalOnlyB,
    total,
    'diff-stat-only-b',
    SUMMARY_CATEGORY_STATUSES.onlyB,
  );
  html += '</div>';

  // 一致の次元別分析（位置・断面/タイプ・インスタンス属性）
  html += generateMatchDimensionSection(stats.matchDimensions);

  // アクションボタン（差分一覧 / 異ソフト間モード時のみ断面対応表）
  const actionButtons = [];
  if (stats.totalOnlyA > 0 || stats.totalOnlyB > 0 || stats.totalAttributeMismatch > 0) {
    actionButtons.push(`
      <button type="button" id="open-diff-list-from-summary" class="btn btn-sm btn-secondary diff-list-btn">
        📋 差分一覧を表示
      </button>
    `);
  }
  if (stats.crossSoftware) {
    actionButtons.push(`
      <button type="button" id="open-section-correspondence-btn" class="btn btn-sm btn-secondary diff-list-btn"
        title="トップレベル断面の1:1対応と形状の一致/差を表示">
        📑 断面対応表
      </button>
    `);
  }
  if (actionButtons.length > 0) {
    html += `<div class="diff-summary-actions">${actionButtons.join('')}</div>`;
  }

  // クリックで文字が入れ替わる動的部（絞り込み状態・件数）は最下部フッターに固定する
  html += generateViewFilterFooter();

  return html;
}

/**
 * 件数を全体に対する百分率の文字列に変換する
 * @param {number} value - 件数
 * @param {number} total - 全体件数
 * @returns {string} 例: "15.0%"
 */
function formatPct(value, total) {
  if (!total) return '0.0%';
  return `${((value / total) * 100).toFixed(1)}%`;
}

/**
 * サマリーの集計範囲を説明する注記を生成する。
 *
 * 差分サマリーは「全比較対象」を数えるのに対し、表内のビューフィルタは
 * 3Dに描画される要素のみを数えるため、非描画のSTB定義（断面・継手定義など）が
 * あると両者の総数が一致しない。その内訳と理由を明示してユーザーの混乱を防ぐ。
 *
 * @param {Object} stats - 統計データ
 * @returns {string} HTML文字列（非描画要素が無い場合は空文字）
 */
function generateScopeNote(stats) {
  if (stats.totalNonRenderable <= 0) {
    return '';
  }

  return `
    <div class="diff-scope-note">
      <span class="diff-scope-label">総数 ${stats.totalElements} の内訳</span>
      <span class="diff-scope-parts">
        <span class="diff-scope-3d">3D表示対象 ${stats.totalRenderable}</span>
        <span class="diff-scope-plus">＋</span>
        <span class="diff-scope-def">非描画のSTB定義 ${stats.totalNonRenderable}</span>
      </span>
      <span class="diff-scope-hint">表内のビューフィルタは 3D表示対象（${stats.totalRenderable}）のみを集計します</span>
    </div>
  `;
}

/**
 * 4カテゴリの構成比を表す横積みバーのHTMLを生成する
 * @param {Object} stats - 統計データ
 * @returns {string} HTML文字列
 */
function generateProportionBar(stats) {
  const total = stats.totalElements;
  const segments = [
    [
      '対応要素あり',
      stats.totalCorresponding,
      'var(--color-matched)',
      SUMMARY_CATEGORY_STATUSES.corresponding,
    ],
    ['モデルAのみ', stats.totalOnlyA, 'var(--color-only-a)', SUMMARY_CATEGORY_STATUSES.onlyA],
    ['モデルBのみ', stats.totalOnlyB, 'var(--color-only-b)', SUMMARY_CATEGORY_STATUSES.onlyB],
  ];

  let bar = '<div class="diff-proportion-bar">';
  for (const [label, value, color, statuses] of segments) {
    if (value > 0) {
      const width = (value / total) * 100;
      bar += `<span class="diff-proportion-seg diff-clickable" style="width:${width}%;background:${color};" title="${label} ${value} (${formatPct(value, total)})：クリックで3D表示を絞り込み"${filterClickAttrs(statuses)}></span>`;
    }
  }
  bar += '</div>';
  return bar;
}

/**
 * 凡例の1行を生成する
 * @param {string} icon - アイコン絵文字
 * @param {string} label - ラベル
 * @param {number} value - 件数
 * @param {number} total - 全体件数
 * @param {string} valueClass - 値に付与する色クラス
 * @param {Array<string>} [statuses] - クリック時に適用する差分ステータス群（0件時は付与しない）
 * @returns {string} HTML文字列
 */
function renderLegendRow(icon, label, value, total, valueClass, statuses) {
  const clickable = statuses && value > 0;
  const rowAttrs = clickable
    ? ` title="クリックで3D表示を絞り込み"${filterClickAttrs(statuses)}`
    : '';
  return `<div class="diff-legend-row${clickable ? ' diff-clickable' : ''}"${rowAttrs}><span class="diff-legend-label">${icon} ${label}</span><span class="diff-legend-value ${valueClass}">${value}</span><span class="diff-legend-pct">${formatPct(value, total)}</span></div>`;
}

/**
 * 一致の内訳を示すサブ凡例行を生成する（一致行の下にインデント表示）
 * @param {string} label - ラベル
 * @param {number} value - 件数
 * @param {number} total - 全体件数
 * @param {Array<string>} [statuses] - クリック時に適用する差分ステータス群（0件時は付与しない）
 * @param {string} [valueClass] - 値に付与する色クラス
 * @returns {string} HTML文字列
 */
function renderSubLegendRow(label, value, total, statuses, valueClass = '') {
  const clickable = statuses && value > 0;
  const rowAttrs = clickable
    ? ` title="クリックで3D表示を絞り込み"${filterClickAttrs(statuses)}`
    : '';
  const classAttr = valueClass ? ` ${valueClass}` : '';
  return `<div class="diff-legend-row diff-legend-sub${clickable ? ' diff-clickable' : ''}"${rowAttrs}><span class="diff-legend-label">└ ${label}</span><span class="diff-legend-value${classAttr}">${value}</span><span class="diff-legend-pct">${formatPct(value, total)}</span></div>`;
}

/**
 * 一致要素の次元別分析セクション（位置・断面/タイプ・インスタンス属性）を生成する。
 * 各次元を積み上げバーと件数内訳で表示する。
 * @param {Object} dims - computeMatchDimensions/accumulateMatchDimensions の集計結果
 * @returns {string} HTML文字列
 */
function generateMatchDimensionSection(dims) {
  if (!dims || dims.pairsTotal === 0) {
    return '';
  }

  const unknownColor = 'var(--border-color, #ced4da)';
  // 各セグメントに対応する差分フィルタステータス（近似対応。
  // 次元集計は attributeMismatchKind ベースのため、フィルタの9カテゴリでは
  // 厳密に表現できないセグメントは最も近いステータス群にマップする）
  const rows = [
    {
      label: '位置',
      segments: [
        [
          '完全一致',
          dims.positionExact,
          'var(--color-matched)',
          POSITION_EXACT_STATUSES,
          { positionStates: ['exact'] },
        ],
        [
          '許容差内',
          dims.positionTolerance,
          DIFF_STATUS_COLOR_VARS[DIFF_STATUS.POSITION_TOLERANCE],
          POSITION_TOLERANCE_STATUSES,
          { positionStates: ['withinTolerance'] },
        ],
      ],
    },
    {
      label: '断面・タイプ',
      segments: [
        [
          '一致',
          dims.sectionMatch,
          'var(--color-matched)',
          PAIRED_STATUSES,
          { sectionStates: ['match'] },
        ],
        [
          '相違',
          dims.sectionMismatch,
          DIFF_STATUS_COLOR_VARS[DIFF_STATUS.ATTRIBUTE_MISMATCH_TYPE],
          [DIFF_STATUS.ATTRIBUTE_MISMATCH_TYPE, DIFF_STATUS.ATTRIBUTE_MISMATCH_BOTH],
          { sectionStates: ['mismatch'] },
        ],
        [
          '未分類',
          dims.sectionUnknown,
          unknownColor,
          [DIFF_STATUS.ATTRIBUTE_MISMATCH, DIFF_STATUS.COMBINED],
        ],
      ],
    },
    {
      label: 'インスタンス属性',
      segments: [
        [
          '一致',
          dims.instanceMatch,
          'var(--color-matched)',
          PAIRED_STATUSES,
          { instanceStates: ['match'] },
        ],
        [
          '相違',
          dims.instanceMismatch,
          DIFF_STATUS_COLOR_VARS[DIFF_STATUS.ATTRIBUTE_MISMATCH_INSTANCE],
          [DIFF_STATUS.ATTRIBUTE_MISMATCH_INSTANCE, DIFF_STATUS.ATTRIBUTE_MISMATCH_BOTH],
          { instanceStates: ['mismatch'] },
        ],
        [
          '未分類',
          dims.instanceUnknown,
          unknownColor,
          [DIFF_STATUS.ATTRIBUTE_MISMATCH, DIFF_STATUS.COMBINED],
        ],
      ],
    },
  ];

  const total = dims.pairsTotal;
  let html = '<div class="diff-dim-section">';
  html += `<div class="diff-type-title">対応要素の内訳 <span class="diff-dim-total">${total}件</span></div>`;

  for (const row of rows) {
    const active = row.segments.filter(([, value]) => value > 0);
    html += '<div class="diff-dim-row">';
    html += `<div class="diff-dim-head"><span class="diff-dim-label">${row.label}</span>`;
    html += `<span class="diff-dim-counts">${active
      .map(([label, value]) => `${label} ${value}`)
      .join(' / ')}</span></div>`;
    html += '<div class="diff-dim-bar">';
    for (const [label, value, color, statuses, criteria] of active) {
      const width = (value / total) * 100;
      html += `<span class="diff-dim-seg diff-clickable" style="width:${width}%;background:${color};" title="${label} ${value} (${formatPct(value, total)})：クリックで関連カテゴリを絞り込み"${filterClickAttrs(statuses, null, criteria)}></span>`;
    }
    html += '</div>';
    html += '</div>';
  }

  html += '</div>';
  return html;
}

/**
 * 配置要素テーブルの、名前列を除く全実列を並び順で返す。
 * 先頭固定列（全体）→ 展開済みの各分類軸の列 → A/Bのみ の順。
 * colgroup・列幅・本体行・合計行で同じ並びを共有する。
 * @param {Object} collapse - 分類軸の折りたたみ状態
 * @returns {Array<Object>} 実列の配列
 */
function getPlacementMetricColumns(collapse) {
  const columns = [...FLAT_LEADING_COLUMNS];
  for (const axis of PLACEMENT_AXES) {
    columns.push(...getAxisColumns(axis, collapse));
  }
  columns.push(...AB_ONLY_COLUMNS);
  return columns;
}

/**
 * 要素タイプ別テーブル全体を生成する。
 * 配置要素（3D描画対象）は3段ヘッダのメインテーブル、
 * 断面要素（非描画のSTB定義）は位置軸を持たない別テーブルに分離する。
 * @param {Object} stats - 統計データ
 * @param {Object} collapse - 分類軸の折りたたみ状態
 * @returns {string} HTML文字列
 */
function generateTypeTable(stats, collapse) {
  const elementTypeEntries = Object.entries(stats.elementTypes);
  let html = '<div class="diff-type-section">';
  html += '<div class="diff-type-toolbar">';
  html += '<div class="diff-type-heading">';
  html += '<div class="diff-type-title">要素タイプ別</div>';
  html +=
    '<div class="diff-type-note">「対応要素数」を親に、位置・属性・断面（●）の3軸で一致/不一致に分解します。断面・接合・開口は下部のタブで内訳を表示します。</div>';
  html += '</div>';
  html += generateViewFilterToolbar();
  html += '</div>';

  if (elementTypeEntries.length <= 1) {
    html += '</div>';
    return html;
  }

  // 配置要素（3D描画対象）のみメインテーブルに描く。
  // 非描画のSTB定義（断面・接合・開口・その他）はグループ×カテゴリのタブ表示に分離する。
  const placementEntries = elementTypeEntries.filter(([, s]) => s.isRenderable);

  html += generatePlacementTable(placementEntries, stats, collapse);
  html += generateDefinitionTabs(stats.sectionDefinitionDimensions);

  html += '</div>';
  return html;
}

/**
 * 配置要素テーブル（3段ヘッダ: 対応要素数 > 分類軸 > 一致/不一致）を生成する。
 * @param {Array<[string, Object]>} entries - 配置要素タイプの [type, typeStats] 配列
 * @param {Object} stats - 統計データ（合計行・スコープ注記に使用）
 * @param {Object} collapse - 分類軸の折りたたみ状態
 * @returns {string} HTML文字列
 */
function generatePlacementTable(entries, stats, collapse) {
  const columns = getPlacementMetricColumns(collapse);
  let html = `<div class="diff-type-table-frame" style="${generatePlacementWidthStyle(columns)}">`;
  html += generatePlacementParentHeader(collapse);
  html += generatePlacementAxisHeader(collapse);
  html += '<table class="diff-type-table">';
  html += generateMetricColgroup(columns);
  html += generatePlacementLeafHeader(columns);

  html += '<tbody>';
  entries.forEach(([elementType, typeStats]) => {
    html += generateTypeRow(elementType, typeStats, columns, stats);
  });
  html += '</tbody>';

  html += '<tfoot><tr class="diff-type-total-row">';
  html += '<td class="diff-col-name">合計</td>';
  for (const col of columns) {
    html += renderTypeTotalCell(col.tot(stats) || 0, col.cls, col.statuses, col.criteria);
  }
  html += '</tr></tfoot></table></div>';
  return html;
}

// 断面定義カテゴリ別テーブルの数値列。位置軸を持たないため、
// 対応 / 情報一致 / 情報不一致 / A・Bのみ を示す（配置要素の断面軸と同色）。
const SECTION_CATEGORY_COLUMNS = [
  { key: 'totalA', label: 'A計', title: 'モデルA側の定義数', cls: 'diff-cell-total' },
  { key: 'totalB', label: 'B計', title: 'モデルB側の定義数', cls: 'diff-cell-total' },
  { key: 'corresponding', label: '対応', title: 'A/Bで対応した定義数', cls: 'diff-stat-matched' },
  {
    key: 'sameNameMatch',
    label: '情報一致',
    title: '対応した定義のうち情報が一致した数',
    cls: 'diff-stat-matched',
  },
  {
    key: 'sameNameMismatch',
    label: '情報不一致',
    title: '対応した定義のうち情報が不一致の数',
    cls: DIFF_STATUS_VALUE_CLASSES[DIFF_STATUS.ATTRIBUTE_MISMATCH_TYPE],
  },
  { key: 'onlyA', label: 'Aのみ', title: 'モデルAにのみある定義数', cls: 'diff-stat-only-a' },
  { key: 'onlyB', label: 'Bのみ', title: 'モデルBにのみある定義数', cls: 'diff-stat-only-b' },
];

// 断面タブの数値セルクリック時に、該当断面を参照する配置要素を3D絞り込みするための
// 列別設定。idsFields は bucket.ids のどの区分の断面定義idを対象にするか、statuses は
// 3D側の差分ステータス（色・表示状態）、modelSource は Aのみ/Bのみ の片側限定。
// A計/B計は導出値だが、モデルA/B側に存在する全断面（対応＋片側）を参照する配置要素を
// A側/B側の id_section で照合して表示する。
// 断面定義セルは「該当断面を参照する全配置要素（対応ペア matched を含む）」を表示する。
// 表示範囲は sectionIds + modelSource の criteria で決まる（A側/B側の id_section で照合）。
// 配置要素自身の差分ステータス（matched/onlyA/属性差…）は定義の一致状態と独立なので、
// statuses は全ステータスを許可し、ステータスによる絞り込みは行わない。
// modelSource は照合する id_section 体系（A側 / B側）の選択に使う。
const SECTION_COLUMN_FILTER = {
  totalA: {
    idsFields: ['sameNameMatch', 'sameNameMismatch', 'onlyA'],
    statuses: DIFF_STATUS_VALUES,
    modelSource: 'A',
  },
  totalB: {
    idsFields: ['sameNameMatch', 'sameNameMismatch', 'onlyB'],
    statuses: DIFF_STATUS_VALUES,
    modelSource: 'B',
  },
  corresponding: {
    idsFields: ['sameNameMatch', 'sameNameMismatch'],
    statuses: DIFF_STATUS_VALUES,
    modelSource: null,
  },
  sameNameMatch: {
    idsFields: ['sameNameMatch'],
    statuses: DIFF_STATUS_VALUES,
    modelSource: null,
  },
  sameNameMismatch: {
    idsFields: ['sameNameMismatch'],
    statuses: DIFF_STATUS_VALUES,
    modelSource: null,
  },
  onlyA: { idsFields: ['onlyA'], statuses: DIFF_STATUS_VALUES, modelSource: 'A' },
  onlyB: { idsFields: ['onlyB'], statuses: DIFF_STATUS_VALUES, modelSource: 'B' },
};

// 断面以外の定義グループ（接合/開口/STB定義）は3D配置要素を持たないため、
// 数値セルクリックで該当グループ・カテゴリの差分を生XML表示する。
// 列キー → 生XMLで表示する差分カテゴリ集合（rawXmlDiffViewer の category 名）。
// totalA/totalB は導出値のためクリック不可（ここに載せない）。
const DEFINITION_COLUMN_RAW_XML_CATEGORIES = {
  corresponding: ['mismatch', 'match'],
  sameNameMatch: ['match'],
  sameNameMismatch: ['mismatch'],
  onlyA: ['onlyA'],
  onlyB: ['onlyB'],
};

// 断面カテゴリの表示順（構造的なまとまりで並べる。未登場カテゴリは自動的にスキップ）。
const SECTION_CATEGORY_ORDER = [
  '柱',
  '間柱',
  '大梁',
  '小梁',
  '梁',
  'ブレース',
  '壁',
  'スラブ',
  'パラペット',
  '基礎',
  '基礎柱',
  '布基礎',
  '杭',
  'その他',
];

// 断面カテゴリ → 配置要素タイプ（複数可）の対応。カテゴリ行クリックで
// 該当する配置要素のみを3D表示に絞り込むために使う。
// 「梁」は kind_beam 不明のため大梁+小梁の両方を対象にする。
const SECTION_CATEGORY_TO_ELEMENT_TYPES = {
  柱: ['Column'],
  間柱: ['Post'],
  大梁: ['Girder'],
  小梁: ['Beam'],
  梁: ['Girder', 'Beam'],
  ブレース: ['Brace'],
  壁: ['Wall'],
  スラブ: ['Slab'],
  パラペット: ['Parapet'],
  基礎: ['Footing'],
  基礎柱: ['FoundationColumn'],
  布基礎: ['StripFooting'],
  杭: ['Pile'],
};

// STB定義グループ（タブ）の定義。順序・ラベル・タブ表示条件を規定する。
const DEFINITION_TAB_DEFS = [
  { group: 'section', label: '断面', title: 'StbSec* の断面定義（部材カテゴリ別）' },
  { group: 'joint', label: '接合', title: 'StbJoint* の継手（接合ルール）定義' },
  { group: 'open', label: '開口', title: 'StbOpen* の開口配置定義' },
  { group: 'other', label: 'STB定義', title: 'StbCommon 等の断面以外の定義（材料・強度指定など）' },
];

// 直近に選択された定義タブ（再描画をまたいで保持）。
let activeDefTab = 'section';

/**
 * 定義タブの表示可否を判定する。
 * 継手・開口は片側モデルにしか無い場合は比較しても無意味なのでタブを出さない
 * （A・B 両方に1件以上あるときのみ表示）。断面・STB定義は存在すれば表示する。
 * @param {string} group
 * @param {Object} byCategory - 当該グループの byCategory
 * @returns {boolean}
 */
function shouldShowDefinitionTab(group, byCategory) {
  const totals = sumCategoryTotals(byCategory);
  if (totals.totalA + totals.totalB === 0) return false;
  if (group === 'joint' || group === 'open') {
    return totals.totalA > 0 && totals.totalB > 0;
  }
  return true;
}

/** byCategory を合算して A計/B計/各数値の合計を返す */
function sumCategoryTotals(byCategory) {
  const totals = {
    totalA: 0,
    totalB: 0,
    corresponding: 0,
    sameNameMatch: 0,
    sameNameMismatch: 0,
    onlyA: 0,
    onlyB: 0,
  };
  for (const counts of Object.values(byCategory || {})) {
    totals.corresponding += counts.corresponding;
    totals.sameNameMatch += counts.sameNameMatch;
    totals.sameNameMismatch += counts.sameNameMismatch;
    totals.onlyA += counts.onlyA;
    totals.onlyB += counts.onlyB;
    totals.totalA += counts.corresponding + counts.onlyA;
    totals.totalB += counts.corresponding + counts.onlyB;
  }
  return totals;
}

/**
 * 非描画STB定義（断面/接合/開口/STB定義）をタブUIとして生成する。
 * 継手・開口が片側のみのときはそのタブを出さない。
 * @param {Object} dims - sectionDefinitionDimensions（groups を含む）
 * @returns {string} HTML文字列（表示するタブが無ければ空文字）
 */
function generateDefinitionTabs(dims) {
  const groups = dims?.groups;
  if (!groups) return '';

  const visibleTabs = DEFINITION_TAB_DEFS.filter((def) =>
    shouldShowDefinitionTab(def.group, groups[def.group]?.byCategory),
  );
  if (visibleTabs.length === 0) return '';

  // 保持中の選択タブが非表示になっていたら先頭タブへフォールバック
  if (!visibleTabs.some((def) => def.group === activeDefTab)) {
    activeDefTab = visibleTabs[0].group;
  }

  let html = '<div class="diff-def-tabs-section">';
  html += '<div class="diff-def-tabs-title">STB定義（非描画要素）の内訳</div>';

  // タブヘッダ
  html += '<div class="diff-def-tablist" role="tablist">';
  for (const def of visibleTabs) {
    const totals = sumCategoryTotals(groups[def.group].byCategory);
    const active = def.group === activeDefTab;
    const count = totals.corresponding + Math.max(totals.onlyA, totals.onlyB);
    html +=
      `<button type="button" class="diff-def-tab${active ? ' diff-def-tab--active' : ''}" ` +
      `role="tab" aria-selected="${active}" data-def-tab="${def.group}" title="${def.title}">` +
      `${def.label}<span class="diff-def-tab-count">${count}</span></button>`;
  }
  html += '</div>';

  // 各タブのパネル（非アクティブは hidden）
  for (const def of visibleTabs) {
    const active = def.group === activeDefTab;
    html += `<div class="diff-def-panel" role="tabpanel" data-def-panel="${def.group}"${active ? '' : ' hidden'}>`;
    html += generateDefinitionCategoryTable(def.group, groups[def.group].byCategory);
    html += '</div>';
  }

  html += '</div>';
  return html;
}

/**
 * 1グループぶんのカテゴリ別内訳テーブルを生成する。
 * 断面グループのカテゴリ行は3Dフィルタ導線（data-section-element-types）、
 * それ以外は生XML導線（data-raw-xml-group）を付与する。
 * @param {string} group - 'section' | 'joint' | 'open' | 'other'
 * @param {Object} byCategory - カテゴリ別カウンタ
 * @returns {string} HTML文字列
 */
function generateDefinitionCategoryTable(group, byCategory) {
  const present = orderedCategories(group, byCategory);
  const columns = SECTION_CATEGORY_COLUMNS;
  const nameHeader = group === 'section' ? 'カテゴリ' : '種別';

  let html = `<div class="diff-type-table-frame" style="${generatePlacementWidthStyle(columns)}">`;
  html += '<table class="diff-type-table">';
  html += generateMetricColgroup(columns);
  html += `<thead><tr class="diff-column-header"><th class="diff-col-name" scope="col">${nameHeader}</th>`;
  for (const col of columns) {
    html += `<th scope="col" title="${col.title}">${col.label}</th>`;
  }
  html += '</tr></thead><tbody>';

  const totals = Object.fromEntries(columns.map((col) => [col.key, 0]));
  for (const category of present) {
    const counts = byCategory[category];
    html += generateDefinitionCategoryRow(group, category, counts);
    for (const col of columns) totals[col.key] += categoryColumnValue(counts, col.key);
  }
  html += '</tbody>';

  html += '<tfoot><tr class="diff-type-total-row"><td class="diff-col-name">合計</td>';
  for (const col of columns) {
    html += renderTypeTotalCell(totals[col.key], col.cls, null, null);
  }
  html += '</tr></tfoot></table></div>';
  return html;
}

/** グループの表示カテゴリを順序付きで返す（未知カテゴリは末尾に付す） */
function orderedCategories(group, byCategory) {
  const keys = Object.keys(byCategory || {});
  if (group !== 'section') return keys; // 接合/開口/その他は単一カテゴリ
  const present = SECTION_CATEGORY_ORDER.filter((c) => byCategory[c]);
  for (const c of keys) {
    if (!present.includes(c)) present.push(c);
  }
  return present;
}

/** カテゴリ別カウンタから列値を取り出す（A計/B計は導出） */
function categoryColumnValue(counts, key) {
  if (key === 'totalA') return counts.corresponding + counts.onlyA;
  if (key === 'totalB') return counts.corresponding + counts.onlyB;
  return counts[key] || 0;
}

/**
 * カテゴリ別内訳テーブルの1行を生成する。
 * 断面カテゴリは3Dフィルタ導線、それ以外は生XML導線を名前セルに付与する。
 * @param {string} group
 * @param {string} category
 * @param {Object} counts
 * @returns {string} HTML文字列（<tr>...</tr>）
 */
function generateDefinitionCategoryRow(group, category, counts) {
  const columns = SECTION_CATEGORY_COLUMNS;
  const elementTypes = group === 'section' ? SECTION_CATEGORY_TO_ELEMENT_TYPES[category] : null;
  const hasAny = counts.corresponding + counts.onlyA + counts.onlyB > 0;
  const hasDiffs = counts.sameNameMismatch + counts.onlyA + counts.onlyB > 0;

  let nameAttrs;
  if (elementTypes && hasAny) {
    // 断面カテゴリ: クリックで該当配置要素のみを3D表示
    nameAttrs =
      ` class="diff-col-name diff-clickable" title="クリックで${category}の配置要素のみ3D表示"` +
      ` data-section-element-types="${elementTypes.join(' ')}"`;
  } else if (hasDiffs) {
    // 接合/開口/その他: クリックで該当グループの差分を生XML表示
    nameAttrs =
      ` class="diff-col-name diff-clickable" title="クリックで${category}の差分を生XML表示"` +
      ` data-raw-xml-group="${group}"`;
  } else {
    nameAttrs = ' class="diff-col-name"';
  }

  let html = `<tr><td${nameAttrs}>${category}</td>`;
  for (const col of columns) {
    const value = categoryColumnValue(counts, col.key);
    if (group === 'section' && SECTION_COLUMN_FILTER[col.key]) {
      html += renderSectionDefCell(value, col.cls, category, counts, col.key, elementTypes);
    } else if (group !== 'section' && DEFINITION_COLUMN_RAW_XML_CATEGORIES[col.key]) {
      html += renderDefinitionRawXmlCell(value, col.cls, group, category, col.key);
    } else {
      html += renderTypeCell(value, col.cls, null, null);
    }
  }
  html += '</tr>';
  return html;
}

/**
 * 断面以外の定義タブ（接合/開口/STB定義）の数値セルを生成する。
 * 値>0 なら、該当グループ・列の差分カテゴリを生XML表示するクリック導線を付与する。
 * @param {number} value - セルの件数
 * @param {string} valueClass - 色クラス
 * @param {string} group - 定義グループ（joint/open/other）
 * @param {string} category - カテゴリ表示名（サブタイトル添え）
 * @param {string} colKey - 列キー（corresponding/sameNameMatch/... ）
 * @returns {string} HTML文字列（<td>...</td>）
 */
function renderDefinitionRawXmlCell(value, valueClass, group, category, colKey) {
  if (value <= 0) {
    return '<td class="diff-cell-zero">0</td>';
  }
  const categories = DEFINITION_COLUMN_RAW_XML_CATEGORIES[colKey];
  return (
    `<td class="${valueClass} diff-clickable"` +
    ` title="クリックで${category}の該当差分を生XML表示"` +
    ` data-raw-xml-group="${group}" data-raw-xml-categories="${categories.join(' ')}">` +
    `${value}</td>`
  );
}

/**
 * 断面タブの数値セルを生成する。値>0 なら「該当断面を参照する配置要素」を3D絞り込み
 * するためのクリック導線（data-section-def-*）を付与する。
 * @param {number} value - セルの件数
 * @param {string} valueClass - 色クラス
 * @param {string} category - 断面カテゴリ名
 * @param {Object} counts - カテゴリ別カウンタ（ids を含む）
 * @param {string} colKey - 列キー（corresponding/sameNameMatch/... ）
 * @param {string[]|null} elementTypes - カテゴリ→配置要素タイプ（二重絞り込み用）
 * @returns {string} HTML文字列（<td>...</td>）
 */
function renderSectionDefCell(value, valueClass, category, counts, colKey, elementTypes) {
  if (value <= 0) {
    return '<td class="diff-cell-zero">0</td>';
  }
  const cfg = SECTION_COLUMN_FILTER[colKey];
  // 該当区分の断面定義idを重複除去して集める
  const idSet = new Set();
  for (const field of cfg.idsFields) {
    for (const id of counts.ids?.[field] || []) idSet.add(String(id));
  }
  // idが1件も無ければ配置要素と突合できないためクリック不可にする
  if (idSet.size === 0) {
    return `<td class="${valueClass}">${value}</td>`;
  }
  const ids = [...idSet].join(' ');
  const statuses = cfg.statuses.join(' ');
  const elemTypesAttr = elementTypes
    ? ` data-section-def-elem-types="${elementTypes.join(' ')}"`
    : '';
  const modelSourceAttr = cfg.modelSource
    ? ` data-section-def-model-source="${cfg.modelSource}"`
    : '';
  return (
    `<td class="${valueClass} diff-clickable"` +
    ` title="クリックで${category}の該当断面を参照する配置要素を3D表示"` +
    ` data-section-def-ids="${ids}" data-section-def-statuses="${statuses}"` +
    ` data-section-def-category="${category}"${elemTypesAttr}${modelSourceAttr}>` +
    `${value}</td>`
  );
}

/**
 * 要素タイプ別テーブルの本体1行（タイプ名セル + 各実列の数値セル）を生成する。
 * 配置要素・断面要素の両テーブルで共有する。
 * @param {string} elementType - 要素タイプ
 * @param {Object} typeStats - 当該タイプの統計
 * @param {Array<Object>} columns - 実列の配列
 * @param {Object} stats - 統計データ（スコープマーカー判定に使用）
 * @returns {string} HTML文字列（<tr>...</tr>）
 */
function generateTypeRow(elementType, typeStats, columns, stats) {
  const typeName = getElementTypeDisplayName(elementType);
  // 3D描画されないタイプ（STB定義等）はクリックしても絞り込めないため対象外
  const clickType = typeStats.isRenderable ? elementType : null;
  // 非描画タイプは3D絞り込みの代わりに生XMLで確認できるようにする（差分がある場合のみ）
  const hasDefinitionDiffs =
    !typeStats.isRenderable &&
    (typeStats.attributeMismatch || 0) + (typeStats.onlyA || 0) + (typeStats.onlyB || 0) > 0;
  let nameAttrs;
  if (clickType) {
    nameAttrs = ` class="diff-col-name diff-clickable" title="クリックで${typeName}のみ3D表示"${filterClickAttrs(DIFF_STATUS_VALUES, clickType)}`;
  } else if (hasDefinitionDiffs) {
    nameAttrs = ` class="diff-col-name diff-clickable" title="クリックで${typeName}の非ジオメトリ差分を生XML表示" data-raw-xml-type="${elementType}"`;
  } else {
    nameAttrs = ' class="diff-col-name"';
  }
  // A5: 片側欠落カテゴリ（異ソフト間モード時のみ検出）には注記マーカーを付ける
  const scopeMarker = stats.crossSoftware?.oneSidedTypes?.has(elementType)
    ? ' <span class="diff-scope-marker" title="片側のモデルにのみ存在するカテゴリ（出力範囲の違いの可能性）">※</span>'
    : '';
  let html = '<tr>';
  html += `<td${nameAttrs}>${typeName}${scopeMarker}</td>`;
  for (const col of columns) {
    const clickTarget = col.statuses ? clickType : null;
    html += renderTypeCell(
      col.per(typeStats) || 0,
      col.cls,
      col.statuses,
      clickTarget,
      col.criteria,
    );
  }
  html += '</tr>';
  return html;
}

/**
 * 要素タイプ別表と同じ操作面に置く3D表示フィルタ（固定部）を生成する。
 * クリックで文字が入れ替わる動的部（絞り込み状態・件数・タイプチップ）は
 * generateViewFilterFooter() でサマリー最下部のフッターに分離している。
 * 上部で文字数が変化すると上下にブレるのを避けるため。
 * @returns {string} HTML文字列
 */
function generateViewFilterToolbar() {
  return `
    <div id="diff-filter-settings" class="diff-filter-settings diff-view-filter-settings diff-view-filter-toolbar">
      <div class="diff-view-filter-fixed">
        <span class="diff-view-filter-title">表示</span>
        <div class="diff-filter-presets">
          <button type="button" class="btn btn-sm preset-btn" data-preset="all" title="すべての要素を表示">
            全体表示
          </button>
          <button type="button" class="btn btn-sm preset-btn" data-preset="differencesOnly" title="差分（モデルA/Bのみ）を表示">
            差分のみ
          </button>
          <button type="button" class="btn btn-sm preset-btn" data-preset="matchedOnly" title="両方のモデルにある要素を表示">
            共通のみ
          </button>
          <button type="button" class="btn btn-sm preset-btn" data-preset="changesOnly" title="変更があった要素のみ表示">
            変更のみ
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * クリックで内容が書き換わる動的部（絞り込み状態・3D表示件数・タイプチップ）を
 * サマリー最下部の固定フッターとして生成する。
 * 上部に置くと文字数変化で本文がブレるため、フッターに固定して分離する。
 * @returns {string} HTML文字列
 */
function generateViewFilterFooter() {
  return `
    <div class="diff-summary-footer">
      <div class="diff-view-filter-dynamic">
        <span id="diff-view-filter-state" class="diff-view-filter-state">全表示</span>
        <span class="diff-filter-summary">3D表示中: <strong id="diff-visible-count">0</strong> /
          <span id="diff-total-count">0</span> 要素</span>
        <div id="diff-filter-active-type" class="diff-filter-active-type" hidden></div>
      </div>
    </div>
  `;
}

/**
 * 実列（名前列を除く）ぶんの colgroup を生成する。全実列を均一の metric 幅にする。
 * @param {Array<Object>} columns - 実列の配列
 * @returns {string} colgroup HTML文字列
 */
function generateMetricColgroup(columns) {
  let html = '<colgroup><col class="diff-type-name-col">';
  for (let i = 0; i < columns.length; i++) {
    html += '<col class="diff-type-metric-col">';
  }
  html += '</colgroup>';
  return html;
}

/**
 * テーブルの実列幅合計と、ヘッダグリッド用の列幅リストをCSS変数として返す。
 * table-layout: fixed で上段ヘッダ（CSS Grid）を下段の実列に正確に揃えるため、
 * 表示中の列を足し合わせた幅をテーブル自体に明示する。
 * @param {Array<Object>} columns - 実列の配列
 * @returns {string} style属性文字列
 */
function generatePlacementWidthStyle(columns) {
  const terms = [TYPE_TABLE_WIDTH_TERMS.name, ...columns.map(() => TYPE_TABLE_WIDTH_TERMS.metric)];
  return `--diff-type-table-width: calc(${terms.join(' + ')}); --diff-type-grid-columns: ${terms.join(
    ' ',
  )};`;
}

/**
 * 段1（親）ヘッダを生成する。全体列の上は空白、分類軸すべての上に「対応要素数」、
 * 末尾のA/Bのみ2列の上に「A/Bのみ」を張る。CSS Grid で下段の実列幅に揃える。
 * @param {Object} collapse - 分類軸の折りたたみ状態
 * @returns {string} HTML文字列
 */
function generatePlacementParentHeader(collapse) {
  const axisSpan = PLACEMENT_AXES.reduce(
    (sum, axis) => sum + getAxisColumns(axis, collapse).length,
    0,
  );
  const leadSpan = 1 + FLAT_LEADING_COLUMNS.length; // 名前列 + 全体列
  let html = '<div class="diff-type-group-header-grid diff-type-parent-header-grid" role="row">';
  html += `<div class="diff-group-spacer" aria-hidden="true" style="grid-column: span ${leadSpan}"></div>`;
  html += `<div class="diff-group-parent" role="columnheader" style="grid-column: span ${axisSpan}" title="モデルA/Bで対応した要素を、位置・属性・断面の3軸で分解します">対応要素数</div>`;
  html += `<div class="diff-group-spacer" aria-hidden="true" style="grid-column: span ${AB_ONLY_COLUMNS.length}"></div>`;
  html += '</div>';
  return html;
}

/**
 * 段2（分類軸）ヘッダを生成する。全体列の上は「全体」、各分類軸はクリックで
 * 展開/折りたたみするトグルボタン、末尾は「A/Bのみ」。CSS Grid で実列幅に揃える。
 * @param {Object} collapse - 分類軸の折りたたみ状態
 * @returns {string} HTML文字列
 */
function generatePlacementAxisHeader(collapse) {
  let html =
    '<div class="diff-type-group-header-grid" role="row"><div class="diff-group-spacer" aria-hidden="true"></div>';
  html += `<div class="diff-group-static" role="columnheader" style="grid-column: span ${FLAT_LEADING_COLUMNS.length}">全体</div>`;
  for (const axis of PLACEMENT_AXES) {
    const collapsed = collapse[axis.key];
    const cols = getAxisColumns(axis, collapse);
    const caret = collapsed ? '▶' : '▼';
    const action = collapsed ? '展開' : '折りたたみ';
    const marker = axis.marker ? `<span class="diff-axis-marker">${axis.marker}</span>` : '';
    html +=
      `<div class="diff-group-toggle" role="columnheader" style="grid-column: span ${cols.length}">` +
      `<button type="button" class="diff-group-toggle-btn" data-group-toggle="${axis.key}"` +
      ` aria-expanded="${!collapsed}" title="クリックで「${axis.label}」軸の一致/不一致を${action}">` +
      `<span class="diff-group-caret">${caret}</span>${marker}${axis.label}</button></div>`;
  }
  html += `<div class="diff-group-static" role="columnheader" style="grid-column: span ${AB_ONLY_COLUMNS.length}">A/Bのみ</div>`;
  html += '</div>';
  return html;
}

/**
 * 段3（葉）ヘッダ行を生成する。各実列のラベルを並べる。
 * @param {Array<Object>} columns - 実列の配列
 * @returns {string} HTML文字列
 */
function generatePlacementLeafHeader(columns) {
  let labelRow = '<tr class="diff-column-header"><th class="diff-col-name" scope="col">タイプ</th>';
  for (const col of columns) {
    labelRow += `<th scope="col" title="${col.title}">${col.label}</th>`;
  }
  labelRow += '</tr>';
  return `<thead>${labelRow}</thead>`;
}

/**
 * 要素タイプ別テーブルの数値セルを生成する（0件は淡色表示・クリック不可）
 * @param {number} value - 件数
 * @param {string} valueClass - 値に付与する色クラス
 * @param {Array<string>} [statuses] - クリック時に適用する差分ステータス群
 * @param {string|null} [elementType] - クリック時の要素タイプ絞り込み（nullでクリック不可）
 * @returns {string} HTML文字列
 */
function renderTypeCell(value, valueClass, statuses, elementType, criteria = null) {
  if (value <= 0) {
    return '<td class="diff-cell-zero">0</td>';
  }
  if (statuses && elementType) {
    return `<td class="${valueClass} diff-clickable" title="クリックで3D表示を絞り込み"${filterClickAttrs(statuses, elementType, criteria)}>${value}</td>`;
  }
  return `<td class="${valueClass}">${value}</td>`;
}

/**
 * 要素タイプ別テーブルの合計行セルを生成する。
 * @param {number} value - 件数
 * @param {string} valueClass - 値に付与する色クラス
 * @returns {string} HTML文字列
 */
function renderTypeTotalCell(value, valueClass, statuses = null, criteria = null) {
  if (value <= 0) {
    return '<td class="diff-cell-zero">0</td>';
  }
  if (statuses) {
    return `<td class="${valueClass} diff-clickable" title="クリックで3D表示を絞り込み"${filterClickAttrs(statuses, null, criteria)}>${value}</td>`;
  }
  return `<td class="${valueClass}">${value}</td>`;
}

/**
 * 要素タイプの表示名を取得する
 * ELEMENT_LABELS（SSOT）を使用
 * @param {string} elementType - 要素タイプ
 * @returns {string} 表示名
 */
function getElementTypeDisplayName(elementType) {
  return ELEMENT_LABELS[elementType] || elementType;
}

/**
 * 差分結果が更新された際のイベントリスナーを設定する
 */
export function setupDiffSummaryEventListeners() {
  // 比較結果更新イベントを監視（EventBus経由）
  eventBus.on(ComparisonEvents.UPDATE_STATISTICS, (data) => {
    if (data && data.comparisonResults) {
      updateDiffSummary(data.comparisonResults, data.reason, data.hasBothModels);
    }
  });

  log.info('Diff summary event listeners set up');
}

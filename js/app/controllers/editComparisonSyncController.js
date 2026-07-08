/**
 * @fileoverview 編集後の差分再比較コントローラー
 *
 * EditEvents.ATTRIBUTE_CHANGED を監視し、以下を行う:
 * 1. パースキャッシュ・nodeMapへの編集内容のインプレース反映（全再パース回避）
 * 2. 影響範囲（節点→接続部材、断面→使用部材）の解決
 * 3. 影響を受けた要素タイプのみのデバウンス再比較
 * 4. 結果を globalState に反映し、EditEvents.RECOMPARISON_COMPLETED で通知
 *    （3D再描画は editGeometrySyncController が担当）
 *
 * @module app/controllers/editComparisonSyncController
 */

import { createLogger } from '../../utils/logger.js';
import { eventBus, EditEvents, ComparisonEvents } from '../../data/events/index.js';
import { getState, setState } from '../../data/state/globalState.js';
import {
  recompareSingleElementType,
  normalizeComparisonElementType,
  invalidateComparisonCachesForDocument,
} from '../../modelLoader/elementComparison.js';
import {
  isSectionElementType,
  resolveAffectedTypesForNode,
  resolveAffectedTypesForSection,
} from '../../modelLoader/editImpactResolver.js';
import { getSectionTypesForTagName } from '../../common-stb/import/extractor/sectionExtractor.js';
import {
  updateCachedNodeCoordinate,
  removeCachedNode,
  refreshCachedElementsForType,
  refreshCachedSectionsForType,
} from '../../viewer/index.js';
import comparisonKeyManager from '../comparisonKeyManager.js';
import { COMPARISON_KEY_TYPE } from '../../config/comparisonKeyConfig.js';
import { isSupportedElement } from '../../constants/elementTypes.js';

const log = createLogger('editComparisonSyncController');

/** デバウンスタイマーID */
let debounceTimer = null;

/** 初期化済みフラグ */
let isInitialized = false;

/** デバウンス中に蓄積された要素タイプ */
const pendingElementTypes = new Set();

/** デバウンス待機時間（ms） */
const DEBOUNCE_DELAY = 300;

/** 比較タイプとして直接使えない編集タイプの読み替え（開口は壁の一部として扱う） */
const PENDING_TYPE_ALIASES = { Open: 'Wall' };

/**
 * 部材ではないモデル基準情報（階・通り芯）。3D部材として再描画・再比較せず、
 * 節点→階/通り芯ルックアップのキャッシュ無効化のみ行う（STORY_AXIS_BASED 比較が
 * 次回正しい所属で比較できるようにする）。
 */
const METADATA_ELEMENT_TYPES = new Set(['Story', 'Axis', 'ArcAxis', 'RadialAxis']);

/**
 * 編集→再比較同期コントローラーの内部状態をリセットする（テスト用）
 */
export function resetEditComparisonSync() {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  pendingElementTypes.clear();
  isInitialized = false;
}

/**
 * 編集対象モデルのドキュメントとキーを取得する
 * @param {string} modelSource - 'modelA' または 'modelB'
 * @returns {{ doc: Document|null, modelKey: string }}
 */
function getEditedModel(modelSource) {
  const modelKey = modelSource === 'modelB' ? 'B' : 'A';
  const doc = getState(modelKey === 'A' ? 'models.documentA' : 'models.documentB');
  return { doc, modelKey };
}

/**
 * 節点編集をキャッシュへ反映し、影響タイプを解決する
 * @param {Document} doc - 編集済みドキュメント
 * @param {string} modelKey - 'A' または 'B'
 * @param {string} nodeId - 節点ID
 */
function applyNodeEdit(doc, modelKey, nodeId) {
  const nodeElement = doc.querySelector(`StbNode[id="${String(nodeId).replace(/"/g, '\\"')}"]`);
  if (nodeElement) {
    const coords = {
      x: parseFloat(nodeElement.getAttribute('X')) || 0,
      y: parseFloat(nodeElement.getAttribute('Y')) || 0,
      z: parseFloat(nodeElement.getAttribute('Z')) || 0,
    };
    updateCachedNodeCoordinate(modelKey, nodeId, coords);

    // globalState の nodeMap（パースキャッシュとは別インスタンス）もインプレース更新。
    // Map参照は modelContext・再比較が共有しているため、参照を差し替えてはならない。
    // 未登録ID（新規節点の追加）はエントリを新設する。
    const nodeMap = getState(`models.nodeMap${modelKey}`);
    const entry = nodeMap?.get(String(nodeId));
    if (entry) {
      entry.x = coords.x;
      entry.y = coords.y;
      entry.z = coords.z;
    } else if (nodeMap) {
      nodeMap.set(String(nodeId), { x: coords.x, y: coords.y, z: coords.z });
    }
  } else {
    // StbNode が見つからない = 削除済み（新規節点追加の Undo）。キャッシュからも除去する。
    // 現状この経路は「追加直後の節点（接続部材なし）」の Undo のみが対象のため、
    // ダングリング参照（削除節点を参照する部材）は発生しない。既存節点の削除機能を
    // 追加する際は、接続部材の id_node* 参照のクリーンアップをここで行う必要がある。
    removeCachedNode(modelKey, nodeId);
    const nodeMap = getState(`models.nodeMap${modelKey}`);
    nodeMap?.delete(String(nodeId));
  }

  pendingElementTypes.add('Node');
  for (const type of resolveAffectedTypesForNode(doc, nodeId)) {
    pendingElementTypes.add(type);
  }
}

/**
 * 断面編集をキャッシュへ反映し、影響タイプを解決する
 * @param {Document} doc - 編集済みドキュメント
 * @param {string} modelKey - 'A' または 'B'
 * @param {string} elementType - 'SecColumn_RC' 等
 * @param {string} sectionId - 断面ID
 */
function applySectionEdit(doc, modelKey, elementType, sectionId) {
  const tagName = `Stb${elementType}`;
  const sectionTypes = getSectionTypesForTagName(tagName);
  if (sectionTypes.length === 0) {
    log.warn(`[EditSync] 断面タグ ${tagName} に対応する抽出設定がありません`);
  }
  for (const sectionType of sectionTypes) {
    refreshCachedSectionsForType(modelKey, doc, sectionType);
  }

  // 比較側の断面キャッシュを再解決させる（中身は同一参照だが防御的に無効化）
  invalidateComparisonCachesForDocument(doc);

  for (const type of resolveAffectedTypesForSection(doc, sectionId)) {
    pendingElementTypes.add(type);
  }
}

/**
 * 属性変更イベントを処理する: キャッシュ反映と影響タイプの蓄積
 * @param {{elementType: string, elementId: string, modelSource: string}} payload
 */
function handleAttributeChanged({ elementType, elementId, modelSource }) {
  const { doc, modelKey } = getEditedModel(modelSource);
  if (!doc) {
    log.warn('[EditSync] 編集対象ドキュメントが未ロードです');
    return;
  }

  try {
    if (METADATA_ELEMENT_TYPES.has(elementType)) {
      // 階・通り芯: 部材ではないため再抽出・再描画は不要。ただし節点の所属（階/通り芯）が
      // 変わるため、STORY_AXIS_BASED 比較が古い所属を参照しないようルックアップを無効化する。
      invalidateComparisonCachesForDocument(doc);
      // Story/Axis 自身が比較対象（SUPPORTED_ELEMENTS / 差分リストに表示）なら、その差分を
      // 更新するため再比較に積む（円弧/放射軸は独立した比較タイプではないため対象外）。
      if (isSupportedElement(elementType)) {
        pendingElementTypes.add(elementType);
      }
      // STORY_AXIS_BASED 比較では部材の比較キーが所属（階/通り芯）から導かれる。所属変更を
      // 即座に差分へ反映するため、現在比較中の全部材タイプを再比較対象に積む（位置情報系
      // キータイプでは所属は比較キーに影響しないため部材の再比較は不要）。
      if (comparisonKeyManager.getKeyType() === COMPARISON_KEY_TYPE.STORY_AXIS_BASED) {
        const comparisonResults = getState('comparisonResults');
        if (comparisonResults) {
          for (const type of comparisonResults.keys()) pendingElementTypes.add(type);
        }
      }
    } else if (elementType === 'Node') {
      applyNodeEdit(doc, modelKey, elementId);
    } else if (isSectionElementType(elementType)) {
      applySectionEdit(doc, modelKey, elementType, elementId);
    } else {
      // 部材編集: 該当タイプの要素配列を再抽出（数十ms）
      refreshCachedElementsForType(modelKey, doc, elementType);
      pendingElementTypes.add(PENDING_TYPE_ALIASES[elementType] || elementType);
    }
  } catch (error) {
    log.error(`[EditSync] キャッシュ反映でエラー (${elementType} ${elementId}):`, error);
    // キャッシュ反映に失敗しても再比較・再描画は試みる
    pendingElementTypes.add(PENDING_TYPE_ALIASES[elementType] || elementType);
  }
}

/**
 * 蓄積された要素タイプの再比較を実行する
 */
function executeRecomparison() {
  const elementTypes = [...pendingElementTypes];
  pendingElementTypes.clear();

  if (elementTypes.length === 0) return;

  const comparisonResults = getState('comparisonResults');
  if (!comparisonResults) {
    log.warn('comparisonResults が未設定のため再比較をスキップ');
    return;
  }

  const modelADocument = getState('models.documentA');
  const modelBDocument = getState('models.documentB');
  const nodeMapA = getState('models.nodeMapA');
  const nodeMapB = getState('models.nodeMapB');

  // 単一モデル表示（modelB 未ロード）でも編集→3D反映を行うため、
  // 両方無い場合のみスキップする（比較ロジックは片側 null を空モデルとして扱える）
  if (!modelADocument && !modelBDocument) {
    log.warn('モデルドキュメントが未ロードのため再比較をスキップ');
    return;
  }

  const modelData = {
    modelADocument,
    modelBDocument,
    nodeMapA: nodeMapA ?? new Map(),
    nodeMapB: nodeMapB ?? new Map(),
  };
  const comparisonKeyType = comparisonKeyManager.getKeyType();
  const options = {
    useImportanceFiltering: true,
    targetImportanceLevels: null,
    comparisonKeyType,
    sectionMatchCriterion: comparisonKeyManager.getSectionMatchCriterion(),
  };

  // 既存の Map をコピーして更新
  const updatedResults = new Map(comparisonResults);
  let hasChanges = false;
  const normalizedElementTypes = new Set();

  for (const elementType of elementTypes) {
    try {
      const normalizedElementType = normalizeComparisonElementType(elementType);
      normalizedElementTypes.add(normalizedElementType);

      const newResult = recompareSingleElementType(normalizedElementType, modelData, options);
      updatedResults.set(normalizedElementType, newResult);
      if (normalizedElementType !== elementType) {
        updatedResults.delete(elementType);
      }
      hasChanges = true;
      log.info(`[EditSync] ${elementType} を ${normalizedElementType} として再比較しました`);
    } catch (error) {
      log.error(`[EditSync] ${elementType} の再比較でエラー:`, error);
    }
  }

  if (!hasChanges) return;

  // globalState を更新（Diff List の stateListener が自動発火）
  setState('comparisonResults', updatedResults);

  const changedElementTypes = [...normalizedElementTypes];

  // 統計更新イベントを発火（Statistics, DiffSummary, Filter 等が自動更新）
  eventBus.emit(ComparisonEvents.UPDATE_STATISTICS, {
    comparisonResults: updatedResults,
    changedElementTypes,
    reason: 'editRecomparison',
    timestamp: new Date().toISOString(),
  });

  // 3D再描画のトリガー（editGeometrySyncController が購読）
  eventBus.emit(EditEvents.RECOMPARISON_COMPLETED, { changedElementTypes });

  log.info(`[EditSync] ${changedElementTypes.join(', ')} の再比較が完了しました`);
}

/**
 * 編集→再比較同期コントローラーを初期化する
 */
export function initEditComparisonSync() {
  if (isInitialized) {
    return;
  }

  eventBus.on(EditEvents.ATTRIBUTE_CHANGED, (payload) => {
    if (!payload?.elementType) return;

    handleAttributeChanged(payload);

    // デバウンス: 連続編集をまとめて処理
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      executeRecomparison();
    }, DEBOUNCE_DELAY);
  });

  isInitialized = true;

  log.info('編集→再比較同期コントローラーを初期化しました');
}

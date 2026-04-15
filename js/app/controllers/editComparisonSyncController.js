/**
 * @fileoverview 編集後の差分再比較コントローラー
 *
 * EditEvents.ATTRIBUTE_CHANGED を監視し、変更された要素タイプのみを再比較する。
 * 結果を globalState に反映し、既存のイベントチャネルで通知する。
 *
 * @module app/controllers/editComparisonSyncController
 */

import { createLogger } from '../../utils/logger.js';
import { eventBus, EditEvents, ComparisonEvents } from '../../data/events/index.js';
import { getState, setState } from '../../data/state/globalState.js';
import { recompareSingleElementType } from '../../modelLoader/elementComparison.js';
import comparisonKeyManager from '../comparisonKeyManager.js';

const log = createLogger('editComparisonSyncController');

/** デバウンスタイマーID */
let debounceTimer = null;

/** デバウンス中に蓄積された要素タイプ */
const pendingElementTypes = new Set();

/** デバウンス待機時間（ms） */
const DEBOUNCE_DELAY = 300;

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

  if (!modelADocument || !modelBDocument) {
    log.warn('モデルドキュメントが未ロードのため再比較をスキップ');
    return;
  }

  const modelData = { modelADocument, modelBDocument, nodeMapA, nodeMapB };
  const comparisonKeyType = comparisonKeyManager.getKeyType();
  const options = {
    useImportanceFiltering: true,
    targetImportanceLevels: null,
    comparisonKeyType,
  };

  // 既存の Map をコピーして更新
  const updatedResults = new Map(comparisonResults);
  let hasChanges = false;

  for (const elementType of elementTypes) {
    try {
      const newResult = recompareSingleElementType(elementType, modelData, options);
      updatedResults.set(elementType, newResult);
      hasChanges = true;
      log.info(`[EditSync] ${elementType} を再比較しました`);
    } catch (error) {
      log.error(`[EditSync] ${elementType} の再比較でエラー:`, error);
    }
  }

  if (!hasChanges) return;

  // globalState を更新（Diff List の stateListener が自動発火）
  setState('comparisonResults', updatedResults);

  // 統計更新イベントを発火（Statistics, DiffSummary, Filter 等が自動更新）
  eventBus.emit(ComparisonEvents.UPDATE_STATISTICS, {
    comparisonResults: updatedResults,
    changedElementTypes: elementTypes,
    reason: 'editRecomparison',
    timestamp: new Date().toISOString(),
  });

  log.info(`[EditSync] ${elementTypes.join(', ')} の再比較が完了しました`);
}

/**
 * 編集→再比較同期コントローラーを初期化する
 */
export function initEditComparisonSync() {
  eventBus.on(EditEvents.ATTRIBUTE_CHANGED, ({ elementType }) => {
    if (!elementType) return;

    pendingElementTypes.add(elementType);

    // デバウンス: 連続編集をまとめて処理
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      executeRecomparison();
    }, DEBOUNCE_DELAY);
  });

  log.info('編集→再比較同期コントローラーを初期化しました');
}

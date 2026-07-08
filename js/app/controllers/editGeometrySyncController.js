/**
 * @fileoverview 編集後の3D再描画コントローラー
 *
 * EditEvents.RECOMPARISON_COMPLETED を購読し、変更された要素タイプを
 * 型単位で再描画する。再描画は初回描画と同じ elementRedrawer 経由のため、
 * 表示モード（ライン/ソリッド）・差分色・カラーモード・ラベル・可視性が
 * すべて初回描画と同一品質で反映される。
 *
 * トリガーは RECOMPARISON_COMPLETED のみ（単一トリガー原則）。
 * ATTRIBUTE_CHANGED から直接再描画してはならない（再比較結果との不整合を防ぐ）。
 *
 * @module app/controllers/editGeometrySyncController
 */

import { createLogger } from '../../utils/logger.js';
import { eventBus, EditEvents } from '../../data/events/index.js';
import { scheduleRender } from '../../utils/renderScheduler.js';
import {
  redrawElementByType,
  redrawNodesForViewMode,
  redrawJointsForViewMode,
  redrawUndefinedElementsForViewMode,
} from '../viewModes/elementRedrawer.js';
import { registerElementsToRegistry } from '../../modelLoader/renderingOrchestrator.js';

const log = createLogger('editGeometrySyncController');

/** 初期化済みフラグ */
let isInitialized = false;

/**
 * 比較タイプ → 再描画タイプの展開。
 * 比較結果では ShearWall は Wall に正規化されるが、
 * ビューアは Wall / ShearWall を別グループで描画するため両方を再描画する。
 */
const REDRAW_TYPE_EXPANSIONS = { Wall: ['Wall', 'ShearWall'] };

/** 再描画パイプラインを持たないタイプ（編集再描画の対象外） */
const NON_REDRAWABLE_TYPES = new Set(['Story', 'Axis']);

/**
 * 1要素タイプを現在の表示モードに従って再描画する
 * @param {string} elementType - 要素タイプ
 */
function redrawType(elementType) {
  switch (elementType) {
    case 'Node':
      redrawNodesForViewMode(scheduleRender);
      break;
    case 'Joint':
      redrawJointsForViewMode(scheduleRender);
      break;
    case 'Undefined':
      redrawUndefinedElementsForViewMode(scheduleRender);
      break;
    default:
      redrawElementByType(elementType, scheduleRender);
  }
}

/**
 * 変更タイプ集合を再描画し、要素検索レジストリを同期する
 * @param {string[]} changedElementTypes - 再比較で変更された要素タイプ
 */
function handleRecomparisonCompleted(changedElementTypes) {
  if (!Array.isArray(changedElementTypes) || changedElementTypes.length === 0) return;

  const redrawTypes = new Set();
  for (const type of changedElementTypes) {
    if (NON_REDRAWABLE_TYPES.has(type)) continue;
    for (const expandedType of REDRAW_TYPE_EXPANSIONS[type] || [type]) {
      redrawTypes.add(expandedType);
    }
  }

  for (const type of redrawTypes) {
    try {
      redrawType(type);
    } catch (error) {
      log.error(`[EditSync] ${type} の再描画でエラー:`, error);
    }
  }

  if (redrawTypes.size > 0) {
    // 再描画でメッシュが入れ替わったため、要素検索レジストリを再構築
    registerElementsToRegistry();
    scheduleRender();
    log.info(`[EditSync] ${[...redrawTypes].join(', ')} を再描画しました`);
  }
}

/**
 * 編集→3D再描画コントローラーの内部状態をリセットする（テスト用）
 */
export function resetEditGeometrySync() {
  isInitialized = false;
}

/**
 * 編集→3D再描画コントローラーを初期化する
 */
export function initEditGeometrySync() {
  if (isInitialized) {
    return;
  }

  eventBus.on(EditEvents.RECOMPARISON_COMPLETED, ({ changedElementTypes } = {}) => {
    handleRecomparisonCompleted(changedElementTypes);
  });

  isInitialized = true;

  log.info('編集→3D再描画コントローラーを初期化しました');
}

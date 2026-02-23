/**
 * @fileoverview 表示モード状態管理コントローラー
 *
 * モデルデータの保持と表示モード状態の初期化を管理します。
 * このモジュールは、モデルデータの参照を保持し、UIの表示モード設定を
 * displayModeManagerに同期する責務を持ちます。
 */

import { setState } from '../globalState.js';
import { VIEW_MODE_CHECKBOX_IDS } from '../../config/uiElementConfig.js';
import { SOLID_ONLY_ELEMENTS } from '../../constants/elementTypes.js';
import { createLogger } from '../../utils/logger.js';
import { clearParseCache, setStateProvider, displayModeManager } from '../../viewer/index.js';
import {
  redrawElementByType,
  redrawBeamsForViewMode,
  redrawJointsForViewMode,
  redrawUndefinedElementsForViewMode,
} from './elementRedrawer.js';
import { registerElementsToRegistry } from '../../modelLoader/renderingOrchestrator.js';

// ロガー
const log = createLogger('displayModeController');

// stbStructureReaderに状態プロバイダーを設定（依存性注入）
setStateProvider({ setState });

// モデル情報の参照
let modelBounds = null;
let modelADocument = null;
let modelBDocument = null;
let nodeMapA = null;
let nodeMapB = null;

/**
 * モデルコンテキストを取得
 * @returns {Object} モデルコンテキスト
 */
export function getModelContext() {
  return {
    modelBounds,
    modelADocument,
    modelBDocument,
    nodeMapA,
    nodeMapB,
  };
}

/**
 * 状態管理モジュールを初期化
 * @param {Object} modelData - モデルデータ参照
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function initViewModes(modelData, scheduleRender) {
  // 新しいモデルが設定される前にパースキャッシュをクリア
  clearParseCache();

  modelBounds = modelData.modelBounds;
  modelADocument = modelData.modelADocument;
  modelBDocument = modelData.modelBDocument;
  nodeMapA = modelData.nodeMapA;
  nodeMapB = modelData.nodeMapB;

  log.info('[initViewModes] Initializing view modes with new model data');

  // UIのチェックボックスの状態を読み取り、displayModeManagerに反映
  syncDisplayModeFromUI();

  // 立体表示モードの要素を再描画（オーケストレーターでスキップされた要素を描画）
  applyInitialDisplayModes(scheduleRender);
}

/**
 * 表示モード管理をリセット
 */
export function resetViewModes() {
  log.info('[resetViewModes] Resetting view modes');
  clearParseCache();
  modelBounds = null;
  modelADocument = null;
  modelBDocument = null;
  nodeMapA = null;
  nodeMapB = null;
}

/**
 * UIのチェックボックスの状態をdisplayModeManagerに同期
 */
export function syncDisplayModeFromUI() {
  // 設定ファイルから要素タイプとチェックボックスIDのマッピングを使用
  Object.entries(VIEW_MODE_CHECKBOX_IDS).forEach(([type, id]) => {
    const checkbox = document.getElementById(id);
    if (checkbox) {
      // チェックされていれば'solid'、そうでなければ'line'
      const mode = checkbox.checked ? 'solid' : 'line';
      displayModeManager.setDisplayMode(type, mode);
      log.debug(`Synced ${type} display mode from UI: ${mode}`);
    }
  });
}

/**
 * 初期ロード時の表示モードを適用
 * オーケストレーターでスキップされた要素を正しいモードで描画する
 * @param {Function} scheduleRender - 再描画要求関数
 * @private
 */
function applyInitialDisplayModes(scheduleRender) {
  log.debug('[applyInitialDisplayModes] Applying initial display modes');

  // オーケストレーターで常にスキップされる要素タイプ（モードに関係なく再描画）
  const alwaysRedrawTypes = new Set(['Slab', 'Wall']);

  // VIEW_MODE_CHECKBOX_IDSから再描画が必要な要素タイプを動的に判定
  const typesToRedraw = Object.keys(VIEW_MODE_CHECKBOX_IDS).filter(
    (type) => alwaysRedrawTypes.has(type) || displayModeManager.isSolidMode(type),
  );

  // 立体表示のみ要素も再描画対象に追加（常にsolid）
  for (const solidOnlyType of SOLID_ONLY_ELEMENTS) {
    if (!typesToRedraw.includes(solidOnlyType)) {
      typesToRedraw.push(solidOnlyType);
    }
  }

  if (typesToRedraw.length === 0) {
    log.debug('[applyInitialDisplayModes] No elements need redrawing (all in line mode)');
  } else {
    log.info(`[applyInitialDisplayModes] ${typesToRedraw.length} element type(s) need redrawing`);

    // Beam/Girder は統合処理（redrawBeamsForViewMode が両方を処理する）
    const beamOrGirderNeedsRedraw =
      typesToRedraw.includes('Beam') || typesToRedraw.includes('Girder');

    // 特殊処理が必要な要素タイプ
    const specialTypes = new Set(['Beam', 'Girder', 'Joint']);

    for (const elementType of typesToRedraw) {
      if (specialTypes.has(elementType)) continue;
      log.debug(`[applyInitialDisplayModes] Redrawing: ${elementType}`);
      redrawElementByType(elementType, null, false);
    }

    // Beam/Girder 統合再描画
    if (beamOrGirderNeedsRedraw) {
      log.debug('[applyInitialDisplayModes] Redrawing: Beam/Girder');
      redrawBeamsForViewMode(null);
    }

    // Joint 再描画（立体表示のみ要素だが専用描画関数あり）
    if (typesToRedraw.includes('Joint')) {
      log.debug('[applyInitialDisplayModes] Redrawing: Joint');
      redrawJointsForViewMode(null);
    }
  }

  // Undefined 要素の再描画（チェックボックスなし、常に再描画）
  redrawUndefinedElementsForViewMode(null);

  // ElementRegistryを再登録（再描画でグループ内容が変わったため）
  registerElementsToRegistry();

  // 最後に1回だけ再描画をスケジュール
  if (scheduleRender) {
    scheduleRender();
  }
}

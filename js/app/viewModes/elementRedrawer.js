/**
 * @fileoverview 要素再描画処理
 *
 * 各要素タイプの再描画処理を担当します:
 * - ソリッド表示とライン表示の切り替え
 * - ラベル作成と管理
 * - 継手（Joint）とUndefined要素の再描画
 *
 * サブモジュール:
 * - elementRedrawCore.js: 共通ヘルパー・オーケストレーター・ラベル作成
 * - elementRedrawWalls.js: 壁要素・開口関連
 * - elementRedrawSpecial.js: 継手・未定義要素
 */

import { createLogger } from '../../utils/logger.js';
import { getElementRedrawConfig } from '../../config/elementRedrawConfig.js';
import { redrawElementForViewMode } from './elementRedrawCore.js';
import { getState } from '../../data/state/globalState.js';
import { eventBus, LabelEvents } from '../../data/events/index.js';
import { drawNodes, elementGroups, labelDisplayManager } from '../../viewer/index.js';

// ロガー
const log = createLogger('elementRedrawer');

/**
 * 節点を再描画する。
 *
 * Node は立体/線表示モードを持たないため、通常の elementRedrawConfig ではなく
 * 比較結果から直接 drawNodes を呼び出す。これにより、初回ロード時に Node ラベルが
 * 未生成でも、ラベルチェックボックスの ON/OFF でラベルを作成・削除できる。
 *
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function redrawNodesForViewMode(scheduleRender) {
  const comparisonResults = getState('comparisonResults');
  const comparisonResult =
    comparisonResults instanceof Map ? comparisonResults.get('Node') : comparisonResults?.Node;
  const group = elementGroups.Node;

  if (!comparisonResult || !group) {
    log.warn('Cannot redraw Node: comparison result or group not found');
    if (scheduleRender) scheduleRender();
    return;
  }

  eventBus.emit(LabelEvents.REMOVE_BY_TYPE, 'Node');

  labelDisplayManager.syncWithCheckbox('Node');
  const createLabels = labelDisplayManager.isLabelVisible('Node');
  const modelBounds = getState('models.modelBounds');
  const createdLabels = drawNodes(comparisonResult, group, createLabels, modelBounds);

  const nodeDisplayCheckbox = document.getElementById('toggleNodeView');
  group.visible = nodeDisplayCheckbox ? nodeDisplayCheckbox.checked : true;

  if (createdLabels.length > 0) {
    eventBus.emit(LabelEvents.ADD_LABELS, createdLabels);
  }

  eventBus.emit(LabelEvents.UPDATE_VISIBILITY);
  if (scheduleRender) scheduleRender();
}

// ============================================================================
// ファクトリーパターンによる要素再描画関数の統一
// ============================================================================

/**
 * 要素タイプに基づいて再描画を実行する汎用関数
 * @param {string} elementType - 要素タイプ名
 * @param {Function} scheduleRender - 再描画要求関数
 * @param {boolean} [updateLabelsAfter=true] - ラベル更新を行うか
 * @param {boolean} [applyColorMode=true] - ソリッド描画後にカラーモードを適用するか
 */
export function redrawElementByType(
  elementType,
  scheduleRender,
  updateLabelsAfter = true,
  applyColorMode = true,
) {
  const config = getElementRedrawConfig(elementType);
  if (!config) {
    log.warn(`Unknown element type: ${elementType}`);
    return;
  }
  redrawElementForViewMode(config, scheduleRender, updateLabelsAfter, applyColorMode);
}

/**
 * ファクトリー関数: 要素タイプに対応する再描画関数を生成
 * @param {string} elementType - 要素タイプ名
 * @returns {Function} 再描画関数
 */
function createRedrawFunction(elementType) {
  return function (scheduleRender) {
    redrawElementByType(elementType, scheduleRender);
  };
}

// 後方互換性のためのエクスポート（設定ベースで生成）
export const redrawColumnsForViewMode = createRedrawFunction('Column');
export const redrawPostsForViewMode = createRedrawFunction('Post');
export const redrawBracesForViewMode = createRedrawFunction('Brace');
export const redrawIsolatingDevicesForViewMode = createRedrawFunction('IsolatingDevice');
export const redrawDampingDevicesForViewMode = createRedrawFunction('DampingDevice');
export const redrawFrameDampingDevicesForViewMode = createRedrawFunction('FrameDampingDevice');
export const redrawPilesForViewMode = createRedrawFunction('Pile');
export const redrawFootingsForViewMode = createRedrawFunction('Footing');
export const redrawFoundationColumnsForViewMode = createRedrawFunction('FoundationColumn');
export const redrawSlabsForViewMode = createRedrawFunction('Slab');
export const redrawWallsForViewMode = createRedrawFunction('Wall');
export const redrawParapetsForViewMode = createRedrawFunction('Parapet');
export const redrawStripFootingsForViewMode = createRedrawFunction('StripFooting');

/**
 * 梁の再描画処理（大梁と小梁の両方を処理 - 特殊ケース）
 * @param {Function} scheduleRender - 再描画要求関数
 * @param {boolean} [applyColorMode=true] - ソリッド描画後にカラーモードを適用するか
 */
export function redrawBeamsForViewMode(scheduleRender, applyColorMode = true) {
  // 大梁（Girder）を処理（ラベル更新はスキップ）
  redrawElementByType('Girder', scheduleRender, false, applyColorMode);
  // 小梁（Beam）を処理（ラベル更新を実行）
  redrawElementByType('Beam', scheduleRender, true, applyColorMode);
}

// Re-export from sub-modules for backward compatibility
export { redrawJointsForViewMode } from './elementRedrawSpecial.js';
export { redrawUndefinedElementsForViewMode } from './elementRedrawSpecial.js';

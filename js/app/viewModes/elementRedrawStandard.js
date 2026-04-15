/**
 * @fileoverview 標準要素の再描画関数
 *
 * ファクトリーパターンによる要素タイプ別再描画関数の生成と
 * 汎用の redrawElementByType 関数を提供します。
 */

import { createLogger } from '../../utils/logger.js';
import { getElementRedrawConfig } from '../../config/elementRedrawConfig.js';
import { redrawElementForViewMode } from './elementRedrawCore.js';

// ロガー
const log = createLogger('elementRedrawer');

// ============================================================================
// ファクトリーパターンによる要素再描画関数の統一
// ============================================================================

/**
 * 要素タイプに基づいて再描画を実行する汎用関数
 * @param {string} elementType - 要素タイプ名
 * @param {Function} scheduleRender - 再描画要求関数
 * @param {boolean} [updateLabelsAfter=true] - ラベル更新を行うか
 */
export function redrawElementByType(elementType, scheduleRender, updateLabelsAfter = true) {
  const config = getElementRedrawConfig(elementType);
  if (!config) {
    log.warn(`Unknown element type: ${elementType}`);
    return;
  }
  redrawElementForViewMode(config, scheduleRender, updateLabelsAfter);
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
 */
export function redrawBeamsForViewMode(scheduleRender) {
  // 大梁（Girder）を処理（ラベル更新はスキップ）
  redrawElementByType('Girder', scheduleRender, false);
  // 小梁（Beam）を処理（ラベル更新を実行）
  redrawElementByType('Beam', scheduleRender, true);
}

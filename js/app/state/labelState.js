/**
 * @fileoverview ラベル状態管理
 *
 * グローバルラベル状態を管理します。
 * ui/state.jsから独立させ、app層に配置することで
 * modelLoader層などの下位層からも安全に参照可能にします。
 *
 * @module app/state/labelState
 */

import { eventBus, ModelEvents } from '../events/index.js';

// --- ラベル状態 ---
let allLabels = [];

/**
 * 全ラベルを取得
 * @returns {Array} ラベルオブジェクトの配列
 */
export function getAllLabels() {
  return allLabels;
}

/**
 * 全ラベルを設定（既存のラベルを置換）
 * @param {Array} labels - 設定するラベルオブジェクトの配列
 */
export function setAllLabels(labels) {
  allLabels = labels || [];
  eventBus.emit(ModelEvents.LOADED, { labels: allLabels });
}

/**
 * 特定の要素タイプのラベルを削除
 * @param {string} elementType - 削除する要素タイプ
 */
export function removeLabelsForElementType(elementType) {
  allLabels = allLabels.filter(
    (label) => !label.userData || label.userData.elementType !== elementType
  );
}

/**
 * ラベルをグローバル状態に追加
 * @param {Array} labels - 追加するラベル
 */
export function addLabelsToGlobalState(labels) {
  if (Array.isArray(labels) && labels.length > 0) {
    allLabels.push(...labels);
  }
}

/**
 * 全ラベルをクリア
 */
export function clearAllLabels() {
  allLabels = [];
}

/**
 * ラベル数を取得
 * @returns {number} ラベル数
 */
export function getLabelCount() {
  return allLabels.length;
}

/**
 * @fileoverview 構造種別フィルタの状態管理
 *
 * 柱・梁等の構造種別（RC/S/SRC/CFT）による表示/非表示の状態を管理する。
 *
 * @module app/viewModes/structuralSystemFilter
 */

import { STRUCTURAL_SYSTEM_ELEMENT_TYPES } from '../../constants/structuralSystems.js';
import { resolveStructuralSystem } from '../../data/structuralSystemResolver.js';

/** @type {Set<string>} 非表示にされた「要素タイプ:構造種別」の組み合わせ */
const hiddenSystems = new Set();

/**
 * 指定した要素タイプ・構造種別の組み合わせが表示中かどうか
 *
 * @param {string} elementType - 要素タイプ（Column, Girder, Beam）
 * @param {string|null} structuralSystem - 構造種別（RC, S, SRC, CFT）
 * @returns {boolean} 表示中ならtrue
 */
export function isStructuralSystemVisible(elementType, structuralSystem) {
  if (!structuralSystem) return true;
  if (!STRUCTURAL_SYSTEM_ELEMENT_TYPES[elementType]) return true;
  return !hiddenSystems.has(`${elementType}:${structuralSystem}`);
}

/**
 * 構造種別の表示/非表示を設定
 *
 * @param {string} elementType - 要素タイプ
 * @param {string} structuralSystem - 構造種別
 * @param {boolean} visible - 表示するかどうか
 */
export function setStructuralSystemVisible(elementType, structuralSystem, visible) {
  const key = `${elementType}:${structuralSystem}`;
  if (visible) {
    hiddenSystems.delete(key);
  } else {
    hiddenSystems.add(key);
  }
}

/**
 * メッシュの構造種別フィルタによる可視性を判定
 *
 * @param {string} elementType - 要素タイプ
 * @param {Object} userData - メッシュのuserData
 * @returns {boolean} フィルタにより表示すべきならtrue
 */
export function isVisibleByStructuralFilter(elementType, userData) {
  if (!STRUCTURAL_SYSTEM_ELEMENT_TYPES[elementType]) return true;
  const system = resolveStructuralSystem(userData);
  return isStructuralSystemVisible(elementType, system);
}

/**
 * @fileoverview 依存性注入プロバイダー
 *
 * ElementInfoDisplayの依存関係を管理するDIコンテナモジュール。
 * パラメータエディター、サジェストエンジン、フローティングウィンドウマネージャー等の
 * 外部依存を注入・取得するためのインターフェースを提供します。
 */

/**
 * @typedef {Object} ElementInfoProviders
 * @property {Object} parameterEditor - パラメータエディター
 * @property {Object} suggestionEngine - 提案エンジン
 * @property {Object} floatingWindowManager - フローティングウィンドウ管理
 * @property {Function} getImportanceManager - 重要度管理取得関数
 * @property {Function} evaluateSectionEquivalence - 断面等価性評価関数
 * @property {Function} updateLabelsForElement - ラベル更新関数
 */

/** @type {ElementInfoProviders|null} */
let providers = null;

/**
 * 依存プロバイダーを設定（依存性注入）
 * @param {ElementInfoProviders} deps - 依存プロバイダー
 */
export function setElementInfoProviders(deps) {
  providers = deps;
}

/**
 * パラメータエディターを取得
 * @returns {Object|null} パラメータエディター
 */
export function getParameterEditor() {
  return providers?.parameterEditor || null;
}

/**
 * サジェストエンジンを取得
 * @returns {Object|null} サジェストエンジン
 */
export function getSuggestionEngine() {
  return providers?.suggestionEngine || null;
}

/**
 * フローティングウィンドウマネージャーを取得
 * @returns {Object|null} フローティングウィンドウマネージャー
 */
export function getFloatingWindowManager() {
  return providers?.floatingWindowManager || null;
}

/**
 * 重要度マネージャーを取得
 * @returns {Object|null} 重要度マネージャー
 */
export function getImportanceManager() {
  return providers?.getImportanceManager?.() || null;
}

/**
 * 断面等価性を評価
 * @param {Object} sectionA - モデルAの断面データ
 * @param {Object} sectionB - モデルBの断面データ
 * @param {string} elementType - 要素タイプ
 * @returns {Object|null} 評価結果
 */
export function evaluateSectionEquivalence(sectionA, sectionB, elementType) {
  return providers?.evaluateSectionEquivalence?.(sectionA, sectionB, elementType) || null;
}

/**
 * 要素のラベルを更新
 * @param {string} elementType - 要素タイプ
 * @param {string} elementId - 要素ID
 * @param {Object} elementData - 要素データ
 * @returns {boolean} 更新成功可否
 */
export function updateLabelsForElement(elementType, elementId, elementData) {
  return providers?.updateLabelsForElement?.(elementType, elementId, elementData) || false;
}


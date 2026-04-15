/**
 * @fileoverview 比較コントローラー
 *
 * 比較機能（comparison層、comparator）へのFacadeを提供します。
 * UI層が比較ドメイン層に直接依存することを防ぎます。
 *
 * @module app/controllers/comparisonController
 */

import {
  generateVersionDifferenceSummary,
  generateImportanceSummary,
  updateComparisonResultImportance,
} from '../../common-stb/comparison/index.js';
import { getImportanceManager } from '../importanceManager.js';

/**
 * 比較コントローラー
 * 比較機能への統一的なインターフェースを提供
 */
export const comparisonController = {
  /**
   * バージョン差分のサマリーを生成
   * @param {Object} comparisonResult - 比較結果
   * @returns {Object} バージョン差分サマリー
   */
  getVersionDifferenceSummary(comparisonResult) {
    return generateVersionDifferenceSummary(comparisonResult);
  },

  /**
   * 重要度のサマリーを生成
   * @param {Array<Object>} comparisonResults - 比較結果配列
   * @returns {Object} 重要度サマリー
   */
  getImportanceSummary(comparisonResults) {
    return generateImportanceSummary(comparisonResults);
  },

  /**
   * 比較結果の重要度を更新
   * @param {Object} comparisonResult - 比較結果
   * @param {string} elementType - 要素タイプ
   * @param {Function} [importanceLookup] - 重要度判定関数
   * @returns {Object} 更新後の比較結果
   */
  updateImportance(comparisonResult, elementType, importanceLookup = null) {
    const manager = getImportanceManager();
    const resolvedLookup =
      typeof importanceLookup === 'function'
        ? importanceLookup
        : (element, targetElementType) => manager.getElementImportance(element, targetElementType);

    return updateComparisonResultImportance(comparisonResult, elementType, resolvedLookup);
  },
};

export default comparisonController;

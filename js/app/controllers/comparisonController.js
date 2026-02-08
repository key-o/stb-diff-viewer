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

/**
 * 比較コントローラー
 * 比較機能への統一的なインターフェースを提供
 */
export const comparisonController = {
  /**
   * バージョン差分のサマリーを生成
   * @param {Object} model1 - 比較元モデル
   * @param {Object} model2 - 比較先モデル
   * @returns {Object} バージョン差分サマリー
   */
  getVersionDifferenceSummary(model1, model2) {
    return generateVersionDifferenceSummary(model1, model2);
  },

  /**
   * 重要度のサマリーを生成
   * @param {Object} comparisonResult - 比較結果
   * @returns {Object} 重要度サマリー
   */
  getImportanceSummary(comparisonResult) {
    return generateImportanceSummary(comparisonResult);
  },

  /**
   * 比較結果の重要度を更新
   * @param {Object} comparisonResult - 比較結果
   * @param {string} nodeId - ノードID
   * @param {string} importance - 重要度
   * @returns {Object} 更新後の比較結果
   */
  updateImportance(comparisonResult, nodeId, importance) {
    return updateComparisonResultImportance(comparisonResult, nodeId, importance);
  },
};

export default comparisonController;

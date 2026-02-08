/**
 * @fileoverview レンダリングコントローラー
 *
 * レンダリング機能（rendering層）へのFacadeを提供します。
 * UI層がレンダリングインフラ層に直接依存することを防ぎます。
 *
 * @module app/controllers/renderingController
 */

import { colorManager, labelDisplayManager, createLabelSprite } from '../../viewer/index.js';

/**
 * レンダリングコントローラー
 * レンダリング機能への統一的なインターフェースを提供
 */
export const renderingController = {
  /**
   * カラーモードを設定
   * @param {string} mode - カラーモード
   */
  setColorMode(mode) {
    colorManager.setColorMode(mode);
  },

  /**
   * カラーマネージャーを取得
   * @returns {Object} カラーマネージャー
   */
  getColorManager() {
    return colorManager;
  },

  /**
   * 許容差状態の色を取得
   * @param {string} state - 許容差状態
   * @returns {string} カラーコード
   */
  getToleranceDiffColor(state) {
    return colorManager.getToleranceDiffColor(state);
  },

  /**
   * 許容差状態の色を設定
   * @param {string} state - 許容差状態
   * @param {string} color - カラーコード
   */
  setToleranceDiffColor(state, color) {
    colorManager.setToleranceDiffColor(state, color);
  },

  /**
   * ラベル表示の可視性を設定
   * @param {string} type - ラベルタイプ
   * @param {boolean} visible - 表示/非表示
   */
  setLabelVisibility(type, visible) {
    labelDisplayManager.setLabelVisibility(type, visible);
  },

  /**
   * ラベルディスプレイマネージャーを取得
   * @returns {Object} ラベルディスプレイマネージャー
   */
  getLabelDisplayManager() {
    return labelDisplayManager;
  },

  /**
   * ラベルスプライトを再生成
   * @param {string} labelText - ラベルテキスト
   * @param {Object} basePosition - 基準位置
   * @param {Object} relativeNode - 相対ノード
   * @param {string} elementType - 要素タイプ
   * @returns {Object} ラベルスプライト
   */
  regenerateLabel(labelText, basePosition, relativeNode, elementType) {
    return createLabelSprite(labelText, basePosition, relativeNode, elementType);
  },
};

export default renderingController;

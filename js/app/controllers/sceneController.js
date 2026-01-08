/**
 * @fileoverview シーンコントローラー
 *
 * 3Dシーン操作（viewer層）へのFacadeを提供します。
 * UI層がviewerインフラ層に直接依存することを防ぎます。
 *
 * @module app/controllers/sceneController
 */

import {
  elementGroups,
  controls,
  applyClipPlanes,
  clearClippingPlanes,
} from '../../viewer/index.js';

/**
 * シーンコントローラー
 * 3Dシーン操作への統一的なインターフェースを提供
 */
export const sceneController = {
  /**
   * エレメントグループを取得
   * @returns {Object} エレメントグループ
   */
  getElementGroups() {
    return elementGroups;
  },

  /**
   * カメラコントロールを取得
   * @returns {Object} カメラコントロール
   */
  getCameraControls() {
    return controls;
  },

  /**
   * クリッピングプレーンを適用
   * @param {Array} planes - クリッピングプレーン配列
   */
  applyClipping(planes) {
    applyClipPlanes(planes);
  },

  /**
   * クリッピングプレーンをクリア
   */
  clearClipping() {
    clearClippingPlanes();
  },
};

export default sceneController;

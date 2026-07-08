/**
 * @fileoverview モデルコンテキスト保持モジュール
 *
 * 表示モード処理が参照するモデルデータ（境界、ドキュメント、ノードマップ）を
 * 保持します。displayModeController と elementRedraw 系モジュールの
 * 循環依存を解消するために分離されています。
 */

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
 * モデルコンテキストを設定
 * @param {Object} modelData - モデルデータ参照
 */
export function setModelContext(modelData) {
  modelBounds = modelData.modelBounds;
  modelADocument = modelData.modelADocument;
  modelBDocument = modelData.modelBDocument;
  nodeMapA = modelData.nodeMapA;
  nodeMapB = modelData.nodeMapB;
}

/**
 * モデルコンテキストをクリア
 */
export function clearModelContext() {
  modelBounds = null;
  modelADocument = null;
  modelBDocument = null;
  nodeMapA = null;
  nodeMapB = null;
}

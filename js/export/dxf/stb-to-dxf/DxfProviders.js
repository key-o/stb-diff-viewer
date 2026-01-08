/**
 * @fileoverview DXFエクスポーター依存性注入プロバイダー
 *
 * 外部依存性（カメラ、シーン、クリッピング等）へのアクセスを
 * 依存性注入パターンで提供します。
 */

import * as THREE from 'three';

// プロバイダー
let providers = {
  getOrthographicCamera: null,
  getActiveCamera: null,
  getElementGroups: null,
  getCurrentClippingState: null,
  getCurrentStories: null,
  getCurrentAxesData: null,
  applyStoryClip: null,
  applyAxisClip: null,
  clearAllClippingPlanes: null,
  getLoadedFilename: null,
};

/**
 * DXFエクスポーターのプロバイダーを設定
 * @param {Object} deps - 依存性オブジェクト
 */
export function setDxfExporterProviders(deps) {
  providers = { ...providers, ...deps };
}

// 内部ヘルパー関数群

/**
 * 直交カメラを取得
 * @returns {THREE.OrthographicCamera|null}
 */
export function getOrthographicCameraInternal() {
  return providers.getOrthographicCamera?.() || null;
}

/**
 * アクティブカメラを取得
 * @returns {THREE.Camera|null}
 */
export function getActiveCameraInternal() {
  return providers.getActiveCamera?.() || null;
}

/**
 * 要素グループを取得
 * @returns {Object}
 */
export function getElementGroupsInternal() {
  return providers.getElementGroups?.() || {};
}

/**
 * 現在のクリッピング状態を取得
 * @returns {Object|null}
 */
export function getCurrentClippingStateInternal() {
  return providers.getCurrentClippingState?.() || null;
}

/**
 * 現在の階データを取得
 * @returns {Array|null}
 */
export function getCurrentStoriesInternal() {
  return providers.getCurrentStories?.() || null;
}

/**
 * 現在の通り芯データを取得
 * @returns {Object|null}
 */
export function getCurrentAxesDataInternal() {
  return providers.getCurrentAxesData?.() || null;
}

/**
 * 階クリッピングを適用
 * @param {string} storyId - 階ID
 * @param {number} [range] - 範囲
 */
export function applyStoryClipInternal(storyId, range) {
  if (providers.applyStoryClip) {
    providers.applyStoryClip(storyId, range);
  }
}

/**
 * 通り芯クリッピングを適用
 * @param {string} direction - 方向（'X' or 'Y'）
 * @param {string} axisId - 通り芯ID
 * @param {number} [range] - 範囲
 */
export function applyAxisClipInternal(direction, axisId, range) {
  if (providers.applyAxisClip) {
    providers.applyAxisClip(direction, axisId, range);
  }
}

/**
 * すべてのクリッピングプレーンをクリア
 */
export function clearAllClippingPlanesInternal() {
  if (providers.clearAllClippingPlanes) {
    providers.clearAllClippingPlanes();
  }
}

/**
 * 読み込みファイル名を取得
 * @returns {string}
 */
export function getLoadedFilenameInternal() {
  return providers.getLoadedFilename?.() || 'stb_export';
}

// エクスポート可能な要素タイプ
export const EXPORTABLE_ELEMENT_TYPES = [
  'Column',
  'Post',
  'Girder',
  'Beam',
  'Brace',
  'Slab',
  'Wall',
  'Footing',
  'StripFooting',
  'Pile',
  'Parapet',
  'Node',
];

// 要素タイプごとのDXFレイヤー色（ACI: AutoCAD Color Index）
export const ELEMENT_TYPE_COLORS = {
  Column: 1, // 赤
  Post: 1, // 赤
  Girder: 3, // 緑
  Beam: 3, // 緑
  Brace: 5, // 青
  Slab: 4, // シアン
  Wall: 6, // マゼンタ
  Footing: 8, // グレー
  StripFooting: 8, // グレー
  Pile: 8, // グレー
  Parapet: 30, // オレンジ
  Node: 7, // 白/黒
  Axis: 2, // 黄色
  Level: 2, // 黄色
  Label: 7, // 白/黒
};

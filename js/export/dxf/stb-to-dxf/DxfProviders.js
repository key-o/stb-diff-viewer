/**
 * @fileoverview DXFエクスポーター依存性注入プロバイダー
 *
 * 外部依存性（カメラ、シーン、クリッピング等）へのアクセスを
 * 依存性注入パターンで提供します。
 */

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
 * @returns {Promise<void>}
 */
export async function applyStoryClipInternal(storyId, range) {
  if (providers.applyStoryClip) {
    await providers.applyStoryClip(storyId, range);
  }
}

/**
 * 通り芯クリッピングを適用
 * @param {string} direction - 方向（'X' or 'Y'）
 * @param {string} axisId - 通り芯ID
 * @param {number} [range] - 範囲
 * @returns {Promise<void>}
 */
export async function applyAxisClipInternal(direction, axisId, range) {
  if (providers.applyAxisClip) {
    await providers.applyAxisClip(direction, axisId, range);
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

// 定数は constants/ 層で定義し、後方互換性のため再エクスポート
export {
  EXPORTABLE_ELEMENT_TYPES,
  ELEMENT_TYPE_COLORS,
} from '../../../constants/dxfElementTypes.js';

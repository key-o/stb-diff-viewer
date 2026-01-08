/**
 * @fileoverview 許容差設定管理モジュール
 *
 * このファイルは、要素比較時の許容差設定を管理します：
 * - 基準点(StbNode)座標の許容差
 * - オフセット値の許容差
 * - 許容差機能の有効/無効切り替え
 * - 厳密モード（完全一致のみ）の設定
 */

import { storageHelper } from '../utils/storageHelper.js';

/**
 * 許容差設定のデフォルト値
 * @type {Object}
 */
export const DEFAULT_TOLERANCE_CONFIG = {
  // 基準点(StbNode)座標の許容差 (mm)
  basePoint: {
    x: 10.0,
    y: 10.0,
    z: 10.0,
  },

  // オフセット値の許容差 (mm)
  offset: {
    x: 5.0,
    y: 5.0,
    z: 5.0,
  },

  // 許容差機能の有効/無効
  enabled: true,

  // 厳密モード（許容差を使用しない）
  strictMode: false,
};

// StorageHelperのキー
const STORAGE_KEY = 'toleranceConfig';

/**
 * storageHelperから設定を読み込む
 * @returns {Object|null} 保存された設定、または存在しない場合はnull
 */
function loadConfigFromStorage() {
  return storageHelper.get(STORAGE_KEY);
}

/**
 * storageHelperに設定を保存する
 * @param {Object} config - 保存する設定
 */
function saveConfigToStorage(config) {
  storageHelper.set(STORAGE_KEY, config);
}

/**
 * 現在の許容差設定を保持
 * @type {Object}
 */
let currentToleranceConfig = loadConfigFromStorage() || { ...DEFAULT_TOLERANCE_CONFIG };

/**
 * 許容差設定を取得
 * @returns {Object} 現在の許容差設定のコピー
 */
export function getToleranceConfig() {
  return {
    ...currentToleranceConfig,
    basePoint: { ...currentToleranceConfig.basePoint },
    offset: { ...currentToleranceConfig.offset },
  };
}

/**
 * 許容差設定を更新
 * @param {Object} config - 新しい設定（部分的な更新も可能）
 */
export function setToleranceConfig(config) {
  if (config.basePoint) {
    currentToleranceConfig.basePoint = {
      ...currentToleranceConfig.basePoint,
      ...config.basePoint,
    };
  }

  if (config.offset) {
    currentToleranceConfig.offset = {
      ...currentToleranceConfig.offset,
      ...config.offset,
    };
  }

  if (typeof config.enabled === 'boolean') {
    currentToleranceConfig.enabled = config.enabled;
  }

  if (typeof config.strictMode === 'boolean') {
    currentToleranceConfig.strictMode = config.strictMode;
  }

  // LocalStorageに保存
  saveConfigToStorage(currentToleranceConfig);
}

/**
 * 許容差設定をリセット
 */
export function resetToleranceConfig() {
  currentToleranceConfig = {
    basePoint: { ...DEFAULT_TOLERANCE_CONFIG.basePoint },
    offset: { ...DEFAULT_TOLERANCE_CONFIG.offset },
    enabled: DEFAULT_TOLERANCE_CONFIG.enabled,
    strictMode: DEFAULT_TOLERANCE_CONFIG.strictMode,
  };

  // LocalStorageに保存
  saveConfigToStorage(currentToleranceConfig);
}

/**
 * 許容差設定の検証
 * @param {Object} config - 検証する設定
 * @returns {{valid: boolean, errors: string[]}} 検証結果
 */
export function validateToleranceConfig(config) {
  const errors = [];

  // 基準点の検証
  if (config.basePoint) {
    if (typeof config.basePoint.x !== 'number' || config.basePoint.x < 0) {
      errors.push('basePoint.x must be a non-negative number');
    }
    if (typeof config.basePoint.y !== 'number' || config.basePoint.y < 0) {
      errors.push('basePoint.y must be a non-negative number');
    }
    if (typeof config.basePoint.z !== 'number' || config.basePoint.z < 0) {
      errors.push('basePoint.z must be a non-negative number');
    }
  }

  // オフセットの検証
  if (config.offset) {
    if (typeof config.offset.x !== 'number' || config.offset.x < 0) {
      errors.push('offset.x must be a non-negative number');
    }
    if (typeof config.offset.y !== 'number' || config.offset.y < 0) {
      errors.push('offset.y must be a non-negative number');
    }
    if (typeof config.offset.z !== 'number' || config.offset.z < 0) {
      errors.push('offset.z must be a non-negative number');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

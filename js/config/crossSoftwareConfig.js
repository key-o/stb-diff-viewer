/**
 * @fileoverview 異ソフト間比較モードの設定
 *
 * 「同一建物を別ソフトで出力したSTB」同士の比較を支援するモードの設定を管理する。
 * 有効時は断面定義の対応付けで階（floor）を StbStory の標高/順序に基づき正準化し、
 * 階名の表記差（`1` / `1FL` / `Z01` 等）を吸収する。
 *
 * 既定は無効（既存の比較挙動を変更しない）。
 * 検証根拠: docs/reports/cross-software-match-benchmark.md（A4 階対応）
 */

export const DEFAULT_CROSS_SOFTWARE_CONFIG = {
  /** 異ソフト間比較モードの有効化 */
  enabled: false,
};

let currentConfig = { ...DEFAULT_CROSS_SOFTWARE_CONFIG };

/**
 * 現在の異ソフト間比較設定を取得する
 * @returns {{enabled: boolean}} 設定のコピー
 */
export function getCrossSoftwareConfig() {
  return { ...currentConfig };
}

/**
 * 異ソフト間比較設定を更新する（部分更新可）
 * @param {Partial<typeof DEFAULT_CROSS_SOFTWARE_CONFIG>} config
 */
export function setCrossSoftwareConfig(config) {
  if (!config || typeof config !== 'object') return;
  if (typeof config.enabled === 'boolean') {
    currentConfig.enabled = config.enabled;
  }
}

/**
 * 設定を既定値に戻す
 */
export function resetCrossSoftwareConfig() {
  currentConfig = { ...DEFAULT_CROSS_SOFTWARE_CONFIG };
}

/**
 * 異ソフト間比較モードが有効かどうか
 * @returns {boolean}
 */
export function isCrossSoftwareModeEnabled() {
  return currentConfig.enabled;
}

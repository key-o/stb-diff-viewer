/**
 * テーマシステム
 *
 * UI品質を安定させるため、アプリのテーマはライトに固定します。
 */

/** @type {Function|null} */
let onThemeChangeCallback = null;

/**
 * テーマシステムを初期化
 * @param {Object} [options] - オプション
 * @param {Function} [options.onThemeChange] - テーマ変更時のコールバック
 */
export function initializeTheme(options = {}) {
  onThemeChangeCallback = options.onThemeChange || null;
  applyTheme();
}

/**
 * テーマを適用
 * @private
 */
function applyTheme() {
  document.documentElement.removeAttribute('data-theme');

  if (onThemeChangeCallback) {
    onThemeChangeCallback('light', 'light');
  }
}

/**
 * 現在のテーマ設定を取得
 * @returns {'light'}
 */
export function getThemeSetting() {
  return 'light';
}

/**
 * テーマ設定を変更
 * @param {string} _setting - テーマ設定（現在はライト固定）
 */
export function setThemeSetting(_setting) {
  applyTheme();
}

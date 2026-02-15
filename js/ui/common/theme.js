/**
 * テーマシステム
 *
 * ダークテーマとライトテーマの切り替え機能を提供
 * - システム設定に従う自動切り替え
 * - 手動切り替え
 * - 設定の永続化（storageHelper経由）
 */

import { storageHelper } from '../../utils/storageHelper.js';

/** @type {'light' | 'dark' | 'system'} */
let currentThemeSetting = 'system';

/** @type {MediaQueryList|null} */
let systemThemeQuery = null;

/** @type {Function|null} */
let onThemeChangeCallback = null;

/**
 * テーマシステムを初期化
 * @param {Object} [options] - オプション
 * @param {Function} [options.onThemeChange] - テーマ変更時のコールバック
 */
export function initializeTheme(options = {}) {
  onThemeChangeCallback = options.onThemeChange || null;

  // システムテーマの変更を監視
  if (window.matchMedia) {
    systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    systemThemeQuery.addEventListener('change', handleSystemThemeChange);
  }

  // 保存された設定を読み込み
  const savedSetting = storageHelper.get('theme-setting');
  if (savedSetting && ['light', 'dark', 'system'].includes(savedSetting)) {
    currentThemeSetting = savedSetting;
  }

  // テーマを適用
  applyTheme();
}

/**
 * システムテーマ変更ハンドラ
 * @private
 */
function handleSystemThemeChange() {
  if (currentThemeSetting === 'system') {
    applyTheme();
  }
}

/**
 * テーマを適用
 * @private
 */
function applyTheme() {
  const effectiveTheme = getEffectiveTheme();

  // data-theme属性を設定
  if (effectiveTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }

  // コールバックを呼び出し
  if (onThemeChangeCallback) {
    onThemeChangeCallback(effectiveTheme, currentThemeSetting);
  }
}

/**
 * 実際に適用されるテーマを取得
 * @returns {'light' | 'dark'}
 */
function getEffectiveTheme() {
  if (currentThemeSetting === 'system') {
    return systemThemeQuery?.matches ? 'dark' : 'light';
  }
  return currentThemeSetting;
}

/**
 * 現在のテーマ設定を取得
 * @returns {'light' | 'dark' | 'system'}
 */
export function getThemeSetting() {
  return currentThemeSetting;
}

/**
 * テーマ設定を変更
 * @param {'light' | 'dark' | 'system'} setting - テーマ設定
 */
export function setThemeSetting(setting) {
  if (!['light', 'dark', 'system'].includes(setting)) {
    console.warn(`Invalid theme setting: ${setting}`);
    return;
  }

  currentThemeSetting = setting;
  storageHelper.set('theme-setting', setting);
  applyTheme();
}

/**
 * ライト/ダークのみをトグル
 */
function toggleLightDark() {
  const current = getEffectiveTheme();
  setThemeSetting(current === 'light' ? 'dark' : 'light');
}


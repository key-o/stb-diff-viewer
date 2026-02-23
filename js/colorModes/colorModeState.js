/**
 * @fileoverview 色付けモード状態管理モジュール
 *
 * COLOR_MODES定数と現在のカラーモード状態を管理します。
 * viewer層やUI層への依存を持たない純粋な状態モジュールです。
 * colorModes/colorModeManager.js と viewer/rendering/materials.js の
 * 循環依存を解消するために分離されています。
 *
 * @module colorModes/colorModeState
 */

// 色付けモードの定数
export const COLOR_MODES = {
  DIFF: 'diff',
  ELEMENT: 'element',
  SCHEMA: 'schema',
  IMPORTANCE: 'importance',
};

// 現在の色付けモード
let currentColorMode = COLOR_MODES.DIFF;

/**
 * 現在の色付けモードを取得
 * @returns {string} 現在の色付けモード
 */
export function getCurrentColorMode() {
  return currentColorMode;
}

/**
 * 現在の色付けモードを内部的に設定（colorModeManagerから呼ばれる）
 * @param {string} mode 設定する色付けモード
 */
export function setCurrentColorModeInternal(mode) {
  currentColorMode = mode;
}

/**
 * 全要素に指定した色付けモードを適用するラッパー関数を生成するファクトリ
 *
 * @param {string} modeName - applyColorModeToAllObjects に渡すモード名
 * @returns {Function} 引数なしのラッパー関数
 */
export function createApplyColorMode(modeName) {
  return function () {
    import('./index.js').then(({ applyColorModeToAllObjects }) => {
      applyColorModeToAllObjects(modeName);
    });
  };
}

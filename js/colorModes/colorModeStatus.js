/**
 * @fileoverview 色付けモード状況メッセージ表示モジュール
 *
 * 色付けモードの状況メッセージをUIに表示します。
 * colorModeManager と schemaColorMode の循環依存を解消するために
 * 分離されています。
 *
 * @module colorModes/colorModeStatus
 */

/**
 * 色付けモード状況メッセージを表示
 * @param {string} message - 表示するメッセージ
 * @param {number} duration - 表示時間（ミリ秒、0で自動非表示なし）
 */
export function showColorModeStatus(message, duration = 5000) {
  const statusElement = document.getElementById('color-mode-status');
  const textElement = document.getElementById('color-mode-status-text');

  if (statusElement && textElement) {
    textElement.textContent = message;
    statusElement.classList.remove('hidden');

    if (duration > 0) {
      setTimeout(() => {
        statusElement.classList.add('hidden');
      }, duration);
    }
  }
}

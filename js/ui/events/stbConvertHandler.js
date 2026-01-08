/**
 * @fileoverview STBバージョン変換ハンドラ
 *
 * UIからSTBファイルのバージョン変換機能を提供します。
 * STB 2.0.2 ⇔ STB 2.1.0 の双方向変換をサポートします。
 *
 * @module StbDiffViewer/ui/events/stbConvertHandler
 */

import { convert, detectVersion } from '../../utils/stb-converter/index.js';
import { showSuccess, showError, showInfo } from '../toast.js';
import { getState, addStateListener } from '../../app/globalState.js';

/**
 * ファイルをダウンロードするヘルパー関数
 * @param {string} content - ファイル内容
 * @param {string} filename - ファイル名
 * @param {string} mimeType - MIMEタイプ
 */
function downloadFile(content, filename, mimeType = 'application/xml') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 変換後のファイル名を生成
 * @param {string} originalName - 元のファイル名
 * @param {string} targetVersion - 変換先バージョン
 * @returns {string} 新しいファイル名
 */
function generateOutputFilename(originalName, targetVersion) {
  const baseName = originalName.replace(/\.(stb|xml)$/i, '');
  const versionSuffix = targetVersion === '2.1.0' ? '_v210' : '_v202';
  return `${baseName}${versionSuffix}.stb`;
}

/**
 * ステータス表示を更新
 * @param {HTMLElement} statusEl - ステータス表示要素
 * @param {string} message - メッセージ
 * @param {string} type - タイプ ('info' | 'success' | 'error')
 */
function updateStatus(statusEl, message, type = 'info') {
  statusEl.textContent = message;
  statusEl.className = `stb-convert-status ${type}`;
}

/**
 * ステータス表示を非表示にする
 * @param {HTMLElement} statusEl - ステータス表示要素
 */
function hideStatus(statusEl) {
  statusEl.classList.add('hidden');
}

/**
 * STB変換を実行
 * @param {File} file - 変換元ファイル
 * @param {string} targetVersion - 変換先バージョン ('2.0.2' | '2.1.0')
 * @param {HTMLElement} statusEl - ステータス表示要素
 */
async function performConversion(file, targetVersion, statusEl) {
  try {
    // ステータス表示
    statusEl.classList.remove('hidden');
    updateStatus(statusEl, `${file.name} を読み込み中...`, 'info');

    // ファイル読み込み
    const xmlContent = await file.text();

    // バージョン検出
    const currentVersion = await detectVersion(xmlContent);
    if (!currentVersion) {
      updateStatus(statusEl, 'STBバージョンを検出できませんでした', 'error');
      showError('STBバージョンを検出できませんでした');
      return;
    }

    // 同じバージョンのチェック
    const normalizedCurrent = normalizeVersion(currentVersion);
    const normalizedTarget = normalizeVersion(targetVersion);

    if (normalizedCurrent === normalizedTarget) {
      updateStatus(statusEl, `既にバージョン ${targetVersion} です`, 'info');
      showInfo(`ファイルは既にバージョン ${targetVersion} です`);
      return;
    }

    // 変換方向のチェック
    if (targetVersion === '2.1.0' && normalizedCurrent !== '2.0.2') {
      updateStatus(
        statusEl,
        `2.0.2 以外からの変換はサポートされていません (検出: ${currentVersion})`,
        'error',
      );
      showError(`バージョン ${currentVersion} からの変換はサポートされていません`);
      return;
    }

    if (targetVersion === '2.0.2' && normalizedCurrent !== '2.1.0') {
      updateStatus(
        statusEl,
        `2.1.0 以外からの変換はサポートされていません (検出: ${currentVersion})`,
        'error',
      );
      showError(`バージョン ${currentVersion} からの変換はサポートされていません`);
      return;
    }

    updateStatus(statusEl, `${currentVersion} → ${targetVersion} に変換中...`, 'info');

    // 変換実行
    const result = await convert(xmlContent, targetVersion);

    if (!result.converted) {
      updateStatus(statusEl, '変換の必要がありませんでした', 'info');
      showInfo('変換の必要がありませんでした');
      return;
    }

    // ファイル名生成とダウンロード
    const outputFilename = generateOutputFilename(file.name, targetVersion);
    downloadFile(result.xml, outputFilename);

    // 成功メッセージ
    const summary = result.summary || {};
    const warnCount = summary.warnings || 0;

    let successMessage = `変換完了: ${outputFilename}`;
    if (warnCount > 0) {
      successMessage += ` (警告: ${warnCount}件)`;
    }

    updateStatus(statusEl, successMessage, 'success');
    showSuccess(successMessage);

    // 詳細ログ（コンソール）
    console.log('[STB Convert] Conversion result:', {
      source: file.name,
      sourceVersion: result.sourceVersion,
      targetVersion: result.targetVersion,
      output: outputFilename,
      summary: result.summary,
    });
  } catch (error) {
    console.error('[STB Convert] Error:', error);
    updateStatus(statusEl, `エラー: ${error.message}`, 'error');
    showError(`変換エラー: ${error.message}`);
  }
}

/**
 * バージョン文字列を正規化
 * @param {string} version - バージョン文字列
 * @returns {string} 正規化されたバージョン
 */
function normalizeVersion(version) {
  const v = version.toLowerCase().replace(/^v/, '');
  if (v === '202' || v === '2.0' || v.startsWith('2.0.')) return '2.0.2';
  if (v === '210' || v === '2.1' || v.startsWith('2.1.')) return '2.1.0';
  return v;
}

/**
 * STB変換イベントリスナーをセットアップ
 */
export function setupStbConvertListeners() {
  const convertTo210Btn = document.getElementById('convertTo210Btn');
  const convertTo202Btn = document.getElementById('convertTo202Btn');
  const statusEl = document.getElementById('stbConvertStatus');

  if (!convertTo210Btn || !convertTo202Btn || !statusEl) {
    console.warn('[STB Convert] Required elements not found');
    return;
  }

  /**
   * ボタンの有効/無効を更新する関数
   */
  function updateButtonState() {
    const fileA = getState('files.originalFileA');
    const isEnabled = !!fileA;
    convertTo210Btn.disabled = !isEnabled;
    convertTo202Btn.disabled = !isEnabled;
  }

  // モデルロード状態の監視
  addStateListener('files.originalFileA', updateButtonState);

  // 初期状態を設定
  updateButtonState();

  // 2.1.0 変換ボタン
  convertTo210Btn.addEventListener('click', async () => {
    const file = getState('files.originalFileA');
    if (!file) return;
    hideStatus(statusEl);
    await performConversion(file, '2.1.0', statusEl);
  });

  // 2.0.2 変換ボタン
  convertTo202Btn.addEventListener('click', async () => {
    const file = getState('files.originalFileA');
    if (!file) return;
    hideStatus(statusEl);
    await performConversion(file, '2.0.2', statusEl);
  });

  console.log('[STB Convert] Event listeners initialized');
}

export default setupStbConvertListeners;

/**
 * @fileoverview バッチエクスポートUI
 *
 * 全階・全通り芯のDXF一括エクスポート機能のUI管理を担当します。
 */

import { createLogger } from '../utils/logger.js';
import {
  canExportStbToDxf,
  exportAllStoriesToDxf,
  exportAlongAllAxesToDxf,
  exportAlongAllAxesBothDirections,
  getAvailableStories,
  getAvailableAxes,
} from '../export/dxf/stb-to-dxf/index.js';
import { showError, showWarning } from './dxfLoaderHelpers.js';

const log = createLogger('DXFLoader');

// 選択された要素タイプを取得するコールバック（循環依存回避のため遅延設定）
let _getSelectedStbExportTypes = /** @type {() => string[]} */ (() => []);

/**
 * 選択された要素タイプ取得関数を設定
 * @param {Function} getter - 選択された要素タイプの配列を返す関数
 */
export function setSelectedStbExportTypesGetter(getter) {
  _getSelectedStbExportTypes = /** @type {() => string[]} */ (getter);
}

/**
 * 選択された要素タイプを取得（内部用ラッパー）
 * @returns {Array<string>}
 */
function getSelectedStbExportTypes() {
  return _getSelectedStbExportTypes();
}

/**
 * 連続出力ボタンを初期化
 */
export function initBatchExportButtons() {
  // 全階出力ボタン
  const exportAllStoriesBtn = document.getElementById('exportAllStoriesDxfBtn');
  if (exportAllStoriesBtn) {
    exportAllStoriesBtn.addEventListener('click', handleExportAllStories);
  }

  // X通り芯出力ボタン
  const exportAllXAxesBtn = document.getElementById('exportAllXAxesDxfBtn');
  if (exportAllXAxesBtn) {
    exportAllXAxesBtn.addEventListener('click', () => handleExportAllAxes('X'));
  }

  // Y通り芯出力ボタン
  const exportAllYAxesBtn = document.getElementById('exportAllYAxesDxfBtn');
  if (exportAllYAxesBtn) {
    exportAllYAxesBtn.addEventListener('click', () => handleExportAllAxes('Y'));
  }

  // 全通り芯出力ボタン
  const exportAllAxesBtn = document.getElementById('exportAllAxesDxfBtn');
  if (exportAllAxesBtn) {
    exportAllAxesBtn.addEventListener('click', handleExportAllAxesBoth);
  }
}

/**
 * 連続出力ボタンの有効/無効を更新
 */
export function updateBatchExportButtons() {
  const { canExport } = canExportStbToDxf();
  const stories = getAvailableStories();
  const axes = getAvailableAxes();

  const exportAllStoriesBtn = document.getElementById('exportAllStoriesDxfBtn');
  const exportAllXAxesBtn = document.getElementById('exportAllXAxesDxfBtn');
  const exportAllYAxesBtn = document.getElementById('exportAllYAxesDxfBtn');
  const exportAllAxesBtn = document.getElementById('exportAllAxesDxfBtn');

  // 全階出力ボタン
  if (exportAllStoriesBtn) {
    const hasStories = stories && stories.length > 0;
    exportAllStoriesBtn.disabled = !canExport || !hasStories;
    exportAllStoriesBtn.title = hasStories
      ? `${stories.length}階分のDXFを出力`
      : '階データがありません';
  }

  // X通り芯出力ボタン
  if (exportAllXAxesBtn) {
    const hasXAxes = axes && axes.xAxes && axes.xAxes.length > 0;
    exportAllXAxesBtn.disabled = !canExport || !hasXAxes;
    exportAllXAxesBtn.title = hasXAxes
      ? `${axes.xAxes.length}通り分のDXFを出力`
      : 'X通り芯データがありません';
  }

  // Y通り芯出力ボタン
  if (exportAllYAxesBtn) {
    const hasYAxes = axes && axes.yAxes && axes.yAxes.length > 0;
    exportAllYAxesBtn.disabled = !canExport || !hasYAxes;
    exportAllYAxesBtn.title = hasYAxes
      ? `${axes.yAxes.length}通り分のDXFを出力`
      : 'Y通り芯データがありません';
  }

  // 全通り芯出力ボタン
  if (exportAllAxesBtn) {
    const hasAnyAxes =
      axes && ((axes.xAxes && axes.xAxes.length > 0) || (axes.yAxes && axes.yAxes.length > 0));
    exportAllAxesBtn.disabled = !canExport || !hasAnyAxes;
    exportAllAxesBtn.title = hasAnyAxes ? `全通り芯のDXFを出力` : '通り芯データがありません';
  }
}

/**
 * 進捗表示を更新
 * @param {string|null} text - 表示テキスト（nullで非表示）
 */
function updateBatchExportProgress(text) {
  const progressEl = document.getElementById('batch-export-progress');
  const progressTextEl = document.getElementById('batch-export-progress-text');

  if (progressEl && progressTextEl) {
    if (text) {
      progressEl.classList.remove('hidden');
      progressTextEl.textContent = text;
    } else {
      progressEl.classList.add('hidden');
    }
  }
}

/**
 * 全階DXFエクスポートを実行
 * ファイル名は読み込みファイル名をベースに自動生成されます。
 */
async function handleExportAllStories() {
  const selectedTypes = getSelectedStbExportTypes();
  if (selectedTypes.length === 0) {
    showWarning('エクスポートする部材を選択してください');
    return;
  }

  // ボタンを無効化
  setBatchExportButtonsDisabled(true);
  updateBatchExportProgress('全階DXFを出力中...');

  try {
    // ファイル名は読み込みファイル名から自動生成
    const success = await exportAllStoriesToDxf(selectedTypes, {
      includeLabels: true,
      includeAxes: true,
    });

    // エクスポート完了を表示
    if (success) {
      updateBatchExportProgress('エクスポート完了');
      // 2秒後に進捗表示をクリア
      setTimeout(() => updateBatchExportProgress(null), 2000);
    } else {
      updateBatchExportProgress(null);
    }
  } catch (error) {
    log.error('全階DXFエクスポートエラー:', error);
    showError(`エクスポートに失敗しました: ${error.message}`);
    updateBatchExportProgress(null);
  } finally {
    setBatchExportButtonsDisabled(false);
  }
}

/**
 * 指定方向の全通り芯DXFエクスポートを実行
 * ファイル名は読み込みファイル名をベースに自動生成されます。
 * @param {string} direction - 'X' または 'Y'
 */
async function handleExportAllAxes(direction) {
  const selectedTypes = getSelectedStbExportTypes();
  if (selectedTypes.length === 0) {
    showWarning('エクスポートする部材を選択してください');
    return;
  }

  // ボタンを無効化
  setBatchExportButtonsDisabled(true);
  updateBatchExportProgress(`${direction}通り芯DXFを出力中...`);

  try {
    // ファイル名は読み込みファイル名から自動生成
    const success = await exportAlongAllAxesToDxf(selectedTypes, direction, {
      includeLabels: true,
      includeAxes: true,
    });

    // エクスポート完了を表示
    if (success) {
      updateBatchExportProgress('エクスポート完了');
      setTimeout(() => updateBatchExportProgress(null), 2000);
    } else {
      updateBatchExportProgress(null);
    }
  } catch (error) {
    log.error(`${direction}通り芯DXFエクスポートエラー:`, error);
    showError(`エクスポートに失敗しました: ${error.message}`);
    updateBatchExportProgress(null);
  } finally {
    setBatchExportButtonsDisabled(false);
  }
}

/**
 * 全通り芯（X+Y）DXFエクスポートを実行
 * ファイル名は読み込みファイル名をベースに自動生成されます。
 */
async function handleExportAllAxesBoth() {
  const selectedTypes = getSelectedStbExportTypes();
  if (selectedTypes.length === 0) {
    showWarning('エクスポートする部材を選択してください');
    return;
  }

  // ボタンを無効化
  setBatchExportButtonsDisabled(true);
  updateBatchExportProgress('全通り芯DXFを出力中...');

  try {
    // ファイル名は読み込みファイル名から自動生成
    const success = await exportAlongAllAxesBothDirections(selectedTypes, {
      includeLabels: true,
      includeAxes: true,
    });

    // エクスポート完了を表示
    if (success) {
      updateBatchExportProgress('エクスポート完了');
      setTimeout(() => updateBatchExportProgress(null), 2000);
    } else {
      updateBatchExportProgress(null);
    }
  } catch (error) {
    log.error('全通り芯DXFエクスポートエラー:', error);
    showError(`エクスポートに失敗しました: ${error.message}`);
    updateBatchExportProgress(null);
  } finally {
    setBatchExportButtonsDisabled(false);
  }
}

/**
 * 連続出力ボタンの有効/無効を一括設定
 * @param {boolean} disabled - 無効にするかどうか
 */
function setBatchExportButtonsDisabled(disabled) {
  const buttons = [
    'exportAllStoriesDxfBtn',
    'exportAllXAxesDxfBtn',
    'exportAllYAxesDxfBtn',
    'exportAllAxesDxfBtn',
  ];

  buttons.forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.disabled = disabled;
    }
  });
}

/**
 * @fileoverview DXFバッチエクスポートモジュール
 *
 * 全階エクスポート、通り芯沿いエクスポートなど、
 * 複数ファイルの一括エクスポート機能を提供します。
 */

import { createLogger } from '../../../utils/logger.js';
import {
  getCurrentStoriesInternal,
  getCurrentAxesDataInternal,
  getCurrentClippingStateInternal,
  applyStoryClipInternal,
  applyAxisClipInternal,
  clearAllClippingPlanesInternal,
  getLoadedFilenameInternal,
} from './DxfProviders.js';
import { canExportStbToDxf, exportStbToDxf } from './StbToDxfExporter.js';
import { showSuccess, showError, showWarning } from '../../../ui/common/toast.js';

const log = createLogger('DxfBatchExporter');

/**
 * 全階をDXFエクスポート（階連続出力）
 * 各階ごとにDXFファイルを生成し、選択したフォルダに一括保存します。
 * @param {Array<string>} selectedElementTypes - 選択された要素タイプ
 * @param {Object} options - オプション
 * @param {number} [options.downloadDelay=500] - ダウンロード間隔（ミリ秒）
 * @returns {Promise<boolean>} 成功/失敗
 */
export async function exportAllStoriesToDxf(selectedElementTypes, options = {}) {
  const stories = getCurrentStoriesInternal();
  if (!stories || stories.length === 0) {
    showWarning('階データがありません');
    return false;
  }

  const downloadDelay = options.downloadDelay || 100;
  const includeLabels = options.includeLabels !== undefined ? options.includeLabels : true;
  const includeAxes = options.includeAxes !== undefined ? options.includeAxes : true;
  const includeLevels = options.includeLevels !== undefined ? options.includeLevels : false;
  const labelHeight = options.labelHeight || 200;

  const baseFilename = getLoadedFilenameInternal();

  log.info('全階DXFエクスポート開始:', {
    storyCount: stories.length,
    selectedElementTypes,
    baseFilename,
  });

  // エクスポート可能か確認
  const { canExport, reason } = canExportStbToDxf();
  if (!canExport) {
    showWarning(`エクスポートできません: ${reason}`);
    return false;
  }

  // File System Access APIで保存先フォルダを選択
  let directoryHandle = null;
  if ('showDirectoryPicker' in window) {
    try {
      directoryHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'downloads',
      });
      log.info('保存先フォルダが選択されました:', directoryHandle.name);
    } catch (error) {
      if (error.name === 'AbortError') {
        log.info('フォルダ選択がキャンセルされました');
        return false;
      }
      log.warn('File System Access API使用不可、通常のダウンロード方式を使用:', error);
    }
  } else {
    log.info('File System Access API未対応ブラウザ、通常のダウンロード方式を使用');
  }

  // 元のクリッピング状態を保存
  const originalClippingState = getCurrentClippingStateInternal();

  try {
    let exportedCount = 0;

    for (let i = 0; i < stories.length; i++) {
      const story = stories[i];
      const storyName = story.name || `Floor_${i + 1}`;
      const filename = `${baseFilename}_${storyName}`;

      log.info(`階エクスポート中: ${storyName} (${i + 1}/${stories.length})`);

      // 階クリッピングを適用
      applyStoryClipInternal(story.id);

      // 少し待ってからエクスポート
      await new Promise((resolve) => setTimeout(resolve, 100));

      // DXFエクスポート実行（平面図ビューを強制）
      const success = await exportStbToDxf(selectedElementTypes, filename, {
        includeLabels,
        includeAxes,
        includeLevels,
        labelHeight,
        directoryHandle,
        forceViewDirection: 'top', // 全階出力は平面図（上から見下ろす）
      });

      if (success) {
        exportedCount++;
      }

      // 次のエクスポートまで少し待機
      if (i < stories.length - 1 && !directoryHandle) {
        await new Promise((resolve) => setTimeout(resolve, downloadDelay));
      }
    }

    // 元のクリッピング状態を復元
    if (
      originalClippingState &&
      originalClippingState.type === 'story' &&
      originalClippingState.id
    ) {
      applyStoryClipInternal(originalClippingState.id, originalClippingState.range);
    } else {
      clearAllClippingPlanesInternal();
    }

    log.info(`全階DXFエクスポート完了: ${exportedCount}/${stories.length}階`);
    showSuccess(`${exportedCount}階のDXFファイルをエクスポートしました`);
    return true;
  } catch (error) {
    log.error('全階DXFエクスポートエラー:', error);
    clearAllClippingPlanesInternal();
    showError(`エクスポート中にエラーが発生しました: ${error.message}`);
    return false;
  }
}

/**
 * 全通り芯に沿ってDXFエクスポート（断面連続出力）
 * 各通り芯ごとにDXFファイルを生成し、選択したフォルダに一括保存します。
 * @param {Array<string>} selectedElementTypes - 選択された要素タイプ
 * @param {string} axisDirection - 軸方向 ('X' または 'Y')
 * @param {Object} options - オプション
 * @returns {Promise<boolean>} 成功/失敗
 */
export async function exportAlongAllAxesToDxf(
  selectedElementTypes,
  axisDirection = 'X',
  options = {},
) {
  const axesData = getCurrentAxesDataInternal();
  if (!axesData) {
    showWarning('通り芯データがありません');
    return false;
  }

  const axes = axisDirection === 'X' ? axesData.xAxes : axesData.yAxes;
  if (!axes || axes.length === 0) {
    showWarning(`${axisDirection}方向の通り芯データがありません`);
    return false;
  }

  const downloadDelay = options.downloadDelay || 100;
  const includeLabels = options.includeLabels !== undefined ? options.includeLabels : true;
  const includeAxes = options.includeAxes !== undefined ? options.includeAxes : true;
  const includeLevels = options.includeLevels !== undefined ? options.includeLevels : true;
  const labelHeight = options.labelHeight || 200;

  const baseFilename = getLoadedFilenameInternal();

  log.info(`通り芯DXFエクスポート開始 (${axisDirection}軸):`, {
    axisCount: axes.length,
    selectedElementTypes,
    baseFilename,
  });

  // エクスポート可能か確認
  const { canExport, reason } = canExportStbToDxf();
  if (!canExport) {
    showWarning(`エクスポートできません: ${reason}`);
    return false;
  }

  // File System Access APIで保存先フォルダを選択
  let directoryHandle = null;
  if ('showDirectoryPicker' in window) {
    try {
      directoryHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'downloads',
      });
      log.info('保存先フォルダが選択されました:', directoryHandle.name);
    } catch (error) {
      if (error.name === 'AbortError') {
        log.info('フォルダ選択がキャンセルされました');
        return false;
      }
      log.warn('File System Access API使用不可、通常のダウンロード方式を使用:', error);
    }
  } else {
    log.info('File System Access API未対応ブラウザ、通常のダウンロード方式を使用');
  }

  // 元のクリッピング状態を保存
  const originalClippingState = getCurrentClippingStateInternal();

  try {
    let exportedCount = 0;

    for (let i = 0; i < axes.length; i++) {
      const axis = axes[i];
      const axisName = axis.name || `${axisDirection}_${i + 1}`;
      const filename = `${baseFilename}_${axisDirection}${axisName}`;

      log.info(`通り芯エクスポート中: ${axisName} (${i + 1}/${axes.length})`);

      // 通り芯クリッピングを適用
      applyAxisClipInternal(axisDirection, axis.id);

      // 少し待ってからエクスポート
      await new Promise((resolve) => setTimeout(resolve, 100));

      // ビュー方向を決定（X通り芯→front、Y通り芯→side）
      const viewDir = axisDirection === 'X' ? 'front' : 'side';

      // DXFエクスポート実行（軸に応じた立面図ビューを強制）
      const success = await exportStbToDxf(selectedElementTypes, filename, {
        includeLabels,
        includeAxes,
        includeLevels,
        labelHeight,
        directoryHandle,
        forceViewDirection: viewDir,
      });

      if (success) {
        exportedCount++;
      }

      // 次のエクスポートまで少し待機
      if (i < axes.length - 1 && !directoryHandle) {
        await new Promise((resolve) => setTimeout(resolve, downloadDelay));
      }
    }

    // 元のクリッピング状態を復元
    if (originalClippingState && originalClippingState.type) {
      if (originalClippingState.type === 'xAxis') {
        applyAxisClipInternal('X', originalClippingState.id, originalClippingState.range);
      } else if (originalClippingState.type === 'yAxis') {
        applyAxisClipInternal('Y', originalClippingState.id, originalClippingState.range);
      } else if (originalClippingState.type === 'story') {
        applyStoryClipInternal(originalClippingState.id, originalClippingState.range);
      }
    } else {
      clearAllClippingPlanesInternal();
    }

    log.info(`通り芯DXFエクスポート完了: ${exportedCount}/${axes.length}軸`);
    showSuccess(`${exportedCount}通り芯のDXFファイルをエクスポートしました`);
    return true;
  } catch (error) {
    log.error('通り芯DXFエクスポートエラー:', error);
    clearAllClippingPlanesInternal();
    showError(`エクスポート中にエラーが発生しました: ${error.message}`);
    return false;
  }
}

/**
 * 両方向の通り芯に沿ってDXFエクスポート
 * X軸とY軸両方の通り芯についてエクスポートします。
 * @param {Array<string>} selectedElementTypes - 選択された要素タイプ
 * @param {Object} options - オプション
 * @returns {Promise<boolean>} 成功/失敗
 */
export async function exportAlongAllAxesBothDirections(selectedElementTypes, options = {}) {
  log.info('両方向通り芯DXFエクスポート開始');

  // X軸方向
  await exportAlongAllAxesToDxf(selectedElementTypes, 'X', options);

  // 少し待ってからY軸方向
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Y軸方向
  await exportAlongAllAxesToDxf(selectedElementTypes, 'Y', options);

  log.info('両方向通り芯DXFエクスポート完了');
  return true;
}

/**
 * エクスポート可能な階一覧を取得
 * @returns {Array<{id: string, name: string, height: number}>} 階一覧
 */
export function getAvailableStories() {
  const stories = getCurrentStoriesInternal();
  return stories || [];
}

/**
 * エクスポート可能な通り芯一覧を取得
 * @returns {{xAxes: Array, yAxes: Array}} 通り芯一覧
 */
export function getAvailableAxes() {
  const axesData = getCurrentAxesDataInternal();
  return axesData || { xAxes: [], yAxes: [] };
}

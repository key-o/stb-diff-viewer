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
import { eventBus, ToastEvents } from '../../../data/events/index.js';

const log = createLogger('DxfBatchExporter');

/** X軸→Y軸切り替え待機時間（ms） */
const AXIS_DIRECTION_SWITCH_DELAY_MS = 1000;

/**
 * File System Access APIでフォルダを選択する
 * @returns {Promise<{handle: FileSystemDirectoryHandle|null, cancelled: boolean}>}
 */
async function pickDirectoryHandle() {
  if (!('showDirectoryPicker' in window)) {
    log.info('File System Access API未対応ブラウザ、通常のダウンロード方式を使用');
    return { handle: null, cancelled: false };
  }
  try {
    const handle = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'downloads',
    });
    log.info('保存先フォルダが選択されました:', handle.name);
    return { handle, cancelled: false };
  } catch (error) {
    if (error.name === 'AbortError') {
      log.info('フォルダ選択がキャンセルされました');
      return { handle: null, cancelled: true };
    }
    log.warn('File System Access API使用不可、通常のダウンロード方式を使用:', error);
    return { handle: null, cancelled: false };
  }
}

/**
 * クリッピング状態を復元する
 * @param {Object|null} state - 保存済みクリッピング状態
 */
async function restoreClippingState(state) {
  if (!state || !state.type) {
    clearAllClippingPlanesInternal();
    return;
  }
  if (state.type === 'xAxis') {
    await applyAxisClipInternal('X', state.id, state.range);
  } else if (state.type === 'yAxis') {
    await applyAxisClipInternal('Y', state.id, state.range);
  } else if (state.type === 'story') {
    await applyStoryClipInternal(state.id, state.range);
  } else {
    clearAllClippingPlanesInternal();
  }
}

/**
 * 全階をDXFエクスポート（階連続出力）
 * 各階ごとにDXFファイルを生成し、選択したフォルダに一括保存します。
 * @param {Array<string>} selectedElementTypes - 選択された要素タイプ
 * @param {Object} options - オプション
 * @param {number} [options.downloadDelay=100] - ダウンロード間隔（ミリ秒）
 * @returns {Promise<boolean>} 成功/失敗
 */
export async function exportAllStoriesToDxf(selectedElementTypes, options = {}) {
  const stories = getCurrentStoriesInternal();
  if (!stories || stories.length === 0) {
    eventBus.emit(ToastEvents.SHOW_WARNING, { message: '階データがありません' });
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

  const { canExport, reason } = canExportStbToDxf();
  if (!canExport) {
    eventBus.emit(ToastEvents.SHOW_WARNING, { message: `エクスポートできません: ${reason}` });
    return false;
  }

  const { handle: directoryHandle, cancelled } = await pickDirectoryHandle();
  if (cancelled) return false;

  const originalClippingState = getCurrentClippingStateInternal();

  try {
    let exportedCount = 0;

    for (let i = 0; i < stories.length; i++) {
      const story = stories[i];
      const storyName = story.name || `Floor_${i + 1}`;
      const filename = `${baseFilename}_${storyName}`;

      log.info(`階エクスポート中: ${storyName} (${i + 1}/${stories.length})`);

      await applyStoryClipInternal(story.id);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const success = await exportStbToDxf(selectedElementTypes, filename, {
        includeLabels,
        includeAxes,
        includeLevels,
        labelHeight,
        directoryHandle,
        forceViewDirection: 'top',
      });

      if (success) {
        exportedCount++;
      }

      if (i < stories.length - 1 && !directoryHandle) {
        await new Promise((resolve) => setTimeout(resolve, downloadDelay));
      }
    }

    await restoreClippingState(originalClippingState);

    log.info(`全階DXFエクスポート完了: ${exportedCount}/${stories.length}階`);
    eventBus.emit(ToastEvents.SHOW_SUCCESS, {
      message: `${exportedCount}階のDXFファイルをエクスポートしました`,
    });
    return true;
  } catch (error) {
    log.error('全階DXFエクスポートエラー:', error);
    clearAllClippingPlanesInternal();
    eventBus.emit(ToastEvents.SHOW_ERROR, {
      message: `エクスポート中にエラーが発生しました: ${error.message}`,
    });
    return false;
  }
}

/**
 * 全通り芯に沿ってDXFエクスポート（断面連続出力）
 * 各通り芯ごとにDXFファイルを生成し、選択したフォルダに一括保存します。
 * @param {Array<string>} selectedElementTypes - 選択された要素タイプ
 * @param {string} axisDirection - 軸方向 ('X' または 'Y')
 * @param {Object} options - オプション
 * @param {number} [options.downloadDelay=100] - ダウンロード間隔（ミリ秒）
 * @param {FileSystemDirectoryHandle|null} [options.directoryHandle] - 保存先フォルダ（指定時はフォルダ選択ダイアログをスキップ）
 * @returns {Promise<boolean>} 成功/失敗
 */
export async function exportAlongAllAxesToDxf(
  selectedElementTypes,
  axisDirection = 'X',
  options = {},
) {
  const axesData = getCurrentAxesDataInternal();
  if (!axesData) {
    eventBus.emit(ToastEvents.SHOW_WARNING, { message: '通り芯データがありません' });
    return false;
  }

  const axes = axisDirection === 'X' ? axesData.xAxes : axesData.yAxes;
  if (!axes || axes.length === 0) {
    eventBus.emit(ToastEvents.SHOW_WARNING, {
      message: `${axisDirection}方向の通り芯データがありません`,
    });
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

  const { canExport, reason } = canExportStbToDxf();
  if (!canExport) {
    eventBus.emit(ToastEvents.SHOW_WARNING, { message: `エクスポートできません: ${reason}` });
    return false;
  }

  // options.directoryHandle が指定済みの場合はフォルダ選択をスキップ
  let directoryHandle;
  if ('directoryHandle' in options) {
    directoryHandle = options.directoryHandle;
  } else {
    const { handle, cancelled } = await pickDirectoryHandle();
    if (cancelled) return false;
    directoryHandle = handle;
  }

  const originalClippingState = getCurrentClippingStateInternal();

  try {
    let exportedCount = 0;

    for (let i = 0; i < axes.length; i++) {
      const axis = axes[i];
      const axisName = axis.name || `${axisDirection}_${i + 1}`;
      const filename = `${baseFilename}_${axisDirection}${axisName}`;

      log.info(`通り芯エクスポート中: ${axisName} (${i + 1}/${axes.length})`);

      await applyAxisClipInternal(axisDirection, axis.id);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const viewDir = axisDirection === 'X' ? 'front' : 'side';

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

      if (i < axes.length - 1 && !directoryHandle) {
        await new Promise((resolve) => setTimeout(resolve, downloadDelay));
      }
    }

    await restoreClippingState(originalClippingState);

    log.info(`通り芯DXFエクスポート完了: ${exportedCount}/${axes.length}軸`);
    eventBus.emit(ToastEvents.SHOW_SUCCESS, {
      message: `${exportedCount}通り芯のDXFファイルをエクスポートしました`,
    });
    return true;
  } catch (error) {
    log.error('通り芯DXFエクスポートエラー:', error);
    clearAllClippingPlanesInternal();
    eventBus.emit(ToastEvents.SHOW_ERROR, {
      message: `エクスポート中にエラーが発生しました: ${error.message}`,
    });
    return false;
  }
}

/**
 * 両方向の通り芯に沿ってDXFエクスポート
 * X軸とY軸両方の通り芯についてエクスポートします。
 * フォルダ選択ダイアログは一度だけ表示され、X・Y両方向で共有されます。
 * @param {Array<string>} selectedElementTypes - 選択された要素タイプ
 * @param {Object} options - オプション
 * @returns {Promise<boolean>} 少なくとも一方向が成功した場合 true
 */
export async function exportAlongAllAxesBothDirections(selectedElementTypes, options = {}) {
  log.info('両方向通り芯DXFエクスポート開始');

  // フォルダを一度だけ選択してX・Y両方向で共有する
  const { handle: directoryHandle, cancelled } = await pickDirectoryHandle();
  if (cancelled) return false;

  const mergedOptions = { ...options, directoryHandle };

  const xSuccess = await exportAlongAllAxesToDxf(selectedElementTypes, 'X', mergedOptions);

  await new Promise((resolve) => setTimeout(resolve, AXIS_DIRECTION_SWITCH_DELAY_MS));

  const ySuccess = await exportAlongAllAxesToDxf(selectedElementTypes, 'Y', mergedOptions);

  log.info('両方向通り芯DXFエクスポート完了');
  return xSuccess || ySuccess;
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

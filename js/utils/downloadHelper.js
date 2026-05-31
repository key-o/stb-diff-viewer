/**
 * @fileoverview ファイルダウンロードユーティリティ
 * @module utils/downloadHelper
 */

/* global document, URL */

/**
 * Blobをファイルとしてダウンロード
 * @param {Blob} blob - ダウンロードするBlob
 * @param {string} filename - ファイル名
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 保存先ファイルハンドルを取得
 * @param {Object} pickerOptions - showSaveFilePicker に渡すオプション
 * @returns {Promise<{status: 'selected' | 'unsupported' | 'canceled' | 'error', handle: FileSystemFileHandle|null, error?: Error}>}
 */
export async function requestSaveFileHandle(pickerOptions = {}) {
  if (typeof globalThis.showSaveFilePicker !== 'function') {
    return { status: 'unsupported', handle: null };
  }

  try {
    const handle = await globalThis.showSaveFilePicker(pickerOptions);
    return { status: 'selected', handle };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { status: 'canceled', handle: null };
    }

    return {
      status: 'error',
      handle: null,
      error: { message: error?.message ?? 'Unknown error', name: error?.name },
    };
  }
}

/**
 * Blobを保存先ハンドルまたは通常ダウンロードで保存
 * @param {Blob} blob - 保存するBlob
 * @param {string} filename - フォールバック時のファイル名
 * @param {Object} [options] - 保存オプション
 * @param {FileSystemFileHandle|null} [options.fileHandle] - 保存先ファイルハンドル
 * @returns {Promise<boolean>} 保存開始または保存完了の可否
 */
export async function saveBlob(blob, filename, options = {}) {
  if (options.fileHandle && typeof options.fileHandle.createWritable === 'function') {
    let writable;
    try {
      writable = await options.fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (error) {
      try {
        if (writable) await writable.close();
      } catch (_) {
        /* ignore */
      }
      // File System Access API 経由の保存に失敗した場合は通常ダウンロードにフォールバック
      console.warn(
        '[downloadHelper] fileHandle 経由の保存に失敗しました。通常ダウンロードに切り替えます:',
        error,
      );
    }
  }

  downloadBlob(blob, filename);
  return true;
}

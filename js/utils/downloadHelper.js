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

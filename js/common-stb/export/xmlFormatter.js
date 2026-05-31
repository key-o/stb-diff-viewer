/**
 * @fileoverview XML フォーマット・ダウンロードユーティリティ
 *
 * STB XMLファイルのフォーマットとダウンロード機能を提供します。
 * @module common/stb/export/xmlFormatter
 */

import { downloadBlob, requestSaveFileHandle, saveBlob } from '../../utils/downloadHelper.js';

export const STB_SAVE_FILE_TYPES = [
  {
    description: 'ST-Bridge ファイル',
    accept: {
      'application/xml': ['.stb'],
    },
  },
];

/**
 * XMLを読みやすい形式にフォーマット
 * @param {string} xmlString - XML文字列
 * @returns {string} フォーマットされたXML文字列
 */
export function formatXml(xmlString) {
  // XMLDeclarationを保持
  const xmlDeclaration = '<?xml version="1.0" encoding="utf-8"?>\n';

  // 簡易的なフォーマット（改行とインデント）
  const formatted = xmlString.replace(/></g, '>\n<').replace(/^\s*\n/gm, ''); // 空行を削除

  // インデントを追加
  const lines = formatted.split('\n');
  let indentLevel = 0;
  const indentedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed === '') return '';

    // 終了タグの場合、インデントレベルを下げる
    if (trimmed.startsWith('</')) {
      indentLevel = Math.max(0, indentLevel - 1);
    }

    const indented = '  '.repeat(indentLevel) + trimmed;

    // 開始タグ（自己終了タグでない、かつインライン要素でない）の場合、インデントレベルを上げる
    if (
      trimmed.startsWith('<') &&
      !trimmed.startsWith('</') &&
      !trimmed.startsWith('<?') &&
      !trimmed.endsWith('/>') &&
      !/^<[^>]+>[^<]*<\//.test(trimmed)
    ) {
      indentLevel++;
    }

    return indented;
  });

  return xmlDeclaration + indentedLines.join('\n');
}

/**
 * STBファイル名として拡張子を保証
 * @param {string} filename - ファイル名
 * @returns {string} .stb 拡張子を持つファイル名
 */
export function ensureStbExtension(filename) {
  const name = String(filename || '').trim() || 'export.stb';
  if (/\.stb$/i.test(name)) return name;
  if (/\.[^./\\]+$/.test(name)) return name.replace(/\.[^./\\]+$/, '.stb');
  return `${name}.stb`;
}

/**
 * STB保存ダイアログ用オプションを取得
 * @param {string} filename - 推奨ファイル名
 * @returns {Object} showSaveFilePicker オプション
 */
export function getStbSavePickerOptions(filename) {
  return {
    suggestedName: ensureStbExtension(filename),
    types: STB_SAVE_FILE_TYPES,
    excludeAcceptAllOption: false,
  };
}

/**
 * STB保存先ファイルハンドルを取得
 * @param {string} filename - 推奨ファイル名
 * @returns {Promise<{status: 'selected' | 'unsupported' | 'canceled' | 'error', handle: FileSystemFileHandle|null, error?: Error}>}
 */
export function requestStbSaveFileHandle(filename) {
  return requestSaveFileHandle(getStbSavePickerOptions(filename));
}

/**
 * STBファイルとしてダウンロード
 * @param {string} xmlContent - XML内容
 * @param {string} filename - ファイル名
 * @param {Object} [options] - 保存オプション
 * @param {FileSystemFileHandle|null} [options.fileHandle] - 保存先ファイルハンドル
 * @returns {Promise<boolean>} 保存可否
 */
export async function downloadStbFile(xmlContent, filename, options = {}) {
  // ファイル名の拡張子を.stbに確保
  const stbFilename = ensureStbExtension(filename);

  const blob = new Blob([xmlContent], { type: 'application/xml' });
  return saveBlob(blob, stbFilename, options);
}

/**
 * テキストファイルとしてダウンロード
 * @param {string} content - ファイル内容
 * @param {string} filename - ファイル名
 */
export function downloadTextFile(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, filename);
}

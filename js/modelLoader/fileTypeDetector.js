/**
 * @fileoverview ファイルタイプ検出モジュール
 *
 * ファイルの拡張子、マジックバイト、コンテンツからファイルタイプを検出します。
 *
 * @module modelLoader/fileTypeDetector
 */

import {
  FILE_TYPE_DEFINITIONS,
  getFileTypeByExtension,
  getFileTypeById,
} from '../config/fileTypeConfig.js';

// ============================================================================
// マジックバイト検出
// ============================================================================

/**
 * マジックバイトでファイルタイプを検出
 * @param {ArrayBuffer} buffer - ファイルの先頭バイト
 * @returns {Object|null} マッチしたファイルタイプ定義、または見つからない場合はnull
 */
export function detectByMagicBytes(buffer) {
  const bytes = new Uint8Array(buffer);

  for (const fileType of FILE_TYPE_DEFINITIONS) {
    if (!fileType.magicBytes || fileType.magicBytes.length === 0) continue;

    for (const magic of fileType.magicBytes) {
      const { offset, bytes: magicPattern } = magic;

      if (offset + magicPattern.length > bytes.length) continue;

      let matched = true;
      for (let i = 0; i < magicPattern.length; i++) {
        if (bytes[offset + i] !== magicPattern[i]) {
          matched = false;
          break;
        }
      }

      if (matched) {
        return fileType;
      }
    }
  }

  return null;
}

// ============================================================================
// コンテンツ検出
// ============================================================================

/**
 * XMLコンテンツからSTBファイルを検出
 * @param {string} content - ファイルコンテンツ（文字列）
 * @returns {boolean} STBファイルの場合はtrue
 */
export function isStbContent(content) {
  if (!content || typeof content !== 'string') return false;

  // STB固有の要素を検索
  const stbIndicators = [
    '<ST_BRIDGE',
    '<StbModel',
    '<StbColumn',
    '<StbBeam',
    '<StbSlab',
    '<StbWall',
    '<StbStory',
  ];

  return stbIndicators.some((indicator) => content.includes(indicator));
}

/**
 * コンテンツからファイルタイプを検出
 * @param {string} content - ファイルコンテンツ（文字列）
 * @returns {Object|null} 検出されたファイルタイプ定義
 */
export function detectByContent(content) {
  if (isStbContent(content)) {
    return getFileTypeById('stb');
  }

  // DXFコンテンツ検出
  if (content.includes('0\nSECTION') || content.includes('0\r\nSECTION')) {
    return getFileTypeById('dxf');
  }

  return null;
}

// ============================================================================
// 統合検出
// ============================================================================

/**
 * ファイルタイプを総合的に検出
 * @param {File} file - ファイル
 * @param {Object} [options] - オプション
 * @param {boolean} [options.checkContent=false] - コンテンツベースの検出を行うか
 * @returns {Promise<Object>} 検出結果 { fileType, method, confidence }
 */
export async function detectFileType(file, options = {}) {
  const { checkContent = false } = options;

  const result = {
    fileType: null,
    method: null,
    confidence: 0,
  };

  // 1. 拡張子による検出（高速）
  const extensionType = getFileTypeByExtension(file.name);
  if (extensionType) {
    result.fileType = extensionType;
    result.method = 'extension';
    result.confidence = 0.7;
  }

  // 2. マジックバイトによる検出（より正確）
  try {
    const headerSize = 256; // 先頭256バイトを読み取り
    const headerBuffer = await readFileHeader(file, headerSize);
    const magicType = detectByMagicBytes(headerBuffer);

    if (magicType) {
      result.fileType = magicType;
      result.method = 'magicBytes';
      result.confidence = 0.9;
    }
  } catch (e) {
    console.warn('[FileTypeDetector] マジックバイト検出に失敗:', e);
  }

  // 3. コンテンツによる検出（最も正確だが遅い）
  if (checkContent && file.size < 10 * 1024 * 1024) {
    // 10MB未満のファイルのみ
    try {
      const content = await readFileAsText(file);
      const contentType = detectByContent(content);

      if (contentType) {
        result.fileType = contentType;
        result.method = 'content';
        result.confidence = 0.95;
      }
    } catch (e) {
      console.warn('[FileTypeDetector] コンテンツ検出に失敗:', e);
    }
  }

  return result;
}

// ============================================================================
// ユーティリティ
// ============================================================================

/**
 * ファイルの先頭を読み取り
 * @param {File} file - ファイル
 * @param {number} size - 読み取りサイズ
 * @returns {Promise<ArrayBuffer>} 読み取ったバッファ
 */
function readFileHeader(file, size) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file.slice(0, size));
  });
}

/**
 * ファイルをテキストとして読み取り
 * @param {File} file - ファイル
 * @returns {Promise<string>} ファイル内容
 */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * ファイル拡張子を取得
 * @param {string} filename - ファイル名
 * @returns {string} 拡張子（ドット付き、小文字）
 */
export function getFileExtension(filename) {
  if (!filename) return '';
  const parts = filename.split('.');
  if (parts.length < 2) return '';
  return '.' + parts.pop().toLowerCase();
}

// ============================================================================
// デフォルトエクスポート
// ============================================================================

export default {
  detectByMagicBytes,
  detectByContent,
  detectFileType,
  isStbContent,
  getFileExtension,
};

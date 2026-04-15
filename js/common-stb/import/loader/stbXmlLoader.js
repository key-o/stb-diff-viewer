/**
 * @fileoverview STB XMLローダーモジュール
 *
 * STBファイル（XML形式）の読み込み機能を提供します:
 * - 文字エンコーディングの自動検出
 * - XMLドキュメントのパース
 */

import { SOURCE_TYPES, createImportMetadata } from '../../../constants/importTypes.js';

/**
 * STBファイル(XML)のencoding宣言を自動判別してデコードする
 * @param {string|File} stbFile - ファイルURLまたはFileオブジェクト
 * @param {Object} [options]
 * @param {function} [options.onProgress] - 進捗コールバック ({stage, progress, message}) => void
 * @returns {Promise<import('../../../constants/importTypes.js').ImportResult>}
 */
export async function loadStbXmlAutoEncoding(stbFile, options = {}) {
  const { onProgress } = options;
  if (onProgress)
    onProgress({ stage: 'reading', progress: 0, message: 'STBファイルを読み込み中...' });

  let arrayBuffer;
  if (typeof stbFile === 'string') {
    // URLの場合
    const response = await fetch(stbFile);
    if (!response.ok) {
      throw new Error(`STBファイルの取得に失敗しました: ${response.status} ${response.statusText}`);
    }
    arrayBuffer = await response.arrayBuffer();
  } else if (stbFile instanceof File) {
    // Fileオブジェクトの場合
    arrayBuffer = await stbFile.arrayBuffer();
  } else {
    throw new Error('Invalid stbFile for loadStbXmlAutoEncoding');
  }

  if (onProgress) onProgress({ stage: 'parsing', progress: 50, message: 'XMLを解析中...' });

  // 先頭数百バイトだけ仮デコードしてencoding属性を抽出
  const headBytes = arrayBuffer.slice(0, 256);
  let encoding = 'utf-8';
  let xmlDecl = '';

  // UTF-8で仮デコード
  xmlDecl = new TextDecoder('utf-8').decode(headBytes);
  let match = xmlDecl.match(/<\?xml\s+[^>]*encoding=["']([\w\-]+)["']/i);
  if (!match) {
    // Shift_JISで仮デコード
    xmlDecl = new TextDecoder('shift_jis').decode(headBytes);
    match = xmlDecl.match(/<\?xml\s+[^>]*encoding=["']([\w\-]+)["']/i);
  }
  if (match) {
    encoding = match[1].toLowerCase();
  }
  if (encoding === 'utf8') encoding = 'utf-8';
  if (encoding === 'shift-jis' || encoding === 'sjis') encoding = 'shift_jis';

  const decoder = new TextDecoder(encoding);
  const xmlText = decoder.decode(arrayBuffer);
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

  // パースエラーチェック
  const parseError = xmlDoc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`STBファイルのXMLパースに失敗しました: ${parseError.textContent}`);
  }

  if (onProgress) onProgress({ stage: 'done', progress: 100, message: '読み込み完了' });

  return {
    document: xmlDoc,
    metadata: createImportMetadata(SOURCE_TYPES.STB),
  };
}

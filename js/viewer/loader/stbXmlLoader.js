/**
 * @fileoverview STB XMLローダーモジュール
 *
 * STBファイル（XML形式）の読み込み機能を提供します:
 * - 文字エンコーディングの自動検出
 * - XMLドキュメントのパース
 */

/**
 * STBファイル(XML)のencoding宣言を自動判別してデコードする
 * @param {string|File} stbFile - ファイルURLまたはFileオブジェクト
 * @returns {Promise<XMLDocument>}
 */
export async function loadStbXmlAutoEncoding(stbFile) {
  let arrayBuffer;
  if (typeof stbFile === 'string') {
    // URLの場合
    const response = await fetch(stbFile);
    arrayBuffer = await response.arrayBuffer();
  } else if (stbFile instanceof File) {
    // Fileオブジェクトの場合
    arrayBuffer = await stbFile.arrayBuffer();
  } else {
    throw new Error('Invalid stbFile for loadStbXmlAutoEncoding');
  }

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
    match = xmlDecl.match(/<\?xml\s+[^>]*encoding=["']/i);
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
  return xmlDoc;
}

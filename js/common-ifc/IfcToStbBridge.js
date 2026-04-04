/**
 * @fileoverview IFC → STB DOM 変換ブリッジ
 *
 * ブラウザの File オブジェクトから IFC を読み込み、
 * STB XML DOM Document に変換して返す。
 * 既存の STB パーサー・比較・描画パイプラインにそのまま投入可能。
 *
 * @module IfcToStbBridge
 */

import { IfcToStbBrowserConverter } from './IfcToStbBrowserConverter.js';

/**
 * IFC File を STB XML DOM Document に変換
 * @param {File} file - ブラウザの File オブジェクト
 * @param {Object} [options]
 * @param {function} [options.onProgress] - 進捗コールバック
 * @returns {Promise<XMLDocument>} STB XML DOM Document
 */
export async function convertIfcToStbDocument(file, options = {}) {
  const arrayBuffer = await file.arrayBuffer();

  const converter = new IfcToStbBrowserConverter({
    onProgress: options.onProgress,
  });

  try {
    await converter.init();
    const { xml, schema } = await converter.convert(arrayBuffer);
    const parser = new DOMParser();
    const document = parser.parseFromString(xml, 'application/xml');

    // パースエラーチェック
    const parseError = document.querySelector('parsererror');
    if (parseError) {
      throw new Error(`IFC→STB変換結果のXMLパースに失敗しました: ${parseError.textContent}`);
    }

    return { document, ifcSchema: schema || null };
  } finally {
    converter.close();
  }
}

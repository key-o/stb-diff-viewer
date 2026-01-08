/**
 * @fileoverview XML フォーマット・ダウンロードユーティリティ
 *
 * STB XMLファイルのフォーマットとダウンロード機能を提供します。
 * MatrixCalcとStbDiffViewerの両方で使用される共通モジュール。
 *
 * @module common/stb/export/xmlFormatter
 */

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

    // 開始タグ（自己終了タグでない）の場合、インデントレベルを上げる
    if (
      trimmed.startsWith('<') &&
      !trimmed.startsWith('</') &&
      !trimmed.startsWith('<?') &&
      !trimmed.endsWith('/>')
    ) {
      indentLevel++;
    }

    return indented;
  });

  return xmlDeclaration + indentedLines.join('\n');
}

/**
 * STBファイルとしてダウンロード
 * @param {string} xmlContent - XML内容
 * @param {string} filename - ファイル名
 */
export function downloadStbFile(xmlContent, filename) {
  // ファイル名の拡張子を.stbに確保
  const stbFilename = filename.endsWith('.stb') ? filename : filename.replace(/\.[^.]*$/, '.stb');

  const blob = new Blob([xmlContent], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = stbFilename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * テキストファイルとしてダウンロード
 * @param {string} content - ファイル内容
 * @param {string} filename - ファイル名
 */
export function downloadTextFile(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

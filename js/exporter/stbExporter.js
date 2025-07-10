/**
 * @fileoverview STBデータエクスポートモジュール
 *
 * このファイルは、編集されたSTBデータをXMLファイルとしてエクスポートする機能を提供します:
 * - XMLドキュメントの生成とシリアライゼーション
 * - XSDスキーマに基づく修正データの反映
 * - ファイルダウンロード機能
 * - エクスポート前のバリデーション
 */

import {
  validateElement,
  getMissingRequiredAttributes,
  isSchemaLoaded,
} from "../parser/xsdSchemaParser.js";

/**
 * STBドキュメントを修正してエクスポート
 * @param {Document} originalDoc - 元のXMLドキュメント
 * @param {Array<Object>} modifications - 修正データの配列
 * @param {string} filename - エクスポートファイル名
 * @returns {Promise<boolean>} エクスポート成功可否
 */
export async function exportModifiedStb(
  originalDoc,
  modifications,
  filename = "modified.stb"
) {
  try {
    // 元ドキュメントのコピーを作成
    const modifiedDoc = originalDoc.cloneNode(true);

    // 修正を適用
    const validationResults = [];
    for (const mod of modifications) {
      const result = applyModification(modifiedDoc, mod);
      if (result.validation) {
        validationResults.push(result.validation);
      }
    }

    // バリデーション結果をコンソールに出力
    if (validationResults.length > 0) {
      console.log("Validation results:", validationResults);
    }

    // XMLを文字列にシリアライズ
    const serializer = new XMLSerializer();
    const xmlString = serializer.serializeToString(modifiedDoc);

    // フォーマット調整（改行とインデント）
    const formattedXml = formatXml(xmlString);

    // ファイルとしてダウンロード
    downloadStbFile(formattedXml, filename);

    console.log(`STB file exported successfully as ${filename}`);
    return true;
  } catch (error) {
    console.error("Error exporting STB file:", error);
    return false;
  }
}

/**
 * 単一の修正をXMLドキュメントに適用
 * @param {Document} doc - XMLドキュメント
 * @param {Object} modification - 修正データ {elementType, id, attribute, newValue}
 * @returns {Object} 適用結果とバリデーション情報
 */
function applyModification(doc, modification) {
  const { elementType, id, attribute, newValue } = modification;

  // 要素を検索
  const tagName = elementType === "Node" ? "StbNode" : `Stb${elementType}`;
  const element = doc.querySelector(`${tagName}[id="${id}"]`);

  if (!element) {
    console.warn(`Element ${tagName} with ID ${id} not found`);
    return { success: false, error: "Element not found" };
  }

  // 属性値を設定
  if (newValue === null || newValue === undefined || newValue === "") {
    element.removeAttribute(attribute);
  } else {
    element.setAttribute(attribute, newValue);
  }

  // XSDスキーマが利用可能な場合はバリデーション
  let validation = null;
  if (isSchemaLoaded()) {
    const currentAttributes = {};
    for (const attr of element.attributes) {
      currentAttributes[attr.name] = attr.value;
    }

    validation = validateElement(tagName, currentAttributes);
    validation.elementId = id;
    validation.elementType = elementType;
  }

  return {
    success: true,
    validation: validation,
  };
}

/**
 * XMLを読みやすい形式にフォーマット
 * @param {string} xmlString - XML文字列
 * @returns {string} フォーマットされたXML文字列
 */
function formatXml(xmlString) {
  // XMLDeclarationを保持
  const xmlDeclaration = '<?xml version="1.0" encoding="utf-8"?>\n';

  // 簡易的なフォーマット（改行とインデント）
  let formatted = xmlString.replace(/></g, ">\n<").replace(/^\s*\n/gm, ""); // 空行を削除

  // インデントを追加
  const lines = formatted.split("\n");
  let indentLevel = 0;
  const indentedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed === "") return "";

    // 終了タグの場合、インデントレベルを下げる
    if (trimmed.startsWith("</")) {
      indentLevel = Math.max(0, indentLevel - 1);
    }

    const indented = "  ".repeat(indentLevel) + trimmed;

    // 開始タグ（自己終了タグでない）の場合、インデントレベルを上げる
    if (
      trimmed.startsWith("<") &&
      !trimmed.startsWith("</") &&
      !trimmed.endsWith("/>")
    ) {
      indentLevel++;
    }

    return indented;
  });

  return xmlDeclaration + indentedLines.join("\n");
}

/**
 * STBファイルとしてダウンロード
 * @param {string} xmlContent - XML内容
 * @param {string} filename - ファイル名
 */
function downloadStbFile(xmlContent, filename) {
  // ファイル名の拡張子を.stbに確保
  const stbFilename = filename.endsWith('.stb') ? filename : filename.replace(/\.[^.]*$/, '.stb');
  
  const blob = new Blob([xmlContent], { type: "application/xml" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = stbFilename;
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * エクスポート前の全体バリデーション
 * @param {Document} doc - XMLドキュメント
 * @returns {Object} バリデーション結果
 */
export function validateDocumentForExport(doc) {
  if (!isSchemaLoaded()) {
    return {
      valid: true,
      message:
        "XSDスキーマが読み込まれていないため、バリデーションをスキップしました",
    };
  }

  const issues = [];

  // 全STB要素をチェック
  const stbElements = doc.querySelectorAll("[id]");
  stbElements.forEach((element) => {
    const tagName = element.tagName;
    if (!tagName.startsWith("Stb")) return;

    const id = element.getAttribute("id");
    const attributes = {};
    for (const attr of element.attributes) {
      attributes[attr.name] = attr.value;
    }

    const validation = validateElement(tagName, attributes);
    if (!validation.valid) {
      issues.push({
        elementType: tagName,
        elementId: id,
        errors: validation.errors,
      });
    }
  });

  return {
    valid: issues.length === 0,
    issues: issues,
    message:
      issues.length === 0
        ? "全ての要素がXSDスキーマに適合しています"
        : `${issues.length}個の要素にバリデーションエラーがあります`,
  };
}

/**
 * 修正データから差分レポートを生成
 * @param {Array<Object>} modifications - 修正データの配列
 * @returns {string} テキスト形式の差分レポート
 */
export function generateModificationReport(modifications) {
  if (modifications.length === 0) {
    return "修正はありませんでした。";
  }

  let report = `STB修正レポート\n`;
  report += `生成日時: ${new Date().toLocaleString("ja-JP")}\n`;
  report += `修正数: ${modifications.length}件\n\n`;

  modifications.forEach((mod, index) => {
    report += `${index + 1}. ${mod.elementType} (ID: ${mod.id})\n`;
    report += `   属性: ${mod.attribute}\n`;
    report += `   新しい値: ${mod.newValue}\n\n`;
  });

  return report;
}

/**
 * @fileoverview DOM操作ユーティリティ
 *
 * STB XMLドキュメントのDOM操作を統一的に扱うためのヘルパー関数群
 * namespace fallback メカニズムにより、STB 2.0.2 と 2.1.0 の両方に対応
 *
 * @module common/stb/utils/domHelpers
 */

/**
 * STB namespace URI
 * @type {string}
 */
const STB_NAMESPACE = 'https://www.building-smart.or.jp/dl/stbridge';

/**
 * DOM要素を namespace 付きまたは namespace なしで検索
 *
 * @param {Document|Element} xmlDoc - XMLドキュメントまたは要素
 * @param {string} selector - CSSセレクタ (タグ名)
 * @param {string} [namespaceURI=STB_NAMESPACE] - namespace URI
 * @returns {Element|null} 最初にマッチした要素、または null
 *
 * @example
 * const column = querySelector(xmlDoc, 'StbSecColumn_RC');
 * // STB namespace 付きで検索し、失敗したら namespace なしで検索
 */
export function querySelector(xmlDoc, selector, namespaceURI = STB_NAMESPACE) {
  if (!xmlDoc) {
    return null;
  }

  try {
    // Step 1: namespace 付きで検索
    let elements = xmlDoc.getElementsByTagNameNS(namespaceURI, selector);
    if (elements && elements.length > 0) {
      return elements[0];
    }

    // Step 2: namespace なしで検索
    elements = xmlDoc.getElementsByTagName(selector);
    if (elements && elements.length > 0) {
      return elements[0];
    }

    return null;
  } catch (error) {
    console.warn(`querySelector error for selector "${selector}":`, error);
    return null;
  }
}

/**
 * DOM要素を namespace 付きまたは namespace なしで検索 (全て)
 *
 * @param {Document|Element} xmlDoc - XMLドキュメントまたは要素
 * @param {string} selector - CSSセレクタ (タグ名)
 * @param {string} [namespaceURI=STB_NAMESPACE] - namespace URI
 * @returns {Element[]} マッチした要素の配列
 *
 * @example
 * const columns = querySelectorAll(xmlDoc, 'StbSecColumn_RC');
 * // STB namespace 付きで検索し、結果を合併（重複は排除）
 */
export function querySelectorAll(xmlDoc, selector, namespaceURI = STB_NAMESPACE) {
  if (!xmlDoc) {
    return [];
  }

  try {
    const results = [];
    const resultSet = new Set(); // 重複排除用

    // Step 1: namespace 付きで検索
    let elements = xmlDoc.getElementsByTagNameNS(namespaceURI, selector);
    if (elements && elements.length > 0) {
      for (let i = 0; i < elements.length; i++) {
        const elem = elements[i];
        // オブジェクト参照をキーとして使用（重複排除）
        if (!resultSet.has(elem)) {
          results.push(elem);
          resultSet.add(elem);
        }
      }
    }

    // Step 2: namespace なしで検索
    elements = xmlDoc.getElementsByTagName(selector);
    if (elements && elements.length > 0) {
      for (let i = 0; i < elements.length; i++) {
        const elem = elements[i];
        if (!resultSet.has(elem)) {
          results.push(elem);
          resultSet.add(elem);
        }
      }
    }

    return results;
  } catch (error) {
    console.warn(`querySelectorAll error for selector "${selector}":`, error);
    return [];
  }
}

/**
 * 指定されたタグ名の要素を namespace fallback で取得
 *
 * @param {Document|Element} xmlDoc - XMLドキュメントまたは要素
 * @param {string} tagName - タグ名
 * @param {string} [namespaceURI=STB_NAMESPACE] - namespace URI
 * @returns {HTMLCollection|NodeList} 要素のコレクション
 *
 * @example
 * const elements = getElementByTagNameWithFallback(xmlDoc, 'StbSecBeam_RC');
 */
export function getElementByTagNameWithFallback(xmlDoc, tagName, namespaceURI = STB_NAMESPACE) {
  if (!xmlDoc) {
    return [];
  }

  try {
    // Step 1: namespace 付きで取得
    let elements = xmlDoc.getElementsByTagNameNS(namespaceURI, tagName);
    if (elements && elements.length > 0) {
      return elements;
    }

    // Step 2: namespace なしで取得
    elements = xmlDoc.getElementsByTagName(tagName);
    if (elements && elements.length > 0) {
      return elements;
    }

    // 空のコレクションを返す
    return xmlDoc.getElementsByTagName('_nonexistent_tag_');
  } catch (error) {
    console.warn(`getElementByTagNameWithFallback error for tagName "${tagName}":`, error);
    return xmlDoc.getElementsByTagName('_nonexistent_tag_');
  }
}

/**
 * 要素が指定されたタグ名かどうかを確認
 * namespace に依存しない比較
 *
 * @param {Element} element - 確認対象の要素
 * @param {string} tagName - タグ名
 * @returns {boolean} タグ名がマッチした場合 true
 *
 * @example
 * if (isElementTag(elem, 'StbSecColumn_RC')) {
 *   // ...
 * }
 */
export function isElementTag(element, tagName) {
  if (!element) {
    return false;
  }

  // localName は namespace を除いたタグ名
  // tagName は full qualified name を含む可能性あり
  const elemLocalName = element.localName || element.tagName;
  return elemLocalName === tagName || element.tagName === tagName;
}

/**
 * 要素の属性値を namespace に依存しないで取得
 * 属性が見つからない場合は デフォルト値 を返す
 *
 * @param {Element} element - 対象要素
 * @param {string} attributeName - 属性名
 * @param {string} [defaultValue=''] - デフォルト値
 * @returns {string} 属性値またはデフォルト値
 *
 * @example
 * const value = getAttributeValue(elem, 'N_main_X', '0');
 */
export function getAttributeValue(element, attributeName, defaultValue = '') {
  if (!element) {
    return defaultValue;
  }

  try {
    const value = element.getAttribute(attributeName);
    // Handle both null (standard DOM) and empty string (@xmldom/xmldom)
    return (value !== null && value !== '') ? value : defaultValue;
  } catch (error) {
    console.warn(`getAttributeValue error for attribute "${attributeName}":`, error);
    return defaultValue;
  }
}

/**
 * 複数の候補属性から値を取得（cascade）
 * 最初に見つかった属性値を返す
 *
 * @param {Element} element - 対象要素
 * @param {string[]} attributeCandidates - 属性名の配列（優先順）
 * @param {string} [defaultValue=''] - デフォルト値
 * @returns {string} 最初に見つかった属性値、またはデフォルト値
 *
 * @example
 * const mainBar = getAttributeValueCascade(elem, [
 *   'N_main_X_1st',   // v2.0.2
 *   'N_main_X',       // v1.x
 *   'count_main_X'    // legacy
 * ], '0');
 */
export function getAttributeValueCascade(element, attributeCandidates, defaultValue = '') {
  if (!element || !Array.isArray(attributeCandidates)) {
    return defaultValue;
  }

  for (const attrName of attributeCandidates) {
    const value = getAttributeValue(element, attrName);
    if (value && value !== '') {
      return value;
    }
  }

  return defaultValue;
}

/**
 * 要素の直下の子要素を指定タグ名で検索
 *
 * @param {Element} parentElement - 親要素
 * @param {string} childTagName - 子要素のタグ名
 * @returns {Element[]} マッチした子要素の配列
 *
 * @example
 * const figures = getChildElements(section, 'StbSecFigureColumn_RC');
 */
export function getChildElements(parentElement, childTagName) {
  if (!parentElement) {
    return [];
  }

  const children = [];
  for (let i = 0; i < parentElement.childNodes.length; i++) {
    const child = parentElement.childNodes[i];
    // nodeType === 1 は ELEMENT_NODE
    if (child.nodeType === 1 && isElementTag(child, childTagName)) {
      children.push(child);
    }
  }
  return children;
}

export { STB_NAMESPACE };

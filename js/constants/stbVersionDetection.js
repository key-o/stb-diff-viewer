/**
 * @fileoverview STBバージョン検出ユーティリティ
 *
 * 全レイヤーから参照可能な共有ユーティリティ。
 *
 * @module constants/stbVersionDetection
 */

const ROOT_ELEMENT_NAMES = ['ST-Bridge', 'ST_BRIDGE'];
const STB_NAMESPACE = 'https://www.building-smart.or.jp/dl/stbridge';

/**
 * Find the root ST-Bridge element
 * @param {Document} xmlDoc - Parsed XML document
 * @returns {Element|null} Root element or null
 */
export function findRootElement(xmlDoc) {
  if (!xmlDoc) return null;
  for (const name of ROOT_ELEMENT_NAMES) {
    let elements = xmlDoc.getElementsByTagNameNS(STB_NAMESPACE, name);
    if (elements.length > 0) return elements[0];
    elements = xmlDoc.getElementsByTagName(name);
    if (elements.length > 0) return elements[0];
  }
  return null;
}

/**
 * Detect the STB version from an XML document
 * @param {Document} xmlDoc - Parsed XML document
 * @returns {string} Version string ('2.0.2', '2.1.0', or 'unknown')
 */
export function detectStbVersion(xmlDoc) {
  const root = findRootElement(xmlDoc);
  if (!root) return 'unknown';
  const version = root.getAttribute('version');
  if (!version) return 'unknown';
  if (version.startsWith('2.0')) return '2.0.2';
  if (version.startsWith('2.1')) return '2.1.0';
  return 'unknown';
}

/**
 * Check if the version is STB 2.1.0
 * @param {Document} xmlDoc - Parsed XML document
 * @returns {boolean} True if version is 2.1.0
 */
export function isVersion210(xmlDoc) {
  return detectStbVersion(xmlDoc) === '2.1.0';
}

/**
 * Check if the version is STB 2.0.2
 * @param {Document} xmlDoc - Parsed XML document
 * @returns {boolean} True if version is 2.0.2
 */
export function isVersion202(xmlDoc) {
  return detectStbVersion(xmlDoc) === '2.0.2';
}

/**
 * Get detailed version information
 * @param {Document} xmlDoc - Parsed XML document
 * @returns {Object} Version information object
 */
export function getVersionInfo(xmlDoc) {
  const root = findRootElement(xmlDoc);
  if (!root) {
    return {
      version: 'unknown',
      normalizedVersion: 'unknown',
      rawVersion: null,
      rootElementName: null,
      isSupported: false,
    };
  }
  const rawVersion = root.getAttribute('version');
  const normalizedVersion = detectStbVersion(xmlDoc);
  return {
    version: normalizedVersion,
    normalizedVersion,
    rawVersion,
    rootElementName: root.tagName || root.localName,
    isSupported: normalizedVersion === '2.0.2' || normalizedVersion === '2.1.0',
  };
}

/**
 * Compare two version strings
 * @param {string} versionA - First version
 * @param {string} versionB - Second version
 * @returns {boolean} True if versions are the same
 */
export function isSameVersion(versionA, versionB) {
  const normalizeVersion = (v) => {
    if (v?.startsWith('2.0')) return '2.0.2';
    if (v?.startsWith('2.1')) return '2.1.0';
    return v;
  };
  return normalizeVersion(versionA) === normalizeVersion(versionB);
}

export { ROOT_ELEMENT_NAMES, STB_NAMESPACE };

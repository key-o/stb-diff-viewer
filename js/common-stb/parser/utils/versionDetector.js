/**
 * @fileoverview STB Version Detector
 *
 * ST-Bridge XMLファイルのバージョンを検出するユーティリティ
 * STB 2.0.2 と 2.1.0 の両方に対応
 *
 * @module common/stb/parser/utils/versionDetector
 */

/**
 * Valid root element names for STB files
 */
const ROOT_ELEMENT_NAMES = ['ST-Bridge', 'ST_BRIDGE'];

/**
 * STB namespace URI
 */
const STB_NAMESPACE = 'https://www.building-smart.or.jp/dl/stbridge';

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

  // Normalize version to major.minor format for comparison
  if (version.startsWith('2.0')) return '2.0.2';
  if (version.startsWith('2.1')) return '2.1.0';

  return 'unknown';
}

/**
 * Find the root ST-Bridge element
 * @param {Document} xmlDoc - Parsed XML document
 * @returns {Element|null} Root element or null
 */
export function findRootElement(xmlDoc) {
  if (!xmlDoc) return null;

  // Try each possible root element name
  for (const name of ROOT_ELEMENT_NAMES) {
    // Try with namespace
    let elements = xmlDoc.getElementsByTagNameNS(STB_NAMESPACE, name);
    if (elements.length > 0) return elements[0];

    // Try without namespace
    elements = xmlDoc.getElementsByTagName(name);
    if (elements.length > 0) return elements[0];
  }

  return null;
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
 * Compare two version strings
 * @param {string} versionA - First version
 * @param {string} versionB - Second version
 * @returns {boolean} True if versions are the same
 */
export function isSameVersion(versionA, versionB) {
  // Normalize versions for comparison
  const normalizeVersion = (v) => {
    if (v?.startsWith('2.0')) return '2.0.2';
    if (v?.startsWith('2.1')) return '2.1.0';
    return v;
  };

  return normalizeVersion(versionA) === normalizeVersion(versionB);
}

export { ROOT_ELEMENT_NAMES, STB_NAMESPACE };

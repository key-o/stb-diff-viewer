/**
 * XML Helper Utilities for STB Version Converter
 */

import { parseString, Builder } from 'xml2js';

// Root element names (both forms are valid in STB)
export const ROOT_ELEMENT_NAMES = ['ST-Bridge', 'ST_BRIDGE'];

/**
 * Get the root element from STB object
 * @param {object} stbRoot - Parsed STB XML object
 * @returns {object|null} Root element info { name, element } or null
 */
export function getRootElement(stbRoot) {
  for (const name of ROOT_ELEMENT_NAMES) {
    if (stbRoot[name]) {
      return { name, element: stbRoot[name] };
    }
  }
  return null;
}

/**
 * Get the ST-Bridge root array (handles both ST-Bridge and ST_BRIDGE)
 * @param {object} stbRoot - Parsed STB XML object
 * @returns {Array|null} Root element array or null
 */
export function getStbRoot(stbRoot) {
  const root = getRootElement(stbRoot);
  return root?.element ?? null;
}

/**
 * Parse XML string to JavaScript object
 * @param {string} xmlString - XML content
 * @returns {Promise<object>} Parsed object
 */
export function parseXml(xmlString) {
  return new Promise((resolve, reject) => {
    parseString(
      xmlString,
      {
        explicitArray: true,
        preserveChildrenOrder: true,
        attrkey: '$',
        charkey: '_',
      },
      (err, result) => {
        if (err) reject(err);
        else resolve(result);
      },
    );
  });
}

/**
 * Build XML string from JavaScript object
 * @param {object} obj - JavaScript object
 * @returns {string} XML string
 */
export function buildXml(obj) {
  const builder = new Builder({
    xmldec: { version: '1.0', encoding: 'UTF-8' },
    renderOpts: { pretty: true, indent: '  ', newline: '\n' },
    attrkey: '$',
    charkey: '_',
  });
  return builder.buildObject(obj);
}

/**
 * Deep clone an object
 * @param {object} obj - Object to clone
 * @returns {object} Cloned object
 */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Rename a key in an object
 * @param {object} obj - Target object
 * @param {string} oldKey - Old key name
 * @param {string} newKey - New key name
 */
export function renameKey(obj, oldKey, newKey) {
  if (obj && obj[oldKey] !== undefined) {
    obj[newKey] = obj[oldKey];
    delete obj[oldKey];
  }
}

/**
 * Navigate through XML structure using an array-based path
 * @param {object|Array} root - Root element (can be array or object)
 * @param {Array<string>} pathArray - Path segments (e.g., ['StbModel', 'StbMembers', 'StbColumns', 'StbColumn'])
 * @returns {Array|null} Array of elements at the path, or null if not found
 * @example
 * // Navigate to all StbColumn elements
 * const columns = navigateXmlPath(root, ['StbModel', 'StbMembers', 'StbColumns', 'StbColumn']);
 */
export function navigateXmlPath(root, pathArray) {
  if (!pathArray || pathArray.length === 0) return null;

  let current = Array.isArray(root) ? root[0] : root;

  // Navigate through all segments except the last one
  for (let i = 0; i < pathArray.length - 1; i++) {
    const segment = pathArray[i];
    if (!current || !current[segment]) return null;

    // XML elements are stored as arrays in xml2js
    current = current[segment][0];
    if (!current) return null;
  }

  // Get the final segment
  const lastSegment = pathArray[pathArray.length - 1];
  const result = current?.[lastSegment];

  // Return as array for consistency
  if (!result) return null;
  return Array.isArray(result) ? result : [result];
}


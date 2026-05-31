/**
 * Main STB Version Converter
 */

import { parseXml, buildXml, deepClone } from './utils/xml-helper.js';
import logger from './utils/converter-logger.js';
import { getVersion, getRootElement } from './rules/type1-value-changes.js';
import convert202to211 from './v202-to-v211.js';
import convert211to202 from './v211-to-v202.js';

/**
 * Convert STB XML content to a different version.
 *
 * Supported paths:
 *   2.0.2 -> 2.1.1  (direct)
 *   2.1.1 -> 2.0.2  (direct)
 *   2.1.0 -> 2.0.2  (treated as 2.1.1 input)
 *   2.1.0 -> 2.1.1  (version label update only — no schema diff)
 *   2.1.1 -> 2.1.0  (version label update only — no schema diff)
 *
 * @param {string} xmlContent - STB XML content
 * @param {string} targetVersion - Target version string
 * @param {object} options - Conversion options
 * @returns {Promise<object>} Conversion result
 */
export async function convert(xmlContent, targetVersion, options = {}) {
  logger.clear();

  let stbRoot;
  try {
    stbRoot = await parseXml(xmlContent);
  } catch (error) {
    throw new Error(`Failed to parse XML: ${error.message}`);
  }

  const currentVersion = getVersion(stbRoot);
  if (!currentVersion) {
    throw new Error('Could not determine STB version');
  }

  logger.info(`Input version: ${currentVersion}`);
  logger.info(`Target version: ${targetVersion}`);

  const normalizedTarget = normalizeVersion(targetVersion);
  if (!['2.0.2', '2.1.0', '2.1.1'].includes(normalizedTarget)) {
    throw new Error(`Unsupported target version: ${targetVersion}. Supported: 2.0.2, 2.1.0, 2.1.1`);
  }

  const normalizedCurrent = normalizeVersion(currentVersion);
  if (normalizedCurrent === normalizedTarget) {
    logger.info('Source and target versions are the same. No conversion needed.');
    return {
      xml: xmlContent,
      converted: false,
      summary: logger.getSummary(),
    };
  }

  let convertedRoot;

  if (is21x(normalizedCurrent) && is21x(normalizedTarget)) {
    // 2.1.0 <-> 2.1.1: only the version label differs
    convertedRoot = deepClone(stbRoot);
    setVersion(convertedRoot, normalizedTarget);
  } else if (is21x(normalizedTarget)) {
    // 2.0.2 -> 2.1.x: run full 202->211 pipeline, then set requested label
    convertedRoot = convert202to211(stbRoot, options);
    setVersion(convertedRoot, normalizedTarget);
  } else {
    // 2.1.x -> 2.0.2: treat any 2.1.x input as 2.1.1 for reverse conversion
    convertedRoot = convert211to202(stbRoot, options);
  }

  const outputXml = buildXml(convertedRoot);

  return {
    xml: outputXml,
    converted: true,
    sourceVersion: currentVersion,
    targetVersion: normalizedTarget,
    summary: logger.getSummary(),
  };
}

/**
 * Normalize version string to canonical form
 * @param {string} version
 * @returns {string}
 */
function normalizeVersion(version) {
  const v = version.toLowerCase().replace(/^v/, '');
  if (v === '202' || v === '2.0' || v.startsWith('2.0.')) return '2.0.2';
  if (v === '211' || v === '2.1.1') return '2.1.1';
  if (v === '210' || v === '2.1' || v.startsWith('2.1.')) return '2.1.0';
  return v;
}

/** @param {string} version - normalized */
function is21x(version) {
  return version === '2.1.0' || version === '2.1.1';
}

/**
 * Overwrite the root version attribute without other schema changes.
 * @param {object} stbRoot
 * @param {string} version
 */
function setVersion(stbRoot, version) {
  const root = getRootElement(stbRoot);
  const rootData = Array.isArray(root?.element) ? root.element[0] : root?.element;
  if (!rootData) return;

  const attrs = rootData.$ || {};
  const currentVersion = attrs.version ?? null;
  attrs.version = version;
  rootData.$ = attrs;

  if (currentVersion !== version) {
    logger.info(`Version updated: ${currentVersion} -> ${version}`);
  }
}

/**
 * Detect STB version from XML content
 * @param {string} xmlContent
 * @returns {Promise<string|null>}
 */
export async function detectVersion(xmlContent) {
  try {
    const stbRoot = await parseXml(xmlContent);
    return getVersion(stbRoot);
  } catch {
    return null;
  }
}

/**
 * Validate STB XML structure
 * @param {string} xmlContent
 * @returns {Promise<object>}
 */
export async function validate(xmlContent) {
  const errors = [];
  const warnings = [];

  try {
    const stbRoot = await parseXml(xmlContent);

    const root = getRootElement(stbRoot);
    if (!root) {
      errors.push('Missing ST-Bridge root element');
      return { valid: false, errors, warnings };
    }
    const rootData = Array.isArray(root.element) ? root.element[0] : root.element;

    const version = getVersion(stbRoot);
    if (!version) {
      warnings.push('Missing version attribute');
    } else if (!['2.0.2', '2.1.0', '2.1.1'].includes(normalizeVersion(version))) {
      warnings.push(`Unsupported version: ${version}`);
    }

    if (!rootData?.['StbModel']) {
      errors.push('Missing StbModel element');
    }
  } catch (error) {
    errors.push(`XML parse error: ${error.message}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export { logger };

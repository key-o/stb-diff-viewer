/**
 * Main STB Version Converter
 */

import { parseXml, buildXml } from './utils/xml-helper.js';
import logger from './utils/logger.js';
import { getVersion } from './rules/type1-value-changes.js';
import convert202to210 from './v202-to-v210.js';
import convert210to202 from './v210-to-v202.js';

/**
 * Convert STB XML content to a different version
 * @param {string} xmlContent - STB XML content
 * @param {string} targetVersion - Target version ('2.0.2' or '2.1.0')
 * @param {object} options - Conversion options
 * @returns {Promise<object>} Conversion result
 */
export async function convert(xmlContent, targetVersion, options = {}) {
  logger.clear();

  // Parse XML
  let stbRoot;
  try {
    stbRoot = await parseXml(xmlContent);
  } catch (error) {
    throw new Error(`Failed to parse XML: ${error.message}`);
  }

  // Get current version
  const currentVersion = getVersion(stbRoot);
  if (!currentVersion) {
    throw new Error('Could not determine STB version');
  }

  logger.info(`Input version: ${currentVersion}`);
  logger.info(`Target version: ${targetVersion}`);

  // Validate target version
  const normalizedTarget = normalizeVersion(targetVersion);
  if (!['2.0.2', '2.1.0'].includes(normalizedTarget)) {
    throw new Error(`Unsupported target version: ${targetVersion}. Supported: 2.0.2, 2.1.0`);
  }

  // Check if conversion is needed
  const normalizedCurrent = normalizeVersion(currentVersion);
  if (normalizedCurrent === normalizedTarget) {
    logger.info('Source and target versions are the same. No conversion needed.');
    return {
      xml: xmlContent,
      converted: false,
      summary: logger.getSummary(),
    };
  }

  // Perform conversion
  let convertedRoot;
  if (normalizedTarget === '2.1.0') {
    convertedRoot = convert202to210(stbRoot, options);
  } else {
    convertedRoot = convert210to202(stbRoot, options);
  }

  // Build output XML
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
 * Normalize version string
 * @param {string} version - Version string
 * @returns {string} Normalized version
 */
function normalizeVersion(version) {
  const v = version.toLowerCase().replace(/^v/, '');

  // Handle shorthand versions
  if (v === '202' || v === '2.0' || v.startsWith('2.0.')) {
    return '2.0.2';
  }
  if (v === '210' || v === '2.1' || v.startsWith('2.1.')) {
    return '2.1.0';
  }

  return v;
}

/**
 * Detect STB version from XML content
 * @param {string} xmlContent - STB XML content
 * @returns {Promise<string|null>} Version string or null
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
 * @param {string} xmlContent - STB XML content
 * @returns {Promise<object>} Validation result
 */
export async function validate(xmlContent) {
  const errors = [];
  const warnings = [];

  try {
    const stbRoot = await parseXml(xmlContent);

    // Check root element
    if (!stbRoot['ST-Bridge']) {
      errors.push('Missing ST-Bridge root element');
      return { valid: false, errors, warnings };
    }

    // Check version
    const version = getVersion(stbRoot);
    if (!version) {
      warnings.push('Missing version attribute');
    } else if (!['2.0.2', '2.1.0'].includes(normalizeVersion(version))) {
      warnings.push(`Unsupported version: ${version}`);
    }

    // Check required elements
    const model = stbRoot['ST-Bridge'][0]?.['StbModel'];
    if (!model) {
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

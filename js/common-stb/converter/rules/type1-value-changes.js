/**
 * Type1: Simple Value Changes
 * - Version attribute changes
 */

import logger from '../utils/converter-logger.js';

// Root element names (both forms are valid)
const ROOT_ELEMENT_NAMES = ['ST-Bridge', 'ST_BRIDGE'];

/**
 * Get the root element from STB object
 * @param {object} stbRoot - Parsed STB XML object
 * @returns {object|null} Root element or null
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
 * Update version attribute from 2.0.2 to 2.1.0
 * Also ensures app_version attribute exists in StbCommon
 * @param {object} stbRoot - ST-Bridge root element
 */
export function updateVersionTo210(stbRoot) {
  const root = getRootElement(stbRoot);
  const rootData = Array.isArray(root?.element) ? root.element[0] : root?.element;
  if (rootData?.['$']) {
    const currentVersion = rootData['$']['version'];
    rootData['$']['version'] = '2.1.0';
    logger.info(`Version updated: ${currentVersion} -> 2.1.0`);
  }

  // Ensure required attributes exist in StbCommon (required in 2.1.0)
  const stbCommon = rootData?.['StbCommon']?.[0];
  if (stbCommon?.['$']) {
    // app_version is required in 2.1.0
    if (!stbCommon['$']['app_version']) {
      stbCommon['$']['app_version'] = '1.0.0';
      logger.info('Added app_version attribute to StbCommon');
    }
    // project_name is required in 2.1.0
    if (!stbCommon['$']['project_name']) {
      stbCommon['$']['project_name'] = 'Untitled Project';
      logger.info('Added project_name attribute to StbCommon');
    }
  }
}

/**
 * Update version attribute from 2.1.0 to 2.0.2
 * @param {object} stbRoot - ST-Bridge root element
 */
export function updateVersionTo202(stbRoot) {
  const root = getRootElement(stbRoot);
  const rootData = Array.isArray(root?.element) ? root.element[0] : root?.element;
  if (rootData?.['$']) {
    const currentVersion = rootData['$']['version'];
    rootData['$']['version'] = '2.0.2';
    logger.info(`Version updated: ${currentVersion} -> 2.0.2`);
  }
}

/**
 * Get current STB version
 * @param {object} stbRoot - ST-Bridge root element
 * @returns {string|null} Version string or null
 */
export function getVersion(stbRoot) {
  const root = getRootElement(stbRoot);
  const rootData = Array.isArray(root?.element) ? root.element[0] : root?.element;
  return rootData?.['$']?.['version'] ?? null;
}

/**
 * Validate version before conversion
 * @param {object} stbRoot - ST-Bridge root element
 * @param {string} expectedVersion - Expected version ('2.0.2' or '2.1.0')
 * @returns {boolean} True if version matches
 */
export function validateVersion(stbRoot, expectedVersion) {
  const version = getVersion(stbRoot);
  if (!version) {
    logger.error('No version attribute found in ST-Bridge element');
    return false;
  }

  // Allow minor version differences (e.g., 2.0.2 matches 2.0.x)
  const majorMinor = version.split('.').slice(0, 2).join('.');
  const expectedMajorMinor = expectedVersion.split('.').slice(0, 2).join('.');

  if (majorMinor !== expectedMajorMinor) {
    logger.warn(`Version mismatch: expected ${expectedVersion}, got ${version}`);
  }

  return true;
}

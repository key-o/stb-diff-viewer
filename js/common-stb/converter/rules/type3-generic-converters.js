/**
 * Type3: Generic Attribute Conversion Functions
 * Reusable functions for attribute removal and addition based on config
 */

import logger from '../utils/converter-logger.js';
import { getStbRoot, navigateXmlPath } from '../utils/xml-helper.js';
import {
  REMOVED_IN_210,
  ADDED_IN_210,
  RESTORED_IN_202,
  resolveAttributes,
  resolveDefaults,
} from './type3-attribute-config.js';

/**
 * Generic function to remove attributes from elements
 * @param {object} stbRoot - ST-Bridge root element
 * @param {string} elementType - Element type name
 * @param {string} targetVersion - Target version ('210' or '202')
 * @returns {number} Number of attributes removed
 */
export function removeAttributes(stbRoot, elementType, targetVersion) {
  const configKey = targetVersion === '210' ? REMOVED_IN_210 : ADDED_IN_210;
  const elementConfig = configKey[elementType];

  if (!elementConfig) {
    return 0;
  }

  const attributes = resolveAttributes(configKey, elementType);
  if (!attributes) {
    return 0;
  }

  const root = getStbRoot(stbRoot);
  if (!root) return 0;

  const elements = navigateXmlPath(root, elementConfig.path);
  if (!elements) return 0;

  let count = 0;
  elements.forEach((element) => {
    const attrs = element['$'];
    if (!attrs) return;

    attributes.forEach((key) => {
      if (attrs[key] !== undefined) {
        delete attrs[key];
        count++;
      }
    });
  });

  if (count > 0) {
    logger.info(`${elementType}: Removed ${count} attributes for v${targetVersion}`);
  } else {
    logger.debug(`${elementType}: no attributes removed`);
  }

  return count;
}

/**
 * Generic function to add default attributes to elements
 * @param {object} stbRoot - ST-Bridge root element
 * @param {string} elementType - Element type name
 * @param {string} targetVersion - Target version ('210' or '202')
 * @returns {number} Number of attributes added
 */
export function addDefaultAttributes(stbRoot, elementType, targetVersion) {
  const configKey = targetVersion === '210' ? ADDED_IN_210 : RESTORED_IN_202;
  const elementConfig = configKey[elementType];

  if (!elementConfig) {
    return 0;
  }

  const defaults = resolveDefaults(configKey, elementType);
  if (!defaults) {
    return 0;
  }

  const root = getStbRoot(stbRoot);
  if (!root) return 0;

  const elements = navigateXmlPath(root, elementConfig.path);
  if (!elements) return 0;

  let count = 0;
  elements.forEach((element) => {
    const attrs = element['$'] || (element['$'] = {});

    Object.entries(defaults).forEach(([key, value]) => {
      if (attrs[key] === undefined) {
        attrs[key] = value;
        count++;
      }
    });
  });

  if (count > 0) {
    logger.info(`${elementType}: Added ${count} default attributes for v${targetVersion}`);
  }

  return count;
}

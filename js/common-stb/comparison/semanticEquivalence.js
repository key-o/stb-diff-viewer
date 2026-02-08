/**
 * Semantic Equivalence Definitions for STB Version Comparison
 * Handles version-specific attributes and semantic equivalence between STB 2.0.2 and 2.1.0
 */

import {
  normalizeElementName,
  areElementNamesEquivalent,
} from '../parser/utils/elementNameMapping.js';

/**
 * Version-specific attributes that exist only in certain versions
 */
export const VERSION_SPECIFIC_ATTRIBUTES = {
  '2.0.2': {
    StbColumn: ['condition_bottom', 'condition_top'],
  },
  '2.1.0': {
    StbStory: ['level_name', 'kind', 'strength_concrete'],
    StbSlab: ['kind_structure', 'kind_slab', 'direction_load', 'isFoundation'],
    StbWall: ['kind_structure'],
    StbFoundation: ['kind_structure'],
  },
};

/**
 * Attribute name equivalents between versions
 * Key: v202 name, Value: v210 name
 */
export const ATTRIBUTE_EQUIVALENTS = {
  // Open element attributes
  position_X: 'offset_X',
  position_Y: 'offset_Y',
  length_X: 'width',
  length_Y: 'height',
};

/**
 * Reverse attribute equivalents (v210 -> v202)
 */
export const ATTRIBUTE_EQUIVALENTS_REVERSE = Object.fromEntries(
  Object.entries(ATTRIBUTE_EQUIVALENTS).map(([k, v]) => [v, k]),
);

/**
 * Check if an attribute is version-specific
 * @param {string} elementType - Element type (e.g., 'StbColumn')
 * @param {string} attrName - Attribute name
 * @param {string} version - Version ('2.0.2' or '2.1.0')
 * @returns {boolean} True if attribute is version-specific
 */
export function isVersionSpecificAttribute(elementType, attrName, version) {
  const attrs = VERSION_SPECIFIC_ATTRIBUTES[version]?.[elementType];
  return attrs?.includes(attrName) || false;
}

/**
 * Get all version-specific attributes for an element type
 * @param {string} elementType - Element type
 * @param {string} version - Version
 * @returns {string[]} Array of version-specific attribute names
 */
export function getVersionSpecificAttributes(elementType, version) {
  return VERSION_SPECIFIC_ATTRIBUTES[version]?.[elementType] || [];
}

/**
 * Normalize attribute name to canonical format
 * @param {string} attrName - Attribute name
 * @returns {string} Normalized attribute name
 */
export function normalizeAttributeName(attrName) {
  return ATTRIBUTE_EQUIVALENTS[attrName] || attrName;
}

/**
 * Check if two attribute names are semantically equivalent
 * @param {string} nameA - First attribute name
 * @param {string} nameB - Second attribute name
 * @returns {boolean} True if semantically equivalent
 */
export function areAttributeNamesEquivalent(nameA, nameB) {
  if (nameA === nameB) return true;

  const normalizedA = normalizeAttributeName(nameA);
  const normalizedB = normalizeAttributeName(nameB);

  return normalizedA === normalizedB;
}

/**
 * Classification of difference types
 */
export const DIFF_TYPE = {
  REAL_DIFF: 'real_diff', // Actual value difference
  VERSION_SPECIFIC: 'version_specific', // Difference due to version-specific attribute
  ELEMENT_NAME: 'element_name', // Difference in element naming only
  STRUCTURAL: 'structural', // Structural difference (e.g., nested vs flat)
};

/**
 * Classify a difference between two elements
 * @param {Object} diffInfo - Difference information
 * @param {string} versionA - Version of element A
 * @param {string} versionB - Version of element B
 * @returns {string} Difference type from DIFF_TYPE
 */
export function classifyDifference(diffInfo, versionA, versionB) {
  const { attribute, elementType, valueA, valueB } = diffInfo;

  // Check if attribute is version-specific
  if (valueA !== undefined && valueB === undefined) {
    if (isVersionSpecificAttribute(elementType, attribute, versionA)) {
      return DIFF_TYPE.VERSION_SPECIFIC;
    }
  }

  if (valueB !== undefined && valueA === undefined) {
    if (isVersionSpecificAttribute(elementType, attribute, versionB)) {
      return DIFF_TYPE.VERSION_SPECIFIC;
    }
  }

  // Check if attribute names are equivalent
  if (areAttributeNamesEquivalent(attribute, diffInfo.otherAttribute)) {
    if (valueA === valueB) {
      return DIFF_TYPE.ELEMENT_NAME;
    }
  }

  return DIFF_TYPE.REAL_DIFF;
}

/**
 * Compare two elements with version awareness
 * @param {Object} elemA - First element data
 * @param {Object} elemB - Second element data
 * @param {Object} options - Comparison options
 * @returns {Object} Comparison result
 */
export function compareElementsWithVersionAwareness(elemA, elemB, options = {}) {
  const { versionA = '2.0.2', versionB = '2.1.0' } = options;

  const differences = [];
  const versionOnlyDifferences = [];

  const attrsA = elemA.attrs || elemA.attributes || {};
  const attrsB = elemB.attrs || elemB.attributes || {};

  // Get all attribute names
  const allAttrs = new Set([...Object.keys(attrsA), ...Object.keys(attrsB)]);

  for (const attr of allAttrs) {
    const normalizedAttr = normalizeAttributeName(attr);
    const valueA = attrsA[attr];
    const valueB = attrsB[attr] ?? attrsB[normalizedAttr];

    // Determine element type
    const elementType = elemA.type || elemB.type || 'unknown';

    // Check version-specific attributes
    const isVersionSpecificA = isVersionSpecificAttribute(elementType, attr, versionA);
    const isVersionSpecificB = isVersionSpecificAttribute(elementType, attr, versionB);

    if (isVersionSpecificA && valueB === undefined) {
      // A-only attribute (version-specific)
      versionOnlyDifferences.push({
        attribute: attr,
        valueA,
        valueB: undefined,
        isVersionSpecific: true,
        version: versionA,
      });
      continue;
    }

    if (isVersionSpecificB && valueA === undefined) {
      // B-only attribute (version-specific)
      versionOnlyDifferences.push({
        attribute: attr,
        valueA: undefined,
        valueB,
        isVersionSpecific: true,
        version: versionB,
      });
      continue;
    }

    // Compare values
    if (valueA !== valueB) {
      differences.push({
        attribute: attr,
        normalizedAttribute: normalizedAttr,
        valueA,
        valueB,
        isVersionSpecific: false,
      });
    }
  }

  return {
    isEqual: differences.length === 0,
    differences,
    versionOnlyDifferences,
    hasRealDifferences: differences.length > 0,
    hasVersionDifferences: versionOnlyDifferences.length > 0,
    isVersionSpecificOnly: differences.length === 0 && versionOnlyDifferences.length > 0,
  };
}

/**
 * Filter comparison results to exclude version-specific differences
 * @param {Object[]} results - Array of comparison results
 * @returns {Object[]} Filtered results
 */
export function filterVersionSpecificDifferences(results) {
  return results.filter((result) => !result.isVersionSpecificOnly);
}

/**
 * Generate a summary of version differences
 * @param {Object} comparisonResult - Full comparison result
 * @returns {Object} Summary object
 */
export function generateVersionDifferenceSummary(comparisonResult) {
  let realDiffCount = 0;
  let versionDiffCount = 0;
  const elementTypes = {};

  for (const [elemType, data] of Object.entries(comparisonResult)) {
    const diffs = data.differences || [];
    const versionDiffs = data.versionOnlyDifferences || [];

    elementTypes[elemType] = {
      realDifferences: diffs.length,
      versionDifferences: versionDiffs.length,
    };

    realDiffCount += diffs.length;
    versionDiffCount += versionDiffs.length;
  }

  return {
    totalRealDifferences: realDiffCount,
    totalVersionDifferences: versionDiffCount,
    byElementType: elementTypes,
  };
}

export { normalizeElementName, areElementNamesEquivalent };

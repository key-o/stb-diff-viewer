/**
 * STB v2.1.0 to v2.0.2 Converter
 */

import logger from './utils/converter-logger.js';
import { deepClone } from './utils/xml-helper.js';
import { updateVersionTo202, validateVersion } from './rules/type1-value-changes.js';
import { renameElementsTo202 } from './rules/type2-element-renaming.js';
import { applyAttributeChangesTo202 } from './rules/type3-attribute-changes.js';
import { applySStructureChangesTo202 } from './rules/type4-s-beam-sections.js';
import { convertOpensTo202 } from './rules/type5-open-elements.js';
import {
  removeNewElementsTo202,
  checkDataLossTo202,
  generateDataLossWarnings,
} from './rules/type6-new-elements.js';
import { convertJointsTo202 } from './rules/type7-joint-elements.js';
import { convertPileSectionsTo202 } from './rules/type11-pile-sections.js';
import { convertBasePlateSectionsTo202 } from './rules/type12-base-plate-sections.js';

/**
 * Convert STB from v2.1.0 to v2.0.2
 * @param {object} stbRoot - Parsed STB XML object
 * @param {object} options - Conversion options
 * @returns {object} Converted STB object
 */
export function convert210to202(stbRoot, options = {}) {
  const { skipValidation = false, preserveOriginal = true, warnDataLoss = true } = options;

  logger.info('Starting conversion: v2.1.0 -> v2.0.2');

  // Validate input version
  if (!skipValidation) {
    validateVersion(stbRoot, '2.1.0');
  }

  // Check for potential data loss
  if (warnDataLoss) {
    const dataLossReport = checkDataLossTo202(stbRoot);
    const warnings = generateDataLossWarnings(dataLossReport);
    warnings.forEach((warning) => logger.warn(warning));
  }

  // Create a deep copy to avoid modifying the original
  const result = preserveOriginal ? deepClone(stbRoot) : stbRoot;

  // Apply conversions in order
  try {
    // Type1: Update version
    updateVersionTo202(result);

    // Type2: Rename elements (reverse mapping)
    renameElementsTo202(result);

    // Type3: Attribute changes (remove v2.1.0 specific)
    applyAttributeChangesTo202(result);

    // Type4: S-beam structure changes (simplify)
    applySStructureChangesTo202(result);

    // Type5: Open element relocation (to old format)
    convertOpensTo202(result);

    // Type7: Joint element relocation (to old format)
    convertJointsTo202(result);

    // Type11: Pile section structure changes (reverse conversion)
    convertPileSectionsTo202(result);

    // Type12: Base plate section structure changes (reverse conversion)
    convertBasePlateSectionsTo202(result);

    // Type6: Remove new elements (should run after Type7 to avoid removing joints)
    removeNewElementsTo202(result);

    logger.info('Conversion completed successfully');
  } catch (error) {
    logger.error(`Conversion failed: ${error.message}`);
    throw error;
  }

  return result;
}

export default convert210to202;

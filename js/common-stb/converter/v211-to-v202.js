/**
 * STB v2.1.1 to v2.0.2 Converter
 *
 * First reverses the v2.1.1 typo-fix renames back to v2.1.0 names,
 * then applies the standard v2.1.0 -> v2.0.2 conversion.
 */

import logger from './utils/converter-logger.js';
import { deepClone } from './utils/xml-helper.js';
import { updateVersionTo202, validateVersion } from './rules/type1-value-changes.js';
import { renameElementsTo202, renameElementsTo210from211 } from './rules/type2-element-renaming.js';
import {
  applyAttributeChangesTo202,
  applyAttributeRenamesTo210from211,
} from './rules/type3-attribute-changes.js';
import { applySStructureChangesTo202 } from './rules/type4-s-beam-sections.js';
import { convertOpensTo202 } from './rules/type5-open-elements.js';
import {
  removeNewElementsTo202,
  checkDataLossTo202,
  generateDataLossWarnings,
} from './rules/type6-new-elements.js';
import { convertJointsTo202 } from './rules/type7-joint-elements.js';
import { convertBarArrangementTo202 } from './rules/type8-bar-arrangement.js';
import { convertSlabSectionsTo202 } from './rules/type9-slab-sections.js';
import { convertSrcBeamSteelSectionsTo202 } from './rules/type10-src-beam-steel-sections.js';
import { convertPileSectionsTo202 } from './rules/type11-pile-sections.js';
import { convertBasePlateSectionsTo202 } from './rules/type12-base-plate-sections.js';
import { reverseBarFoundationDuplicates } from './rules/type13-211-fixups.js';

/**
 * Convert STB from v2.1.1 to v2.0.2
 * @param {object} stbRoot - Parsed STB XML object
 * @param {object} options - Conversion options
 * @returns {object} Converted STB object
 */
export function convert211to202(stbRoot, options = {}) {
  const { skipValidation = false, preserveOriginal = true, warnDataLoss = true } = options;

  logger.info('Starting conversion: v2.1.1 -> v2.0.2');

  if (!skipValidation) {
    validateVersion(stbRoot, '2.1.1');
  }

  if (warnDataLoss) {
    const dataLossReport = checkDataLossTo202(stbRoot);
    const warnings = generateDataLossWarnings(dataLossReport);
    warnings.forEach((warning) => logger.warn(warning));
  }

  const result = preserveOriginal ? deepClone(stbRoot) : stbRoot;

  try {
    // Step 1: Reverse v2.1.1 typo-fix renames -> v2.1.0 names
    renameElementsTo210from211(result);
    applyAttributeRenamesTo210from211(result);

    // Step 2: Standard v2.1.0 -> v2.0.2 conversion
    updateVersionTo202(result);
    renameElementsTo202(result);
    applyAttributeChangesTo202(result);
    applySStructureChangesTo202(result);
    convertOpensTo202(result);
    convertJointsTo202(result);
    convertBarArrangementTo202(result);
    convertSlabSectionsTo202(result);
    convertSrcBeamSteelSectionsTo202(result);
    convertPileSectionsTo202(result);
    convertBasePlateSectionsTo202(result);
    reverseBarFoundationDuplicates(result);
    removeNewElementsTo202(result);

    logger.info('Conversion completed successfully');
  } catch (error) {
    logger.error(`Conversion failed: ${error.message}`);
    throw error;
  }

  return result;
}

export default convert211to202;

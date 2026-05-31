/**
 * STB v2.0.2 to v2.1.1 Converter
 *
 * Applies all v2.0.2 → v2.1.0 conversions, then the additional
 * typo-fix renames introduced in v2.1.1.
 */

import logger from './utils/converter-logger.js';
import { deepClone } from './utils/xml-helper.js';
import { updateVersionTo211, validateVersion } from './rules/type1-value-changes.js';
import {
  renameElementsTo210,
  renameCommonElementsTo210,
  convertHaunchToStraightTo210,
  addOrderToSrcBeamFiguresTo210,
  renameElementsTo211,
} from './rules/type2-element-renaming.js';
import {
  applyAttributeChangesTo210,
  applyAttributeRenamesTo211,
} from './rules/type3-attribute-changes.js';
import { applySchemaComplianceFixups } from './rules/type13-211-fixups.js';
import { applySStructureChangesTo210 } from './rules/type4-s-beam-sections.js';
import { convertOpensTo210 } from './rules/type5-open-elements.js';
import { handleNewElementsTo210 } from './rules/type6-new-elements.js';
import { convertJointsTo210 } from './rules/type7-joint-elements.js';
import { convertBarArrangementTo210 } from './rules/type8-bar-arrangement.js';
import { convertSlabSectionsTo210 } from './rules/type9-slab-sections.js';
import { convertSrcBeamSteelSectionsTo210 } from './rules/type10-src-beam-steel-sections.js';
import { convertPileSectionsTo210 } from './rules/type11-pile-sections.js';
import { convertBasePlateSectionsTo210 } from './rules/type12-base-plate-sections.js';

/**
 * Convert STB from v2.0.2 to v2.1.1
 * @param {object} stbRoot - Parsed STB XML object
 * @param {object} options - Conversion options
 * @returns {object} Converted STB object
 */
export function convert202to211(stbRoot, options = {}) {
  const { skipValidation = false, preserveOriginal = true } = options;

  logger.info('Starting conversion: v2.0.2 -> v2.1.1');

  if (!skipValidation) {
    validateVersion(stbRoot, '2.0.2');
  }

  const result = preserveOriginal ? deepClone(stbRoot) : stbRoot;

  try {
    // --- v2.0.2 -> v2.1.0 steps (identical to v202-to-v210) ---

    updateVersionTo211(result);

    renameElementsTo210(result);
    renameCommonElementsTo210(result);
    convertHaunchToStraightTo210(result);
    addOrderToSrcBeamFiguresTo210(result);

    convertJointsTo210(result);
    convertBarArrangementTo210(result);
    convertSlabSectionsTo210(result);
    convertSrcBeamSteelSectionsTo210(result);
    convertPileSectionsTo210(result);
    convertBasePlateSectionsTo210(result);
    convertOpensTo210(result);

    applyAttributeChangesTo210(result);
    applySStructureChangesTo210(result);
    handleNewElementsTo210(result);

    // --- v2.1.0 -> v2.1.1 typo-fix steps ---

    renameElementsTo211(result);
    applyAttributeRenamesTo211(result);

    // --- Schema compliance fixups (XSD validation errors from v2.0.2 data) ---
    applySchemaComplianceFixups(result);

    logger.info('Conversion completed successfully');
  } catch (error) {
    logger.error(`Conversion failed: ${error.message}`);
    throw error;
  }

  return result;
}

export default convert202to211;

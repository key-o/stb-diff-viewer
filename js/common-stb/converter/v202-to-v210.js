/**
 * STB v2.0.2 to v2.1.0 Converter
 */

import logger from './utils/converter-logger.js';
import { deepClone } from './utils/xml-helper.js';
import { updateVersionTo210, validateVersion } from './rules/type1-value-changes.js';
import {
  renameElementsTo210,
  renameCommonElementsTo210,
  convertHaunchToStraightTo210,
  addOrderToSrcBeamFiguresTo210,
} from './rules/type2-element-renaming.js';
import { applyAttributeChangesTo210 } from './rules/type3-attribute-changes.js';
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
 * Convert STB from v2.0.2 to v2.1.0
 * @param {object} stbRoot - Parsed STB XML object
 * @param {object} options - Conversion options
 * @returns {object} Converted STB object
 */
export function convert202to210(stbRoot, options = {}) {
  const { skipValidation = false, preserveOriginal = true } = options;

  logger.info('Starting conversion: v2.0.2 -> v2.1.0');

  // Validate input version
  if (!skipValidation) {
    validateVersion(stbRoot, '2.0.2');
  }

  // Create a deep copy to avoid modifying the original
  const result = preserveOriginal ? deepClone(stbRoot) : stbRoot;

  // Apply conversions in order
  try {
    // Type1: Update version
    updateVersionTo210(result);

    // Type2: Rename elements
    renameElementsTo210(result);

    // Type2b: Rename StbCommon child elements (case fix)
    renameCommonElementsTo210(result);

    // Type2c: Convert StbSecBeamHaunch to StbSecBeamStraight (lossy conversion for 2.1.0)
    convertHaunchToStraightTo210(result);

    // Type2d: Add order attribute to SRC beam figure elements
    addOrderToSrcBeamFiguresTo210(result);

    // Type7: Joint element relocation (must run before Type3 removes joint attributes)
    convertJointsTo210(result);

    // Type8: Bar arrangement structure changes (must run after Type2 renaming, before Type3 attribute removal)
    convertBarArrangementTo210(result);

    // Type9: RC Slab section structure changes (must run after Type2 renaming)
    convertSlabSectionsTo210(result);

    // Type10: SRC Beam steel section structure changes (must run after Type2 renaming, before Type3)
    convertSrcBeamSteelSectionsTo210(result);

    // Type11: Pile section structure changes (must run after Type2 renaming)
    convertPileSectionsTo210(result);

    // Type12: Base plate section structure changes
    convertBasePlateSectionsTo210(result);

    // Type5: Open element relocation (must run before Type3 which validates StbSecOpen_RC has length attrs)
    convertOpensTo210(result);

    // Type3: Attribute changes
    applyAttributeChangesTo210(result);

    // Type4: S-beam structure changes
    applySStructureChangesTo210(result);

    // Type6: Handle new elements
    handleNewElementsTo210(result);

    logger.info('Conversion completed successfully');
  } catch (error) {
    logger.error(`Conversion failed: ${error.message}`);
    throw error;
  }

  return result;
}

export default convert202to210;

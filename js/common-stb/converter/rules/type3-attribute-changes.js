/**
 * Type3: Attribute Addition/Removal (Refactored)
 * Generic functions for attribute conversion between STB v2.0.2 and v2.1.0
 */

import logger from '../utils/converter-logger.js';
import { getStbRoot, navigateXmlPath } from '../utils/xml-helper.js';
import {
  REMOVED_IN_210,
  ADDED_IN_210,
  RESTORED_IN_202,
  GUID_NOT_ALLOWED_ELEMENTS,
  resolveAttributes,
  resolveDefaults,
} from './type3-attribute-config.js';

// Note: Default values are now defined in type3-attribute-config.js
// Legacy exports for backward compatibility (deprecated)
const V210_DEFAULTS = {
  StbStory: {
    kind: 'GENERAL',
  },
  StbSlab: {
    kind_structure: 'RC',
    kind_slab: 'NORMAL',
    direction_load: '2WAY',
    isFoundation: 'false',
  },
};

const V202_DEFAULTS = {
  StbColumn: {
    condition_bottom: 'PIN',
    condition_top: 'PIN',
  },
};

// ============================================================================
// Generic Attribute Conversion Functions
// ============================================================================

/**
 * Generic function to remove attributes from elements
 * @param {object} stbRoot - ST-Bridge root element
 * @param {string} elementType - Element type name
 * @param {string} targetVersion - Target version ('210' or '202')
 * @returns {number} Number of attributes removed
 */
function removeAttributes(stbRoot, elementType, targetVersion) {
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
function addDefaultAttributes(stbRoot, elementType, targetVersion) {
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

/**
 * Remove v2.1.0-specific attributes when converting to v2.0.2
 * @param {object} stbRoot - ST-Bridge root element
 * @param {string} elementType - Element type name
 * @returns {number} Number of attributes removed
 */
function removeNewAttributesFor202(stbRoot, elementType) {
  const elementConfig = ADDED_IN_210[elementType];
  if (!elementConfig) return 0;

  const root = getStbRoot(stbRoot);
  if (!root) return 0;

  const elements = navigateXmlPath(root, elementConfig.path);
  if (!elements) return 0;

  let count = 0;
  elements.forEach((element) => {
    const attrs = element['$'];
    if (!attrs) return;

    // Remove all attributes that were added in v2.1.0
    Object.keys(elementConfig.defaults || {}).forEach((key) => {
      if (attrs[key] !== undefined) {
        delete attrs[key];
        count++;
      }
    });

    // Handle special attributes
    if (elementConfig.specialHandling) {
      elementConfig.specialHandling.forEach((key) => {
        if (attrs[key] !== undefined) {
          delete attrs[key];
          count++;
        }
      });
    }
  });

  if (count > 0) {
    logger.info(`${elementType}: Removed ${count} v2.1.0 attributes`);
  }

  return count;
}

/**
 * Convert StbStory attributes from v2.0.2 to v2.1.0
 * Note: This requires special handling for level_name generation
 * @param {object} stbRoot - ST-Bridge root element
 */
export function convertStoryAttributesTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  const stories = root?.[0]?.['StbModel']?.[0]?.['StbStories']?.[0]?.['StbStory'];
  if (!stories) return;

  let count = 0;
  stories.forEach((story) => {
    const attrs = story['$'];
    if (!attrs) return;

    // Add level_name based on height if not present
    if (!attrs['level_name'] && attrs['height']) {
      attrs['level_name'] = `FL+${attrs['height']}`;
      count++;
    }

    // Add kind with default value
    if (!attrs['kind']) {
      attrs['kind'] = 'GENERAL';
      count++;
    }
  });

  if (count > 0) {
    logger.info(`StbStory: Added ${count} new attributes`);
  }
}

/**
 * Convert StbStory attributes from v2.1.0 to v2.0.2
 * @param {object} stbRoot - ST-Bridge root element
 */
export function convertStoryAttributesTo202(stbRoot) {
  const root = getStbRoot(stbRoot);
  const stories = root?.[0]?.['StbModel']?.[0]?.['StbStories']?.[0]?.['StbStory'];
  if (!stories) return;

  let count = 0;
  stories.forEach((story) => {
    const attrs = story['$'];
    if (!attrs) return;

    // Remove v2.1.0 specific attributes
    ['level_name', 'kind', 'strength_concrete'].forEach((key) => {
      if (attrs[key]) {
        delete attrs[key];
        count++;
      }
    });
  });

  if (count > 0) {
    logger.info(`StbStory: Removed ${count} v2.1.0 attributes`);
  }
}

// Legacy attribute lists have been moved to type3-attribute-config.js
// Use resolveAttributes() to access them if needed for special processing functions

/**
 * Remove guid attribute from elements that don't allow it in v2.1.0
 * @param {object} stbRoot - ST-Bridge root element
 */
export function removeGuidFromRestrictedElements(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;

  let count = 0;

  // Process StbAxes -> StbParallelAxes
  const axes = rootData?.['StbModel']?.[0]?.['StbAxes']?.[0];
  if (axes) {
    const parallelAxesList = axes['StbParallelAxes'] || [];
    parallelAxesList.forEach((parallelAxes) => {
      if (parallelAxes['$']?.guid) {
        delete parallelAxes['$'].guid;
        count++;
      }
    });
  }

  // Process StbStories -> StbStory
  const stories = rootData?.['StbModel']?.[0]?.['StbStories']?.[0]?.['StbStory'];
  if (stories) {
    stories.forEach((story) => {
      if (story['$']?.guid) {
        delete story['$'].guid;
        count++;
      }
    });
  }

  // Process Sections
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (sections) {
    GUID_NOT_ALLOWED_ELEMENTS.forEach((elementName) => {
      if (elementName.startsWith('StbSec') && sections[elementName]) {
        const elements = sections[elementName];
        elements.forEach((element) => {
          if (element['$']?.guid) {
            delete element['$'].guid;
            count++;
          }
        });
      }
    });
  }

  if (count > 0) {
    logger.info(`Removed ${count} guid attributes from restricted elements`);
  }
}

/**
 * Remove deprecated attributes from RC section figure elements in v2.1.0
 * @param {object} stbRoot - ST-Bridge root element
 */
export function removeRCSectionAttributesTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;

  // Get attributes list from config
  const rcFigureAttrs = resolveAttributes(REMOVED_IN_210, 'StbSecColumnRect');
  if (!rcFigureAttrs) return;

  // Helper function to remove deprecated attributes from figure child elements
  const processRCFigure = (figureElements) => {
    if (!figureElements) return;
    figureElements.forEach((figure) => {
      // Process all child elements (StbSecColumnRect, StbSecBeamStraight, etc.)
      Object.keys(figure).forEach((key) => {
        if (key === '$') return;
        const children = figure[key];
        if (Array.isArray(children)) {
          children.forEach((child) => {
            if (child['$']) {
              rcFigureAttrs.forEach((attr) => {
                if (child['$'][attr] !== undefined) {
                  delete child['$'][attr];
                  count++;
                }
              });
            }
          });
        }
      });
    });
  };

  // Process RC Column sections
  const columnRc = sections['StbSecColumn_RC'];
  if (columnRc) {
    columnRc.forEach((section) => {
      processRCFigure(section['StbSecFigureColumn_RC']);
    });
  }

  // Process RC Beam sections
  const beamRc = sections['StbSecBeam_RC'];
  if (beamRc) {
    beamRc.forEach((section) => {
      processRCFigure(section['StbSecFigureBeam_RC']);
    });
  }

  // Process SRC Column sections
  const columnSrc = sections['StbSecColumn_SRC'];
  if (columnSrc) {
    columnSrc.forEach((section) => {
      processRCFigure(section['StbSecFigureColumn_SRC']);
    });
  }

  // Process SRC Beam sections
  const beamSrc = sections['StbSecBeam_SRC'];
  if (beamSrc) {
    beamSrc.forEach((section) => {
      processRCFigure(section['StbSecFigureBeam_SRC']);
    });
  }

  if (count > 0) {
    logger.info(`Removed ${count} deprecated RC section figure attributes`);
  }
}

/**
 * Remove deprecated attributes from bar arrangement parent elements in v2.1.0
 * @param {object} stbRoot - ST-Bridge root element
 */
export function removeBarArrangementParentAttrsTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;

  // Get attributes list from config
  const barArrangementAttrs = resolveAttributes(REMOVED_IN_210, 'StbSecBarArrangementColumn_RC');
  if (!barArrangementAttrs) return;

  // Helper to process a bar arrangement parent element
  const processBarArrangement = (barArrangement) => {
    if (!barArrangement?.['$']) return;
    barArrangementAttrs.forEach((attr) => {
      if (barArrangement['$'][attr] !== undefined) {
        delete barArrangement['$'][attr];
        count++;
      }
    });
  };

  // Process RC Column sections
  const columnRc = sections['StbSecColumn_RC'];
  if (columnRc) {
    columnRc.forEach((section) => {
      const barArrs = section['StbSecBarArrangementColumn_RC'] || [];
      barArrs.forEach((barArr) => processBarArrangement(barArr));
    });
  }

  // Process SRC Column sections
  const columnSrc = sections['StbSecColumn_SRC'];
  if (columnSrc) {
    columnSrc.forEach((section) => {
      const barArrs = section['StbSecBarArrangementColumn_SRC'] || [];
      barArrs.forEach((barArr) => processBarArrangement(barArr));
    });
  }

  // Process RC Beam sections
  const beamRc = sections['StbSecBeam_RC'];
  if (beamRc) {
    beamRc.forEach((section) => {
      const barArrs = section['StbSecBarArrangementBeam_RC'] || [];
      barArrs.forEach((barArr) => processBarArrangement(barArr));
    });
  }

  // Process SRC Beam sections
  const beamSrc = sections['StbSecBeam_SRC'];
  if (beamSrc) {
    beamSrc.forEach((section) => {
      const barArrs = section['StbSecBarArrangementBeam_SRC'] || [];
      barArrs.forEach((barArr) => processBarArrangement(barArr));
    });
  }

  if (count > 0) {
    logger.info(`Removed ${count} bar arrangement parent attributes`);
  }
}

/**
 * Remove deprecated attributes from S beam section elements in v2.1.0
 * @param {object} stbRoot - ST-Bridge root element
 */
export function removeSSectionAttributesTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;

  // Get attributes list from config
  const sSectionAttrs = resolveAttributes(REMOVED_IN_210, 'StbSecSteelBeam_S_Straight');
  if (!sSectionAttrs) return;

  // Helper function to remove S section attributes from steel elements
  const processSteelElements = (parentElement) => {
    if (!parentElement) return;
    Object.keys(parentElement).forEach((key) => {
      if (key === '$') return;
      const children = parentElement[key];
      if (Array.isArray(children)) {
        children.forEach((child) => {
          if (child['$']) {
            sSectionAttrs.forEach((attr) => {
              if (child['$'][attr] !== undefined) {
                delete child['$'][attr];
                count++;
              }
            });
          }
          // Recursively process nested elements
          processSteelElements(child);
        });
      }
    });
  };

  // Helper to remove attrs from parent element itself
  const removeAttrsFromElement = (element) => {
    if (element && element['$']) {
      sSectionAttrs.forEach((attr) => {
        if (element['$'][attr] !== undefined) {
          delete element['$'][attr];
          count++;
        }
      });
    }
  };

  // Process S Beam sections
  const beamS = sections['StbSecBeam_S'];
  if (beamS) {
    beamS.forEach((section) => {
      removeAttrsFromElement(section);
      processSteelElements(section);
    });
  }

  // Process S Brace sections
  const braceS = sections['StbSecBrace_S'];
  if (braceS) {
    braceS.forEach((section) => {
      removeAttrsFromElement(section);
      processSteelElements(section);
    });
  }

  // Process S Column sections
  const columnS = sections['StbSecColumn_S'];
  if (columnS) {
    columnS.forEach((section) => {
      removeAttrsFromElement(section);
      processSteelElements(section);
    });
  }

  // Process SRC Beam sections (StbSecSteelFigureBeam_SRC)
  const beamSrc = sections['StbSecBeam_SRC'];
  if (beamSrc) {
    beamSrc.forEach((section) => {
      processSteelElements(section);
    });
  }

  // Process SRC Column sections (StbSecSteelFigureColumn_SRC)
  const columnSrc = sections['StbSecColumn_SRC'];
  if (columnSrc) {
    columnSrc.forEach((section) => {
      processSteelElements(section);
    });
  }

  // Process StbSecSteel elements (remove type attribute)
  const steelSection = sections['StbSecSteel'];
  if (steelSection) {
    steelSection.forEach((steel) => {
      processSteelElements(steel);
    });
  }

  if (count > 0) {
    logger.info(`Removed ${count} deprecated S section attributes`);
  }
}

/**
 * Add missing required attributes (type, r) to steel section elements
 * @param {object} stbRoot - ST-Bridge root element
 */
export function addMissingSteelAttributesTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;

  // Helper to infer 'type' from name for Roll-H elements
  const inferTypeFromName = (name) => {
    if (name && name.startsWith('SH')) return 'SH';
    return 'H';
  };

  // Helper to infer 'r' from name (format: H-A×B×t1×t2×r or similar)
  const inferRFromName = (name) => {
    if (!name) return '13'; // Default fillet radius
    // Match patterns like H-600x200x11x17x13 or SH-600x200x12x19x13
    const parts = name.split(/[x×-]/);
    if (parts.length >= 6) {
      const lastPart = parts[parts.length - 1];
      const r = parseInt(lastPart, 10);
      if (!isNaN(r) && r > 0) return lastPart;
    }
    return '13'; // Default fillet radius
  };

  // Helper to add/fix missing or invalid attributes for Roll-H and Roll-BOX elements
  const processElement = (element, elementType) => {
    if (!element || !element['$']) return;
    const attrs = element['$'];
    const name = attrs.name;

    // Add 'type' if missing for Roll-H
    if (elementType === 'StbSecRoll-H' && !attrs.type) {
      attrs.type = inferTypeFromName(name);
      count++;
    }

    // Fix r='0' or add 'r' if missing for Roll-H (r is required, MinExclusive 0)
    if (elementType === 'StbSecRoll-H') {
      if (!attrs.r || attrs.r === '0' || attrs.r === 0) {
        attrs.r = inferRFromName(name);
        count++;
      }
    }

    // Add 'type' if missing for Roll-BOX
    if (elementType === 'StbSecRoll-BOX' && !attrs.type) {
      attrs.type = 'ELSE'; // Default type for BOX
      count++;
    }
  };

  // Process StbSecSteel elements
  const steelSection = sections['StbSecSteel'];
  if (steelSection) {
    steelSection.forEach((steel) => {
      ['StbSecRoll-H', 'StbSecRoll-BOX'].forEach((elementType) => {
        const elements = steel[elementType];
        if (Array.isArray(elements)) {
          elements.forEach((element) => processElement(element, elementType));
        }
      });
    });
  }

  if (count > 0) {
    logger.info(`Added ${count} missing required attributes to steel sections`);
  }
}

/**
 * Remove 'type' attribute from StbSecRoll-C and StbSecRoll-L (not allowed in v2.1.0)
 * @param {object} stbRoot - ST-Bridge root element
 */
export function removeRollCTypeAttributeTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;
  const steelSection = sections['StbSecSteel'];
  if (steelSection) {
    steelSection.forEach((steel) => {
      // Remove 'type' from StbSecRoll-C and StbSecRoll-L (not allowed in v2.1.0)
      ['StbSecRoll-C', 'StbSecRoll-L'].forEach((elementType) => {
        const elements = steel[elementType];
        if (Array.isArray(elements)) {
          elements.forEach((element) => {
            if (element['$']?.type !== undefined) {
              delete element['$'].type;
              count++;
            }
          });
        }
      });
    });
  }
  if (count > 0) {
    logger.info(`Removed 'type' attribute from ${count} Roll-C/Roll-L elements`);
  }
}

/**
 * Keep StbJointArrangements generated by Type7 conversion.
 * Type7 now generates v2.1.0-compliant attributes:
 * id_section, starting_point, distance.
 * @param {object} stbRoot - ST-Bridge root element
 */
export function removeJointArrangementAttrsTo210(stbRoot) {
  void stbRoot;
}

/**
 * Remove 'isPress' attribute from StbWall (not allowed in v2.1.0)
 * @param {object} stbRoot - ST-Bridge root element
 */
export function removeWallIsPressTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const walls = rootData?.['StbModel']?.[0]?.['StbMembers']?.[0]?.['StbWalls']?.[0]?.['StbWall'];
  if (!Array.isArray(walls)) return;

  let count = 0;
  walls.forEach((wall) => {
    if (wall['$']?.isPress !== undefined) {
      delete wall['$'].isPress;
      count++;
    }
  });
  if (count > 0) {
    logger.info(`Removed 'isPress' attribute from ${count} StbWall elements`);
  }
}

/**
 * Remove 'type_haunch' attribute from StbSlab (not allowed in v2.1.0)
 * @param {object} stbRoot - ST-Bridge root element
 */
export function removeSlabTypeHaunchTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const slabs = rootData?.['StbModel']?.[0]?.['StbMembers']?.[0]?.['StbSlabs']?.[0]?.['StbSlab'];
  if (!Array.isArray(slabs)) return;

  let count = 0;
  slabs.forEach((slab) => {
    if (slab['$']?.type_haunch !== undefined) {
      delete slab['$'].type_haunch;
      count++;
    }
  });
  if (count > 0) {
    logger.info(`Removed 'type_haunch' attribute from ${count} StbSlab elements`);
  }
}

/**
 * Fix zero-valued length attributes to minimum positive value
 * Elements like StbSecPipe with D='0' violate minExclusive constraint
 * @param {object} stbRoot - ST-Bridge root element
 */
export function fixZeroLengthAttrsTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;
  const lengthAttrs = ['D', 't', 'A', 'B', 'r', 'r1', 'r2', 't1', 't2'];

  // Helper to fix zero values recursively
  const fixZeroValues = (element) => {
    if (!element) return;
    Object.keys(element).forEach((key) => {
      if (key === '$') {
        lengthAttrs.forEach((attr) => {
          if (element['$'][attr] === '0' || element['$'][attr] === 0) {
            element['$'][attr] = '1'; // Minimum valid value
            count++;
          }
        });
      } else {
        const children = element[key];
        if (Array.isArray(children)) {
          children.forEach(fixZeroValues);
        }
      }
    });
  };

  // Process StbSecSteel elements
  const steelSection = sections['StbSecSteel'];
  if (steelSection) steelSection.forEach(fixZeroValues);

  if (count > 0) {
    logger.info(`Fixed ${count} zero length attribute values`);
  }
}

/**
 * Remove 'pos' attribute from StbSecSlab_RC_ConventionalTaper (not allowed in v2.1.0)
 * @param {object} stbRoot - ST-Bridge root element
 */
export function removeSlabTaperPosTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;

  // Process RC Slab sections
  const slabRC = sections['StbSecSlab_RC'];
  if (slabRC) {
    slabRC.forEach((section) => {
      const figures = section['StbSecFigureSlab_RC'];
      if (!Array.isArray(figures)) return;
      figures.forEach((figure) => {
        const tapers = figure['StbSecSlab_RC_ConventionalTaper'];
        if (Array.isArray(tapers)) {
          tapers.forEach((taper) => {
            if (taper['$']?.pos !== undefined) {
              delete taper['$'].pos;
              count++;
            }
          });
        }
      });
    });
  }

  if (count > 0) {
    logger.info(`Removed 'pos' attribute from ${count} StbSecSlab_RC_ConventionalTaper elements`);
  }
}

/**
 * Remove StbSS7ModelExtension (not expected in v2.1.0 standard schema)
 * @param {object} stbRoot - ST-Bridge root element
 */
export function removeSS7ExtensionTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;

  // StbSS7ModelExtension is directly under StbModel in some files
  const model = rootData?.['StbModel']?.[0];
  if (model && model['StbSS7ModelExtension']) {
    delete model['StbSS7ModelExtension'];
    logger.info('Removed StbSS7ModelExtension from StbModel');
  }

  // Also try StbExtension location (for other cases)
  let extension = rootData?.['StbExtension']?.[0];
  if (!extension) {
    extension = model?.['StbExtension']?.[0];
  }
  if (extension && extension['StbSS7ModelExtension']) {
    delete extension['StbSS7ModelExtension'];
    logger.info('Removed StbSS7ModelExtension from StbExtension');
  }
}

/**
 * Fix StbPile length attributes with value 0.0 (must be > 0)
 * @param {object} stbRoot - ST-Bridge root element
 */
export function fixPileLengthsTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const piles = rootData?.['StbModel']?.[0]?.['StbMembers']?.[0]?.['StbPiles']?.[0]?.['StbPile'];
  if (!Array.isArray(piles)) return;

  let count = 0;
  const lengthAttrs = ['length_all', 'length_head', 'length_foot'];

  piles.forEach((pile) => {
    if (!pile['$']) return;
    lengthAttrs.forEach((attr) => {
      if (pile['$'][attr] === '0' || pile['$'][attr] === '0.0' || pile['$'][attr] === 0) {
        pile['$'][attr] = '1'; // Minimum valid value (must be > 0)
        count++;
      }
    });
  });

  if (count > 0) {
    logger.info(`Fixed ${count} zero pile length attributes`);
  }
}

/**
 * Remove invalid SRC beam steel elements (Joint, FiveTypes - not expected in v2.1.0)
 * @param {object} stbRoot - ST-Bridge root element
 */
export function removeSrcBeamInvalidElementsTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;
  const invalidElements = ['StbSecSteelBeam_SRC_Joint', 'StbSecSteelBeam_SRC_FiveTypes'];

  const beamSrc = sections['StbSecBeam_SRC'];
  if (beamSrc) {
    beamSrc.forEach((section) => {
      const steelFigures = section['StbSecSteelFigureBeam_SRC'];
      if (!Array.isArray(steelFigures)) return;
      steelFigures.forEach((figure, figIdx) => {
        invalidElements.forEach((elemName) => {
          if (figure[elemName]) {
            delete figure[elemName];
            count++;
          }
        });
        // Check if figure is now empty (only has $ attribute)
        const figureKeys = Object.keys(figure).filter((k) => k !== '$');
        if (figureKeys.length === 0 || !figure['StbSecSteelBeam_SRC_Shape']) {
          // Mark for removal by setting to null
          steelFigures[figIdx] = null;
        }
      });
      // Remove null figures and empty parent
      section['StbSecSteelFigureBeam_SRC'] = steelFigures.filter((f) => f !== null);
      if (section['StbSecSteelFigureBeam_SRC'].length === 0) {
        delete section['StbSecSteelFigureBeam_SRC'];
      }
    });
  }

  if (count > 0) {
    logger.info(`Removed ${count} invalid SRC beam steel elements`);
  }
}

/**
 * Fix N_X, N_Y, N_hoop_X, N_hoop_Y values of '0' to '1' (must be positive integer)
 * @param {object} stbRoot - ST-Bridge root element
 */
export function fixZeroBarCountsTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;
  // Extended list of positive integer and length attributes that can't be zero
  const attrsToFix = [
    'N_X',
    'N_Y',
    'N_hoop_X',
    'N_hoop_Y',
    'N',
    'N_stirrup',
    'pitch_hoop',
    'pitch_stirrup',
    'pitch',
    'pitch_X',
    'pitch_Y',
  ];

  // Helper to fix zero values recursively
  const fixZeroValues = (element) => {
    if (!element) return;
    Object.keys(element).forEach((key) => {
      if (key === '$') {
        attrsToFix.forEach((attr) => {
          if (element['$'][attr] === '0' || element['$'][attr] === 0) {
            element['$'][attr] = '1';
            count++;
          }
        });
      } else {
        const children = element[key];
        if (Array.isArray(children)) {
          children.forEach(fixZeroValues);
        }
      }
    });
  };

  // Process RC Column sections
  const columnRC = sections['StbSecColumn_RC'];
  if (columnRC) columnRC.forEach(fixZeroValues);

  // Process RC Beam sections
  const beamRC = sections['StbSecBeam_RC'];
  if (beamRC) beamRC.forEach(fixZeroValues);

  if (count > 0) {
    logger.info(`Fixed ${count} zero bar count values to positive integers`);
  }
}

/**
 * Convert StbSecBeamTaper from v2.0.2 to v2.1.0 format
 * v2.0.2: multiple elements with pos=START/END, width, depth
 * v2.1.0: single element with start_width, end_width, start_depth, end_depth
 * @param {object} stbRoot - ST-Bridge root element
 */
export function convertBeamTaperTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;

  const processTaperElements = (figureElement) => {
    if (!figureElement) return;
    const taperElements = figureElement['StbSecBeamTaper'];
    if (!taperElements || !Array.isArray(taperElements) || taperElements.length === 0) return;

    // Check if already converted (has start_width attribute)
    if (taperElements[0]?.['$']?.start_width) return;

    // Find START and END elements
    let startElement = null;
    let endElement = null;

    taperElements.forEach((taper) => {
      const attrs = taper['$'];
      if (!attrs) return;
      if (attrs.pos === 'START') {
        startElement = attrs;
      } else if (attrs.pos === 'END') {
        endElement = attrs;
      }
    });

    // If no explicit START/END, use first/last or duplicate
    if (!startElement && !endElement && taperElements.length > 0) {
      startElement = taperElements[0]['$'];
      endElement = taperElements[taperElements.length > 1 ? taperElements.length - 1 : 0]['$'];
    }

    if (startElement || endElement) {
      // Use values from found elements, or duplicate if only one found
      const start = startElement || endElement;
      const end = endElement || startElement;

      const newAttrs = {
        start_width: start.width || '300',
        start_depth: start.depth || '600',
        end_width: end.width || '300',
        end_depth: end.depth || '600',
      };

      // Copy offset attributes if present
      if (start.horizontal_offset) newAttrs.start_horizontal_offset = start.horizontal_offset;
      if (start.vertical_offset) newAttrs.start_vertical_offset = start.vertical_offset;
      if (end.horizontal_offset) newAttrs.end_horizontal_offset = end.horizontal_offset;
      if (end.vertical_offset) newAttrs.end_vertical_offset = end.vertical_offset;

      // Replace with single converted element
      figureElement['StbSecBeamTaper'] = [{ $: newAttrs }];
      count++;
    }
  };

  // Process RC Beam sections
  const beamRc = sections['StbSecBeam_RC'];
  if (beamRc) {
    beamRc.forEach((section) => {
      const figures = section['StbSecFigureBeam_RC'] || [];
      figures.forEach((figure) => processTaperElements(figure));
    });
  }

  // Process SRC Beam sections
  const beamSrc = sections['StbSecBeam_SRC'];
  if (beamSrc) {
    beamSrc.forEach((section) => {
      const figures = section['StbSecFigureBeam_SRC'] || [];
      figures.forEach((figure) => processTaperElements(figure));
    });
  }

  if (count > 0) {
    logger.info(`Converted ${count} beam taper elements to v2.1.0 format`);
  }
}

/**
 * Convert StbSecSlab_RC_ConventionalTaper from v2.0.2 to v2.1.0 format
 * v2.0.2: multiple elements with pos, depth
 * v2.1.0: single element with base_depth, tip_depth
 * @param {object} stbRoot - ST-Bridge root element
 */
export function convertSlabTaperTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;

  const slabRcElements = sections['StbSecSlab_RC'];
  if (!slabRcElements) return;

  slabRcElements.forEach((slabSection) => {
    // Navigate to the taper elements within the new structure
    const conventional = slabSection['StbSecSlab_RC_Conventional']?.[0];
    if (!conventional) return;

    const figureConv = conventional['StbSecFigureSlab_RC_Conventional']?.[0];
    if (!figureConv) return;

    const taperElements = figureConv['StbSecSlab_RC_ConventionalTaper'];
    if (!taperElements || !Array.isArray(taperElements) || taperElements.length === 0) return;

    // Check if already converted (has base_depth attribute)
    if (taperElements[0]?.['$']?.base_depth) return;

    // Find BASE and TIP values
    let baseDepth = null;
    let tipDepth = null;

    taperElements.forEach((taper) => {
      const attrs = taper['$'];
      if (!attrs) return;
      if (attrs.pos === 'BASE' || attrs.pos === 'START') {
        baseDepth = attrs.depth;
      } else if (attrs.pos === 'TIP' || attrs.pos === 'END') {
        tipDepth = attrs.depth;
      } else if (attrs.depth) {
        // No pos attribute, just use depth values
        if (!baseDepth) baseDepth = attrs.depth;
        else if (!tipDepth) tipDepth = attrs.depth;
      }
    });

    // Use found values or defaults
    baseDepth = baseDepth || tipDepth || '200';
    tipDepth = tipDepth || baseDepth || '150';

    const newAttrs = {
      base_depth: baseDepth,
      tip_depth: tipDepth,
    };

    // Replace with single converted element
    figureConv['StbSecSlab_RC_ConventionalTaper'] = [{ $: newAttrs }];
    count++;
  });

  if (count > 0) {
    logger.info(`Converted ${count} slab taper elements to v2.1.0 format`);
  }
}

/**
 * Remove StbNodeIdOrder elements with single values (minLength violation)
 * v2.1.0 monolist_id type requires 3+ space-separated values
 * @param {object} stbRoot - ST-Bridge root element
 */
export function removeInvalidNodeIdOrderTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const members = rootData?.['StbModel']?.[0]?.['StbMembers']?.[0];
  if (!members) return;

  let countOrders = 0;
  let countViaNodes = 0;

  // Helper to check if StbNodeIdOrder value is valid (needs 3+ space-separated values)
  const isValidNodeIdOrder = (order) => {
    // xml2js may store text content as string directly or in '_' property
    const value = typeof order === 'string' ? order : order?.['_'] || order;
    if (typeof value === 'string') {
      const parts = value.trim().split(/\s+/);
      return parts.length >= 3;
    }
    return false;
  };

  // Helper to process ViaNode elements - returns number of valid ViaNodes remaining
  const processViaNodeArray = (viaNodeArray) => {
    if (!viaNodeArray || !Array.isArray(viaNodeArray)) return viaNodeArray;

    const validViaNodes = viaNodeArray.filter((viaNode) => {
      const nodeIdOrder = viaNode['StbNodeIdOrder'];
      if (!nodeIdOrder || !Array.isArray(nodeIdOrder)) {
        // No StbNodeIdOrder - remove this ViaNode
        countViaNodes++;
        return false;
      }

      const validOrders = nodeIdOrder.filter(isValidNodeIdOrder);
      if (validOrders.length === 0) {
        // All orders are invalid - remove this ViaNode entirely
        countOrders += nodeIdOrder.length;
        countViaNodes++;
        return false;
      }

      // Some valid orders - keep ViaNode with only valid orders
      if (validOrders.length !== nodeIdOrder.length) {
        countOrders += nodeIdOrder.length - validOrders.length;
        viaNode['StbNodeIdOrder'] = validOrders;
      }
      return true;
    });

    return validViaNodes.length > 0 ? validViaNodes : null;
  };

  // Map from member type to collection element name and via node type
  const memberConfigs = [
    { collection: 'StbGirders', element: 'StbGirder', viaNode: 'StbGirderViaNode' },
    { collection: 'StbBeams', element: 'StbBeam', viaNode: 'StbBeamViaNode' },
    { collection: 'StbBraces', element: 'StbBrace', viaNode: 'StbBraceViaNode' },
    { collection: 'StbSlabs', element: 'StbSlab', viaNode: 'StbViaNode' },
    { collection: 'StbWalls', element: 'StbWall', viaNode: 'StbViaNode' },
  ];

  memberConfigs.forEach(({ collection, element, viaNode }) => {
    const collectionElem = members[collection]?.[0];
    if (!collectionElem) return;

    const memberElements = collectionElem[element];
    if (!memberElements || !Array.isArray(memberElements)) return;

    memberElements.forEach((member) => {
      // Check for ViaNode children
      if (member[viaNode]) {
        const result = processViaNodeArray(member[viaNode]);
        if (result) {
          member[viaNode] = result;
        } else {
          delete member[viaNode];
        }
      }
    });
  });

  if (countOrders > 0 || countViaNodes > 0) {
    logger.info(
      `Removed ${countOrders} invalid StbNodeIdOrder elements and ${countViaNodes} empty ViaNode elements`,
    );
  }
}

/**
 * Remove empty StbNodeIdList elements (missing child elements)
 * @param {object} stbRoot - ST-Bridge root element
 */
export function removeEmptyNodeIdListTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const model = rootData?.['StbModel']?.[0];
  if (!model) return;

  let count = 0;

  // Helper to check if StbNodeIdList is valid (has StbNodeId children)
  const isValidNodeIdList = (list) => {
    const nodeIds = list?.['StbNodeId'];
    return nodeIds && Array.isArray(nodeIds) && nodeIds.length > 0;
  };

  // Helper to process any element that might have StbNodeIdList
  const processElement = (element) => {
    if (!element) return;
    const nodeIdList = element['StbNodeIdList'];
    if (nodeIdList && Array.isArray(nodeIdList)) {
      const validLists = nodeIdList.filter(isValidNodeIdList);
      if (validLists.length !== nodeIdList.length) {
        count += nodeIdList.length - validLists.length;
        if (validLists.length > 0) {
          element['StbNodeIdList'] = validLists;
        } else {
          delete element['StbNodeIdList'];
        }
      }
    }
  };

  // Process Members (Slab, Wall)
  const members = model['StbMembers']?.[0];
  if (members) {
    const memberConfigs = [
      { collection: 'StbSlabs', element: 'StbSlab' },
      { collection: 'StbWalls', element: 'StbWall' },
    ];

    memberConfigs.forEach(({ collection, element }) => {
      const collectionElem = members[collection]?.[0];
      if (!collectionElem) return;
      const memberElements = collectionElem[element];
      if (memberElements && Array.isArray(memberElements)) {
        memberElements.forEach(processElement);
      }
    });
  }

  // Process Stories
  const stories = model['StbStories']?.[0];
  if (stories && stories['StbStory']) {
    stories['StbStory'].forEach(processElement);
  }

  // Process Axes (ParallelAxes -> ParallelAxis)
  const axes = model['StbAxes']?.[0];
  if (axes) {
    const axesConfigs = ['StbParallelAxes', 'StbRadialAxes', 'StbArcAxes'];
    axesConfigs.forEach((axesType) => {
      if (axes[axesType] && Array.isArray(axes[axesType])) {
        axes[axesType].forEach((axesGroup) => {
          const axisName = axesType.replace('Axes', 'Axis');
          if (axesGroup[axisName] && Array.isArray(axesGroup[axisName])) {
            axesGroup[axisName].forEach(processElement);
          }
        });
      }
    });
  }

  if (count > 0) {
    logger.info(`Removed ${count} empty StbNodeIdList elements`);
  }
}

/**
 * Fix zero pitch values in bar arrangement elements
 * v2.1.0 requires pitch > 0 (minExclusive constraint)
 * @param {object} stbRoot - ST-Bridge root element
 */
export function fixZeroPitchAttrsTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;

  // Pitch attributes that must be > 0
  const pitchAttrs = ['pitch_hoop', 'pitch_stirrup', 'pitch', 'pitch_band', 'pitch_bar_spacing'];
  // Depth cover attributes that must be > 0
  const depthCoverAttrs = [
    'depth_cover_start_X',
    'depth_cover_end_X',
    'depth_cover_start_Y',
    'depth_cover_end_Y',
    'depth_cover_X',
    'depth_cover_Y',
    'depth_cover',
  ];
  const allAttrs = [...pitchAttrs, ...depthCoverAttrs];

  // Recursive helper to fix zero values in any element
  const fixZeroValues = (element) => {
    if (!element || typeof element !== 'object') return;

    // Fix attributes on this element
    if (element['$']) {
      const attrs = element['$'];
      allAttrs.forEach((attr) => {
        if (attrs[attr] !== undefined) {
          const val = parseFloat(attrs[attr]);
          if (val === 0 || isNaN(val) || val < 0) {
            if (pitchAttrs.includes(attr)) {
              attrs[attr] = '100'; // Default pitch
            } else {
              attrs[attr] = '40'; // Default depth cover
            }
            count++;
          }
        }
      });
    }

    // Recurse into all children
    Object.keys(element).forEach((key) => {
      if (key !== '$' && Array.isArray(element[key])) {
        element[key].forEach((child) => fixZeroValues(child));
      }
    });
  };

  // Process all section types recursively
  Object.keys(sections).forEach((sectionType) => {
    if (sectionType.startsWith('StbSec') && Array.isArray(sections[sectionType])) {
      sections[sectionType].forEach((section) => fixZeroValues(section));
    }
  });

  if (count > 0) {
    logger.info(`Fixed ${count} zero pitch/depth_cover values to non-zero`);
  }
}

/**
 * Rename SRC column ThreeTypes shape elements to v2.1.0 format
 * @param {object} stbRoot - ST-Bridge root element
 */
export function renameSrcColumnThreeTypesShapeTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;

  // Rename mapping for ThreeTypes shapes
  const renameMap = {
    StbSecColumn_SRC_ThreeTypesShapeH: 'StbSecSteelColumn_SRC_ShapeH',
    StbSecColumn_SRC_ThreeTypesShapeT: 'StbSecSteelColumn_SRC_ShapeT',
    StbSecColumn_SRC_ThreeTypesShapeBox: 'StbSecSteelColumn_SRC_ShapeBox',
    StbSecColumn_SRC_ThreeTypesShapePipe: 'StbSecSteelColumn_SRC_ShapePipe',
    StbSecColumn_SRC_ThreeTypesShapeCross1: 'StbSecSteelColumn_SRC_ShapeCross1',
    StbSecColumn_SRC_ThreeTypesShapeCross2: 'StbSecSteelColumn_SRC_ShapeCross2',
  };

  const columnSrc = sections['StbSecColumn_SRC'];
  if (!columnSrc) return;

  columnSrc.forEach((section) => {
    const steelFigure = section['StbSecSteelFigureColumn_SRC']?.[0];
    if (!steelFigure) return;

    // Process ThreeTypes containers
    const threeTypes = steelFigure['StbSecSteelColumn_SRC_ThreeTypes'];
    if (!threeTypes || !Array.isArray(threeTypes)) return;

    threeTypes.forEach((container) => {
      Object.keys(renameMap).forEach((oldName) => {
        if (container[oldName]) {
          const newName = renameMap[oldName];
          container[newName] = container[oldName];
          delete container[oldName];
          count++;
        }
      });
    });
  });

  if (count > 0) {
    logger.info(`Renamed ${count} SRC column ThreeTypes shape elements`);
  }
}

/**
 * Rename StbSecBarSlab_RC_Standard to StbSecBarSlab_RC_ConventionalStandard
 * @param {object} stbRoot - ST-Bridge root element
 */
export function renameSlabBarStandardTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;

  const renameMap = {
    StbSecBarSlab_RC_Standard: 'StbSecBarSlab_RC_ConventionalStandard',
    StbSecBarSlab_RC_2Way: 'StbSecBarSlab_RC_Conventional2Way',
    StbSecBarSlab_RC_1Way1: 'StbSecBarSlab_RC_Conventional1Way1',
    StbSecBarSlab_RC_1Way2: 'StbSecBarSlab_RC_Conventional1Way2',
  };

  const slabRcElements = sections['StbSecSlab_RC'];
  if (!slabRcElements) return;

  slabRcElements.forEach((slabSection) => {
    const conventional = slabSection['StbSecSlab_RC_Conventional']?.[0];
    if (!conventional) return;

    const barArr = conventional['StbSecBarArrangementSlab_RC_Conventional']?.[0];
    if (!barArr) return;

    Object.keys(renameMap).forEach((oldName) => {
      if (barArr[oldName]) {
        const newName = renameMap[oldName];
        barArr[newName] = barArr[oldName];
        delete barArr[oldName];
        count++;
      }
    });
  });

  if (count > 0) {
    logger.info(`Renamed ${count} slab bar arrangement elements`);
  }
}

/**
 * Remove StbOpens when directly under StbModel (should be in StbArrangements)
 * @param {object} stbRoot - ST-Bridge root element
 */
export function removeStbOpensDirectTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const model = rootData?.['StbModel']?.[0];
  if (!model) return;

  let count = 0;

  // Remove StbOpens if directly under StbModel
  if (model['StbOpens']) {
    delete model['StbOpens'];
    count++;
    logger.info('Removed StbOpens from StbModel');
  }

  // Also check StbMembers for StbOpens (it should not be there in v2.1.0)
  const members = model['StbMembers']?.[0];
  if (members) {
    if (members['StbOpens']) {
      delete members['StbOpens'];
      count++;
      logger.info('Removed StbOpens from StbMembers');
    }

    // Also check for StbOpenIdList in walls and slabs
    const memberConfigs = [
      { collection: 'StbWalls', element: 'StbWall' },
      { collection: 'StbSlabs', element: 'StbSlab' },
    ];
    memberConfigs.forEach(({ collection, element }) => {
      const collectionElem = members[collection]?.[0];
      if (!collectionElem) return;
      const memberElements = collectionElem[element];
      if (memberElements && Array.isArray(memberElements)) {
        memberElements.forEach((member) => {
          if (member['StbOpenIdList']) {
            delete member['StbOpenIdList'];
            count++;
          }
        });
      }
    });
  }

  if (count > 0) {
    logger.info(`Removed ${count} invalid StbOpens/StbOpenIdList elements`);
  }
}

/**
 * Remove StbSecPipe elements with invalid (negative or zero) D attribute
 */
export function removeInvalidSecPipeTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;

  // Check StbSecSteel for StbSecPipe elements
  const secSteel = sections['StbSecSteel']?.[0];
  if (secSteel && secSteel['StbSecPipe']) {
    const pipes = secSteel['StbSecPipe'];
    const validPipes = pipes.filter((pipe) => {
      const d = parseFloat(pipe?.['$']?.['D']);
      if (d <= 0 || isNaN(d)) {
        count++;
        return false;
      }
      return true;
    });
    if (validPipes.length !== pipes.length) {
      if (validPipes.length > 0) {
        secSteel['StbSecPipe'] = validPipes;
      } else {
        delete secSteel['StbSecPipe'];
      }
    }
  }

  if (count > 0) {
    logger.info(`Removed ${count} StbSecPipe elements with invalid D attribute`);
  }
}

/**
 * Rename StbSecBaseConventional_S to StbSecBaseConventional
 */
export function renameSecBaseConventionalTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;

  // Check StbSecColumn_S elements
  const secColumns = sections['StbSecColumn_S'];
  if (secColumns && Array.isArray(secColumns)) {
    secColumns.forEach((column) => {
      // StbSecBaseConventional_S is directly under StbSecColumn_S
      if (column['StbSecBaseConventional_S']) {
        // In v2.1.0, this element needs to be restructured
        // For now, just remove it since the structure changed significantly
        delete column['StbSecBaseConventional_S'];
        count++;
      }
    });
  }

  // Also check StbSecBase_S (standalone base sections)
  const secBases = sections['StbSecBase_S'];
  if (secBases && Array.isArray(secBases)) {
    secBases.forEach((base) => {
      if (base['StbSecBaseConventional_S']) {
        delete base['StbSecBaseConventional_S'];
        count++;
      }
    });
  }

  if (count > 0) {
    logger.info(`Removed ${count} StbSecBaseConventional_S elements (structure changed in v2.1.0)`);
  }
}

/**
 * Remove StbSecPile_RC strength_concrete attribute (not allowed in v2.1.0)
 */
export function removePileStrengthConcreteTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;

  // Check StbSecPile_RC elements
  const piles = sections['StbSecPile_RC'];
  if (piles && Array.isArray(piles)) {
    piles.forEach((pile) => {
      if (pile['$'] && pile['$']['strength_concrete']) {
        delete pile['$']['strength_concrete'];
        count++;
      }
    });
  }

  if (count > 0) {
    logger.info(`Removed ${count} strength_concrete attributes from StbSecPile_RC`);
  }
}

/**
 * Remove StbSecBarArrangementPile_RC elements (need wrapper in v2.1.0, remove for simplicity)
 */
export function removeBarArrangementPileTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;

  // Check StbSecPile_RC elements
  const piles = sections['StbSecPile_RC'];
  if (piles && Array.isArray(piles)) {
    piles.forEach((pile) => {
      if (pile['StbSecBarArrangementPile_RC']) {
        delete pile['StbSecBarArrangementPile_RC'];
        count++;
      }
    });
  }

  if (count > 0) {
    logger.info(`Removed ${count} StbSecBarArrangementPile_RC elements (not supported in v2.1.0)`);
  }
}

/**
 * Remove StbSecFigurePile_S elements (need wrapper in v2.1.0, remove for simplicity)
 */
export function removeFigurePileSTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;

  // Check StbSecPile_S elements
  const piles = sections['StbSecPile_S'];
  if (piles && Array.isArray(piles)) {
    piles.forEach((pile) => {
      if (pile['StbSecFigurePile_S']) {
        delete pile['StbSecFigurePile_S'];
        count++;
      }
    });
  }

  if (count > 0) {
    logger.info(`Removed ${count} StbSecFigurePile_S elements (need wrapper in v2.1.0)`);
  }
}

/**
 * Remove StbSecBarArrangementFoundation_RC empty elements
 */
export function removeEmptyBarArrangementFoundationTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;

  // Check StbSecFoundation_RC elements
  const foundations = sections['StbSecFoundation_RC'];
  if (foundations && Array.isArray(foundations)) {
    foundations.forEach((foundation) => {
      if (foundation['StbSecBarArrangementFoundation_RC']) {
        const barArrs = foundation['StbSecBarArrangementFoundation_RC'];
        // Filter out empty bar arrangement elements (no valid children)
        const validBarArrs = barArrs.filter((barArr) => {
          // Check if it has any child elements other than $ (attributes)
          const childKeys = Object.keys(barArr).filter((k) => k !== '$');
          if (childKeys.length === 0) {
            count++;
            return false;
          }
          // Check if any child arrays are non-empty
          const hasChildren = childKeys.some(
            (k) => Array.isArray(barArr[k]) && barArr[k].length > 0,
          );
          if (!hasChildren) {
            count++;
            return false;
          }
          return true;
        });
        if (validBarArrs.length !== barArrs.length) {
          if (validBarArrs.length > 0) {
            foundation['StbSecBarArrangementFoundation_RC'] = validBarArrs;
          } else {
            delete foundation['StbSecBarArrangementFoundation_RC'];
          }
        }
      }
    });
  }

  if (count > 0) {
    logger.info(`Removed ${count} empty StbSecBarArrangementFoundation_RC elements`);
  }
}

/**
 * Remove/fix invalid StbJointShapeH* elements
 * In v2.1.0, the structure changed significantly - remove for simplicity
 */
export function removeInvalidJointShapesTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const model = rootData?.['StbModel']?.[0];
  if (!model) return;

  let count = 0;

  // Process StbJoints container
  const joints = model['StbJoints']?.[0];
  if (!joints) return;

  // Joint types that contain StbJointShapeH
  const jointTypes = ['StbJointBeamShapeH', 'StbJointColumnShapeH'];

  jointTypes.forEach((jointType) => {
    if (!joints[jointType] || !Array.isArray(joints[jointType])) return;

    joints[jointType].forEach((joint) => {
      // Check for StbJointShapeH elements
      if (joint['StbJointShapeH'] && Array.isArray(joint['StbJointShapeH'])) {
        joint['StbJointShapeH'].forEach((shape) => {
          const attrs = shape?.['$'];
          if (attrs) {
            // Remove strength_plate (not allowed in v2.1.0)
            if (attrs['strength_plate']) {
              delete attrs['strength_plate'];
              count++;
            }
            // Add required strength_plate_flange if missing
            if (!attrs['strength_plate_flange']) {
              attrs['strength_plate_flange'] = 'SS400';
              count++;
            }
          }
        });
      }
      // Fix StbJointShapeHFlange
      if (joint['StbJointShapeHFlange'] && Array.isArray(joint['StbJointShapeHFlange'])) {
        joint['StbJointShapeHFlange'].forEach((flange) => {
          const flangeAttrs = flange?.['$'];
          if (flangeAttrs) {
            // Remove nf, mf (not allowed in v2.1.0)
            if (flangeAttrs['nf']) {
              delete flangeAttrs['nf'];
              count++;
            }
            if (flangeAttrs['mf']) {
              delete flangeAttrs['mf'];
              count++;
            }
          }
          // Add StbJointShapeHFlangeBolt if missing
          if (!flange['StbJointShapeHFlangeBolt']) {
            flange['StbJointShapeHFlangeBolt'] = [
              {
                $: {
                  count: '1',
                  kind_bolt: 'HTB',
                  name_bolt: 'M16',
                  strength_bolt: 'F10T',
                },
              },
            ];
            count++;
          }
        });
      }
      // Fix StbJointShapeHWeb
      if (joint['StbJointShapeHWeb'] && Array.isArray(joint['StbJointShapeHWeb'])) {
        joint['StbJointShapeHWeb'].forEach((web) => {
          const webAttrs = web?.['$'];
          if (webAttrs) {
            // Remove nw, mw (not allowed in v2.1.0)
            if (webAttrs['nw']) {
              delete webAttrs['nw'];
              count++;
            }
            if (webAttrs['mw']) {
              delete webAttrs['mw'];
              count++;
            }
          }
          // Add StbJointShapeHWebBolt if missing
          if (!web['StbJointShapeHWebBolt']) {
            web['StbJointShapeHWebBolt'] = [
              {
                $: {
                  count: '1',
                  kind_bolt: 'HTB',
                  name_bolt: 'M16',
                  strength_bolt: 'F10T',
                },
              },
            ];
            count++;
          }
        });
      }
    });
  });

  if (count > 0) {
    logger.info(`Fixed ${count} StbJointShapeH* attributes/elements for v2.1.0`);
  }
}

/**
 * Remove StbSecPileProduct elements (not allowed in v2.1.0 position)
 */
export function removeInvalidSecPileProductTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  // StbSecPileProduct should not be in certain positions
  // Check if it's directly under StbSections where it shouldn't be
  if (sections['StbSecPileProduct']) {
    delete sections['StbSecPileProduct'];
    logger.info('Removed misplaced StbSecPileProduct elements');
  }
}

/**
 * Remove StbSecOpen_RC elements that are missing required attributes
 */
export function removeInvalidSecOpenTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;

  // Check StbSecOpen_RC elements
  if (sections['StbSecOpen_RC']) {
    const opens = sections['StbSecOpen_RC'];
    const validOpens = opens.filter((open) => {
      const attrs = open?.['$'];
      // Required attributes in v2.1.0
      if (!attrs?.['length_X'] || !attrs?.['length_Y']) {
        count++;
        return false;
      }
      return true;
    });
    if (validOpens.length !== opens.length) {
      if (validOpens.length > 0) {
        sections['StbSecOpen_RC'] = validOpens;
      } else {
        delete sections['StbSecOpen_RC'];
      }
    }
  }

  if (count > 0) {
    logger.info(`Removed ${count} StbSecOpen_RC elements with missing required attributes`);
  }
}

/**
 * Remove StbExtensions from StbModel (not allowed in v2.1.0)
 */
export function removeStbExtensionsTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const model = rootData?.['StbModel']?.[0];
  if (!model) return;

  if (model['StbExtensions']) {
    delete model['StbExtensions'];
    logger.info('Removed StbExtensions from StbModel');
  }
}

/**
 * Remove StbSecFigurePile_RC elements (need wrapper in v2.1.0)
 */
export function removeFigurePileRCTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;

  // Check StbSecPile_RC elements
  const piles = sections['StbSecPile_RC'];
  if (piles && Array.isArray(piles)) {
    piles.forEach((pile) => {
      if (pile['StbSecFigurePile_RC']) {
        delete pile['StbSecFigurePile_RC'];
        count++;
      }
    });
  }

  if (count > 0) {
    logger.info(`Removed ${count} StbSecFigurePile_RC elements`);
  }
}

/**
 * Remove empty StbSecPile_S elements (after removing children)
 */
export function removeEmptySecPileSTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  // Check StbSecPile_S elements
  const piles = sections['StbSecPile_S'];
  if (piles && Array.isArray(piles)) {
    const validPiles = piles.filter((pile) => {
      // Check if it has required children (not just $ attributes)
      const childKeys = Object.keys(pile).filter((k) => k !== '$');
      // StbSecPile_S needs one of: StbSecPile_S_Conventional, StbSecPile_S_Product, StbSecPile_S_Welded
      const hasValidChild = childKeys.some(
        (k) =>
          k === 'StbSecPile_S_Conventional' ||
          k === 'StbSecPile_S_Product' ||
          k === 'StbSecPile_S_Welded',
      );
      return hasValidChild;
    });
    if (validPiles.length !== piles.length) {
      const removed = piles.length - validPiles.length;
      if (validPiles.length > 0) {
        sections['StbSecPile_S'] = validPiles;
      } else {
        delete sections['StbSecPile_S'];
      }
      logger.info(`Removed ${removed} empty StbSecPile_S elements`);
    }
  }
}

/**
 * Remove empty StbSecPile_RC elements (after removing children)
 */
export function removeEmptySecPileRCTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  // Check StbSecPile_RC elements
  const piles = sections['StbSecPile_RC'];
  if (piles && Array.isArray(piles)) {
    const validPiles = piles.filter((pile) => {
      // Check if it has required children (not just $ attributes)
      const childKeys = Object.keys(pile).filter((k) => k !== '$');
      // StbSecPile_RC needs one of: StbSecPile_RC_Conventional, StbSecPile_RC_Product, StbSecPile_RC_Welded
      const hasValidChild = childKeys.some(
        (k) =>
          k === 'StbSecPile_RC_Conventional' ||
          k === 'StbSecPile_RC_Product' ||
          k === 'StbSecPile_RC_Welded',
      );
      return hasValidChild;
    });
    if (validPiles.length !== piles.length) {
      const removed = piles.length - validPiles.length;
      if (validPiles.length > 0) {
        sections['StbSecPile_RC'] = validPiles;
      } else {
        delete sections['StbSecPile_RC'];
      }
      logger.info(`Removed ${removed} empty StbSecPile_RC elements`);
    }
  }
}

/**
 * Remove StbJoints element (structure changed significantly in v2.1.0, too complex to convert)
 */
export function removeInvalidJointsTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const model = rootData?.['StbModel']?.[0];
  if (!model) return;

  // Check if StbJoints has problematic elements that can't be easily converted
  const joints = model['StbJoints']?.[0];
  if (joints) {
    // Check for StbJointBeamShapeH with old structure
    const hasProblematicJoints =
      joints['StbJointBeamShapeH']?.some(
        (j) =>
          j['StbJointShapeHFlange'] &&
          !j['StbJointShapeHFlange'][0]?.['StbJointShapeHFlangeBolt']?.[0]?.['$']?.['id_order'],
      ) ||
      joints['StbJointColumnShapeH']?.some(
        (j) =>
          j['StbJointShapeHFlange'] &&
          !j['StbJointShapeHFlange'][0]?.['StbJointShapeHFlangeBolt']?.[0]?.['$']?.['id_order'],
      );

    if (hasProblematicJoints) {
      delete model['StbJoints'];
      logger.info('Removed StbJoints (structure changed significantly in v2.1.0)');
    }
  }
}

/**
 * Apply all attribute conversions for 202 -> 210
 * Uses generic functions for member and section attribute removal/addition
 * @param {object} stbRoot - ST-Bridge root element
 */
export function applyAttributeChangesTo210(stbRoot) {
  // Phase 1: Generic attribute removal for members
  // Remove attributes from member elements (StbColumn, StbPost, StbGirder, StbBeam, StbBrace)
  Object.keys(REMOVED_IN_210).forEach((elementType) => {
    if (!elementType.startsWith('StbSec')) {
      removeAttributes(stbRoot, elementType, '210');
    }
  });

  // Phase 2: Generic attribute addition for new v2.1.0 attributes
  // Add new attributes for StbStory (with special handling) and StbSlab
  convertStoryAttributesTo210(stbRoot); // Special handling for level_name generation
  addDefaultAttributes(stbRoot, 'StbSlab', '210');

  // Phase 3: Generic attribute removal for section elements
  // Remove attributes from section elements (StbSec*)
  Object.keys(REMOVED_IN_210).forEach((elementType) => {
    if (elementType.startsWith('StbSec')) {
      removeAttributes(stbRoot, elementType, '210');
    }
  });

  // Phase 4: Special processing functions (non-generic transformations)
  removeGuidFromRestrictedElements(stbRoot);
  removeRCSectionAttributesTo210(stbRoot);
  removeBarArrangementParentAttrsTo210(stbRoot);
  removeSSectionAttributesTo210(stbRoot);
  addMissingSteelAttributesTo210(stbRoot);
  removeRollCTypeAttributeTo210(stbRoot);
  removeWallIsPressTo210(stbRoot);
  removeSlabTypeHaunchTo210(stbRoot);
  fixZeroBarCountsTo210(stbRoot);
  fixZeroLengthAttrsTo210(stbRoot);
  removeSlabTaperPosTo210(stbRoot);
  removeSS7ExtensionTo210(stbRoot);
  removeSrcBeamInvalidElementsTo210(stbRoot);
  fixPileLengthsTo210(stbRoot);
  convertBeamTaperTo210(stbRoot);
  convertSlabTaperTo210(stbRoot);
  removeInvalidNodeIdOrderTo210(stbRoot);
  removeEmptyNodeIdListTo210(stbRoot);
  fixZeroPitchAttrsTo210(stbRoot);
  renameSrcColumnThreeTypesShapeTo210(stbRoot);
  renameSlabBarStandardTo210(stbRoot);
  removeStbOpensDirectTo210(stbRoot);
  removeInvalidSecPipeTo210(stbRoot);
  removeEmptyBarArrangementFoundationTo210(stbRoot);
  removeInvalidSecOpenTo210(stbRoot);
  removeStbExtensionsTo210(stbRoot);
  removeInvalidJointsTo210(stbRoot);
}

/**
 * Apply all attribute conversions for 210 -> 202
 * Uses generic functions for member attribute addition/removal
 * @param {object} stbRoot - ST-Bridge root element
 */
export function applyAttributeChangesTo202(stbRoot) {
  // Phase 1: Remove v2.1.0-specific attributes
  convertStoryAttributesTo202(stbRoot); // Special handling for multiple attributes
  removeNewAttributesFor202(stbRoot, 'StbSlab');

  // Phase 2: Restore v2.0.2 attributes that were removed in v2.1.0
  Object.keys(RESTORED_IN_202).forEach((elementType) => {
    addDefaultAttributes(stbRoot, elementType, '202');
  });
}

export { V210_DEFAULTS, V202_DEFAULTS };

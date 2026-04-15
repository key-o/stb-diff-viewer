/**
 * Type3: Section Attribute Transformations
 * Functions for converting section-level attributes between STB versions
 */

import logger from '../utils/converter-logger.js';
import { getStbRoot } from '../utils/xml-helper.js';
import { REMOVED_IN_210, resolveAttributes } from './type3-attribute-config.js';

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

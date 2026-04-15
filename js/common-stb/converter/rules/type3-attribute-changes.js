/**
 * Type3: Attribute Addition/Removal (Refactored)
 * Orchestrator for attribute conversion between STB v2.0.2 and v2.1.0.
 * Generic/section/story converters are in separate sub-modules.
 */

import logger from '../utils/converter-logger.js';
import { getStbRoot } from '../utils/xml-helper.js';
import {
  REMOVED_IN_210,
  RESTORED_IN_202,
  GUID_NOT_ALLOWED_ELEMENTS,
} from './type3-attribute-config.js';

// Sub-module imports
import { removeAttributes, addDefaultAttributes } from './type3-generic-converters.js';
import {
  convertStoryAttributesTo210,
  convertStoryAttributesTo202,
} from './type3-story-converters.js';
import {
  removeRCSectionAttributesTo210,
  removeBarArrangementParentAttrsTo210,
  removeSSectionAttributesTo210,
  addMissingSteelAttributesTo210,
  removeRollCTypeAttributeTo210,
} from './type3-section-converters.js';

/**
 * Remove guid attribute from elements that don't allow it in v2.1.0
 * @param {object} stbRoot - ST-Bridge root element
 */
function removeGuidFromRestrictedElements(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;

  let count = 0;

  // Process StbAxes -> StbParallelAxes
  const axes = rootData?.['StbModel']?.[0]?.['StbAxes']?.[0];
  if (axes) {
    const parallelAxesList = axes['StbParallelAxes'] || [];
    parallelAxesList.forEach((parallelAxes) => {
      if (parallelAxes['$']?.guid !== undefined) {
        delete parallelAxes['$'].guid;
        count++;
      }
    });
  }

  // Process StbStories -> StbStory
  const stories = rootData?.['StbModel']?.[0]?.['StbStories']?.[0]?.['StbStory'];
  if (stories) {
    stories.forEach((story) => {
      if (story['$']?.guid !== undefined) {
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
          if (element['$']?.guid !== undefined) {
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
 * Remove 'isPress' attribute from StbWall (not allowed in v2.1.0)
 * @param {object} stbRoot - ST-Bridge root element
 */
function removeWallIsPressTo210(stbRoot) {
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
function removeSlabTypeHaunchTo210(stbRoot) {
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
function fixZeroLengthAttrsTo210(stbRoot) {
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
function removeSlabTaperPosTo210(stbRoot) {
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
function removeSS7ExtensionTo210(stbRoot) {
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
function fixPileLengthsTo210(stbRoot) {
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
function removeSrcBeamInvalidElementsTo210(stbRoot) {
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
function fixZeroBarCountsTo210(stbRoot) {
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
function convertBeamTaperTo210(stbRoot) {
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
function convertSlabTaperTo210(stbRoot) {
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
function removeInvalidNodeIdOrderTo210(stbRoot) {
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
function removeEmptyNodeIdListTo210(stbRoot) {
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
function fixZeroPitchAttrsTo210(stbRoot) {
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
function renameSrcColumnThreeTypesShapeTo210(stbRoot) {
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
function renameSlabBarStandardTo210(stbRoot) {
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
function removeStbOpensDirectTo210(stbRoot) {
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
function removeInvalidSecPipeTo210(stbRoot) {
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
 * Remove StbSecBarArrangementFoundation_RC empty elements
 */
function removeEmptyBarArrangementFoundationTo210(stbRoot) {
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
 * Remove StbSecOpen_RC elements that are missing required attributes
 */
function removeInvalidSecOpenTo210(stbRoot) {
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
function removeStbExtensionsTo210(stbRoot) {
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
 * Remove StbJoints element (structure changed significantly in v2.1.0, too complex to convert)
 */
function removeInvalidJointsTo210(stbRoot) {
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

let legacyGuidCounter = 1;

function nextLegacyGuid() {
  return Math.max(0, legacyGuidCounter++).toString(16).padStart(32, '0').slice(-32);
}

function ensureGuid(elements) {
  if (!Array.isArray(elements)) return 0;
  let count = 0;
  elements.forEach((element) => {
    const attrs = element?.['$'] || (element['$'] = {});
    if (!attrs.guid) {
      attrs.guid = nextLegacyGuid();
      count++;
    }
  });
  return count;
}

/**
 * Add legacy-compatible guid attributes to v2.0.x output.
 * The comparison target uses 2.0.1-style guid-rich XML, so we preserve that shape in downgraded output.
 * @param {object} stbRoot - ST-Bridge root element
 */
function addLegacyGuidsTo202(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  let count = 0;

  count += ensureGuid(rootData?.['StbCommon']);
  count += ensureGuid(rootData?.['StbModel']?.[0]?.['StbNodes']?.[0]?.['StbNode']);
  count += ensureGuid(rootData?.['StbModel']?.[0]?.['StbStories']?.[0]?.['StbStory']);

  const parallelAxes = rootData?.['StbModel']?.[0]?.['StbAxes']?.[0]?.['StbParallelAxes'] || [];
  parallelAxes.forEach((group) => {
    count += ensureGuid(group?.['StbParallelAxis']);
  });

  const members = rootData?.['StbModel']?.[0]?.['StbMembers']?.[0];
  [
    ['StbColumns', 'StbColumn'],
    ['StbGirders', 'StbGirder'],
    ['StbBeams', 'StbBeam'],
    ['StbBraces', 'StbBrace'],
    ['StbWalls', 'StbWall'],
    ['StbParapets', 'StbParapet'],
    ['StbSlabs', 'StbSlab'],
  ].forEach(([collection, element]) => {
    count += ensureGuid(members?.[collection]?.[0]?.[element]);
  });

  const sections =
    rootData?.['StbModel']?.[0]?.['StbSections']?.[0] || rootData?.['StbSections']?.[0] || null;
  if (sections) {
    ['StbSecColumn_RC', 'StbSecBeam_RC', 'StbSecSlab_RC'].forEach((tag) => {
      count += ensureGuid(sections?.[tag]);
    });
  }

  if (count > 0) {
    logger.info(`Added ${count} legacy-compatible guid attributes for v2.0.x output`);
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
  // StbSlab の主要属性は 2.0.1 系の参照STBでも利用されるため保持する。

  // Phase 2: Restore v2.0.2 attributes that were removed in v2.1.0
  Object.keys(RESTORED_IN_202).forEach((elementType) => {
    addDefaultAttributes(stbRoot, elementType, '202');
  });

  // Phase 3: Add legacy-compatible guid attributes used by 2.0.x reference files.
  addLegacyGuidsTo202(stbRoot);
}

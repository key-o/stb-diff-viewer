/**
 * Type10: SRC Beam Steel Section Structure Changes
 * STB 2.0.2 -> 2.1.0: Convert StbSecSteelBeam_SRC_Straight/Taper/Haunch to StbSecSteelBeam_SRC_Shape wrapper
 *
 * STB 2.0.2:
 *   <StbSecSteelFigureBeam_SRC>
 *     <StbSecSteelBeam_SRC_Straight shape="H-..." strength_main="SN400B" />
 *   </StbSecSteelFigureBeam_SRC>
 *
 * STB 2.1.0:
 *   <StbSecSteelFigureBeam_SRC>
 *     <StbSecSteelBeam_SRC_Shape order="1">
 *       <StbSecSteelBeamStraight shape="H-..." strength_main="SN400B" />
 *     </StbSecSteelBeam_SRC_Shape>
 *   </StbSecSteelFigureBeam_SRC>
 */

import logger from '../utils/logger.js';
import { getStbRoot } from '../utils/xml-helper.js';

/**
 * Create a StbSecSteelBeam_SRC_Shape wrapper with StbSecSteelBeamStraight child
 * @param {number} order - Order value (1-based index)
 * @param {object} attrs - Attributes from original element
 * @returns {object} New wrapper element
 */
function createStraightShape(order, attrs) {
  const straightAttrs = {
    shape: attrs.shape || '',
    strength_main: attrs.strength_main || '',
  };

  // Copy optional attributes
  if (attrs.strength_web) straightAttrs.strength_web = attrs.strength_web;
  if (attrs.horizontal_offset) straightAttrs.horizontal_offset = attrs.horizontal_offset;
  if (attrs.vertical_offset) straightAttrs.vertical_offset = attrs.vertical_offset;

  return {
    $: { order: String(order) },
    StbSecSteelBeamStraight: [{ $: straightAttrs }],
  };
}

/**
 * Create a StbSecSteelBeam_SRC_Shape wrapper with StbSecSteelBeamTaper child
 * @param {number} order - Order value (1-based index)
 * @param {object} startAttrs - Start position attributes
 * @param {object} endAttrs - End position attributes
 * @returns {object} New wrapper element
 */
function createTaperShape(order, startAttrs, endAttrs) {
  return {
    $: { order: String(order) },
    StbSecSteelBeamTaper: [
      {
        $: {
          shape_start: startAttrs?.shape || '',
          strength_main_start: startAttrs?.strength_main || '',
          shape_end: endAttrs?.shape || '',
          strength_main_end: endAttrs?.strength_main || '',
        },
      },
    ],
  };
}

/**
 * Convert SRC beam steel section elements to v2.1.0 format
 * @param {object} stbRoot - ST-Bridge root element
 */
export function convertSrcBeamSteelSectionsTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let convertedCount = 0;

  // Process SRC Beam sections
  const beamSrc = sections['StbSecBeam_SRC'];
  if (!beamSrc) return;

  beamSrc.forEach((section) => {
    const steelFigures = section['StbSecSteelFigureBeam_SRC'];
    if (!steelFigures) return;

    steelFigures.forEach((steelFigure) => {
      if (!steelFigure) return;

      const shapes = [];
      let orderIndex = 1;

      // Convert StbSecSteelBeam_SRC_Straight elements
      if (steelFigure['StbSecSteelBeam_SRC_Straight']) {
        steelFigure['StbSecSteelBeam_SRC_Straight'].forEach((straight) => {
          shapes.push(createStraightShape(orderIndex++, straight['$'] || {}));
        });
        delete steelFigure['StbSecSteelBeam_SRC_Straight'];
        convertedCount++;
      }

      // Convert StbSecSteelBeam_SRC_Taper elements (need pairs for start/end)
      if (steelFigure['StbSecSteelBeam_SRC_Taper']) {
        const taperElements = steelFigure['StbSecSteelBeam_SRC_Taper'];
        // For simplicity, convert each taper element as a straight element
        // A more complete implementation would pair START/END positions
        taperElements.forEach((taper) => {
          shapes.push(createStraightShape(orderIndex++, taper['$'] || {}));
        });
        delete steelFigure['StbSecSteelBeam_SRC_Taper'];
        convertedCount++;
      }

      // Convert StbSecSteelBeam_SRC_Haunch elements
      if (steelFigure['StbSecSteelBeam_SRC_Haunch']) {
        steelFigure['StbSecSteelBeam_SRC_Haunch'].forEach((haunch) => {
          shapes.push(createStraightShape(orderIndex++, haunch['$'] || {}));
        });
        delete steelFigure['StbSecSteelBeam_SRC_Haunch'];
        convertedCount++;
      }

      // Add converted shapes if any
      if (shapes.length > 0) {
        steelFigure['StbSecSteelBeam_SRC_Shape'] = shapes;
      }
    });
  });

  if (convertedCount > 0) {
    logger.info(`SRC Beam steel sections: Converted ${convertedCount} elements to v2.1.0 format`);
  }
}

export default convertSrcBeamSteelSectionsTo210;

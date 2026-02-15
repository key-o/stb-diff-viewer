/**
 * Type4: Structural Changes - S Beam Multi-Section Conversion
 *
 * v2.0.2 Structure:
 * <StbSecBeam_S>
 *   <StbSecSteelFigureBeam_S>
 *     <StbSecSteelBeam_S_Straight shape="..." strength_main="..."/>
 *     <!-- or StbSecSteelBeam_S_Haunch with pos="START", "CENTER", "END" -->
 *     <!-- or StbSecSteelBeam_S_Joint with pos="START", "CENTER", "END" -->
 *     <!-- or StbSecSteelBeam_S_Taper with pos="START", "END" -->
 *     <!-- or StbSecSteelBeam_S_FiveTypes with pos="START", "HAUNCH_S", "CENTER", "HAUNCH_E", "END" -->
 *   </StbSecSteelFigureBeam_S>
 * </StbSecBeam_S>
 *
 * v2.1.0 Structure:
 * <StbSecBeam_S>
 *   <StbSecSteelFigureBeam_S>
 *     <StbSecSteelBeam_S_Shape order="1">
 *       <StbSecSteelBeamStraight shape="..." strength_main="..."/>
 *       <!-- or StbSecSteelBeamTaper start_shape="..." end_shape="..." -->
 *     </StbSecSteelBeam_S_Shape>
 *     <StbSecSteelBeamWidening pos="START" .../>  (optional)
 *   </StbSecSteelFigureBeam_S>
 * </StbSecBeam_S>
 *
 * Conversion Logic:
 * - Straight: 1断面 → 1 Shape (Straight)
 * - Taper: START/END → 1 Shape (Taper if shapes differ, Straight if same)
 * - Joint: 2-3断面 → N-1 Shapes (区間ベース)
 * - Haunch: 2-3断面 → N-1 Shapes (区間ベース、kind_haunchでTaper/Straight選択)
 * - FiveTypes: 3-5断面 → N-1 Shapes (区間ベース)
 */

import logger from '../utils/converter-logger.js';
import { getStbRoot } from '../utils/xml-helper.js';

// Position order for each element type
const POS_ORDER_TAPER = { START: 0, END: 1 };
const POS_ORDER_JOINT_HAUNCH = { START: 0, CENTER: 1, END: 2 };
const POS_ORDER_FIVE_TYPES = { START: 0, HAUNCH_S: 1, CENTER: 2, HAUNCH_E: 3, END: 4 };

/**
 * Check if a StbSecSteelFigureBeam_S is already in v2.1.0 format
 * @param {object} figureBeam - StbSecSteelFigureBeam_S element
 * @returns {boolean} True if already in v2.1.0 format
 */
function isAlready210Format(figureBeam) {
  const shapes = figureBeam['StbSecSteelBeam_S_Shape'];
  if (shapes && shapes.length > 0) {
    const firstShape = shapes[0];
    return firstShape['StbSecSteelBeamStraight'] || firstShape['StbSecSteelBeamTaper'];
  }
  return false;
}

/**
 * Check if a StbSecSteelFigureBeam_S contains v2.0.2 format elements
 * @param {object} figureBeam - StbSecSteelFigureBeam_S element
 * @returns {boolean} True if contains v2.0.2 format elements
 */
function contains202FormatElements(figureBeam) {
  return (
    figureBeam['StbSecSteelBeam_S_Straight'] ||
    figureBeam['StbSecSteelBeam_S_Haunch'] ||
    figureBeam['StbSecSteelBeam_S_Joint'] ||
    figureBeam['StbSecSteelBeam_S_Taper'] ||
    figureBeam['StbSecSteelBeam_S_FiveTypes']
  );
}

/**
 * Sort elements by position order
 * @param {Array} elements - Elements to sort
 * @param {Object} posOrder - Position order map
 * @returns {Array} Sorted elements
 */
function sortByPosition(elements, posOrder) {
  return [...elements].sort((a, b) => {
    const posA = posOrder[a['$']?.pos] ?? 99;
    const posB = posOrder[b['$']?.pos] ?? 99;
    return posA - posB;
  });
}

/**
 * Create a StbSecSteelBeam_S_Shape element with Straight child
 * @param {number} order - Order index
 * @param {object} attrs - Source attributes (shape, strength_main, strength_web)
 * @returns {object} Shape element
 */
function createStraightShape(order, attrs) {
  return {
    $: { order: String(order) },
    StbSecSteelBeamStraight: [
      {
        $: {
          shape: attrs.shape,
          strength_main: attrs.strength_main,
          ...(attrs.strength_web && { strength_web: attrs.strength_web }),
          ...(attrs.horizontal_offset && { horizontal_offset: attrs.horizontal_offset }),
          ...(attrs.vertical_offset && { vertical_offset: attrs.vertical_offset }),
        },
      },
    ],
  };
}

/**
 * Create a StbSecSteelBeam_S_Shape element with Taper child
 * @param {number} order - Order index
 * @param {object} startAttrs - Start position attributes
 * @param {object} endAttrs - End position attributes
 * @returns {object} Shape element
 */
function createTaperShape(order, startAttrs, endAttrs) {
  return {
    $: { order: String(order) },
    StbSecSteelBeamTaper: [
      {
        $: {
          start_shape: startAttrs.shape,
          end_shape: endAttrs.shape,
          strength_main: startAttrs.strength_main,
          ...(startAttrs.strength_web && { strength_web: startAttrs.strength_web }),
          ...(startAttrs.start_horizontal_offset && {
            start_horizontal_offset: startAttrs.start_horizontal_offset,
          }),
          ...(startAttrs.start_vertical_offset && {
            start_vertical_offset: startAttrs.start_vertical_offset,
          }),
          ...(endAttrs.end_horizontal_offset && {
            end_horizontal_offset: endAttrs.end_horizontal_offset,
          }),
          ...(endAttrs.end_vertical_offset && {
            end_vertical_offset: endAttrs.end_vertical_offset,
          }),
        },
      },
    ],
  };
}

/**
 * Create shape element based on whether shapes are the same
 * @param {number} order - Order index
 * @param {object} startAttrs - Start section attributes
 * @param {object} endAttrs - End section attributes
 * @param {boolean} useTaper - Force use of Taper (for SLOPE haunch)
 * @returns {object} Shape element
 */
function createShapeForSegment(order, startAttrs, endAttrs, useTaper = false) {
  const shapesAreSame = startAttrs.shape === endAttrs.shape;

  if (shapesAreSame && !useTaper) {
    // Same shape - use Straight
    return createStraightShape(order, startAttrs);
  } else {
    // Different shapes - use Taper
    return createTaperShape(order, startAttrs, endAttrs);
  }
}

/**
 * Convert segment-based elements (Joint/Haunch/FiveTypes) to v2.1.0 format
 * Creates Shape elements for each segment between adjacent positions
 * @param {Array} elements - Sorted position elements
 * @param {number} startOrder - Starting order index
 * @param {boolean} useTaper - Whether to force Taper for all segments
 * @returns {Array} Array of Shape elements
 */
function convertSegmentBasedElements(elements, startOrder, useTaper = false) {
  const shapes = [];
  let order = startOrder;

  // Create a shape for each segment (between adjacent positions)
  for (let i = 0; i < elements.length - 1; i++) {
    const startElem = elements[i];
    const endElem = elements[i + 1];
    const startAttrs = startElem['$'];
    const endAttrs = endElem['$'];

    shapes.push(createShapeForSegment(order++, startAttrs, endAttrs, useTaper));
  }

  return shapes;
}

/**
 * Convert S Beam sections from v2.0.2 to v2.1.0
 * @param {object} stbRoot - ST-Bridge root element
 */
function convertSBeamSectionsTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];

  if (!sections) return;

  const beamsS = sections['StbSecBeam_S'];
  if (!beamsS) return;

  let convertedCount = 0;

  beamsS.forEach((beam) => {
    const beamId = beam['$']?.id;
    const beamName = beam['$']?.name;

    const figureBeam = beam['StbSecSteelFigureBeam_S']?.[0];

    if (!figureBeam) {
      // No StbSecSteelFigureBeam_S - check for direct 2.0.2 elements (legacy format)
      const shapes = convertDirectElements(beam);
      if (shapes.length > 0) {
        beam['StbSecSteelFigureBeam_S'] = [
          {
            StbSecSteelBeam_S_Shape: shapes,
          },
        ];
        convertedCount++;
        logger.debug(`Beam ${beamId} (${beamName}): Created StbSecSteelFigureBeam_S`);
      }
      return;
    }

    // StbSecSteelFigureBeam_S exists - check if it needs conversion
    if (isAlready210Format(figureBeam)) {
      logger.debug(`Beam ${beamId} (${beamName}): Already in v2.1.0 format, skipping`);
      return;
    }

    if (!contains202FormatElements(figureBeam)) {
      logger.debug(`Beam ${beamId} (${beamName}): No v2.0.2 elements found`);
      return;
    }

    // Convert v2.0.2 elements inside StbSecSteelFigureBeam_S to v2.1.0 format
    const shapes = [];
    let orderIndex = 1;

    // Process StbSecSteelBeam_S_Straight (single section)
    if (figureBeam['StbSecSteelBeam_S_Straight']) {
      figureBeam['StbSecSteelBeam_S_Straight'].forEach((straight) => {
        shapes.push(createStraightShape(orderIndex++, straight['$']));
      });
      delete figureBeam['StbSecSteelBeam_S_Straight'];
    }

    // Process StbSecSteelBeam_S_Taper (2 sections: START, END)
    if (figureBeam['StbSecSteelBeam_S_Taper']) {
      const taperElements = sortByPosition(figureBeam['StbSecSteelBeam_S_Taper'], POS_ORDER_TAPER);

      if (taperElements.length >= 2) {
        const startAttrs = taperElements[0]['$'];
        const endAttrs = taperElements[1]['$'];

        // Create single segment
        shapes.push(createShapeForSegment(orderIndex++, startAttrs, endAttrs, false));
      }
      delete figureBeam['StbSecSteelBeam_S_Taper'];
    }

    // Process StbSecSteelBeam_S_Joint (2-3 sections)
    if (figureBeam['StbSecSteelBeam_S_Joint']) {
      const jointElements = sortByPosition(
        figureBeam['StbSecSteelBeam_S_Joint'],
        POS_ORDER_JOINT_HAUNCH,
      );

      const jointShapes = convertSegmentBasedElements(jointElements, orderIndex, false);
      shapes.push(...jointShapes);
      orderIndex += jointShapes.length;
      delete figureBeam['StbSecSteelBeam_S_Joint'];
    }

    // Process StbSecSteelBeam_S_Haunch (2-3 sections)
    // Note: Currently treats all haunch as SLOPE (taper).
    // Full implementation requires reading kind_haunch from member placement.
    if (figureBeam['StbSecSteelBeam_S_Haunch']) {
      const haunchElements = sortByPosition(
        figureBeam['StbSecSteelBeam_S_Haunch'],
        POS_ORDER_JOINT_HAUNCH,
      );

      // Default to SLOPE behavior: use Taper when shapes differ
      // TODO: Read kind_haunch_start/kind_haunch_end from member placement
      // and use Straight for DROP haunch segments
      const haunchShapes = convertSegmentBasedElements(haunchElements, orderIndex, false);
      shapes.push(...haunchShapes);
      orderIndex += haunchShapes.length;
      delete figureBeam['StbSecSteelBeam_S_Haunch'];
    }

    // Process StbSecSteelBeam_S_FiveTypes (3-5 sections)
    if (figureBeam['StbSecSteelBeam_S_FiveTypes']) {
      const fiveTypeElements = sortByPosition(
        figureBeam['StbSecSteelBeam_S_FiveTypes'],
        POS_ORDER_FIVE_TYPES,
      );

      // Convert each segment between adjacent positions
      const fiveTypeShapes = convertSegmentBasedElements(fiveTypeElements, orderIndex, false);
      shapes.push(...fiveTypeShapes);
      orderIndex += fiveTypeShapes.length;
      delete figureBeam['StbSecSteelBeam_S_FiveTypes'];
    }

    // Update StbSecSteelFigureBeam_S with new v2.1.0 structure
    if (shapes.length > 0) {
      figureBeam['StbSecSteelBeam_S_Shape'] = shapes;
      convertedCount++;
      logger.debug(
        `Beam ${beamId} (${beamName}): Converted ${shapes.length} segments to v2.1.0 format`,
      );
    }
  });

  if (convertedCount > 0) {
    logger.info(`S Beam sections: Converted ${convertedCount} beams to v2.1.0 format`);
  }
}

/**
 * Convert direct v2.0.2 elements (not inside StbSecSteelFigureBeam_S)
 * @param {object} beam - Beam element
 * @returns {Array} Array of Shape elements
 */
function convertDirectElements(beam) {
  const shapes = [];
  let orderIndex = 1;

  if (beam['StbSecSteelBeam_S_Straight']) {
    beam['StbSecSteelBeam_S_Straight'].forEach((straight) => {
      shapes.push(createStraightShape(orderIndex++, straight['$']));
    });
    delete beam['StbSecSteelBeam_S_Straight'];
  }

  if (beam['StbSecSteelBeam_S_Taper']) {
    const taperElements = sortByPosition(beam['StbSecSteelBeam_S_Taper'], POS_ORDER_TAPER);

    if (taperElements.length >= 2) {
      const startAttrs = taperElements[0]['$'];
      const endAttrs = taperElements[1]['$'];
      shapes.push(createShapeForSegment(orderIndex++, startAttrs, endAttrs, false));
    }
    delete beam['StbSecSteelBeam_S_Taper'];
  }

  return shapes;
}

/**
 * Convert S Beam sections from v2.1.0 to v2.0.2
 * @param {object} stbRoot - ST-Bridge root element
 */
function convertSBeamSectionsTo202(stbRoot) {
  const root = getStbRoot(stbRoot);
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];

  if (!sections) return;

  const beamsS = sections['StbSecBeam_S'];
  if (!beamsS) return;

  let convertedCount = 0;
  let multiSectionWarnings = 0;

  beamsS.forEach((beam) => {
    const figureBeam = beam['StbSecSteelFigureBeam_S']?.[0];
    if (!figureBeam) return;

    const shapes = figureBeam['StbSecSteelBeam_S_Shape'] || [];
    if (shapes.length === 0) return;

    const beamName = beam['$']?.name || beam['$']?.id || 'unknown';

    if (shapes.length === 1) {
      // Single segment
      const firstShape = shapes[0];

      if (firstShape['StbSecSteelBeamStraight']) {
        const straight = firstShape['StbSecSteelBeamStraight'][0];
        const attrs = straight['$'];
        figureBeam['StbSecSteelBeam_S_Straight'] = [
          {
            $: {
              shape: attrs.shape,
              strength_main: attrs.strength_main,
              ...(attrs.strength_web && { strength_web: attrs.strength_web }),
            },
          },
        ];
      } else if (firstShape['StbSecSteelBeamTaper']) {
        const taper = firstShape['StbSecSteelBeamTaper'][0];
        const attrs = taper['$'];
        figureBeam['StbSecSteelBeam_S_Taper'] = [
          {
            $: {
              pos: 'START',
              shape: attrs.start_shape,
              strength_main: attrs.strength_main,
              ...(attrs.strength_web && { strength_web: attrs.strength_web }),
            },
          },
          {
            $: {
              pos: 'END',
              shape: attrs.end_shape,
              strength_main: attrs.strength_main,
              ...(attrs.strength_web && { strength_web: attrs.strength_web }),
            },
          },
        ];
      }
    } else {
      // Multiple segments - determine best v2.0.2 format
      logger.warn(
        `Multi-segment beam "${beamName}" has ${shapes.length} segments. Converting to appropriate v2.0.2 format.`,
      );
      multiSectionWarnings++;

      // Reconstruct position-based elements from segments
      const positionElements = reconstructPositionElements(shapes);

      if (shapes.length === 2) {
        // 2 segments = 3 positions: START, CENTER, END
        figureBeam['StbSecSteelBeam_S_Haunch'] = positionElements.map((elem, i) => ({
          $: {
            pos: ['START', 'CENTER', 'END'][i],
            ...elem,
          },
        }));
      } else if (shapes.length >= 3) {
        // 3+ segments = use FiveTypes if 4 segments, otherwise Haunch
        const positions =
          shapes.length === 4
            ? ['START', 'HAUNCH_S', 'CENTER', 'HAUNCH_E', 'END']
            : shapes.length === 3
              ? ['START', 'HAUNCH_S', 'CENTER', 'END'].slice(0, shapes.length + 1)
              : ['START', 'CENTER', 'END'];

        figureBeam['StbSecSteelBeam_S_FiveTypes'] = positionElements.map((elem, i) => ({
          $: {
            pos: positions[i] || 'CENTER',
            ...elem,
          },
        }));
      }
    }

    delete figureBeam['StbSecSteelBeam_S_Shape'];
    convertedCount++;
  });

  if (convertedCount > 0) {
    logger.info(`S Beam sections: Converted ${convertedCount} beams to v2.0.2 format`);
  }

  if (multiSectionWarnings > 0) {
    logger.warn(`Note: ${multiSectionWarnings} multi-segment beams were converted.`);
  }
}

/**
 * Reconstruct position elements from segment shapes
 * @param {Array} shapes - Shape elements
 * @returns {Array} Position elements with shape, strength_main, strength_web
 */
function reconstructPositionElements(shapes) {
  const positions = [];

  shapes.forEach((shape, i) => {
    if (shape['StbSecSteelBeamStraight']) {
      const attrs = shape['StbSecSteelBeamStraight'][0]['$'];
      if (i === 0) {
        positions.push({
          shape: attrs.shape,
          strength_main: attrs.strength_main,
          ...(attrs.strength_web && { strength_web: attrs.strength_web }),
        });
      }
      positions.push({
        shape: attrs.shape,
        strength_main: attrs.strength_main,
        ...(attrs.strength_web && { strength_web: attrs.strength_web }),
      });
    } else if (shape['StbSecSteelBeamTaper']) {
      const attrs = shape['StbSecSteelBeamTaper'][0]['$'];
      if (i === 0) {
        positions.push({
          shape: attrs.start_shape,
          strength_main: attrs.strength_main,
          ...(attrs.strength_web && { strength_web: attrs.strength_web }),
        });
      }
      positions.push({
        shape: attrs.end_shape,
        strength_main: attrs.strength_main,
        ...(attrs.strength_web && { strength_web: attrs.strength_web }),
      });
    }
  });

  return positions;
}

/**
 * Convert S Column sections from v2.0.2 to v2.1.0
 * NOTE: S Column structure is identical between v2.0.2 and v2.1.0.
 * StbSecSteelFigureColumn_S contains StbSecSteelColumn_S_Same/NotSame/ThreeTypes
 * directly in both versions. No conversion needed.
 * @param {object} stbRoot - ST-Bridge root element
 */
function convertSColumnSectionsTo210(stbRoot) {
  // S Column structure is identical between v2.0.2 and v2.1.0
  // No conversion needed - only log for debugging
  const root = getStbRoot(stbRoot);
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];

  if (!sections) return;

  const columnsS = sections['StbSecColumn_S'];
  if (!columnsS) return;

  logger.debug(
    `S Column sections: ${columnsS.length} columns found (no conversion needed - structure identical)`,
  );
}

/**
 * Convert S Column sections from v2.1.0 to v2.0.2
 * NOTE: S Column structure is identical between v2.0.2 and v2.1.0.
 * No conversion needed.
 * @param {object} stbRoot - ST-Bridge root element
 */
function convertSColumnSectionsTo202(stbRoot) {
  // S Column structure is identical between v2.0.2 and v2.1.0
  // No conversion needed
  logger.debug('S Column sections: No conversion needed (structure identical)');
}

/**
 * Apply all S-structure conversions for 202 -> 210
 * @param {object} stbRoot - ST-Bridge root element
 */
export function applySStructureChangesTo210(stbRoot) {
  convertSBeamSectionsTo210(stbRoot);
  convertSColumnSectionsTo210(stbRoot);
}

/**
 * Apply all S-structure conversions for 210 -> 202
 * @param {object} stbRoot - ST-Bridge root element
 */
export function applySStructureChangesTo202(stbRoot) {
  convertSBeamSectionsTo202(stbRoot);
  convertSColumnSectionsTo202(stbRoot);
}

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

import logger from '../utils/converter-logger.js';
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
  const strengthMain = startAttrs?.strength_main || endAttrs?.strength_main || '';
  const strengthWeb = startAttrs?.strength_web || endAttrs?.strength_web;
  if (
    startAttrs?.strength_main &&
    endAttrs?.strength_main &&
    startAttrs.strength_main !== endAttrs.strength_main
  ) {
    logger.warn(
      `SRC steel taper order=${order}: strength_main mismatch (${startAttrs.strength_main} vs ${endAttrs.strength_main}). Using START value.`,
    );
  }

  return {
    $: { order: String(order) },
    StbSecSteelBeamTaper: [
      {
        $: {
          start_shape: startAttrs?.shape || '',
          end_shape: endAttrs?.shape || '',
          strength_main: strengthMain,
          ...(strengthWeb && { strength_web: strengthWeb }),
          ...(startAttrs?.horizontal_offset && {
            start_horizontal_offset: startAttrs.horizontal_offset,
          }),
          ...(startAttrs?.vertical_offset && { start_vertical_offset: startAttrs.vertical_offset }),
          ...(endAttrs?.horizontal_offset && { end_horizontal_offset: endAttrs.horizontal_offset }),
          ...(endAttrs?.vertical_offset && { end_vertical_offset: endAttrs.vertical_offset }),
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
        const startTapers = taperElements.filter((t) => t?.['$']?.pos === 'START');
        const endTapers = taperElements.filter((t) => t?.['$']?.pos === 'END');
        const pairCount = Math.min(startTapers.length, endTapers.length);

        for (let i = 0; i < pairCount; i++) {
          shapes.push(
            createTaperShape(orderIndex++, startTapers[i]?.['$'] || {}, endTapers[i]?.['$'] || {}),
          );
        }

        const unmatched = [...startTapers.slice(pairCount), ...endTapers.slice(pairCount)];
        if (unmatched.length > 0) {
          logger.warn(
            `SRC Beam steel sections: ${unmatched.length} unmatched taper endpoints found. Converting unmatched items as straight.`,
          );
          unmatched.forEach((taper) => {
            shapes.push(createStraightShape(orderIndex++, taper['$'] || {}));
          });
        }

        // Fallback for legacy taper data without pos
        if (startTapers.length === 0 && endTapers.length === 0) {
          logger.warn(
            'SRC Beam steel sections: taper elements missing pos START/END. Converting as straight.',
          );
          taperElements.forEach((taper) => {
            shapes.push(createStraightShape(orderIndex++, taper['$'] || {}));
          });
        }
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

      // Convert StbSecSteelBeam_SRC_FiveTypes elements
      // FiveTypes has no direct v2.1.0 equivalent; use CENTER (or first) as representative
      // and convert to StbSecSteelBeam_SRC_Shape > StbSecSteelBeamStraight.
      // Attributes are stored on the child element (StbSecBeam_SRC_SameShapeH etc.), not on '$'.
      if (steelFigure['StbSecSteelBeam_SRC_FiveTypes']) {
        const fiveTypesElements = steelFigure['StbSecSteelBeam_SRC_FiveTypes'];
        const centerElement =
          fiveTypesElements.find((e) => e?.['$']?.pos === 'CENTER') || fiveTypesElements[0];

        if (centerElement) {
          // FiveTypes attributes can be either:
          // (a) directly on '$' (flat format): <StbSecSteelBeam_SRC_FiveTypes pos="CENTER" shape="..." .../>
          // (b) on a child element (nested format): <StbSecSteelBeam_SRC_FiveTypes><StbSecBeam_SRC_SameShapeH shape=.../>
          const directAttrs = centerElement['$'] || {};
          let attrs = {};

          if (directAttrs.shape) {
            // Case (a): shape is directly on the element
            attrs = {
              shape: directAttrs.shape,
              strength_main: directAttrs.strength_main || '',
              ...(directAttrs.strength_web && { strength_web: directAttrs.strength_web }),
            };
          } else {
            // Case (b): shape is on a child element
            const childNames = [
              'StbSecBeam_SRC_SameShapeH',
              'StbSecBeam_SRC_SameShapeBox',
              'StbSecBeam_SRC_SameShapePipe',
              'StbSecBeam_SRC_SameShapeT',
            ];
            for (const childName of childNames) {
              const childEl = centerElement[childName]?.[0]?.['$'];
              if (childEl?.shape) {
                attrs = {
                  shape: childEl.shape,
                  strength_main: childEl.strength_main || '',
                  ...(childEl.strength_web && { strength_web: childEl.strength_web }),
                };
                break;
              }
            }
          }
          shapes.push(createStraightShape(orderIndex++, attrs));
        }

        delete steelFigure['StbSecSteelBeam_SRC_FiveTypes'];
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

// ─────────────────────────────────────────────────────────────────────────────
// v2.1.0 → v2.0.2 reverse conversion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert SRC beam steel sections from v2.1.0 back to v2.0.2 format.
 * StbSecSteelBeam_SRC_Shape > StbSecSteelBeamStraight/Taper
 * → StbSecSteelBeam_SRC_Straight / StbSecSteelBeam_SRC_Taper (pair)
 * @param {object} stbRoot - ST-Bridge root element
 */
export function convertSrcBeamSteelSectionsTo202(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let convertedCount = 0;
  const beamSrc = sections['StbSecBeam_SRC'];
  if (!beamSrc) return;

  beamSrc.forEach((section) => {
    (section['StbSecSteelFigureBeam_SRC'] || []).forEach((steelFigure) => {
      if (!steelFigure) return;
      const shapes = steelFigure['StbSecSteelBeam_SRC_Shape'];
      if (!shapes || shapes.length === 0) return;

      const straights = [];
      const taperStarts = [];
      const taperEnds = [];

      shapes.forEach((shape) => {
        const straight = shape['StbSecSteelBeamStraight']?.[0];
        const taper = shape['StbSecSteelBeamTaper']?.[0];

        if (straight) {
          const a = straight['$'] || {};
          straights.push({
            $: {
              shape: a.shape || '',
              strength_main: a.strength_main || '',
              ...(a.strength_web && { strength_web: a.strength_web }),
              ...(a.horizontal_offset && { horizontal_offset: a.horizontal_offset }),
              ...(a.vertical_offset && { vertical_offset: a.vertical_offset }),
            },
          });
          convertedCount++;
        } else if (taper) {
          const a = taper['$'] || {};
          taperStarts.push({
            $: {
              pos: 'START',
              shape: a.start_shape || '',
              strength_main: a.strength_main || '',
              ...(a.strength_web && { strength_web: a.strength_web }),
              ...(a.start_horizontal_offset && { horizontal_offset: a.start_horizontal_offset }),
              ...(a.start_vertical_offset && { vertical_offset: a.start_vertical_offset }),
            },
          });
          taperEnds.push({
            $: {
              pos: 'END',
              shape: a.end_shape || '',
              strength_main: a.strength_main || '',
              ...(a.strength_web && { strength_web: a.strength_web }),
              ...(a.end_horizontal_offset && { horizontal_offset: a.end_horizontal_offset }),
              ...(a.end_vertical_offset && { vertical_offset: a.end_vertical_offset }),
            },
          });
          convertedCount++;
        }
      });

      delete steelFigure['StbSecSteelBeam_SRC_Shape'];
      if (straights.length > 0) steelFigure['StbSecSteelBeam_SRC_Straight'] = straights;
      if (taperStarts.length > 0) {
        steelFigure['StbSecSteelBeam_SRC_Taper'] = [...taperStarts, ...taperEnds];
      }
    });
  });

  if (convertedCount > 0) {
    logger.info(
      `SRC Beam steel sections: Reverted ${convertedCount} Shape elements to v2.0.2 format`,
    );
  }
}

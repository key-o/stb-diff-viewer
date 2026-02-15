/**
 * Type2: Element Renaming
 * - RC column section elements
 * - RC beam section elements
 */

import logger from '../utils/converter-logger.js';
import { renameKey, getStbRoot } from '../utils/xml-helper.js';

/**
 * Element rename mapping: v2.0.2 -> v2.1.0
 * Note: StbSecBeam_RC_Haunch does not exist in v2.1.0 - it needs conversion, not simple rename
 */
const ELEMENT_RENAME_MAP_202_TO_210 = {
  // RC Column Sections (inside StbSecFigureColumn_RC)
  StbSecColumn_RC_Rect: 'StbSecColumnRect',
  StbSecColumn_RC_Circle: 'StbSecColumnCircle',

  // RC Beam Sections (inside StbSecFigureBeam_RC)
  StbSecBeam_RC_Straight: 'StbSecBeamStraight',
  StbSecBeam_RC_Haunch: 'StbSecBeamHaunch',
  StbSecBeam_RC_Taper: 'StbSecBeamTaper',

  // RC Column Bar Arrangement (inside StbSecBarArrangementColumn_RC)
  StbSecBarColumn_RC_RectSame: 'StbSecBarColumnRectSame',
  StbSecBarColumn_RC_RectNotSame: 'StbSecBarColumnRectNotSame',
  StbSecBarColumn_RC_CircleSame: 'StbSecBarColumnCircleSame',
  StbSecBarColumn_RC_CircleNotSame: 'StbSecBarColumnCircleNotSame',

  // RC Beam Bar Arrangement (inside StbSecBarArrangementBeam_RC)
  StbSecBarBeam_RC_Same: 'StbSecBarBeamSimple',
  StbSecBarBeam_RC_ThreeTypes: 'StbSecBarBeamComplex',
  StbSecBarBeam_RC_StartEnd: 'StbSecBarBeamComplex',

  // SRC Column Steel Shape Elements - Same (inside StbSecSteelColumn_SRC_Same)
  StbSecColumn_SRC_SameShapeH: 'StbSecSteelColumn_SRC_ShapeH',
  StbSecColumn_SRC_SameShapeBox: 'StbSecSteelColumn_SRC_ShapeBox',
  StbSecColumn_SRC_SameShapePipe: 'StbSecSteelColumn_SRC_ShapePipe',
  StbSecColumn_SRC_SameShapeCross: 'StbSecSteelColumn_SRC_ShapeCross1',
  StbSecColumn_SRC_SameShapeCross1: 'StbSecSteelColumn_SRC_ShapeCross1',
  StbSecColumn_SRC_SameShapeCross2: 'StbSecSteelColumn_SRC_ShapeCross2',
  StbSecColumn_SRC_SameShapeT: 'StbSecSteelColumn_SRC_ShapeT',

  // SRC Column Steel Shape Elements - NotSame (inside StbSecSteelColumn_SRC_NotSame)
  StbSecColumn_SRC_NotSameShapeH: 'StbSecSteelColumn_SRC_ShapeH',
  StbSecColumn_SRC_NotSameShapeBox: 'StbSecSteelColumn_SRC_ShapeBox',
  StbSecColumn_SRC_NotSameShapePipe: 'StbSecSteelColumn_SRC_ShapePipe',
  StbSecColumn_SRC_NotSameShapeCross: 'StbSecSteelColumn_SRC_ShapeCross1',
  StbSecColumn_SRC_NotSameShapeT: 'StbSecSteelColumn_SRC_ShapeT',

  // SRC Column Bar Arrangement (inside StbSecBarArrangementColumn_SRC)
  StbSecBarColumn_SRC_RectSame: 'StbSecBarColumnRectSame',
  StbSecBarColumn_SRC_RectNotSame: 'StbSecBarColumnRectNotSame',
  StbSecBarColumn_SRC_CircleSame: 'StbSecBarColumnCircleSame',
  StbSecBarColumn_SRC_CircleNotSame: 'StbSecBarColumnCircleNotSame',

  // SRC Beam Figure Elements (inside StbSecFigureBeam_SRC)
  StbSecBeam_SRC_Straight: 'StbSecBeamStraight',
  StbSecBeam_SRC_Taper: 'StbSecBeamTaper',
  StbSecBeam_SRC_Haunch: 'StbSecBeamHaunch',

  // Note: StbSecSteelBeam_SRC_Straight/Taper/Haunch are NOT renamed to StbSecSteelBeam_SRC_Shape.
  // They require structural conversion (see type10-src-beam-steel-sections.js) to:
  //   <StbSecSteelBeam_SRC_Shape order="N">
  //     <StbSecSteelBeamStraight shape="..." strength_main="..." />
  //   </StbSecSteelBeam_SRC_Shape>

  // SRC Beam Steel Shape Elements (inside StbSecSteelBeam_SRC_Same/NotSame/ThreeTypes)
  StbSecBeam_SRC_SameShapeH: 'StbSecSteelBeam_SRC_ShapeH',
  StbSecBeam_SRC_SameShapeBox: 'StbSecSteelBeam_SRC_ShapeBox',
  StbSecBeam_SRC_SameShapePipe: 'StbSecSteelBeam_SRC_ShapePipe',
  StbSecBeam_SRC_SameShapeT: 'StbSecSteelBeam_SRC_ShapeT',

  // SRC Beam Bar Arrangement (inside StbSecBarArrangementBeam_SRC)
  StbSecBarBeam_SRC_Same: 'StbSecBarBeamSimple',
  StbSecBarBeam_SRC_ThreeTypes: 'StbSecBarBeamComplex',
  StbSecBarBeam_SRC_StartEnd: 'StbSecBarBeamComplex',

  // SSRC Column Bar Arrangement (alternate naming in some files)
  StbSecBarColumn_SSRC_RectSame: 'StbSecBarColumnRectSame',
  StbSecBarColumn_SSRC_RectNotSame: 'StbSecBarColumnRectNotSame',
  StbSecBarColumn_SSRC_CircleSame: 'StbSecBarColumnCircleSame',
  StbSecBarColumn_SSRC_CircleNotSame: 'StbSecBarColumnCircleNotSame',

  // SSRC Beam Bar Arrangement (alternate naming in some files)
  StbSecBarBeam_SSRC_Same: 'StbSecBarBeamSimple',
  StbSecBarBeam_SSRC_ThreeTypes: 'StbSecBarBeamComplex',
  StbSecBarBeam_SSRC_StartEnd: 'StbSecBarBeamComplex',

  // RC Slab Sections (inside StbSecSlab_RC_Conventional in v2.1.0)
  StbSecFigureSlab_RC: 'StbSecFigureSlab_RC_Conventional',

  // RC Slab Figure Child Elements (inside StbSecFigureSlab_RC_Conventional)
  StbSecSlab_RC_Straight: 'StbSecSlab_RC_ConventionalStraight',
  StbSecSlab_RC_Taper: 'StbSecSlab_RC_ConventionalTaper',
  StbSecSlab_RC_Haunch: 'StbSecSlab_RC_ConventionalHaunch',

  // S Beam internal elements are handled in Type4
};

/**
 * StbCommon element rename mapping: v2.0.2 -> v2.1.0
 * Note: Some files use lowercase 's' in v2.0.2 which is technically invalid
 */
const COMMON_ELEMENT_RENAME_MAP_202_TO_210 = {
  // Case fix for elements that may have lowercase 's'
  StbReinforcementstrengthList: 'StbReinforcementStrengthList',
  StbReinforcementstrength: 'StbReinforcementStrength',
};

/**
 * Build reverse mapping for v2.1.0 -> v2.0.2
 */
const ELEMENT_RENAME_MAP_210_TO_202 = Object.fromEntries(
  Object.entries(ELEMENT_RENAME_MAP_202_TO_210).map(([k, v]) => [v, k]),
);

/**
 * Rename elements from v2.0.2 to v2.1.0
 * @param {object} stbRoot - ST-Bridge root element
 */
export function renameElementsTo210(stbRoot) {
  let renameCount = 0;

  // Get StbSections element
  const root = getStbRoot(stbRoot);
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) {
    logger.debug('No StbSections found');
    return;
  }

  // Process RC Column sections
  const columnRc = sections['StbSecColumn_RC'];
  if (columnRc) {
    columnRc.forEach((section) => {
      // Elements are inside StbSecFigureColumn_RC
      const figure = section['StbSecFigureColumn_RC']?.[0];
      if (figure) {
        for (const [oldName, newName] of Object.entries(ELEMENT_RENAME_MAP_202_TO_210)) {
          if (figure[oldName]) {
            renameKey(figure, oldName, newName);
            renameCount++;
            logger.debug(`Renamed: ${oldName} -> ${newName}`);
          }
        }
      }

      // Process StbSecBarArrangementColumn_RC child elements
      const barArrangement = section['StbSecBarArrangementColumn_RC']?.[0];
      if (barArrangement) {
        for (const [oldName, newName] of Object.entries(ELEMENT_RENAME_MAP_202_TO_210)) {
          if (barArrangement[oldName]) {
            renameKey(barArrangement, oldName, newName);
            renameCount++;
            logger.debug(`Renamed: ${oldName} -> ${newName}`);
          }
        }
      }
    });
  }

  // Process SRC Column sections
  const columnSrc = sections['StbSecColumn_SRC'];
  if (columnSrc) {
    columnSrc.forEach((section) => {
      // Elements are inside StbSecFigureColumn_SRC
      const figure = section['StbSecFigureColumn_SRC']?.[0];
      if (figure) {
        // Map SRC-specific elements to unified names
        if (figure['StbSecColumn_SRC_Rect']) {
          renameKey(figure, 'StbSecColumn_SRC_Rect', 'StbSecColumnRect');
          renameCount++;
          logger.debug('Renamed: StbSecColumn_SRC_Rect -> StbSecColumnRect');
        }
        if (figure['StbSecColumn_SRC_Circle']) {
          renameKey(figure, 'StbSecColumn_SRC_Circle', 'StbSecColumnCircle');
          renameCount++;
          logger.debug('Renamed: StbSecColumn_SRC_Circle -> StbSecColumnCircle');
        }
      }

      // Process StbSecSteelFigureColumn_SRC child elements
      const steelFigure = section['StbSecSteelFigureColumn_SRC']?.[0];
      if (steelFigure) {
        // Process Same/NotSame/ThreeTypes containers
        const containers = [
          steelFigure['StbSecSteelColumn_SRC_Same']?.[0],
          ...(steelFigure['StbSecSteelColumn_SRC_NotSame'] || []),
          ...(steelFigure['StbSecSteelColumn_SRC_ThreeTypes'] || []),
        ];

        containers.forEach((container) => {
          if (container) {
            for (const [oldName, newName] of Object.entries(ELEMENT_RENAME_MAP_202_TO_210)) {
              if (container[oldName]) {
                renameKey(container, oldName, newName);
                renameCount++;
                logger.debug(`Renamed: ${oldName} -> ${newName}`);
              }
            }
          }
        });
      }

      // Process StbSecBarArrangementColumn_SRC child elements
      const barArrangement = section['StbSecBarArrangementColumn_SRC']?.[0];
      if (barArrangement) {
        for (const [oldName, newName] of Object.entries(ELEMENT_RENAME_MAP_202_TO_210)) {
          if (barArrangement[oldName]) {
            renameKey(barArrangement, oldName, newName);
            renameCount++;
            logger.debug(`Renamed: ${oldName} -> ${newName}`);
          }
        }
      }
    });
  }

  // Process RC Beam sections
  const beamRc = sections['StbSecBeam_RC'];
  if (beamRc) {
    beamRc.forEach((section) => {
      // Elements are inside StbSecFigureBeam_RC
      const figures = section['StbSecFigureBeam_RC'] || [];
      figures.forEach((figure, index) => {
        if (!figure['$']) figure['$'] = {};
        if (!figure['$'].order) {
          figure['$'].order = String(index + 1);
          logger.debug(`Added order to StbSecFigureBeam_RC: ${figure['$'].order}`);
        }
        for (const [oldName, newName] of Object.entries(ELEMENT_RENAME_MAP_202_TO_210)) {
          if (figure[oldName]) {
            renameKey(figure, oldName, newName);
            renameCount++;
            logger.debug(`Renamed: ${oldName} -> ${newName}`);
          }
        }
      });

      // Process StbSecBarArrangementBeam_RC child elements
      const barArrangement = section['StbSecBarArrangementBeam_RC']?.[0];
      if (barArrangement) {
        for (const [oldName, newName] of Object.entries(ELEMENT_RENAME_MAP_202_TO_210)) {
          if (barArrangement[oldName]) {
            renameKey(barArrangement, oldName, newName);
            renameCount++;
            logger.debug(`Renamed: ${oldName} -> ${newName}`);
          }
        }
      }
    });
  }

  // Process SRC Beam sections
  const beamSrc = sections['StbSecBeam_SRC'];
  if (beamSrc) {
    beamSrc.forEach((section) => {
      // Elements are inside StbSecFigureBeam_SRC
      const figure = section['StbSecFigureBeam_SRC']?.[0];
      if (figure) {
        for (const [oldName, newName] of Object.entries(ELEMENT_RENAME_MAP_202_TO_210)) {
          if (figure[oldName]) {
            renameKey(figure, oldName, newName);
            renameCount++;
            logger.debug(`Renamed: ${oldName} -> ${newName}`);
          }
        }
      }

      // Process StbSecSteelFigureBeam_SRC child elements
      const steelFigures = section['StbSecSteelFigureBeam_SRC'] || [];
      steelFigures.forEach((steelFigure) => {
        if (!steelFigure) return;

        // First, rename direct child elements (StbSecSteelBeam_SRC_Straight, etc.)
        for (const [oldName, newName] of Object.entries(ELEMENT_RENAME_MAP_202_TO_210)) {
          if (steelFigure[oldName]) {
            renameKey(steelFigure, oldName, newName);
            renameCount++;
            logger.debug(`Renamed: ${oldName} -> ${newName}`);
          }
        }

        // Process Same/NotSame/ThreeTypes containers
        const containers = [
          steelFigure['StbSecSteelBeam_SRC_Same']?.[0],
          ...(steelFigure['StbSecSteelBeam_SRC_NotSame'] || []),
          ...(steelFigure['StbSecSteelBeam_SRC_ThreeTypes'] || []),
        ];

        containers.forEach((container) => {
          if (container) {
            for (const [oldName, newName] of Object.entries(ELEMENT_RENAME_MAP_202_TO_210)) {
              if (container[oldName]) {
                renameKey(container, oldName, newName);
                renameCount++;
                logger.debug(`Renamed: ${oldName} -> ${newName}`);
              }
            }
          }
        });
      });

      // Process StbSecBarArrangementBeam_SRC child elements
      const barArrangement = section['StbSecBarArrangementBeam_SRC']?.[0];
      if (barArrangement) {
        for (const [oldName, newName] of Object.entries(ELEMENT_RENAME_MAP_202_TO_210)) {
          if (barArrangement[oldName]) {
            renameKey(barArrangement, oldName, newName);
            renameCount++;
            logger.debug(`Renamed: ${oldName} -> ${newName}`);
          }
        }
      }
    });
  }

  logger.info(`Element renaming complete: ${renameCount} elements renamed`);
}

/**
 * Convert StbSecBeamHaunch elements to StbSecBeamStraight
 * (StbSecBeamHaunch is not allowed in v2.1.0)
 * @param {object} stbRoot - ST-Bridge root element
 */
export function convertHaunchToStraightTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let convertedCount = 0;

  // Helper to convert haunch elements to straight
  const convertHaunchToStraight = (figure) => {
    const haunchElements = figure['StbSecBeamHaunch'];
    if (!haunchElements || haunchElements.length === 0) return false;

    // Find CENTER position or use the first/middle element
    let centerHaunch = haunchElements.find((h) => h['$']?.pos === 'CENTER');
    if (!centerHaunch && haunchElements.length > 0) {
      // Use the middle element if no CENTER, or first if only one
      centerHaunch = haunchElements[Math.floor(haunchElements.length / 2)];
    }

    if (centerHaunch && centerHaunch['$']) {
      // Create StbSecBeamStraight from haunch values
      const straightAttrs = {
        width: centerHaunch['$'].width,
        depth: centerHaunch['$'].depth,
      };

      // Copy optional attributes if present
      if (centerHaunch['$'].horizontal_offset)
        straightAttrs.horizontal_offset = centerHaunch['$'].horizontal_offset;
      if (centerHaunch['$'].vertical_offset)
        straightAttrs.vertical_offset = centerHaunch['$'].vertical_offset;

      figure['StbSecBeamStraight'] = [{ $: straightAttrs }];
      delete figure['StbSecBeamHaunch'];
      return true;
    }
    return false;
  };

  // Process RC Beam sections
  const beamRc = sections['StbSecBeam_RC'];
  if (beamRc) {
    beamRc.forEach((section) => {
      const figures = section['StbSecFigureBeam_RC'] || [];
      figures.forEach((figure) => {
        if (convertHaunchToStraight(figure)) {
          convertedCount++;
        }
      });
    });
  }

  // Process SRC Beam sections
  const beamSrc = sections['StbSecBeam_SRC'];
  if (beamSrc) {
    beamSrc.forEach((section) => {
      const figures = section['StbSecFigureBeam_SRC'] || [];
      figures.forEach((figure) => {
        if (convertHaunchToStraight(figure)) {
          convertedCount++;
        }
      });
    });
  }

  if (convertedCount > 0) {
    logger.info(`Converted ${convertedCount} haunch beams to straight (lossy conversion)`);
  }
}

/**
 * Add order attribute to SRC beam figure elements
 * @param {object} stbRoot - ST-Bridge root element
 */
export function addOrderToSrcBeamFiguresTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;

  // Process SRC Beam sections
  const beamSrc = sections['StbSecBeam_SRC'];
  if (beamSrc) {
    beamSrc.forEach((section) => {
      // Add order to StbSecFigureBeam_SRC
      const figures = section['StbSecFigureBeam_SRC'] || [];
      figures.forEach((figure, index) => {
        if (!figure['$']) figure['$'] = {};
        if (!figure['$'].order) {
          figure['$'].order = String(index + 1);
          count++;
        }
      });

      // Add order to StbSecBarArrangementBeam_SRC
      const barArrs = section['StbSecBarArrangementBeam_SRC'] || [];
      barArrs.forEach((barArr, index) => {
        if (!barArr['$']) barArr['$'] = {};
        if (!barArr['$'].order) {
          barArr['$'].order = String(index + 1);
          count++;
        }
      });
    });
  }

  if (count > 0) {
    logger.info(`Added ${count} order attributes to SRC beam figures`);
  }
}

/**
 * Rename elements from v2.1.0 to v2.0.2
 * @param {object} stbRoot - ST-Bridge root element
 */
export function renameElementsTo202(stbRoot) {
  let renameCount = 0;

  // Get StbSections element
  const root = getStbRoot(stbRoot);
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) {
    logger.debug('No StbSections found');
    return;
  }

  // Process RC Column sections
  const columnRc = sections['StbSecColumn_RC'];
  if (columnRc) {
    columnRc.forEach((section) => {
      // Elements are inside StbSecFigureColumn_RC
      const figure = section['StbSecFigureColumn_RC']?.[0];
      if (figure) {
        for (const [oldName, newName] of Object.entries(ELEMENT_RENAME_MAP_210_TO_202)) {
          if (figure[oldName]) {
            renameKey(figure, oldName, newName);
            renameCount++;
            logger.debug(`Renamed: ${oldName} -> ${newName}`);
          }
        }
      }
    });
  }

  // Process SRC Column sections
  const columnSrc = sections['StbSecColumn_SRC'];
  if (columnSrc) {
    columnSrc.forEach((section) => {
      // Elements are inside StbSecFigureColumn_SRC
      const figure = section['StbSecFigureColumn_SRC']?.[0];
      if (figure) {
        // Map unified names back to SRC-specific names
        if (figure['StbSecColumnRect']) {
          renameKey(figure, 'StbSecColumnRect', 'StbSecColumn_SRC_Rect');
          renameCount++;
          logger.debug('Renamed: StbSecColumnRect -> StbSecColumn_SRC_Rect');
        }
        if (figure['StbSecColumnCircle']) {
          renameKey(figure, 'StbSecColumnCircle', 'StbSecColumn_SRC_Circle');
          renameCount++;
          logger.debug('Renamed: StbSecColumnCircle -> StbSecColumn_SRC_Circle');
        }
      }

      // Process StbSecSteelFigureColumn_SRC child elements
      const steelFigure = section['StbSecSteelFigureColumn_SRC']?.[0];
      if (steelFigure) {
        // Process Same/NotSame/ThreeTypes containers
        const containers = [
          steelFigure['StbSecSteelColumn_SRC_Same']?.[0],
          ...(steelFigure['StbSecSteelColumn_SRC_NotSame'] || []),
          ...(steelFigure['StbSecSteelColumn_SRC_ThreeTypes'] || []),
        ];

        containers.forEach((container) => {
          if (container) {
            for (const [oldName, newName] of Object.entries(ELEMENT_RENAME_MAP_210_TO_202)) {
              if (container[oldName]) {
                renameKey(container, oldName, newName);
                renameCount++;
                logger.debug(`Renamed: ${oldName} -> ${newName}`);
              }
            }
          }
        });
      }

      // Process StbSecBarArrangementColumn_SRC child elements
      const barArrangement = section['StbSecBarArrangementColumn_SRC']?.[0];
      if (barArrangement) {
        for (const [oldName, newName] of Object.entries(ELEMENT_RENAME_MAP_210_TO_202)) {
          if (barArrangement[oldName]) {
            renameKey(barArrangement, oldName, newName);
            renameCount++;
            logger.debug(`Renamed: ${oldName} -> ${newName}`);
          }
        }
      }
    });
  }

  // Process RC Beam sections
  const beamRc = sections['StbSecBeam_RC'];
  if (beamRc) {
    beamRc.forEach((section) => {
      // Elements are inside StbSecFigureBeam_RC
      const figure = section['StbSecFigureBeam_RC']?.[0];
      if (figure) {
        for (const [oldName, newName] of Object.entries(ELEMENT_RENAME_MAP_210_TO_202)) {
          if (figure[oldName]) {
            renameKey(figure, oldName, newName);
            renameCount++;
            logger.debug(`Renamed: ${oldName} -> ${newName}`);
          }
        }
      }
    });
  }

  // Process SRC Beam sections
  const beamSrc = sections['StbSecBeam_SRC'];
  if (beamSrc) {
    beamSrc.forEach((section) => {
      // Elements are inside StbSecFigureBeam_SRC
      const figure = section['StbSecFigureBeam_SRC']?.[0];
      if (figure) {
        for (const [oldName, newName] of Object.entries(ELEMENT_RENAME_MAP_210_TO_202)) {
          if (figure[oldName]) {
            renameKey(figure, oldName, newName);
            renameCount++;
            logger.debug(`Renamed: ${oldName} -> ${newName}`);
          }
        }
      }

      // Process StbSecSteelFigureBeam_SRC child elements
      const steelFigure = section['StbSecSteelFigureBeam_SRC']?.[0];
      if (steelFigure) {
        // Process Same/NotSame/ThreeTypes containers
        const containers = [
          steelFigure['StbSecSteelBeam_SRC_Same']?.[0],
          ...(steelFigure['StbSecSteelBeam_SRC_NotSame'] || []),
          ...(steelFigure['StbSecSteelBeam_SRC_ThreeTypes'] || []),
        ];

        containers.forEach((container) => {
          if (container) {
            for (const [oldName, newName] of Object.entries(ELEMENT_RENAME_MAP_210_TO_202)) {
              if (container[oldName]) {
                renameKey(container, oldName, newName);
                renameCount++;
                logger.debug(`Renamed: ${oldName} -> ${newName}`);
              }
            }
          }
        });
      }

      // Process StbSecBarArrangementBeam_SRC child elements
      const barArrangement = section['StbSecBarArrangementBeam_SRC']?.[0];
      if (barArrangement) {
        for (const [oldName, newName] of Object.entries(ELEMENT_RENAME_MAP_210_TO_202)) {
          if (barArrangement[oldName]) {
            renameKey(barArrangement, oldName, newName);
            renameCount++;
            logger.debug(`Renamed: ${oldName} -> ${newName}`);
          }
        }
      }
    });
  }

  logger.info(`Element renaming complete: ${renameCount} elements renamed`);
}

/**
 * Rename StbCommon child elements from v2.0.2 to v2.1.0
 * Handles case-sensitivity fixes for StbReinforcementstrengthList
 * @param {object} stbRoot - ST-Bridge root element
 */
export function renameCommonElementsTo210(stbRoot) {
  let renameCount = 0;

  const root = getStbRoot(stbRoot);
  const rootData = Array.isArray(root) ? root[0] : root;
  const stbCommon = rootData?.['StbCommon']?.[0];

  if (!stbCommon) {
    logger.debug('No StbCommon found');
    return;
  }

  // Rename StbReinforcementstrengthList -> StbReinforcementStrengthList (case fix)
  if (stbCommon['StbReinforcementstrengthList']) {
    const reinforcementList = stbCommon['StbReinforcementstrengthList'];

    // Also rename child elements StbReinforcementstrength -> StbReinforcementStrength
    if (Array.isArray(reinforcementList)) {
      reinforcementList.forEach((list) => {
        if (list['StbReinforcementstrength']) {
          renameKey(list, 'StbReinforcementstrength', 'StbReinforcementStrength');
          renameCount++;
          logger.debug('Renamed: StbReinforcementstrength -> StbReinforcementStrength');
        }
      });
    }

    renameKey(stbCommon, 'StbReinforcementstrengthList', 'StbReinforcementStrengthList');
    renameCount++;
    logger.debug('Renamed: StbReinforcementstrengthList -> StbReinforcementStrengthList');
  }

  if (renameCount > 0) {
    logger.info(`StbCommon element renaming complete: ${renameCount} elements renamed`);
  }
}

export {
  ELEMENT_RENAME_MAP_202_TO_210,
  ELEMENT_RENAME_MAP_210_TO_202,
  COMMON_ELEMENT_RENAME_MAP_202_TO_210,
};

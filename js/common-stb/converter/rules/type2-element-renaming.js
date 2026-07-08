/**
 * Type2: Element Renaming
 * - RC column section elements
 * - RC beam section elements
 */

import logger from '../utils/converter-logger.js';
import { renameKey, getStbRoot } from '../utils/xml-helper.js';

/**
 * マップに従ってオブジェクトのキーをリネームし、リネーム数を返す
 * @param {object} obj - 対象オブジェクト
 * @param {object} map - リネームマップ
 * @returns {number} リネームした件数
 */
function applyRenames(obj, map) {
  let count = 0;
  for (const [oldName, newName] of Object.entries(map)) {
    if (obj[oldName]) {
      renameKey(obj, oldName, newName);
      count++;
      logger.debug(`Renamed: ${oldName} -> ${newName}`);
    }
  }
  return count;
}

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

  const MAP = ELEMENT_RENAME_MAP_202_TO_210;

  // Process RC Column sections
  const columnRc = sections['StbSecColumn_RC'];
  if (columnRc) {
    columnRc.forEach((section) => {
      const figure = section['StbSecFigureColumn_RC']?.[0];
      if (figure) renameCount += applyRenames(figure, MAP);

      const barArrangement = section['StbSecBarArrangementColumn_RC']?.[0];
      if (barArrangement) renameCount += applyRenames(barArrangement, MAP);
    });
  }

  // Process SRC Column sections
  const columnSrc = sections['StbSecColumn_SRC'];
  if (columnSrc) {
    columnSrc.forEach((section) => {
      // SRC-specific figure elements use different source names
      const figure = section['StbSecFigureColumn_SRC']?.[0];
      if (figure) {
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

      const steelFigure = section['StbSecSteelFigureColumn_SRC']?.[0];
      if (steelFigure) {
        const containers = [
          steelFigure['StbSecSteelColumn_SRC_Same']?.[0],
          ...(steelFigure['StbSecSteelColumn_SRC_NotSame'] || []),
          ...(steelFigure['StbSecSteelColumn_SRC_ThreeTypes'] || []),
        ];
        containers.forEach((c) => {
          if (c) renameCount += applyRenames(c, MAP);
        });
      }

      const barArrangement = section['StbSecBarArrangementColumn_SRC']?.[0];
      if (barArrangement) renameCount += applyRenames(barArrangement, MAP);
    });
  }

  // Process RC Beam sections
  const beamRc = sections['StbSecBeam_RC'];
  if (beamRc) {
    beamRc.forEach((section) => {
      const figures = section['StbSecFigureBeam_RC'] || [];
      figures.forEach((figure, index) => {
        if (!figure['$']) figure['$'] = {};
        if (!figure['$'].order) {
          figure['$'].order = String(index + 1);
          logger.debug(`Added order to StbSecFigureBeam_RC: ${figure['$'].order}`);
        }
        renameCount += applyRenames(figure, MAP);
      });

      const barArrangement = section['StbSecBarArrangementBeam_RC']?.[0];
      if (barArrangement) renameCount += applyRenames(barArrangement, MAP);
    });
  }

  // Process SRC Beam sections
  const beamSrc = sections['StbSecBeam_SRC'];
  if (beamSrc) {
    beamSrc.forEach((section) => {
      const figure = section['StbSecFigureBeam_SRC']?.[0];
      if (figure) renameCount += applyRenames(figure, MAP);

      const steelFigures = section['StbSecSteelFigureBeam_SRC'] || [];
      steelFigures.forEach((steelFigure) => {
        if (!steelFigure) return;
        renameCount += applyRenames(steelFigure, MAP);

        const containers = [
          steelFigure['StbSecSteelBeam_SRC_Same']?.[0],
          ...(steelFigure['StbSecSteelBeam_SRC_NotSame'] || []),
          ...(steelFigure['StbSecSteelBeam_SRC_ThreeTypes'] || []),
        ];
        containers.forEach((c) => {
          if (c) renameCount += applyRenames(c, MAP);
        });
      });

      const barArrangement = section['StbSecBarArrangementBeam_SRC']?.[0];
      if (barArrangement) renameCount += applyRenames(barArrangement, MAP);
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

// Context-aware reverse rename maps (resolve multi-source collisions by container type)
const BEAM_FIGURE_RC_MAP = {
  StbSecBeamStraight: 'StbSecBeam_RC_Straight',
  StbSecBeamHaunch: 'StbSecBeam_RC_Haunch',
  StbSecBeamTaper: 'StbSecBeam_RC_Taper',
};
const BEAM_FIGURE_SRC_MAP = {
  StbSecBeamStraight: 'StbSecBeam_SRC_Straight',
  StbSecBeamHaunch: 'StbSecBeam_SRC_Haunch',
  StbSecBeamTaper: 'StbSecBeam_SRC_Taper',
};
const BAR_COL_RC_MAP = {
  StbSecBarColumnRectSame: 'StbSecBarColumn_RC_RectSame',
  StbSecBarColumnRectNotSame: 'StbSecBarColumn_RC_RectNotSame',
  StbSecBarColumnCircleSame: 'StbSecBarColumn_RC_CircleSame',
  StbSecBarColumnCircleNotSame: 'StbSecBarColumn_RC_CircleNotSame',
};
const BAR_COL_SRC_MAP = {
  StbSecBarColumnRectSame: 'StbSecBarColumn_SRC_RectSame',
  StbSecBarColumnRectNotSame: 'StbSecBarColumn_SRC_RectNotSame',
  StbSecBarColumnCircleSame: 'StbSecBarColumn_SRC_CircleSame',
  StbSecBarColumnCircleNotSame: 'StbSecBarColumn_SRC_CircleNotSame',
};

// Beam bar arrangement reverse maps (avoid SSRC collision)
const BAR_BEAM_RC_MAP = {
  StbSecBarBeamSimple: 'StbSecBarBeam_RC_Same',
  StbSecBarBeamComplex: 'StbSecBarBeam_RC_ThreeTypes',
};
const BAR_BEAM_SRC_MAP = {
  StbSecBarBeamSimple: 'StbSecBarBeam_SRC_Same',
  StbSecBarBeamComplex: 'StbSecBarBeam_SRC_ThreeTypes',
};
// SRC steel column shape: context-dependent on Same/NotSame container
const STEEL_COL_SRC_SAME_MAP = {
  StbSecSteelColumn_SRC_ShapeH: 'StbSecColumn_SRC_SameShapeH',
  StbSecSteelColumn_SRC_ShapeBox: 'StbSecColumn_SRC_SameShapeBox',
  StbSecSteelColumn_SRC_ShapePipe: 'StbSecColumn_SRC_SameShapePipe',
  StbSecSteelColumn_SRC_ShapeCross1: 'StbSecColumn_SRC_SameShapeCross', // Cross1 -> Cross（数字なし）に修正
  StbSecSteelColumn_SRC_ShapeCross2: 'StbSecColumn_SRC_SameShapeCross2',
  StbSecSteelColumn_SRC_ShapeT: 'StbSecColumn_SRC_SameShapeT',
};
const STEEL_COL_SRC_NOTSAME_MAP = {
  StbSecSteelColumn_SRC_ShapeH: 'StbSecColumn_SRC_NotSameShapeH',
  StbSecSteelColumn_SRC_ShapeBox: 'StbSecColumn_SRC_NotSameShapeBox',
  StbSecSteelColumn_SRC_ShapePipe: 'StbSecColumn_SRC_NotSameShapePipe',
  StbSecSteelColumn_SRC_ShapeCross1: 'StbSecColumn_SRC_NotSameShapeCross',
  StbSecSteelColumn_SRC_ShapeT: 'StbSecColumn_SRC_NotSameShapeT',
};

/**
 * Rename elements from v2.1.0 to v2.0.2 (context-aware to resolve multi-source collisions)
 * @param {object} stbRoot - ST-Bridge root element
 */
export function renameElementsTo202(stbRoot) {
  let renameCount = 0;

  const root = getStbRoot(stbRoot);
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) {
    logger.debug('No StbSections found');
    return;
  }

  // RC Column sections
  const columnRc = sections['StbSecColumn_RC'];
  if (columnRc) {
    columnRc.forEach((section) => {
      const figure = section['StbSecFigureColumn_RC']?.[0];
      if (figure) {
        renameCount += applyRenames(figure, ELEMENT_RENAME_MAP_210_TO_202);
      }
      const barArr = section['StbSecBarArrangementColumn_RC']?.[0];
      if (barArr) renameCount += applyRenames(barArr, BAR_COL_RC_MAP);
    });
  }

  // SRC Column sections
  const columnSrc = sections['StbSecColumn_SRC'];
  if (columnSrc) {
    columnSrc.forEach((section) => {
      const figure = section['StbSecFigureColumn_SRC']?.[0];
      if (figure) {
        if (figure['StbSecColumnRect']) {
          renameKey(figure, 'StbSecColumnRect', 'StbSecColumn_SRC_Rect');
          renameCount++;
        }
        if (figure['StbSecColumnCircle']) {
          renameKey(figure, 'StbSecColumnCircle', 'StbSecColumn_SRC_Circle');
          renameCount++;
        }
      }

      const steelFigure = section['StbSecSteelFigureColumn_SRC']?.[0];
      if (steelFigure) {
        (steelFigure['StbSecSteelColumn_SRC_Same'] || []).forEach((c) => {
          if (c) renameCount += applyRenames(c, STEEL_COL_SRC_SAME_MAP);
        });
        (steelFigure['StbSecSteelColumn_SRC_NotSame'] || []).forEach((c) => {
          if (c) renameCount += applyRenames(c, STEEL_COL_SRC_NOTSAME_MAP);
        });
        (steelFigure['StbSecSteelColumn_SRC_ThreeTypes'] || []).forEach((c) => {
          // ThreeTypes uses NotSame-like names
          if (c) renameCount += applyRenames(c, STEEL_COL_SRC_NOTSAME_MAP);
        });
      }

      const barArr = section['StbSecBarArrangementColumn_SRC']?.[0];
      if (barArr) renameCount += applyRenames(barArr, BAR_COL_SRC_MAP);
    });
  }

  // RC Beam sections — use RC-specific maps to avoid SSRC/SRC collision
  const beamRc = sections['StbSecBeam_RC'];
  if (beamRc) {
    beamRc.forEach((section) => {
      (section['StbSecFigureBeam_RC'] || []).forEach((figure) => {
        renameCount += applyRenames(figure, BEAM_FIGURE_RC_MAP);
      });
      (section['StbSecBarArrangementBeam_RC'] || []).forEach((barArr) => {
        renameCount += applyRenames(barArr, BAR_BEAM_RC_MAP);
      });
    });
  }

  // SRC Beam sections — use SRC-specific maps to avoid SSRC collision
  const beamSrc = sections['StbSecBeam_SRC'];
  if (beamSrc) {
    beamSrc.forEach((section) => {
      (section['StbSecFigureBeam_SRC'] || []).forEach((figure) => {
        renameCount += applyRenames(figure, BEAM_FIGURE_SRC_MAP);
      });

      (section['StbSecSteelFigureBeam_SRC'] || []).forEach((steelFigure) => {
        if (!steelFigure) return;
        renameCount += applyRenames(steelFigure, ELEMENT_RENAME_MAP_210_TO_202);
        const containers = [
          steelFigure['StbSecSteelBeam_SRC_Same']?.[0],
          ...(steelFigure['StbSecSteelBeam_SRC_NotSame'] || []),
          ...(steelFigure['StbSecSteelBeam_SRC_ThreeTypes'] || []),
        ];
        containers.forEach((c) => {
          if (c) renameCount += applyRenames(c, ELEMENT_RENAME_MAP_210_TO_202);
        });
      });

      (section['StbSecBarArrangementBeam_SRC'] || []).forEach((barArr) => {
        renameCount += applyRenames(barArr, BAR_BEAM_SRC_MAP);
      });
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

/**
 * Element rename mapping: v2.1.0 -> v2.1.1 (typo fixes)
 */
export const ELEMENT_RENAME_MAP_210_TO_211 = {
  StbConnectionSpecStiffner: 'StbConnectionSpecStiffener',
  StbConnectionStiffner: 'StbConnectionStiffener',
  StbStiffners: 'StbStiffeners',
  StbStiffner: 'StbStiffener',
  'StbSecBuild-HAssymmetric': 'StbSecBuild-HAsymmetric',
};

export const ELEMENT_RENAME_MAP_211_TO_210 = Object.fromEntries(
  Object.entries(ELEMENT_RENAME_MAP_210_TO_211).map(([k, v]) => [v, k]),
);

/**
 * Parent-scoped element renames: v2.1.0 -> v2.1.1.
 * v2.1.0 mistakenly referenced StbSecIsolatingDeviceSpecificationChange inside
 * StbSecDampingDeviceFriction; v2.1.1 fixed the reference. The name must only be
 * changed under that parent (it is legitimate elsewhere).
 */
const SCOPED_ELEMENT_RENAME_210_TO_211 = [
  {
    parent: 'StbSecDampingDeviceFriction',
    old: 'StbSecIsolatingDeviceSpecificationChange',
    new: 'StbSecDampingDeviceSpecificationChange',
  },
];

const SCOPED_ELEMENT_RENAME_211_TO_210 = SCOPED_ELEMENT_RENAME_210_TO_211.map(
  ({ parent, old: o, new: n }) => ({ parent, old: n, new: o }),
);

/**
 * Walk the tree renaming child elements only under a named parent element.
 * @param {object} node - Current XML node
 * @param {Array} scopedRenames - Array of { parent, old, new }
 * @returns {number} Number of renames performed
 */
function walkAndRenameScoped(node, scopedRenames) {
  if (!node || typeof node !== 'object') return 0;
  let count = 0;

  const visit = (key, item) => {
    if (!item || typeof item !== 'object') return;
    for (const { parent, old: oldName, new: newName } of scopedRenames) {
      if (key === parent && Object.prototype.hasOwnProperty.call(item, oldName)) {
        renameKey(item, oldName, newName);
        count++;
        logger.debug(`Renamed element (scoped to ${parent}): ${oldName} -> ${newName}`);
      }
    }
    count += walkAndRenameScoped(item, scopedRenames);
  };

  for (const key of Object.keys(node)) {
    if (key === '$' || key === '_') continue;
    const children = node[key];
    if (Array.isArray(children)) {
      children.forEach((item) => visit(key, item));
    } else {
      visit(key, children);
    }
  }

  return count;
}

/**
 * Walk the entire STB tree and apply element renames from a flat map.
 * This is used for 2.1.x typo-fix renames that can appear anywhere in the document.
 * @param {object} node - Current XML node
 * @param {object} map - Rename map { oldName: newName }
 * @returns {number} Number of renames performed
 */
function walkAndRename(node, map) {
  if (!node || typeof node !== 'object') return 0;
  let count = 0;

  for (const [oldName, newName] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(node, oldName)) {
      renameKey(node, oldName, newName);
      count++;
      logger.debug(`Renamed element: ${oldName} -> ${newName}`);
    }
  }

  for (const key of Object.keys(node)) {
    if (key === '$' || key === '_') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      child.forEach((item) => {
        count += walkAndRename(item, map);
      });
    } else if (child && typeof child === 'object') {
      count += walkAndRename(child, map);
    }
  }

  return count;
}

/**
 * Rename elements with typo fixes from v2.1.0 to v2.1.1
 * @param {object} stbRoot - ST-Bridge root element
 */
export function renameElementsTo211(stbRoot) {
  const count =
    walkAndRename(stbRoot, ELEMENT_RENAME_MAP_210_TO_211) +
    walkAndRenameScoped(stbRoot, SCOPED_ELEMENT_RENAME_210_TO_211);
  if (count > 0) {
    logger.info(`Element renaming (2.1.0->2.1.1) complete: ${count} elements renamed`);
  }
}

/**
 * Rename elements with typo fixes from v2.1.1 to v2.1.0
 * @param {object} stbRoot - ST-Bridge root element
 */
export function renameElementsTo210from211(stbRoot) {
  const count =
    walkAndRename(stbRoot, ELEMENT_RENAME_MAP_211_TO_210) +
    walkAndRenameScoped(stbRoot, SCOPED_ELEMENT_RENAME_211_TO_210);
  if (count > 0) {
    logger.info(`Element renaming (2.1.1->2.1.0) complete: ${count} elements renamed`);
  }
}

export {
  ELEMENT_RENAME_MAP_202_TO_210,
  ELEMENT_RENAME_MAP_210_TO_202,
  COMMON_ELEMENT_RENAME_MAP_202_TO_210,
};

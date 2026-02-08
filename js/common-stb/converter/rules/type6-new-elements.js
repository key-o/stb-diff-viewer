/**
 * Type6: New Element Generation/Removal
 *
 * Elements that exist only in v2.1.0:
 * - StbJointArrangements (joint arrangements)
 * - StbReinforcementStrengthListPile (pile reinforcement strength list)
 */

import logger from '../utils/converter-logger.js';
import { getStbRoot } from '../utils/xml-helper.js';

/**
 * Old v2.0.2 element names in StbApplyConditionsList that don't exist in v2.1.0
 * These are restructured to StbApplyConditionList_RC/StbApplyConditionList_S in v2.1.0
 */
const V202_APPLY_CONDITIONS_ELEMENTS = [
  'StbColumn_RC_RebarPositionApply',
  'StbColumn_RC_BarSpacingApply',
  'StbColumn_SRC_RebarPositionApply',
  'StbColumn_SRC_BarSpacingApply',
  'StbBeam_RC_RebarPositionApply',
  'StbBeam_RC_BarWebApply',
  'StbBeam_RC_BarSpacingApply',
  'StbBeam_SRC_RebarPositionApply',
  'StbBeam_SRC_BarWebApply',
  'StbBeam_SRC_BarSpacingApply',
  'StbSlab_RC_BarPositionApply',
  'StbWall_RC_BarPositionApply',
  'StbFoundation_RC_BarPositionApply',
  'StbPile_RC_BarPositionApply',
  'StbParapet_RC_BarPositionApply',
];

/**
 * v2.0.2 bar beam elements that need conversion to v2.1.0 format
 */
const V202_BAR_BEAM_ELEMENTS = [
  'StbSecBarBeam_RC_Same',
  'StbSecBarBeam_RC_ThreeTypes',
  'StbSecBarBeam_RC_StartEnd',
];

/**
 * Convert StbSecBarBeam_RC_Same to StbSecBarBeamSimple format
 * @param {object} sameElement - v2.0.2 StbSecBarBeam_RC_Same element
 * @returns {object} v2.1.0 StbSecBarBeamSimple element
 */
function convertBarBeamSameToSimple(sameElement) {
  const attrs = sameElement['$'] || {};

  const mainBars = [];
  const addMainBarsForPos = (pos, baseD, baseStrength, counts, startStep = 1) => {
    let step = startStep;
    counts.forEach((count) => {
      if (!count || !baseD) return;
      mainBars.push({
        $: {
          pos,
          step: String(step++),
          D: baseD,
          strength: baseStrength || '',
          N: String(count),
        },
      });
    });
    return step;
  };

  const topCounts = [attrs.N_main_top_1st, attrs.N_main_top_2nd, attrs.N_main_top_3rd];
  const bottomCounts = [attrs.N_main_bottom_1st, attrs.N_main_bottom_2nd, attrs.N_main_bottom_3rd];

  const topStep = addMainBarsForPos('TOP', attrs.D_main, attrs.strength_main, topCounts, 1);
  const bottomStep = addMainBarsForPos(
    'BOTTOM',
    attrs.D_main,
    attrs.strength_main,
    bottomCounts,
    1,
  );

  const topCounts2nd = [
    attrs.N_2nd_main_top_1st,
    attrs.N_2nd_main_top_2nd,
    attrs.N_2nd_main_top_3rd,
  ];
  const bottomCounts2nd = [
    attrs.N_2nd_main_bottom_1st,
    attrs.N_2nd_main_bottom_2nd,
    attrs.N_2nd_main_bottom_3rd,
  ];

  addMainBarsForPos('TOP', attrs.D_2nd_main, attrs.strength_2nd_main, topCounts2nd, topStep);
  addMainBarsForPos(
    'BOTTOM',
    attrs.D_2nd_main,
    attrs.strength_2nd_main,
    bottomCounts2nd,
    bottomStep,
  );

  return {
    $: {
      D_stirrup: attrs.D_stirrup || attrs.D_main || '0',
      N_stirrup: attrs.N_stirrup || '2',
      pitch_stirrup: attrs.pitch_stirrup || '0',
      ...(attrs.D_web && { D_web: attrs.D_web }),
      ...(attrs.N_web && { N_web: attrs.N_web }),
      ...(attrs.strength_stirrup && { strength_stirrup: attrs.strength_stirrup }),
      ...(attrs.strength_web && { strength_web: attrs.strength_web }),
    },
    StbSecBarBeamSimpleMain: mainBars,
  };
}

/**
 * Handle new elements when converting from v2.0.2 to v2.1.0
 * - Remove old StbApplyConditionsList child elements (restructured in v2.1.0)
 * - Convert StbSecBarBeam_RC_* elements to new format
 * - StbJointArrangements and StbReinforcementStrengthListPile are optional
 * @param {object} stbRoot - ST-Bridge root element
 */
export function handleNewElementsTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  const rootData = Array.isArray(root) ? root[0] : root;

  // Handle StbApplyConditionsList restructuring (it's under StbCommon in STB format)
  const stbCommon = rootData?.['StbCommon']?.[0];
  const applyConditionsList = stbCommon?.['StbApplyConditionsList']?.[0];
  if (applyConditionsList) {
    let removedCount = 0;
    V202_APPLY_CONDITIONS_ELEMENTS.forEach((elemName) => {
      if (applyConditionsList[elemName]) {
        delete applyConditionsList[elemName];
        removedCount++;
      }
    });

    if (removedCount > 0) {
      logger.info(
        `Removed ${removedCount} v2.0.2 StbApplyConditionsList child elements (restructured in v2.1.0)`,
      );

      // If no children left, remove the empty StbApplyConditionsList
      const remainingChildren = Object.keys(applyConditionsList).filter((k) => k !== '$');
      if (remainingChildren.length === 0) {
        delete stbCommon['StbApplyConditionsList'];
        logger.info('Removed empty StbApplyConditionsList element');
      }
    }
  }

  // Handle StbSecBarArrangementBeam_RC element restructuring
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (sections) {
    const beamsRC = sections['StbSecBeam_RC'] || [];
    let barConvertedCount = 0;

    beamsRC.forEach((beam) => {
      const barArrangements = beam['StbSecBarArrangementBeam_RC'] || [];
      if (barArrangements.length === 0) return;

      barArrangements.forEach((barArrangement, index) => {
        if (!barArrangement['$']) barArrangement['$'] = {};
        if (!barArrangement['$'].order) {
          barArrangement['$'].order = String(index + 1);
        }

        const coverAttrs = {};
        const coverKeys = [
          'depth_cover_left',
          'depth_cover_right',
          'depth_cover_top',
          'depth_cover_bottom',
        ];
        coverKeys.forEach((key) => {
          if (barArrangement['$'][key] !== undefined) {
            coverAttrs[key] = barArrangement['$'][key];
            delete barArrangement['$'][key];
          }
        });

        // Check for v2.0.2 child elements
        if (barArrangement['StbSecBarBeam_RC_Same']) {
          const sameElement = barArrangement['StbSecBarBeam_RC_Same'][0];
          const simple = convertBarBeamSameToSimple(sameElement);
          if (Object.keys(coverAttrs).length > 0) {
            simple['$'] = { ...coverAttrs, ...simple['$'] };
          }
          barArrangement['StbSecBarBeamSimple'] = [simple];
          delete barArrangement['StbSecBarBeam_RC_Same'];
          barConvertedCount++;
        } else if (Object.keys(coverAttrs).length > 0) {
          logger.warn(
            `StbSecBarArrangementBeam_RC for beam ${beam['$']?.id}: depth_cover_* dropped (no Simple conversion target)`,
          );
        }

        // Handle ThreeTypes/StartEnd by removing (data loss - complex structure)
        if (barArrangement['StbSecBarBeam_RC_ThreeTypes']) {
          // For now, remove as data loss - complex conversion needed
          delete barArrangement['StbSecBarBeam_RC_ThreeTypes'];
          logger.warn(
            `StbSecBarBeam_RC_ThreeTypes removed for beam ${beam['$']?.id} (data loss - complex structure)`,
          );
        }

        if (barArrangement['StbSecBarBeam_RC_StartEnd']) {
          delete barArrangement['StbSecBarBeam_RC_StartEnd'];
          logger.warn(
            `StbSecBarBeam_RC_StartEnd removed for beam ${beam['$']?.id} (data loss - complex structure)`,
          );
        }
      });
    });

    if (barConvertedCount > 0) {
      logger.info(`Converted ${barConvertedCount} StbSecBarBeam_RC_Same elements to v2.1.0 format`);
    }
  }

  logger.debug('handleNewElementsTo210 completed');
}

/**
 * Remove v2.1.0 specific elements when converting to v2.0.2
 * @param {object} stbRoot - ST-Bridge root element
 */
export function removeNewElementsTo202(stbRoot) {
  const root = getStbRoot(stbRoot);
  const model = root?.[0]?.['StbModel']?.[0];
  if (!model) return;

  const members = model['StbMembers']?.[0];
  let removedCount = 0;

  // Note: StbJointArrangements are now converted in type7-joint-elements.js
  // They should not be deleted here anymore

  // Remove StbReinforcementStrengthListPile from StbCommon
  const common = model['StbCommon']?.[0];
  if (common?.['StbReinforcementStrengthListPile']) {
    delete common['StbReinforcementStrengthListPile'];
    removedCount++;
    logger.warn('Removed StbReinforcementStrengthListPile - not supported in v2.0.2');
  }

  // Remove any other v2.1.0 specific elements
  removeV210SpecificAttributes(stbRoot);

  if (removedCount > 0) {
    logger.info(`Removed ${removedCount} v2.1.0 specific elements`);
  }
}

/**
 * Remove v2.1.0 specific attributes that might cause issues in v2.0.2
 * @param {object} stbRoot - ST-Bridge root element
 */
function removeV210SpecificAttributes(stbRoot) {
  const root = getStbRoot(stbRoot);
  const model = root?.[0]?.['StbModel']?.[0];
  if (!model) return;

  // List of elements and their v2.1.0-only attributes
  const v210Attributes = {
    StbStory: ['level_name', 'kind', 'strength_concrete'],
    StbSlab: ['kind_structure', 'kind_slab', 'direction_load', 'isFoundation'],
    StbWall: ['kind_structure'],
    StbFoundation: ['kind_structure'],
  };

  // Process Stories
  const stories = model['StbStories']?.[0]?.['StbStory'] || [];
  stories.forEach((story) => {
    if (story['$']) {
      v210Attributes['StbStory'].forEach((attr) => {
        delete story['$'][attr];
      });
    }
  });

  // Process Members
  const members = model['StbMembers']?.[0];
  if (members) {
    // Slabs
    const slabs = members['StbSlabs']?.[0]?.['StbSlab'] || [];
    slabs.forEach((slab) => {
      if (slab['$']) {
        v210Attributes['StbSlab'].forEach((attr) => {
          delete slab['$'][attr];
        });
      }
    });

    // Walls
    const walls = members['StbWalls']?.[0]?.['StbWall'] || [];
    walls.forEach((wall) => {
      if (wall['$']) {
        v210Attributes['StbWall']?.forEach((attr) => {
          delete wall['$'][attr];
        });
      }
    });

    // Foundations (if exists)
    const foundations = members['StbFoundations']?.[0]?.['StbFoundation'] || [];
    foundations.forEach((foundation) => {
      if (foundation['$']) {
        v210Attributes['StbFoundation']?.forEach((attr) => {
          delete foundation['$'][attr];
        });
      }
    });
  }
}

/**
 * Check for data loss when converting to v2.0.2
 * @param {object} stbRoot - ST-Bridge root element
 * @returns {object} Report of potential data loss
 */
export function checkDataLossTo202(stbRoot) {
  const root = getStbRoot(stbRoot);
  const model = root?.[0]?.['StbModel']?.[0];
  const report = {
    jointArrangements: 0,
    pileStrengthList: false,
    multiSectionBeams: 0,
  };

  if (!model) return report;

  // Check StbJointArrangements
  const members = model['StbMembers']?.[0];
  if (members?.['StbJointArrangements']) {
    report.jointArrangements =
      members['StbJointArrangements'][0]?.['StbJointArrangement']?.length || 0;
  }

  // Check StbReinforcementStrengthListPile
  const common = model['StbCommon']?.[0];
  if (common?.['StbReinforcementStrengthListPile']) {
    report.pileStrengthList = true;
  }

  // Check multi-section beams
  const sections = model['StbSections']?.[0];
  const beamsS = sections?.['StbSecBeam_S'] || [];
  beamsS.forEach((beam) => {
    const figureBeam = beam['StbSecSteelFigureBeam_S']?.[0];
    if (figureBeam) {
      const shapes = figureBeam['StbSecSteelBeam_S_Shape'] || [];
      if (shapes.length > 1) {
        report.multiSectionBeams++;
      }
    }
  });

  return report;
}

/**
 * Generate data loss report
 * @param {object} report - Data loss report from checkDataLossTo202
 * @returns {string[]} Array of warning messages
 */
export function generateDataLossWarnings(report) {
  const warnings = [];

  if (report.jointArrangements > 0) {
    warnings.push(
      `${report.jointArrangements} joint arrangements will be removed (not supported in v2.0.2)`,
    );
  }

  if (report.pileStrengthList) {
    warnings.push('Pile reinforcement strength list will be removed (not supported in v2.0.2)');
  }

  if (report.multiSectionBeams > 0) {
    warnings.push(
      `${report.multiSectionBeams} multi-section beams will be simplified to single section`,
    );
  }

  return warnings;
}

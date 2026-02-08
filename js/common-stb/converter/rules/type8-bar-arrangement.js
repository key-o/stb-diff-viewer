/**
 * Type8: Bar Arrangement Structure Changes
 * STB 2.0.2 -> 2.1.0: Bar arrangement elements require child elements
 *
 * STB 2.0.2:
 *   <StbSecBarArrangementColumn_RC depth_cover_*="...">
 *     <StbSecBarColumn_RC_RectSame D_main="..." D_band="..." ... />
 *   </StbSecBarArrangementColumn_RC>
 *
 * STB 2.1.0:
 *   <StbSecBarArrangementColumn_RC>
 *     <StbSecBarColumnRectSame>
 *       <StbSecBarColumnRectSameSimple D_main="..." D_hoop="..." ... />
 *     </StbSecBarColumnRectSame>
 *   </StbSecBarArrangementColumn_RC>
 */

import logger from '../utils/converter-logger.js';
import { getStbRoot } from '../utils/xml-helper.js';

/**
 * Attribute mapping from 2.0.2 to 2.1.0 for column bar arrangement
 */
const COLUMN_BAR_ATTR_MAP_202_TO_210 = {
  D_main: 'D_main',
  D_band: 'D_hoop',
  strength_main: 'strength_main',
  strength_band: 'strength_hoop',
  N_main_X_1st: 'N_X',
  N_main_Y_1st: 'N_Y',
  N_band_direction_X: 'N_hoop_X',
  N_band_direction_Y: 'N_hoop_Y',
  pitch_band: 'pitch_hoop',
  D_axial: 'D_axial',
  strength_axial: 'strength_axial',
  N_axial: 'N_axial',
  D_2nd_main: 'D_sub',
  strength_2nd_main: 'strength_sub',
};

/**
 * Attribute mapping from 2.0.2 to 2.1.0 for beam bar arrangement
 */
const BEAM_BAR_ATTR_MAP_202_TO_210 = {
  D_main: 'D_main',
  D_stirrup: 'D_stirrup',
  D_web: 'D_web',
  D_bar_spacing: 'D_bar_spacing',
  strength_main: 'strength_main',
  strength_stirrup: 'strength_stirrup',
  strength_web: 'strength_web',
  strength_bar_spacing: 'strength_bar_spacing',
  N_main_top_1st: 'N_top',
  N_main_bottom_1st: 'N_bottom',
  pitch_stirrup: 'pitch_stirrup',
  N_stirrup: 'N_stirrup',
};

/**
 * Attributes that move from parent to child element
 */
const PARENT_TO_CHILD_ATTRS = [
  'depth_cover_start_X',
  'depth_cover_end_X',
  'depth_cover_start_Y',
  'depth_cover_end_Y',
  'depth_cover_left',
  'depth_cover_right',
  'depth_cover_top',
  'depth_cover_bottom',
  'interval',
  'center_start_X',
  'center_end_X',
  'center_start_Y',
  'center_end_Y',
  'center_interval',
];

/**
 * 2.1.0 Column bar element names and their Simple/Complex child names
 */
const COLUMN_BAR_ELEMENTS_210 = {
  StbSecBarColumnRectSame: {
    simple: 'StbSecBarColumnRectSameSimple',
    complex: 'StbSecBarColumnRectSameComplex',
    requiredAttrs: ['D_main', 'N_X', 'N_Y', 'D_hoop', 'N_hoop_X', 'N_hoop_Y', 'pitch_hoop'],
  },
  StbSecBarColumnRectNotSame: {
    simple: 'StbSecBarColumnRectNotSameSimple',
    complex: 'StbSecBarColumnRectNotSameComplex',
    requiredAttrs: ['pos', 'D_main', 'N_X', 'N_Y', 'D_hoop', 'N_hoop_X', 'N_hoop_Y', 'pitch_hoop'],
  },
  StbSecBarColumnCircleSame: {
    simple: 'StbSecBarColumnCircleSameSimple',
    complex: 'StbSecBarColumnCircleSameComplex',
    requiredAttrs: ['D_main', 'N_main', 'D_hoop', 'N_hoop_X', 'N_hoop_Y', 'pitch_hoop'],
  },
  StbSecBarColumnCircleNotSame: {
    simple: 'StbSecBarColumnCircleNotSameSimple',
    complex: 'StbSecBarColumnCircleNotSameComplex',
    requiredAttrs: ['pos', 'D_main', 'N_main', 'D_hoop', 'N_hoop_X', 'N_hoop_Y', 'pitch_hoop'],
  },
};

/**
 * Circle column bar attribute mapping
 * STB 2.0.2 -> STB 2.1.0:
 * - N_main -> N_main (circle columns use N_main, not N)
 * - N_band -> (use N_hoop_X and N_hoop_Y for 2.1.0)
 */
const CIRCLE_COLUMN_BAR_ATTR_MAP_202_TO_210 = {
  D_main: 'D_main',
  D_band: 'D_hoop',
  strength_main: 'strength_main',
  strength_band: 'strength_hoop',
  N_main: 'N_main',
  N_band: 'N_hoop_X', // Will also set N_hoop_Y to same value
  pitch_band: 'pitch_hoop',
  D_axial: 'D_axial',
  strength_axial: 'strength_axial',
  N_axial: 'N_axial',
};

/**
 * Attributes that have MinExclusive > 0 constraint (length type)
 * Values of '0' must be removed
 */
const LENGTH_TYPE_ATTRS = [
  'depth_cover_start_X',
  'depth_cover_end_X',
  'depth_cover_start_Y',
  'depth_cover_end_Y',
  'depth_cover_left',
  'depth_cover_right',
  'depth_cover_top',
  'depth_cover_bottom',
  'depth_cover',
  'interval',
  'center_start_X',
  'center_end_X',
  'center_start_Y',
  'center_end_Y',
  'center_interval',
  'center',
  'pitch_hoop',
  'pitch_stirrup',
];

/**
 * Remove attributes with value '0' (violates MinExclusive constraint)
 * @param {object} attrs - The attributes object
 */
function removeZeroValueAttrs(attrs) {
  if (!attrs) return;
  for (const attr of LENGTH_TYPE_ATTRS) {
    if (attrs[attr] === '0' || attrs[attr] === 0) {
      delete attrs[attr];
    }
  }
}

/**
 * 2.1.0 Beam bar element names and their Simple/Complex child names
 */
const BEAM_BAR_ELEMENTS_210 = {
  StbSecBarBeamSimple: {
    child: 'StbSecBarBeamSimpleMain',
    requiredAttrs: ['D_main', 'N_top', 'N_bottom', 'D_stirrup', 'pitch_stirrup'],
  },
  StbSecBarBeamComplex: {
    // Complex beam has different structure
    children: ['StbSecBarBeamComplexMain', 'StbSecBarBeamComplexStirrup'],
  },
};

/**
 * Convert column bar arrangement elements for a single section
 * @param {object} barArrangement - The bar arrangement element
 * @param {boolean} isCircle - Whether this is for circle columns
 */
function convertColumnBarArrangement(barArrangement, isCircle = false) {
  if (!barArrangement) return;

  const parentAttrs = barArrangement['$'] || {};
  const attrMap = isCircle ? CIRCLE_COLUMN_BAR_ATTR_MAP_202_TO_210 : COLUMN_BAR_ATTR_MAP_202_TO_210;

  // Process each bar element type
  for (const [elementName, config] of Object.entries(COLUMN_BAR_ELEMENTS_210)) {
    const barElements = barArrangement[elementName];
    if (!barElements) continue;

    barElements.forEach((barElement) => {
      const oldAttrs = barElement['$'] || {};

      // Create child element with mapped attributes
      const childAttrs = {};

      // Map old attributes to new names
      for (const [oldName, newName] of Object.entries(attrMap)) {
        if (oldAttrs[oldName] !== undefined) {
          childAttrs[newName] = oldAttrs[oldName];
        }
      }

      // Move parent attributes (depth_cover_*, etc.) to child
      for (const attr of PARENT_TO_CHILD_ATTRS) {
        if (parentAttrs[attr] !== undefined) {
          childAttrs[attr] = parentAttrs[attr];
        }
      }

      // For circle columns, also set N_hoop_Y from N_band if not already set
      if (isCircle && oldAttrs['N_band'] && !childAttrs['N_hoop_Y']) {
        childAttrs['N_hoop_Y'] = oldAttrs['N_band'];
      }

      // For circle columns, remove rectangular-specific attributes
      // STB 2.1.0 uses depth_cover (single) and center (single) for circles
      if (isCircle) {
        delete childAttrs['depth_cover_start_X'];
        delete childAttrs['depth_cover_end_X'];
        delete childAttrs['depth_cover_start_Y'];
        delete childAttrs['depth_cover_end_Y'];
        delete childAttrs['interval'];
        delete childAttrs['center_start_X'];
        delete childAttrs['center_end_X'];
        delete childAttrs['center_start_Y'];
        delete childAttrs['center_end_Y'];
        delete childAttrs['center_interval'];
      }

      // Set default values for required attributes if missing
      if (!childAttrs['D_main']) childAttrs['D_main'] = 'D19';
      if (isCircle) {
        if (!childAttrs['N_main']) childAttrs['N_main'] = '8';
        if (!childAttrs['D_hoop']) childAttrs['D_hoop'] = 'D10';
        if (!childAttrs['N_hoop_X']) childAttrs['N_hoop_X'] = '1';
        if (!childAttrs['N_hoop_Y']) childAttrs['N_hoop_Y'] = '1';
        if (!childAttrs['pitch_hoop']) childAttrs['pitch_hoop'] = '100';
      } else {
        if (!childAttrs['N_X']) childAttrs['N_X'] = '3';
        if (!childAttrs['N_Y']) childAttrs['N_Y'] = '3';
        if (!childAttrs['D_hoop']) childAttrs['D_hoop'] = 'D10';
        if (!childAttrs['N_hoop_X']) childAttrs['N_hoop_X'] = '1';
        if (!childAttrs['N_hoop_Y']) childAttrs['N_hoop_Y'] = '1';
        if (!childAttrs['pitch_hoop']) childAttrs['pitch_hoop'] = '100';
      }

      // Remove '0' values that violate MinExclusive constraint
      removeZeroValueAttrs(childAttrs);

      // Create Simple child element (we use Simple as default)
      const childElementName = config.simple;
      barElement[childElementName] = [{ $: childAttrs }];

      // Clear old attributes (but keep structural attributes like D_bar_spacing if present)
      const structuralAttrs = ['D_bar_spacing', 'strength_bar_spacing', 'pitch_bar_spacing'];
      const newBarAttrs = {};
      for (const attr of structuralAttrs) {
        if (oldAttrs[attr] !== undefined) {
          newBarAttrs[attr] = oldAttrs[attr];
        }
      }
      barElement['$'] = newBarAttrs;
    });
  }

  // Clear parent attributes (depth_cover_*, etc.) as they've been moved to children
  const newParentAttrs = {};
  for (const [key, value] of Object.entries(parentAttrs)) {
    if (!PARENT_TO_CHILD_ATTRS.includes(key)) {
      newParentAttrs[key] = value;
    }
  }
  barArrangement['$'] = newParentAttrs;
}

/**
 * Convert beam bar arrangement elements for a single section
 * STB 2.1.0 structure:
 *   StbSecBarBeamSimple (D_stirrup, N_stirrup, pitch_stirrup, depth_cover_*)
 *     StbSecBarBeamSimpleMain pos="TOP" (step, D, N)
 *     StbSecBarBeamSimpleMain pos="BOTTOM" (step, D, N)
 * @param {object} barArrangement - The bar arrangement element
 */
function convertBeamBarArrangement(barArrangement) {
  if (!barArrangement) return;

  const parentAttrs = barArrangement['$'] || {};
  const barArrangementAttrs = {};
  const updateBarArrangementAttrs = (attrs) => {
    if (!attrs) return;
    if (attrs['D_bar_spacing']) barArrangementAttrs['D_bar_spacing'] = attrs['D_bar_spacing'];
    if (attrs['strength_bar_spacing'])
      barArrangementAttrs['strength_bar_spacing'] = attrs['strength_bar_spacing'];
    if (attrs['pitch_bar_spacing'])
      barArrangementAttrs['pitch_bar_spacing'] = attrs['pitch_bar_spacing'];
  };

  const createSimpleElementFromLegacyAttrs = (oldAttrs) => {
    const simpleAttrs = {};

    // Stirrup attributes (stay on StbSecBarBeamSimple)
    if (oldAttrs['D_stirrup']) simpleAttrs['D_stirrup'] = oldAttrs['D_stirrup'];
    if (oldAttrs['strength_stirrup'])
      simpleAttrs['strength_stirrup'] = oldAttrs['strength_stirrup'];
    if (oldAttrs['pitch_stirrup']) simpleAttrs['pitch_stirrup'] = oldAttrs['pitch_stirrup'];
    if (oldAttrs['N_stirrup']) simpleAttrs['N_stirrup'] = oldAttrs['N_stirrup'];

    // Web attributes
    if (oldAttrs['D_web']) simpleAttrs['D_web'] = oldAttrs['D_web'];
    if (oldAttrs['N_web']) simpleAttrs['N_web'] = oldAttrs['N_web'];
    if (oldAttrs['strength_web']) simpleAttrs['strength_web'] = oldAttrs['strength_web'];

    // Cover/interval attributes from parent move to StbSecBarBeamSimple
    for (const attr of PARENT_TO_CHILD_ATTRS) {
      if (parentAttrs[attr] !== undefined) {
        simpleAttrs[attr] = parentAttrs[attr];
      }
    }

    // Remove '0' values that violate MinExclusive constraint
    removeZeroValueAttrs(simpleAttrs);

    // Set defaults for required attributes
    if (!simpleAttrs['D_stirrup']) simpleAttrs['D_stirrup'] = 'D10';
    if (!simpleAttrs['N_stirrup']) simpleAttrs['N_stirrup'] = '2';
    if (!simpleAttrs['pitch_stirrup']) simpleAttrs['pitch_stirrup'] = '200';

    // Extract main bar info for creating StbSecBarBeamSimpleMain elements
    const D_main = oldAttrs['D_main'] || 'D19';
    const strength_main = oldAttrs['strength_main'];
    const N_top = oldAttrs['N_main_top_1st'] || oldAttrs['N_top'] || '2';
    const N_bottom = oldAttrs['N_main_bottom_1st'] || oldAttrs['N_bottom'] || '2';

    // Create two StbSecBarBeamSimpleMain child elements (TOP and BOTTOM)
    const mainElements = [];

    // TOP bar
    const topAttrs = { pos: 'TOP', step: '1', D: D_main, N: N_top };
    if (strength_main) topAttrs['strength'] = strength_main;
    mainElements.push({ $: topAttrs });

    // BOTTOM bar
    const bottomAttrs = { pos: 'BOTTOM', step: '1', D: D_main, N: N_bottom };
    if (strength_main) bottomAttrs['strength'] = strength_main;
    mainElements.push({ $: bottomAttrs });

    return {
      $: simpleAttrs,
      StbSecBarBeamSimpleMain: mainElements,
    };
  };

  // Process StbSecBarBeamSimple
  const simpleElements = barArrangement['StbSecBarBeamSimple'];
  if (simpleElements) {
    simpleElements.forEach((simpleElement) => {
      const oldAttrs = simpleElement['$'] || {};
      updateBarArrangementAttrs(oldAttrs);
      const normalized = createSimpleElementFromLegacyAttrs(oldAttrs);
      simpleElement['$'] = normalized['$'];
      simpleElement['StbSecBarBeamSimpleMain'] = normalized['StbSecBarBeamSimpleMain'];
    });
  }

  // Process StbSecBarBeamComplex (legacy v2.0.2 attrs) by normalizing to one Simple element.
  // This keeps data usable in v2.1.0 while avoiding invalid Complex-with-attrs output.
  const complexElements = barArrangement['StbSecBarBeamComplex'];
  if (Array.isArray(complexElements) && complexElements.length > 0) {
    complexElements.forEach((e) => updateBarArrangementAttrs(e?.['$']));
    const representative =
      complexElements.find((e) => e?.['$']?.pos === 'CENTER') ??
      complexElements.find((e) => e?.['$']?.pos === 'START') ??
      complexElements[0];
    const representativeAttrs = representative?.['$'] || {};
    barArrangement['StbSecBarBeamSimple'] = [
      createSimpleElementFromLegacyAttrs(representativeAttrs),
    ];
    delete barArrangement['StbSecBarBeamComplex'];
    if (complexElements.length > 1) {
      logger.warn(
        `Beam bar complex has ${complexElements.length} position variants. Collapsed to one StbSecBarBeamSimple using representative section.`,
      );
    }
  }

  // Clear parent attributes (depth_cover_*, etc.) as they've been moved
  const newParentAttrs = { ...barArrangementAttrs };
  for (const [key, value] of Object.entries(parentAttrs)) {
    if (!PARENT_TO_CHILD_ATTRS.includes(key)) {
      newParentAttrs[key] = value;
    }
  }
  barArrangement['$'] = newParentAttrs;
}

/**
 * Convert bar arrangement structure from v2.0.2 to v2.1.0
 * @param {object} stbRoot - ST-Bridge root element
 */
export function convertBarArrangementTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let columnCount = 0;
  let beamCount = 0;

  // Process RC Column sections
  const columnRc = sections['StbSecColumn_RC'];
  if (columnRc) {
    columnRc.forEach((section) => {
      const barArrangement = section['StbSecBarArrangementColumn_RC']?.[0];
      if (barArrangement) {
        // Determine if this is a circle or rect column
        const hasCircle =
          barArrangement['StbSecBarColumnCircleSame'] ||
          barArrangement['StbSecBarColumnCircleNotSame'];
        convertColumnBarArrangement(barArrangement, !!hasCircle);
        columnCount++;
      }
    });
  }

  // Process SRC Column sections
  const columnSrc = sections['StbSecColumn_SRC'];
  if (columnSrc) {
    columnSrc.forEach((section) => {
      const barArrangement = section['StbSecBarArrangementColumn_SRC']?.[0];
      if (barArrangement) {
        const hasCircle =
          barArrangement['StbSecBarColumnCircleSame'] ||
          barArrangement['StbSecBarColumnCircleNotSame'];
        convertColumnBarArrangement(barArrangement, !!hasCircle);
        columnCount++;
      }
    });
  }

  // Process RC Beam sections
  const beamRc = sections['StbSecBeam_RC'];
  if (beamRc) {
    beamRc.forEach((section) => {
      const barArrangement = section['StbSecBarArrangementBeam_RC']?.[0];
      if (barArrangement) {
        if (!barArrangement['$']) barArrangement['$'] = {};
        if (!barArrangement['$'].order) barArrangement['$'].order = '1';
        convertBeamBarArrangement(barArrangement);
        beamCount++;
      }
    });
  }

  // Process SRC Beam sections
  const beamSrc = sections['StbSecBeam_SRC'];
  if (beamSrc) {
    beamSrc.forEach((section) => {
      const barArrangement = section['StbSecBarArrangementBeam_SRC']?.[0];
      if (barArrangement) {
        if (!barArrangement['$']) barArrangement['$'] = {};
        if (!barArrangement['$'].order) barArrangement['$'].order = '1';
        convertBeamBarArrangement(barArrangement);
        beamCount++;
      }
    });
  }

  if (columnCount > 0 || beamCount > 0) {
    logger.info(`Bar arrangement structure conversion: ${columnCount} columns, ${beamCount} beams`);
  }
}

export default convertBarArrangementTo210;

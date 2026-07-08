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
  'center_top',
  'center_bottom',
  'center_side',
  'center_interval',
];

/**
 * v2.0.2 beam-arrangement parent attributes with no v2.1.x equivalent
 * (allowed neither on StbSecBarArrangementBeam_* nor on StbSecBarBeamSimple)
 */
const BEAM_PARENT_DROPPED_ATTRS = ['length_bar_start', 'length_bar_end'];

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
  'center_top',
  'center_bottom',
  'center_side',
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
 * Convert column bar arrangement elements for a single section
 * @param {object} barArrangement - The bar arrangement element
 * @param {boolean} isCircle - Whether this is for circle columns
 */
function convertColumnBarArrangement(barArrangement, isCircle = false) {
  if (!barArrangement) return;

  const parentAttrs = barArrangement['$'] || {};
  const attrMap = isCircle ? CIRCLE_COLUMN_BAR_ATTR_MAP_202_TO_210 : COLUMN_BAR_ATTR_MAP_202_TO_210;

  const POS_RENAME = { BASE: 'BOTTOM', FOOT: 'BOTTOM' };
  const STRUCTURAL_ATTRS = ['D_bar_spacing', 'strength_bar_spacing', 'pitch_bar_spacing'];

  const buildChildAttrs = (oldAttrs) => {
    const childAttrs = {};
    for (const [oldName, newName] of Object.entries(attrMap)) {
      if (oldAttrs[oldName] !== undefined) childAttrs[newName] = oldAttrs[oldName];
    }
    for (const attr of PARENT_TO_CHILD_ATTRS) {
      if (parentAttrs[attr] !== undefined) childAttrs[attr] = parentAttrs[attr];
    }
    if (oldAttrs['pos']) childAttrs['pos'] = POS_RENAME[oldAttrs['pos']] ?? oldAttrs['pos'];
    if (isCircle && oldAttrs['N_band'] && !childAttrs['N_hoop_Y']) {
      childAttrs['N_hoop_Y'] = oldAttrs['N_band'];
    }
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
    removeZeroValueAttrs(childAttrs);
    return childAttrs;
  };

  // Process each bar element type
  for (const [elementName, config] of Object.entries(COLUMN_BAR_ELEMENTS_210)) {
    const barElements = barArrangement[elementName];
    if (!barElements) continue;

    const isNotSame = elementName.includes('NotSame');

    barElements.forEach((barElement) => {
      const oldAttrs = barElement['$'] || {};
      const childAttrs = buildChildAttrs(oldAttrs);

      if (isNotSame) {
        // v2.1.1: each NotSame container must have exactly 2 Simple children (BOTTOM + TOP).
        // The v2.0.2 pos (BASE/TOP) becomes the container's identity but both BOTTOM and TOP
        // Simples are required inside every container.
        const bottomAttrs = { ...childAttrs, pos: 'BOTTOM' };
        const topAttrs = { ...childAttrs, pos: 'TOP' };
        barElement[config.simple] = [{ $: bottomAttrs }, { $: topAttrs }];
      } else {
        barElement[config.simple] = [{ $: childAttrs }];
      }

      const newBarAttrs = {};
      STRUCTURAL_ATTRS.forEach((a) => {
        if (oldAttrs[a] !== undefined) newBarAttrs[a] = oldAttrs[a];
      });
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
    const N_top = oldAttrs['N_main_top_1st'] || oldAttrs['N_top'] || '2'; // eslint-disable-line camelcase
    const N_bottom = oldAttrs['N_main_bottom_1st'] || oldAttrs['N_bottom'] || '2'; // eslint-disable-line camelcase

    // Create two StbSecBarBeamSimpleMain child elements (TOP and BOTTOM)
    const mainElements = [];

    // TOP bar
    const topAttrs = { pos: 'TOP', step: '1', D: D_main, N: N_top }; // eslint-disable-line camelcase
    if (strength_main) topAttrs['strength'] = strength_main;
    mainElements.push({ $: topAttrs });

    // BOTTOM bar
    const bottomAttrs = { pos: 'BOTTOM', step: '1', D: D_main, N: N_bottom }; // eslint-disable-line camelcase
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
      const usedPos = representativeAttrs.pos || 'unknown';
      const droppedPositions = complexElements
        .filter((e) => e !== representative)
        .map((e) => e?.['$']?.pos || 'unknown');
      logger.warn(
        `Beam bar complex: ${complexElements.length} positions collapsed to 1 StbSecBarBeamSimple (kept=${usedPos}, dropped=[${droppedPositions.join(', ')}]). Position-specific data lost.`,
      );
    }
  }

  // Clear parent attributes (depth_cover_*, etc.) as they've been moved
  const newParentAttrs = { ...barArrangementAttrs };
  for (const [key, value] of Object.entries(parentAttrs)) {
    if (BEAM_PARENT_DROPPED_ATTRS.includes(key)) {
      logger.warn(`Beam bar arrangement: '${key}' dropped (no v2.1.x equivalent)`);
      continue;
    }
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

// ─────────────────────────────────────────────────────────────────────────────
// v2.1.0 → v2.0.2 reverse conversion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reverse attribute map: v2.1.0 Simple child attrs → v2.0.2 parent element attrs
 */
const COLUMN_BAR_ATTR_MAP_210_TO_202 = Object.fromEntries(
  Object.entries(COLUMN_BAR_ATTR_MAP_202_TO_210)
    .filter(([, v]) => v !== 'N_hoop_X' && v !== 'N_hoop_Y') // N_hoop_X/Y have no direct 202 equivalent via this map
    .map(([k, v]) => [v, k]),
);
// N_hoop_X → N_band_direction_X, N_hoop_Y → N_band_direction_Y
COLUMN_BAR_ATTR_MAP_210_TO_202['N_hoop_X'] = 'N_band_direction_X';
COLUMN_BAR_ATTR_MAP_210_TO_202['N_hoop_Y'] = 'N_band_direction_Y';
COLUMN_BAR_ATTR_MAP_210_TO_202['pitch_hoop'] = 'pitch_band';

const CIRCLE_COLUMN_BAR_ATTR_MAP_210_TO_202 = Object.fromEntries(
  Object.entries(CIRCLE_COLUMN_BAR_ATTR_MAP_202_TO_210)
    .filter(([, v]) => v !== 'N_hoop_X')
    .map(([k, v]) => [v, k]),
);
CIRCLE_COLUMN_BAR_ATTR_MAP_210_TO_202['N_hoop_X'] = 'N_band';
CIRCLE_COLUMN_BAR_ATTR_MAP_210_TO_202['pitch_hoop'] = 'pitch_band';

// Map from v2.1.0 container name → Simple child name (used for reverse lookup)
const SIMPLE_CHILD_BY_CONTAINER_210 = Object.fromEntries(
  Object.entries(COLUMN_BAR_ELEMENTS_210).map(([k, v]) => [k, v.simple]),
);

// Also index by the v2.0.2 container names that type2 has already renamed to
// (RC: StbSecBarColumn_RC_*, SRC: StbSecBarColumn_SRC_*)
// We build a lookup: v2.0.2-container-name → Simple child name in v2.1.0
const SIMPLE_CHILD_BY_V202_CONTAINER = {
  StbSecBarColumn_RC_RectSame: 'StbSecBarColumnRectSameSimple',
  StbSecBarColumn_RC_RectNotSame: 'StbSecBarColumnRectNotSameSimple',
  StbSecBarColumn_RC_CircleSame: 'StbSecBarColumnCircleSameSimple',
  StbSecBarColumn_RC_CircleNotSame: 'StbSecBarColumnCircleNotSameSimple',
  StbSecBarColumn_SRC_RectSame: 'StbSecBarColumnRectSameSimple',
  StbSecBarColumn_SRC_RectNotSame: 'StbSecBarColumnRectNotSameSimple',
  StbSecBarColumn_SRC_CircleSame: 'StbSecBarColumnCircleSameSimple',
  StbSecBarColumn_SRC_CircleNotSame: 'StbSecBarColumnCircleNotSameSimple',
  // SSRC variants
  StbSecBarColumn_SSRC_RectSame: 'StbSecBarColumnRectSameSimple',
  StbSecBarColumn_SSRC_RectNotSame: 'StbSecBarColumnRectNotSameSimple',
  StbSecBarColumn_SSRC_CircleSame: 'StbSecBarColumnCircleSameSimple',
  StbSecBarColumn_SSRC_CircleNotSame: 'StbSecBarColumnCircleNotSameSimple',
};

/**
 * Reverse a column bar arrangement element from v2.1.0 to v2.0.2 format.
 * Handles both v2.1.0 container names (pre-type2) and v2.0.2 names (post-type2 rename).
 * Extracts attributes from the Simple child and restores depth_cover_* to parent.
 */
function reverseColumnBarArrangement(barArrangement, isCircle = false) {
  if (!barArrangement) return;

  const attrMap = isCircle ? CIRCLE_COLUMN_BAR_ATTR_MAP_210_TO_202 : COLUMN_BAR_ATTR_MAP_210_TO_202;
  const parentAttrs = barArrangement['$'] || {};
  const newParentAttrs = {};

  // Build combined lookup: containerName → Simple child name
  // Covers v2.1.0 names and v2.0.2 names (post-type2 rename)
  const containerToSimple = { ...SIMPLE_CHILD_BY_CONTAINER_210, ...SIMPLE_CHILD_BY_V202_CONTAINER };

  for (const [containerName, childName] of Object.entries(containerToSimple)) {
    const containers = barArrangement[containerName];
    if (!containers) continue;

    containers.forEach((container) => {
      const containerAttrs = container['$'] || {};
      const simpleChildren = container[childName] || [];
      if (simpleChildren.length === 0) return; // already flat, nothing to do

      // Use first Simple child (BOTTOM or only one) for the attribute source
      const childAttrs = simpleChildren[0]?.['$'] || {};

      // Build v2.0.2 element attrs by reversing the attribute map
      const newAttrs = {};
      for (const [v210name, v202name] of Object.entries(attrMap)) {
        if (childAttrs[v210name] !== undefined) newAttrs[v202name] = childAttrs[v210name];
      }

      // Restore pos from child to parent element for NotSame
      if (childAttrs['pos']) newAttrs['pos'] = childAttrs['pos'];

      // Restore depth_cover_* to parent bar arrangement
      for (const attr of PARENT_TO_CHILD_ATTRS) {
        if (childAttrs[attr] !== undefined) newParentAttrs[attr] = childAttrs[attr];
      }

      // Structural attrs stay on container
      const STRUCTURAL = ['D_bar_spacing', 'strength_bar_spacing', 'pitch_bar_spacing'];
      STRUCTURAL.forEach((a) => {
        if (containerAttrs[a]) newAttrs[a] = containerAttrs[a];
      });

      // Replace the container's Simple child structure with flat attrs
      delete container[childName];
      container['$'] = newAttrs;
    });
  }

  // Keep non-depth_cover parent attrs (e.g. kind_corner)
  for (const [k, v] of Object.entries(parentAttrs)) {
    if (!PARENT_TO_CHILD_ATTRS.includes(k) && k !== 'order') newParentAttrs[k] = v;
  }
  barArrangement['$'] = newParentAttrs;
}

/**
 * Flatten a renamed bar beam element (type2 renamed StbSecBarBeamSimple →
 * StbSecBarBeam_RC/SRC_Same) by extracting attributes from StbSecBarBeamSimpleMain
 * children back into the parent element's flat v2.0.2 attribute format.
 * @param {object} barArrangement - StbSecBarArrangementBeam_RC/SRC element
 */
function reverseBeamBarArrangement(barArrangement) {
  if (!barArrangement) return;

  // After type2 rename, target element is _RC_Same or _SRC_Same (or _SSRC_Same for fallback)
  const RENAMED_TYPES = [
    'StbSecBarBeam_RC_Same',
    'StbSecBarBeam_SRC_Same',
    'StbSecBarBeam_SSRC_Same',
    'StbSecBarBeam_RC_ThreeTypes',
    'StbSecBarBeam_SRC_ThreeTypes',
  ];

  for (const targetName of RENAMED_TYPES) {
    const elements = barArrangement[targetName];
    if (!elements || elements.length === 0) continue;

    elements.forEach((el) => {
      const elAttrs = el['$'] || {};
      const mains = el['StbSecBarBeamSimpleMain'] || [];
      if (mains.length === 0) return; // already flat, nothing to do

      // Collect stirrup/cover attrs already on element
      const v202Attrs = { ...elAttrs };

      // Extract main bar attrs from SimpleMain children
      const topMain = mains.find((m) => m['$']?.pos === 'TOP');
      const bottomMain = mains.find((m) => m['$']?.pos === 'BOTTOM') || mains[0];

      if (topMain?.['$']) {
        const ma = topMain['$'];
        if (ma.D) v202Attrs.D_main = ma.D;
        if (ma.N) v202Attrs.N_main_top_1st = ma.N;
        if (ma.strength) v202Attrs.strength_main = ma.strength;
      }
      if (bottomMain?.['$']) {
        const ma = bottomMain['$'];
        if (ma.D && !v202Attrs.D_main) v202Attrs.D_main = ma.D;
        if (ma.N) v202Attrs.N_main_bottom_1st = ma.N;
      }

      // Remove SimpleMain children and update attrs
      delete el['StbSecBarBeamSimpleMain'];
      el['$'] = v202Attrs;
    });
  }

  // Remove order attr (not in v2.0.2)
  if (barArrangement['$']?.order) delete barArrangement['$'].order;
}

/**
 * Convert bar arrangement structure from v2.1.0 back to v2.0.2
 * @param {object} stbRoot - ST-Bridge root element
 */
export function convertBarArrangementTo202(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let colCount = 0,
    beamCount = 0;

  // RC Columns
  (sections['StbSecColumn_RC'] || []).forEach((section) => {
    const ba = section['StbSecBarArrangementColumn_RC']?.[0];
    if (!ba) return;
    const hasCircle = ba['StbSecBarColumnCircleSame'] || ba['StbSecBarColumnCircleNotSame'];
    reverseColumnBarArrangement(ba, !!hasCircle);
    colCount++;
  });

  // SRC Columns
  (sections['StbSecColumn_SRC'] || []).forEach((section) => {
    const ba = section['StbSecBarArrangementColumn_SRC']?.[0];
    if (!ba) return;
    const hasCircle = ba['StbSecBarColumnCircleSame'] || ba['StbSecBarColumnCircleNotSame'];
    reverseColumnBarArrangement(ba, !!hasCircle);
    colCount++;
  });

  // RC Beams
  (sections['StbSecBeam_RC'] || []).forEach((section) => {
    (section['StbSecBarArrangementBeam_RC'] || []).forEach((ba) => {
      reverseBeamBarArrangement(ba);
      beamCount++;
    });
  });

  // SRC Beams
  (sections['StbSecBeam_SRC'] || []).forEach((section) => {
    (section['StbSecBarArrangementBeam_SRC'] || []).forEach((ba) => {
      reverseBeamBarArrangement(ba);
      beamCount++;
    });
  });

  if (colCount > 0 || beamCount > 0) {
    logger.info(`Bar arrangement reverse conversion: ${colCount} columns, ${beamCount} beams`);
  }
}

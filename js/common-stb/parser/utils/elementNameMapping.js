/**
 * Element Name Mapping for STB 2.0.2 and 2.1.0
 * Provides mapping between different element names across versions
 */

/**
 * Element name variants: Maps canonical (v210) names to all known variants
 * Key: Canonical name (v210 format)
 * Value: Array of all known variants [v202, v210, ...]
 */
const ELEMENT_NAME_VARIANTS = {
  // RC Column Sections
  StbSecColumnRect: ['StbSecColumn_RC_Rect', 'StbSecColumnRect'],
  StbSecColumnCircle: ['StbSecColumn_RC_Circle', 'StbSecColumnCircle'],

  // RC Beam Sections
  StbSecBeamStraight: ['StbSecBeam_RC_Straight', 'StbSecBeamStraight'],
  StbSecBeamHaunch: ['StbSecBeam_RC_Haunch', 'StbSecBeamHaunch'],
  StbSecBeamTaper: ['StbSecBeam_RC_Taper', 'StbSecBeamTaper'],

  // S Beam Sections (child elements within figure structure)
  StbSecSteelBeamStraight: ['StbSecSteelBeam_S_Straight', 'StbSecSteelBeamStraight'],
  StbSecSteelBeamTaper: ['StbSecSteelBeam_S_Taper', 'StbSecSteelBeamTaper'],
  StbSecSteelBeamJoint: ['StbSecSteelBeam_S_Joint', 'StbSecSteelBeamJoint'],

  // S Column Sections (child elements within figure structure)
  StbSecSteelColumnSame: ['StbSecSteelColumn_S_Same', 'StbSecSteelColumnSame'],
  StbSecSteelColumnNotSame: ['StbSecSteelColumn_S_NotSame', 'StbSecSteelColumnNotSame'],
};

/**
 * Mapping from v202 element names to v210 names
 */
const V202_TO_V210_MAP = {
  // RC Column Sections
  StbSecColumn_RC_Rect: 'StbSecColumnRect',
  StbSecColumn_RC_Circle: 'StbSecColumnCircle',

  // RC Beam Sections
  StbSecBeam_RC_Straight: 'StbSecBeamStraight',
  StbSecBeam_RC_Haunch: 'StbSecBeamHaunch',
  StbSecBeam_RC_Taper: 'StbSecBeamTaper',

  // S Beam Sections
  StbSecSteelBeam_S_Straight: 'StbSecSteelBeamStraight',
  StbSecSteelBeam_S_Taper: 'StbSecSteelBeamTaper',
  StbSecSteelBeam_S_Joint: 'StbSecSteelBeamJoint',

  // S Column Sections
  StbSecSteelColumn_S_Same: 'StbSecSteelColumnSame',
  StbSecSteelColumn_S_NotSame: 'StbSecSteelColumnNotSame',
};

/**
 * Mapping from v210 element names to v202 names
 */
const V210_TO_V202_MAP = Object.fromEntries(
  Object.entries(V202_TO_V210_MAP).map(([k, v]) => [v, k]),
);

/**
 * Normalize element name to canonical (v210) format
 * @param {string} name - Element name
 * @returns {string} Normalized name
 */
function normalizeElementName(name) {
  return V202_TO_V210_MAP[name] || name;
}

/**
 * Get all variant names for an element
 * @param {string} canonicalName - Canonical element name
 * @returns {string[]} Array of all variant names
 */
function getElementVariants(canonicalName) {
  return ELEMENT_NAME_VARIANTS[canonicalName] || [canonicalName];
}


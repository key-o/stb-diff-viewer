/**
 * Element Name Mapping for STB 2.0.2 and 2.1.0
 * Provides mapping between different element names across versions
 */

/**
 * Element name variants: Maps canonical (v210) names to all known variants
 * Key: Canonical name (v210 format)
 * Value: Array of all known variants [v202, v210, ...]
 */
export const ELEMENT_NAME_VARIANTS = {
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
export const V202_TO_V210_MAP = {
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
export const V210_TO_V202_MAP = Object.fromEntries(
  Object.entries(V202_TO_V210_MAP).map(([k, v]) => [v, k]),
);

/**
 * Normalize element name to canonical (v210) format
 * @param {string} name - Element name
 * @returns {string} Normalized name
 */
export function normalizeElementName(name) {
  return V202_TO_V210_MAP[name] || name;
}

/**
 * Get all variant names for an element
 * @param {string} canonicalName - Canonical element name
 * @returns {string[]} Array of all variant names
 */
export function getElementVariants(canonicalName) {
  return ELEMENT_NAME_VARIANTS[canonicalName] || [canonicalName];
}

/**
 * Check if two element names are semantically equivalent
 * @param {string} nameA - First element name
 * @param {string} nameB - Second element name
 * @returns {boolean} True if semantically equivalent
 */
export function areElementNamesEquivalent(nameA, nameB) {
  if (nameA === nameB) return true;

  const normalizedA = normalizeElementName(nameA);
  const normalizedB = normalizeElementName(nameB);

  return normalizedA === normalizedB;
}

/**
 * Find an element using any of its variant names
 * @param {Element} parent - Parent element to search in
 * @param {string} canonicalName - Canonical element name
 * @param {string} namespace - Optional namespace URI
 * @returns {Element|null} Found element or null
 */
export function findElementByVariants(parent, canonicalName, namespace = null) {
  if (!parent) return null;

  const variants = getElementVariants(canonicalName);

  for (const name of variants) {
    let element = null;

    // Try with namespace if provided
    if (namespace && typeof parent.getElementsByTagNameNS === 'function') {
      const elements = parent.getElementsByTagNameNS(namespace, name);
      if (elements.length > 0) {
        element = elements[0];
      }
    }

    // Try querySelector
    if (!element && typeof parent.querySelector === 'function') {
      try {
        element = parent.querySelector(name);
      } catch (e) {
        // querySelector may fail with certain names, continue
      }
    }

    // Try getElementsByTagName
    if (!element && typeof parent.getElementsByTagName === 'function') {
      const elements = parent.getElementsByTagName(name);
      if (elements.length > 0) {
        element = elements[0];
      }
    }

    // Try children iteration
    if (!element) {
      const children = parent.children || parent.childNodes || [];
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.tagName === name || child.localName === name) {
          element = child;
          break;
        }
      }
    }

    if (element) return element;
  }

  return null;
}

/**
 * Find all elements using any of their variant names
 * @param {Element} parent - Parent element to search in
 * @param {string} canonicalName - Canonical element name
 * @param {string} namespace - Optional namespace URI
 * @returns {Element[]} Array of found elements
 */
export function findAllElementsByVariants(parent, canonicalName, namespace = null) {
  if (!parent) return [];

  const variants = getElementVariants(canonicalName);
  const results = [];

  for (const name of variants) {
    // Try with namespace if provided
    if (namespace && typeof parent.getElementsByTagNameNS === 'function') {
      const elements = parent.getElementsByTagNameNS(namespace, name);
      for (let i = 0; i < elements.length; i++) {
        results.push(elements[i]);
      }
    }

    // Try getElementsByTagName
    if (typeof parent.getElementsByTagName === 'function') {
      const elements = parent.getElementsByTagName(name);
      for (let i = 0; i < elements.length; i++) {
        if (!results.includes(elements[i])) {
          results.push(elements[i]);
        }
      }
    }
  }

  return results;
}

/**
 * Get the v202 name for a given element name
 * @param {string} name - Element name
 * @returns {string} V202 equivalent name
 */
export function getV202Name(name) {
  return V210_TO_V202_MAP[name] || name;
}

/**
 * Get the v210 name for a given element name
 * @param {string} name - Element name
 * @returns {string} V210 equivalent name
 */
export function getV210Name(name) {
  return V202_TO_V210_MAP[name] || name;
}

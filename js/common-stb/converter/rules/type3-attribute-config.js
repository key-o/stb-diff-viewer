/**
 * Type3: Attribute Conversion Configuration
 * Defines attributes that are added/removed between STB v2.0.2 and v2.1.0
 */

/**
 * Configuration for attributes removed in v2.1.0 (i.e., present in v2.0.2 but not in v2.1.0)
 */
export const REMOVED_IN_210 = {
  // Member elements
  StbColumn: {
    path: ['StbModel', 'StbMembers', 'StbColumns', 'StbColumn'],
    attributes: [
      'condition_bottom',
      'condition_top',
      'joint_top',
      'joint_bottom',
      'kind_joint_top',
      'kind_joint_bottom',
      'joint_id_top',
      'joint_id_bottom',
    ],
  },

  StbPost: {
    path: ['StbModel', 'StbMembers', 'StbPosts', 'StbPost'],
    inherit: 'StbColumn', // Use same attributes as StbColumn
  },

  StbGirder: {
    path: ['StbModel', 'StbMembers', 'StbGirders', 'StbGirder'],
    attributes: [
      'condition_start',
      'condition_end',
      'kind_joint_start',
      'kind_joint_end',
      'joint_start',
      'joint_end',
      'joint_id_start',
      'joint_id_end',
      // Haunch attributes moved to StbCalGirder in v2.1.0
      'haunch_start',
      'haunch_end',
      'kind_haunch_start',
      'kind_haunch_end',
      'type_haunch_H',
      'type_haunch_V',
    ],
  },

  StbBeam: {
    path: ['StbModel', 'StbMembers', 'StbBeams', 'StbBeam'],
    inherit: 'StbGirder', // Use same attributes as StbGirder
  },

  StbBrace: {
    path: ['StbModel', 'StbMembers', 'StbBraces', 'StbBrace'],
    attributes: [
      'condition_start',
      'condition_end',
      // offset_* replaced by aim_offset_* in v2.1.0
      'offset_start_X',
      'offset_start_Y',
      'offset_start_Z',
      'offset_end_X',
      'offset_end_Y',
      'offset_end_Z',
    ],
  },

  StbSlab: {
    path: ['StbModel', 'StbMembers', 'StbSlabs', 'StbSlab'],
    attributes: ['level', 'offset'],
  },

  // Section elements
  StbSecSteelBeam_S_Straight: {
    path: [
      'StbModel',
      'StbSections',
      'StbSecBeam_S',
      'StbSecSteelBeam_S',
      'StbSecSteelBeam_S_Straight',
    ],
    attributes: [
      'joint_id_start',
      'joint_id_end',
      'strength_web',
      'strength_flange',
      'offset',
      'level',
      'center_top',
      'center_bottom',
    ],
  },

  StbSecSteelBeam_S_Taper: {
    path: [
      'StbModel',
      'StbSections',
      'StbSecBeam_S',
      'StbSecSteelBeam_S',
      'StbSecSteelBeam_S_Taper',
    ],
    inherit: 'StbSecSteelBeam_S_Straight',
  },

  StbSecSteelBeam_S_Joint: {
    path: [
      'StbModel',
      'StbSections',
      'StbSecBeam_S',
      'StbSecSteelBeam_S',
      'StbSecSteelBeam_S_Joint',
    ],
    inherit: 'StbSecSteelBeam_S_Straight',
  },

  StbSecSteelBeam_S_Haunch: {
    path: [
      'StbModel',
      'StbSections',
      'StbSecBeam_S',
      'StbSecSteelBeam_S',
      'StbSecSteelBeam_S_Haunch',
    ],
    inherit: 'StbSecSteelBeam_S_Straight',
  },

  StbSecSteelBeam_S_FiveTypes: {
    path: [
      'StbModel',
      'StbSections',
      'StbSecBeam_S',
      'StbSecSteelBeam_S',
      'StbSecSteelBeam_S_FiveTypes',
    ],
    inherit: 'StbSecSteelBeam_S_Straight',
  },

  // RC Section Figure elements
  StbSecColumnRect: {
    path: ['StbModel', 'StbSections', 'StbSecColumn_RC', 'StbSecColumnRect'],
    attributes: [
      'depth_cover_start_X',
      'depth_cover_end_X',
      'depth_cover_start_Y',
      'depth_cover_end_Y',
      'depth_cover_left',
      'depth_cover_right',
      'depth_cover_top',
      'depth_cover_bottom',
      'kind_corner',
      'interval',
      'isSpiral',
      'center_start_X',
      'center_end_X',
      'center_start_Y',
      'center_end_Y',
      'center_interval',
      'center_top',
      'center_bottom',
    ],
  },

  StbSecColumnCircle: {
    path: ['StbModel', 'StbSections', 'StbSecColumn_RC', 'StbSecColumnCircle'],
    inherit: 'StbSecColumnRect',
  },

  // Bar Arrangement Parent elements
  StbSecBarArrangementColumn_RC: {
    path: ['StbModel', 'StbSections', 'StbSecColumn_RC', 'StbSecBarArrangementColumn_RC'],
    attributes: [
      'depth_cover_start_X',
      'depth_cover_end_X',
      'depth_cover_start_Y',
      'depth_cover_end_Y',
      'depth_cover_left',
      'depth_cover_right',
      'depth_cover_top',
      'depth_cover_bottom',
      'interval',
      'kind_corner',
      'isSpiral',
      'center_start_X',
      'center_end_X',
      'center_start_Y',
      'center_end_Y',
      'center_interval',
      'center_top',
      'center_bottom',
    ],
  },

  StbSecBarArrangementBeam_RC: {
    path: ['StbModel', 'StbSections', 'StbSecBeam_RC', 'StbSecBarArrangementBeam_RC'],
    inherit: 'StbSecBarArrangementColumn_RC',
  },

  StbSecBarArrangementColumn_SRC: {
    path: ['StbModel', 'StbSections', 'StbSecColumn_SRC', 'StbSecBarArrangementColumn_SRC'],
    inherit: 'StbSecBarArrangementColumn_RC',
  },

  StbSecBarArrangementBeam_SRC: {
    path: ['StbModel', 'StbSections', 'StbSecBeam_SRC', 'StbSecBarArrangementBeam_SRC'],
    inherit: 'StbSecBarArrangementColumn_RC',
  },
};

/**
 * Configuration for attributes added in v2.1.0 (with default values for v2.0.2 conversion)
 */
export const ADDED_IN_210 = {
  StbStory: {
    path: ['StbModel', 'StbStories', 'StbStory'],
    defaults: {
      kind: 'GENERAL',
      // level_name is generated from height (special handling required)
    },
    specialHandling: ['level_name'], // These require custom logic
  },

  StbSlab: {
    path: ['StbModel', 'StbMembers', 'StbSlabs', 'StbSlab'],
    defaults: {
      kind_structure: 'RC',
      kind_slab: 'NORMAL',
      direction_load: '2WAY',
      isFoundation: 'false',
    },
  },
};

/**
 * Configuration for attributes to be restored when converting v2.1.0 → v2.0.2
 * (i.e., attributes removed in v2.1.0 that need default values when downgrading)
 */
export const RESTORED_IN_202 = {
  StbColumn: {
    path: ['StbModel', 'StbMembers', 'StbColumns', 'StbColumn'],
    defaults: {
      condition_bottom: 'PIN',
      condition_top: 'PIN',
    },
  },

  StbPost: {
    path: ['StbModel', 'StbMembers', 'StbPosts', 'StbPost'],
    inherit: 'StbColumn',
  },
};

/**
 * Elements that should NOT have guid attribute in v2.1.0
 * Based on STB 2.1.0 schema analysis
 */
export const GUID_NOT_ALLOWED_ELEMENTS = [
  'StbParallelAxes',
  'StbStory',
  // Section elements
  'StbSecColumn_S',
  'StbSecColumn_RC',
  'StbSecColumn_SRC',
  'StbSecColumn_CFT',
  'StbSecBeam_S',
  'StbSecBeam_RC',
  'StbSecBeam_SRC',
  'StbSecBrace_S',
  'StbSecSlab_RC',
  'StbSecWall_RC',
  'StbSecFoundation_RC',
  'StbSecPile_RC',
  'StbSecPile_S',
  'StbSecSteel',
];

/**
 * Resolve inherited attributes configuration
 * @param {object} config - Configuration object (REMOVED_IN_210, ADDED_IN_210, etc.)
 * @param {string} elementType - Element type name
 * @returns {Array<string>|null} Resolved attributes array or null
 */
export function resolveAttributes(config, elementType) {
  const elementConfig = config[elementType];
  if (!elementConfig) return null;

  if (elementConfig.inherit) {
    const parentConfig = config[elementConfig.inherit];
    return parentConfig?.attributes || null;
  }

  return elementConfig.attributes || null;
}

/**
 * Resolve default values configuration
 * @param {object} config - Configuration object (ADDED_IN_210, RESTORED_IN_202, etc.)
 * @param {string} elementType - Element type name
 * @returns {object|null} Resolved defaults object or null
 */
export function resolveDefaults(config, elementType) {
  const elementConfig = config[elementType];
  if (!elementConfig) return null;

  if (elementConfig.inherit) {
    const parentConfig = config[elementConfig.inherit];
    return parentConfig?.defaults || null;
  }

  return elementConfig.defaults || null;
}

/**
 * Type7: Joint Element Conversion
 *
 * v2.0.2 Structure (attributes on members):
 * <StbColumn id="1" joint_top="0" kind_joint_top="FIXED" joint_id_top="101" />
 * <StbGirder id="1" joint_start="0" kind_joint_start="RIGID" joint_id_start="201" />
 *
 * v2.1.0 Structure (separate elements):
 * <StbJointArrangements>
 *   <StbJointArrangement id="101" id_member="1" kind_member="COLUMN"
 *     id_section="10" starting_point="END" distance="0" />
 *   <StbJointArrangement id="201" id_member="1" kind_member="GIRDER"
 *     id_section="20" starting_point="START" distance="1200" />
 * </StbJointArrangements>
 */

import logger from '../utils/converter-logger.js';
import { getStbRoot } from '../utils/xml-helper.js';

/**
 * Convert Joint information from v2.0.2 attributes to v2.1.0 StbJointArrangements
 * @param {object} stbRoot - ST-Bridge root element
 */
export function convertJointsTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  const rootData = Array.isArray(root) ? root[0] : root;
  const model = rootData?.['StbModel']?.[0];
  if (!model) {
    logger.debug('convertJointsTo210: No model found');
    return;
  }

  const members = model['StbMembers']?.[0];
  if (!members) {
    logger.debug('convertJointsTo210: No members found');
    return;
  }

  const jointArrangements = [];
  const usedJointIds = new Set();
  let nextJointId = 1;

  const updateNextJointId = (id) => {
    if (id === undefined || id === null || id === '') return;
    const n = Number(id);
    if (Number.isInteger(n) && n >= nextJointId) {
      nextJointId = n + 1;
    }
  };

  const reserveMemberJointIds = (memberList, idAttrs) => {
    if (!Array.isArray(memberList)) return;
    memberList.forEach((member) => {
      const attrs = member?.['$'];
      if (!attrs) return;
      idAttrs.forEach((idAttr) => updateNextJointId(attrs[idAttr]));
    });
  };

  reserveMemberJointIds(members['StbColumns']?.[0]?.['StbColumn'], [
    'joint_id_top',
    'joint_id_bottom',
  ]);
  reserveMemberJointIds(members['StbPosts']?.[0]?.['StbPost'], ['joint_id_top', 'joint_id_bottom']);
  reserveMemberJointIds(members['StbGirders']?.[0]?.['StbGirder'], [
    'joint_id_start',
    'joint_id_end',
  ]);
  reserveMemberJointIds(members['StbBeams']?.[0]?.['StbBeam'], ['joint_id_start', 'joint_id_end']);
  reserveMemberJointIds(members['StbBraces']?.[0]?.['StbBrace'], [
    'joint_id_start',
    'joint_id_end',
  ]);

  const generateJointId = () => {
    while (usedJointIds.has(String(nextJointId))) {
      nextJointId++;
    }
    const id = String(nextJointId);
    usedJointIds.add(id);
    nextJointId++;
    return id;
  };

  // Helper to create joint arrangement from attributes
  const createJointArrangement = (memberId, kindMember, attrs, endpoint) => {
    const { jointAttr, kindAttr, idAttr, startingPoint } = endpoint;
    if (attrs[jointAttr] === undefined) {
      return;
    }

    const idSection = attrs.id_section;
    if (!idSection) {
      logger.warn(
        `Joint conversion skipped: ${kindMember}:${memberId} is missing id_section (${jointAttr}=${attrs[jointAttr]})`,
      );
      delete attrs[jointAttr];
      delete attrs[kindAttr];
      delete attrs[idAttr];
      return;
    }

    const requestedId = attrs[idAttr] ? String(attrs[idAttr]) : null;
    let jointId = requestedId;
    if (!jointId || usedJointIds.has(jointId)) {
      if (jointId && usedJointIds.has(jointId)) {
        logger.warn(
          `Duplicate joint id "${jointId}" detected in ${kindMember}:${memberId}. Reassigned to unique id.`,
        );
      }
      jointId = generateJointId();
    } else {
      usedJointIds.add(jointId);
    }
    jointArrangements.push({
      $: {
        id: String(jointId),
        id_member: memberId,
        kind_member: kindMember,
        id_section: idSection,
        starting_point: startingPoint,
        distance: attrs[jointAttr],
      },
    });

    // Remove legacy attributes from member
    delete attrs[jointAttr];
    delete attrs[kindAttr];
    delete attrs[idAttr];
  };

  // Process Columns
  const columns = members['StbColumns']?.[0]?.['StbColumn'] || [];
  columns.forEach((column) => {
    const attrs = column['$'];
    if (!attrs) return;

    createJointArrangement(attrs.id, 'COLUMN', attrs, {
      jointAttr: 'joint_top',
      kindAttr: 'kind_joint_top',
      idAttr: 'joint_id_top',
      startingPoint: 'END',
    });
    createJointArrangement(attrs.id, 'COLUMN', attrs, {
      jointAttr: 'joint_bottom',
      kindAttr: 'kind_joint_bottom',
      idAttr: 'joint_id_bottom',
      startingPoint: 'START',
    });
  });

  // Process Posts
  const posts = members['StbPosts']?.[0]?.['StbPost'] || [];
  posts.forEach((post) => {
    const attrs = post['$'];
    if (!attrs) return;

    createJointArrangement(attrs.id, 'POST', attrs, {
      jointAttr: 'joint_top',
      kindAttr: 'kind_joint_top',
      idAttr: 'joint_id_top',
      startingPoint: 'END',
    });
    createJointArrangement(attrs.id, 'POST', attrs, {
      jointAttr: 'joint_bottom',
      kindAttr: 'kind_joint_bottom',
      idAttr: 'joint_id_bottom',
      startingPoint: 'START',
    });
  });

  // Process Girders
  const girders = members['StbGirders']?.[0]?.['StbGirder'] || [];
  girders.forEach((girder) => {
    const attrs = girder['$'];
    if (!attrs) return;

    createJointArrangement(attrs.id, 'GIRDER', attrs, {
      jointAttr: 'joint_start',
      kindAttr: 'kind_joint_start',
      idAttr: 'joint_id_start',
      startingPoint: 'START',
    });
    createJointArrangement(attrs.id, 'GIRDER', attrs, {
      jointAttr: 'joint_end',
      kindAttr: 'kind_joint_end',
      idAttr: 'joint_id_end',
      startingPoint: 'END',
    });
  });

  // Process Beams
  const beams = members['StbBeams']?.[0]?.['StbBeam'] || [];
  beams.forEach((beam) => {
    const attrs = beam['$'];
    if (!attrs) return;

    createJointArrangement(attrs.id, 'BEAM', attrs, {
      jointAttr: 'joint_start',
      kindAttr: 'kind_joint_start',
      idAttr: 'joint_id_start',
      startingPoint: 'START',
    });
    createJointArrangement(attrs.id, 'BEAM', attrs, {
      jointAttr: 'joint_end',
      kindAttr: 'kind_joint_end',
      idAttr: 'joint_id_end',
      startingPoint: 'END',
    });
  });

  // Process Braces
  const braces = members['StbBraces']?.[0]?.['StbBrace'] || [];
  braces.forEach((brace) => {
    const attrs = brace['$'];
    if (!attrs) return;

    createJointArrangement(attrs.id, 'BRACE', attrs, {
      jointAttr: 'joint_start',
      kindAttr: 'kind_joint_start',
      idAttr: 'joint_id_start',
      startingPoint: 'START',
    });
    createJointArrangement(attrs.id, 'BRACE', attrs, {
      jointAttr: 'joint_end',
      kindAttr: 'kind_joint_end',
      idAttr: 'joint_id_end',
      startingPoint: 'END',
    });
  });

  // Add StbJointArrangements to StbMembers
  logger.debug(`convertJointsTo210: Found ${jointArrangements.length} joint arrangements`);
  if (jointArrangements.length > 0) {
    members['StbJointArrangements'] = [
      {
        StbJointArrangement: jointArrangements,
      },
    ];
    logger.info(`Joint elements: Converted ${jointArrangements.length} joints to v2.1.0 format`);
  } else {
    logger.debug('convertJointsTo210: No joints found in any members');
  }
}

/**
 * Convert Joint elements from v2.1.0 StbJointArrangements back to v2.0.2 attributes
 * @param {object} stbRoot - ST-Bridge root element
 */
export function convertJointsTo202(stbRoot) {
  const root = getStbRoot(stbRoot);
  const rootData = Array.isArray(root) ? root[0] : root;
  const model = rootData?.['StbModel']?.[0];
  if (!model) return;

  const members = model['StbMembers']?.[0];
  if (!members) return;

  // Get StbJointArrangements
  const arrangements = members['StbJointArrangements']?.[0]?.['StbJointArrangement'] || [];
  if (arrangements.length === 0) {
    logger.debug('No StbJointArrangements found, skipping Joint conversion');
    return;
  }

  // Build member map
  const memberMap = new Map();

  const addToMap = (memberList, kind) => {
    if (!memberList) return;
    memberList.forEach((member) => {
      if (!member['$']) return;
      const key = `${kind}:${member['$'].id}`;
      memberMap.set(key, member['$']);
    });
  };

  addToMap(members['StbColumns']?.[0]?.['StbColumn'], 'COLUMN');
  addToMap(members['StbPosts']?.[0]?.['StbPost'], 'POST');
  addToMap(members['StbGirders']?.[0]?.['StbGirder'], 'GIRDER');
  addToMap(members['StbBeams']?.[0]?.['StbBeam'], 'BEAM');
  addToMap(members['StbBraces']?.[0]?.['StbBrace'], 'BRACE');

  // Apply joint information to members
  let convertedCount = 0;
  arrangements.forEach((arr) => {
    const attrs = arr['$'];
    if (!attrs) return;

    const key = `${attrs.kind_member}:${attrs.id_member}`;
    const memberAttrs = memberMap.get(key);
    if (!memberAttrs) {
      logger.warn(
        `StbJointArrangement ${attrs.id}: Member ${attrs.kind_member}:${attrs.id_member} not found`,
      );
      return;
    }

    // 2.1.0 uses starting_point + distance, v2.0.2 uses joint_* attributes.
    const endpoint = attrs.starting_point || attrs.pos;
    const isColumnLike = attrs.kind_member === 'COLUMN' || attrs.kind_member === 'POST';
    let attrNames;
    if (isColumnLike) {
      attrNames =
        endpoint === 'END'
          ? { joint: 'joint_top', kind: 'kind_joint_top', id: 'joint_id_top' }
          : endpoint === 'START'
            ? { joint: 'joint_bottom', kind: 'kind_joint_bottom', id: 'joint_id_bottom' }
            : null;
    } else {
      attrNames =
        endpoint === 'START'
          ? { joint: 'joint_start', kind: 'kind_joint_start', id: 'joint_id_start' }
          : endpoint === 'END'
            ? { joint: 'joint_end', kind: 'kind_joint_end', id: 'joint_id_end' }
            : null;
    }

    if (!attrNames) {
      logger.warn(`StbJointArrangement ${attrs.id}: Unknown starting_point "${endpoint}"`);
      return;
    }

    // Set attributes on member
    if (attrs.distance !== undefined) {
      memberAttrs[attrNames.joint] = attrs.distance;
    } else if (attrs.joint !== undefined) {
      // Backward compatibility for older 2.1.0-like data used by earlier converter versions
      memberAttrs[attrNames.joint] = attrs.joint;
    }
    if (attrs.kind_joint !== undefined) {
      memberAttrs[attrNames.kind] = attrs.kind_joint;
    }
    memberAttrs[attrNames.id] = attrs.id;
    convertedCount++;
  });

  // Remove StbJointArrangements
  delete members['StbJointArrangements'];

  if (convertedCount > 0) {
    logger.info(`Joint elements: Converted ${convertedCount} joints to v2.0.2 format`);
  }
}

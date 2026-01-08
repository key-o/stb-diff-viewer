/**
 * Type7: Joint Element Conversion
 *
 * v2.0.2 Structure (attributes on members):
 * <StbColumn id="1" joint_top="0" kind_joint_top="FIXED" joint_id_top="101" />
 * <StbGirder id="1" joint_start="0" kind_joint_start="RIGID" joint_id_start="201" />
 *
 * v2.1.0 Structure (separate elements):
 * <StbJointArrangements>
 *   <StbJointArrangement id="101" id_member="1" kind_member="COLUMN" pos="TOP" kind_joint="FIXED" />
 *   <StbJointArrangement id="201" id_member="1" kind_member="GIRDER" pos="START" kind_joint="RIGID" />
 * </StbJointArrangements>
 */

import logger from '../utils/logger.js';
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
  let nextJointId = 1;

  // Helper to create joint arrangement from attributes
  const createJointArrangement = (
    memberId,
    kindMember,
    pos,
    attrs,
    jointAttr,
    kindAttr,
    idAttr,
  ) => {
    if (attrs[jointAttr] !== undefined) {
      const jointId = attrs[idAttr] || String(nextJointId++);
      jointArrangements.push({
        $: {
          id: jointId,
          id_member: memberId,
          kind_member: kindMember,
          pos: pos,
          ...(attrs[kindAttr] && { kind_joint: attrs[kindAttr] }),
          joint: attrs[jointAttr],
        },
      });

      // Remove attributes from member
      delete attrs[jointAttr];
      delete attrs[kindAttr];
      delete attrs[idAttr];
    }
  };

  // Process Columns
  const columns = members['StbColumns']?.[0]?.['StbColumn'] || [];
  columns.forEach((column) => {
    const attrs = column['$'];
    if (!attrs) return;

    createJointArrangement(
      attrs.id,
      'COLUMN',
      'TOP',
      attrs,
      'joint_top',
      'kind_joint_top',
      'joint_id_top',
    );
    createJointArrangement(
      attrs.id,
      'COLUMN',
      'BOTTOM',
      attrs,
      'joint_bottom',
      'kind_joint_bottom',
      'joint_id_bottom',
    );
  });

  // Process Posts
  const posts = members['StbPosts']?.[0]?.['StbPost'] || [];
  posts.forEach((post) => {
    const attrs = post['$'];
    if (!attrs) return;

    createJointArrangement(
      attrs.id,
      'POST',
      'TOP',
      attrs,
      'joint_top',
      'kind_joint_top',
      'joint_id_top',
    );
    createJointArrangement(
      attrs.id,
      'POST',
      'BOTTOM',
      attrs,
      'joint_bottom',
      'kind_joint_bottom',
      'joint_id_bottom',
    );
  });

  // Process Girders
  const girders = members['StbGirders']?.[0]?.['StbGirder'] || [];
  girders.forEach((girder) => {
    const attrs = girder['$'];
    if (!attrs) return;

    createJointArrangement(
      attrs.id,
      'GIRDER',
      'START',
      attrs,
      'joint_start',
      'kind_joint_start',
      'joint_id_start',
    );
    createJointArrangement(
      attrs.id,
      'GIRDER',
      'END',
      attrs,
      'joint_end',
      'kind_joint_end',
      'joint_id_end',
    );
  });

  // Process Beams
  const beams = members['StbBeams']?.[0]?.['StbBeam'] || [];
  beams.forEach((beam) => {
    const attrs = beam['$'];
    if (!attrs) return;

    createJointArrangement(
      attrs.id,
      'BEAM',
      'START',
      attrs,
      'joint_start',
      'kind_joint_start',
      'joint_id_start',
    );
    createJointArrangement(
      attrs.id,
      'BEAM',
      'END',
      attrs,
      'joint_end',
      'kind_joint_end',
      'joint_id_end',
    );
  });

  // Process Braces
  const braces = members['StbBraces']?.[0]?.['StbBrace'] || [];
  braces.forEach((brace) => {
    const attrs = brace['$'];
    if (!attrs) return;

    createJointArrangement(
      attrs.id,
      'BRACE',
      'START',
      attrs,
      'joint_start',
      'kind_joint_start',
      'joint_id_start',
    );
    createJointArrangement(
      attrs.id,
      'BRACE',
      'END',
      attrs,
      'joint_end',
      'kind_joint_end',
      'joint_id_end',
    );
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

    // Map pos to attribute names
    const posMap = {
      TOP: { joint: 'joint_top', kind: 'kind_joint_top', id: 'joint_id_top' },
      BOTTOM: { joint: 'joint_bottom', kind: 'kind_joint_bottom', id: 'joint_id_bottom' },
      START: { joint: 'joint_start', kind: 'kind_joint_start', id: 'joint_id_start' },
      END: { joint: 'joint_end', kind: 'kind_joint_end', id: 'joint_id_end' },
    };

    const attrNames = posMap[attrs.pos];
    if (!attrNames) {
      logger.warn(`StbJointArrangement ${attrs.id}: Unknown pos "${attrs.pos}"`);
      return;
    }

    // Set attributes on member
    if (attrs.joint !== undefined) {
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

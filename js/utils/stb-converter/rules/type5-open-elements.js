/**
 * Type5: Element Relocation - Open Elements
 *
 * v2.0.2 Structure:
 * <StbModel>
 *   <StbMembers>
 *     <StbWalls>
 *       <StbWall id="1">
 *         <StbOpenIdList>
 *           <StbOpenId id="101"/>
 *         </StbOpenIdList>
 *       </StbWall>
 *     </StbWalls>
 *   </StbMembers>
 *   <StbOpens>
 *     <StbOpen id="101" name="W-OP1" id_section="84" offset_X="500" offset_Y="300"/>
 *   </StbOpens>
 * </StbModel>
 *
 * v2.1.0 Structure:
 * <StbModel>
 *   <StbMembers>
 *     <StbWalls>
 *       <StbWall id="1"/>
 *     </StbWalls>
 *     <StbOpenArrangements>
 *       <StbOpenArrangement id="101" id_member="1" kind_member="WALL"
 *                           id_section="84" position_X="500" position_Y="300" rotate="0" name="W-OP1"/>
 *     </StbOpenArrangements>
 *   </StbMembers>
 * </StbModel>
 */

import logger from '../utils/logger.js';
import { getStbRoot } from '../utils/xml-helper.js';

/**
 * Convert Open elements from v2.0.2 to v2.1.0
 * @param {object} stbRoot - ST-Bridge root element
 */
export function convertOpensTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  const rootData = Array.isArray(root) ? root[0] : root;
  const model = rootData?.['StbModel']?.[0];
  if (!model) return;

  const members = model['StbMembers']?.[0];
  if (!members) return;

  // Get StbOpens and build lookup map
  // StbOpens can be under StbMembers (v2.0.2) or directly under StbModel
  const opensFromMembers = members['StbOpens']?.[0]?.['StbOpen'] || [];
  const opensFromModel = model['StbOpens']?.[0]?.['StbOpen'] || [];
  const opens = opensFromMembers.length > 0 ? opensFromMembers : opensFromModel;
  if (opens.length === 0) {
    logger.debug('No StbOpens found, skipping Open conversion');
    return;
  }

  const openMap = new Map();
  // Map to collect length_X/length_Y from StbOpen for each StbSecOpen_RC section
  const sectionLengthMap = new Map(); // id_section -> {length_X, length_Y}

  opens.forEach((open) => {
    const id = open['$']?.id;
    if (id) {
      openMap.set(id, open);
    }
    // Collect length info for StbSecOpen_RC update
    const attrs = open['$'] || {};
    if (attrs.id_section && (attrs.length_X || attrs.length_Y)) {
      sectionLengthMap.set(attrs.id_section, {
        length_X: attrs.length_X,
        length_Y: attrs.length_Y,
      });
    }
  });

  const openArrangements = [];

  // Process Walls
  const walls = members['StbWalls']?.[0]?.['StbWall'] || [];
  walls.forEach((wall) => {
    const openIdList = wall['StbOpenIdList']?.[0];
    if (!openIdList) return;

    const openIds = openIdList['StbOpenId'] || [];
    openIds.forEach((openIdRef) => {
      const openId = openIdRef['$']?.id;
      const open = openMap.get(openId);

      if (open) {
        const openAttrs = open['$'] || {};
        const positionX = openAttrs.position_X ?? openAttrs.offset_X ?? '0';
        const positionY = openAttrs.position_Y ?? openAttrs.offset_Y ?? '0';
        const rotate = openAttrs.rotate ?? '0';
        openArrangements.push({
          $: {
            id: openId,
            id_member: wall['$']?.id,
            kind_member: 'WALL',
            name: openAttrs.name,
            id_section: openAttrs.id_section,
            position_X: positionX,
            position_Y: positionY,
            rotate,
          },
        });
      }
    });

    // Remove StbOpenIdList from wall
    delete wall['StbOpenIdList'];
  });

  // Process Slabs
  const slabs = members['StbSlabs']?.[0]?.['StbSlab'] || [];
  slabs.forEach((slab) => {
    const openIdList = slab['StbOpenIdList']?.[0];
    if (!openIdList) return;

    const openIds = openIdList['StbOpenId'] || [];
    openIds.forEach((openIdRef) => {
      const openId = openIdRef['$']?.id;
      const open = openMap.get(openId);

      if (open) {
        const openAttrs = open['$'] || {};
        const positionX = openAttrs.position_X ?? openAttrs.offset_X ?? '0';
        const positionY = openAttrs.position_Y ?? openAttrs.offset_Y ?? '0';
        const rotate = openAttrs.rotate ?? '0';
        openArrangements.push({
          $: {
            id: openId,
            id_member: slab['$']?.id,
            kind_member: 'SLAB',
            name: openAttrs.name,
            id_section: openAttrs.id_section,
            position_X: positionX,
            position_Y: positionY,
            rotate,
          },
        });
      }
    });

    // Remove StbOpenIdList from slab
    delete slab['StbOpenIdList'];
  });

  // Remove StbOpens from the location where it was found
  if (opensFromMembers.length > 0) {
    delete members['StbOpens'];
    logger.debug('Removed StbOpens from StbMembers');
  } else {
    delete model['StbOpens'];
    logger.debug('Removed StbOpens from StbModel');
  }

  // Update StbSecOpen_RC with length_X/length_Y from StbOpen (v2.1.0 requires these attributes)
  const sections = model['StbSections']?.[0];
  if (sections && sectionLengthMap.size > 0) {
    const openSections = sections['StbSecOpen_RC'] || [];
    openSections.forEach((section) => {
      const sectionId = section['$']?.id;
      if (sectionId && sectionLengthMap.has(sectionId)) {
        const lengths = sectionLengthMap.get(sectionId);
        if (lengths.length_X) {
          section['$'].length_X = lengths.length_X;
        }
        if (lengths.length_Y) {
          section['$'].length_Y = lengths.length_Y;
        }
        logger.debug(
          `Updated StbSecOpen_RC ${sectionId} with length_X=${lengths.length_X}, length_Y=${lengths.length_Y}`,
        );
      }
    });
    logger.info(
      `Open sections: Updated ${sectionLengthMap.size} StbSecOpen_RC elements with length attributes`,
    );
  }

  // Add StbOpenArrangements to StbMembers
  if (openArrangements.length > 0) {
    members['StbOpenArrangements'] = [
      {
        StbOpenArrangement: openArrangements,
      },
    ];
    logger.info(`Open elements: Converted ${openArrangements.length} openings to v2.1.0 format`);
  }
}

/**
 * Convert Open elements from v2.1.0 to v2.0.2
 * @param {object} stbRoot - ST-Bridge root element
 */
export function convertOpensTo202(stbRoot) {
  const root = getStbRoot(stbRoot);
  const rootData = Array.isArray(root) ? root[0] : root;
  const model = rootData?.['StbModel']?.[0];
  if (!model) return;

  const members = model['StbMembers']?.[0];
  if (!members) return;

  // Build section map for length_X/Y
  const openSectionMap = new Map();
  const sections = model['StbSections']?.[0];
  const openSections = sections?.['StbSecOpen_RC'] || [];
  openSections.forEach((section) => {
    const attrs = section['$'] || {};
    if (attrs.id) {
      openSectionMap.set(attrs.id, {
        length_X: attrs.length_X,
        length_Y: attrs.length_Y,
      });
    }
  });

  // Get StbOpenArrangements
  const arrangements = members['StbOpenArrangements']?.[0]?.['StbOpenArrangement'] || [];
  if (arrangements.length === 0) {
    logger.debug('No StbOpenArrangements found, skipping Open conversion');
    return;
  }

  const opens = [];
  const memberOpenMap = new Map(); // key: "kind:id" -> [openIds]

  arrangements.forEach((arr) => {
    const attrs = arr['$'];
    if (!attrs) return;

    const section = openSectionMap.get(attrs.id_section);
    const length_X = section?.length_X ?? '0';
    const length_Y = section?.length_Y ?? '0';
    if (!section) {
      logger.warn(
        `StbOpenArrangement ${attrs.id}: StbSecOpen_RC ${attrs.id_section} not found. length_X/Y set to 0.`,
      );
    }

    // Create StbOpen element
    opens.push({
      $: {
        id: attrs.id,
        name: attrs.name,
        id_section: attrs.id_section,
        position_X: attrs.position_X ?? '0',
        position_Y: attrs.position_Y ?? '0',
        length_X,
        length_Y,
        rotate: attrs.rotate ?? '0',
      },
    });

    // Build member -> openIds mapping
    const key = `${attrs.kind_member}:${attrs.id_member}`;
    if (!memberOpenMap.has(key)) {
      memberOpenMap.set(key, []);
    }
    memberOpenMap.get(key).push(attrs.id);
  });

  // Remove StbOpenArrangements
  delete members['StbOpenArrangements'];

  // Add StbOpens to model
  if (opens.length > 0) {
    model['StbOpens'] = [
      {
        StbOpen: opens,
      },
    ];
  }

  // Add StbOpenIdList to walls
  const walls = members['StbWalls']?.[0]?.['StbWall'] || [];
  walls.forEach((wall) => {
    const key = `WALL:${wall['$']?.id}`;
    const openIds = memberOpenMap.get(key);
    if (openIds && openIds.length > 0) {
      wall['StbOpenIdList'] = [
        {
          StbOpenId: openIds.map((id) => ({ $: { id } })),
        },
      ];
    }
  });

  // Add StbOpenIdList to slabs
  const slabs = members['StbSlabs']?.[0]?.['StbSlab'] || [];
  slabs.forEach((slab) => {
    const key = `SLAB:${slab['$']?.id}`;
    const openIds = memberOpenMap.get(key);
    if (openIds && openIds.length > 0) {
      slab['StbOpenIdList'] = [
        {
          StbOpenId: openIds.map((id) => ({ $: { id } })),
        },
      ];
    }
  });

  logger.info(`Open elements: Converted ${opens.length} openings to v2.0.2 format`);
}

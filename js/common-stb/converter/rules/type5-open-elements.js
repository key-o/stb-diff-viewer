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

import logger from '../utils/converter-logger.js';
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

  // v2.1.x requires id_section on StbOpenArrangement. v2.0.2 allowed StbOpen without
  // id_section (dimensions held directly on length_X/length_Y), so synthesize a
  // StbSecOpen_RC section per unique size and reference it.
  const sectionsContainer = model['StbSections']?.[0];
  let nextSectionId = 1;
  if (sectionsContainer) {
    Object.values(sectionsContainer).forEach((sectionList) => {
      if (!Array.isArray(sectionList)) return;
      sectionList.forEach((el) => {
        const idNum = parseInt(el?.['$']?.id, 10);
        if (!Number.isNaN(idNum) && idNum >= nextSectionId) nextSectionId = idNum + 1;
      });
    });
  }
  const synthSectionBySize = new Map();
  const resolveIdSection = (openId, openAttrs) => {
    if (openAttrs.id_section) return openAttrs.id_section;
    const { length_X: lengthX, length_Y: lengthY } = openAttrs;
    if (!(parseFloat(lengthX) > 0) || !(parseFloat(lengthY) > 0) || !sectionsContainer) {
      logger.warn(
        `StbOpen ${openId}: no id_section and no usable length_X/length_Y to synthesize a StbSecOpen_RC. Skipping.`,
      );
      return null;
    }
    const key = `${lengthX}x${lengthY}`;
    if (!synthSectionBySize.has(key)) {
      const id = String(nextSectionId++);
      if (!sectionsContainer['StbSecOpen_RC']) sectionsContainer['StbSecOpen_RC'] = [];
      sectionsContainer['StbSecOpen_RC'].push({
        $: { id, name: `OP_${key}`, length_X: lengthX, length_Y: lengthY },
      });
      synthSectionBySize.set(key, id);
      logger.info(`Synthesized StbSecOpen_RC ${id} (${key}) for openings without id_section`);
    }
    return synthSectionBySize.get(key);
  };

  const collectArrangements = (memberElements, kindMember) => {
    memberElements.forEach((member) => {
      const openIdList = member['StbOpenIdList']?.[0];
      if (!openIdList) return;

      const openIds = openIdList['StbOpenId'] || [];
      openIds.forEach((openIdRef) => {
        const openId = openIdRef['$']?.id;
        const open = openMap.get(openId);
        if (!open) return;

        const openAttrs = open['$'] || {};
        const idSection = resolveIdSection(openId, openAttrs);
        if (idSection === null) return;

        openArrangements.push({
          $: {
            id: openId,
            id_member: member['$']?.id,
            kind_member: kindMember,
            name: openAttrs.name,
            id_section: idSection,
            position_X: openAttrs.position_X ?? openAttrs.offset_X ?? '0',
            position_Y: openAttrs.position_Y ?? openAttrs.offset_Y ?? '0',
            rotate: openAttrs.rotate ?? '0',
          },
        });
      });

      delete member['StbOpenIdList'];
    });
  };

  collectArrangements(members['StbWalls']?.[0]?.['StbWall'] || [], 'WALL');
  collectArrangements(members['StbSlabs']?.[0]?.['StbSlab'] || [], 'SLAB');

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
    if (!section || (!section.length_X && !section.length_Y)) {
      logger.warn(
        `StbOpenArrangement ${attrs.id}: StbSecOpen_RC ${attrs.id_section} not found or missing length. Skipping (length_X/Y=0 violates schema minExclusive constraint).`,
      );
      return;
    }

    // Create StbOpen element
    const openAttrs = {
      id: attrs.id,
      name: attrs.name,
      id_section: attrs.id_section,
      position_X: attrs.position_X ?? '0',
      position_Y: attrs.position_Y ?? '0',
      rotate: attrs.rotate ?? '0',
    };
    if (section.length_X) openAttrs.length_X = section.length_X;
    if (section.length_Y) openAttrs.length_Y = section.length_Y;

    opens.push({ $: openAttrs });

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

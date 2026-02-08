/**
 * Type12: Column Base Plate Section Structure Changes
 *
 * Handles structural changes for column base plate sections between v2.0.2 and v2.1.0:
 *
 * StbSecBaseConventional_S -> StbSecBaseConventional (unified for S/SRC/CFT in v2.1.0)
 *
 * v2.0.2 structure:
 * <StbSecBaseConventional_S>
 *   <StbSecBaseConventional_S_Plate ... />
 *   <StbSecBaseConventional_S_AnchorBolt ... />
 *   <StbSecBaseConventional_S_RibPlate ... />
 * </StbSecBaseConventional_S>
 *
 * v2.1.0 structure:
 * <StbSecBaseConventional>
 *   <StbSecBaseConventionalPlate ... />
 *   <StbSecBaseConventionalAnchorBolts>
 *     <StbSecBaseConventionalAnchorBolt ... />
 *   </StbSecBaseConventionalAnchorBolts>
 *   <StbSecBaseConventionalRibPlates>
 *     <StbSecBaseConventionalRibPlate ... />
 *   </StbSecBaseConventionalRibPlates>
 * </StbSecBaseConventional>
 */

import logger from '../utils/converter-logger.js';
import { getStbRoot } from '../utils/xml-helper.js';

// Column base plate section types to convert (v2.0.2 -> v2.1.0)
const BASE_SECTION_TYPES = ['StbSecColumn_S', 'StbSecColumn_SRC', 'StbSecColumn_CFT'];

// v2.0.2 base conventional element names per section type
const V202_BASE_CONVENTIONAL_MAP = {
  StbSecColumn_S: 'StbSecBaseConventional_S',
  StbSecColumn_SRC: 'StbSecBaseConventional_SRC',
  StbSecColumn_CFT: 'StbSecBaseConventional_CFT',
};

/**
 * Convert a single base conventional element from v2.0.2 to v2.1.0 format
 * @param {object} v202Base - v2.0.2 StbSecBaseConventional_* element
 * @param {string} sectionType - Section type (S, SRC, CFT)
 * @returns {object} v2.1.0 StbSecBaseConventional element
 */
function convertBaseConventionalTo210(v202Base, sectionType) {
  const suffix =
    sectionType === 'StbSecColumn_S' ? '_S' : sectionType === 'StbSecColumn_SRC' ? '_SRC' : '_CFT';

  const result = {
    $: {},
  };

  // Convert Plate element
  const oldPlate = v202Base[`StbSecBaseConventional${suffix}_Plate`]?.[0];
  if (oldPlate) {
    result['StbSecBaseConventionalPlate'] = [
      {
        $: oldPlate['$'] || {},
      },
    ];
  }

  // Convert AnchorBolt element (single -> wrapped in plural container)
  const oldAnchorBolt = v202Base[`StbSecBaseConventional${suffix}_AnchorBolt`]?.[0];
  if (oldAnchorBolt) {
    result['StbSecBaseConventionalAnchorBolts'] = [
      {
        $: {},
        StbSecBaseConventionalAnchorBolt: [
          {
            $: oldAnchorBolt['$'] || {},
          },
        ],
      },
    ];
  }

  // Convert RibPlate element (single -> wrapped in plural container)
  const oldRibPlate = v202Base[`StbSecBaseConventional${suffix}_RibPlate`]?.[0];
  if (oldRibPlate) {
    result['StbSecBaseConventionalRibPlates'] = [
      {
        $: {},
        StbSecBaseConventionalRibPlate: [
          {
            $: oldRibPlate['$'] || {},
          },
        ],
      },
    ];
  }

  return result;
}

/**
 * Convert column base plate sections from v2.0.2 to v2.1.0
 * @param {object} stbRoot - ST-Bridge root element
 */
export function convertBasePlateSectionsTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let totalConverted = 0;

  BASE_SECTION_TYPES.forEach((sectionType) => {
    const columns = sections[sectionType] || [];
    const v202ElementName = V202_BASE_CONVENTIONAL_MAP[sectionType];

    columns.forEach((column) => {
      const columnId = column['$']?.id || 'unknown';
      const v202Base = column[v202ElementName]?.[0];

      if (!v202Base) return;

      // Convert to v2.1.0 format
      const v210Base = convertBaseConventionalTo210(v202Base, sectionType);

      // Remove old element
      delete column[v202ElementName];

      // Add new element
      column['StbSecBaseConventional'] = [v210Base];

      totalConverted++;
      logger.debug(`Converted base plate for ${sectionType} column ${columnId} to v2.1.0 format`);
    });
  });

  if (totalConverted > 0) {
    logger.info(`Converted ${totalConverted} StbSecBaseConventional_* elements to v2.1.0 format`);
  }
}

// ==================== v2.1.0 to v2.0.2 (Reverse Conversion) ====================

/**
 * Convert a single base conventional element from v2.1.0 to v2.0.2 format
 * @param {object} v210Base - v2.1.0 StbSecBaseConventional element
 * @param {string} sectionType - Section type (S, SRC, CFT)
 * @returns {object} v2.0.2 StbSecBaseConventional_* element
 */
function convertBaseConventionalTo202(v210Base, sectionType) {
  const suffix =
    sectionType === 'StbSecColumn_S' ? '_S' : sectionType === 'StbSecColumn_SRC' ? '_SRC' : '_CFT';

  const result = {
    $: {},
  };

  // Convert Plate element
  const newPlate = v210Base['StbSecBaseConventionalPlate']?.[0];
  if (newPlate) {
    result[`StbSecBaseConventional${suffix}_Plate`] = [
      {
        $: newPlate['$'] || {},
      },
    ];
  }

  // Convert AnchorBolt element (extract from wrapper)
  const anchorBoltsWrapper = v210Base['StbSecBaseConventionalAnchorBolts']?.[0];
  const firstAnchorBolt = anchorBoltsWrapper?.['StbSecBaseConventionalAnchorBolt']?.[0];
  if (firstAnchorBolt) {
    result[`StbSecBaseConventional${suffix}_AnchorBolt`] = [
      {
        $: firstAnchorBolt['$'] || {},
      },
    ];

    // Warn if there are multiple anchor bolts (v2.0.2 only supports one)
    const anchorBoltCount = anchorBoltsWrapper?.['StbSecBaseConventionalAnchorBolt']?.length || 0;
    if (anchorBoltCount > 1) {
      logger.warn(
        `Multiple anchor bolts (${anchorBoltCount}) found - only first will be kept in v2.0.2`,
      );
    }
  }

  // Convert RibPlate element (extract from wrapper)
  const ribPlatesWrapper = v210Base['StbSecBaseConventionalRibPlates']?.[0];
  const firstRibPlate = ribPlatesWrapper?.['StbSecBaseConventionalRibPlate']?.[0];
  if (firstRibPlate) {
    result[`StbSecBaseConventional${suffix}_RibPlate`] = [
      {
        $: firstRibPlate['$'] || {},
      },
    ];

    // Warn if there are multiple rib plates (v2.0.2 only supports one)
    const ribPlateCount = ribPlatesWrapper?.['StbSecBaseConventionalRibPlate']?.length || 0;
    if (ribPlateCount > 1) {
      logger.warn(
        `Multiple rib plates (${ribPlateCount}) found - only first will be kept in v2.0.2`,
      );
    }
  }

  return result;
}

/**
 * Convert column base plate sections from v2.1.0 to v2.0.2
 * @param {object} stbRoot - ST-Bridge root element
 */
export function convertBasePlateSectionsTo202(stbRoot) {
  const root = getStbRoot(stbRoot);
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let totalConverted = 0;

  BASE_SECTION_TYPES.forEach((sectionType) => {
    const columns = sections[sectionType] || [];
    const v202ElementName = V202_BASE_CONVENTIONAL_MAP[sectionType];

    columns.forEach((column) => {
      const columnId = column['$']?.id || 'unknown';
      const v210Base = column['StbSecBaseConventional']?.[0];

      if (!v210Base) return;

      // Convert to v2.0.2 format
      const v202Base = convertBaseConventionalTo202(v210Base, sectionType);

      // Remove v2.1.0 element
      delete column['StbSecBaseConventional'];

      // Add v2.0.2 element
      column[v202ElementName] = [v202Base];

      totalConverted++;
      logger.debug(`Converted base plate for ${sectionType} column ${columnId} to v2.0.2 format`);
    });
  });

  if (totalConverted > 0) {
    logger.info(`Converted ${totalConverted} StbSecBaseConventional elements to v2.0.2 format`);
  }
}

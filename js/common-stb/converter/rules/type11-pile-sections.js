/**
 * Type11: Pile Section Structure Changes
 *
 * Handles structural changes for pile sections between v2.0.2 and v2.1.0:
 *
 * 1. StbSecPile_RC: Add Conventional wrapper + rename child elements
 *    v2.0.2: StbSecFigurePile_RC > StbSecPile_RC_Straight
 *    v2.1.0: StbSecPile_RC_Conventional > StbSecFigurePile_RC_Conventional > StbSecPile_RC_ConventionalStraight
 *
 * 2. StbSecPile_S: Add Conventional wrapper
 *    v2.0.2: StbSecPile_S > StbSecPile_S_Straight
 *    v2.1.0: StbSecPile_S > StbSecPile_S_Conventional > StbSecPile_S_Straight
 *
 * 3. StbSecPileProduct -> StbSecPilePrecast: Rename + add wrapper
 *    v2.0.2: StbSecPileProduct > StbSecPileProduct_PHC
 *    v2.1.0: StbSecPilePrecast > StbSecPilePrecastConventional > StbSecPilePrecast_PHC
 */

import logger from '../utils/converter-logger.js';
import { getStbRoot } from '../utils/xml-helper.js';

// RC Pile figure element name mappings (v2.0.2 -> v2.1.0)
const RC_PILE_FIGURE_RENAME_MAP = {
  StbSecPile_RC_Straight: 'StbSecPile_RC_ConventionalStraight',
  StbSecPile_RC_ExtendedFoot: 'StbSecPile_RC_ConventionalExtendedFoot',
  StbSecPile_RC_ExtendedTop: 'StbSecPile_RC_ConventionalExtendedTop',
  StbSecPile_RC_ExtendedTopFoot: 'StbSecPile_RC_ConventionalExtendedTopFoot',
};

// Precast Pile element name mappings (v2.0.2 -> v2.1.0)
const PRECAST_PILE_RENAME_MAP = {
  StbSecPileProduct_PHC: 'StbSecPilePrecast_PHC',
  StbSecPileProduct_ST: 'StbSecPilePrecast_ST',
  StbSecPileProduct_SC: 'StbSecPilePrecast_SC',
  StbSecPileProduct_PRC: 'StbSecPilePrecast_PRC',
  StbSecPileProduct_CPRC: 'StbSecPilePrecast_CPRC',
  StbSecPileProductNodular_PHC: 'StbSecPilePrecastNodular_PHC',
  StbSecPileProductNodular_PRC: 'StbSecPilePrecastNodular_PRC',
  StbSecPileProductNodular_CPRC: 'StbSecPilePrecastNodular_CPRC',
};

/**
 * Convert RC pile sections from v2.0.2 to v2.1.0 structure
 * @param {object} stbRoot - ST-Bridge root element
 */
export function convertRcPileSectionsTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  const rcPiles = sections['StbSecPile_RC'] || [];
  let convertedCount = 0;

  rcPiles.forEach((pile) => {
    const pileId = pile['$']?.id || 'unknown';

    // Get existing v2.0.2 children
    const figureRC = pile['StbSecFigurePile_RC']?.[0];
    const barArrangement = pile['StbSecBarArrangementPile_RC']?.[0];

    if (!figureRC) return;

    // Convert figure element to v2.1.0 format
    const newFigure = { $: {} };

    // Rename child figure elements
    Object.entries(RC_PILE_FIGURE_RENAME_MAP).forEach(([oldName, newName]) => {
      if (figureRC[oldName]) {
        newFigure[newName] = figureRC[oldName];
      }
    });

    // Create the Conventional wrapper structure
    const conventional = {
      $: {},
      StbSecFigurePile_RC_Conventional: [newFigure],
    };

    // Convert bar arrangement if exists
    if (barArrangement) {
      conventional['StbSecBarArrangementPile_RC_Conventional'] = [barArrangement];
    }

    // Replace old structure with new
    delete pile['StbSecFigurePile_RC'];
    delete pile['StbSecBarArrangementPile_RC'];
    pile['StbSecPile_RC_Conventional'] = [conventional];

    convertedCount++;
    logger.debug(`Converted RC pile section ${pileId} to v2.1.0 format`);
  });

  if (convertedCount > 0) {
    logger.info(`Converted ${convertedCount} StbSecPile_RC elements to v2.1.0 format`);
  }
}

/**
 * Convert S pile sections from v2.0.2 to v2.1.0 structure
 * @param {object} stbRoot - ST-Bridge root element
 */
export function convertSPileSectionsTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  const sPiles = sections['StbSecPile_S'] || [];
  let convertedCount = 0;

  sPiles.forEach((pile) => {
    const pileId = pile['$']?.id || 'unknown';
    const pileAttrs = pile['$'] || {};

    // Check if already has v2.1.0 structure
    if (pile['StbSecPile_S_Conventional']) return;

    // Collect all v2.0.2 child elements
    const children = {};
    const childElementNames = [
      'StbSecPile_S_Straight',
      'StbSecPile_S_Rotational',
      'StbSecPile_S_Taper',
    ];

    childElementNames.forEach((name) => {
      if (pile[name]) {
        children[name] = pile[name];
        delete pile[name];
      }
    });

    // Create the Conventional wrapper structure
    const conventional = {
      $: {},
      ...children,
    };

    pile['StbSecPile_S_Conventional'] = [conventional];

    convertedCount++;
    logger.debug(`Converted S pile section ${pileId} to v2.1.0 format`);
  });

  if (convertedCount > 0) {
    logger.info(`Converted ${convertedCount} StbSecPile_S elements to v2.1.0 format`);
  }
}

/**
 * Convert precast pile sections from v2.0.2 to v2.1.0 structure
 * @param {object} stbRoot - ST-Bridge root element
 */
export function convertPrecastPileSectionsTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  // Rename StbSecPileProduct to StbSecPilePrecast
  const productPiles = sections['StbSecPileProduct'];
  if (!productPiles || productPiles.length === 0) return;

  let convertedCount = 0;

  const precastPiles = productPiles.map((pile) => {
    const pileId = pile['$']?.id || 'unknown';
    const pileAttrs = { ...pile['$'] };

    // Collect and rename v2.0.2 child elements
    const renamedChildren = {};

    Object.entries(PRECAST_PILE_RENAME_MAP).forEach(([oldName, newName]) => {
      if (pile[oldName]) {
        renamedChildren[newName] = pile[oldName];
      }
    });

    // Create the Conventional wrapper structure
    const conventional = {
      $: {},
      ...renamedChildren,
    };

    convertedCount++;
    logger.debug(`Converted precast pile section ${pileId} to v2.1.0 format`);

    return {
      $: pileAttrs,
      StbSecPilePrecastConventional: [conventional],
    };
  });

  // Replace StbSecPileProduct with StbSecPilePrecast
  delete sections['StbSecPileProduct'];
  sections['StbSecPilePrecast'] = precastPiles;

  if (convertedCount > 0) {
    logger.info(
      `Converted ${convertedCount} StbSecPileProduct elements to StbSecPilePrecast (v2.1.0 format)`,
    );
  }
}

/**
 * Convert all pile sections from v2.0.2 to v2.1.0
 * @param {object} stbRoot - ST-Bridge root element
 */
export function convertPileSectionsTo210(stbRoot) {
  convertRcPileSectionsTo210(stbRoot);
  convertSPileSectionsTo210(stbRoot);
  convertPrecastPileSectionsTo210(stbRoot);
  logger.debug('convertPileSectionsTo210 completed');
}

// ==================== v2.1.0 to v2.0.2 (Reverse Conversion) ====================

/**
 * Convert RC pile sections from v2.1.0 to v2.0.2 structure
 * @param {object} stbRoot - ST-Bridge root element
 */
export function convertRcPileSectionsTo202(stbRoot) {
  const root = getStbRoot(stbRoot);
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  const rcPiles = sections['StbSecPile_RC'] || [];
  let convertedCount = 0;

  rcPiles.forEach((pile) => {
    const pileId = pile['$']?.id || 'unknown';
    const conventional = pile['StbSecPile_RC_Conventional']?.[0];

    if (!conventional) return;

    const figureConv = conventional['StbSecFigurePile_RC_Conventional']?.[0];
    const barArrangementConv = conventional['StbSecBarArrangementPile_RC_Conventional']?.[0];

    if (!figureConv) return;

    // Convert figure element back to v2.0.2 format
    const newFigure = { $: {} };

    // Reverse rename child figure elements
    Object.entries(RC_PILE_FIGURE_RENAME_MAP).forEach(([oldName, newName]) => {
      if (figureConv[newName]) {
        newFigure[oldName] = figureConv[newName];
      }
    });

    // Remove v2.1.0 structure
    delete pile['StbSecPile_RC_Conventional'];
    delete pile['StbSecPile_RC_Certified']; // Remove certified (not in v2.0.2)

    // Add v2.0.2 structure
    pile['StbSecFigurePile_RC'] = [newFigure];

    if (barArrangementConv) {
      pile['StbSecBarArrangementPile_RC'] = [barArrangementConv];
    }

    convertedCount++;
    logger.debug(`Converted RC pile section ${pileId} to v2.0.2 format`);
  });

  if (convertedCount > 0) {
    logger.info(`Converted ${convertedCount} StbSecPile_RC elements to v2.0.2 format`);
  }
}

/**
 * Convert S pile sections from v2.1.0 to v2.0.2 structure
 * @param {object} stbRoot - ST-Bridge root element
 */
export function convertSPileSectionsTo202(stbRoot) {
  const root = getStbRoot(stbRoot);
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  const sPiles = sections['StbSecPile_S'] || [];
  let convertedCount = 0;

  sPiles.forEach((pile) => {
    const pileId = pile['$']?.id || 'unknown';
    const conventional = pile['StbSecPile_S_Conventional']?.[0];

    if (!conventional) return;

    // Extract child elements from Conventional wrapper
    const childElementNames = [
      'StbSecPile_S_Straight',
      'StbSecPile_S_Rotational',
      'StbSecPile_S_Taper',
    ];

    childElementNames.forEach((name) => {
      if (conventional[name]) {
        pile[name] = conventional[name];
      }
    });

    // Remove v2.1.0 structure
    delete pile['StbSecPile_S_Conventional'];
    delete pile['StbSecPile_S_Certified']; // Remove certified (not in v2.0.2)
    delete pile['StbSecPile_S_Joint']; // Remove joint (not in v2.0.2)
    delete pile['StbSecPile_S_Connection']; // Remove connection (not in v2.0.2)

    convertedCount++;
    logger.debug(`Converted S pile section ${pileId} to v2.0.2 format`);
  });

  if (convertedCount > 0) {
    logger.info(`Converted ${convertedCount} StbSecPile_S elements to v2.0.2 format`);
  }
}

/**
 * Convert precast pile sections from v2.1.0 to v2.0.2 structure
 * @param {object} stbRoot - ST-Bridge root element
 */
export function convertPrecastPileSectionsTo202(stbRoot) {
  const root = getStbRoot(stbRoot);
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  // Rename StbSecPilePrecast to StbSecPileProduct
  const precastPiles = sections['StbSecPilePrecast'];
  if (!precastPiles || precastPiles.length === 0) return;

  let convertedCount = 0;

  const productPiles = precastPiles.map((pile) => {
    const pileId = pile['$']?.id || 'unknown';
    const pileAttrs = { ...pile['$'] };
    const conventional = pile['StbSecPilePrecastConventional']?.[0];

    if (!conventional) {
      // Just rename if no conventional wrapper
      logger.warn(`StbSecPilePrecast ${pileId} has no Conventional wrapper - removing certified`);
      delete pile['StbSecPilePrecastCertified'];
      return pile;
    }

    // Collect and reverse rename v2.1.0 child elements
    const renamedChildren = {};

    Object.entries(PRECAST_PILE_RENAME_MAP).forEach(([oldName, newName]) => {
      if (conventional[newName]) {
        renamedChildren[oldName] = conventional[newName];
      }
    });

    convertedCount++;
    logger.debug(`Converted precast pile section ${pileId} to v2.0.2 format`);

    return {
      $: pileAttrs,
      ...renamedChildren,
    };
  });

  // Replace StbSecPilePrecast with StbSecPileProduct
  delete sections['StbSecPilePrecast'];
  sections['StbSecPileProduct'] = productPiles;

  if (convertedCount > 0) {
    logger.info(
      `Converted ${convertedCount} StbSecPilePrecast elements to StbSecPileProduct (v2.0.2 format)`,
    );
  }
}

/**
 * Convert all pile sections from v2.1.0 to v2.0.2
 * @param {object} stbRoot - ST-Bridge root element
 */
export function convertPileSectionsTo202(stbRoot) {
  convertRcPileSectionsTo202(stbRoot);
  convertSPileSectionsTo202(stbRoot);
  convertPrecastPileSectionsTo202(stbRoot);
  logger.debug('convertPileSectionsTo202 completed');
}

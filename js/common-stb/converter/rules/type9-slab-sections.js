/**
 * Type9: RC Slab Section Structure Changes
 * STB 2.0.2 -> 2.1.0: StbSecSlab_RC requires StbSecSlab_RC_Conventional wrapper
 *
 * STB 2.0.2:
 *   <StbSecSlab_RC id="1" name="S1" ...>
 *     <StbSecFigureSlab_RC_Conventional>  (renamed from StbSecFigureSlab_RC)
 *       <StbSecSlab_RC_Straight depth="150"/>
 *     </StbSecFigureSlab_RC_Conventional>
 *   </StbSecSlab_RC>
 *
 * STB 2.1.0:
 *   <StbSecSlab_RC id="1" name="S1" ...>
 *     <StbSecSlab_RC_Conventional>
 *       <StbSecFigureSlab_RC_Conventional>
 *         <StbSecSlab_RC_Straight depth="150"/>
 *       </StbSecFigureSlab_RC_Conventional>
 *     </StbSecSlab_RC_Conventional>
 *   </StbSecSlab_RC>
 */

import logger from '../utils/converter-logger.js';
import { getStbRoot, renameKey } from '../utils/xml-helper.js';

/**
 * Slab figure child element rename mapping
 */
const SLAB_FIGURE_RENAME_MAP = {
  StbSecSlab_RC_Straight: 'StbSecSlab_RC_ConventionalStraight',
  StbSecSlab_RC_Taper: 'StbSecSlab_RC_ConventionalTaper',
  StbSecSlab_RC_Haunch: 'StbSecSlab_RC_ConventionalHaunch',
};

/**
 * Rename slab figure child elements
 * @param {object} figureElement - StbSecFigureSlab_RC_Conventional element
 */
function renameSlabFigureChildren(figureElement) {
  if (!figureElement) return 0;
  let count = 0;
  for (const [oldName, newName] of Object.entries(SLAB_FIGURE_RENAME_MAP)) {
    if (figureElement[oldName]) {
      renameKey(figureElement, oldName, newName);
      count++;
    }
  }
  return count;
}

/**
 * Convert RC slab sections to v2.1.0 structure
 * Wrap StbSecFigureSlab_RC_Conventional in StbSecSlab_RC_Conventional
 * @param {object} stbRoot - ST-Bridge root element
 */
export function convertSlabSectionsTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  const slabRCElements = sections['StbSecSlab_RC'];
  if (!slabRCElements || !Array.isArray(slabRCElements)) return;

  let convertedCount = 0;

  slabRCElements.forEach((slabElement) => {
    // Check if StbSecFigureSlab_RC_Conventional is a direct child (needs wrapping)
    const figureElement = slabElement['StbSecFigureSlab_RC_Conventional'];
    if (figureElement && Array.isArray(figureElement) && figureElement.length > 0) {
      // Rename figure child elements first
      figureElement.forEach((fig) => renameSlabFigureChildren(fig));

      // Create new StbSecSlab_RC_Conventional wrapper
      const conventionalWrapper = {
        StbSecFigureSlab_RC_Conventional: figureElement,
      };

      // If there's bar arrangement, move it too
      const barArrangement = slabElement['StbSecBarArrangementSlab_RC'];
      if (barArrangement) {
        conventionalWrapper['StbSecBarArrangementSlab_RC_Conventional'] = barArrangement;
        delete slabElement['StbSecBarArrangementSlab_RC'];
      }

      // Remove the direct child
      delete slabElement['StbSecFigureSlab_RC_Conventional'];

      // Add the wrapped structure
      slabElement['StbSecSlab_RC_Conventional'] = [conventionalWrapper];
      convertedCount++;
    }

    // Also handle legacy naming (if not yet renamed)
    const legacyFigure = slabElement['StbSecFigureSlab_RC'];
    if (legacyFigure && Array.isArray(legacyFigure) && legacyFigure.length > 0) {
      // Rename figure child elements first
      legacyFigure.forEach((fig) => renameSlabFigureChildren(fig));

      // Create new StbSecSlab_RC_Conventional wrapper with renamed element
      const conventionalWrapper = {
        StbSecFigureSlab_RC_Conventional: legacyFigure,
      };

      // If there's bar arrangement, move it too
      const barArrangement = slabElement['StbSecBarArrangementSlab_RC'];
      if (barArrangement) {
        conventionalWrapper['StbSecBarArrangementSlab_RC_Conventional'] = barArrangement;
        delete slabElement['StbSecBarArrangementSlab_RC'];
      }

      // Remove the direct child
      delete slabElement['StbSecFigureSlab_RC'];

      // Add the wrapped structure
      slabElement['StbSecSlab_RC_Conventional'] = [conventionalWrapper];
      convertedCount++;
    }
  });

  if (convertedCount > 0) {
    logger.info(`RC Slab sections: Converted ${convertedCount} slabs to v2.1.0 format`);
  }

  convertSlabDeckSectionsTo210(sections);
}

/**
 * Convert deck slab sections to v2.1.x structure.
 *
 * STB 2.0.2:
 *   <StbSecSlabDeck id name product_type="FLAT|COMPOSITE">
 *     <StbSecFigureSlabDeck><StbSecSlabDeckStraight depth="..."/></StbSecFigureSlabDeck>
 *     <StbSecBarArrangementSlabDeck .../>
 *     <StbSecProductSlabDeck product_code="..." depth_deck="..."/>
 *   </StbSecSlabDeck>
 *
 * STB 2.1.x:
 *   <StbSecSlabDeck id name>
 *     <StbSecSlabDeckProduct product_code release_time top_concrete/>
 *   </StbSecSlabDeck>
 * @param {object} sections - StbSections element
 */
function convertSlabDeckSectionsTo210(sections) {
  const deckElements = sections['StbSecSlabDeck'];
  if (!deckElements || !Array.isArray(deckElements)) return;

  let count = 0;

  deckElements.forEach((deck) => {
    if (deck['StbSecSlabDeckProduct']) return; // already v2.1.x structure

    const productAttrs = deck['StbSecProductSlabDeck']?.[0]?.['$'] || {};
    const figureDepth =
      deck['StbSecFigureSlabDeck']?.[0]?.['StbSecSlabDeckStraight']?.[0]?.['$']?.depth;
    // top_concrete is stb:length (> 0 required)
    const topConcrete = parseFloat(figureDepth) > 0 ? figureDepth : '1';

    deck['StbSecSlabDeckProduct'] = [
      {
        $: {
          product_code: productAttrs.product_code || 'Undefined',
          release_time: productAttrs.release_time || '',
          top_concrete: topConcrete,
        },
      },
    ];
    if (deck['StbSecBarArrangementSlabDeck']) {
      logger.warn(
        `StbSecSlabDeck ${deck['$']?.id}: StbSecBarArrangementSlabDeck dropped (no v2.1.x equivalent)`,
      );
    }
    delete deck['StbSecFigureSlabDeck'];
    delete deck['StbSecBarArrangementSlabDeck'];
    delete deck['StbSecProductSlabDeck'];
    if (deck['$']) delete deck['$'].product_type; // not allowed in v2.1.x
    count++;
  });

  if (count > 0) {
    logger.info(`Deck slab sections: Converted ${count} decks to v2.1.x format (lossy)`);
  }
}

export default convertSlabSectionsTo210;

// ─────────────────────────────────────────────────────────────────────────────
// v2.1.0 → v2.0.2 reverse conversion
// ─────────────────────────────────────────────────────────────────────────────

const SLAB_FIGURE_RENAME_MAP_REVERSE = Object.fromEntries(
  Object.entries(SLAB_FIGURE_RENAME_MAP).map(([k, v]) => [v, k]),
);

// Bar arrangement child element reverse rename map
const SLAB_BAR_RENAME_MAP_REVERSE = {
  StbSecBarSlab_RC_ConventionalStandard: 'StbSecBarSlab_RC_Standard',
  StbSecBarSlab_RC_Conventional2Way: 'StbSecBarSlab_RC_2Way',
  StbSecBarSlab_RC_Conventional1Way1: 'StbSecBarSlab_RC_1Way1',
  StbSecBarSlab_RC_Conventional1Way2: 'StbSecBarSlab_RC_1Way2',
};

/**
 * Convert RC slab sections from v2.1.0 back to v2.0.2 structure.
 * Removes StbSecSlab_RC_Conventional wrapper and restores original element names.
 * @param {object} stbRoot - ST-Bridge root element
 */
export function convertSlabSectionsTo202(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  const slabRCElements = sections['StbSecSlab_RC'];
  if (!slabRCElements || !Array.isArray(slabRCElements)) return;

  let convertedCount = 0;

  slabRCElements.forEach((slabElement) => {
    const conventional = slabElement['StbSecSlab_RC_Conventional']?.[0];
    if (!conventional) return;

    // Extract figure element and restore v2.0.2 names
    const figureConv = conventional['StbSecFigureSlab_RC_Conventional'];
    if (figureConv && Array.isArray(figureConv)) {
      figureConv.forEach((fig) => {
        // Convert StbSecSlab_RC_ConventionalTaper (single element with base_depth/tip_depth)
        // back to two StbSecSlab_RC_Taper elements (pos="BASE"/"TIP" + depth) required by v2.0.2
        if (fig['StbSecSlab_RC_ConventionalTaper']) {
          const taperArr = Array.isArray(fig['StbSecSlab_RC_ConventionalTaper'])
            ? fig['StbSecSlab_RC_ConventionalTaper']
            : [fig['StbSecSlab_RC_ConventionalTaper']];
          const taperSrc = taperArr[0] ?? {};
          const baseDepth = taperSrc['$']?.['base_depth'] ?? taperSrc['base_depth'];
          const tipDepth = taperSrc['$']?.['tip_depth'] ?? taperSrc['tip_depth'];
          fig['StbSecSlab_RC_Taper'] = [
            { $: { pos: 'BASE', depth: baseDepth } },
            { $: { pos: 'TIP', depth: tipDepth } },
          ];
          delete fig['StbSecSlab_RC_ConventionalTaper'];
        }

        // Reverse rename remaining figure children: ConventionalStraight → Straight etc.
        // (excludes ConventionalTaper which has already been handled above)
        for (const [oldName, newName] of Object.entries(SLAB_FIGURE_RENAME_MAP_REVERSE)) {
          if (oldName !== 'StbSecSlab_RC_ConventionalTaper' && fig[oldName]) {
            renameKey(fig, oldName, newName);
          }
        }
      });
      // v2.0.2 uses StbSecFigureSlab_RC (not _Conventional)
      slabElement['StbSecFigureSlab_RC'] = figureConv;
    }

    // Extract bar arrangement and restore v2.0.2 names
    const barArrConv = conventional['StbSecBarArrangementSlab_RC_Conventional'];
    if (barArrConv) {
      barArrConv.forEach((barArr) => {
        for (const [oldName, newName] of Object.entries(SLAB_BAR_RENAME_MAP_REVERSE)) {
          if (barArr[oldName]) renameKey(barArr, oldName, newName);
        }
      });
      slabElement['StbSecBarArrangementSlab_RC'] = barArrConv;
    }

    // Remove Conventional wrapper
    delete slabElement['StbSecSlab_RC_Conventional'];
    convertedCount++;
  });

  if (convertedCount > 0) {
    logger.info(`RC Slab sections: Reverted ${convertedCount} slabs to v2.0.2 format`);
  }

  convertSlabDeckSectionsTo202(sections);
}

/**
 * Convert deck slab sections from v2.1.x back to v2.0.2 structure.
 * @param {object} sections - StbSections element
 */
function convertSlabDeckSectionsTo202(sections) {
  const deckElements = sections['StbSecSlabDeck'];
  if (!deckElements || !Array.isArray(deckElements)) return;

  let count = 0;

  deckElements.forEach((deck) => {
    const product = deck['StbSecSlabDeckProduct']?.[0]?.['$'];
    if (!product) return; // already v2.0.2 structure

    // depth is stb:length (> 0 required)
    const depth = parseFloat(product.top_concrete) > 0 ? product.top_concrete : '1';
    deck['StbSecFigureSlabDeck'] = [{ StbSecSlabDeckStraight: [{ $: { depth } }] }];
    deck['StbSecProductSlabDeck'] = [
      { $: { product_code: product.product_code || 'Undefined', depth_deck: '0' } },
    ];
    delete deck['StbSecSlabDeckProduct'];

    if (!deck['$']) deck['$'] = {};
    if (!deck['$'].product_type) deck['$'].product_type = 'FLAT'; // required in v2.0.2
    count++;
  });

  if (count > 0) {
    logger.info(`Deck slab sections: Reverted ${count} decks to v2.0.2 format`);
  }
}

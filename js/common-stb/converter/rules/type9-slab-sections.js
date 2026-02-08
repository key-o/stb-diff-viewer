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
}

export default convertSlabSectionsTo210;

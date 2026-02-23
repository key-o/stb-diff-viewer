/**
 * @fileoverview Backward-compatible section extractor entrypoint.
 *
 * Legacy imports still reference this module path. Re-exporting from the
 * unified section extractor keeps existing runtime and tests working.
 */

export { extractAllSections } from './sectionExtractor.js';

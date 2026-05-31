/**
 * STB Version Converter
 *
 * Bidirectional converter for ST-Bridge XML format versions.
 * Primary path: v2.0.2 <-> v2.1.1
 * Legacy path:  v2.1.0 treated as v2.1.1 (identical schema, label-only difference)
 *
 * @example
 * import { convert, detectVersion } from '../common-stb/converter/index.js';
 *
 * // Detect version
 * const version = await detectVersion(xmlContent);
 *
 * // Convert to v2.1.1
 * const result = await convert(xmlContent, '2.1.1');
 * console.log(result.xml);
 */

export { convert, detectVersion, validate, logger } from './converter.js';
export { convert202to211 } from './v202-to-v211.js';
export { convert211to202 } from './v211-to-v202.js';

// Re-export utilities for advanced usage
export { parseXml, buildXml, deepClone } from './utils/xml-helper.js';
export { Logger } from './utils/converter-logger.js';

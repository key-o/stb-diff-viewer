/**
 * STB Version Converter
 *
 * Bidirectional converter for ST-Bridge XML format versions.
 * Supports: v2.0.2 <-> v2.1.0
 *
 * @example
 * import { convert, detectVersion } from '../common-stb/converter/index.js';
 *
 * // Detect version
 * const version = await detectVersion(xmlContent);
 *
 * // Convert to v2.1.0
 * const result = await convert(xmlContent, '2.1.0');
 * console.log(result.xml);
 */

export { convert, detectVersion, validate, logger } from './converter.js';
export { convert202to210 } from './v202-to-v210.js';
export { convert210to202 } from './v210-to-v202.js';

// Re-export utilities for advanced usage
export { parseXml, buildXml, deepClone } from './utils/xml-helper.js';
export { Logger } from './utils/converter-logger.js';

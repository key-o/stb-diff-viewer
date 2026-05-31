/**
 * @fileoverview Revit IFC property/name heuristics for IFC -> STB conversion.
 *
 * Revit IFC2X3 exports often put structural type information in ObjectType or
 * Name strings such as "RC_C_B:C1:12345" instead of standard structural fields.
 */

const STRUCTURE_PREFIXES = new Map([
  ['CFT', 'CFT'],
  ['SRC', 'SRC'],
  ['RC', 'RC'],
  ['S', 'S'],
]);

const SECTION_TOKEN_MAP = new Map([
  ['H', 'H'],
  ['I', 'H'],
  ['BOX', 'BOX'],
  ['PIPE', 'PIPE'],
  ['P', 'PIPE'],
  ['C', 'C'],
  ['U', 'C'],
  ['L', 'L'],
  ['T', 'T'],
  ['FB', 'FB'],
  ['F', 'FB'],
  ['B', 'RECTANGLE'],
  ['RECT', 'RECTANGLE'],
  ['RECTANGLE', 'RECTANGLE'],
  ['CIRCLE', 'CIRCLE'],
  ['RB', 'CIRCLE'],
]);

export class RevitPropertyExtractor {
  /**
   * Extract commonly needed metadata from a web-ifc element line.
   * @param {Object} line
   * @param {string|null} materialName
   * @returns {Object}
   */
  static extractElementMetadata(line, materialName = null) {
    const objectType = unwrapIfcValue(line?.ObjectType);
    const name = unwrapIfcValue(line?.Name);
    const description = unwrapIfcValue(line?.Description);
    const typeName =
      this.extractTypeName(objectType) ||
      this.extractTypeName(name) ||
      this.extractTypeName(description);

    const textValues = [objectType, name, description, typeName].filter(Boolean);

    return {
      objectType,
      name,
      description,
      materialName,
      typeName,
      typeSignature: this.normalizeTypeSignature(typeName || objectType || name || ''),
      kindStructure: this.extractKindStructure(textValues, materialName),
      sectionHint: this.inferSectionHint(textValues),
    };
  }

  /**
   * Revit names commonly end with ":<instance id>". Remove only that suffix.
   * @param {string|null} value
   * @returns {string|null}
   */
  static extractTypeName(value) {
    if (!value) return null;
    const text = String(value).trim();
    if (!text) return null;
    return text.replace(/:\s*\d+\s*$/, '').trim() || text;
  }

  /**
   * @param {string} value
   * @returns {string}
   */
  static normalizeTypeSignature(value) {
    return this.extractTypeName(value)?.replace(/\s+/g, ' ').toUpperCase() || '';
  }

  /**
   * Infer STB kind_structure from Revit type strings, then material name.
   * @param {Array<string>} textValues
   * @param {string|null} materialName
   * @returns {'S'|'RC'|'SRC'|'CFT'|'UNDEFINED'}
   */
  static extractKindStructure(textValues = [], materialName = null) {
    if (textValues.some((text) => String(text).trim().toUpperCase() === 'UNDEFINED')) {
      return 'UNDEFINED';
    }

    for (const text of textValues) {
      const kind = this.kindFromTypeName(text);
      if (kind) return kind;
    }

    const materialKind = this.kindFromMaterial(materialName);
    return materialKind || 'S';
  }

  /**
   * @param {string|null} value
   * @returns {'S'|'RC'|'SRC'|'CFT'|null}
   */
  static kindFromTypeName(value) {
    if (!value) return null;
    const firstPart = String(value).trim().split(':')[0].toUpperCase();
    const firstToken = firstPart.split(/[_\-\s]+/).filter(Boolean)[0];
    return STRUCTURE_PREFIXES.get(firstToken) || null;
  }

  /**
   * @param {string|null} materialName
   * @returns {'S'|'RC'|null}
   */
  static kindFromMaterial(materialName) {
    if (!materialName) return null;
    const upper = String(materialName).toUpperCase().replace(/\s+/g, '');
    if (/^(FC|CONCRETE|CONC|コンクリート)\d*/.test(upper)) return 'RC';
    if (/^(SS|SN|SM|STKR|BCR|BCP|SUS)\d*/.test(upper)) return 'S';
    return null;
  }

  /**
   * Infer a profile family from Revit type strings.
   * @param {Array<string>} textValues
   * @returns {string|null}
   */
  static inferSectionHint(textValues = []) {
    for (const text of textValues) {
      const hint = this._inferSectionHintFromText(text);
      if (hint) return hint;
    }
    return null;
  }

  static isPost(textValues = []) {
    return textValues.some((text) => /間柱|POST/i.test(String(text)));
  }

  static isFoundationColumn(textValues = []) {
    return textValues.some((text) => /FOUNDATIONCOLUMN|基礎柱/i.test(String(text)));
  }

  static isSmallBeam(textValues = []) {
    return textValues.some((text) => /小梁|SECONDARY|SUB\s*BEAM|SUBBEAM/i.test(String(text)));
  }

  static _inferSectionHintFromText(value) {
    if (!value) return null;

    const firstPart = String(value).trim().split(':')[0].toUpperCase();
    if (!firstPart) return null;

    if (/BOX|角形|□/.test(firstPart)) return 'BOX';
    if (/PIPE|鋼管/.test(firstPart)) return 'PIPE';

    const tokens = firstPart.split(/[_\-\s]+/).filter(Boolean);
    const firstToken = tokens[0];
    const looksLikeRevitType = STRUCTURE_PREFIXES.has(firstToken) && tokens.length >= 3;

    if (looksLikeRevitType) {
      const sectionToken = tokens[2];
      return SECTION_TOKEN_MAP.get(sectionToken) || null;
    }

    for (const token of tokens) {
      const hint = SECTION_TOKEN_MAP.get(token);
      if (hint) return hint;
    }

    return null;
  }
}

function unwrapIfcValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && 'value' in value) {
    return value.value === null || value.value === undefined ? null : String(value.value);
  }
  return String(value);
}

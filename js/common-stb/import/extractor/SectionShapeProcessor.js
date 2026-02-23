/**
 * @fileoverview Same/NotSameパターンの解析ユーティリティ
 *
 * Python 側 SameNotSamePatternProcessor と同等の役割を担い、
 * ST-Bridge の StbSecSteelFigure* 要素配下にある Same/NotSame 要素を
 * 正規化した配列として取得します。
 *
 * STB 2.0.2 と STB 2.1.0 の両方の形式に対応しています。
 *
 * @module common/stb/import/extractor/SectionShapeProcessor
 */

const STB_NAMESPACE = 'https://www.building-smart.or.jp/dl';

// STB 2.0.2 and 2.1.0 Same patterns
const SAME_PATTERNS = [
  // STB 2.0.2 patterns
  'StbSecSteelColumn_S_Same',
  'StbSecSteelColumn_CFT_Same',
  'StbSecSteelColumn_SRC_Same',
  'StbSecSteelBeam_S_Same',
  'StbSecSteelBeam_S_Straight', // 梁の一定断面（Sameと同等）
  'StbSecSteelBeam_CFT_Same',
  'StbSecSteelBeam_CFT_Straight', // CFT造梁のストレート
  'StbSecSteelBeam_SRC_Same',
  'StbSecSteelBeam_SRC_Straight', // SRC造梁のストレート（鋼材部分）
  'StbSecSteelBrace_S_Same',
  'StbSecSteelGirder_S_Same',
  'StbSecSteelGirder_CFT_Same',
  'StbSecSteelGirder_CFT_Straight', // CFT造大梁のストレート
  'StbSecSteelGirder_SRC_Same',
  'StbSecSteelGirder_SRC_Straight', // SRC造大梁のストレート
  // STB 2.1.0 patterns (within StbSecSteelFigure* > StbSecSteel*_Shape)
  'StbSecSteelColumnSame',
  'StbSecSteelBeamStraight',
  'StbSecSteelBraceSame',
  'StbSecSteelGirderSame',
];

// STB 2.0.2 and 2.1.0 NotSame patterns
const NOT_SAME_PATTERNS = [
  // STB 2.0.2 patterns
  'StbSecSteelColumn_S_NotSame',
  'StbSecSteelColumn_CFT_NotSame',
  'StbSecSteelColumn_SRC_NotSame',
  'StbSecSteelBeam_S_NotSame',
  'StbSecSteelBeam_CFT_NotSame',
  'StbSecSteelBeam_SRC_NotSame',
  'StbSecSteelBrace_S_NotSame',
  'StbSecSteelGirder_S_NotSame',
  'StbSecSteelGirder_CFT_NotSame',
  'StbSecSteelGirder_SRC_NotSame',
  // STB v2.0.2 NOTNOTSAME パターン (kind="NOTNOTSAME")
  'StbSecSteel_Column_NotSame_NotSame',
  // STB 2.1.0 patterns
  'StbSecSteelColumnNotSame',
  'StbSecSteelBeamNotSame',
  'StbSecSteelBraceNotSame',
  'StbSecSteelGirderNotSame',
];

// 梁専用の多断面パターン (STB 2.0.2 and 2.1.0)
const BEAM_MULTI_SECTION_PATTERNS = [
  // STB 2.0.2 patterns - S造梁
  'StbSecSteelBeam_S_Haunch', // ハンチ付き梁 (2-3断面)
  'StbSecSteelBeam_S_Joint', // 接合部変化梁 (2-3断面)
  'StbSecSteelBeam_S_FiveTypes', // 詳細ハンチ梁 (3-5断面)
  'StbSecSteelBeam_S_Taper', // テーパー梁 (2断面: START/END)
  // STB 2.0.2 patterns - CFT造梁
  'StbSecSteelBeam_CFT_Haunch',
  'StbSecSteelBeam_CFT_Joint',
  'StbSecSteelBeam_CFT_FiveTypes',
  'StbSecSteelBeam_CFT_Taper',
  // STB 2.0.2 patterns - SRC造梁
  'StbSecSteelBeam_SRC_Haunch',
  'StbSecSteelBeam_SRC_Joint',
  'StbSecSteelBeam_SRC_FiveTypes',
  'StbSecSteelBeam_SRC_Taper',
  // STB 2.1.0 patterns
  'StbSecSteelBeamHaunch',
  'StbSecSteelBeamJoint',
  'StbSecSteelBeamFiveTypes',
  'StbSecSteelBeamTaper',
];

// SRC造柱のクロスH断面パターン（shape_X / shape_Y 属性で2本のH鋼を直交させる断面）
// STB 2.0.2: Same/NotSame/ThreeTypes 要素の子要素として定義
// STB 2.1.0: Figure要素の直接子要素として定義
const CROSS_H_PATTERNS = [
  // STB 2.0.2 patterns (子要素として shape_X/shape_Y を持つ)
  'StbSecColumn_SRC_SameShapeCross',
  'StbSecColumn_SRC_NotSameShapeCross',
  'StbSecColumn_SRC_ThreeTypesShapeCross',
  // STB 2.1.0 patterns
  'StbSecSteelColumn_SRC_ShapeCross1',
  'StbSecSteelColumn_SRC_ShapeCross2',
];

// STB 2.1.0 Figure structure wrappers
const V210_FIGURE_WRAPPERS = [
  'StbSecSteelFigureBeam_S',
  'StbSecSteelFigureColumn_S',
  'StbSecSteelFigureBrace_S',
  'StbSecSteelFigureGirder_S',
];

// STB 2.1.0 Shape wrappers (contain the actual shape elements)
const V210_SHAPE_WRAPPERS = [
  'StbSecSteelBeam_S_Shape',
  'StbSecSteelColumn_S_Shape',
  'StbSecSteelBrace_S_Shape',
  'StbSecSteelGirder_S_Shape',
];

/**
 * Same/NotSame を展開するパーサ
 */
export class SectionShapeProcessor {
  /**
   * @param {Element} steelFigureElement StbSecSteelFigure* 要素
   */
  constructor(steelFigureElement) {
    this.figureElement = steelFigureElement;
  }

  /**
   * Same 要素を抽出
   * @returns {Object|null}
   */
  processSamePattern() {
    if (!this.figureElement) return null;
    for (const pattern of SAME_PATTERNS) {
      const elem = findFirstChild(this.figureElement, pattern);
      if (elem) {
        const descriptor = this._buildDescriptor(elem, 'SAME');
        if (descriptor) {
          return descriptor;
        }
      }
    }
    return null;
  }

  /**
   * NotSame 要素を抽出
   * @returns {Array<Object>}
   */
  processNotSamePattern() {
    if (!this.figureElement) return [];
    const variants = [];
    for (const pattern of NOT_SAME_PATTERNS) {
      const nodes = findChildren(this.figureElement, pattern);
      for (const node of nodes) {
        const descriptor = this._buildDescriptor(node, 'NOT_SAME');
        if (descriptor) {
          if (!descriptor.position) {
            descriptor.position = 'TOP'; // Python 側と同様のデフォルト
          }
          variants.push(descriptor);
        }
      }
    }
    return variants;
  }

  /**
   * 梁の多断面パターン (Haunch, Joint, FiveTypes, Taper) を抽出
   * @returns {Array<Object>}
   */
  processBeamMultiSectionPattern() {
    if (!this.figureElement) return [];
    const variants = [];
    for (const pattern of BEAM_MULTI_SECTION_PATTERNS) {
      const nodes = findChildren(this.figureElement, pattern);
      for (const node of nodes) {
        const descriptor = this._buildDescriptor(node, 'MULTI_SECTION');
        if (descriptor) {
          // Taper elements with start_shape/end_shape should be expanded to START/END variants
          if (descriptor.isTaper && descriptor.endShape) {
            // Create START variant
            const startVariant = {
              ...descriptor,
              position: 'START',
              shape: descriptor.shape, // start_shape
            };
            variants.push(startVariant);

            // Create END variant
            const endVariant = {
              ...descriptor,
              position: 'END',
              shape: descriptor.endShape,
            };
            variants.push(endVariant);
          } else {
            // positionが無い場合はタグ名からデフォルト推定
            if (!descriptor.position) {
              descriptor.position = 'CENTER';
            }
            variants.push(descriptor);
          }
        }
      }
    }
    // Deduplicate consecutive shapes and normalize positions
    return this._deduplicateAndNormalizePositions(variants);
  }

  /**
   * Deduplicate consecutive variants with same shape and normalize positions
   * @param {Array<Object>} variants
   * @returns {Array<Object>}
   */
  _deduplicateAndNormalizePositions(variants) {
    if (variants.length <= 1) return variants;

    // Remove consecutive duplicates (same shape name)
    const deduplicated = [];
    for (let i = 0; i < variants.length; i++) {
      const current = variants[i];
      const prev = deduplicated[deduplicated.length - 1];

      // Skip if same shape as previous (keep the first occurrence)
      if (prev && current.shape === prev.shape) {
        continue;
      }
      deduplicated.push({ ...current });
    }

    // Normalize positions based on count
    const total = deduplicated.length;
    for (let i = 0; i < total; i++) {
      if (total === 1) {
        deduplicated[i].position = 'SAME';
      } else if (total === 2) {
        deduplicated[i].position = i === 0 ? 'START' : 'END';
      } else {
        // 3+ sections
        if (i === 0) {
          deduplicated[i].position = 'START';
        } else if (i === total - 1) {
          deduplicated[i].position = 'END';
        } else {
          deduplicated[i].position = 'CENTER';
        }
      }
    }

    return deduplicated;
  }

  /**
   * Process STB 2.1.0 nested structure (StbSecSteelFigure* > StbSecSteel*_Shape)
   * @returns {Array<Object>}
   */
  processV210NestedStructure() {
    if (!this.figureElement) return [];

    const variants = [];

    // Look for v210 Shape wrapper elements
    for (const shapeWrapper of V210_SHAPE_WRAPPERS) {
      const shapeNodes = findChildren(this.figureElement, shapeWrapper);
      for (const shapeNode of shapeNodes) {
        const order = shapeNode.getAttribute('order');
        // Look for shape elements inside the wrapper
        const children = shapeNode.children || [];
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          const descriptor = this._buildDescriptor(child, 'V210_SHAPE');
          if (descriptor) {
            descriptor.order = order ? parseInt(order) : i + 1;

            // Check if this is a Taper element - expand to START and END variants
            if (descriptor.isTaper && descriptor.endShape) {
              // Create START variant
              const startVariant = {
                ...descriptor,
                position: 'START',
                shape: descriptor.shape, // start_shape
              };
              variants.push(startVariant);

              // Create END variant
              const endVariant = {
                ...descriptor,
                position: 'END',
                shape: descriptor.endShape,
                order: descriptor.order + 0.5, // For sorting between this and next order
              };
              variants.push(endVariant);
            } else {
              descriptor.position = this._inferPositionFromOrder(
                descriptor.order,
                shapeNodes.length,
              );
              variants.push(descriptor);
            }
          }
        }
      }
    }

    // Sort by order
    variants.sort((a, b) => (a.order || 0) - (b.order || 0));

    // Deduplicate consecutive shapes and normalize positions
    return this._deduplicateAndNormalizePositions(variants);
  }

  /**
   * Infer position from order in multi-section beam
   * @param {number} order - Order number (1-based)
   * @param {number} total - Total number of sections
   * @returns {string} Position identifier
   */
  _inferPositionFromOrder(order, total) {
    if (total === 1) return 'SAME';
    if (total === 2) {
      return order === 1 ? 'START' : 'END';
    }
    // 3+ sections
    if (order === 1) return 'START';
    if (order === total) return 'END';
    return 'CENTER';
  }

  /**
   * Same/NotSame/BeamMultiSection/V210Nested/CrossH/フォールバックの順に shape 名を決める
   * @returns {Object|null}
   */
  expandSteelFigure() {
    if (!this.figureElement) {
      return null;
    }

    // Try STB 2.1.0 nested structure first
    const v210Variants = this.processV210NestedStructure();

    const sameVariant = this.processSamePattern();
    const notSameVariants = this.processNotSamePattern();
    const beamMultiSectionVariants = this.processBeamMultiSectionPattern();

    // クロスH断面の検出（shape_X / shape_Y を持つ要素）
    // Same/NotSame パターンが見つからない場合のみ試行
    const hasOtherPatterns =
      sameVariant || notSameVariants.length || beamMultiSectionVariants.length;
    const crossHPattern = hasOtherPatterns ? null : this.processCrossHPattern();

    const fallbackVariant =
      hasOtherPatterns || v210Variants.length || crossHPattern
        ? null
        : this._extractFallbackShape();

    const variants = [];
    if (sameVariant) variants.push(sameVariant);
    if (notSameVariants.length) variants.push(...notSameVariants);
    if (beamMultiSectionVariants.length) variants.push(...beamMultiSectionVariants);
    // Add v210 variants if no other patterns matched
    if (!hasOtherPatterns && v210Variants.length) variants.push(...v210Variants);
    if (!variants.length && fallbackVariant) {
      variants.push(fallbackVariant);
    }

    // クロスH断面はvariantsとは別フィールドで返す（shape が無いため）
    if (!variants.length && !crossHPattern) {
      return null;
    }

    const primaryShape =
      sameVariant?.shape ||
      (notSameVariants.length ? notSameVariants[0].shape : null) ||
      (beamMultiSectionVariants.length ? beamMultiSectionVariants[0].shape : null) ||
      (v210Variants.length ? v210Variants[0].shape : null) ||
      fallbackVariant?.shape ||
      crossHPattern?.shapeX || // クロスH断面はX方向を代表形状とする
      null;

    return {
      same: sameVariant || null,
      notSame: notSameVariants,
      beamMultiSection: beamMultiSectionVariants.length ? beamMultiSectionVariants : v210Variants,
      variants,
      primaryShape,
      fallbackShape: fallbackVariant?.shape || null,
      isV210Structure: v210Variants.length > 0 && !hasOtherPatterns,
      crossH: crossHPattern || null, // クロスH断面情報（{ shapeX, shapeY, isCrossH: true }）
    };
  }

  /**
   * クロスH断面（shape_X / shape_Y を持つ要素）を抽出
   *
   * STB仕様でH鋼を十字に重ねたSRC造柱専用の断面形式。
   * @returns {Object|null} { shapeX, shapeY, tagName, attributes } or null
   */
  processCrossHPattern() {
    if (!this.figureElement) return null;

    // figureElement 配下を再帰的に探索して shape_X 属性を持つ要素を見つける
    const crossElem = this._findCrossHElement(this.figureElement);
    if (!crossElem) return null;

    const shapeX = crossElem.getAttribute('shape_X');
    const shapeY = crossElem.getAttribute('shape_Y');
    if (!shapeX) return null;

    return {
      shapeX,
      shapeY: shapeY || shapeX, // shape_Y が省略された場合は shape_X と同じとみなす
      tagName: crossElem.tagName,
      attributes: collectAttributes(crossElem),
      isCrossH: true,
    };
  }

  /**
   * @private
   * shape_X 属性を持つクロスH要素を再帰的に探す
   * @param {Element} root
   * @returns {Element|null}
   */
  _findCrossHElement(root) {
    if (!root) return null;

    // querySelectorAll で shape_X 属性を持つ要素を一括検索（高速パス）
    if (typeof root.querySelectorAll === 'function') {
      try {
        const found = root.querySelectorAll('[shape_X]');
        if (found && found.length > 0) return found[0];
      } catch (_) {
        // 名前空間付きの場合は失敗することがある
      }
    }

    // タグ名による探索（CROSS_H_PATTERNS リスト）
    for (const pattern of CROSS_H_PATTERNS) {
      const elems = findChildren(root, pattern);
      if (elems.length > 0) return elems[0];
      // 孫要素にも探索（STB 2.0.2 の Same > ShapeCross 構造に対応）
      const children = root.children || [];
      for (let i = 0; i < children.length; i++) {
        const childElems = findChildren(children[i], pattern);
        if (childElems.length > 0) return childElems[0];
      }
    }

    return null;
  }

  /**
   * @private
   * @param {Element} element
   * @param {"SAME"|"NOT_SAME"|"FALLBACK"} variantType
   * @returns {Object|null}
   */
  _buildDescriptor(element, variantType) {
    if (!element) return null;
    // STB 2.1.0 Taper elements use start_shape/end_shape instead of shape
    // For consistency, use start_shape as the primary shape (matches STB 2.0.2 behavior)
    let shape = element.getAttribute('shape');
    let endShape = null;
    if (!shape) {
      shape = element.getAttribute('start_shape');
      endShape = element.getAttribute('end_shape');
    }
    if (!shape) return null;
    const descriptor = {
      shape,
      tagName: element.tagName,
      attributes: collectAttributes(element),
      variantType,
      type: variantType,
      sourceTag: element.tagName,
      position: element.getAttribute('pos') || null,
    };
    // Store end_shape for taper elements
    if (endShape) {
      descriptor.endShape = endShape;
      descriptor.isTaper = true;
    }
    const strength = element.getAttribute('strength_main') || element.getAttribute('strength');
    if (strength) {
      descriptor.strengthMain = strength;
    }
    return descriptor;
  }

  /**
   * @private
   * @returns {Object|null}
   */
  _extractFallbackShape() {
    let target = null;
    if (typeof this.figureElement.querySelector === 'function') {
      // Try shape attribute first, then start_shape for taper elements
      target = this.figureElement.querySelector('*[shape]');
      if (!target) {
        target = this.figureElement.querySelector('*[start_shape]');
      }
    }
    if (!target) {
      target = findFirstShapeElement(this.figureElement);
    }
    if (!target) return null;
    return this._buildDescriptor(target, 'FALLBACK');
  }
}

function collectAttributes(element) {
  const attrs = {};
  if (!element || !element.attributes) {
    return attrs;
  }
  for (const attr of Array.from(element.attributes)) {
    attrs[attr.name] = attr.value;
  }
  return attrs;
}

function normalizeSelector(selector = '') {
  if (!selector) return selector;
  const pos = selector.indexOf(':');
  if (pos >= 0 && pos < selector.length - 1) {
    return selector.slice(pos + 1);
  }
  return selector;
}

function findFirstChild(root, selector) {
  const matches = findChildren(root, selector);
  return matches.length ? matches[0] : null;
}

function findChildren(root, selector) {
  if (!root) return [];
  const localName = normalizeSelector(selector);
  let results = [];
  if (typeof root.querySelectorAll === 'function') {
    try {
      results = Array.from(root.querySelectorAll(localName));
      if (results.length) return results;
    } catch (_) {
      // querySelectorAll may fail on namespaced selectors. Ignore.
    }
  }
  if (typeof root.getElementsByTagName === 'function' && localName !== '*[shape]') {
    results = Array.from(root.getElementsByTagName(localName));
    if (results.length) return results;
  }
  if (typeof root.getElementsByTagNameNS === 'function' && localName !== '*[shape]') {
    results = Array.from(root.getElementsByTagNameNS(STB_NAMESPACE, localName));
    if (results.length) return results;
  }
  // Fallback: manual traversal of direct children
  const manualMatches = [];
  const children = root.children || [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (
      child.tagName === selector ||
      child.tagName === localName ||
      child.localName === localName
    ) {
      manualMatches.push(child);
    }
  }
  return manualMatches;
}

function findFirstShapeElement(root) {
  if (!root) return null;
  const children = root.children || [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    // Check for shape attribute or start_shape (for taper elements)
    if (child.hasAttribute && (child.hasAttribute('shape') || child.hasAttribute('start_shape'))) {
      return child;
    }
    const nested = findFirstShapeElement(child);
    if (nested) return nested;
  }
  return null;
}

// Export patterns for external use
export {
  SAME_PATTERNS,
  NOT_SAME_PATTERNS,
  BEAM_MULTI_SECTION_PATTERNS,
  CROSS_H_PATTERNS,
  V210_FIGURE_WRAPPERS,
  V210_SHAPE_WRAPPERS,
};

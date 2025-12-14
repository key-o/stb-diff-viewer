/**
 * @fileoverview Same/NotSameパターンの解析ユーティリティ
 *
 * Python 側 SameNotSamePatternProcessor と同等の役割を担い、
 * ST-Bridge の StbSecSteelFigure* 要素配下にある Same/NotSame 要素を
 * 正規化した配列として取得します。
 */

const STB_NAMESPACE = 'https://www.building-smart.or.jp/dl';

const SAME_PATTERNS = [
  'StbSecSteelColumn_S_Same',
  'StbSecSteelColumn_CFT_Same',
  'StbSecSteelColumn_SRC_Same',
  'StbSecSteelBeam_S_Same',
  'StbSecSteelBeam_S_Straight', // 梁の一定断面（Sameと同等）
  'StbSecSteelBrace_S_Same',
  'StbSecSteelGirder_S_Same'
];

const NOT_SAME_PATTERNS = [
  'StbSecSteelColumn_S_NotSame',
  'StbSecSteelColumn_CFT_NotSame',
  'StbSecSteelColumn_SRC_NotSame',
  'StbSecSteelBeam_S_NotSame',
  'StbSecSteelBrace_S_NotSame',
  'StbSecSteelGirder_S_NotSame',
  // STB v2.0.2 NOTNOTSAME パターン (kind="NOTNOTSAME")
  'StbSecSteel_Column_NotSame_NotSame'
];

// 梁専用の多断面パターン
const BEAM_MULTI_SECTION_PATTERNS = [
  'StbSecSteelBeam_S_Haunch',     // ハンチ付き梁 (2-3断面)
  'StbSecSteelBeam_S_Joint',      // 接合部変化梁 (2-3断面)
  'StbSecSteelBeam_S_FiveTypes'  // 詳細ハンチ梁 (3-5断面)
];

/**
 * Same/NotSame を展開するパーサ
 */
export class SameNotSameProcessor {
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
   * 梁の多断面パターン (Haunch, Joint, FiveTypes) を抽出
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
          // positionが無い場合はタグ名からデフォルト推定
          if (!descriptor.position) {
            descriptor.position = 'CENTER';
          }
          variants.push(descriptor);
        }
      }
    }
    return variants;
  }

  /**
   * Same/NotSame/BeamMultiSection/フォールバックの順に shape 名を決める
   * @returns {Object|null}
   */
  expandSteelFigure() {
    if (!this.figureElement) {
      return null;
    }
    const sameVariant = this.processSamePattern();
    const notSameVariants = this.processNotSamePattern();
    const beamMultiSectionVariants = this.processBeamMultiSectionPattern();
    const fallbackVariant =
      sameVariant || notSameVariants.length || beamMultiSectionVariants.length
        ? null
        : this._extractFallbackShape();

    const variants = [];
    if (sameVariant) variants.push(sameVariant);
    if (notSameVariants.length) variants.push(...notSameVariants);
    if (beamMultiSectionVariants.length) variants.push(...beamMultiSectionVariants);
    if (!variants.length && fallbackVariant) {
      variants.push(fallbackVariant);
    }

    if (!variants.length) {
      return null;
    }

    const primaryShape =
      sameVariant?.shape ||
      (notSameVariants.length ? notSameVariants[0].shape : null) ||
      (beamMultiSectionVariants.length ? beamMultiSectionVariants[0].shape : null) ||
      fallbackVariant?.shape ||
      null;

    return {
      same: sameVariant || null,
      notSame: notSameVariants,
      beamMultiSection: beamMultiSectionVariants,
      variants,
      primaryShape,
      fallbackShape: fallbackVariant?.shape || null
    };
  }

  /**
   * @private
   * @param {Element} element
   * @param {"SAME"|"NOT_SAME"|"FALLBACK"} variantType
   * @returns {Object|null}
   */
  _buildDescriptor(element, variantType) {
    if (!element) return null;
    const shape = element.getAttribute('shape');
    if (!shape) return null;
    const descriptor = {
      shape,
      tagName: element.tagName,
      attributes: collectAttributes(element),
      variantType,
      type: variantType,
      sourceTag: element.tagName,
      position: element.getAttribute('pos') || null
    };
    const strength =
      element.getAttribute('strength_main') ||
      element.getAttribute('strength');
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
      target = this.figureElement.querySelector('*[shape]');
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
    if (child.hasAttribute && child.hasAttribute('shape')) {
      return child;
    }
    const nested = findFirstShapeElement(child);
    if (nested) return nested;
  }
  return null;
}

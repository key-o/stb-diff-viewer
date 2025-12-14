/**
 * @fileoverview 統一断面抽出エンジン
 *
 * 設定駆動による統一的な断面データ抽出機能を提供します。
 * 従来の個別関数（extractColumnSections等）を統合し、
 * 重複コードを排除した効率的な実装を実現します。
 */

import { SECTION_CONFIG } from '../config/sectionConfig.js';
import { deriveDimensionsFromAttributes } from '../common/dimensionNormalizer.js';
import { ensureUnifiedSectionType } from '../common/sectionTypeUtil.js';
import { SameNotSameProcessor } from './SameNotSameProcessor.js';

// STB 名前空間（querySelector がヒットしない場合にフォールバック）
const STB_NS = 'https://www.building-smart.or.jp/dl';

/**
 * 全要素タイプの断面データを一括抽出
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @returns {Object} 全断面データマップ {columnSections: Map, girderSections: Map, beamSections: Map, braceSections: Map}
 */
export function extractAllSections(xmlDoc) {
  if (!xmlDoc) {
    console.warn('extractAllSections: xmlDoc is null or undefined');
    return createEmptyResult();
  }

  const result = {};

  // 設定に基づいて各要素タイプを処理
  Object.entries(SECTION_CONFIG).forEach(([elementType, config]) => {
    const sectionKey = `${elementType.toLowerCase()}Sections`;
    result[sectionKey] = extractSectionsByType(xmlDoc, elementType, config);
  });

  logExtractionResults(result);
  return result;
}

/**
 * 指定要素タイプの断面データを抽出
 * @param {Document} xmlDoc - XMLドキュメント
 * @param {string} elementType - 要素タイプ
 * @param {Object} config - 抽出設定
 * @returns {Map} 断面データマップ
 */
function extractSectionsByType(xmlDoc, elementType, config) {
  const sections = new Map();

  try {
    // 設定されたセレクターで要素を取得
    const elements = [];
    for (const sel of config.selectors) {
      let nodeList = [];
      try {
        nodeList = xmlDoc.querySelectorAll(sel);
      } catch (_) {
        nodeList = [];
      }
      if (!nodeList || nodeList.length === 0) {
        // 名前空間フォールバック
        if (typeof xmlDoc.getElementsByTagNameNS === 'function') {
          const nsNodes = xmlDoc.getElementsByTagNameNS(STB_NS, sel);
          for (let i = 0; i < nsNodes.length; i++) elements.push(nsNodes[i]);
          continue;
        }
      }
      // 通常経路
      nodeList &&
        nodeList.forEach &&
        nodeList.forEach((el) => elements.push(el));
    }

    elements.forEach((element) => {
      // attributeFilter が設定されている場合、フィルタリングを適用
      if (config.attributeFilter) {
        // skipFilterForTags に含まれるタグはフィルターをスキップ
        const tagName = element.tagName || element.localName;
        const shouldSkipFilter = config.skipFilterForTags &&
          config.skipFilterForTags.includes(tagName);

        // isFoundation="true" の基礎梁もフィルターをスキップ（kind_beam属性を持たないため）
        const isFoundation = element.getAttribute('isFoundation') === 'true';

        if (!shouldSkipFilter && !isFoundation) {
          let matches = true;
          for (const [attr, value] of Object.entries(config.attributeFilter)) {
            const attrValue = element.getAttribute(attr);
            // 属性が存在しない場合
            if (attrValue === null) {
              // skipFilterIfAttributeMissingが設定されていればマッチとみなす
              if (!config.skipFilterIfAttributeMissing) {
                matches = false;
              }
              continue;
            }
            // 属性が存在し、値が異なる場合は不一致
            if (attrValue !== value) {
              matches = false;
              break;
            }
          }
          if (!matches) {
            return; // フィルタに一致しない要素はスキップ
          }
        }
      }

      const sectionData = extractSectionData(element, config);
      if (sectionData && sectionData.id) {
        sections.set(sectionData.id, sectionData);
      }
    });
  } catch (error) {
    console.error(`Error extracting ${elementType} sections:`, error);
  }

  return sections;
}

/**
 * 単一要素から断面データを抽出
 * @param {Element} element - DOM要素
 * @param {Object} config - 抽出設定
 * @returns {Object|null} 断面データまたはnull
 */
function extractSectionData(element, config) {
  const id = element.getAttribute('id');
  const name = element.getAttribute('name');
  const idSteel = element.getAttribute('id_steel');
  const steelFigureInfo = extractSteelFigureVariants(element, config);

  // ID必須チェック
  if (!id) {
    console.warn(
      'Skipping section due to missing id attribute:',
      element.tagName
    );
    return null;
  }

  const sectionData = {
    id: id,
    name: name,
    sectionType: element.tagName,
    shapeName:
      (steelFigureInfo?.primaryShape || steelFigureInfo?.fallbackShape || null) ??
      extractShapeName(element, config)
  };

  if (idSteel) {
    sectionData.id_steel = idSteel;
    if (!sectionData.shapeName) sectionData.shapeName = idSteel;
  }

  // S造・stb-diff-viewer造柱のisReferenceDirection属性を読み込む
  // （鋼材の基準方向に対する配置を示す: true=基準方向、false=90度回転）
  if (element.tagName === 'StbSecColumn_S' || element.tagName === 'StbSecColumn_SRC') {
    const isRefDir = element.getAttribute('isReferenceDirection');
    // デフォルト値はtrue（XSDスキーマに従う）
    sectionData.isReferenceDirection = isRefDir === null || isRefDir === 'true';
  }

  if (steelFigureInfo) {
    if (steelFigureInfo.variants && steelFigureInfo.variants.length > 0) {
      sectionData.steelVariants = steelFigureInfo.variants;
    }
    if (steelFigureInfo.same || (steelFigureInfo.notSame && steelFigureInfo.notSame.length > 0)) {
      sectionData.sameNotSamePattern = {
        hasSame: Boolean(steelFigureInfo.same),
        notSameCount: steelFigureInfo.notSame.length
      };
    }

    // 多断面ジオメトリ対応: mode と shapes フィールドを正規化
    normalizeSectionMode(sectionData, steelFigureInfo);

    // S造断面の寸法をdimensionsに追加
    const steelDims = extractSteelDimensions(steelFigureInfo);
    if (steelDims && Object.keys(steelDims).length > 0) {
      sectionData.dimensions = {
        ...(sectionData.dimensions || {}),
        ...steelDims
      };
    }
  }

  // RC / stb-diff-viewer / CFT などコンクリート図形寸法の抽出
  try {
    const concreteDims = extractConcreteDimensions(element, config);
    if (concreteDims) {
      sectionData.dimensions = {
        ...(sectionData.dimensions || {}),
        ...concreteDims
      };

      // 断面タイプの推定（RC円形の優先、次にRC矩形のデフォルト）
      if (concreteDims.profile_hint === 'CIRCLE') {
        sectionData.section_type = 'CIRCLE';
      } else if (!sectionData.section_type && /_RC$/i.test(element.tagName)) {
        sectionData.section_type = 'RECTANGLE';
      }

      // RC等でsteel形状が無い場合、寸法から形状名を補完
      if (!sectionData.shapeName) {
        const d = concreteDims.diameter || concreteDims.outer_diameter;
        if (d) {
          sectionData.shapeName = `CIRCLE_D${d}`;
        } else {
          const w =
            concreteDims.width ||
            concreteDims.outer_width ||
            concreteDims.overall_width;
          const h =
            concreteDims.height ||
            concreteDims.overall_depth ||
            concreteDims.depth;
          if (w && h) {
            sectionData.shapeName = `RECT_${w}x${h}`;
          } else if (w) {
            sectionData.shapeName = `RECT_W${w}`;
          } else if (h) {
            sectionData.shapeName = `RECT_H${h}`;
          }
        }
      }
    }
  } catch (e) {
    console.warn(
      'extractSectionData: failed concrete dimension parse for',
      id,
      e
    );
  }

  // 断面タイプの正規化（section_type, profile_type, sectionType の統一）
  ensureUnifiedSectionType(sectionData);

  // stb-diff-viewer造の判定とフラグ設定
  const isStbDiffViewer = /_SRC$/i.test(element.tagName);
  if (isStbDiffViewer) {
    sectionData.isStbDiffViewer = true;
    // RC部分の寸法を明示的に格納（stb-diff-viewer複合ジオメトリ生成用）
    if (sectionData.dimensions) {
      const dims = sectionData.dimensions;
      sectionData.concreteProfile = {
        // 柱・ポスト用（width_X, width_Y）
        width_X: dims.width_X,
        width_Y: dims.width_Y,
        // 梁用（幅・せい）
        width: dims.width || dims.outer_width || dims.width_X,
        height: dims.height || dims.overall_depth || dims.depth || dims.width_Y,
        // 円形断面用
        diameter: dims.diameter || dims.D,
        // プロファイルタイプ（矩形 or 円形）
        profileType: dims.profile_hint === 'CIRCLE' ? 'CIRCLE' : 'RECTANGLE'
      };
    }
  }

  return sectionData;
}

/**
 * 要素から形状名を抽出
 * @param {Element} element - DOM要素
 * @param {Object} config - 抽出設定
 * @returns {string|null} 形状名またはnull
 */
function extractShapeName(element, config) {
  // 鋼材図形から形状名を抽出
  if (config.steelFigures) {
    for (const figureSelector of config.steelFigures) {
      const figureElement = findFigureElement(element, figureSelector);
      if (figureElement) {
        const shapeElement =
          (typeof figureElement.querySelector === 'function' &&
            figureElement.querySelector('*[shape]')) ||
          findFirstShapeElement(figureElement);
        if (shapeElement) {
          return shapeElement.getAttribute('shape');
        }
      }
    }
  }

  return null;
}

/**
 * 空の結果オブジェクトを作成
 * @returns {Object} 空の断面マップ
 */
function createEmptyResult() {
  const result = {};
  Object.keys(SECTION_CONFIG).forEach((elementType) => {
    const sectionKey = `${elementType.toLowerCase()}Sections`;
    result[sectionKey] = new Map();
  });
  return result;
}

/**
 * 抽出結果をログ出力
 * @param {Object} result - 抽出結果
 */
function logExtractionResults(result) {
  const summary = Object.entries(result)
    .map(([key, sections]) => `${key}: ${sections.size}`)
    .join(', ');

  console.log(`Extracted sections - ${summary}`);
}

// ---------------- 追加ヘルパー: S造断面寸法抽出 ----------------
/**
 * steelFigureInfoからS造断面の寸法を抽出
 * @param {Object} steelFigureInfo - SameNotSameProcessorからの出力
 * @returns {Object|null} 寸法オブジェクト {H, A, B, t1, t2, r, ...}
 */
function extractSteelDimensions(steelFigureInfo) {
  if (!steelFigureInfo) return null;

  // 優先順位: same > notSame[0] > beamMultiSection[0] > variants[0]
  let sourceVariant = null;

  if (steelFigureInfo.same) {
    sourceVariant = steelFigureInfo.same;
  } else if (steelFigureInfo.notSame && steelFigureInfo.notSame.length > 0) {
    sourceVariant = steelFigureInfo.notSame[0];
  } else if (steelFigureInfo.beamMultiSection && steelFigureInfo.beamMultiSection.length > 0) {
    sourceVariant = steelFigureInfo.beamMultiSection[0];
  } else if (steelFigureInfo.variants && steelFigureInfo.variants.length > 0) {
    sourceVariant = steelFigureInfo.variants[0];
  }

  if (!sourceVariant) return null;

  const dims = {};

  // 鋼材寸法の標準属性名
  const steelAttrs = ['H', 'A', 'B', 't1', 't2', 'r', 'D', 'd', 't'];

  // 属性はsourceVariant.attributesに格納されている
  const attrSource = sourceVariant.attributes || sourceVariant;

  for (const attr of steelAttrs) {
    if (attrSource[attr] !== undefined) {
      const val = parseFloat(attrSource[attr]);
      if (isFinite(val)) {
        dims[attr] = val;
      }
    }
  }

  // 形状タイプからプロファイルヒントを設定
  if (sourceVariant.shape) {
    const shapeName = sourceVariant.shape.toUpperCase();
    if (shapeName.includes('H-') || shapeName.startsWith('H ') || /^H\d/.test(shapeName)) {
      dims.profile_hint = 'H';
    } else if (shapeName.includes('BOX') || shapeName.includes('□') || shapeName.includes('BCP') || shapeName.includes('BCR')) {
      dims.profile_hint = 'BOX';
    } else if (shapeName.includes('PIPE') || shapeName.includes('○') || shapeName.includes('STK')) {
      dims.profile_hint = 'PIPE';
    } else if (shapeName.includes('[-') || shapeName.startsWith('C ') || /^C\d/.test(shapeName)) {
      dims.profile_hint = 'C';
    } else if (shapeName.includes('L-') || shapeName.startsWith('L ') || /^L\d/.test(shapeName)) {
      dims.profile_hint = 'L';
    } else if (shapeName.includes('T-') || /^(T|CT)\d/.test(shapeName)) {
      dims.profile_hint = 'T';
    } else if (shapeName.includes('FB-') || shapeName.startsWith('FB ') || /^FB\d/.test(shapeName)) {
      dims.profile_hint = 'FB';
    } else if (shapeName.includes('RB-') || shapeName.startsWith('RB ') || /^RB\d/.test(shapeName)) {
      dims.profile_hint = 'CIRCLE';
    }
  }

  // H形鋼の場合、幅と高さを設定
  if (dims.H && dims.B) {
    // H形鋼: H=せい、B=フランジ幅
    dims.height = dims.H;
    dims.width = dims.B;
  } else if (dims.A && dims.B) {
    // 角形鋼管など: A=せい、B=幅
    dims.height = dims.A;
    dims.width = dims.B;
  } else if (dims.D) {
    // 円形鋼管: D=直径
    dims.diameter = dims.D;
  } else if (dims.d) {
    dims.diameter = dims.d;
  }

  // 属性から寸法が取れなかった場合、shape名から解析
  if (!dims.width && !dims.height && !dims.diameter && sourceVariant.shape) {
    const parsedDims = parseDimensionsFromShapeName(sourceVariant.shape);
    if (parsedDims) {
      Object.assign(dims, parsedDims);
    }
  }

  return Object.keys(dims).length > 0 ? dims : null;
}

/**
 * 形状名から寸法を解析
 * 例: "H-250x250x9x14x13", "□-400x400x22x66", "P-100x10"
 * @param {string} shapeName - 形状名
 * @returns {Object|null} 寸法オブジェクト
 */
function parseDimensionsFromShapeName(shapeName) {
  if (!shapeName) return null;

  const dims = {};

  // 数値部分を抽出（-の後の数値をxで分割）
  const match = shapeName.match(/[-]?([\d.]+(?:x[\d.]+)*)/);
  if (!match) return null;

  const numbers = match[1].split('x').map(n => parseFloat(n)).filter(n => isFinite(n));
  if (numbers.length === 0) return null;

  const upperName = shapeName.toUpperCase();

  // H形鋼: H-HxBxt1xt2xr
  if (upperName.startsWith('H-') || upperName.startsWith('H ') || /^H\d/.test(upperName)) {
    if (numbers.length >= 2) {
      dims.H = numbers[0];
      dims.B = numbers[1];
      dims.height = numbers[0];
      dims.width = numbers[1];
      if (numbers[2]) dims.t1 = numbers[2];
      if (numbers[3]) dims.t2 = numbers[3];
      if (numbers[4]) dims.r = numbers[4];
      dims.profile_hint = 'H';
    }
  }
  // 角形鋼管: □-AxBxtxr or BCP/BCR-AxBxt
  else if (upperName.includes('□') || upperName.includes('BCP') || upperName.includes('BCR') || upperName.includes('BOX')) {
    if (numbers.length >= 2) {
      dims.A = numbers[0];
      dims.B = numbers[1];
      dims.height = numbers[0];
      dims.width = numbers[1];
      if (numbers[2]) dims.t = numbers[2];
      if (numbers[3]) dims.r = numbers[3];
      dims.profile_hint = 'BOX';
    } else if (numbers.length === 1) {
      // 正方形の場合
      dims.A = numbers[0];
      dims.B = numbers[0];
      dims.height = numbers[0];
      dims.width = numbers[0];
      dims.profile_hint = 'BOX';
    }
  }
  // 円形鋼管: P-Dxt or ○-Dxt or STK-Dxt
  else if (upperName.startsWith('P-') || upperName.startsWith('P ') || upperName.includes('○') || upperName.includes('STK')) {
    if (numbers.length >= 1) {
      dims.D = numbers[0];
      dims.diameter = numbers[0];
      if (numbers[1]) dims.t = numbers[1];
      dims.profile_hint = 'PIPE';
    }
  }
  // C形鋼: [-HxBxt1xt2
  else if (upperName.includes('[-') || upperName.startsWith('C-') || upperName.startsWith('C ')) {
    if (numbers.length >= 2) {
      dims.H = numbers[0];
      dims.B = numbers[1];
      dims.height = numbers[0];
      dims.width = numbers[1];
      if (numbers[2]) dims.t1 = numbers[2];
      if (numbers[3]) dims.t2 = numbers[3];
      dims.profile_hint = 'C';
    }
  }
  // L形鋼: L-AxBxt
  else if (upperName.startsWith('L-') || upperName.startsWith('L ')) {
    if (numbers.length >= 2) {
      dims.A = numbers[0];
      dims.B = numbers[1];
      dims.height = numbers[0];
      dims.width = numbers[1];
      if (numbers[2]) dims.t = numbers[2];
      dims.profile_hint = 'L';
    }
  }
  // T形鋼やCT形鋼
  else if (upperName.startsWith('T-') || upperName.startsWith('CT-')) {
    if (numbers.length >= 2) {
      dims.H = numbers[0];
      dims.B = numbers[1];
      dims.height = numbers[0];
      dims.width = numbers[1];
      if (numbers[2]) dims.t1 = numbers[2];
      if (numbers[3]) dims.t2 = numbers[3];
      dims.profile_hint = 'T';
    }
  }
  // フラットバー（平鋼）: FB-Bxt
  else if (upperName.startsWith('FB-') || upperName.startsWith('FB ')) {
    if (numbers.length >= 2) {
      dims.B = numbers[0];
      dims.t = numbers[1];
      dims.width = numbers[0];
      dims.thickness = numbers[1];
      dims.profile_hint = 'FB';
    } else if (numbers.length === 1) {
      dims.B = numbers[0];
      dims.width = numbers[0];
      dims.profile_hint = 'FB';
    }
  }
  // 丸鋼（中実円）: RB-D
  else if (upperName.startsWith('RB-') || upperName.startsWith('RB ')) {
    if (numbers.length >= 1) {
      dims.D = numbers[0];
      dims.diameter = numbers[0];
      dims.profile_hint = 'CIRCLE';
    }
  }
  // 不明な形式でも数値があれば設定
  else if (numbers.length >= 2) {
    dims.height = numbers[0];
    dims.width = numbers[1];
  } else if (numbers.length === 1) {
    dims.diameter = numbers[0];
  }

  return Object.keys(dims).length > 0 ? dims : null;
}

// ---------------- 追加ヘルパー: コンクリート図形寸法抽出 ----------------
function extractConcreteDimensions(element, config) {
  if (!config.concreteFigures || config.concreteFigures.length === 0)
    return null;
  let dims = null;
  for (const figSel of config.concreteFigures) {
    let fig = null;
    try {
      fig = element.querySelector(figSel);
    } catch (_) {
      fig = null;
    }
    if (!fig && typeof element.getElementsByTagNameNS === 'function') {
      const nsList = element.getElementsByTagNameNS(STB_NS, figSel);
      fig = nsList && nsList[0];
    }
    if (!fig) {
      // タグ名で直接検索を試みる（querySelector が失敗する場合のフォールバック）
      const children = element.children || element.childNodes || [];
      for (let i = 0; i < children.length; i++) {
        if (children[i].tagName === figSel || children[i].localName === figSel) {
          fig = children[i];
          break;
        }
      }
    }
    if (!fig) continue;
    // 子要素内の shape を持つもの or 寸法属性を持つものを調査
    const candidates = Array.from(fig.children || []);
    for (const c of candidates) {
      const d = deriveDimensionsFromAttributes(c.attributes);
      if (d) {
        // 円/矩形のヒントをタグ名から付与
        if (/Circle/i.test(c.tagName)) d.profile_hint = 'CIRCLE';
        if (/Rect/i.test(c.tagName))
          d.profile_hint = d.profile_hint || 'RECTANGLE';

        // 拡底杭タイプをタグ名から判定
        const pileTypeFromTag = extractPileTypeFromTagName(c.tagName);
        if (pileTypeFromTag) {
          d.pile_type = pileTypeFromTag;
          d.profile_hint = 'EXTENDED_PILE';
          d.pileTagName = c.tagName; // デバッグ用にタグ名も保存
        }

        dims = dims ? { ...dims, ...d } : d;
      }
    }
    // fig 自身の属性も確認
    const selfDims = deriveDimensionsFromAttributes(fig.attributes);
    if (selfDims) {
      if (/Circle/i.test(fig.tagName)) selfDims.profile_hint = 'CIRCLE';
      if (/Rect/i.test(fig.tagName))
        selfDims.profile_hint = selfDims.profile_hint || 'RECTANGLE';

      // 拡底杭タイプをタグ名から判定
      const pileTypeFromTag = extractPileTypeFromTagName(fig.tagName);
      if (pileTypeFromTag) {
        selfDims.pile_type = pileTypeFromTag;
        selfDims.profile_hint = 'EXTENDED_PILE';
        selfDims.pileTagName = fig.tagName;
      }

      dims = dims ? { ...dims, ...selfDims } : selfDims;
    }
  }
  return dims;
}

/**
 * タグ名から拡底杭タイプを抽出
 * @param {string} tagName - XML要素のタグ名
 * @returns {string|null} 杭タイプ ('ExtendedFoot', 'ExtendedTop', 'ExtendedTopFoot', 'Straight') または null
 */
function extractPileTypeFromTagName(tagName) {
  if (!tagName) return null;

  // StbSecPile_RC_ExtendedTopFoot - 頭部・根固め部拡大杭（先に判定）
  if (/ExtendedTopFoot/i.test(tagName)) {
    return 'ExtendedTopFoot';
  }
  // StbSecPile_RC_ExtendedFoot - 根固め部拡大杭
  if (/ExtendedFoot/i.test(tagName)) {
    return 'ExtendedFoot';
  }
  // StbSecPile_RC_ExtendedTop - 頭部拡大杭
  if (/ExtendedTop/i.test(tagName)) {
    return 'ExtendedTop';
  }
  // StbSecPile_RC_Straight - 直杭
  if (/Pile.*Straight/i.test(tagName)) {
    return 'Straight';
  }

  return null;
}

function extractSteelFigureVariants(element, config) {
  if (!config.steelFigures || config.steelFigures.length === 0) {
    // フォールバック: 直接子要素から多断面パターンを検索
    const processor = new SameNotSameProcessor(element);
    return processor.expandSteelFigure();
  }

  for (const figureSelector of config.steelFigures) {
    const figureElement = findFigureElement(element, figureSelector);
    if (!figureElement) continue;
    const processor = new SameNotSameProcessor(figureElement);
    const expanded = processor.expandSteelFigure();
    if (expanded) {
      return expanded;
    }
  }

  // フォールバック: Figure要素が見つからない場合、element自体を直接調査
  // (STB v2.0.2では多断面要素がFigure要素でラップされていない場合がある)
  const processor = new SameNotSameProcessor(element);
  return processor.expandSteelFigure();
}

function findFigureElement(element, selector) {
  if (!element) return null;
  let figureElement = null;
  if (typeof element.querySelector === 'function') {
    try {
      figureElement = element.querySelector(selector);
    } catch (_) {
      figureElement = null;
    }
    if (figureElement) return figureElement;
  }
  if (typeof element.getElementsByTagNameNS === 'function') {
    const nsList = element.getElementsByTagNameNS(STB_NS, selector);
    if (nsList && nsList.length) {
      return nsList[0];
    }
  }
  const children = element.children || [];
  for (let i = 0; i < children.length; i++) {
    if (
      children[i].tagName === selector ||
      children[i].localName === selector
    ) {
      return children[i];
    }
  }
  return null;
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

/**
 * 断面データに mode と shapes フィールドを正規化して追加
 * 多断面ジオメトリ生成に必要な構造を提供する
 *
 * @param {Object} sectionData - 断面データオブジェクト（変更される）
 * @param {Object} steelFigureInfo - SameNotSameProcessor からの出力
 */
function normalizeSectionMode(sectionData, steelFigureInfo) {
  if (!steelFigureInfo) return;

  const { same, notSame, beamMultiSection } = steelFigureInfo;

  // 1断面: Same が存在する
  if (same) {
    sectionData.mode = 'single';
    sectionData.shapes = [{
      pos: 'SAME',
      shapeName: same.shape,
      variant: same
    }];
    return;
  }

  // 多断面: 梁の特殊パターン (Haunch, Joint, FiveTypes)
  if (beamMultiSection && beamMultiSection.length >= 2) {
    sectionData.mode = beamMultiSection.length === 2 ? 'double' : 'multi';
    sectionData.shapes = beamMultiSection.map(variant => ({
      pos: variant.position || variant.pos || 'CENTER',
      shapeName: variant.shape,
      variant: variant
    }));
    // ハンチ等の種別を記録
    if (beamMultiSection[0]?.sourceTag) {
      sectionData.multiSectionType = beamMultiSection[0].sourceTag;
    }
    return;
  }

  // 多断面: NotSame が 2個以上
  if (notSame && notSame.length >= 2) {
    // 2断面 or 3+断面
    sectionData.mode = notSame.length === 2 ? 'double' : 'multi';
    sectionData.shapes = notSame.map(variant => ({
      pos: variant.position || variant.pos || 'UNKNOWN',
      shapeName: variant.shape,
      variant: variant
    }));
    return;
  }

  // 単一の多断面要素（通常はありえないが、念のため）
  if (beamMultiSection && beamMultiSection.length === 1) {
    sectionData.mode = 'single';
    sectionData.shapes = [{
      pos: beamMultiSection[0].position || beamMultiSection[0].pos || 'CENTER',
      shapeName: beamMultiSection[0].shape,
      variant: beamMultiSection[0]
    }];
    return;
  }

  // NotSame が 1個のみ（通常はありえないが、念のため）
  if (notSame && notSame.length === 1) {
    sectionData.mode = 'single';
    sectionData.shapes = [{
      pos: notSame[0].position || notSame[0].pos || 'SAME',
      shapeName: notSame[0].shape,
      variant: notSame[0]
    }];
    return;
  }

  // デフォルト: mode を明示的に single に設定
  if (!sectionData.mode) {
    sectionData.mode = 'single';
  }
}

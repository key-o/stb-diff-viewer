/**
 * @fileoverview 統一断面抽出エンジン
 *
 * 設定駆動による統一的な断面データ抽出機能を提供します。
 * 従来の個別関数（extractColumnSections等）を統合し、
 * 重複コードを排除した効率的な実装を実現します。
 */

import { SECTION_CONFIG } from "../config/sectionConfig.js";
import { deriveDimensionsFromAttributes } from "../common/dimensionNormalizer.js";
import { ensureUnifiedSectionType } from "../common/sectionTypeUtil.js";
import { SameNotSameProcessor } from "./SameNotSameProcessor.js";

// STB 名前空間（querySelector がヒットしない場合にフォールバック）
const STB_NS = "https://www.building-smart.or.jp/dl";

/**
 * 全要素タイプの断面データを一括抽出
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @returns {Object} 全断面データマップ {columnSections: Map, beamSections: Map, braceSections: Map}
 */
export function extractAllSections(xmlDoc) {
  if (!xmlDoc) {
    console.warn("extractAllSections: xmlDoc is null or undefined");
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
        if (typeof xmlDoc.getElementsByTagNameNS === "function") {
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
  const id = element.getAttribute("id");
  const name = element.getAttribute("name");
  const idSteel = element.getAttribute("id_steel");
  const steelFigureInfo = extractSteelFigureVariants(element, config);

  // ID必須チェック
  if (!id) {
    console.warn(
      "Skipping section due to missing id attribute:",
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
      extractShapeName(element, config),
  };

  if (idSteel) {
    sectionData.id_steel = idSteel;
    if (!sectionData.shapeName) sectionData.shapeName = idSteel;
  }

  if (steelFigureInfo) {
    if (steelFigureInfo.variants && steelFigureInfo.variants.length > 0) {
      sectionData.steelVariants = steelFigureInfo.variants;
    }
    if (steelFigureInfo.same || (steelFigureInfo.notSame && steelFigureInfo.notSame.length > 0)) {
      sectionData.sameNotSamePattern = {
        hasSame: Boolean(steelFigureInfo.same),
        notSameCount: steelFigureInfo.notSame.length,
      };
    }

    // 多断面ジオメトリ対応: mode と shapes フィールドを正規化
    normalizeSectionMode(sectionData, steelFigureInfo);
  }

  // RC / SRC / CFT などコンクリート図形寸法の抽出
  try {
    const concreteDims = extractConcreteDimensions(element, config);
    if (concreteDims) {
      sectionData.dimensions = {
        ...(sectionData.dimensions || {}),
        ...concreteDims,
      };

      // 断面タイプの推定（RC円形の優先、次にRC矩形のデフォルト）
      if (concreteDims.profile_hint === "CIRCLE") {
        sectionData.section_type = "CIRCLE";
      } else if (!sectionData.section_type && /_RC$/i.test(element.tagName)) {
        sectionData.section_type = "RECTANGLE";
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
      "extractSectionData: failed concrete dimension parse for",
      id,
      e
    );
  }

  // 断面タイプの正規化（section_type, profile_type, sectionType の統一）
  ensureUnifiedSectionType(sectionData);

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
          (typeof figureElement.querySelector === "function" &&
            figureElement.querySelector("*[shape]")) ||
          findFirstShapeElement(figureElement);
        if (shapeElement) {
          return shapeElement.getAttribute("shape");
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
    .join(", ");

  console.log(`Extracted sections - ${summary}`);
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
    if (!fig && typeof element.getElementsByTagNameNS === "function") {
      const nsList = element.getElementsByTagNameNS(STB_NS, figSel);
      fig = nsList && nsList[0];
    }
    if (!fig) {
      // タグ名で直接検索を試みる（querySelector が失敗する場合のフォールバック）
      const children = element.children;
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
        if (/Circle/i.test(c.tagName)) d.profile_hint = "CIRCLE";
        if (/Rect/i.test(c.tagName))
          d.profile_hint = d.profile_hint || "RECTANGLE";
        dims = dims ? { ...dims, ...d } : d;
      }
    }
    // fig 自身の属性も確認
    const selfDims = deriveDimensionsFromAttributes(fig.attributes);
    if (selfDims) {
      if (/Circle/i.test(fig.tagName)) selfDims.profile_hint = "CIRCLE";
      if (/Rect/i.test(fig.tagName))
        selfDims.profile_hint = selfDims.profile_hint || "RECTANGLE";
      dims = dims ? { ...dims, ...selfDims } : selfDims;
    }
  }
  return dims;
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
  if (typeof element.querySelector === "function") {
    try {
      figureElement = element.querySelector(selector);
    } catch (_) {
      figureElement = null;
    }
    if (figureElement) return figureElement;
  }
  if (typeof element.getElementsByTagNameNS === "function") {
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
    if (child.hasAttribute && child.hasAttribute("shape")) {
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

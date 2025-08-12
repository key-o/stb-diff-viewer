/**
 * @fileoverview 統一断面抽出エンジン
 *
 * 設定駆動による統一的な断面データ抽出機能を提供します。
 * 従来の個別関数（extractColumnSections等）を統合し、
 * 重複コードを排除した効率的な実装を実現します。
 */

import { SECTION_CONFIG } from "../config/sectionConfig.js";

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
    shapeName: extractShapeName(element, config),
  };

  if (idSteel) {
    sectionData.id_steel = idSteel;
    if (!sectionData.shapeName) sectionData.shapeName = idSteel;
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
      let figureElement = null;
      try {
        figureElement = element.querySelector(figureSelector);
      } catch (_) {
        figureElement = null;
      }
      if (
        !figureElement &&
        typeof element.getElementsByTagNameNS === "function"
      ) {
        const nsList = element.getElementsByTagNameNS(STB_NS, figureSelector);
        figureElement = nsList && nsList[0];
      }
      if (figureElement) {
        const shapeElement = figureElement.querySelector("*[shape]");
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
    if (!fig) continue;
    // 子要素内の shape を持つもの or 寸法属性を持つものを調査
    const candidates = Array.from(fig.children);
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

const WIDTH_ATTR_KEYS = [
  "width",
  "Width",
  "WIDTH",
  "B",
  "b",
  "outer_width",
  "overall_width",
  "X",
  "x",
];
const HEIGHT_ATTR_KEYS = [
  "height",
  "Height",
  "HEIGHT",
  "H",
  "h",
  "overall_depth",
  "overall_height",
  "depth",
  "Depth",
  "Y",
  "y",
  "A",
  "a",
];

function deriveDimensionsFromAttributes(attrMap) {
  if (!attrMap) return null;
  let w, h, t;
  for (const attr of Array.from(attrMap)) {
    const name = attr.name;
    const valStr = attr.value;
    if (!valStr) continue;
    const num = parseFloat(valStr);
    if (!isFinite(num)) continue;
    // 厳密一致 + 一部のパターン（width_X/width_Y, Width_X/Width_Y など）
    if (w === undefined) {
      if (WIDTH_ATTR_KEYS.includes(name)) {
        w = num;
      } else if (/^width_?X$/i.test(name)) {
        w = num;
      }
    }
    if (h === undefined) {
      if (HEIGHT_ATTR_KEYS.includes(name)) {
        h = num;
      } else if (/^width_?Y$/i.test(name)) {
        h = num;
      }
    }
    // 円形直径 D
    if (name === "D" || name === "d") {
      // 直径は width/height としても扱うが、後続で直径としても利用できるよう両方設定
      if (w === undefined) w = num;
      if (h === undefined) h = num;
      // 追加情報として diameter を格納（後で円判定に使用）
      if (!attrMap.diameter) {
        // attrMap はNamedNodeMapなので直接拡張せず、戻り値で設定
      }
      // 一時的にローカルスコープで保持し、返却時に追加
      var diameter_local = num;
      // 後段で out に追加
    }
    if (
      t === undefined &&
      (name === "t" || name === "thickness" || name === "t1")
    )
      t = num;
  }
  if (w === undefined && h === undefined) return null;
  const out = {};
  if (w !== undefined) out.width = w;
  if (h !== undefined) out.height = h;
  if (t !== undefined) out.thickness = t;
  if (out.height && !out.overall_depth) out.overall_depth = out.height;
  if (out.width && !out.overall_width) out.overall_width = out.width;
  if (typeof diameter_local === "number") {
    out.diameter = diameter_local;
  }
  return out;
}

/**
 * @fileoverview STB XMLパーサーモジュール
 *
 * このファイルは、ST-Bridge形式のXMLデータを解析する機能を提供します:
 * - XMLドキュメントの読み込みと解析
 * - 節点・柱・梁・床・壁などの構造要素の抽出
 * - 軸・階情報の抽出
 * - 座標データの正規化
 * - 構造要素の基本情報の整理
 *
 * このモジュールは、STBファイルからのデータ取得の基盤となり、
 * 3D表示やモデル比較のための前処理を担当します。
 */

// --- 定数 ---
const STB_NAMESPACE = "https://www.building-smart.or.jp/dl";

export function parseSTB(fileContent) {
  // STBファイルのパースロジックを実装
  // パースデータを返す
}

// --- XMLパース関数 ---
/**
 * XML文字列をDOMオブジェクトにパースする。
 * @param {string} xmlText - パースするXML文字列。
 * @returns {Document|null} パースされたXMLドキュメント、またはエラー時にnull。
 */
export function parseXml(xmlText) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "application/xml");
    const errorNode = doc.querySelector("parsererror");
    if (errorNode) {
      console.error("XML Parse Error:", errorNode.textContent);
      throw new Error("XMLファイルのパースに失敗しました。");
    }
    return doc;
  } catch (error) {
    console.error("XML パース中にエラー:", error);
    alert(`エラー: ${error.message}`);
    return null;
  }
}

// --- ノードマップ構築関数 ---
/**
 * XMLドキュメントからノード情報を読み取り、ノードIDと座標のマッピングを作成する。
 * @param {Document} doc - パースされたXMLドキュメント。
 * @returns {Map<string, {x: number, y: number, z: number}>} ノードIDをキー、座標オブジェクト(mm単位)を値とするMap。
 */
export function buildNodeMap(doc) {
  const nodeMap = new Map();
  if (!doc) return nodeMap;
  const nodes = doc.getElementsByTagNameNS(STB_NAMESPACE, "StbNode");
  for (const node of nodes) {
    const id = node.getAttribute("id");
    // ★★★ スケーリングを削除 ★★★
    const x = parseFloat(node.getAttribute("X"));
    const y = parseFloat(node.getAttribute("Y"));
    const z = parseFloat(node.getAttribute("Z"));
    if (id && !isNaN(x) && !isNaN(y) && !isNaN(z)) {
      nodeMap.set(id, { x, y, z });
    } else {
      console.warn(
        `Skipping invalid node data: id=${id}, X=${node.getAttribute(
          "X"
        )}, Y=${node.getAttribute("Y")}, Z=${node.getAttribute("Z")}`
      );
    }
  }
  console.log(`Built node map with ${nodeMap.size} nodes (in mm).`);
  return nodeMap;
}

// --- 階情報パース関数 ---
/**
 * XMLドキュメントから階情報をパースする。
 * この関数で取得した階情報（名前、高さ）は、ビュー上に階名やレベル線を表示するために使用できます。
 * @param {Document} doc - パースされたXMLドキュメント。
 * @returns {Array<{id: string, name: string, height: number}>} 階情報の配列（高さ(mm単位)でソート済み）。
 */
export function parseStories(doc) {
  if (!doc) return [];
  const stories = [...doc.getElementsByTagNameNS(STB_NAMESPACE, "StbStory")];
  const parsed = stories
    .map((s) => {
      const heightAttr = s.getAttribute("height");
      // ★★★ スケーリングを削除 ★★★
      const height = heightAttr !== null ? parseFloat(heightAttr) : NaN;
      return {
        id: s.getAttribute("id"),
        name: s.getAttribute("name"),
        height: height,
      };
    })
    .filter((s) => !isNaN(s.height)); // heightが有効なものだけフィルタリング
  console.log(`Parsed ${parsed.length} stories (in mm).`);
  return parsed.sort((a, b) => a.height - b.height);
}

// --- 通り芯情報パース関数 ---
/**
 * ST-Bridge XMLドキュメントから通り芯データをパースする。
 * <StbParallelAxes>内の<StbParallelAxis>を検索するように修正。
 * @param {XMLDocument} doc - パース済みのXMLドキュメント。
 * @returns {object} 軸データ ({ xAxes: [], yAxes: [] }) (距離はmm単位)。
 */
export function parseAxes(doc) {
  const namespace = "https://www.building-smart.or.jp/dl";
  const xAxes = [];
  const yAxes = [];

  // <StbParallelAxes> 要素をすべて取得
  const parallelAxesElements = doc.getElementsByTagNameNS(
    namespace,
    "StbParallelAxes"
  );

  for (let i = 0; i < parallelAxesElements.length; i++) {
    const parallelAxes = parallelAxesElements[i];
    const groupName = parallelAxes.getAttribute("group_name");
    // <StbParallelAxis> 要素を取得
    const axisElements = parallelAxes.getElementsByTagNameNS(
      namespace,
      "StbParallelAxis"
    );

    for (let j = 0; j < axisElements.length; j++) {
      const axis = axisElements[j];
      const name = axis.getAttribute("name");
      // ★★★ スケーリングを削除 ★★★
      const distance = parseFloat(axis.getAttribute("distance"));

      if (name && !isNaN(distance)) {
        if (groupName === "X") {
          xAxes.push({ name, distance });
        } else if (groupName === "Y") {
          yAxes.push({ name, distance });
        }
      } else {
        console.warn(
          `Skipping axis due to missing name or invalid distance: ID=${axis.getAttribute(
            "id"
          )}, Name=${name}, Distance=${axis.getAttribute("distance")}`
        );
      }
    }
  }

  // 距離でソート
  xAxes.sort((a, b) => a.distance - b.distance);
  yAxes.sort((a, b) => a.distance - b.distance);

  console.log(
    `Parsed ${xAxes.length} X-Axes and ${yAxes.length} Y-Axes (in mm).`
  );
  return { xAxes, yAxes };
}

// --- 要素パース関数 (汎用) ---
/**
 * 指定された要素タイプの要素をXMLドキュメントから取得する。
 * @param {Document} doc - パースされたXMLドキュメント。
 * @param {string} elementType - 取得する要素のタグ名 (例: "StbColumn")。
 * @returns {Array<Element>} 取得した要素の配列。
 */
export function parseElements(doc, elementType) {
  if (!doc) return [];
  return [...doc.getElementsByTagNameNS(STB_NAMESPACE, elementType)];
}

export function parseXML(fileContent) {
  // XMLファイルのパースロジックを実装
  // パースデータを返す
}

export function extractRelevantData(parsedData) {
  // パースデータから関連データを抽出するロジックを実装
  // 抽出データを返す
}

// --- 鋼材形状データ抽出関数 ---
/**
 * 鋼材形状データを抽出する
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Map} 鋼材名をキーとする形状データのマップ
 */
export function extractSteelSections(xmlDoc) {
  const steelSections = new Map();
  // StbSecSteel 要素を取得 (名前空間は考慮しないquerySelectorを使用)
  const steelSectionList = xmlDoc.querySelector("StbSecSteel");

  if (steelSectionList) {
    for (const steelEl of steelSectionList.children) {
      const name = steelEl.getAttribute("name");

      if (name) {
        const sectionData = {
          elementTag: steelEl.tagName,
          shapeTypeAttr: steelEl.getAttribute("type"),
          name: name,
        };

        for (const attr of steelEl.attributes) {
          if (attr.name !== "type" && attr.name !== "name") {
            sectionData[attr.name] = attr.value;
          }
        }

        steelSections.set(name, sectionData);
      } else {
        console.warn(
          `Skipping steel section due to missing name attribute:`,
          steelEl
        );
      }
    }
  } else {
    console.log("No StbSecSteel element found.");
  }
  console.log(`Extracted ${steelSections.size} steel sections.`);
  return steelSections;
}

// --- 柱断面データ抽出関数 ---
/**
 * 柱断面データを抽出する
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Map} 断面IDをキーとする断面データのマップ
 */
export function extractColumnSections(xmlDoc) {
  const columnSections = new Map();
  // 柱断面要素を取得 (名前空間は考慮しないquerySelectorAllを使用)
  const secColumnElements = xmlDoc.querySelectorAll(
    "StbSecColumn_RC, StbSecColumn_S, StbSecColumn_SRC, StbSecColumn_CFT"
  );

  for (const secEl of secColumnElements) {
    const id = secEl.getAttribute("id");
    if (!id) {
      console.warn(
        "Skipping column section due to missing id attribute:",
        secEl
      );
      continue; // IDがない場合はスキップ
    }

    const sectionType = secEl.tagName;
    let shapeName = null;
    let concreteShapeData = null;

    try {
      // エラーハンドリングを追加
      if (
        sectionType === "StbSecColumn_S" ||
        sectionType === "StbSecColumn_CFT"
      ) {
        const figureEl = secEl.querySelector(
          "StbSecSteelFigureColumn_S, StbSecSteelFigureColumn_CFT"
        );
        const shapeEl = figureEl?.querySelector("*[shape]"); // shape属性を持つ要素を探す
        shapeName = shapeEl?.getAttribute("shape");
      } else if (sectionType === "StbSecColumn_SRC") {
        const figureSteelEl = secEl.querySelector(
          "StbSecSteelFigureColumn_SRC"
        );
        const shapeSteelEl = figureSteelEl?.querySelector("*[shape]");
        shapeName = shapeSteelEl?.getAttribute("shape");

        const figureRcEl = secEl.querySelector("StbSecFigureColumn_SRC");
        const shapeRcEl = figureRcEl?.firstElementChild; // 最初の要素を取得
        if (shapeRcEl) {
          concreteShapeData = { type: shapeRcEl.tagName };
          for (const attr of shapeRcEl.attributes) {
            concreteShapeData[attr.name] = attr.value;
          }
        }
      } else if (sectionType === "StbSecColumn_RC") {
        const figureRcEl = secEl.querySelector("StbSecFigureColumn_RC");
        const shapeRcEl = figureRcEl?.firstElementChild; // 最初の要素を取得
        if (shapeRcEl) {
          concreteShapeData = { type: shapeRcEl.tagName };
          for (const attr of shapeRcEl.attributes) {
            concreteShapeData[attr.name] = attr.value;
          }
        }
      }

      columnSections.set(id, {
        id: id,
        sectionType: sectionType,
        shapeName: shapeName, // 鋼材形状名 (S, SRC, CFT の場合)
        concreteShapeData: concreteShapeData, // コンクリート形状データ (RC, SRC の場合)
      });
    } catch (error) {
      console.error(`Error processing column section id=${id}:`, error, secEl);
    }
  }
  console.log(`Extracted ${columnSections.size} column sections.`);
  return columnSections;
}

// --- 柱要素データ抽出関数 ---
/**
 * 柱要素データを抽出する
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Array} 柱要素データの配列
 */
export function extractColumnElements(xmlDoc) {
  const columnElementsData = [];
  // parseElements を使用して StbColumn 要素を取得 (名前空間考慮済み)
  const columnElements = parseElements(xmlDoc, "StbColumn");

  for (const colEl of columnElements) {
    const id = colEl.getAttribute("id");
    const idNodeBottom = colEl.getAttribute("id_node_bottom");
    const idNodeTop = colEl.getAttribute("id_node_top");
    const idSection = colEl.getAttribute("id_section");
    // 必要に応じて他の属性も取得 (例)
    // const name = colEl.getAttribute("name");
    // const kind = colEl.getAttribute("kind"); // 例: KIND_COLUMN
    // const rotate = colEl.getAttribute("rotate"); // 回転角 (degree)
    // const offset_x = colEl.getAttribute("offset_x"); // オフセット (mm)
    // const offset_y = colEl.getAttribute("offset_y"); // オフセット (mm)

    if (id && idNodeBottom && idNodeTop && idSection) {
      const elementData = {
        id: id,
        id_node_bottom: idNodeBottom,
        id_node_top: idNodeTop,
        id_section: idSection,
        // 他の属性もここに追加
        // name: name,
        // kind: kind,
        // rotate: rotate ? parseFloat(rotate) : 0,
        // offset_x: offset_x ? parseFloat(offset_x) : 0,
        // offset_y: offset_y ? parseFloat(offset_y) : 0,
      };
      columnElementsData.push(elementData);
    } else {
      console.warn(
        `Skipping column element due to missing required attributes: id=${id}`,
        colEl
      );
    }
  }
  console.log(`Extracted ${columnElementsData.length} column elements.`);
  return columnElementsData;
}

/**
 * 梁要素データを抽出する（汎用関数）
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @param {string} elementType - 要素タイプ（"StbBeam" または "StbGirder"）
 * @return {Array} 梁要素データの配列
 */
function extractBeamLikeElements(xmlDoc, elementType) {
  const elementsData = [];
  const elements = parseElements(xmlDoc, elementType);
  
  for (const el of elements) {
    const id = el.getAttribute("id");
    const idNodeStart = el.getAttribute("id_node_start");
    const idNodeEnd = el.getAttribute("id_node_end");
    const idSection = el.getAttribute("id_section");
    
    if (id && idNodeStart && idNodeEnd && idSection) {
      elementsData.push({
        id: id,
        id_node_start: idNodeStart,
        id_node_end: idNodeEnd,
        id_section: idSection,
      });
    } else {
      console.warn(
        `Skipping ${elementType} element due to missing required attributes: id=${id}`,
        el
      );
    }
  }
  
  console.log(`Extracted ${elementsData.length} ${elementType} elements.`);
  return elementsData;
}

/**
 * 梁要素データを抽出する
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Array} 梁要素データの配列
 */
export function extractBeamElements(xmlDoc) {
  return extractBeamLikeElements(xmlDoc, "StbBeam");
}

/**
 * 大梁要素データを抽出する
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Array} 大梁要素データの配列
 */
export function extractGirderElements(xmlDoc) {
  return extractBeamLikeElements(xmlDoc, "StbGirder");
}

/**
 * 梁断面データを抽出する
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Map} 断面IDをキーとする断面データのマップ
 */
export function extractBeamSections(xmlDoc) {
  const beamSections = new Map();
  // StbSecGirder, StbSecBeam 両方取得
  const secElements = xmlDoc.querySelectorAll(
    "StbSecGirder_RC, StbSecGirder_S, StbSecGirder_SRC, StbSecBeam_RC, StbSecBeam_S, StbSecBeam_SRC"
  );
  for (const secEl of secElements) {
    const id = secEl.getAttribute("id");
    if (!id) {
      console.warn("Skipping beam section due to missing id attribute:", secEl);
      continue;
    }
    const sectionType = secEl.tagName;
    let shapeName = null;
    // 鋼材名取得
    if (sectionType === "StbSecGirder_S" || sectionType === "StbSecBeam_S") {
      const figureEl = secEl.querySelector(
        "StbSecSteelFigureGirder_S, StbSecSteelFigureBeam_S"
      );
      const shapeEl = figureEl?.querySelector("*[shape]");
      shapeName = shapeEl?.getAttribute("shape");
    } else if (
      sectionType === "StbSecGirder_SRC" ||
      sectionType === "StbSecBeam_SRC"
    ) {
      const figureSteelEl = secEl.querySelector(
        "StbSecSteelFigureGirder_SRC, StbSecSteelFigureBeam_SRC"
      );
      const shapeSteelEl = figureSteelEl?.querySelector("*[shape]");
      shapeName = shapeSteelEl?.getAttribute("shape");
      // RC部材情報も必要なら追加
    } else if (
      sectionType === "StbSecGirder_RC" ||
      sectionType === "StbSecBeam_RC"
    ) {
      const figureRcEl = secEl.querySelector("StbSecFigureBeam_RC");
      const shapeRcEl = figureRcEl?.firstElementChild;
      let concreteShapeData = null;
      if (shapeRcEl) {
        concreteShapeData = { type: shapeRcEl.tagName };
        for (const attr of shapeRcEl.attributes) {
          concreteShapeData[attr.name] = attr.value;
        }
      }
      beamSections.set(id, {
        id: id,
        sectionType: sectionType,
        shapeName: null,
        concreteShapeData: concreteShapeData,
      });
      continue;
    }
    // RC/SRC/その他の属性も必要に応じて追加
    beamSections.set(id, {
      id: id,
      sectionType: sectionType,
      shapeName: shapeName,
      // 必要に応じて concreteShapeData など追加
    });
  }
  console.log(`Extracted ${beamSections.size} beam sections.`);
  return beamSections;
}

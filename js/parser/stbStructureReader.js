import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";
// ★★★ stbXmlParser からのインポートパス変更 ★★★
import { buildNodeMap, parseElements } from "./stbXmlParser.js"; // ★★★ パス修正 (./) ★★★

/**
 * ST-Bridge XMLデータを解析し、必要なデータ構造を作成
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Object} 解析結果を含むオブジェクト
 */
export function parseStbFile(xmlDoc) {
  // ★★★ DOMParser は削除 ★★★
  // const parser = new DOMParser();
  // const xmlDoc = parser.parseFromString(xmlString, "text/xml");

  // 1. 節点データの抽出 (IDをキーとするMap) - buildNodeMap を使用
  // ★★★ buildNodeMap を呼び出し、結果を THREE.Vector3 に変換 ★★★
  const nodeMapRaw = buildNodeMap(xmlDoc);
  const nodes = new Map();
  for (const [id, coords] of nodeMapRaw.entries()) {
    nodes.set(id, new THREE.Vector3(coords.x, coords.y, coords.z));
  }
  console.log("Nodes loaded (via buildNodeMap):", nodes.size);

  // 2. 鋼材形状データの抽出 (nameをキーとするMap)
  const steelSections = extractSteelSections(xmlDoc);
  console.log("Steel Sections loaded:", steelSections.size); // ★★★ .size を追加 ★★★

  // 3. 柱断面データの抽出 (IDをキーとするMap)
  const columnSections = extractColumnSections(xmlDoc);
  console.log("Column Sections loaded:", columnSections.size);

  // 4. 柱要素データの抽出
  const columnElements = extractColumnElements(xmlDoc);
  console.log("Column Elements loaded:", columnElements.length); // ★★★ .length を追加 ★★★

  return {
    nodes,
    steelSections,
    columnSections,
    columnElements,
  };
}

// ★★★ extractNodes 関数は削除 ★★★
// /**
//  * 節点データを抽出する
//  * @param {Document} xmlDoc - パース済みのXMLドキュメント
//  * @return {Map} 節点IDをキーとする節点座標データのマップ
//  */
// function extractNodes(xmlDoc) {
//   // ... (削除) ...
// }

/**
 * 鋼材形状データを抽出する
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Map} 鋼材名をキーとする形状データのマップ
 */
function extractSteelSections(xmlDoc) {
  const steelSections = new Map();
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
      }
    }
  }

  return steelSections;
}

/**
 * 柱断面データを抽出する
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Map} 断面IDをキーとする断面データのマップ
 */
function extractColumnSections(xmlDoc) {
  const columnSections = new Map();
  const secColumnElements = xmlDoc.querySelectorAll(
    "StbSecColumn_RC, StbSecColumn_S, StbSecColumn_SRC, StbSecColumn_CFT"
  );

  for (const secEl of secColumnElements) {
    const id = secEl.getAttribute("id");
    const sectionType = secEl.tagName;
    let shapeName = null;
    let concreteShapeData = null;

    if (
      sectionType === "StbSecColumn_S" ||
      sectionType === "StbSecColumn_CFT"
    ) {
      const figureEl = secEl.querySelector(
        "StbSecSteelFigureColumn_S, StbSecSteelFigureColumn_CFT"
      );
      const shapeEl = figureEl?.querySelector("*[shape]");
      shapeName = shapeEl?.getAttribute("shape");
    } else if (sectionType === "StbSecColumn_SRC") {
      const figureSteelEl = secEl.querySelector("StbSecSteelFigureColumn_SRC");
      const shapeSteelEl = figureSteelEl?.querySelector("*[shape]");
      shapeName = shapeSteelEl?.getAttribute("shape");
      const figureRcEl = secEl.querySelector("StbSecFigureColumn_SRC");
      const shapeRcEl = figureRcEl?.firstElementChild;
      if (shapeRcEl) {
        concreteShapeData = { type: shapeRcEl.tagName };
        for (const attr of shapeRcEl.attributes) {
          concreteShapeData[attr.name] = attr.value;
        }
      }
    } else if (sectionType === "StbSecColumn_RC") {
      const figureRcEl = secEl.querySelector("StbSecFigureColumn_RC");
      const shapeRcEl = figureRcEl?.firstElementChild;
      if (shapeRcEl) {
        concreteShapeData = { type: shapeRcEl.tagName };
        for (const attr of shapeRcEl.attributes) {
          concreteShapeData[attr.name] = attr.value;
        }
      }
    }

    if (id) {
      columnSections.set(id, {
        id: id,
        sectionType: sectionType,
        shapeName: shapeName,
        concreteShapeData: concreteShapeData,
      });
    }
  }

  return columnSections;
}

/**
 * 柱要素データを抽出する
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Array} 柱要素データの配列（各要素に節点IDを追加）
 */
function extractColumnElements(xmlDoc) {
  const columnElementsData = [];
  // ★★★ parseElements を使用して柱要素を取得 ★★★
  const columnElements = parseElements(xmlDoc, "StbColumn");

  for (const colEl of columnElements) {
    const id = colEl.getAttribute("id");
    const idNodeBottom = colEl.getAttribute("id_node_bottom");
    const idNodeTop = colEl.getAttribute("id_node_top");
    const idSection = colEl.getAttribute("id_section");
    // 必要に応じて他の属性も取得
    // const name = colEl.getAttribute("name");
    // const kind = colEl.getAttribute("kind");
    // const rotate = colEl.getAttribute("rotate");
    // const offset_x = colEl.getAttribute("offset_x");
    // const offset_y = colEl.getAttribute("offset_y");
    // const condition_bottom = colEl.getAttribute("condition_bottom");
    // const condition_top = colEl.getAttribute("condition_top");
    // const member_division_bottom = colEl.getAttribute("member_division_bottom");
    // const member_division_top = colEl.getAttribute("member_division_top");

    if (id && idNodeBottom && idNodeTop && idSection) {
      columnElementsData.push({
        id: id,
        id_node_bottom: idNodeBottom,
        id_node_top: idNodeTop,
        id_section: idSection,
        // 他の属性もここに追加
        // name: name,
        // kind: kind,
        // rotate: rotate ? parseFloat(rotate) : 0,
        // ...
        // 元の要素への参照を保持したい場合は追加
        // element: colEl
      });
    }
  }
  return columnElementsData;
}

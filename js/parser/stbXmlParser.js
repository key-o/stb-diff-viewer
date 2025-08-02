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
      // デバッグ出力（最初の5個のノードのみ）
      if (nodeMap.size <= 5) {
        console.log(`Node ${id}: X=${x}, Y=${y}, Z=${z} (mm)`);
      }
    } else {
      console.warn(
        `Skipping invalid node data: id=${id}, X=${node.getAttribute(
          "X"
        )}, Y=${node.getAttribute("Y")}, Z=${node.getAttribute("Z")}`
      );
    }
  }
  console.log(`Built node map with ${nodeMap.size} nodes (in mm).`);

  // デバッグ用：ノード座標の範囲を出力
  if (nodeMap.size > 0) {
    const coords = Array.from(nodeMap.values());
    const xRange = {
      min: Math.min(...coords.map((c) => c.x)),
      max: Math.max(...coords.map((c) => c.x)),
    };
    const yRange = {
      min: Math.min(...coords.map((c) => c.y)),
      max: Math.max(...coords.map((c) => c.y)),
    };
    const zRange = {
      min: Math.min(...coords.map((c) => c.z)),
      max: Math.max(...coords.map((c) => c.z)),
    };
    console.log(
      `Node coordinate ranges: X:[${xRange.min.toFixed(
        0
      )}, ${xRange.max.toFixed(0)}], Y:[${yRange.min.toFixed(
        0
      )}, ${yRange.max.toFixed(0)}], Z:[${zRange.min.toFixed(
        0
      )}, ${zRange.max.toFixed(0)}] (mm)`
    );
  }

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

  // デバッグ出力（最初の3個の階のみ）
  parsed.slice(0, 3).forEach((story) => {
    console.log(`Story ${story.name}: height=${story.height} (mm)`);
  });

  console.log(`Parsed ${parsed.length} stories (in mm).`);

  // デバッグ用：階の高さ範囲を出力
  if (parsed.length > 0) {
    const heights = parsed.map((story) => story.height);
    const heightRange = {
      min: Math.min(...heights),
      max: Math.max(...heights),
    };
    console.log(
      `Story height range: [${heightRange.min.toFixed(
        0
      )}, ${heightRange.max.toFixed(0)}] (mm)`
    );
  }

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
      const id = axis.getAttribute("id") || `${groupName}_${j}`;
      const name = axis.getAttribute("name");
      // ★★★ スケーリングを削除 ★★★
      const distance = parseFloat(axis.getAttribute("distance"));

      if (name && !isNaN(distance)) {
        if (groupName === "X") {
          xAxes.push({ id, name, distance });
          // デバッグ出力（最初の3個の軸のみ）
          if (xAxes.length <= 3) {
            console.log(`X-Axis ${name}: distance=${distance} (mm)`);
          }
        } else if (groupName === "Y") {
          yAxes.push({ id, name, distance });
          // デバッグ出力（最初の3個の軸のみ）
          if (yAxes.length <= 3) {
            console.log(`Y-Axis ${name}: distance=${distance} (mm)`);
          }
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

  // デバッグ用：軸の座標範囲を出力
  if (xAxes.length > 0) {
    const xDistances = xAxes.map((axis) => axis.distance);
    const xRange = {
      min: Math.min(...xDistances),
      max: Math.max(...xDistances),
    };
    console.log(
      `X-axis distance range: [${xRange.min.toFixed(0)}, ${xRange.max.toFixed(
        0
      )}] (mm)`
    );
  }
  if (yAxes.length > 0) {
    const yDistances = yAxes.map((axis) => axis.distance);
    const yRange = {
      min: Math.min(...yDistances),
      max: Math.max(...yDistances),
    };
    console.log(
      `Y-axis distance range: [${yRange.min.toFixed(0)}, ${yRange.max.toFixed(
        0
      )}] (mm)`
    );
  }

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

// --- 統一断面抽出エンジンのエクスポート ---
export { extractAllSections } from "./sectionExtractor.js";

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
    const name = colEl.getAttribute("name");
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
        name: name,
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
    const name = el.getAttribute("name");

    if (id && idNodeStart && idNodeEnd && idSection) {
      elementsData.push({
        id: id,
        id_node_start: idNodeStart,
        id_node_end: idNodeEnd,
        id_section: idSection,
        name: name,
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

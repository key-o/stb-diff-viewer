// このファイルはSTBおよびXMLファイルをパースするための関数を含みます。
// ファイルから関連データを抽出し、さらなる処理のために提供します。

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

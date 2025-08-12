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

// --- XMLパース関数 ---
// parseXml関数は削除されました（未使用のため）

// --- ノードマップ構築関数 ---
/**
 * XMLドキュメントからノード情報を読み取り、ノードIDと座標のマッピングを作成する。
 *
 * **用途**:
 * - 3D立体表示: 柱・梁・ブレースのメッシュ配置座標として使用
 * - 線分表示: 構造線の端点座標として使用
 * - 要素間接続: 構造要素の結合部解析に使用
 *
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
 *
 * **用途**:
 * - 3D立体表示: 階レベル平面の立体表示・クリッピング平面設定
 * - 線分表示: 階高線・レベル線の2D表示
 * - UI制御: 階セレクターでの階別表示切り替え
 *
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
 *
 * **用途**:
 * - 3D立体表示: 通り芯の立体グリッド表示・参照平面設定
 * - 線分表示: 通り芯線の2D表示・建築図面風表示
 * - UI制御: 軸セレクターでの軸別表示切り替え
 *
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
 *
 * **用途**:
 * - 3D立体表示: メッシュジオメトリ生成の基礎データ
 * - 線分表示: 構造線生成の基礎データ
 * - 比較処理: モデルA・B間の要素差分解析
 *
 * @param {Document} doc - パースされたXMLドキュメント。
 * @param {string} elementType - 取得する要素のタグ名 (例: "StbColumn")。
 * @returns {Array<Element>} 取得した要素の配列。
 */
export function parseElements(doc, elementType) {
  if (!doc) return [];
  return [...doc.getElementsByTagNameNS(STB_NAMESPACE, elementType)];
}

// --- 鋼材形状データ抽出関数 ---
/**
 * 鋼材形状データを抽出する
 *
 * **用途**:
 * - 3D立体表示: H鋼・角鋼管などの正確な断面形状メッシュ生成
 * - 線分表示: 簡略化された構造線の太さ・スタイル設定
 * - 断面設計: 構造計算・断面性能表示
 *
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Map} 鋼材名をキーとする形状データのマップ
 */
export function extractSteelSections(xmlDoc) {
  const steelSections = new Map();
  // xmlDoc 安全性チェック
  if (!xmlDoc) {
    console.warn("extractSteelSections: xmlDoc is null or undefined");
    return steelSections;
  }
  // StbSecSteel 要素を取得（まずは querySelector、なければ NS 検索にフォールバック）
  let steelSectionList =
    (typeof xmlDoc.querySelector === "function" &&
      xmlDoc.querySelector("StbSecSteel")) ||
    (typeof xmlDoc.getElementsByTagNameNS === "function" &&
      xmlDoc.getElementsByTagNameNS(STB_NAMESPACE, "StbSecSteel")[0]) ||
    null;

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

        // 形状タイプ(kind_struct)をタグ/属性から推定
        const tag = (sectionData.elementTag || "").toUpperCase();
        let kind = undefined;
        if (tag.includes("-H")) kind = "H";
        else if (tag.includes("-BOX")) kind = "BOX";
        else if (tag.includes("PIPE")) kind = "PIPE";
        else if (tag.includes("-C")) kind = "C";
        else if (tag.includes("-L")) kind = "L";
        else if (tag.includes("-T")) kind = "T";
        // type属性で判別できる場合の簡易対応（例: BCR は角形鋼管系としてBOXとみなす）
        const typeAttr = (sectionData.shapeTypeAttr || "").toUpperCase();
        if (!kind && typeAttr === "BCR") kind = "BOX";
        if (kind) sectionData.kind_struct = kind;

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
 *
 * **用途**:
 * - 3D立体表示: 縦方向メッシュ（底部ノード→頂部ノード）生成
 * - 線分表示: 垂直構造線（Z軸方向ライン）生成
 * - 構造解析: 柱の軸力・曲げ解析用データ
 *
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

    // ST-Bridgeのインスタンスオフセット（柱用: bottom/top, X/Y）
    const offset_bottom_X = colEl.getAttribute("offset_bottom_X");
    const offset_bottom_Y = colEl.getAttribute("offset_bottom_Y");
    const offset_top_X = colEl.getAttribute("offset_top_X");
    const offset_top_Y = colEl.getAttribute("offset_top_Y");

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
        // インスタンスオフセット（存在すれば数値で格納、なければ0）
        offset_bottom_X: offset_bottom_X ? parseFloat(offset_bottom_X) : 0,
        offset_bottom_Y: offset_bottom_Y ? parseFloat(offset_bottom_Y) : 0,
        offset_top_X: offset_top_X ? parseFloat(offset_top_X) : 0,
        offset_top_Y: offset_top_Y ? parseFloat(offset_top_Y) : 0,
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
 *
 * **用途**:
 * - 3D立体表示: 水平方向メッシュ（始点ノード→終点ノード）生成
 * - 線分表示: 水平構造線（XY平面ライン）生成
 * - 構造解析: 梁のせん断・曲げ解析用データ
 *
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

    // ST-Bridgeのインスタンスオフセット（梁・大梁・ブレースで共通的に現れる可能性あり）
    const offset_start_X = el.getAttribute("offset_start_X");
    const offset_start_Y = el.getAttribute("offset_start_Y");
    const offset_start_Z = el.getAttribute("offset_start_Z");
    const offset_end_X = el.getAttribute("offset_end_X");
    const offset_end_Y = el.getAttribute("offset_end_Y");
    const offset_end_Z = el.getAttribute("offset_end_Z");

    if (id && idNodeStart && idNodeEnd && idSection) {
      const data = {
        id: id,
        id_node_start: idNodeStart,
        id_node_end: idNodeEnd,
        id_section: idSection,
        name: name,
      };

      // オフセット属性が1つでも存在すれば数値化して格納
      if (
        offset_start_X !== null ||
        offset_start_Y !== null ||
        offset_start_Z !== null ||
        offset_end_X !== null ||
        offset_end_Y !== null ||
        offset_end_Z !== null
      ) {
        data.offset_start_X = offset_start_X ? parseFloat(offset_start_X) : 0;
        data.offset_start_Y = offset_start_Y ? parseFloat(offset_start_Y) : 0;
        data.offset_start_Z = offset_start_Z ? parseFloat(offset_start_Z) : 0;
        data.offset_end_X = offset_end_X ? parseFloat(offset_end_X) : 0;
        data.offset_end_Y = offset_end_Y ? parseFloat(offset_end_Y) : 0;
        data.offset_end_Z = offset_end_Z ? parseFloat(offset_end_Z) : 0;
      }

      elementsData.push(data);
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
 *
 * **対象**: 小梁（構造的に主要でない水平要素）
 * **用途**: BeamLike要素として extractBeamLikeElements() により処理
 *
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Array} 梁要素データの配列
 */
export function extractBeamElements(xmlDoc) {
  return extractBeamLikeElements(xmlDoc, "StbBeam");
}

/**
 * 大梁要素データを抽出する
 *
 * **対象**: 大梁（構造的に主要な水平要素）
 * **用途**: BeamLike要素として extractBeamLikeElements() により処理
 *
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Array} 大梁要素データの配列
 */
export function extractGirderElements(xmlDoc) {
  return extractBeamLikeElements(xmlDoc, "StbGirder");
}

/**
 * ブレース要素データを抽出する
 *
 * **対象**: 斜材・筋交い（耐震・耐風要素）
 * **用途**:
 * - 3D立体表示: 斜方向メッシュ（任意角度ライン）生成
 * - 線分表示: 斜構造線（対角ライン）生成
 * - 構造解析: ブレースの軸力解析用データ
 *
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Array} ブレース要素データの配列
 */
export function extractBraceElements(xmlDoc) {
  return extractBeamLikeElements(xmlDoc, "StbBrace");
}

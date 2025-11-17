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
  const nodes = parseElements(doc, "StbNode");
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
        console.log(`ノード ${id}: X=${x}, Y=${y}, Z=${z} (mm)`);
      }
    } else {
      console.warn(
        `無効なノードデータをスキップします: id=${id}, X=${node.getAttribute(
          "X"
        )}, Y=${node.getAttribute("Y")}, Z=${node.getAttribute("Z")}`
      );
    }
  }
  console.log(`${nodeMap.size}個のノードでノードマップを構築しました (mm単位)。`);

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
      `ノード座標範囲: X:[${xRange.min.toFixed(
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
  const stories = parseElements(doc, "StbStory");
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
  const parallelAxesElements = parseElements(doc, "StbParallelAxes");

  for (let i = 0; i < parallelAxesElements.length; i++) {
    const parallelAxes = parallelAxesElements[i];
    const groupName = parallelAxes.getAttribute("group_name");
    // <StbParallelAxis> 要素を取得
    const axisElements = parallelAxes.getElementsByTagName
      ? Array.from(parallelAxes.getElementsByTagName("StbParallelAxis"))
      : [];

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

  // getElementsByTagNameNS がサポートされている場合は使用
  if (typeof doc.getElementsByTagNameNS === 'function') {
    try {
      const elements = doc.getElementsByTagNameNS(STB_NAMESPACE, elementType);
      // 結果が iterable かチェック
      if (elements && typeof elements[Symbol.iterator] === 'function') {
        return [...elements];
      }
    } catch (e) {
      // フォールバックへ
    }
  }

  // フォールバック: getElementsByTagName を使用（名前空間なし）
  if (typeof doc.getElementsByTagName === 'function') {
    const elements = doc.getElementsByTagName(elementType);
    if (elements) {
      return Array.from(elements);
    }
  }

  return [];
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
  // StbSecSteel 要素を取得（StbSecSteel または StbSecSteel_S）
  let steelSectionList = null;

  // querySelector で試行（StbSecSteel_S を優先）
  if (typeof xmlDoc.querySelector === "function") {
    steelSectionList = xmlDoc.querySelector("StbSecSteel_S") ||
                       xmlDoc.querySelector("StbSecSteel");
  }

  // parseElements フォールバック（StbSecSteel_S を優先）
  if (!steelSectionList) {
    steelSectionList = parseElements(xmlDoc, "StbSecSteel_S")[0] ||
                       parseElements(xmlDoc, "StbSecSteel")[0] ||
                       null;
  }

  if (steelSectionList) {
    const children = steelSectionList.children || steelSectionList.childNodes || [];

    // Filter to only element nodes (nodeType === 1)
    const elementChildren = Array.from(children).filter(node => node.nodeType === 1);

    for (const steelEl of elementChildren) {
      const name = steelEl.getAttribute("name");

      if (name) {
        const sectionData = {
          elementTag: steelEl.tagName,
          shapeTypeAttr: steelEl.getAttribute("type"),
          name: name,
        };

        const attrs = Array.from(steelEl.attributes || []);
        for (const attr of attrs) {
          if (attr.name !== "type" && attr.name !== "name") {
            sectionData[attr.name] = attr.value;
          }
        }

        // 形状タイプ(kind_struct)をタグ/属性から推定
        const tag = (sectionData.elementTag || "").toUpperCase();
        let kind = undefined;
        if (tag.includes("_H")) kind = "H";
        else if (tag.includes("_BOX")) kind = "BOX";
        else if (tag.includes("PIPE")) kind = "PIPE";
        else if (tag.includes("_C")) kind = "C";
        else if (tag.includes("_L")) kind = "L";
        else if (tag.includes("_T")) kind = "T";
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

    // ハンチ長さ属性（多断面ジオメトリ用）
    const haunch_start = el.getAttribute("haunch_start");
    const haunch_end = el.getAttribute("haunch_end");

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

      // ハンチ長さ属性が存在すれば数値化して格納（多断面ジオメトリ用）
      if (haunch_start !== null || haunch_end !== null) {
        data.haunch_start = haunch_start ? parseFloat(haunch_start) : 0;
        data.haunch_end = haunch_end ? parseFloat(haunch_end) : 0;
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

/**
 * 間柱要素データを抽出する
 *
 * **対象**: 間柱（壁内の縦材）
 * **用途**:
 * - 3D立体表示: 縦方向メッシュ（底部ノード→頂部ノード）生成
 * - 線分表示: 垂直構造線（Z軸方向ライン）生成
 * - 構造解析: 間柱の軸力・曲げ解析用データ
 *
 * 間柱(Post)は柱(Column)と同じ構造（id_node_bottom, id_node_top）を持つため、
 * 同様の処理を行います。
 *
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Array} 間柱要素データの配列
 */
export function extractPostElements(xmlDoc) {
  const postElementsData = [];
  // parseElements を使用して StbPost 要素を取得 (名前空間考慮済み)
  const postElements = parseElements(xmlDoc, "StbPost");

  for (const postEl of postElements) {
    const id = postEl.getAttribute("id");
    const idNodeBottom = postEl.getAttribute("id_node_bottom");
    const idNodeTop = postEl.getAttribute("id_node_top");
    const idSection = postEl.getAttribute("id_section");
    const name = postEl.getAttribute("name");

    // ST-Bridgeのインスタンスオフセット（間柱用: bottom/top, X/Y）
    const offset_bottom_X = postEl.getAttribute("offset_bottom_X");
    const offset_bottom_Y = postEl.getAttribute("offset_bottom_Y");
    const offset_top_X = postEl.getAttribute("offset_top_X");
    const offset_top_Y = postEl.getAttribute("offset_top_Y");

    if (id && idNodeBottom && idNodeTop && idSection) {
      const elementData = {
        id: id,
        id_node_bottom: idNodeBottom,
        id_node_top: idNodeTop,
        id_section: idSection,
        name: name,
        // インスタンスオフセット（存在すれば数値で格納、なければ0）
        offset_bottom_X: offset_bottom_X ? parseFloat(offset_bottom_X) : 0,
        offset_bottom_Y: offset_bottom_Y ? parseFloat(offset_bottom_Y) : 0,
        offset_top_X: offset_top_X ? parseFloat(offset_top_X) : 0,
        offset_top_Y: offset_top_Y ? parseFloat(offset_top_Y) : 0,
      };
      postElementsData.push(elementData);
    } else {
      console.warn(
        `Skipping post element due to missing required attributes: id=${id}`,
        postEl
      );
    }
  }
  console.log(`Extracted ${postElementsData.length} post elements.`);
  return postElementsData;
}

// ==============================================================================
// 杭・基礎要素の抽出関数
// ==============================================================================

/**
 * 杭(Pile)要素データを抽出する
 *
 * 杭は柱と同じ構造（id_node_bottom, id_node_top）を持つ垂直要素です。
 * 地中に配置されるため、bottomノードは地盤面以下のZ座標を持ちます。
 *
 * **用途**:
 * - 3D立体表示: 杭の円形・矩形メッシュ生成
 * - 線分表示: 杭の中心線表示
 * - 構造解析: 杭の支持力・沈下解析用データ
 *
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Array} 杭要素データの配列
 */
export function extractPileElements(xmlDoc) {
  const pileElementsData = [];
  const pileElements = parseElements(xmlDoc, "StbPile");

  for (const pileEl of pileElements) {
    const id = pileEl.getAttribute("id");
    const idSection = pileEl.getAttribute("id_section");
    const name = pileEl.getAttribute("name");
    const kind = pileEl.getAttribute("kind"); // 杭種別（例: KIND_PHC, KIND_ST）
    const kindStructure = pileEl.getAttribute("kind_structure"); // 杭種別（例: PC, ST, CAST）

    // 2ノード形式の属性
    const idNodeBottom = pileEl.getAttribute("id_node_bottom");
    const idNodeTop = pileEl.getAttribute("id_node_top");

    // 1ノード形式の属性
    const idNode = pileEl.getAttribute("id_node");
    const levelTop = pileEl.getAttribute("level_top"); // 杭底部の深度（通常マイナス値）
    const lengthAll = pileEl.getAttribute("length_all"); // 杭の全長（mm）

    // ST-Bridgeの杭用オフセット（bottom/top, X/Y）
    const offset_bottom_X = pileEl.getAttribute("offset_bottom_X");
    const offset_bottom_Y = pileEl.getAttribute("offset_bottom_Y");
    const offset_top_X = pileEl.getAttribute("offset_top_X");
    const offset_top_Y = pileEl.getAttribute("offset_top_Y");

    // 1ノード形式用のオフセット
    const offsetX = pileEl.getAttribute("offset_X");
    const offsetY = pileEl.getAttribute("offset_Y");

    // 回転角度（度）
    const rotate = pileEl.getAttribute("rotate");

    // 2ノード形式の場合
    if (id && idNodeBottom && idNodeTop && idSection) {
      const elementData = {
        id: id,
        id_node_bottom: idNodeBottom,
        id_node_top: idNodeTop,
        id_section: idSection,
        name: name,
        kind: kind,
        kind_structure: kindStructure,
        // 杭の全長
        length_all: lengthAll ? parseFloat(lengthAll) : undefined,
        // インスタンスオフセット
        offset_bottom_X: offset_bottom_X ? parseFloat(offset_bottom_X) : 0,
        offset_bottom_Y: offset_bottom_Y ? parseFloat(offset_bottom_Y) : 0,
        offset_top_X: offset_top_X ? parseFloat(offset_top_X) : 0,
        offset_top_Y: offset_top_Y ? parseFloat(offset_top_Y) : 0,
        // 回転
        rotate: rotate ? parseFloat(rotate) : 0,
        // 形式フラグ
        pileFormat: "2node",
      };
      pileElementsData.push(elementData);
    }
    // 1ノード形式の場合（id_node + level_top）
    else if (id && idNode && idSection && levelTop) {
      const elementData = {
        id: id,
        id_node: idNode, // 杭頭部のノード
        level_top: parseFloat(levelTop), // 杭底部の深度（level_topはSTBでは底部を意味する）
        id_section: idSection,
        name: name,
        kind: kind,
        kind_structure: kindStructure,
        // 杭の全長
        length_all: lengthAll ? parseFloat(lengthAll) : undefined,
        // 1ノード形式用のオフセット
        offset_X: offsetX ? parseFloat(offsetX) : 0,
        offset_Y: offsetY ? parseFloat(offsetY) : 0,
        // 回転
        rotate: rotate ? parseFloat(rotate) : 0,
        // 形式フラグ
        pileFormat: "1node",
      };
      pileElementsData.push(elementData);
    } else {
      console.warn(
        `Skipping pile element due to missing required attributes: id=${id}, ` +
        `format detection: 2node(${!!idNodeBottom && !!idNodeTop}), ` +
        `1node(${!!idNode && !!levelTop})`,
        pileEl
      );
    }
  }
  console.log(`Extracted ${pileElementsData.length} pile elements.`);
  return pileElementsData;
}

/**
 * 基礎(Footing)要素データを抽出する
 *
 * 基礎は単一ノード（id_node）を参照し、level_bottom属性で底面レベルを指定します。
 * 柱・梁とは異なる配置方法を使用する1ノード要素です。
 *
 * **用途**:
 * - 3D立体表示: 基礎の直方体メッシュ生成
 * - 線分表示: 基礎の外形線表示
 * - 構造解析: 基礎の支持力・沈下解析用データ
 *
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Array} 基礎要素データの配列
 */
export function extractFootingElements(xmlDoc) {
  const footingElementsData = [];
  const footingElements = parseElements(xmlDoc, "StbFooting");

  for (const footingEl of footingElements) {
    const id = footingEl.getAttribute("id");
    const idNode = footingEl.getAttribute("id_node");
    const idSection = footingEl.getAttribute("id_section");
    const name = footingEl.getAttribute("name");

    // 基礎固有の属性
    const levelBottom = footingEl.getAttribute("level_bottom"); // 底面レベル（mm）
    const offsetX = footingEl.getAttribute("offset_X"); // X方向オフセット（mm）
    const offsetY = footingEl.getAttribute("offset_Y"); // Y方向オフセット（mm）
    const rotate = footingEl.getAttribute("rotate"); // 回転角度（度）

    if (id && idNode && idSection) {
      const elementData = {
        id: id,
        id_node: idNode,
        id_section: idSection,
        name: name,
        // 基礎固有属性
        level_bottom: levelBottom ? parseFloat(levelBottom) : 0,
        offset_X: offsetX ? parseFloat(offsetX) : 0,
        offset_Y: offsetY ? parseFloat(offsetY) : 0,
        rotate: rotate ? parseFloat(rotate) : 0,
      };
      footingElementsData.push(elementData);
    } else {
      console.warn(
        `Skipping footing element due to missing required attributes: id=${id}`,
        footingEl
      );
    }
  }
  console.log(`Extracted ${footingElementsData.length} footing elements.`);
  return footingElementsData;
}

/**
 * 基礎柱(FoundationColumn)要素データを抽出する
 *
 * 基礎柱は柱と同じ構造（id_node_bottom, id_node_top）を持つ垂直要素です。
 * 通常の柱と異なり、地中または基礎部分に配置されます。
 *
 * **用途**:
 * - 3D立体表示: 基礎柱のメッシュ生成
 * - 線分表示: 基礎柱の中心線表示
 * - 構造解析: 基礎柱の軸力・曲げ解析用データ
 *
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Array} 基礎柱要素データの配列
 */
export function extractFoundationColumnElements(xmlDoc) {
  const foundationColumnElementsData = [];
  const foundationColumnElements = parseElements(xmlDoc, "StbFoundationColumn");

  for (const fcEl of foundationColumnElements) {
    const id = fcEl.getAttribute("id");
    const idNodeBottom = fcEl.getAttribute("id_node_bottom");
    const idNodeTop = fcEl.getAttribute("id_node_top");
    const idSection = fcEl.getAttribute("id_section");
    const name = fcEl.getAttribute("name");

    // ST-Bridgeの基礎柱用オフセット（bottom/top, X/Y）
    const offset_bottom_X = fcEl.getAttribute("offset_bottom_X");
    const offset_bottom_Y = fcEl.getAttribute("offset_bottom_Y");
    const offset_top_X = fcEl.getAttribute("offset_top_X");
    const offset_top_Y = fcEl.getAttribute("offset_top_Y");

    // 回転角度（度）
    const rotate = fcEl.getAttribute("rotate");

    if (id && idNodeBottom && idNodeTop && idSection) {
      const elementData = {
        id: id,
        id_node_bottom: idNodeBottom,
        id_node_top: idNodeTop,
        id_section: idSection,
        name: name,
        // インスタンスオフセット
        offset_bottom_X: offset_bottom_X ? parseFloat(offset_bottom_X) : 0,
        offset_bottom_Y: offset_bottom_Y ? parseFloat(offset_bottom_Y) : 0,
        offset_top_X: offset_top_X ? parseFloat(offset_top_X) : 0,
        offset_top_Y: offset_top_Y ? parseFloat(offset_top_Y) : 0,
        // 回転
        rotate: rotate ? parseFloat(rotate) : 0,
      };
      foundationColumnElementsData.push(elementData);
    } else {
      console.warn(
        `Skipping foundation column element due to missing required attributes: id=${id}`,
        fcEl
      );
    }
  }
  console.log(
    `Extracted ${foundationColumnElementsData.length} foundation column elements.`
  );
  return foundationColumnElementsData;
}

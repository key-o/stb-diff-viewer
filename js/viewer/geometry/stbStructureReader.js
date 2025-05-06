/**
 * @fileoverview STB構造データ読み込みモジュール
 *
 * このファイルは、STB XMLデータから構造モデルの情報を抽出・加工します:
 * - ノード（節点）情報の抽出と座標変換
 * - 柱・梁・床・壁などの要素情報の抽出
 * - 断面情報の取得と整理
 * - 鋼材形状データの解析
 * - 3D形状生成に必要なデータ構造の作成
 *
 * このモジュールは、XMLデータから3D形状生成に必要な構造化データを
 * 提供し、columnGeneratorやbeamGeneratorの入力となります。
 *
 * ST-Bridge（略称STB）は、一般社団法人buildingSMART Japanが策定した
 * 建築構造分野のデータ交換フォーマットです。
 *
 * @module parser/stbStructureReader
 * @requires THREE
 * @requires ./stbXmlParser
 */

import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";
// ★★★ stbXmlParser からインポートする関数を追加 ★★★
import {
  buildNodeMap,
  parseElements,
  extractSteelSections, // 追加
  extractColumnSections, // 追加
  extractColumnElements, // 追加
  extractBeamElements, // 追加
  extractBeamSections, // 追加
  extractGirderElements, // 追加
} from "../../parser/stbXmlParser.js";

/**
 * ST-Bridge XMLデータを解析し、Three.jsで利用可能なデータ構造を作成
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Object} 解析結果を含むオブジェクト (Three.js形式のデータを含む)
 */
export function parseStbFile(xmlDoc) {
  // 1. 節点データの抽出と変換 (IDをキーとするMap<string, THREE.Vector3>)
  const nodeMapRaw = buildNodeMap(xmlDoc);
  const nodes = new Map();
  for (const [id, coords] of nodeMapRaw.entries()) {
    // ここで THREE.Vector3 に変換
    nodes.set(id, new THREE.Vector3(coords.x, coords.y, coords.z));
  }
  console.log("Nodes loaded and converted to THREE.Vector3:", nodes.size);

  // 2. 鋼材形状データの抽出 (stbXmlParserから呼び出し)
  const steelSections = extractSteelSections(xmlDoc);
  console.log("Steel Sections loaded:", steelSections.size);

  // 3. 柱断面データの抽出 (stbXmlParserから呼び出し)
  const columnSections = extractColumnSections(xmlDoc);
  console.log("Column Sections loaded:", columnSections.size);

  // 4. 柱要素データの抽出 (stbXmlParserから呼び出し)
  const columnElements = extractColumnElements(xmlDoc);
  console.log("Column Elements loaded:", columnElements.length);

  const beamElements = extractBeamElements(xmlDoc);
  console.log("Beam Elements loaded:", beamElements.length);

  const girderElements = extractGirderElements(xmlDoc);
  console.log("Girder Elements loaded:", girderElements.length);

  const beamSections = extractBeamSections(xmlDoc);
  console.log("Beam Sections loaded:", beamSections.size);

  return {
    nodes, // THREE.Vector3 の Map
    steelSections, // 汎用データ
    columnSections, // 汎用データ
    columnElements, // 汎用データ
    beamSections,
    beamElements,
    girderElements, // 大梁要素のデータ
  };
}

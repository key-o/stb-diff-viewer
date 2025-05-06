// filepath: c:\Users\aonki\Desktop\javascr\checker.js
import {
  parseXml,
  buildNodeMap,
  parseStories,
  parseAxes,
  extractSteelSections,
  extractColumnSections,
  extractColumnElements,
  extractBeamElements,
  extractGirderElements,
  extractBeamSections,
  // 必要に応じて他の関数もインポート
} from "./stbXmlParser.js"; // パスを実際の場所に合わせてください
import { loadStbXmlAutoEncoding } from "../viewer/utils/utils.js";

const fileInput = document.getElementById("stbFile");
const outputDiv = document.getElementById("output");

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) {
    outputDiv.textContent = "ファイルが選択されていません。";
    return;
  }

  outputDiv.textContent = "ファイルを読み込み中...";

  try {
    // ここで loadStbXmlAutoEncoding を使う
    const xmlDoc = await loadStbXmlAutoEncoding(file);
    if (!xmlDoc) {
      outputDiv.textContent =
        "XMLのパースに失敗しました。コンソールを確認してください。";
      return;
    }

    outputDiv.innerHTML = "<h2>パース結果:</h2>";

    displaySection("Nodes (座標)", buildNodeMap(xmlDoc));
    displaySection("Stories (階情報)", parseStories(xmlDoc));
    displaySection("Axes (通り芯)", parseAxes(xmlDoc));
    displaySection("Steel Sections (鋼材断面)", extractSteelSections(xmlDoc));
    displaySection("Column Sections (柱断面)", extractColumnSections(xmlDoc));
    displaySection("Column Elements (柱要素)", extractColumnElements(xmlDoc));
    displaySection("Beam Sections (梁断面)", extractBeamSections(xmlDoc));
    displaySection("Beam Elements (梁要素)", extractBeamElements(xmlDoc));
    displaySection("Girder Elements (大梁要素)", extractGirderElements(xmlDoc));
  } catch (error) {
    console.error("処理中にエラーが発生しました:", error);
    outputDiv.textContent = `エラーが発生しました: ${error.message}`;
  }
});

/**
 * 抽出したデータを整形して表示するヘルパー関数
 * @param {string} title - セクションのタイトル
 * @param {any} data - 表示するデータ (Map, Array, Objectなど)
 */
function displaySection(title, data) {
  const sectionDiv = document.createElement("div");
  sectionDiv.classList.add("data-section");

  const titleEl = document.createElement("h3");
  titleEl.textContent = title;
  sectionDiv.appendChild(titleEl);

  const contentEl = document.createElement("pre");
  let dataString;
  // MapオブジェクトはそのままJSON.stringifyできないため、配列に変換
  if (data instanceof Map) {
    dataString = JSON.stringify(Array.from(data.entries()), null, 2);
  } else {
    dataString = JSON.stringify(data, null, 2); // インデント付きで見やすく表示
  }
  contentEl.textContent = dataString;
  sectionDiv.appendChild(contentEl);

  outputDiv.appendChild(sectionDiv);
}

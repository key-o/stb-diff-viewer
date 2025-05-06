/**
 * @fileoverview モデルロード・管理モジュール
 *
 * このファイルは、STBモデルのロードと管理に関する機能を提供します:
 * - STBファイルの選択とロード
 * - モデルAとモデルBの読み込みと管理
 * - ファイルの解析とパース処理
 * - モデル比較の実行と結果の管理
 * - 3Dビューへのモデル適用
 * - ビュー状態の調整
 *
 * このモジュールは、ファイル選択からモデル表示までの一連の流れを
 * 制御し、他のモジュールと連携してモデルデータを適切に扱います。
 */

import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";
import {
  clearSceneContent,
  createOrUpdateGridHelper,
  materials,
  elementGroups,
  SUPPORTED_ELEMENTS,
  drawNodes,
  drawLineElements,
  drawPolyElements,
  drawAxes,
  drawStories,
  clearClippingPlanes,
  adjustCameraToFitModel,
} from "./viewer/index.js";
import { loadStbXmlAutoEncoding } from "./viewer/utils/utils.js";
import {
  buildNodeMap,
  parseStories,
  parseElements,
  parseAxes,
} from "./parser/stbXmlParser.js";
import {
  compareElements,
  lineElementKeyExtractor,
  polyElementKeyExtractor,
  nodeElementKeyExtractor,
} from "./comparator.js";
import {
  setGlobalStateForUI,
  updateStorySelector,
  updateAxisSelectors,
  updateAllLabelVisibility,
} from "./ui.js";
import { initViewModes, updateModelVisibility } from "./viewModes.js";

// モデル状態管理
let stories = [];
let nodeMapA = new Map();
let nodeMapB = new Map();
let nodeLabels = [];
let modelBounds = new THREE.Box3();
let axesData = { xAxes: [], yAxes: [] };
let docA = null;
let docB = null;
let modelsLoaded = false;

/**
 * モデルデータへの参照を取得
 * @returns {Object} モデルデータオブジェクト
 */
export function getModelData() {
  return {
    stories,
    nodeMapA,
    nodeMapB,
    nodeLabels,
    modelBounds,
    axesData,
    docA,
    docB,
    modelsLoaded,
  };
}

/**
 * モデルのロード状態を取得
 * @returns {boolean} モデルがロードされているかのフラグ
 */
export function isModelLoaded() {
  return modelsLoaded;
}

/**
 * モデルを読み込み比較する
 * @param {Function} requestRender - 再描画要求関数
 * @param {Object} options - カメラとコントロールの参照
 * @returns {Promise<boolean>} 処理結果
 */
export async function compareModels(requestRender, { camera, controls } = {}) {
  const fileAInput = document.getElementById("fileA");
  const fileBInput = document.getElementById("fileB");
  const fileA = fileAInput?.files[0];
  const fileB = fileBInput?.files[0];

  if (!fileA && !fileB) {
    alert("表示するモデルファイル（モデルAまたはモデルB）を選択してください。");
    return false;
  }

  const selectedElementTypes = [
    ...document.querySelectorAll(
      '#elementSelector input[name="elements"]:checked'
    ),
  ].map((cb) => cb.value);

  console.log("Selected elements for comparison:", selectedElementTypes);
  if (selectedElementTypes.length === 0) {
    console.warn("表示する要素が選択されていません。");
  }

  const compareButton = document.querySelector(
    '#overlay button[onclick="compareModels()"]'
  );
  if (compareButton) {
    compareButton.textContent = "読込/比較中...";
    compareButton.disabled = true;
  }
  document.getElementById("overlay").style.cursor = "wait";

  // 既存のシーン内容をクリア
  modelBounds = clearSceneContent(elementGroups, nodeLabels);
  stories.length = 0;
  nodeMapA.clear();
  nodeMapB.clear();
  axesData = { xAxes: [], yAxes: [] };
  nodeLabels = [];
  docA = null;
  docB = null;
  window.docA = null;
  window.docB = null;
  modelsLoaded = false;

  try {
    // ファイルAの処理
    if (fileA) {
      docA = await loadStbXmlAutoEncoding(fileA);
      if (!docA) throw new Error("モデルAの解析に失敗しました。");
      nodeMapA = buildNodeMap(docA);
      stories.push(...parseStories(docA));
      axesData = parseAxes(docA);
      window.docA = docA;
    }
    // ファイルBの処理
    if (fileB) {
      docB = await loadStbXmlAutoEncoding(fileB);
      if (!docB) throw new Error("モデルBの解析に失敗しました。");
      nodeMapB = buildNodeMap(docB);
      // モデルAがない場合のみ、モデルBから階と軸データを取得
      if (!fileA) {
        stories.length = 0;
        stories.push(...parseStories(docB));
        axesData = parseAxes(docB);
      }
      window.docB = docB;
    }

    // stories 配列から重複を除去し、高さでソート
    const uniqueStoriesMap = new Map();
    stories.forEach((s) => uniqueStoriesMap.set(s.height, s));
    stories = Array.from(uniqueStoriesMap.values()).sort(
      (a, b) => a.height - b.height
    );

    // 軸データを含む状態でUI状態を設定
    setGlobalStateForUI(nodeLabels, stories, axesData);

    // UIセレクタを更新
    updateStorySelector();
    updateAxisSelectors();

    // 要素ごとの比較と描画
    modelBounds = new THREE.Box3();
    nodeLabels = [];

    for (const elementType of SUPPORTED_ELEMENTS) {
      if (elementType === "Axis" || elementType === "Story") continue;

      const isSelected = selectedElementTypes.includes(elementType);
      // ラベルは常に作成
      const createLabels = true;

      console.log(
        `--- Processing ${elementType} (Selected: ${isSelected}, Creating Labels: ${createLabels}) ---`
      );

      const elementsA = parseElements(docA, "Stb" + elementType);
      const elementsB = parseElements(docB, "Stb" + elementType);
      let comparisonResult = null;
      let group = elementGroups[elementType];
      group.visible = isSelected;

      try {
        let createdLabels = [];
        if (elementType === "Node") {
          comparisonResult = compareElements(
            elementsA,
            elementsB,
            nodeMapA,
            nodeMapB,
            nodeElementKeyExtractor
          );
          createdLabels = drawNodes(
            comparisonResult,
            materials,
            group,
            createLabels,
            modelBounds
          );
        } else if (elementType === "Column") {
          comparisonResult = compareElements(
            elementsA,
            elementsB,
            nodeMapA,
            nodeMapB,
            (el, nm) =>
              lineElementKeyExtractor(el, nm, "id_node_bottom", "id_node_top")
          );
          createdLabels = drawLineElements(
            comparisonResult,
            materials,
            group,
            elementType,
            createLabels,
            modelBounds
          );
        } else if (elementType === "Girder" || elementType === "Beam") {
          comparisonResult = compareElements(
            elementsA,
            elementsB,
            nodeMapA,
            nodeMapB,
            (el, nm) =>
              lineElementKeyExtractor(el, nm, "id_node_start", "id_node_end")
          );
          createdLabels = drawLineElements(
            comparisonResult,
            materials,
            group,
            elementType,
            createLabels,
            modelBounds
          );
        } else if (elementType === "Slab" || elementType === "Wall") {
          comparisonResult = compareElements(
            elementsA,
            elementsB,
            nodeMapA,
            nodeMapB,
            (el, nm) => polyElementKeyExtractor(el, nm, "StbNodeIdOrder")
          );
          createdLabels = drawPolyElements(
            comparisonResult,
            materials,
            group,
            createLabels,
            modelBounds
          );
        }
        nodeLabels.push(...createdLabels);
      } catch (compError) {
        console.error(`Error comparing/drawing ${elementType}:`, compError);
      }

      if (comparisonResult) {
        console.log(
          `${elementType} - Matched: ${comparisonResult.matched.length}, Only A: ${comparisonResult.onlyA.length}, Only B: ${comparisonResult.onlyB.length}`
        );
      }
    }

    // 通り芯と階の描画
    const showAxes = selectedElementTypes.includes("Axis");
    // 通り芯のラベルは常に作成
    const createAxesLabels = true;
    elementGroups["Axis"].visible = showAxes;
    if (showAxes) {
      if (axesData.xAxes.length > 0 || axesData.yAxes.length > 0) {
        console.log(
          `--- Drawing Axes (Creating Labels: ${createAxesLabels}) ---`
        );
        const axisLabels = drawAxes(
          axesData,
          elementGroups["Axis"],
          modelBounds,
          createAxesLabels
        );
        nodeLabels.push(...axisLabels);
      }
    }

    const showStories = selectedElementTypes.includes("Story");
    // 階も常にラベル作成
    const createStoryLabels = true;
    elementGroups["Story"].visible = showStories;
    if (showStories && stories.length > 0) {
      console.log(
        `--- Drawing Stories (Creating Labels: ${createStoryLabels}) ---`
      );
      const storyLabels = drawStories(
        stories,
        elementGroups["Story"],
        modelBounds,
        createStoryLabels
      );
      nodeLabels.push(...storyLabels);
    }

    // すべてのラベルが追加された後にUI状態を設定
    setGlobalStateForUI(nodeLabels, stories, axesData);

    // ViewModes モジュールを初期化
    initViewModes({
      modelBounds,
      docA,
      docB,
      nodeMapA,
      nodeMapB,
    });

    // モデル表示状態に基づいて初期表示を更新
    updateModelVisibility(requestRender);

    createOrUpdateGridHelper(modelBounds);

    if (camera && controls) {
      adjustCameraToFitModel(modelBounds, camera, controls);
    }

    console.log("Clearing clipping after display...");
    clearClippingPlanes();

    // モデルが読み込まれたフラグをセット
    modelsLoaded = true;
    return true;
  } catch (error) {
    console.error("処理中にエラー:", error);
    alert(`エラーが発生しました: ${error.message || "不明なエラー"}`);
    modelBounds = clearSceneContent(elementGroups, nodeLabels);
    stories.length = 0;
    nodeMapA.clear();
    nodeMapB.clear();
    axesData = { xAxes: [], yAxes: [] };
    nodeLabels = [];
    createOrUpdateGridHelper(modelBounds);
    updateStorySelector();
    updateAxisSelectors();
    setGlobalStateForUI(nodeLabels, stories, axesData);
    docA = null;
    docB = null;
    window.docA = null;
    window.docB = null;
    modelsLoaded = false;
    return false;
  } finally {
    if (compareButton) {
      compareButton.textContent = modelsLoaded
        ? "モデル読み込み・再比較"
        : "モデルを表示/比較";
      compareButton.disabled = false;
    }
    document.getElementById("overlay").style.cursor = "default";
  }
}

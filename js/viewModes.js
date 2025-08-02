/**
 * @fileoverview 表示モード管理モジュール
 *
 * このファイルは、モデル表示に関する様々なモードと状態を管理します:
 * - 要素(柱、梁など)の表示形式(ライン/ソリッド)の切り替え
 * - モデルA/Bの表示/非表示の制御
 * - 表示モードに応じた要素の再描画処理
 * - モデル表示状態の更新と管理
 * - UI要素との連携によるモード切り替え
 *
 * 本モジュールは、STBモデルの視覚的表現方法を動的に変更するための
 * 状態管理とレンダリング制御を行います。
 */

import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";
import {
  materials,
  elementGroups,
  SUPPORTED_ELEMENTS,
} from "./viewer/index.js";
import { createColumnMeshes } from "./viewer/geometry/columnGenerator.js";
import { createBeamMeshes } from "./viewer/geometry/beamGenerator.js";
import { parseElements } from "./parser/stbXmlParser.js";
import { parseStbFile } from "./viewer/geometry/stbStructureReader.js";
import { compareElements, lineElementKeyExtractor } from "./comparator.js";
import { drawLineElements } from "./viewer/index.js";
import { updateUnifiedLabelVisibility } from "./ui/unifiedLabelManager.js";
import { removeLabelsForElementType, addLabelsToGlobalState } from "./ui.js";
import { createLabelSprite } from "./viewer/ui/labels.js";
import { generateUnifiedLabelText } from "./ui/unifiedLabelManager.js";
import { attachElementDataToLabel } from "./ui/labelRegeneration.js";

// 表示モード状態
let columnViewMode = "line"; // "line" または "solid"
let beamViewMode = "line"; // "line" または "solid"
let isModelAVisible = true;
let isModelBVisible = true;

// モデル情報の参照
let modelBounds = null;
let modelADocument = null;
let modelBDocument = null;
let nodeMapA = null;
let nodeMapB = null;

/**
 * 状態管理モジュールを初期化
 * @param {Object} modelData - モデルデータ参照
 */
export function initViewModes(modelData) {
  modelBounds = modelData.modelBounds;
  modelADocument = modelData.modelADocument;
  modelBDocument = modelData.modelBDocument;
  nodeMapA = modelData.nodeMapA;
  nodeMapB = modelData.nodeMapB;
}

/**
 * 柱の表示モードを取得
 * @returns {string} 現在の柱表示モード
 */
export function getColumnViewMode() {
  return columnViewMode;
}

/**
 * 梁の表示モードを取得
 * @returns {string} 現在の梁表示モード
 */
export function getBeamViewMode() {
  return beamViewMode;
}

/**
 * 柱の表示モードを設定
 * @param {string} mode - "line" または "solid"
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setColumnViewMode(mode, scheduleRender) {
  if (mode !== "line" && mode !== "solid") return;
  columnViewMode = mode;
  redrawColumnsForViewMode(scheduleRender);
}

/**
 * 梁の表示モードを設定
 * @param {string} mode - "line" または "solid"
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setBeamViewMode(mode, scheduleRender) {
  if (mode !== "line" && mode !== "solid") return;
  beamViewMode = mode;
  redrawBeamsForViewMode(scheduleRender);
}

/**
 * モデルの表示状態を設定
 * @param {string} model - "A" または "B"
 * @param {boolean} visible - 表示状態
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setModelVisibility(model, visible, scheduleRender) {
  if (model === "A") {
    isModelAVisible = visible;
  } else if (model === "B") {
    isModelBVisible = visible;
  } else {
    return;
  }
  updateModelVisibility(scheduleRender);
}

/**
 * モデルの表示状態を取得
 * @param {string} model - "A" または "B"
 * @returns {boolean} 現在の表示状態
 */
export function getModelVisibility(model) {
  if (model === "A") return isModelAVisible;
  if (model === "B") return isModelBVisible;
  return false;
}

/**
 * 柱の再描画処理
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function redrawColumnsForViewMode(scheduleRender) {
  // 必要なデータが揃っているかチェック
  if (!docA && !docB) return;

  // どちらか一方のモデルを使う（A優先）
  const doc = modelADocument || modelBDocument;
  const group = elementGroups["Column"];

  // 既存のラベルを削除
  removeLabelsForElementType("Column");
  group.clear(); // 柱グループのみクリア

  if (columnViewMode === "solid") {
    // 立体表示
    const stbData = parseStbFile(doc);
    const meshes = createColumnMeshes(
      stbData.columnElements,
      stbData.nodes,
      stbData.columnSections,
      stbData.steelSections
    );
    meshes.forEach((mesh) => group.add(mesh));

    // 立体表示でもラベルを作成
    const labelCheckbox = document.getElementById("toggleLabel-Column");
    const createLabels = labelCheckbox ? labelCheckbox.checked : false;
    if (createLabels) {
      const labels = createLabelsForSolidElements(
        stbData.columnElements,
        stbData.nodes,
        "Column"
      );
      labels.forEach((label) => group.add(label));
      addLabelsToGlobalState(labels);
    }
  } else {
    // 線表示（従来通り）
    const elementsA = parseElements(docA, "StbColumn");
    const elementsB = parseElements(docB, "StbColumn");
    const comparisonResult = compareElements(
      elementsA,
      elementsB,
      nodeMapA,
      nodeMapB,
      (el, nm) =>
        lineElementKeyExtractor(el, nm, "id_node_bottom", "id_node_top")
    );
    // ラベル表示設定を確認
    const labelCheckbox = document.getElementById("toggleLabel-Column");
    const createLabels = labelCheckbox ? labelCheckbox.checked : false;
    const createdLabels = drawLineElements(
      comparisonResult,
      materials,
      group,
      "Column",
      createLabels,
      modelBounds
    );
    // 作成されたラベルをグローバル状態に追加
    if (createdLabels && createdLabels.length > 0) {
      addLabelsToGlobalState(createdLabels);
    }
  }

  // 柱の表示モード切り替え後にラベルの表示/非表示を更新（非同期で実行）
  setTimeout(() => {
    updateUnifiedLabelVisibility();
    if (scheduleRender) scheduleRender();
  }, 10);
}

/**
 * 立体表示要素用のラベルを作成する
 * @param {Array} elements - 要素配列
 * @param {Map} nodes - 節点マップ
 * @param {string} elementType - 要素タイプ
 * @returns {Array} 作成されたラベルスプライトの配列
 */
function createLabelsForSolidElements(elements, nodes, elementType) {
  const labels = [];

  for (const element of elements) {
    let startNode, endNode, labelText, centerPosition;

    // 要素タイプに応じて座標とラベルテキストを取得
    if (elementType === "Column") {
      startNode = nodes.get(element.id_node_bottom);
      endNode = nodes.get(element.id_node_top);
      labelText = generateUnifiedLabelText(element, elementType);
      if (startNode && endNode) {
        centerPosition = new THREE.Vector3()
          .addVectors(startNode, endNode)
          .multiplyScalar(0.5);
      }
    } else if (elementType === "Girder" || elementType === "Beam") {
      startNode = nodes.get(element.id_node_start);
      endNode = nodes.get(element.id_node_end);
      labelText = generateUnifiedLabelText(element, elementType);
      if (startNode && endNode) {
        centerPosition = new THREE.Vector3()
          .addVectors(startNode, endNode)
          .multiplyScalar(0.5);
      }
    } else if (elementType === "Brace") {
      startNode = nodes.get(element.id_node_start);
      endNode = nodes.get(element.id_node_end);
      labelText = generateUnifiedLabelText(element, elementType);
      if (startNode && endNode) {
        centerPosition = new THREE.Vector3()
          .addVectors(startNode, endNode)
          .multiplyScalar(0.5);
      }
    } else {
      continue;
    }

    if (!centerPosition) continue;

    // ラベルスプライトを作成（グループは後で追加するため、nullを渡す）
    const sprite = createLabelSprite(
      labelText,
      centerPosition,
      null,
      elementType
    );
    if (sprite) {
      sprite.userData.elementId = element.id;
      sprite.userData.modelSource = "solid"; // 立体表示由来のラベル
      sprite.userData.elementType = elementType;

      // 要素データを保存して再生成時に使用
      attachElementDataToLabel(sprite, element);
      labels.push(sprite);
    }
  }

  return labels;
}

/**
 * 梁の再描画処理
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function redrawBeamsForViewMode(scheduleRender) {
  // 必要なデータが揃っているかチェック
  if (!docA && !docB) return;

  // どちらか一方のモデルを使う（A優先）
  const doc = modelADocument || modelBDocument;
  const girderGroup = elementGroups["Girder"];
  const beamGroup = elementGroups["Beam"];

  // 既存のラベルを削除
  removeLabelsForElementType("Girder");
  removeLabelsForElementType("Beam");
  girderGroup.clear(); // 大梁グループをクリア
  beamGroup.clear(); // 小梁グループをクリア

  if (beamViewMode === "solid") {
    // 立体表示
    const stbData = parseStbFile(doc);
    // 大梁
    const girderMeshes = createBeamMeshes(
      stbData.girderElements,
      stbData.nodes,
      stbData.beamSections,
      stbData.steelSections,
      "Girder" // elementType を渡す
    );
    girderMeshes.forEach((mesh) => girderGroup.add(mesh));

    // 大梁のラベルを作成
    const girderLabelCheckbox = document.getElementById("toggleLabel-Girder");
    const createGirderLabels = girderLabelCheckbox
      ? girderLabelCheckbox.checked
      : false;
    if (createGirderLabels) {
      const girderLabels = createLabelsForSolidElements(
        stbData.girderElements,
        stbData.nodes,
        "Girder"
      );
      girderLabels.forEach((label) => girderGroup.add(label));
      addLabelsToGlobalState(girderLabels);
    }

    // 小梁
    const beamMeshes = createBeamMeshes(
      stbData.beamElements,
      stbData.nodes,
      stbData.beamSections,
      stbData.steelSections,
      "Beam" // elementType を渡す
    );
    beamMeshes.forEach((mesh) => beamGroup.add(mesh));

    // 小梁のラベルを作成
    const beamLabelCheckbox = document.getElementById("toggleLabel-Beam");
    const createBeamLabels = beamLabelCheckbox
      ? beamLabelCheckbox.checked
      : false;
    if (createBeamLabels) {
      const beamLabels = createLabelsForSolidElements(
        stbData.beamElements,
        stbData.nodes,
        "Beam"
      );
      beamLabels.forEach((label) => beamGroup.add(label));
      addLabelsToGlobalState(beamLabels);
    }
  } else {
    // 線表示（従来通り）
    // 大梁
    const girdersA = parseElements(docA, "StbGirder");
    const girdersB = parseElements(docB, "StbGirder");
    const girderComparison = compareElements(
      girdersA,
      girdersB,
      nodeMapA,
      nodeMapB,
      (el, nm) =>
        lineElementKeyExtractor(el, nm, "id_node_start", "id_node_end")
    );
    // ラベル表示設定を確認
    const girderLabelCheckbox = document.getElementById("toggleLabel-Girder");
    const createGirderLabels = girderLabelCheckbox
      ? girderLabelCheckbox.checked
      : false;
    const createdGirderLabels = drawLineElements(
      girderComparison,
      materials,
      girderGroup,
      "Girder",
      createGirderLabels,
      modelBounds
    );
    // 作成されたラベルをグローバル状態に追加
    if (createdGirderLabels && createdGirderLabels.length > 0) {
      addLabelsToGlobalState(createdGirderLabels);
    }

    // 小梁
    const beamsA = parseElements(docA, "StbBeam");
    const beamsB = parseElements(docB, "StbBeam");
    const beamComparison = compareElements(
      beamsA,
      beamsB,
      nodeMapA,
      nodeMapB,
      (el, nm) =>
        lineElementKeyExtractor(el, nm, "id_node_start", "id_node_end")
    );
    // ラベル表示設定を確認
    const beamLabelCheckbox = document.getElementById("toggleLabel-Beam");
    const createBeamLabels = beamLabelCheckbox
      ? beamLabelCheckbox.checked
      : false;
    const createdBeamLabels = drawLineElements(
      beamComparison,
      materials,
      beamGroup,
      "Beam",
      createBeamLabels,
      modelBounds
    );
    // 作成されたラベルをグローバル状態に追加
    if (createdBeamLabels && createdBeamLabels.length > 0) {
      addLabelsToGlobalState(createdBeamLabels);
    }
  }

  // 梁の表示モード切り替え後にラベルの表示/非表示を更新（非同期で実行）
  setTimeout(() => {
    updateUnifiedLabelVisibility();
    if (scheduleRender) scheduleRender();
  }, 10);
}

/**
 * モデル表示状態に基づいてオブジェクトの表示/非表示を更新
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function updateModelVisibility(scheduleRender) {
  console.log(
    `Updating model visibility: A=${isModelAVisible}, B=${isModelBVisible}`
  );

  SUPPORTED_ELEMENTS.forEach((elementType) => {
    const group = elementGroups[elementType];
    if (group) {
      group.children.forEach((child) => {
        if (child.userData && child.userData.modelSource) {
          const source = child.userData.modelSource;
          let shouldBeVisible = false;
          if (source === "A" && isModelAVisible) {
            shouldBeVisible = true;
          } else if (source === "B" && isModelBVisible) {
            shouldBeVisible = true;
          } else if (
            source === "matched" &&
            (isModelAVisible || isModelBVisible)
          ) {
            // matched はどちらかのモデルが表示されていれば表示
            shouldBeVisible = true;
          }
          // 要素タイプ自体の表示状態も考慮する
          const elementCheckbox = document.querySelector(
            `#elementSelector input[name="elements"][value="${elementType}"]`
          );
          const isElementTypeVisible = elementCheckbox
            ? elementCheckbox.checked
            : false;

          child.visible = shouldBeVisible && isElementTypeVisible;
        } else if (elementType === "Axis" || elementType === "Story") {
          // 軸と階はモデルA/Bに依存しないが、要素タイプのチェックボックスには従う
          const elementCheckbox = document.querySelector(
            `#elementSelector input[name="elements"][value="${elementType}"]`
          );
          const isElementTypeVisible = elementCheckbox
            ? elementCheckbox.checked
            : false;
          child.visible = isElementTypeVisible;
        }
      });
    }
  });

  // ラベルの表示状態も更新
  updateUnifiedLabelVisibility();

  // 再描画を要求
  if (scheduleRender) scheduleRender();
}

/**
 * 表示モード関連のイベントリスナーを設定
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setupViewModeListeners(scheduleRender) {
  // 柱表示モード切替リスナー
  const toggleColumnViewCheckbox = document.getElementById("toggleColumnView");
  if (toggleColumnViewCheckbox) {
    toggleColumnViewCheckbox.addEventListener("change", function () {
      // チェックが入っている場合は立体表示、そうでなければ線表示
      columnViewMode = this.checked ? "solid" : "line";
      redrawColumnsForViewMode(scheduleRender);
      console.log("柱表示モード:", columnViewMode);
    });
  }

  // 梁表示モード切替リスナー
  const toggleGirderViewCheckbox = document.getElementById("toggleGirderView");
  if (toggleGirderViewCheckbox) {
    toggleGirderViewCheckbox.addEventListener("change", function () {
      // チェックが入っている場合は立体表示、そうでなければ線表示
      beamViewMode = this.checked ? "solid" : "line";
      redrawBeamsForViewMode(scheduleRender);
      console.log("梁表示モード:", beamViewMode);
    });
  }

  // 節点表示切替リスナー
  const toggleNodeViewCheckbox = document.getElementById("toggleNodeView");
  if (toggleNodeViewCheckbox) {
    toggleNodeViewCheckbox.addEventListener("change", function () {
      const nodeGroup = elementGroups["Node"];
      if (nodeGroup) {
        nodeGroup.visible = this.checked;
        console.log("節点表示:", this.checked);
        if (scheduleRender) scheduleRender();
      }
    });
  }

  // その他の要素タイプの表示切替リスナー
  const elementToggleIds = [
    { id: "toggleBraceView", type: "Brace", name: "ブレース" },
    { id: "toggleSlabView", type: "Slab", name: "スラブ" },
    { id: "toggleWallView", type: "Wall", name: "壁" },
    { id: "toggleAxisView", type: "Axis", name: "通り芯" },
    { id: "toggleStoryView", type: "Story", name: "階" },
  ];

  elementToggleIds.forEach(({ id, type, name }) => {
    const checkbox = document.getElementById(id);
    if (checkbox) {
      checkbox.addEventListener("change", function () {
        const elementGroup = elementGroups[type];
        if (elementGroup) {
          elementGroup.visible = this.checked;
          console.log(`${name}表示:`, this.checked);
          if (scheduleRender) scheduleRender();
        }
      });
    }
  });

  // モデル表示切り替えチェックボックスのリスナー
  const toggleModelACheckbox = document.getElementById("toggleModelA");
  if (toggleModelACheckbox) {
    toggleModelACheckbox.addEventListener("change", function () {
      isModelAVisible = this.checked;
      console.log("Model A visibility changed:", isModelAVisible);
      updateModelVisibility(scheduleRender);
    });
  }

  const toggleModelBCheckbox = document.getElementById("toggleModelB");
  if (toggleModelBCheckbox) {
    toggleModelBCheckbox.addEventListener("change", function () {
      isModelBVisible = this.checked;
      console.log("Model B visibility changed:", isModelBVisible);
      updateModelVisibility(scheduleRender);
    });
  }

  // ラベル表示切り替えは events.js で一元管理されるため、ここでは設定しない
  // 立体表示モードでのラベル更新は、該当する再描画関数内で処理される
}

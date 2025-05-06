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
import { updateAllLabelVisibility } from "./ui.js";

// 表示モード状態
let columnViewMode = "line"; // "line" または "solid"
let beamViewMode = "line"; // "line" または "solid"
let isModelAVisible = true;
let isModelBVisible = true;

// モデル情報の参照
let modelBounds = null;
let docA = null;
let docB = null;
let nodeMapA = null;
let nodeMapB = null;

/**
 * 状態管理モジュールを初期化
 * @param {Object} modelData - モデルデータ参照
 */
export function initViewModes(modelData) {
  modelBounds = modelData.modelBounds;
  docA = modelData.docA;
  docB = modelData.docB;
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
 * @param {Function} requestRender - 再描画要求関数
 */
export function setColumnViewMode(mode, requestRender) {
  if (mode !== "line" && mode !== "solid") return;
  columnViewMode = mode;
  redrawColumnsForViewMode(requestRender);
}

/**
 * 梁の表示モードを設定
 * @param {string} mode - "line" または "solid"
 * @param {Function} requestRender - 再描画要求関数
 */
export function setBeamViewMode(mode, requestRender) {
  if (mode !== "line" && mode !== "solid") return;
  beamViewMode = mode;
  redrawBeamsForViewMode(requestRender);
}

/**
 * モデルの表示状態を設定
 * @param {string} model - "A" または "B"
 * @param {boolean} visible - 表示状態
 * @param {Function} requestRender - 再描画要求関数
 */
export function setModelVisibility(model, visible, requestRender) {
  if (model === "A") {
    isModelAVisible = visible;
  } else if (model === "B") {
    isModelBVisible = visible;
  } else {
    return;
  }
  updateModelVisibility(requestRender);
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
 * @param {Function} requestRender - 再描画要求関数
 */
export function redrawColumnsForViewMode(requestRender) {
  // 必要なデータが揃っているかチェック
  if (!docA && !docB) return;

  // どちらか一方のモデルを使う（A優先）
  const doc = docA || docB;
  const group = elementGroups["Column"];
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
    // ラベルは常に作成
    drawLineElements(
      comparisonResult,
      materials,
      group,
      "Column",
      true,
      modelBounds
    );
  }

  // 柱の表示モード切り替え後にラベルの表示/非表示を更新
  updateAllLabelVisibility();
  if (requestRender) requestRender();
}

/**
 * 梁の再描画処理
 * @param {Function} requestRender - 再描画要求関数
 */
export function redrawBeamsForViewMode(requestRender) {
  // 必要なデータが揃っているかチェック
  if (!docA && !docB) return;

  // どちらか一方のモデルを使う（A優先）
  const doc = docA || docB;
  const girderGroup = elementGroups["Girder"];
  const beamGroup = elementGroups["Beam"];
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

    // 小梁
    const beamMeshes = createBeamMeshes(
      stbData.beamElements,
      stbData.nodes,
      stbData.beamSections,
      stbData.steelSections,
      "Beam" // elementType を渡す
    );
    beamMeshes.forEach((mesh) => beamGroup.add(mesh));
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
    // ラベルは常に作成
    drawLineElements(
      girderComparison,
      materials,
      girderGroup,
      "Girder",
      true,
      modelBounds
    );

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
    // ラベルは常に作成
    drawLineElements(
      beamComparison,
      materials,
      beamGroup,
      "Beam",
      true,
      modelBounds
    );
  }

  // 梁の表示モード切り替え後にラベルの表示/非表示を更新
  updateAllLabelVisibility();
  if (requestRender) requestRender();
}

/**
 * モデル表示状態に基づいてオブジェクトの表示/非表示を更新
 * @param {Function} requestRender - 再描画要求関数
 */
export function updateModelVisibility(requestRender) {
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
  updateAllLabelVisibility();

  // 再描画を要求
  if (requestRender) requestRender();
}

/**
 * 表示モード関連のイベントリスナーを設定
 * @param {Function} requestRender - 再描画要求関数
 */
export function setupViewModeListeners(requestRender) {
  // 柱表示モード切替リスナー
  const toggleColumnViewCheckbox = document.getElementById("toggleColumnView");
  if (toggleColumnViewCheckbox) {
    toggleColumnViewCheckbox.addEventListener("change", function () {
      // チェックが入っている場合は立体表示、そうでなければ線表示
      columnViewMode = this.checked ? "solid" : "line";
      redrawColumnsForViewMode(requestRender);
      console.log("柱表示モード:", columnViewMode);
    });
  }

  // 梁表示モード切替リスナー
  const toggleBeamViewCheckbox = document.getElementById("toggleBeamView");
  if (toggleBeamViewCheckbox) {
    toggleBeamViewCheckbox.addEventListener("change", function () {
      // チェックが入っている場合は立体表示、そうでなければ線表示
      beamViewMode = this.checked ? "solid" : "line";
      redrawBeamsForViewMode(requestRender);
      console.log("梁表示モード:", beamViewMode);
    });
  }

  // モデル表示切り替えチェックボックスのリスナー
  const toggleModelACheckbox = document.getElementById("toggleModelA");
  if (toggleModelACheckbox) {
    toggleModelACheckbox.addEventListener("change", function () {
      isModelAVisible = this.checked;
      console.log("Model A visibility changed:", isModelAVisible);
      updateModelVisibility(requestRender);
    });
  }

  const toggleModelBCheckbox = document.getElementById("toggleModelB");
  if (toggleModelBCheckbox) {
    toggleModelBCheckbox.addEventListener("change", function () {
      isModelBVisible = this.checked;
      console.log("Model B visibility changed:", isModelBVisible);
      updateModelVisibility(requestRender);
    });
  }
}

/**
 * @fileoverview ユーザーインタラクション処理モジュール
 *
 * このファイルは、3Dビューワーでのユーザー操作に関する機能を提供します:
 * - マウスによる要素選択と強調表示
 * - 選択要素の情報表示
 * - 要素のハイライト処理
 * - 選択状態のリセット
 *
 * このモジュールは、Three.jsのレイキャスト機能を利用して、
 * ユーザーがクリックした3D要素を特定し、適切な情報表示を行います。
 */

import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";
import { scene, camera, materials } from "./viewer/index.js";
import { displayElementInfo } from "./viewer/ui/elementInfoDisplay.js";
import { elementGroups } from "./viewer/index.js";

// レイキャスト用オブジェクト
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// 選択オブジェクト参照
let selectedObject = null;
let originalMaterial = null;

/**
 * 選択状態をリセット
 */
export function resetSelection() {
  if (selectedObject) {
    if (originalMaterial) {
      selectedObject.material = originalMaterial;
    }
    selectedObject = null;
    originalMaterial = null;
    displayElementInfo(null, null, null, null);
  }
}

/**
 * クリックイベント処理関数
 * @param {Event} event - マウスイベント
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function processElementSelection(event, scheduleRender) {
  event.preventDefault();

  const canvas = document.getElementById("three-canvas");
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();

  // マウス座標を正規化デバイス座標 (-1 to +1) に変換
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // 選択解除処理
  resetSelection();

  const intersects = raycaster.intersectObjects(scene.children, true);

  // 選択ロジック: 線要素 > 面要素 > Axis/Story の順で優先
  let lineObject = null; // 最優先: 線要素
  let meshOrSpriteObject = null; // 次点: メッシュ or スプライト (Axis/Story除く)
  let axisOrStoryObject = null; // 最後: Axis/Story

  for (const intersect of intersects) {
    const obj = intersect.object;
    if (obj.userData && obj.userData.elementType) {
      const elementType = obj.userData.elementType;
      // グループが表示されているか確認
      const groupVisible =
        elementGroups[elementType] && elementGroups[elementType].visible;

      // グループとオブジェクト自体が表示されている場合のみ考慮
      if (groupVisible && obj.visible) {
        // 1. 線要素 (Line) か？ (最優先、まだ見つかっていない場合)
        if (obj instanceof THREE.Line && !lineObject) {
          lineObject = obj;
          break;
        }
        // 2. Axis/Story 以外のメッシュ or スプライトか？ (次点、まだ見つかっていない場合)
        else if (
          (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite) &&
          elementType !== "Axis" &&
          elementType !== "Story" &&
          !meshOrSpriteObject
        ) {
          meshOrSpriteObject = obj;
        }
        // 3. Axis/Story か？ (最後、まだ見つかっていない場合)
        else if (
          (elementType === "Axis" || elementType === "Story") &&
          !axisOrStoryObject
        ) {
          axisOrStoryObject = obj;
        }
      }
    }
  }

  // 優先順位に従って選択対象を決定
  const objectToSelect = lineObject || meshOrSpriteObject || axisOrStoryObject;

  // 選択されたオブジェクトに基づいて処理
  if (objectToSelect && objectToSelect.userData) {
    const userData = objectToSelect.userData;
    const elementType = userData.elementType || userData.stbNodeType;

    // Axis と Story 以外の場合のみハイライト処理を実行
    if (elementType && elementType !== "Axis" && elementType !== "Story") {
      // ハイライト処理
      selectedObject = objectToSelect;
      // 元のマテリアルが配列の場合も考慮 (MultiMaterial など)
      if (Array.isArray(selectedObject.material)) {
        originalMaterial = selectedObject.material.map((mat) => mat.clone());
      } else if (selectedObject.material) {
        originalMaterial = selectedObject.material.clone(); // 複製して保存
      } else {
        originalMaterial = null; // マテリアルがない場合
      }

      // オブジェクトの種類に応じてハイライトマテリアルを選択
      let highlightMat = null;
      if (selectedObject instanceof THREE.Line) {
        highlightMat = materials.highlightLine;
      } else if (
        selectedObject instanceof THREE.Mesh ||
        selectedObject instanceof THREE.Sprite
      ) {
        highlightMat = materials.highlightMesh;
      }

      // ハイライトマテリアルを適用
      if (highlightMat && selectedObject.material) {
        selectedObject.material = highlightMat;
      }

      console.log("Highlighted Object:", selectedObject);
      console.log("UserData:", userData); // デバッグ用

      // 情報表示処理 (ハイライト対象のみ)
      const modelSource = userData.modelSource;

      // 柱のMesh選択時も情報表示（stbElementId優先）
      if (
        elementType === "Column" ||
        elementType === "Column (fallback line)"
      ) {
        // Columnの場合はmodelSourceに応じてA/B両方のIDを取得
        let idA = null,
          idB = null;
        if (modelSource === "matched") {
          idA = userData.elementIdA || userData.elementId;
          idB = userData.elementIdB;
        } else if (modelSource === "A") {
          idA = userData.elementId;
        } else if (modelSource === "B") {
          idB = userData.elementId;
        }
        displayElementInfo(idA, idB, "Column", modelSource);
      }
      // その他のハイライト対象要素の情報表示
      else {
        let idA = null;
        let idB = null;
        if (modelSource === "matched") {
          idA = userData.elementIdA || userData.elementId;
          idB = userData.elementIdB;
        } else if (modelSource === "A") {
          idA = userData.elementId;
        } else if (modelSource === "B") {
          idB = userData.elementId;
        } else {
          idA = userData.elementId;
        }
        if (idA || idB) {
          console.log(`Calling displayElementInfo for ${elementType}:`, {
            idA,
            idB,
            elementType,
          }); // デバッグ用
          displayElementInfo(idA, idB, elementType, modelSource);
        } else {
          console.log(`No valid ID found for ${elementType}, clearing display`); // デバッグ用
          displayElementInfo(null, null, null, null);
        }
      }
    } else if (elementType === "Axis" || elementType === "Story") {
      // Axis/Story がクリックされた場合: ハイライトせず、情報パネルをクリア
      console.log(`Clicked on ${elementType}, skipping highlight.`);
      displayElementInfo(null, null, null, null);
    }
  }

  // 再描画要求
  if (scheduleRender) scheduleRender();
}

/**
 * インタラクションイベントリスナーを設定
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setupInteractionListeners(scheduleRender) {
  const canvasElement = document.getElementById("three-canvas");
  if (canvasElement) {
    canvasElement.addEventListener(
      "click",
      (event) => {
        processElementSelection(event, scheduleRender);
      },
      false
    );
  } else {
    console.error("Canvas element not found for click listener.");
  }
}

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

import * as THREE from "three";
import {
  scene,
  camera,
  materials,
  controls,
  elementGroups,
  setSkipControlsUpdate,
} from "./viewer/index.js";
import { displayElementInfo } from "./viewer/ui/elementInfoDisplay.js";
import { selectElementInTree } from "./ui/elementTreeView.js";

// レイキャスト用オブジェクト
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// 選択オブジェクト参照
let selectedObject = null;
let originalMaterial = null;
// 回転中心表示用のヘルパーオブジェクト
let orbitCenterHelper = null;
// CameraControls では setOrbitPoint でビューを動かさずに回転中心のみ切替可能

// サブメッシュ命中時でも部材本体を見つける（Axis/Storyは除外）
function findSelectableAncestor(obj) {
  let cur = obj;
  while (cur) {
    if (cur.userData && cur.userData.elementType) {
      const et = cur.userData.elementType || cur.userData.stbNodeType;
      if (et && et !== "Axis" && et !== "Story") return cur;
    }
    cur = cur.parent;
  }
  return null;
}

/**
 * 回転中心を視覚的に表示するヘルパーを作成・更新
 */
function createOrUpdateOrbitCenterHelper(position) {
  if (!scene) return;

  // 既存のヘルパーを削除
  if (orbitCenterHelper) {
    scene.remove(orbitCenterHelper);
    if (orbitCenterHelper.geometry) orbitCenterHelper.geometry.dispose();
    if (orbitCenterHelper.material) orbitCenterHelper.material.dispose();
  }

  // 新しいヘルパーを作成（球体を大きくする）
  const geometry = new THREE.SphereGeometry(150, 16, 12); // 150mm radius, より高解像度
  const material = new THREE.MeshBasicMaterial({
    color: 0xff4444,
    transparent: true,
    opacity: 0.9,
    depthTest: false, // 常に手前に表示
  });

  orbitCenterHelper = new THREE.Mesh(geometry, material);
  orbitCenterHelper.position.copy(position);
  orbitCenterHelper.userData.isOrbitHelper = true;
  scene.add(orbitCenterHelper);
}

/**
 * 回転中心ヘルパーを非表示にする
 */
function hideOrbitCenterHelper() {
  if (orbitCenterHelper) {
    scene.remove(orbitCenterHelper);
    if (orbitCenterHelper.geometry) orbitCenterHelper.geometry.dispose();
    if (orbitCenterHelper.material) orbitCenterHelper.material.dispose();
    orbitCenterHelper = null;
  }
}

/**
 * 現在選択中オブジェクトのワールド中心を取得（なければ null）
 * @returns {THREE.Vector3|null}
 */
export function getSelectedCenter() {
  if (!selectedObject) return null;
  try {
    const mainObj = findSelectableAncestor(selectedObject) || selectedObject;
    const box = new THREE.Box3().setFromObject(mainObj);
    if (box && box.isBox3) {
      const center = new THREE.Vector3();
      box.getCenter(center);
      return center;
    }
  } catch (e) {
    console.warn("getSelectedCenter failed:", e);
  }
  return null;
}

// 左ボタン押下中かどうか
let isPointerDownLeft = false;
// ドラッグ開始判定用の押下座標
let pointerDownPos = { x: 0, y: 0 };
// このドラッグ中に適用済みか
let appliedThisDrag = false;
// ドラッグ判定のピクセル閾値
const DRAG_APPLY_THRESHOLD_PX = 3;

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
  // 回転中心ヘルパーも非表示
  hideOrbitCenterHelper();
}

/**
 * 3Dオブジェクトを直接選択してハイライト表示する
 * @param {THREE.Object3D} obj - 選択するThree.jsオブジェクト
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function selectElement3D(obj, scheduleRender) {
  if (!obj || !obj.userData) {
    console.warn('無効なオブジェクトが指定されました');
    return;
  }

  const userData = obj.userData;
  const elementType = userData.elementType || userData.stbNodeType;

  // Axis と Story 以外の場合のみハイライト処理を実行
  if (elementType && elementType !== "Axis" && elementType !== "Story") {
    // 既存の選択を解除
    resetSelection();

    // ハイライト処理
    selectedObject = obj;

    // 元のマテリアルを保存
    if (Array.isArray(selectedObject.material)) {
      originalMaterial = selectedObject.material.map((mat) => mat.clone());
    } else if (selectedObject.material) {
      originalMaterial = selectedObject.material.clone();
    } else {
      originalMaterial = null;
    }

    // ハイライトマテリアルを適用
    let highlightMat = null;
    if (selectedObject instanceof THREE.Line) {
      highlightMat = materials.highlightLine;
    } else if (
      selectedObject instanceof THREE.Mesh ||
      selectedObject instanceof THREE.Sprite
    ) {
      highlightMat = materials.highlightMesh;
    }

    if (highlightMat && selectedObject.material) {
      selectedObject.material = highlightMat;
    }

    // 回転中心を変更
    try {
      const mainObj = findSelectableAncestor(selectedObject) || selectedObject;
      const box = new THREE.Box3().setFromObject(mainObj);
      if (box && box.isBox3) {
        const center = new THREE.Vector3();
        box.getCenter(center);
        if (controls && typeof controls.setOrbitPoint === "function") {
          controls.stop?.();
          controls.setOrbitPoint(center.x, center.y, center.z);
        } else {
          controls.target.copy(center);
        }
        createOrUpdateOrbitCenterHelper(center);
      }
    } catch (e) {
      console.warn("Failed to compute selected object center:", e);
    }

    // 再描画
    if (scheduleRender) scheduleRender();
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

      // クリック時に回転中心を変更（CameraControls の setOrbitPoint で画面位置は維持）
      try {
        const mainObj =
          findSelectableAncestor(selectedObject) || selectedObject;
        const box = new THREE.Box3().setFromObject(mainObj);
        if (box && box.isBox3) {
          const center = new THREE.Vector3();
          box.getCenter(center);
          // カメラ視点を動かさずに回転中心だけ切り替え
          if (controls && typeof controls.setOrbitPoint === "function") {
            controls.stop?.();
            controls.setOrbitPoint(center.x, center.y, center.z);
          } else {
            // 互換性のためのフォールバック（古い OrbitControls 互換）
            controls.target.copy(center);
          }
          // 回転中心を視覚的に表示
          createOrUpdateOrbitCenterHelper(center);
        } else {
        }
      } catch (e) {
        console.warn(
          "Failed to compute selected object center for pending orbit target:",
          e
        );
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
        } else {
          // フォールバック: modelSource 未設定（単一モデル等）の場合は elementId を A として扱う
          idA = userData.elementId;
        }
        displayElementInfo(idA, idB, "Column", modelSource);

        // ツリー表示を同期
        const elementId = idA || idB;
        if (elementId) {
          selectElementInTree("Column", elementId, modelSource);
        }
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

          // ツリー表示を同期
          const elementId = idA || idB;
          if (elementId) {
            selectElementInTree(elementType, elementId, modelSource);
          }
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

    // 左ボタン押下でドラッグの可能性を記録
    canvasElement.addEventListener(
      "mousedown",
      (event) => {
        if (event.button !== 0) return; // 左:0
        isPointerDownLeft = true;
        appliedThisDrag = false;
        pointerDownPos.x = event.clientX;
        pointerDownPos.y = event.clientY;
      },
      false
    );

    // 実際にドラッグが始まったら（閾値超え）
    window.addEventListener(
      "mousemove",
      (event) => {
        if (!isPointerDownLeft || appliedThisDrag) {
          return;
        }
        const dx = event.clientX - pointerDownPos.x;
        const dy = event.clientY - pointerDownPos.y;
        const distance = Math.hypot(dx, dy);

        if (distance >= DRAG_APPLY_THRESHOLD_PX) {
          // ドラッグ開始時には何もしない（クリック時に設定済み）
          appliedThisDrag = true;
          if (scheduleRender) scheduleRender();
        }
      },
      false
    );

    // ドラッグ終了でフラグをリセット
    window.addEventListener(
      "mouseup",
      () => {
        console.log("Mouse up - resetting flags");
        isPointerDownLeft = false;
        appliedThisDrag = false;
      },
      false
    );

    // 操作開始/終了のフック（互換ログ）
    if (controls && typeof controls.addEventListener === "function") {
      controls.addEventListener("start", () => {
        console.log("Controls start event fired - no action needed");
        // 回転中心はクリック時に既に設定済みなので、ここでは何もしない
      });

      // 操作終了時にフラグをリセット
      controls.addEventListener("end", () => {
        console.log("Controls end event fired - resetting appliedThisDrag");
        appliedThisDrag = false;
      });
    } else {
      console.error("controls.addEventListener not available");
    }
  } else {
    console.error("Canvas element not found for click listener.");
  }
}

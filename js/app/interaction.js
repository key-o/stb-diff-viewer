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

import * as THREE from 'three';
import { createLogger, WarnCategory } from '../utils/logger.js';

const logger = createLogger('interaction');
import { scene, camera, colorManager, controls, elementGroups } from '../viewer/index.js';
import { getState } from './globalState.js';
import { eventBus, SelectionEvents, InteractionEvents } from './events/index.js';
import { CAMERA_CONTROLS } from '../config/renderingConstants.js';

// レイキャスト用オブジェクト
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// 選択オブジェクト参照（複数選択対応）
/** @type {THREE.Object3D[]} */
let selectedObjects = [];
/** @type {Map<THREE.Object3D, THREE.Material|THREE.Material[]>} */
const originalMaterials = new Map();

// 選択数上限
const MAX_SELECTION_COUNT = 100;

// 回転中心表示用のヘルパーオブジェクト
let orbitCenterHelper = null;
// CameraControls では setOrbitPoint でビューを動かさずに回転中心のみ切替可能

// サブメッシュ命中時でも部材本体を見つける（Axis/Storyは除外）
function findSelectableAncestor(obj) {
  let cur = obj;
  while (cur) {
    if (cur.userData && cur.userData.elementType) {
      const et = cur.userData.elementType || cur.userData.stbNodeType;
      if (et && et !== 'Axis' && et !== 'Story') return cur;
    }
    cur = cur.parent;
  }
  return null;
}

/**
 * 回転中心を視覚的に表示するヘルパーを作成・更新
 * @param {THREE.Vector3} position - 回転中心の位置
 */
export function createOrUpdateOrbitCenterHelper(position) {
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
export function hideOrbitCenterHelper() {
  if (orbitCenterHelper) {
    scene.remove(orbitCenterHelper);
    if (orbitCenterHelper.geometry) orbitCenterHelper.geometry.dispose();
    if (orbitCenterHelper.material) orbitCenterHelper.material.dispose();
    orbitCenterHelper = null;
  }
}

/**
 * 現在選択中オブジェクトのワールド中心を取得（なければ null）
 * 複数選択時は全選択オブジェクトの包含ボックス中心を返す
 * @returns {THREE.Vector3|null}
 */
export function getSelectedCenter() {
  if (selectedObjects.length === 0) return null;
  try {
    const combinedBox = new THREE.Box3();
    for (const obj of selectedObjects) {
      const mainObj = findSelectableAncestor(obj) || obj;
      const box = new THREE.Box3().setFromObject(mainObj);
      if (box && box.isBox3) {
        combinedBox.union(box);
      }
    }
    if (!combinedBox.isEmpty()) {
      const center = new THREE.Vector3();
      combinedBox.getCenter(center);
      return center;
    }
  } catch (e) {
    logger.warn(`${WarnCategory.UI} 選択中心取得: 計算失敗`, e);
  }
  return null;
}

/**
 * 現在選択中のオブジェクトを取得
 * @returns {THREE.Object3D[]}
 */
export function getSelectedObjects() {
  return [...selectedObjects];
}

// 左ボタン押下中かどうか
let isPointerDownLeft = false;
// ドラッグ開始判定用の押下座標
const pointerDownPos = { x: 0, y: 0 };
// このドラッグ中に適用済みか
let appliedThisDrag = false;
// ドラッグ判定のピクセル閾値
const DRAG_APPLY_THRESHOLD_PX = CAMERA_CONTROLS.DRAG_THRESHOLD_PX;

/**
 * 単一オブジェクトの選択を解除（マテリアル復元）
 * @param {THREE.Object3D} obj
 */
function deselectSingleObject(obj) {
  const origMat = originalMaterials.get(obj);
  if (origMat) {
    obj.material = origMat;
    originalMaterials.delete(obj);
  }
  const idx = selectedObjects.indexOf(obj);
  if (idx !== -1) {
    selectedObjects.splice(idx, 1);
  }
}

/**
 * 選択状態をリセット（全選択解除）
 */
export function resetSelection() {
  // common/viewerモードの場合はアダプター経由で選択解除
  const useCommonViewer = getState('viewer.useCommonViewer');
  const adapter = getState('viewer.adapter');

  if (useCommonViewer && adapter) {
    adapter.clearSelection();
  }

  // 従来の選択状態もクリア
  if (selectedObjects.length > 0) {
    for (const obj of selectedObjects) {
      const origMat = originalMaterials.get(obj);
      if (origMat) {
        obj.material = origMat;
      }
    }
    selectedObjects = [];
    originalMaterials.clear();
    eventBus.emit(InteractionEvents.DISPLAY_ELEMENT_INFO, {
      idA: null,
      idB: null,
      elementType: null,
      modelSource: null,
    });

    // 選択クリアイベントを発行
    eventBus.emit(SelectionEvents.SELECTION_CLEARED, {
      timestamp: Date.now(),
    });
  }
  // 回転中心ヘルパーも非表示
  hideOrbitCenterHelper();
}

/**
 * 単一オブジェクトをハイライト（選択リストに追加）
 * @param {THREE.Object3D} obj
 */
function highlightObject(obj) {
  // 元のマテリアルを保存
  if (Array.isArray(obj.material)) {
    originalMaterials.set(
      obj,
      obj.material.map((mat) => mat.clone()),
    );
  } else if (obj.material) {
    originalMaterials.set(obj, obj.material.clone());
  }

  // ハイライトマテリアルを適用
  let highlightMat = null;
  if (obj instanceof THREE.Line) {
    highlightMat = colorManager.getMaterial('highlight', { isLine: true });
  } else if (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite) {
    highlightMat = colorManager.getMaterial('highlight', { isLine: false });
    if (obj.userData?.isSRCConcrete === true && highlightMat?.isMaterial) {
      // SRCのRC外殻は選択時も半透明を維持し、内部鉄骨を視認しやすくする
      highlightMat = highlightMat.clone();
      highlightMat.transparent = true;
      highlightMat.opacity = 0.22;
      highlightMat.depthWrite = false;
    }
  }

  if (highlightMat && obj.material) {
    obj.material = highlightMat;
  }

  selectedObjects.push(obj);
}

/**
 * 3Dオブジェクトを直接選択してハイライト表示する
 * ツリービューからの呼び出し用（常に単一選択）
 * @param {THREE.Object3D} obj - 選択するThree.jsオブジェクト
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function selectElement3D(obj, scheduleRender) {
  if (!obj || !obj.userData) {
    logger.warn(`${WarnCategory.UI} 選択: 無効なオブジェクトが指定されました`);
    return;
  }

  const userData = obj.userData;
  const elementType = userData.elementType || userData.stbNodeType;

  // Axis と Story 以外の場合のみハイライト処理を実行
  if (elementType && elementType !== 'Axis' && elementType !== 'Story') {
    // common/viewerモードの場合はアダプター経由で選択
    const useCommonViewer = getState('viewer.useCommonViewer');
    const adapter = getState('viewer.adapter');

    if (useCommonViewer && adapter) {
      // アダプター経由で選択
      const elementId = userData.elementId || userData.elementIdA || userData.elementIdB;
      const modelSource = userData.modelSource || 'A';
      adapter.selectElement(elementId, modelSource);

      // 従来の選択状態もクリア（互換性のため）
      resetSelection();

      // カメラフォーカス
      adapter.focusOnElement(elementId, modelSource);

      return;
    }

    // 通常モード: 既存の選択を解除（単一選択なので全解除）
    resetSelection();

    // ハイライト処理
    highlightObject(obj);

    // 回転中心を変更
    try {
      const mainObj = findSelectableAncestor(obj) || obj;
      const box = new THREE.Box3().setFromObject(mainObj);
      if (box && box.isBox3) {
        const center = new THREE.Vector3();
        box.getCenter(center);
        if (controls && typeof controls.setOrbitPoint === 'function') {
          controls.stop?.();
          controls.setOrbitPoint(center.x, center.y, center.z);
        } else {
          controls.target.copy(center);
        }
        createOrUpdateOrbitCenterHelper(center);
      }
    } catch (e) {
      logger.warn(`${WarnCategory.UI} 選択: オブジェクト中心の計算失敗`, e);
    }

    // 再描画
    if (scheduleRender) scheduleRender();
  }
}

/**
 * 複数の3Dオブジェクトを選択してハイライト表示する
 * ツリービューの複数選択からの呼び出し用
 * @param {THREE.Object3D[]} objects - 選択するThree.jsオブジェクトの配列
 * @param {Function} scheduleRender - 再描画要求関数
 * @param {Object} options - オプション
 * @param {boolean} options.clearPrevious - 既存選択をクリアするか（デフォルト: true）
 */
export function selectMultipleElements3D(objects, scheduleRender, options = {}) {
  const { clearPrevious = true } = options;

  if (!objects || objects.length === 0) {
    if (clearPrevious) {
      resetSelection();
    }
    if (scheduleRender) scheduleRender();
    return;
  }

  // 既存選択をクリア
  if (clearPrevious) {
    resetSelection();
  }

  // 選択上限チェック
  const maxToSelect = Math.min(objects.length, MAX_SELECTION_COUNT - selectedObjects.length);

  for (let i = 0; i < maxToSelect; i++) {
    const obj = objects[i];
    if (!obj || !obj.userData) continue;

    const elementType = obj.userData.elementType || obj.userData.stbNodeType;
    if (elementType && elementType !== 'Axis' && elementType !== 'Story') {
      // 既に選択済みでない場合のみ追加
      if (!selectedObjects.includes(obj)) {
        highlightObject(obj);
      }
    }
  }

  if (objects.length > maxToSelect) {
    logger.warn(`${WarnCategory.UI} 選択: 上限到達 (${MAX_SELECTION_COUNT}要素)`);
  }

  // 回転中心を更新
  const center = getSelectedCenter();
  if (center) {
    try {
      if (controls && typeof controls.setOrbitPoint === 'function') {
        controls.stop?.();
        controls.setOrbitPoint(center.x, center.y, center.z);
      } else {
        controls.target.copy(center);
      }
      createOrUpdateOrbitCenterHelper(center);
    } catch (e) {
      logger.warn(`${WarnCategory.UI} 選択: 回転中心の更新失敗`, e);
    }
  }

  // 再描画
  if (scheduleRender) scheduleRender();
}

/**
 * 要素のIDを取得するヘルパー関数
 * @param {Object} userData
 * @returns {{idA: string|null, idB: string|null}}
 */
function getElementIds(userData) {
  const modelSource = userData.modelSource;
  let idA = null;
  let idB = null;

  if (modelSource === 'matched') {
    idA = userData.elementIdA || userData.elementId;
    idB = userData.elementIdB;
  } else if (modelSource === 'A') {
    idA = userData.elementId;
  } else if (modelSource === 'B') {
    idB = userData.elementId;
  } else {
    // フォールバック
    idA = userData.elementId;
  }

  return { idA, idB };
}

/**
 * 複数選択時のサマリー情報を表示
 */
function displayMultiSelectionSummary() {
  const panel = document.getElementById('component-info');
  const contentDiv = document.getElementById('element-info-content');
  if (!panel || !contentDiv) return;

  // 要素タイプ別にカウント
  const typeCounts = new Map();
  const modelSourceCounts = { A: 0, B: 0, matched: 0, unknown: 0 };

  for (const obj of selectedObjects) {
    const userData = obj.userData;
    const elementType = userData.elementType || userData.stbNodeType || 'Unknown';
    typeCounts.set(elementType, (typeCounts.get(elementType) || 0) + 1);

    const modelSource = userData.modelSource || 'unknown';
    if (modelSource in modelSourceCounts) {
      modelSourceCounts[modelSource]++;
    } else {
      modelSourceCounts.unknown++;
    }
  }

  // サマリーHTMLを生成
  let summaryHtml = `
    <div style="font-weight:var(--font-weight-bold);margin-bottom:8px;font-size:var(--font-size-lg);">
      複数選択: ${selectedObjects.length}要素
    </div>
    <div style="margin-bottom:8px;">
      <strong>要素タイプ:</strong>
      <ul style="margin:4px 0;padding-left:20px;">
  `;

  for (const [type, count] of typeCounts) {
    summaryHtml += `<li>${type}: ${count}</li>`;
  }

  summaryHtml += `
      </ul>
    </div>
    <div>
      <strong>モデルソース:</strong>
      <ul style="margin:4px 0;padding-left:20px;">
  `;

  if (modelSourceCounts.A > 0) summaryHtml += `<li>モデルA: ${modelSourceCounts.A}</li>`;
  if (modelSourceCounts.B > 0) summaryHtml += `<li>モデルB: ${modelSourceCounts.B}</li>`;
  if (modelSourceCounts.matched > 0)
    summaryHtml += `<li>マッチ済: ${modelSourceCounts.matched}</li>`;

  summaryHtml += `
      </ul>
    </div>
  `;

  contentDiv.innerHTML = summaryHtml;
}

/**
 * レイキャストを実行して交差オブジェクトを取得
 * @param {Event} event - マウスイベント
 * @returns {THREE.Intersection[]|null} 交差結果の配列、キャンバスが見つからない場合はnull
 */
function performRaycast(event) {
  const canvas = document.getElementById('three-canvas');
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();

  // マウス座標を正規化デバイス座標 (-1 to +1) に変換
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  return raycaster.intersectObjects(scene.children, true);
}

/**
 * 交差結果から優先度に基づいて最適なオブジェクトを選択
 * 優先順位: 線要素 > 面要素 > Axis/Story
 * @param {THREE.Intersection[]} intersects - レイキャストの交差結果
 * @returns {THREE.Object3D|null} 選択すべきオブジェクト
 */
function findBestIntersection(intersects) {
  let lineObject = null;
  let meshOrSpriteObject = null;
  let axisOrStoryObject = null;

  for (const intersect of intersects) {
    const obj = intersect.object;
    if (obj.userData && obj.userData.elementType) {
      const elementType = obj.userData.elementType;
      const groupVisible = elementGroups[elementType] && elementGroups[elementType].visible;

      if (groupVisible && obj.visible) {
        if (obj instanceof THREE.Line && !lineObject) {
          lineObject = obj;
          break;
        } else if (
          (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite) &&
          elementType !== 'Axis' &&
          elementType !== 'Story' &&
          !meshOrSpriteObject
        ) {
          meshOrSpriteObject = obj;
        } else if ((elementType === 'Axis' || elementType === 'Story') && !axisOrStoryObject) {
          axisOrStoryObject = obj;
        }
      }
    }
  }

  return lineObject || meshOrSpriteObject || axisOrStoryObject;
}

/**
 * Ctrl/Meta+クリックによる複数選択を処理（トグル動作）
 * @param {THREE.Object3D} objectToSelect - 選択対象のオブジェクト
 */
function handleMultiSelect(objectToSelect) {
  const alreadySelected = selectedObjects.includes(objectToSelect);

  if (alreadySelected) {
    // 既に選択済み → 選択解除
    deselectSingleObject(objectToSelect);
  } else {
    // 選択上限チェック
    if (selectedObjects.length >= MAX_SELECTION_COUNT) {
      logger.warn(`${WarnCategory.UI} 選択: 上限到達 (${MAX_SELECTION_COUNT}要素)`);
    } else {
      // 新規追加選択
      highlightObject(objectToSelect);
    }
  }
}

/**
 * 通常クリックによる単一選択を処理
 * resetSelectionは呼び出し前に実行済みであることを前提とする
 * @param {THREE.Object3D} objectToSelect - 選択対象のオブジェクト
 */
function handleSingleSelect(objectToSelect) {
  highlightObject(objectToSelect);
}

/**
 * 選択要素の中心に回転中心を更新
 */
function updateOrbitCenterForSelection() {
  const center = getSelectedCenter();
  if (center) {
    try {
      if (controls && typeof controls.setOrbitPoint === 'function') {
        controls.stop?.();
        controls.setOrbitPoint(center.x, center.y, center.z);
      } else {
        controls.target.copy(center);
      }
      createOrUpdateOrbitCenterHelper(center);
    } catch (e) {
      logger.warn(`${WarnCategory.UI} 選択: 回転中心の更新失敗`, e);
    }
  }
}

/**
 * 選択状態に応じて要素情報を表示
 * 選択数が0の場合はクリア、1の場合は詳細表示、2以上の場合はサマリー表示
 */
function showElementInfo() {
  if (selectedObjects.length === 0) {
    // 選択解除された場合
    eventBus.emit(InteractionEvents.DISPLAY_ELEMENT_INFO, {
      idA: null,
      idB: null,
      elementType: null,
      modelSource: null,
    });
  } else if (selectedObjects.length === 1) {
    // 単一選択: 従来通りの詳細表示
    const singleObj = selectedObjects[0];
    const singleUserData = singleObj.userData;
    const singleElementType = singleUserData.elementType || singleUserData.stbNodeType;
    const displayType =
      singleElementType === 'Column (fallback line)' ? 'Column' : singleElementType;

    // 継手要素の場合はuserData.idをそのまま使用（"joint_165_start"形式）
    let idA, idB;
    if (displayType === 'Joint') {
      idA = singleUserData.modelSource !== 'B' ? singleUserData.id : null;
      idB = singleUserData.modelSource === 'B' ? singleUserData.id : null;
    } else {
      ({ idA, idB } = getElementIds(singleUserData));
    }

    eventBus.emit(InteractionEvents.DISPLAY_ELEMENT_INFO, {
      idA,
      idB,
      elementType: displayType,
      modelSource: singleUserData.modelSource,
    });

    // 要素選択イベントを発行
    eventBus.emit(SelectionEvents.ELEMENT_SELECTED, {
      elementType: displayType,
      elementId: idA || idB,
      elementIdA: idA,
      elementIdB: idB,
      modelSource: singleUserData.modelSource,
      timestamp: Date.now(),
    });

    // ツリー表示を同期
    const elementId = idA || idB;
    if (elementId) {
      eventBus.emit(InteractionEvents.SELECT_ELEMENT_IN_TREE, {
        elementType: displayType,
        elementId,
        modelSource: singleUserData.modelSource,
      });
    }
  } else {
    // 複数選択: サマリー表示
    displayMultiSelectionSummary();

    // 複数選択イベントを発行
    const selectedIds = selectedObjects.map((obj) => {
      const ud = obj.userData;
      return {
        elementType: ud.elementType || ud.stbNodeType,
        elementId: ud.elementId || ud.elementIdA || ud.elementIdB,
        modelSource: ud.modelSource,
      };
    });
    eventBus.emit(SelectionEvents.MULTI_SELECT, {
      selectedElements: selectedIds,
      count: selectedObjects.length,
      timestamp: Date.now(),
    });
  }
}

/**
 * 情報パネルをクリア
 */
function clearElementInfoPanel() {
  eventBus.emit(InteractionEvents.DISPLAY_ELEMENT_INFO, {
    idA: null,
    idB: null,
    elementType: null,
    modelSource: null,
  });
}

/**
 * クリックイベント処理関数（複数選択対応）
 * @param {Event} event - マウスイベント
 * @param {Function} scheduleRender - 再描画要求関数
 */
function processElementSelection(event, scheduleRender) {
  event.preventDefault();

  const intersects = performRaycast(event);
  if (!intersects) return;

  // Ctrlキーが押されているか確認（複数選択モード）
  const isMultiSelectMode = event.ctrlKey || event.metaKey;

  // Ctrlなしの場合は既存の選択を解除
  if (!isMultiSelectMode) {
    resetSelection();
  }

  const objectToSelect = findBestIntersection(intersects);

  if (objectToSelect && objectToSelect.userData) {
    const userData = objectToSelect.userData;
    const elementType = userData.elementType || userData.stbNodeType;

    // Axis と Story 以外の場合のみハイライト処理を実行
    if (elementType && elementType !== 'Axis' && elementType !== 'Story') {
      if (isMultiSelectMode) {
        handleMultiSelect(objectToSelect);
      } else {
        handleSingleSelect(objectToSelect);
      }

      updateOrbitCenterForSelection();
      showElementInfo();
    } else if (elementType === 'Axis' || elementType === 'Story') {
      // Axis/Story がクリックされた場合: ハイライトせず、情報パネルをクリア
      if (!isMultiSelectMode) {
        clearElementInfoPanel();
      }
    }
  } else if (!isMultiSelectMode) {
    // 何もない場所をクリック（Ctrlなし）→ 選択解除は既に実行済み
    // 情報パネルのクリアのみ
    if (selectedObjects.length === 0) {
      clearElementInfoPanel();
    }
  }

  // 再描画要求
  if (scheduleRender) scheduleRender();
}

/** @type {Function|null} */
let contextMenuActionCallback = null;

/**
 * インタラクションイベントリスナーを設定
 * @param {Function} scheduleRender - 再描画要求関数
 * @param {Object} [options] - オプション
 * @param {Function} [options.onContextMenuAction] - コンテキストメニューアクションのコールバック
 */
export function setupInteractionListeners(scheduleRender, options = {}) {
  contextMenuActionCallback = options.onContextMenuAction || null;

  // コンテキストメニューを初期化
  eventBus.emit(InteractionEvents.INIT_CONTEXT_MENU);

  const canvasElement = document.getElementById('three-canvas');
  if (canvasElement) {
    canvasElement.addEventListener(
      'click',
      (event) => {
        processElementSelection(event, scheduleRender);
      },
      false,
    );

    // 右クリックイベント（コンテキストメニュー）
    canvasElement.addEventListener(
      'contextmenu',
      (event) => {
        event.preventDefault();
        handleContextMenu(event, scheduleRender);
      },
      false,
    );

    // 左ボタン押下でドラッグの可能性を記録
    canvasElement.addEventListener(
      'mousedown',
      (event) => {
        if (event.button !== 0) return; // 左:0
        isPointerDownLeft = true;
        appliedThisDrag = false;
        pointerDownPos.x = event.clientX;
        pointerDownPos.y = event.clientY;
      },
      false,
    );

    // 実際にドラッグが始まったら（閾値超え）
    window.addEventListener(
      'mousemove',
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
      false,
    );

    // ドラッグ終了でフラグをリセット
    window.addEventListener(
      'mouseup',
      () => {
        isPointerDownLeft = false;
        appliedThisDrag = false;
      },
      false,
    );

    // 操作開始/終了のフック
    if (controls && typeof controls.addEventListener === 'function') {
      // 操作終了時にフラグをリセット
      controls.addEventListener('end', () => {
        appliedThisDrag = false;
      });
    }
  } else {
    logger.error('Canvas element not found for click listener.');
  }
}

/**
 * 3Dビューでの右クリック（コンテキストメニュー）を処理
 * @param {MouseEvent} event - マウスイベント
 * @param {Function} scheduleRender - 再描画要求関数
 */
function handleContextMenu(event, scheduleRender) {
  const canvasElement = document.getElementById('three-canvas');
  if (!canvasElement) return;

  const rect = canvasElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);

  // 選択可能なオブジェクトを探す
  let targetObject = null;
  for (const hit of intersects) {
    const selectable = findSelectableAncestor(hit.object);
    if (selectable) {
      targetObject = selectable;
      break;
    }
  }

  if (targetObject) {
    // オブジェクトがまだ選択されていなければ選択する
    if (!selectedObjects.includes(targetObject)) {
      selectElement3D(targetObject, scheduleRender, { addToSelection: false });
    }

    // コンテキストメニューを表示
    show3DContextMenu(event.clientX, event.clientY, targetObject, scheduleRender);
  } else {
    // 空の領域を右クリックした場合は汎用メニューを表示
    showEmpty3DContextMenu(event.clientX, event.clientY, scheduleRender);
  }
}

/**
 * 3Dビューの要素用コンテキストメニューを表示
 * @param {number} x - X座標
 * @param {number} y - Y座標
 * @param {THREE.Object3D} targetObject - 対象オブジェクト
 * @param {Function} scheduleRender - 再描画要求関数
 */
function show3DContextMenu(x, y, targetObject, scheduleRender) {
  const selectedCount = selectedObjects.length;
  const isMultipleSelected = selectedCount > 1;

  const menuItems = [
    {
      label: isMultipleSelected ? `${selectedCount}個の要素を非表示` : '要素を非表示',
      icon: '👁️',
      action: () => handle3DHideElements(scheduleRender),
    },
    { separator: true },
    {
      label: 'セクションボックスをかける',
      icon: '📦',
      action: () => handleActivateSectionBoxForSelection(),
    },
    { separator: true },
    {
      label: '選択をリセット',
      icon: '🔄',
      action: () => {
        resetSelection(scheduleRender);
      },
    },
    { separator: true },
    {
      label: 'プロパティをコピー',
      icon: '📋',
      action: () => handle3DCopyProperties(targetObject),
      disabled: isMultipleSelected,
    },
    {
      label: 'この要素にフォーカス',
      icon: '🎯',
      action: () => handle3DFocusElement(targetObject),
      disabled: isMultipleSelected,
    },
  ];

  eventBus.emit(InteractionEvents.SHOW_CONTEXT_MENU, { x, y, menuItems });
}

/**
 * 空の3Dビュー領域用コンテキストメニューを表示
 * @param {number} x - X座標
 * @param {number} y - Y座標
 * @param {Function} scheduleRender - 再描画要求関数
 */
function showEmpty3DContextMenu(x, y, scheduleRender) {
  const hasSelection = selectedObjects.length > 0;

  const menuItems = [
    {
      label: '選択をリセット',
      icon: '🔄',
      action: () => {
        resetSelection(scheduleRender);
      },
      disabled: !hasSelection,
    },
    { separator: true },
    {
      label: 'ビューをリセット',
      icon: '🏠',
      action: () => {
        if (controls && typeof controls.reset === 'function') {
          controls.reset();
          if (scheduleRender) scheduleRender();
        }
      },
    },
  ];

  eventBus.emit(InteractionEvents.SHOW_CONTEXT_MENU, { x, y, menuItems });
}

/**
 * 3Dビューで選択された要素を非表示にする
 * @param {Function} scheduleRender - 再描画要求関数
 */
function handle3DHideElements(scheduleRender) {
  if (selectedObjects.length === 0) return;

  const elementsToHide = selectedObjects.map((obj) => ({
    elementType: obj.userData?.elementType,
    elementId: obj.userData?.elementId,
    modelSource: obj.userData?.modelSource,
    object: obj,
  }));

  // 非表示にする
  selectedObjects.forEach((obj) => {
    obj.visible = false;
  });

  // 選択をリセット
  resetSelection(scheduleRender);

  // コールバックを呼び出す
  if (contextMenuActionCallback) {
    contextMenuActionCallback({
      action: 'hide',
      multiple: elementsToHide.length > 1,
      elements: elementsToHide,
    });
  }

  if (scheduleRender) scheduleRender();
}

/**
 * 3Dオブジェクトのプロパティをクリップボードにコピー
 * @param {THREE.Object3D} targetObject - 対象オブジェクト
 */
function handle3DCopyProperties(targetObject) {
  const userData = targetObject.userData || {};

  const properties = {
    タイプ: userData.elementType || '-',
    ID: userData.elementId || '-',
    名前: userData.name || '-',
    GUID: userData.guid || '-',
    ステータス:
      userData.modelSource === 'matched'
        ? '一致'
        : userData.modelSource === 'onlyA'
          ? 'Aのみ'
          : userData.modelSource === 'onlyB'
            ? 'Bのみ'
            : '-',
  };

  // 位置情報を追加
  if (targetObject.position) {
    properties['位置'] =
      `(${targetObject.position.x.toFixed(2)}, ${targetObject.position.y.toFixed(2)}, ${targetObject.position.z.toFixed(2)})`;
  }

  // 断面情報があれば追加
  if (userData.section) {
    properties['断面'] = userData.section;
  }

  const text = Object.entries(properties)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');

  navigator.clipboard
    .writeText(text)
    .then(() => {
      if (contextMenuActionCallback) {
        contextMenuActionCallback({
          action: 'copyProperties',
          success: true,
          properties: properties,
        });
      }
    })
    .catch((err) => {
      logger.error('クリップボードへのコピーに失敗しました:', err);
    });
}

/**
 * 選択要素にセクションボックスを適用する
 */
function handleActivateSectionBoxForSelection() {
  if (selectedObjects.length === 0) return;

  const box = new THREE.Box3();
  for (const obj of selectedObjects) {
    const mainObj = findSelectableAncestor(obj) || obj;
    const objBox = new THREE.Box3().setFromObject(mainObj);
    if (!objBox.isEmpty()) {
      box.union(objBox);
    }
  }

  if (box.isEmpty()) {
    logger.warn(`${WarnCategory.UI} セクションボックス: バウンディングボックスが空です`);
    return;
  }

  eventBus.emit(InteractionEvents.ACTIVATE_SECTION_BOX_FOR_SELECTION, { box3: box });
}

/**
 * 要素にカメラをフォーカスする
 * @param {THREE.Object3D} targetObject - 対象オブジェクト
 */
function handle3DFocusElement(targetObject) {
  if (!targetObject || !controls) return;

  // バウンディングボックスを計算
  const box = new THREE.Box3().setFromObject(targetObject);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  // カメラターゲットを要素の中心に設定
  if (controls.target) {
    controls.target.copy(center);
  }

  // 適切な距離を計算
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  let cameraDistance = maxDim / (2 * Math.tan(fov / 2));
  cameraDistance = Math.max(cameraDistance * 2, 5); // 最小距離を確保

  // カメラ位置を更新
  const direction = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  camera.position.copy(center).add(direction.multiplyScalar(cameraDistance));

  controls.update();
}

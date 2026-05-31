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
import { createLogger, WarnCategory } from '../../utils/logger.js';

const logger = createLogger('interaction');
import {
  scene,
  camera,
  getActiveCamera,
  renderer,
  colorManager,
  controls,
  elementGroups,
} from '../../viewer/index.js';
import { getState } from '../../data/state/globalState.js';
import {
  eventBus,
  SelectionEvents,
  InteractionEvents,
  ToastEvents,
} from '../../data/events/index.js';
import { CAMERA_CONTROLS } from '../../config/renderingConstants.js';

// レイキャスト用オブジェクト
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

/** common/viewerモードが有効でアダプターが利用可能かを返す */
function isCommonViewerReady() {
  return getState('viewer.useCommonViewer') && !!getState('viewer.adapter');
}

// 選択オブジェクト参照（複数選択対応）
/** @type {THREE.Object3D[]} */
let selectedObjects = [];
/** @type {Map<THREE.Object3D, THREE.Material|THREE.Material[]>} */
const originalMaterials = new Map();
/** @type {THREE.Object3D[]} */
let pendingSelectionCandidates = [];
let pendingSelectionCandidateIndex = 0;
const pendingSelectionPointer = {
  clientX: 0,
  clientY: 0,
  hasValue: false,
  isInsideCanvas: false,
};
let pendingSelectionPreviewObject = null;
let pendingSelectionPreviewMaterial = null;
/** @type {{line: THREE.Material|null, sprite: THREE.Material|null, mesh: THREE.Material|null, meshSrcConcrete: THREE.Material|null}} */
const selectionCandidateMaterialCache = {
  line: null,
  sprite: null,
  mesh: null,
  meshSrcConcrete: null,
};
let interactionScheduleRender = null;
let isInteractionListenersBound = false;
let boundInteractionCanvasElement = null;
/** @type {(event: MouseEvent) => void | null} */
let handleCanvasMouseEnterRef = null;
/** @type {(event: MouseEvent) => void | null} */
let handleCanvasMouseMoveRef = null;
/** @type {() => void | null} */
let handleCanvasMouseLeaveRef = null;
/** @type {(event: MouseEvent) => void | null} */
let handleCanvasClickRef = null;
/** @type {(event: PointerEvent) => void | null} */
let handleCanvasContextMenuRef = null;
/** @type {(event: MouseEvent) => void | null} */
let handleWindowMouseMoveRef = null;
/** @type {() => void | null} */
let handleWindowMouseUpRef = null;
/** @type {(event: KeyboardEvent) => void | null} */
let handleWindowKeyDownRef = null;
/** @type {() => void | null} */
let handleWindowBlurRef = null;
/** @type {(event: MouseEvent) => void | null} */
let handleCanvasMouseDownRef = null;
/** @type {() => void | null} */
let handleControlsEndRef = null;
let lastTabSelectionCycleAt = 0;
const TAB_KEY_DEBOUNCE_MS = 16;
const TAB_KEY_REQUEST_ANIMATION_FRAME_THROTTLE_MS = 16;
const TAB_KEY_PRESS_QUEUE_MAX = 12;
const TAB_CANDIDATE_MESSAGE_COOLDOWN_MS = 120;
const TAB_CANDIDATE_MESSAGE_IDLE_DELAY_MS = 180;
let lastPendingSelectionCandidateMessageKey = '';
let lastPendingSelectionCandidateMessageAt = 0;
let pendingSelectionCandidateAnnouncementTimerId = null;
let pendingTabDirectionDelta = 0;
let tabSelectionCycleFrameId = null;
let isTabSelectionCycleScheduled = false;
let isTabSelectionCycleRaf = false;
let isTabSelectionCycleRunning = false;

// 選択数上限
const MAX_SELECTION_COUNT = 100;

// Tab選択サイクリングの候補数上限（安定性のため）
const MAX_SELECTION_CANDIDATES = 10;
const TAB_SELECTION_CYCLE_CANDIDATE_LIMIT = 3;

// ホバー時のレイキャストのスロットリング間隔（ms）
const HOVER_RAYCAST_INTERVAL_MS = 50;
let lastHoverRaycastTime = 0;

// 測定モード中のhoverハイライト色
const MEASUREMENT_HOVER_COLOR_IDLE = 0xff8800; // オレンジ（1点目待ち）
const MEASUREMENT_HOVER_COLOR_FIRST_PICKED = 0x00bb55; // グリーン（2点目待ち）
/** @type {THREE.Object3D|null} */
let measurementHoverObject = null;
/** @type {THREE.Material|THREE.Material[]|null} */
let measurementHoverOriginalMaterial = null;
/** @type {THREE.Material|null} */
let measurementHoverPreviewMaterial = null;

// 回転中心ヘルパー球体のジオメトリパラメータ
const ORBIT_CENTER_RADIUS_MM = 150;
const ORBIT_SPHERE_SEGMENTS = { width: 16, height: 12 };

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
  const geometry = new THREE.SphereGeometry(
    ORBIT_CENTER_RADIUS_MM,
    ORBIT_SPHERE_SEGMENTS.width,
    ORBIT_SPHERE_SEGMENTS.height,
  );
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

/**
 * interactionManager向けに依存性注入で使用する操作ハンドラを返す
 * @returns {Object} interactionManagerに渡すサービス群
 */
export function getInteractionManagerServices() {
  return {
    getSelectedCenter,
    getSelectedObjects,
    createOrUpdateOrbitCenterHelper,
    hideOrbitCenterHelper,
    resetSelection,
  };
}

function clearPendingSelectionCandidates() {
  clearPendingSelectionCandidateAnnouncement();
  pendingSelectionCandidates = [];
  pendingSelectionCandidateIndex = 0;
  lastPendingSelectionCandidateMessageKey = '';
  lastPendingSelectionCandidateMessageAt = 0;
}

function clearPendingSelectionCandidateAnnouncement() {
  if (pendingSelectionCandidateAnnouncementTimerId === null) {
    return;
  }

  clearTimeout(pendingSelectionCandidateAnnouncementTimerId);
  pendingSelectionCandidateAnnouncementTimerId = null;
}

function clearPendingSelectionPreview() {
  if (!pendingSelectionPreviewObject) {
    return false;
  }

  if (pendingSelectionPreviewMaterial) {
    try {
      pendingSelectionPreviewObject.material = pendingSelectionPreviewMaterial;
    } catch (error) {
      logger.warn(`${WarnCategory.UI} 選択候補プレビュー復元に失敗`, error);
    }
  }

  pendingSelectionPreviewObject = null;
  pendingSelectionPreviewMaterial = null;
  return true;
}

function clearPendingSelectionInteraction(scheduleRender) {
  clearPendingSelectionCandidates();
  cancelPendingTabSelectionCycle();
  if (clearPendingSelectionPreview() && scheduleRender) {
    scheduleRender();
  }
}

function cancelPendingTabSelectionCycle() {
  clearPendingSelectionCandidateAnnouncement();
  if (tabSelectionCycleFrameId !== null) {
    if (isTabSelectionCycleRaf && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(tabSelectionCycleFrameId);
    } else if (typeof clearTimeout === 'function') {
      clearTimeout(tabSelectionCycleFrameId);
    }
    tabSelectionCycleFrameId = null;
  }
  pendingTabDirectionDelta = 0;
  isTabSelectionCycleScheduled = false;
  isTabSelectionCycleRaf = false;
  isTabSelectionCycleRunning = false;
}

function scheduleTabSelectionCycleFrame(scheduleRender) {
  if (isTabSelectionCycleScheduled) {
    return;
  }

  isTabSelectionCycleScheduled = true;
  if (typeof requestAnimationFrame === 'function') {
    isTabSelectionCycleRaf = true;
    tabSelectionCycleFrameId = requestAnimationFrame(() =>
      executeTabSelectionCycle(scheduleRender),
    );
    return;
  }

  isTabSelectionCycleRaf = false;
  tabSelectionCycleFrameId = window.setTimeout(
    () => executeTabSelectionCycle(scheduleRender),
    TAB_KEY_REQUEST_ANIMATION_FRAME_THROTTLE_MS,
  );
}

function executeTabSelectionCycle(scheduleRender) {
  tabSelectionCycleFrameId = null;
  isTabSelectionCycleScheduled = false;
  isTabSelectionCycleRaf = false;

  if (isTabSelectionCycleRunning) {
    return;
  }

  isTabSelectionCycleRunning = true;
  try {
    if (pendingTabDirectionDelta === 0) {
      return;
    }

    if (pendingSelectionPointer.isInsideCanvas && pendingSelectionCandidates.length > 1) {
      const candidateCount = pendingSelectionCandidates.length;
      const queuedDelta = pendingTabDirectionDelta;
      if (queuedDelta === 0) {
        return;
      }
      pendingTabDirectionDelta = 0;

      const normalizedDelta = queuedDelta % candidateCount;
      if (normalizedDelta === 0) {
        return;
      }

      const nextIndex =
        (((pendingSelectionCandidateIndex + normalizedDelta) % candidateCount) + candidateCount) %
        candidateCount;
      if (nextIndex !== pendingSelectionCandidateIndex) {
        pendingSelectionCandidateIndex = nextIndex;
        syncPendingSelectionPreview(scheduleRender);
        schedulePendingSelectionCandidateAnnouncement();
      }

      if (pendingTabDirectionDelta !== 0) {
        scheduleTabSelectionCycleFrame(scheduleRender);
      }
    } else {
      pendingTabDirectionDelta = 0;
      lastPendingSelectionCandidateMessageKey = '';
    }
  } finally {
    isTabSelectionCycleRunning = false;
  }
}

function requestTabSelectionCycle(reverse, scheduleRender) {
  const step = typeof reverse === 'boolean' && reverse ? -1 : 1;
  pendingTabDirectionDelta = Math.max(
    -TAB_KEY_PRESS_QUEUE_MAX,
    Math.min(TAB_KEY_PRESS_QUEUE_MAX, pendingTabDirectionDelta + step),
  );
  scheduleTabSelectionCycleFrame(scheduleRender);
}

function updatePendingSelectionPointer(event, isInsideCanvas = true) {
  if (!event || typeof event.clientX !== 'number' || typeof event.clientY !== 'number') {
    return false;
  }

  const didMove =
    !pendingSelectionPointer.hasValue ||
    pendingSelectionPointer.clientX !== event.clientX ||
    pendingSelectionPointer.clientY !== event.clientY ||
    pendingSelectionPointer.isInsideCanvas !== isInsideCanvas;

  pendingSelectionPointer.clientX = event.clientX;
  pendingSelectionPointer.clientY = event.clientY;
  pendingSelectionPointer.hasValue = true;
  pendingSelectionPointer.isInsideCanvas = isInsideCanvas;

  return didMove;
}

export function getNextSelectionCandidateIndex(currentIndex, candidateCount, options = {}) {
  const { reverse = false } = options;
  if (!Number.isFinite(candidateCount) || candidateCount <= 0) {
    return -1;
  }
  if (candidateCount === 1) {
    return 0;
  }

  const normalizedIndex = Number.isFinite(currentIndex)
    ? ((Math.trunc(currentIndex) % candidateCount) + candidateCount) % candidateCount
    : 0;

  return reverse
    ? (normalizedIndex - 1 + candidateCount) % candidateCount
    : (normalizedIndex + 1) % candidateCount;
}

// 左ボタン押下中かどうか
let isPointerDownLeft = false;
// ドラッグ開始判定用の押下座標
const pointerDownPos = { x: 0, y: 0 };
// このドラッグ中に適用済みか
let appliedThisDrag = false;
// 右ボタン押下中かどうか
let isPointerDownRight = false;
// 右クリックドラッグ開始判定用の押下座標
const rightPointerDownPos = { x: 0, y: 0 };
// 右クリックドラッグが発生したか（contextmenu 抑制用）
let appliedThisRightDrag = false;
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
export function resetSelection(scheduleRender) {
  clearPendingSelectionPreview();
  clearPendingSelectionCandidates();

  // common/viewerモードの場合はアダプター経由で選択解除
  if (isCommonViewerReady()) {
    getState('viewer.adapter').clearSelection();
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

  if (scheduleRender) scheduleRender();
}

/**
 * 単一オブジェクトをハイライト（選択リストに追加）
 * @param {THREE.Object3D} obj
 */
function createHighlightMaterial(obj, colorMode = 'highlight') {
  let highlightMat = null;
  if (obj instanceof THREE.Line) {
    highlightMat = colorManager.getMaterial(colorMode, { isLine: true });
  } else if (obj instanceof THREE.Sprite) {
    highlightMat = colorManager.getMaterial(colorMode, { isSprite: true });
  } else if (obj instanceof THREE.Mesh) {
    highlightMat = colorManager.getMaterial(colorMode, { isLine: false });
  }

  if (colorMode === 'selectionCandidate' && highlightMat?.isMaterial) {
    if (obj instanceof THREE.Line) {
      if (!selectionCandidateMaterialCache.line) {
        selectionCandidateMaterialCache.line = highlightMat;
      }
      highlightMat = selectionCandidateMaterialCache.line;
    } else if (obj instanceof THREE.Sprite) {
      if (!selectionCandidateMaterialCache.sprite) {
        selectionCandidateMaterialCache.sprite = highlightMat;
      }
      highlightMat = selectionCandidateMaterialCache.sprite;
    } else if (obj instanceof THREE.Mesh && obj.userData?.isSRCConcrete === true) {
      if (!selectionCandidateMaterialCache.meshSrcConcrete) {
        const srcConcreteMaterial = highlightMat.clone();
        srcConcreteMaterial.transparent = true;
        srcConcreteMaterial.opacity = 0.14;
        srcConcreteMaterial.depthWrite = false;
        selectionCandidateMaterialCache.meshSrcConcrete = srcConcreteMaterial;
      }
      highlightMat = selectionCandidateMaterialCache.meshSrcConcrete;
    } else {
      if (!selectionCandidateMaterialCache.mesh) {
        selectionCandidateMaterialCache.mesh = highlightMat;
      }
      highlightMat = selectionCandidateMaterialCache.mesh;
    }
    if (!highlightMat.userData.isSelectionPreviewMaterial) {
      highlightMat.userData = { ...highlightMat.userData, isSelectionPreviewMaterial: true };
    }
  }

  return highlightMat;
}

function applyHighlightMaterial(obj, colorMode = 'highlight') {
  const highlightMat = createHighlightMaterial(obj, colorMode);
  if (!highlightMat || !obj?.material) {
    return false;
  }

  obj.material = highlightMat;
  return true;
}

function syncPendingSelectionPreview(scheduleRender) {
  const candidate = pendingSelectionCandidates[pendingSelectionCandidateIndex] || null;
  if (pendingSelectionPreviewObject === candidate) {
    return false;
  }

  const didClear = clearPendingSelectionPreview();
  let didApply = false;

  if (candidate) {
    // Axis/Story はhoverプレビューをスキップ（Tab候補としては保持）
    const candidateType = candidate?.userData?.elementType;
    const isAxisOrStory = candidateType === 'Axis' || candidateType === 'Story';
    if (!isAxisOrStory) {
      // 既に選択済み（ハイライト適用済み）の場合、現在のマテリアル（ハイライト）を保存。
      // これにより、プレビュー解除時にハイライトマテリアルに正しく戻る。
      // 注意: 選択解除はその後 originalMaterials から真の元マテリアルを復元する。
      pendingSelectionPreviewObject = candidate;
      pendingSelectionPreviewMaterial = candidate.material;
      didApply = applyHighlightMaterial(candidate, 'selectionCandidate');
      if (!didApply) {
        pendingSelectionPreviewObject = null;
        pendingSelectionPreviewMaterial = null;
      }
    }
  }

  if ((didClear || didApply) && scheduleRender) {
    scheduleRender();
  }

  return didClear || didApply;
}

function handleInteractionCanvasMouseEnter(event) {
  if (!interactionScheduleRender) {
    return;
  }

  updatePendingSelectionPointer(event);
  refreshPendingSelectionCandidates(null, event);
  syncPendingSelectionPreview(interactionScheduleRender);
}

/**
 * 測定モード中のhoverハイライトを更新する（ステップに応じて色を変える）
 * @param {THREE.Object3D|null} object
 */
function syncMeasurementHoverPreview(object) {
  // 前のhoverオブジェクトを復元
  if (measurementHoverObject && measurementHoverObject !== object) {
    clearMeasurementHoverPreview();
  }

  if (!object || object === measurementHoverObject || !object.material) {
    if (interactionScheduleRender) interactionScheduleRender();
    return;
  }

  const step = getMeasurementStep ? getMeasurementStep() : 'idle';
  const color =
    step === 'firstPicked' ? MEASUREMENT_HOVER_COLOR_FIRST_PICKED : MEASUREMENT_HOVER_COLOR_IDLE;

  measurementHoverObject = object;
  measurementHoverOriginalMaterial = object.material;

  let mat;
  if (object instanceof THREE.Line) {
    mat = new THREE.LineBasicMaterial({ color, depthTest: false });
  } else if (object instanceof THREE.Mesh) {
    mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.75,
      depthTest: false,
    });
  } else {
    measurementHoverObject = null;
    measurementHoverOriginalMaterial = null;
    return;
  }
  object.material = mat;
  measurementHoverPreviewMaterial = mat;
  if (interactionScheduleRender) interactionScheduleRender();
}

/** 測定モードのhoverハイライトをクリアして元マテリアルに戻す */
function clearMeasurementHoverPreview() {
  if (measurementHoverObject && measurementHoverOriginalMaterial !== null) {
    try {
      measurementHoverObject.material = measurementHoverOriginalMaterial;
    } catch (error) {
      logger.warn(`${WarnCategory.UI} 測定hoverプレビューのマテリアル復元に失敗`, error);
    }
  }

  if (measurementHoverPreviewMaterial) {
    measurementHoverPreviewMaterial.dispose();
  }

  measurementHoverObject = null;
  measurementHoverOriginalMaterial = null;
  measurementHoverPreviewMaterial = null;
}

function handleInteractionCanvasMouseMove(event) {
  if (!interactionScheduleRender) {
    return;
  }

  updatePendingSelectionPointer(event);
  const now = performance.now();
  if (now - lastHoverRaycastTime < HOVER_RAYCAST_INTERVAL_MS) {
    return;
  }

  lastHoverRaycastTime = now;

  if (getMeasurementModeActive && getMeasurementModeActive()) {
    const intersects = performRaycast(pendingSelectionPointer) || [];
    const hit = intersects.find((i) => i.object?.userData?.elementType !== 'Measurement');
    syncMeasurementHoverPreview(hit?.object || null);
    return;
  }

  // 測定モード解除直後にhoverが残らないようクリア
  if (measurementHoverObject) clearMeasurementHoverPreview();

  refreshPendingSelectionCandidates(null, event);
  syncPendingSelectionPreview(interactionScheduleRender);
}

function handleInteractionCanvasMouseLeave() {
  if (!interactionScheduleRender) {
    return;
  }

  pendingSelectionPointer.isInsideCanvas = false;
  clearMeasurementHoverPreview();
  clearPendingSelectionInteraction(interactionScheduleRender);
}

function handleInteractionCanvasClick(event) {
  if (!interactionScheduleRender) {
    return;
  }

  // mousedown からの移動距離が閾値以上の場合はドラッグ操作なので選択・測定をスキップ
  // （mouseup 後に click が発火するため appliedThisDrag は使えない）
  const clickDx = event.clientX - pointerDownPos.x;
  const clickDy = event.clientY - pointerDownPos.y;
  if (Math.hypot(clickDx, clickDy) >= DRAG_APPLY_THRESHOLD_PX) {
    return;
  }

  if (getMeasurementModeActive && getMeasurementModeActive()) {
    clearMeasurementHoverPreview();
    const intersects = performRaycast(event);
    if (intersects && intersects.length > 0) {
      const hit = intersects.find((i) => i.object?.userData?.elementType !== 'Measurement');
      if (hit && dispatchToMeasurementManager) {
        dispatchToMeasurementManager(hit);
      }
    }
    return;
  }

  processElementSelection(event, interactionScheduleRender);
}

function handleInteractionCanvasContextMenu(event) {
  if (!interactionScheduleRender) {
    return;
  }

  event.preventDefault();

  // 右クリックドラッグ（カメラ操作）後はメニューを表示しない
  if (appliedThisRightDrag) {
    appliedThisRightDrag = false;
    return;
  }
  appliedThisRightDrag = false;

  handleContextMenu(event, interactionScheduleRender);
}

function handleInteractionCanvasMouseDown(event) {
  if (!interactionScheduleRender) {
    return;
  }

  if (event.button === 0) {
    isPointerDownLeft = true;
    appliedThisDrag = false;
    pointerDownPos.x = event.clientX;
    pointerDownPos.y = event.clientY;
  } else if (event.button === 2) {
    isPointerDownRight = true;
    appliedThisRightDrag = false;
    rightPointerDownPos.x = event.clientX;
    rightPointerDownPos.y = event.clientY;
  }
}

function handleInteractionWindowMouseMove(event) {
  if (!interactionScheduleRender) {
    return;
  }

  if (isPointerDownLeft && !appliedThisDrag) {
    const dx = event.clientX - pointerDownPos.x;
    const dy = event.clientY - pointerDownPos.y;
    if (Math.hypot(dx, dy) >= DRAG_APPLY_THRESHOLD_PX) {
      appliedThisDrag = true;
      if (interactionScheduleRender) {
        interactionScheduleRender();
      }
    }
  }

  if (isPointerDownRight && !appliedThisRightDrag) {
    const dx = event.clientX - rightPointerDownPos.x;
    const dy = event.clientY - rightPointerDownPos.y;
    if (Math.hypot(dx, dy) >= DRAG_APPLY_THRESHOLD_PX) {
      appliedThisRightDrag = true;
    }
  }
}

function handleInteractionWindowMouseUp(event) {
  if (event.button === 0) {
    isPointerDownLeft = false;
    appliedThisDrag = false;
  } else if (event.button === 2) {
    isPointerDownRight = false;
    // appliedThisRightDrag は contextmenu ハンドラーが使うため、そこでリセット
  }
}

function handleInteractionWindowKeyDown(event) {
  handleSelectionKeyDown(event, interactionScheduleRender);
}

function handleInteractionWindowBlur() {
  if (!interactionScheduleRender) {
    return;
  }

  clearPendingSelectionInteraction(interactionScheduleRender);
}

function clearInteractionListeners() {
  cancelPendingTabSelectionCycle();
  if (!isInteractionListenersBound) {
    return;
  }

  if (boundInteractionCanvasElement) {
    if (handleCanvasMouseEnterRef) {
      boundInteractionCanvasElement.removeEventListener(
        'mouseenter',
        handleCanvasMouseEnterRef,
        false,
      );
      boundInteractionCanvasElement.removeEventListener(
        'mousemove',
        handleCanvasMouseMoveRef,
        false,
      );
      boundInteractionCanvasElement.removeEventListener(
        'mouseleave',
        handleCanvasMouseLeaveRef,
        false,
      );
      boundInteractionCanvasElement.removeEventListener('click', handleCanvasClickRef, false);
      boundInteractionCanvasElement.removeEventListener(
        'contextmenu',
        handleCanvasContextMenuRef,
        false,
      );
      boundInteractionCanvasElement.removeEventListener(
        'mousedown',
        handleCanvasMouseDownRef,
        false,
      );
    }
  }

  if (handleWindowMouseMoveRef) {
    window.removeEventListener('mousemove', handleWindowMouseMoveRef, false);
  }
  if (handleWindowMouseUpRef) {
    window.removeEventListener('mouseup', handleWindowMouseUpRef, false);
  }
  if (handleWindowKeyDownRef) {
    window.removeEventListener('keydown', handleWindowKeyDownRef, true);
  }
  if (handleWindowBlurRef) {
    window.removeEventListener('blur', handleWindowBlurRef, false);
  }
  if (controls && typeof controls.removeEventListener === 'function' && handleControlsEndRef) {
    controls.removeEventListener('end', handleControlsEndRef);
  }

  isInteractionListenersBound = false;
  boundInteractionCanvasElement = null;
  handleCanvasMouseEnterRef = null;
  handleCanvasMouseMoveRef = null;
  handleCanvasMouseLeaveRef = null;
  handleCanvasClickRef = null;
  handleCanvasContextMenuRef = null;
  handleWindowMouseMoveRef = null;
  handleWindowMouseUpRef = null;
  handleWindowKeyDownRef = null;
  handleWindowBlurRef = null;
  handleCanvasMouseDownRef = null;
  handleControlsEndRef = null;
  interactionScheduleRender = null;
}

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

  applyHighlightMaterial(obj, 'highlight');
  selectedObjects.push(obj);
}

/**
 * 3Dオブジェクトを直接選択してハイライト表示する
 * ツリービューからの呼び出し用（常に単一選択）
 * @param {THREE.Object3D} obj - 選択するThree.jsオブジェクト
 * @param {Function} scheduleRender - 再描画要求関数
 * @param {Object} [options] - 互換用オプション
 */
export function selectElement3D(obj, scheduleRender, options = {}) {
  void options;
  if (!obj || !obj.userData) {
    logger.warn(`${WarnCategory.UI} 選択: 無効なオブジェクトが指定されました`);
    return;
  }

  const userData = obj.userData;
  const elementType = userData.elementType || userData.stbNodeType;

  // Axis と Story 以外の場合のみハイライト処理を実行
  if (elementType && elementType !== 'Axis' && elementType !== 'Story') {
    // common/viewerモードの場合はアダプター経由で選択
    if (isCommonViewerReady()) {
      const adapter = getState('viewer.adapter');
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
 * @param {Object} [options] - オプション
 * @param {boolean} [options.clearPrevious=true] - 既存選択をクリアするか（デフォルト: true）
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
  } else if (modelSource === 'A' || modelSource === 'onlyA') {
    idA = userData.elementIdA || userData.elementId;
  } else if (modelSource === 'B' || modelSource === 'onlyB') {
    idB = userData.elementIdB || userData.elementId;
  } else {
    // フォールバック
    idA = userData.elementId;
  }

  return { idA, idB };
}

/**
 * 選択要素タイプを表示用に正規化
 * @param {Object} userData
 * @returns {string|null}
 */
function normalizeSelectedElementType(userData) {
  const elementType = userData?.elementType || userData?.stbNodeType || null;
  return elementType === 'Column (fallback line)' ? 'Column' : elementType;
}

/**
 * モデルソースを A/B に正規化
 * @param {string|null|undefined} modelSource
 * @returns {'A'|'B'|null}
 */
function normalizeSelectionModelSide(modelSource) {
  if (modelSource === 'A' || modelSource === 'onlyA') {
    return 'A';
  }
  if (modelSource === 'B' || modelSource === 'onlyB') {
    return 'B';
  }
  return null;
}

/**
 * 2要素選択から比較対象を解決する
 * @param {THREE.Object3D[]} objects
 * @returns {{idA: string, idB: string, elementType: string, modelSource: 'matched'}|null}
 */
export function resolveTwoObjectComparisonTarget(objects) {
  if (!Array.isArray(objects) || objects.length !== 2) {
    return null;
  }

  const selectionInfo = objects.map((obj) => {
    const userData = obj?.userData;
    if (!userData || userData.modelSource === 'matched') {
      return null;
    }

    const elementType = normalizeSelectedElementType(userData);
    const side = normalizeSelectionModelSide(userData.modelSource);
    if (!elementType || !side) {
      return null;
    }

    const { idA, idB } = getElementIds(userData);
    return { elementType, side, idA, idB };
  });

  if (selectionInfo.some((info) => !info)) {
    return null;
  }

  if (selectionInfo[0].elementType !== selectionInfo[1].elementType) {
    return null;
  }

  const infoA = selectionInfo.find((info) => info.side === 'A');
  const infoB = selectionInfo.find((info) => info.side === 'B');
  if (!infoA || !infoB || !infoA.idA || !infoB.idB) {
    return null;
  }

  return {
    idA: String(infoA.idA),
    idB: String(infoB.idB),
    elementType: infoA.elementType,
    modelSource: 'matched',
  };
}

/**
 * 複数選択サマリー情報を生成
 * @param {THREE.Object3D[]} objects
 * @returns {{
 *   count: number,
 *   typeCounts: Array<{elementType: string, count: number}>,
 *   modelSourceCounts: {A: number, B: number, matched: number, unknown: number}
 * }}
 */
function buildMultiSelectionSummaryData(objects) {
  const safeObjects = Array.isArray(objects) ? objects : [];

  // 要素タイプ別にカウント
  const typeCounts = new Map();
  const modelSourceCounts = { A: 0, B: 0, matched: 0, unknown: 0 };

  for (const obj of safeObjects) {
    const userData = obj?.userData || {};
    const elementType = normalizeSelectedElementType(userData) || 'Unknown';
    typeCounts.set(elementType, (typeCounts.get(elementType) || 0) + 1);

    const normalizedSource = normalizeSelectionModelSide(userData.modelSource);
    if (normalizedSource) {
      modelSourceCounts[normalizedSource]++;
    } else if (userData.modelSource === 'matched') {
      modelSourceCounts.matched++;
    } else {
      modelSourceCounts.unknown++;
    }
  }

  return {
    count: safeObjects.length,
    typeCounts: Array.from(typeCounts.entries())
      .map(([elementType, count]) => ({ elementType, count }))
      .sort((left, right) => left.elementType.localeCompare(right.elementType, 'ja')),
    modelSourceCounts,
  };
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

  raycaster.setFromCamera(mouse, getActiveCamera() || camera);

  return raycaster.intersectObjects(scene.children, true);
}

export function collectSelectionCandidates(intersects, options = {}) {
  const { includeAxisStory = true } = options;
  const lineCandidates = [];
  const meshOrSpriteCandidates = [];
  const axisOrStoryCandidates = [];
  const seenObjects = new Set();

  for (const intersect of Array.isArray(intersects) ? intersects : []) {
    const obj = intersect?.object;
    const userData = obj?.userData;
    const elementType = userData?.elementType || userData?.stbNodeType;
    const groupVisible = elementType ? elementGroups[elementType]?.visible : false;

    if (!obj || !elementType || !groupVisible || !obj.visible || isPointClipped(intersect?.point)) {
      continue;
    }
    if (seenObjects.has(obj)) {
      continue;
    }
    seenObjects.add(obj);

    const isAxisOrStory = elementType === 'Axis' || elementType === 'Story';
    if (isAxisOrStory) {
      if (includeAxisStory) {
        axisOrStoryCandidates.push(obj);
      }
      continue;
    }

    if (obj instanceof THREE.Line) {
      lineCandidates.push(obj);
    } else if (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite) {
      meshOrSpriteCandidates.push(obj);
    }
  }

  const merged = [...lineCandidates, ...meshOrSpriteCandidates, ...axisOrStoryCandidates];
  return merged.length > MAX_SELECTION_CANDIDATES
    ? merged.slice(0, MAX_SELECTION_CANDIDATES)
    : merged;
}

/**
 * 交差点がレンダラーのクリッピング平面によって切り取られているか判定する
 * @param {THREE.Vector3} point - 交差点のワールド座標
 * @returns {boolean} クリップされている（不可視）場合 true
 */
function isPointClipped(point) {
  if (!renderer || !renderer.localClippingEnabled) return false;
  const planes = renderer.clippingPlanes;
  if (!planes || planes.length === 0) return false;
  for (const plane of planes) {
    if (plane.distanceToPoint(point) < 0) return true;
  }
  return false;
}

/**
 * 交差結果から優先度に基づいて最適なオブジェクトを選択
 * 優先順位: 線要素 > 面要素 > Axis/Story
 * @param {THREE.Intersection[]} intersects - レイキャストの交差結果
 * @returns {THREE.Object3D|null} 選択すべきオブジェクト
 */
function findBestIntersection(intersects) {
  return collectSelectionCandidates(intersects, { includeAxisStory: false })[0] || null;
}

function refreshPendingSelectionCandidates(intersects = null, event = null) {
  let didPointerMove = false;
  if (event) {
    didPointerMove = updatePendingSelectionPointer(event);
  }

  if (!pendingSelectionPointer.isInsideCanvas || !pendingSelectionPointer.hasValue) {
    clearPendingSelectionCandidates();
    return [];
  }

  const currentCandidate = pendingSelectionCandidates[pendingSelectionCandidateIndex] || null;
  const currentIntersects = intersects || performRaycast(pendingSelectionPointer) || [];
  const nextCandidates = collectSelectionCandidates(currentIntersects, {
    includeAxisStory: true,
  }).slice(0, TAB_SELECTION_CYCLE_CANDIDATE_LIMIT);

  pendingSelectionCandidates = nextCandidates;
  if (nextCandidates.length === 0) {
    pendingSelectionCandidateIndex = 0;
    return nextCandidates;
  }

  if (didPointerMove) {
    pendingSelectionCandidateIndex = 0;
    lastPendingSelectionCandidateMessageKey = '';
    return nextCandidates;
  }

  const preservedIndex = currentCandidate ? nextCandidates.indexOf(currentCandidate) : -1;
  pendingSelectionCandidateIndex = preservedIndex >= 0 ? preservedIndex : 0;

  return nextCandidates;
}

function buildPendingSelectionCandidateMessage(candidate, candidateIndex, candidateCount) {
  const userData = candidate?.userData || {};
  const elementType =
    normalizeSelectedElementType(userData) ||
    userData.elementType ||
    userData.stbNodeType ||
    'Unknown';
  const { idA, idB } = getElementIds(userData);
  const elementId = idA || idB || userData.elementId || userData.id || '-';
  const modelSource =
    userData.modelSource === 'matched'
      ? 'A/B'
      : normalizeSelectionModelSide(userData.modelSource) || userData.modelSource || '-';

  return `選択候補 ${candidateIndex + 1}/${candidateCount}: ${elementType} ${elementId} [${modelSource}]`;
}

function announcePendingSelectionCandidate() {
  const candidate = pendingSelectionCandidates[pendingSelectionCandidateIndex];
  if (!candidate) {
    return;
  }

  const now = performance.now();
  if (now - lastPendingSelectionCandidateMessageAt < TAB_CANDIDATE_MESSAGE_COOLDOWN_MS) {
    return;
  }

  const userData = candidate?.userData || {};
  const candidateMessageKey = `${pendingSelectionCandidateIndex}|${
    userData.elementIdA || userData.elementId || userData.id || '-'
  }|${userData.elementIdB || userData.elementId || userData.id || '-'}|${
    userData.elementType || userData.stbNodeType || 'Unknown'
  }`;
  if (candidateMessageKey === lastPendingSelectionCandidateMessageKey) {
    return;
  }
  lastPendingSelectionCandidateMessageKey = candidateMessageKey;
  lastPendingSelectionCandidateMessageAt = now;

  eventBus.emit(ToastEvents.SHOW_INFO, {
    message: buildPendingSelectionCandidateMessage(
      candidate,
      pendingSelectionCandidateIndex,
      pendingSelectionCandidates.length,
    ),
    options: {
      duration: 1500,
      closable: false,
    },
  });
}

function schedulePendingSelectionCandidateAnnouncement() {
  clearPendingSelectionCandidateAnnouncement();
  pendingSelectionCandidateAnnouncementTimerId = window.setTimeout(() => {
    pendingSelectionCandidateAnnouncementTimerId = null;
    announcePendingSelectionCandidate();
  }, TAB_CANDIDATE_MESSAGE_IDLE_DELAY_MS);
}

export function cyclePendingSelectionCandidate(options = {}, scheduleRender = null) {
  const { reverse = false } = options;
  const candidateCount = pendingSelectionCandidates.length;
  // 既存の候補をそのまま使用（レイキャストを再実行しない）
  if (candidateCount <= 1) {
    return false;
  }

  const nextIndex = getNextSelectionCandidateIndex(pendingSelectionCandidateIndex, candidateCount, {
    reverse,
  });
  // 無効な結果（候補数異常時の -1）に対する防御
  if (nextIndex < 0 || nextIndex >= candidateCount) {
    pendingSelectionCandidateIndex = 0;
  } else {
    pendingSelectionCandidateIndex = nextIndex;
  }
  syncPendingSelectionPreview(scheduleRender);
  announcePendingSelectionCandidate();
  return true;
}

function handleSelectionKeyDown(event, scheduleRender) {
  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target?.isContentEditable
  ) {
    return;
  }

  // Tab: ブラウザのフォーカス移動を抑制（隠れた要素の巡回によるフリーズ防止）
  // キャンバス上では候補サイクリング、キャンバス外では単にフォーカス移動を抑制
  if (event.key === 'Tab') {
    const now = performance.now();
    if (now - lastTabSelectionCycleAt < TAB_KEY_DEBOUNCE_MS) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (!pendingSelectionCandidates.length) {
      lastPendingSelectionCandidateMessageKey = '';
    }
    lastTabSelectionCycleAt = now;
    requestTabSelectionCycle(event.shiftKey, scheduleRender);
    return;
  }

  // Escape: プレビュー/候補をキャンセル
  if (event.key === 'Escape' && pendingSelectionCandidates.length > 0) {
    clearPendingSelectionInteraction(scheduleRender);
    return;
  }
}

// 候補のクリアは Escape, mouseleave, click で行う。

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
    const displayType = normalizeSelectedElementType(singleUserData);

    // 継手要素の場合はuserData.idをそのまま使用（"joint_165_start"形式）
    let idA, idB;
    if (displayType === 'Joint') {
      const isModelB = singleUserData.modelSource === 'B' || singleUserData.modelSource === 'onlyB';
      idA = isModelB ? null : singleUserData.id;
      idB = isModelB ? singleUserData.id : null;
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
    const comparisonTarget = resolveTwoObjectComparisonTarget(selectedObjects);
    if (comparisonTarget) {
      eventBus.emit(InteractionEvents.DISPLAY_ELEMENT_INFO, comparisonTarget);
    } else {
      eventBus.emit(
        InteractionEvents.DISPLAY_MULTI_SELECTION_INFO,
        buildMultiSelectionSummaryData(selectedObjects),
      );
    }

    // 複数選択イベントを発行
    const selectedIds = selectedObjects.map((obj) => {
      const ud = obj.userData;
      return {
        elementType: normalizeSelectedElementType(ud),
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
  updatePendingSelectionPointer(event);

  const intersects = performRaycast(event);
  if (!intersects) return;

  // Ctrlキーが押されているか確認（複数選択モード）
  const isMultiSelectMode = event.ctrlKey || event.metaKey;

  // Ctrlなしの場合は既存の選択を解除
  if (!isMultiSelectMode) {
    resetSelection(scheduleRender);
  }

  // プレ選択候補がある場合は現在の候補を使用、なければレイキャストから取得
  const candidates = refreshPendingSelectionCandidates(intersects, event);
  const objectToSelect =
    candidates.length > 0
      ? candidates[pendingSelectionCandidateIndex] || candidates[0]
      : findBestIntersection(intersects);

  // クリック確定後はプレビュー状態と候補をクリア
  clearPendingSelectionPreview();
  clearPendingSelectionCandidates();

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
/** @type {Function|null} */
let getMeasurementModeActive = null;
/** @type {Function|null} */
let dispatchToMeasurementManager = null;
/** @type {Function|null} 現在のステップ（'idle'|'firstPicked'）を返す */
let getMeasurementStep = null;

/**
 * インタラクションイベントリスナーを設定
 * @param {Function} scheduleRender - 再描画要求関数
 * @param {Object} [options] - オプション
 * @param {Function} [options.onContextMenuAction] - コンテキストメニューアクションのコールバック
 * @param {Function} [options.getMeasurementModeActive] - 測定モード判定関数
 * @param {Function} [options.dispatchToMeasurementManager] - 測定クリック委譲関数
 * @param {Function} [options.getMeasurementStep] - 現在の測定ステップを返す関数
 */
export function setupInteractionListeners(scheduleRender, options = {}) {
  clearInteractionListeners();
  interactionScheduleRender = scheduleRender;
  contextMenuActionCallback = options.onContextMenuAction || null;
  getMeasurementModeActive = options.getMeasurementModeActive || null;
  dispatchToMeasurementManager = options.dispatchToMeasurementManager || null;
  getMeasurementStep = options.getMeasurementStep || null;

  // 繧ｳ繝ｳ繝・く繧ｹ繝医Γ繝九Η繝ｼ繧ｪ蜿ｨ繧ｯ繧ｹ繧ｻ繝ｫ縺吶ｋ
  eventBus.emit(InteractionEvents.INIT_CONTEXT_MENU);

  const canvasElement = document.getElementById('three-canvas');
  if (!canvasElement) {
    logger.error('Canvas element not found for click listener.');
    return;
  }

  handleCanvasMouseEnterRef = handleInteractionCanvasMouseEnter;
  handleCanvasMouseMoveRef = handleInteractionCanvasMouseMove;
  handleCanvasMouseLeaveRef = handleInteractionCanvasMouseLeave;
  handleCanvasClickRef = handleInteractionCanvasClick;
  handleCanvasContextMenuRef = handleInteractionCanvasContextMenu;
  handleCanvasMouseDownRef = handleInteractionCanvasMouseDown;
  handleWindowMouseMoveRef = handleInteractionWindowMouseMove;
  handleWindowMouseUpRef = handleInteractionWindowMouseUp;
  handleWindowKeyDownRef = handleInteractionWindowKeyDown;
  handleWindowBlurRef = handleInteractionWindowBlur;

  canvasElement.addEventListener('mouseenter', handleCanvasMouseEnterRef, false);
  canvasElement.addEventListener('mousemove', handleCanvasMouseMoveRef, false);
  canvasElement.addEventListener('mouseleave', handleCanvasMouseLeaveRef, false);
  canvasElement.addEventListener('click', handleCanvasClickRef, false);
  canvasElement.addEventListener('contextmenu', handleCanvasContextMenuRef, false);
  canvasElement.addEventListener('mousedown', handleCanvasMouseDownRef, false);

  window.addEventListener('mousemove', handleWindowMouseMoveRef, false);
  window.addEventListener('mouseup', handleWindowMouseUpRef, false);
  // キャプチャフェーズで登録: ブラウザのTab移動処理より先にpreventDefaultが確実に効き、
  // 大量のフォーカス可能要素がある場合のフリーズを防ぐ
  window.addEventListener('keydown', handleWindowKeyDownRef, true);
  window.addEventListener('blur', handleWindowBlurRef, false);

  if (controls && typeof controls.addEventListener === 'function') {
    handleControlsEndRef = () => {
      appliedThisDrag = false;
      appliedThisRightDrag = false;
    };
    controls.addEventListener('end', handleControlsEndRef);
  }

  isInteractionListenersBound = true;
  boundInteractionCanvasElement = canvasElement;
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

  raycaster.setFromCamera(mouse, getActiveCamera() || camera);
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

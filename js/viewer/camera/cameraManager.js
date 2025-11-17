/**
 * @fileoverview カメラモード管理モジュール
 *
 * PerspectiveCamera（3Dモード）とOrthographicCamera（2Dモード）の
 * 切り替えを管理します。
 */

import * as THREE from "three";
import {
  camera,
  orthographicCamera,
  controls,
  getActiveCamera,
  setActiveCamera,
  scene,
  renderer,
} from "../core/core.js";

/**
 * カメラモード定数
 */
export const CAMERA_MODES = {
  PERSPECTIVE: "perspective",
  ORTHOGRAPHIC: "orthographic",
};

// 現在のカメラモード
let currentMode = CAMERA_MODES.PERSPECTIVE;

/**
 * 現在のカメラモードを取得
 * @returns {string} 現在のカメラモード
 */
export function getCameraMode() {
  return currentMode;
}

/**
 * カメラモードを切り替え
 * @param {string} mode - 新しいカメラモード（'perspective' または 'orthographic'）
 * @param {number} [transitionDuration=0] - トランジション時間（ミリ秒、未実装）
 * @returns {boolean} 切り替えが成功したかどうか
 */
export function setCameraMode(mode, transitionDuration = 0) {
  if (mode !== CAMERA_MODES.PERSPECTIVE && mode !== CAMERA_MODES.ORTHOGRAPHIC) {
    console.warn("[CameraManager] Invalid camera mode:", mode);
    return false;
  }

  if (currentMode === mode) {
    return false; // 既に同じモード
  }

  const oldCamera = getActiveCamera();
  const newCamera =
    mode === CAMERA_MODES.PERSPECTIVE ? camera : orthographicCamera;

  if (!newCamera) {
    console.error("[CameraManager] Camera not initialized:", mode);
    return false;
  }

  // 現在のカメラの位置と向きを新しいカメラにコピー
  if (oldCamera && oldCamera !== newCamera) {
    console.log(
      "[CameraManager] Copying camera state from",
      oldCamera.type,
      "to",
      newCamera.type
    );
    console.log("[CameraManager] Old camera position:", oldCamera.position);
    newCamera.position.copy(oldCamera.position);
    newCamera.up.copy(oldCamera.up);
    newCamera.rotation.copy(oldCamera.rotation);

    // OrthographicCameraに切り替える場合、frustumサイズを調整
    if (newCamera.isOrthographicCamera && controls && controls._cc) {
      const target = controls._cc.getTarget(new THREE.Vector3());
      const distance = newCamera.position.distanceTo(target);
      const aspect = window.innerWidth / window.innerHeight;

      // 距離に基づいてfrustumサイズを設定
      const frustumHeight = distance * 0.5; // 視野を調整
      const frustumWidth = frustumHeight * aspect;

      newCamera.left = -frustumWidth / 2;
      newCamera.right = frustumWidth / 2;
      newCamera.top = frustumHeight / 2;
      newCamera.bottom = -frustumHeight / 2;
      newCamera.zoom = 1.0; // ズームをリセット

      console.log(
        "[CameraManager] Adjusted orthographic frustum based on distance:",
        distance,
        {
          left: newCamera.left,
          right: newCamera.right,
          top: newCamera.top,
          bottom: newCamera.bottom,
          zoom: newCamera.zoom,
        }
      );
    }

    newCamera.updateProjectionMatrix();
    console.log("[CameraManager] New camera position:", newCamera.position);
  }

  // カメラを切り替え
  setActiveCamera(newCamera);
  currentMode = mode;
  console.log("[CameraManager] Active camera is now:", newCamera.type);

  // コントロールのカメラを更新
  if (controls && controls._cc) {
    const oldTarget = controls._cc.getTarget(new THREE.Vector3());
    controls._cc.camera = newCamera;
    // ターゲットを維持
    controls._cc.setTarget(oldTarget.x, oldTarget.y, oldTarget.z, false);
  }

  // カメラモードに応じてコントロールを更新
  updateControlsForMode(mode);

  console.log("[CameraManager] Camera mode changed:", mode);
  return true;
}

/**
 * カメラモードに応じてコントロールを更新
 * @param {string} mode - カメラモード
 * @private
 */
function updateControlsForMode(mode) {
  if (!controls) return;

  if (mode === CAMERA_MODES.ORTHOGRAPHIC) {
    // 2Dモード: 回転を無効化し、ズームとパンを有効化
    controls.enableRotate = false;
    controls.enableZoom = true; // CameraControls の標準ズーム（Orthographic では zoom 変更）
    controls.enablePan = true;

    // Orthographic 用の各種設定
    if ("dollyToCursor" in controls) controls.dollyToCursor = true;
    // infinityDolly は OrthographicCamera では無関係なので設定しない
    // if ("infinityDolly" in controls) controls.infinityDolly = true;

    // ズーム範囲と速度（必要に応じて調整可）
    if (controls._cc) {
      controls._cc.minZoom = 0.01;
      controls._cc.maxZoom = 50;
      controls._cc.dollySpeed = 1.0;
    }

    // 左ドラッグでパン、ホイールでズーム
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };

    console.log("[CameraManager] 2D mode settings applied:", {
      enableRotate: controls.enableRotate,
      enableZoom: controls.enableZoom,
      enablePan: controls.enablePan,
      dollyToCursor: controls.dollyToCursor,
      minZoom: controls._cc?.minZoom,
      maxZoom: controls._cc?.maxZoom,
    });
  } else {
    // 3Dモード: 回転・ズーム・パンすべて有効
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.enablePan = true;

    if ("dollyToCursor" in controls) controls.dollyToCursor = false;
    if ("infinityDolly" in controls) controls.infinityDolly = false;

    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
  }
}

/**
 * カメラモードをトグル（3D ↔ 2D）
 * @returns {string} 新しいカメラモード
 */
export function toggleCameraMode() {
  const newMode =
    currentMode === CAMERA_MODES.PERSPECTIVE
      ? CAMERA_MODES.ORTHOGRAPHIC
      : CAMERA_MODES.PERSPECTIVE;

  setCameraMode(newMode);
  return newMode;
}

/**
 * OrthographicCameraのズームサイズを設定
 * @param {number} size - frustumサイズ（mm単位）
 */
export function setOrthographicSize(size) {
  if (!orthographicCamera) {
    console.warn("[CameraManager] OrthographicCamera not initialized");
    return;
  }

  const aspect = orthographicCamera.right / orthographicCamera.top;
  orthographicCamera.left = (-size * aspect) / 2;
  orthographicCamera.right = (size * aspect) / 2;
  orthographicCamera.top = size / 2;
  orthographicCamera.bottom = -size / 2;
  orthographicCamera.updateProjectionMatrix();
}

/**
 * カメラマネージャーの状態をデバッグ出力
 * @returns {Object} デバッグ情報
 */
export function getDebugInfo() {
  return {
    currentMode,
    activeCameraType: getActiveCamera()?.type || "none",
    perspectiveCameraExists: !!camera,
    orthographicCameraExists: !!orthographicCamera,
    controlsEnabled: {
      rotate: controls?.enableRotate,
      zoom: controls?.enableZoom,
      pan: controls?.enablePan,
    },
  };
}

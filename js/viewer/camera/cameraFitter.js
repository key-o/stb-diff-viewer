/**
 * @fileoverview カメラフィッティングモジュール
 *
 * モデルに合わせてカメラ位置を調整する機能を提供します:
 * - バウンディングボックスに基づくカメラ位置の自動調整
 * - 視野角の最適化
 * - 選択要素へのフォーカス
 * - モデル全体へのフィット
 */

import * as THREE from 'three';
import { createLogger } from '../../utils/logger.js';
import { camera, controls, scene } from '../index.js';
import { getSelectedObjects } from '../../interaction.js';

const log = createLogger('viewer:camera');

/**
 * モデル全体のバウンディングボックスに合わせてカメラの位置とターゲットを調整する。
 * - モデルが空ならデフォルト位置
 * - 点データなら中心から一定距離
 * - 通常はモデルサイズから最適な距離・向きにカメラを配置
 * @param {THREE.Box3} modelBounds - モデル全体のバウンディングボックス (mm単位)。
 * @param {THREE.PerspectiveCamera} camera - 調整するカメラ。
 * @param {OrbitControls} controls - 調整するコントロール。
 */
export function adjustCameraToFitModel(modelBounds, camera, controls) {
  if (modelBounds.isEmpty()) {
    // モデルが空の場合のみ、controls.targetを原点にリセット
    // ただし、既にユーザーが設定した回転中心がある場合は保持する
    const currentTarget = controls.target.clone();
    const isDefaultTarget = currentTarget.equals(new THREE.Vector3(0, 0, 0));

    if (isDefaultTarget) {
      controls.target.set(0, 0, 0);
    }
    // ★★★ デフォルト位置も mm 単位に（左前から）★★★
    camera.position.set(-10000, -10000, 20000); // -10m, -10m, 20m
    // 広いモデルでも自由に回せるよう、回転制限を緩和
    if ('minAzimuthAngle' in controls) controls.minAzimuthAngle = -Infinity;
    if ('maxAzimuthAngle' in controls) controls.maxAzimuthAngle = Infinity;
    controls.update();
    return;
  }

  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  modelBounds.getCenter(center);
  modelBounds.getSize(size);

  if (size.x === 0 && size.y === 0 && size.z === 0) {
    // ★★★ 点データの場合のオフセットも mm 単位に ★★★
    camera.position.set(center.x, center.y, center.z + 5000); // 5m離れる
    controls.target.copy(center);
    controls.update();
    return;
  }

  // ★★★ 最小サイズも mm 単位に ★★★
  const minSize = 100; // 100mm
  if (size.x < minSize) size.x = minSize;
  if (size.y < minSize) size.y = minSize;
  if (size.z < minSize) size.z = minSize;

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  let cameraDist = Math.abs(maxDim / 2 / Math.tan(fov / 2));
  // ★★★ 係数を再調整 (mmスケールなので、以前より小さくても良いかも) ★★★
  cameraDist *= 1.5; // 係数を 1.5 に戻してみる (必要なら再調整)

  if (!Number.isFinite(cameraDist) || cameraDist === 0) {
    cameraDist = maxDim * 2;
    // ★★★ デフォルト距離も mm 単位に ★★★
    if (cameraDist === 0) cameraDist = 10000; // 10m
  }

  // ★★★ オフセットも mm 単位で調整 ★★★
  const offsetFactor = 0.5; // この係数はそのままで良いかも
  camera.position.set(
    center.x - size.x * offsetFactor * 0.5, // 左側から
    center.y - size.y * offsetFactor * 0.5, // 前側から
    center.z + cameraDist,
  );
  controls.target.copy(center);
  log.info(
    `Adjusting Camera: Position=(${camera.position.x.toFixed(
      0,
    )}mm, ${camera.position.y.toFixed(0)}mm, ${camera.position.z.toFixed(
      0,
    )}mm), Target=(${controls.target.x.toFixed(
      0,
    )}mm, ${controls.target.y.toFixed(0)}mm, ${controls.target.z.toFixed(0)}mm)`,
  );
  // 広いモデルでも自由に回せるよう、回転制限を緩和
  if ('minAzimuthAngle' in controls) controls.minAzimuthAngle = -Infinity;
  if ('maxAzimuthAngle' in controls) controls.maxAzimuthAngle = Infinity;
  controls.update();

  // ファークリップ面を再調整
  camera.far = Math.max(50000000, cameraDist * 3); // 以前の設定値と計算値の大きい方
  camera.updateProjectionMatrix();
}

/**
 * モデル全体のバウンディングボックスを計算
 * @returns {THREE.Box3|null} モデルのバウンディングボックス、または空の場合null
 */
export function computeModelBoundingBox() {
  if (!scene) {
    log.warn('Scene not available');
    return null;
  }

  const box = new THREE.Box3();

  scene.traverse((obj) => {
    // ヘルパーやUI要素を除外
    if (obj.userData?.isOrbitHelper) return;
    if (obj.userData?.isHelper) return;
    if (obj instanceof THREE.GridHelper) return;
    if (obj instanceof THREE.AxesHelper) return;

    // メッシュやラインのみを対象
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
      if (obj.geometry && obj.visible) {
        const objBox = new THREE.Box3().setFromObject(obj);
        if (!objBox.isEmpty()) {
          box.union(objBox);
        }
      }
    }
  });

  return box.isEmpty() ? null : box;
}

/**
 * 指定されたバウンディングボックスにカメラをフィットさせる
 * @param {THREE.Box3} box - フィットするバウンディングボックス
 * @param {Object} options - オプション
 * @param {boolean} [options.enableTransition=true] - スムーズなトランジションを有効にする
 * @param {number} [options.padding=1.2] - パディング係数
 * @returns {boolean} 成功した場合true
 */
export function fitCameraToBox(box, options = {}) {
  const { enableTransition = true, padding = 1.2 } = options;

  if (!camera || !controls) {
    log.warn('Camera or controls not available');
    return false;
  }

  if (!box || box.isEmpty()) {
    log.warn('Empty bounding box provided');
    return false;
  }

  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  let cameraDistance = (maxDim * padding) / (2 * Math.tan(fov / 2));
  cameraDistance = Math.max(cameraDistance, 5000); // 最小距離 5m

  // CameraControlsのsetLookAtを使用（利用可能な場合）
  if (typeof controls.setLookAt === 'function') {
    const direction = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();

    // 方向が無効な場合はデフォルト方向を使用
    if (direction.length() < 0.001) {
      direction.set(1, -1, 1).normalize();
    }

    const newPosition = new THREE.Vector3()
      .copy(center)
      .add(direction.multiplyScalar(cameraDistance));

    controls.setLookAt(
      newPosition.x,
      newPosition.y,
      newPosition.z,
      center.x,
      center.y,
      center.z,
      enableTransition,
    );
  } else {
    // フォールバック: 直接カメラを操作
    const direction = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();

    if (direction.length() < 0.001) {
      direction.set(1, -1, 1).normalize();
    }

    camera.position.copy(center).add(direction.multiplyScalar(cameraDistance));
    controls.target.copy(center);
    controls.update();
  }

  log.debug('Camera fitted to box', { center: center.toArray(), size: size.toArray() });
  return true;
}

/**
 * モデル全体にカメラをフィットさせる
 * @param {Object} options - オプション
 * @param {boolean} [options.enableTransition=true] - スムーズなトランジションを有効にする
 * @param {number} [options.padding=1.2] - パディング係数
 * @returns {boolean} 成功した場合true
 */
export function fitCameraToModel(options = {}) {
  const box = computeModelBoundingBox();
  if (!box) {
    log.warn('No model content to fit');
    return false;
  }
  return fitCameraToBox(box, options);
}

/**
 * 選択された要素にカメラをフォーカスさせる
 * @param {Object} options - オプション
 * @param {boolean} [options.enableTransition=true] - スムーズなトランジションを有効にする
 * @param {number} [options.padding=2.0] - パディング係数
 * @returns {boolean} 成功した場合true
 */
export function focusOnSelected(options = {}) {
  const { enableTransition = true, padding = 2.0 } = options;

  const selectedObjects = getSelectedObjects();
  if (selectedObjects.length === 0) {
    log.warn('No element selected');
    return false;
  }

  // 選択されたオブジェクトのバウンディングボックスを計算
  const combinedBox = new THREE.Box3();
  for (const obj of selectedObjects) {
    const objBox = new THREE.Box3().setFromObject(obj);
    if (!objBox.isEmpty()) {
      combinedBox.union(objBox);
    }
  }

  if (combinedBox.isEmpty()) {
    log.warn('Selected elements have no valid bounds');
    return false;
  }

  return fitCameraToBox(combinedBox, { enableTransition, padding });
}

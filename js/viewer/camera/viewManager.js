/**
 * @fileoverview ビュー方向管理モジュール
 *
 * カメラのビュー方向（Top, Front, Right, Left, Isometric）を管理します。
 * 2Dモード時の平面図・立面図の切り替えに使用します。
 */

import * as THREE from 'three';
import { controls } from '../core/core.js';
import { getActiveCamera } from '../core/core.js';

/**
 * ビュー方向定数
 */
export const VIEW_DIRECTIONS = {
  TOP: 'top',       // 平面図（上から見る、Z+方向から）
  FRONT: 'front',   // 正面図（Y-方向から見る）
  RIGHT: 'right',   // 右側面図（X+方向から見る）
  LEFT: 'left',     // 左側面図（X-方向から見る）
  ISOMETRIC: 'iso'  // 等角投影（斜め上から）
};

// 現在のビュー方向
let currentView = VIEW_DIRECTIONS.ISOMETRIC;

/**
 * 現在のビュー方向を取得
 * @returns {string} 現在のビュー方向
 */
export function getCurrentView() {
  return currentView;
}

/**
 * ビュー方向を設定
 * @param {string} viewType - ビュー方向（VIEW_DIRECTIONS の値）
 * @param {Object} [modelBounds=null] - モデルの境界ボックス
 * @returns {boolean} 設定が成功したかどうか
 */
export function setView(viewType, modelBounds = null) {
  console.log('[ViewManager] setView called:', viewType, 'modelBounds:', modelBounds);
  const camera = getActiveCamera();
  if (!camera) {
    console.warn('[ViewManager] No active camera');
    return false;
  }
  console.log('[ViewManager] Active camera type:', camera.type);

  // モデルの中心と距離を計算
  let center = new THREE.Vector3(0, 0, 0);
  let distance = 20000; // デフォルト20m

  // Box3オブジェクトかチェック（min/maxプロパティを持つ）
  if (modelBounds && modelBounds.min && modelBounds.max) {
    // Box3の中心を計算
    modelBounds.getCenter(center);

    // モデルサイズを計算
    const size = new THREE.Vector3();
    modelBounds.getSize(size);
    const maxDimension = Math.max(size.x, size.y, size.z);
    distance = maxDimension * 1.5; // モデルサイズの1.5倍

    console.log('[ViewManager] Using model bounds - center:', center, 'distance:', distance, 'size:', size);
  } else if (modelBounds && modelBounds.minX !== undefined) {
    // 古い形式の境界（互換性のため）
    center = new THREE.Vector3(
      (modelBounds.minX + modelBounds.maxX) / 2,
      (modelBounds.minY + modelBounds.maxY) / 2,
      (modelBounds.minZ + modelBounds.maxZ) / 2
    );

    const size = Math.max(
      modelBounds.maxX - modelBounds.minX,
      modelBounds.maxY - modelBounds.minY,
      modelBounds.maxZ - modelBounds.minZ
    );
    distance = size * 1.5;

    console.log('[ViewManager] Using legacy bounds format - center:', center, 'distance:', distance);
  } else {
    console.warn('[ViewManager] Model bounds not available, using defaults');
  }

  let position;
  let up;

  switch (viewType) {
    case VIEW_DIRECTIONS.TOP:
      // 平面図: 上から見下ろす（Z+方向から）
      position = new THREE.Vector3(center.x, center.y, center.z + distance);
      up = new THREE.Vector3(0, 1, 0); // Y軸が上
      break;

    case VIEW_DIRECTIONS.FRONT:
      // 正面図: Y-方向から見る
      position = new THREE.Vector3(center.x, center.y - distance, center.z);
      up = new THREE.Vector3(0, 0, 1); // Z軸が上
      break;

    case VIEW_DIRECTIONS.RIGHT:
      // 右側面図: X+方向から見る
      position = new THREE.Vector3(center.x + distance, center.y, center.z);
      up = new THREE.Vector3(0, 0, 1); // Z軸が上
      break;

    case VIEW_DIRECTIONS.LEFT:
      // 左側面図: X-方向から見る
      position = new THREE.Vector3(center.x - distance, center.y, center.z);
      up = new THREE.Vector3(0, 0, 1); // Z軸が上
      break;

    case VIEW_DIRECTIONS.ISOMETRIC:
      // 等角投影: 斜め上から
      const iso = distance / Math.sqrt(3);
      position = new THREE.Vector3(
        center.x + iso,
        center.y - iso,
        center.z + iso
      );
      up = new THREE.Vector3(0, 0, 1); // Z軸が上
      break;

    default:
      console.warn('[ViewManager] Unknown view type:', viewType);
      return false;
  }

  // OrthographicCameraの場合、frustumサイズを調整（カメラ移動前に設定）
  if (camera.isOrthographicCamera) {
    const aspect = window.innerWidth / window.innerHeight;
    const frustumHeight = distance;
    const frustumWidth = frustumHeight * aspect;

    camera.left = -frustumWidth / 2;
    camera.right = frustumWidth / 2;
    camera.top = frustumHeight / 2;
    camera.bottom = -frustumHeight / 2;
    camera.zoom = 1.0; // ズームをリセット

    console.log('[ViewManager] Adjusted orthographic frustum:', {
      left: camera.left,
      right: camera.right,
      top: camera.top,
      bottom: camera.bottom,
      zoom: camera.zoom,
      aspect,
      distance
    });
  }

  // upベクトルを設定
  camera.up.copy(up);
  camera.updateProjectionMatrix();

  // CameraControlsを使用してカメラとターゲットを設定
  if (controls && controls._cc) {
    // setLookAt(posX, posY, posZ, targetX, targetY, targetZ, enableTransition)
    controls._cc.setLookAt(
      position.x, position.y, position.z,
      center.x, center.y, center.z,
      false // トランジションなし（即座に移動）
    );
    console.log('[ViewManager] Set camera via CameraControls');
    console.log('  Position:', position);
    console.log('  Target:', center);
    console.log('  Up:', up);
    console.log('  Camera.up:', camera.up);
  } else {
    // CameraControlsがない場合は直接設定
    camera.position.copy(position);
    camera.lookAt(center);
    console.log('[ViewManager] Set camera directly - position:', position, 'looking at:', center);
  }

  currentView = viewType;
  console.log('[ViewManager] View changed to:', viewType);
  return true;
}

/**
 * ビュー方向名を取得（表示用）
 * @param {string} viewType - ビュー方向
 * @returns {string} 日本語名
 */
export function getViewName(viewType) {
  const names = {
    [VIEW_DIRECTIONS.TOP]: '平面図（Top）',
    [VIEW_DIRECTIONS.FRONT]: '正面図（Front）',
    [VIEW_DIRECTIONS.RIGHT]: '右側面図（Right）',
    [VIEW_DIRECTIONS.LEFT]: '左側面図（Left）',
    [VIEW_DIRECTIONS.ISOMETRIC]: '等角投影（Iso）'
  };
  return names[viewType] || viewType;
}

/**
 * ビューマネージャーの状態をデバッグ出力
 * @returns {Object} デバッグ情報
 */
export function getDebugInfo() {
  const camera = getActiveCamera();
  return {
    currentView,
    currentViewName: getViewName(currentView),
    cameraPosition: camera ? {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z
    } : null,
    cameraUp: camera ? {
      x: camera.up.x,
      y: camera.up.y,
      z: camera.up.z
    } : null
  };
}

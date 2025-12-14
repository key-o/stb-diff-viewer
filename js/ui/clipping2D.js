/**
 * @fileoverview 2D表示用の奥行きクリッピング管理モジュール
 *
 * このモジュールは2D（平行投影）モード時の奥行き方向クリッピングを管理します：
 * - 2Dモード時のUI表示/非表示切り替え
 * - Z軸方向のクリッピング平面適用
 * - クリッピング範囲と中心位置の調整
 */

import * as THREE from 'three';
import { applyClipPlanes, clearClippingPlanes } from '../viewer/index.js';
import { getCameraMode, CAMERA_MODES } from '../viewer/camera/cameraManager.js';

// 2D奥行きクリッピングの現在の状態
let current2DClippingState = {
  enabled: false,
  centerZ: 0, // 中心Z座標（mm）
  range: 5000 // 範囲（±mm）
};

/**
 * カメラモード変更時に2Dクリッピングコントロールの表示を更新
 * @param {string} mode - カメラモード ('perspective' または 'orthographic')
 */
export function updateDepth2DClippingVisibility(mode) {
  const depth2DClippingGroup = document.getElementById('depth2DClippingGroup');

  if (!depth2DClippingGroup) {
    console.warn('[Clipping2D] depth2DClippingGroup element not found');
    return;
  }

  if (mode === CAMERA_MODES.ORTHOGRAPHIC) {
    // 2Dモード時は表示
    depth2DClippingGroup.classList.remove('hidden');
    console.log('[Clipping2D] 2D depth clipping controls shown');
  } else {
    // 3Dモード時は非表示
    depth2DClippingGroup.classList.add('hidden');
    // クリッピングが有効な場合は解除
    if (current2DClippingState.enabled) {
      clearDepth2DClipping();
    }
    console.log('[Clipping2D] 2D depth clipping controls hidden');
  }
}

/**
 * 2D奥行きクリッピングを適用
 * @param {number} centerZ - クリッピング中心Z座標（mm）
 * @param {number} range - クリッピング範囲（±mm）
 */
export function applyDepth2DClipping(centerZ, range) {
  // カメラモードが2Dでない場合は警告
  const currentMode = getCameraMode();
  if (currentMode !== CAMERA_MODES.ORTHOGRAPHIC) {
    console.warn('[Clipping2D] Cannot apply 2D depth clipping in 3D mode');
    return;
  }

  console.log(
    `[Clipping2D] Applying 2D depth clipping: center=${centerZ}mm, range=±${range}mm`
  );

  // Z軸方向のクリッピング平面を作成
  const lowerBound = centerZ - range;
  const upperBound = centerZ + range;

  // 下側の平面（Z > lowerBound）
  const lowerPlane = new THREE.Plane(
    new THREE.Vector3(0, 0, 1), // 法線が上向き
    -lowerBound // 定数（平面方程式: z - lowerBound > 0）
  );

  // 上側の平面（Z < upperBound）
  const upperPlane = new THREE.Plane(
    new THREE.Vector3(0, 0, -1), // 法線が下向き
    upperBound // 定数（平面方程式: -z + upperBound > 0）
  );

  const clippingPlanes = [lowerPlane, upperPlane];

  // クリッピング平面を適用
  applyClipPlanes(clippingPlanes);

  // 状態を更新
  current2DClippingState = {
    enabled: true,
    centerZ,
    range
  };

  console.log(
    `[Clipping2D] Applied clipping planes: Z between ${lowerBound}mm and ${upperBound}mm`
  );

  // UIの状態を更新
  updateDepth2DClippingUI();
}

/**
 * 2D奥行きクリッピングを解除
 */
export function clearDepth2DClipping() {
  if (!current2DClippingState.enabled) {
    return;
  }

  console.log('[Clipping2D] Clearing 2D depth clipping');
  clearClippingPlanes();

  current2DClippingState.enabled = false;

  // UIの状態を更新
  updateDepth2DClippingUI();
}

/**
 * 2D奥行きクリッピングのUI状態を更新
 * @private
 */
function updateDepth2DClippingUI() {
  const applyButton = document.getElementById('applyDepth2DClipButton');
  const clippingGroup = document.getElementById('depth2DClippingGroup');

  if (applyButton && clippingGroup) {
    if (current2DClippingState.enabled) {
      applyButton.textContent = '2D奥行きクリップを更新';
      clippingGroup.classList.add('clipping-active');
    } else {
      applyButton.textContent = '2D奥行きクリップを適用';
      clippingGroup.classList.remove('clipping-active');
    }
  }
}

/**
 * 2D奥行きクリッピングの現在の状態を取得
 * @returns {Object} 現在の状態
 */
export function getCurrent2DClippingState() {
  return { ...current2DClippingState };
}

/**
 * 2D奥行きクリッピングUIイベントハンドラーを初期化
 */
export function initDepth2DClippingUI() {
  console.log('[Clipping2D] Initializing 2D depth clipping UI');

  // 範囲スライダーのイベント
  const rangeSlider = document.getElementById('depth2DClipRange');
  const rangeValue = document.getElementById('depth2DRangeValue');

  if (rangeSlider && rangeValue) {
    rangeSlider.addEventListener('input', (e) => {
      const range = parseInt(e.target.value);
      rangeValue.textContent = (range / 1000).toFixed(1);
      current2DClippingState.range = range;

      // クリッピングが有効な場合は自動更新
      if (current2DClippingState.enabled) {
        applyDepth2DClipping(
          current2DClippingState.centerZ,
          current2DClippingState.range
        );
      }
    });
  }

  // 中心位置スライダーのイベント
  const centerSlider = document.getElementById('depth2DClipCenter');
  const centerValue = document.getElementById('depth2DCenterValue');

  if (centerSlider && centerValue) {
    centerSlider.addEventListener('input', (e) => {
      const center = parseInt(e.target.value);
      centerValue.textContent = (center / 1000).toFixed(1);
      current2DClippingState.centerZ = center;

      // クリッピングが有効な場合は自動更新
      if (current2DClippingState.enabled) {
        applyDepth2DClipping(
          current2DClippingState.centerZ,
          current2DClippingState.range
        );
      }
    });
  }

  // 適用ボタンのイベント
  const applyButton = document.getElementById('applyDepth2DClipButton');

  if (applyButton) {
    applyButton.addEventListener('click', () => {
      const centerSlider = document.getElementById('depth2DClipCenter');
      const rangeSlider = document.getElementById('depth2DClipRange');

      if (centerSlider && rangeSlider) {
        const center = parseInt(centerSlider.value);
        const range = parseInt(rangeSlider.value);

        applyDepth2DClipping(center, range);
      }
    });
  }

  // クリアボタンは既存のものを使用（clearClipButton）
  const clearButton = document.getElementById('clearClipButton');
  if (clearButton) {
    // 既存のイベントリスナーに加えて、2Dクリッピングもクリア
    clearButton.addEventListener('click', () => {
      clearDepth2DClipping();
    });
  }

  console.log('[Clipping2D] 2D depth clipping UI initialized');
}

/**
 * モデルのZ軸範囲に基づいてスライダーの範囲を自動調整
 * @param {THREE.Box3} modelBounds - モデルの境界ボックス
 */
export function adjustDepth2DClippingRangeFromModel(modelBounds) {
  if (!modelBounds || modelBounds.isEmpty()) {
    console.warn('[Clipping2D] Invalid model bounds provided');
    return;
  }

  const minZ = modelBounds.min.z;
  const maxZ = modelBounds.max.z;
  const centerZ = (minZ + maxZ) / 2;
  const sizeZ = maxZ - minZ;

  console.log(
    `[Clipping2D] Model Z range: ${minZ.toFixed(0)}mm to ${maxZ.toFixed(
      0
    )}mm (center: ${centerZ.toFixed(0)}mm, size: ${sizeZ.toFixed(0)}mm)`
  );

  // 中心位置スライダーの範囲を調整
  const centerSlider = document.getElementById('depth2DClipCenter');
  const centerValue = document.getElementById('depth2DCenterValue');

  if (centerSlider && centerValue) {
    // スライダーの範囲をモデルの範囲に合わせる（少し余裕を持たせる）
    const margin = sizeZ * 0.2; // 20%の余裕
    centerSlider.min = Math.floor(minZ - margin);
    centerSlider.max = Math.ceil(maxZ + margin);
    centerSlider.value = Math.round(centerZ);
    centerValue.textContent = (centerZ / 1000).toFixed(1);

    current2DClippingState.centerZ = centerZ;

    console.log(
      `[Clipping2D] Adjusted center slider range: ${centerSlider.min}mm to ${centerSlider.max}mm`
    );
  }

  // 範囲スライダーのデフォルト値を調整
  const rangeSlider = document.getElementById('depth2DClipRange');
  const rangeValue = document.getElementById('depth2DRangeValue');

  if (rangeSlider && rangeValue) {
    // デフォルトの範囲をモデルサイズの1/4程度に設定
    const defaultRange = Math.max(2000, Math.min(sizeZ / 4, 10000));
    rangeSlider.value = Math.round(defaultRange);
    rangeValue.textContent = (defaultRange / 1000).toFixed(1);

    current2DClippingState.range = defaultRange;

    console.log(
      `[Clipping2D] Adjusted default range: ${defaultRange.toFixed(0)}mm`
    );
  }
}

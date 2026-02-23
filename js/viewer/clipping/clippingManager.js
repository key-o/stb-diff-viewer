/**
 * @fileoverview クリッピング平面管理モジュール
 *
 * Three.jsレンダラーのクリッピング機能を管理します:
 * - クリッピング平面の生成と適用
 * - 軸に基づくクリッピング
 * - マテリアルへのクリッピング適用
 */

import * as THREE from 'three';
import { renderer, elementGroups as viewerElementGroups } from '../core/core.js';
import { createLogger } from '../../utils/logger.js';
import { eventBus, ToastEvents } from '../../app/events/index.js';

const log = createLogger('viewer:clipping');

// ============================================
// 状態プロバイダー（依存性注入）
// ============================================

/**
 * @typedef {Object} ClippingStateProvider
 * @property {function(string): *} getState - 状態取得関数
 */

/** @type {ClippingStateProvider|null} */
let stateProvider = null;

/**
 * 状態プロバイダーを設定（依存性注入）
 * @param {ClippingStateProvider} provider - 状態プロバイダー
 */
export function setClippingStateProvider(provider) {
  stateProvider = provider;
}

/**
 * 状態を取得（プロバイダー経由）
 * @param {string} path - 状態パス
 * @returns {*} 状態値
 */
function getStateInternal(path) {
  return stateProvider?.getState?.(path) || null;
}

/**
 * 指定された軸と中心座標に基づいてクリッピング平面を設定する。
 * - X/Y/Z軸ごとに2枚のクリッピング平面を生成
 * - applyClipPlanesでrendererに適用
 * @param {'X' | 'Y' | 'Z'} axis - クリッピングする軸。
 * @param {number} centerCoord - クリッピングの中心となる座標 (mm単位)。
 * @param {number} [range=1000] - 中心からのクリッピング範囲（片側、mm単位）。
 */
export function applyClipping(axis, centerCoord, range = 1000) {
  // ★★★ デフォルト値は 1000 (1m) のまま ★★★
  log.debug(
    `applyClipping called for axis ${axis} at ${centerCoord}mm with range ${range}mm. Checking renderer state...`, // ログの単位を明確化
  );
  if (!renderer) {
    log.error('Renderer is not initialized when applyClipping was called!');
    eventBus.emit(ToastEvents.SHOW_ERROR, {
      message: 'クリッピングエラー: レンダラーが初期化されていません。',
    });
    return;
  }
  log.trace('Renderer found in applyClipping:', renderer);
  try {
    const planeNormal1 = new THREE.Vector3();
    const planeNormal2 = new THREE.Vector3();
    let constant1 = 0;
    let constant2 = 0;

    // ★★★ 定数計算は mm 単位で行われる ★★★
    switch (axis) {
      case 'X':
        planeNormal1.set(1, 0, 0);
        planeNormal2.set(-1, 0, 0);
        constant1 = -(centerCoord - range); // X > center - range
        constant2 = centerCoord + range; // X < center + range => -X > -(center + range)
        break;
      case 'Y':
        planeNormal1.set(0, 1, 0);
        planeNormal2.set(0, -1, 0);
        constant1 = -(centerCoord - range); // Y > center - range
        constant2 = centerCoord + range; // Y < center + range => -Y > -(center + range)
        break;
      case 'Z':
      default: // デフォルトはZ軸（階）
        planeNormal1.set(0, 0, 1);
        planeNormal2.set(0, 0, -1);
        constant1 = -(centerCoord - range); // Z > center - range
        constant2 = centerCoord + range; // Z < center + range => -Z > -(center + range)
        break;
    }

    const clipPlanes = [
      new THREE.Plane(planeNormal1, constant1),
      new THREE.Plane(planeNormal2, constant2),
    ];

    // ★★★ applyClipPlanes を呼び出すように変更 ★★★
    applyClipPlanes(clipPlanes); // 既存の applyClipPlanes 関数を再利用

    log.info(
      `Clipping planes set via applyClipPlanes for ${axis}-axis at ${centerCoord.toFixed(
        0,
      )}mm ± ${range.toFixed(0)}mm.`,
    );
  } catch (error) {
    log.error('Error setting clipping planes:', error);
    eventBus.emit(ToastEvents.SHOW_ERROR, {
      message: 'クリッピング中にエラーが発生しました。',
    });
  }
}

/**
 * レンダラーのクリッピング平面を解除する。
 * - clippingPlanesを空にし、localClippingEnabledをfalseに
 */
export function clearClippingPlanes() {
  log.debug('clearClippingPlanes called. Checking renderer state...');
  if (!renderer) {
    log.error('Renderer is not initialized when clearClippingPlanes was called!');
    eventBus.emit(ToastEvents.SHOW_ERROR, {
      message: 'クリッピング解除エラー: レンダラーが初期化されていません。',
    });
    return;
  }
  log.trace('Renderer found in clearClippingPlanes:', renderer);
  try {
    log.trace('Attempting to clear clipping...');
    renderer.clippingPlanes.length = 0;
    renderer.localClippingEnabled = false;
    log.info('Clipping planes cleared. localClippingEnabled:', renderer.localClippingEnabled);
  } catch (error) {
    log.error('Error clearing clipping planes:', error);
    eventBus.emit(ToastEvents.SHOW_ERROR, {
      message: 'クリッピング解除中にエラーが発生しました。',
    });
  }
}

/**
 * 指定されたクリッピング平面をマテリアルに適用する
 * - rendererにclippingPlanesをセット
 * - localClippingEnabledを有効化
 * @param {Array<THREE.Plane>} planes - 適用するクリッピング平面の配列
 */
export function applyClipPlanes(planes) {
  if (!renderer) {
    log.error('Renderer not available in applyClipPlanes.');
    return;
  }
  if (!planes || planes.length === 0) {
    log.warn('No planes provided to applyClipPlanes.');
    return;
  }

  // ★★★ 設定する平面の詳細をログ出力 ★★★
  log.debug(`Applying ${planes.length} clipping planes to renderer:`);
  planes.forEach((plane, index) => {
    log.trace(
      `  Plane ${index}: Normal=(${plane.normal.x.toFixed(
        3,
      )}, ${plane.normal.y.toFixed(3)}, ${plane.normal.z.toFixed(
        3,
      )}), Constant=${plane.constant.toFixed(3)}`,
    );
  });

  renderer.clippingPlanes = planes;
  renderer.localClippingEnabled = true; // ローカルクリッピングを有効化

  log.info(
    `Applied ${planes.length} clipping planes. localClippingEnabled: ${renderer.localClippingEnabled}`,
  );

  // ★★★ 再描画要求は呼び出し元で行うため、ここでは不要 ★★★
}

/**
 * すべてのマテリアルのクリッピング平面を更新する（レンダラー初期化時などに使用）
 * - materials/elementGroups配下の全マテリアルにrenderer.clippingPlanesを適用
 */
export function updateMaterialClippingPlanes() {
  const planes = renderer.clippingPlanes;
  // 各要素グループ配下の全オブジェクトのマテリアルにクリッピング平面を適用
  Object.values(viewerElementGroups).forEach((group) => {
    group.traverse((child) => {
      if (!child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (mat instanceof THREE.Material) {
          mat.clippingPlanes = planes;
          mat.needsUpdate = true;
        }
      }
    });
  });
  log.info('Updated clipping planes for all materials.');
  // 再描画を要求
  const scheduleRender = getStateInternal('rendering.scheduleRender');
  if (scheduleRender) {
    scheduleRender();
  }
}

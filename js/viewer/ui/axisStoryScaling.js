/**
 * @fileoverview Axis（通り芯）とStory（階）の動的スケーリング機能
 *
 * カメラの距離に応じてAxis/Story要素のサイズを調整し、
 * 常に見やすいサイズで表示するための機能を提供します。
 */

import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";
import { camera, scene } from "../core/core.js";

// --- 設定定数 ---
const AXIS_STORY_BASE_SCALE = 1.0; // 基準スケール
const MIN_SCALE_FACTOR = 0.1; // 最小スケール係数（より小さく）
const MAX_SCALE_FACTOR = 2.0; // 最大スケール係数（より抑制）
const DISTANCE_SCALE_FACTOR = 0.00005; // 距離に対するスケール係数（より緩やかに）

// --- スケール調整対象要素の管理 ---
let axisStoryElements = new Set();

/**
 * Axis/Story要素をスケール調整対象として登録
 * @param {THREE.Object3D} element - 登録する要素
 */
export function registerAxisStoryElement(element) {
  if (
    element &&
    (element.userData.elementType === "Axis" ||
      element.userData.elementType === "Story")
  ) {
    axisStoryElements.add(element);
    // 初期スケールを保存
    if (!element.userData.originalScale) {
      element.userData.originalScale = element.scale.clone();
    }
  }
}

/**
 * Axis/Story要素の登録を解除
 * @param {THREE.Object3D} element - 解除する要素
 */
export function unregisterAxisStoryElement(element) {
  axisStoryElements.delete(element);
}

/**
 * 全てのAxis/Story要素の登録をクリア
 */
export function clearAxisStoryElements() {
  axisStoryElements.clear();
}

/**
 * カメラ距離に基づいてスケール係数を計算
 * @returns {number} スケール係数
 */
function calculateScaleFactor() {
  // controlsのターゲットを取得（存在しない場合は原点を使用）
  let target = new THREE.Vector3(0, 0, 0);

  // controlsが利用可能な場合はそのターゲットを使用
  if (
    typeof window !== "undefined" &&
    window.controls &&
    window.controls.target
  ) {
    target = window.controls.target;
  }

  // カメラからターゲットまでの距離を計算
  const distance = camera.position.distanceTo(target);

  // 距離に基づいてスケール係数を計算
  let scaleFactor = distance * DISTANCE_SCALE_FACTOR;

  // 最小/最大値でクランプ
  scaleFactor = Math.max(
    MIN_SCALE_FACTOR,
    Math.min(MAX_SCALE_FACTOR, scaleFactor)
  );

  return scaleFactor;
}

/**
 * 全てのAxis/Story要素のスケールを更新
 */
export function updateAxisStoryScale() {
  const scaleFactor = calculateScaleFactor();

  axisStoryElements.forEach((element) => {
    if (element.userData.originalScale) {
      // 元のスケールにスケール係数を適用
      element.scale
        .copy(element.userData.originalScale)
        .multiplyScalar(scaleFactor);
    }
  });
}

/**
 * シーン内のAxis/Story要素を自動検索して登録
 */
export function autoRegisterAxisStoryElements() {
  scene.traverse((child) => {
    if (
      child.userData &&
      (child.userData.elementType === "Axis" ||
        child.userData.elementType === "Story")
    ) {
      registerAxisStoryElement(child);
    }
  });
}

/**
 * デバッグ情報の表示
 */
export function logScalingDebugInfo() {
  const scaleFactor = calculateScaleFactor();
  const distance = camera.position.distanceTo(
    camera.target || new THREE.Vector3(0, 0, 0)
  );

  console.log(
    `[AxisStoryScaling] Distance: ${distance.toFixed(
      0
    )}mm, Scale Factor: ${scaleFactor.toFixed(3)}, Elements: ${
      axisStoryElements.size
    }`
  );
}

// --- 初期化時の自動登録（オプション） ---
export function initializeAxisStoryScaling() {
  autoRegisterAxisStoryElements();
  updateAxisStoryScale();
  console.log(
    `[AxisStoryScaling] Initialized with ${axisStoryElements.size} elements`
  );
}

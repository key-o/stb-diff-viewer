/**
 * @fileoverview 測定モードhoverハイライトモジュール
 *
 * 測定モード中にマウスオーバーした要素を、測定ステップに応じた色で
 * 一時的にハイライトします。
 */

import * as THREE from 'three';
import { createLogger, WarnCategory } from '../../../utils/logger.js';

const logger = createLogger('interaction:measurementHover');

// 測定モード中のhoverハイライト色
const MEASUREMENT_HOVER_COLOR_IDLE = 0xff8800; // オレンジ（1点目待ち）
const MEASUREMENT_HOVER_COLOR_FIRST_PICKED = 0x00bb55; // グリーン（2点目待ち）

/** @type {THREE.Object3D|null} */
let measurementHoverObject = null;
/** @type {THREE.Material|THREE.Material[]|null} */
let measurementHoverOriginalMaterial = null;
/** @type {THREE.Material|null} */
let measurementHoverPreviewMaterial = null;

/**
 * 測定モード中のhoverハイライトを更新する（ステップに応じて色を変える）
 * @param {THREE.Object3D|null} object - hover中のオブジェクト
 * @param {Function|null} getMeasurementStep - 現在のステップ（'idle'|'firstPicked'）を返す関数
 * @param {Function|null} scheduleRender - 再描画要求関数
 */
export function syncMeasurementHoverPreview(object, getMeasurementStep, scheduleRender) {
  // 前のhoverオブジェクトを復元
  if (measurementHoverObject && measurementHoverObject !== object) {
    clearMeasurementHoverPreview();
  }

  if (!object || object === measurementHoverObject || !object.material) {
    if (scheduleRender) scheduleRender();
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
  if (scheduleRender) scheduleRender();
}

/** 測定モードのhoverハイライトをクリアして元マテリアルに戻す */
export function clearMeasurementHoverPreview() {
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

/**
 * 現在hoverハイライト中かどうか
 * @returns {boolean}
 */
export function hasMeasurementHoverPreview() {
  return measurementHoverObject !== null;
}

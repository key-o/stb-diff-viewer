/**
 * @fileoverview マテリアル定義・管理モジュール
 *
 * このファイルは、3Dビューワーの描画に使用するマテリアルを定義・管理します:
 * - モデル比較用カラーマテリアル（一致、モデルA専用、モデルB専用）
 * - 線要素用マテリアル
 * - メッシュ要素用マテリアル
 * - 通り芯・階表示用マテリアル
 * - ハイライト表示用マテリアル
 * - クリッピング平面との連携
 *
 * マテリアルの定義を一元管理することで、アプリケーション全体での
 * 一貫した視覚的表現と効率的な更新を実現します。
 */

import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";
import { renderer } from "../core/core.js";
import {
  getCurrentColorMode,
  getMaterialForElement,
  COLOR_MODES,
} from "../../colorModes.js";

// --- マテリアル定義 (clippingPlanesは後で設定) ---
export const materials = {
  matched: new THREE.MeshStandardMaterial({
    color: 0x00aaff,
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.DoubleSide,
  }),
  onlyA: new THREE.MeshStandardMaterial({
    color: 0x00ff00,
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.DoubleSide,
  }),
  onlyB: new THREE.MeshStandardMaterial({
    color: 0xff0000,
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.DoubleSide,
  }),
  lineMatched: new THREE.LineBasicMaterial({ color: 0x00aaff }),
  lineOnlyA: new THREE.LineBasicMaterial({ color: 0x00ff00 }),
  lineOnlyB: new THREE.LineBasicMaterial({ color: 0xff0000 }),
  polyMatched: new THREE.MeshStandardMaterial({
    color: 0x00aaff,
    roughness: 0.8,
    metalness: 0.1,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7,
  }),
  polyOnlyA: new THREE.MeshStandardMaterial({
    color: 0x00ff00,
    roughness: 0.8,
    metalness: 0.1,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7,
  }),
  polyOnlyB: new THREE.MeshStandardMaterial({
    color: 0xff0000,
    roughness: 0.8,
    metalness: 0.1,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7,
  }),
  axisLine: new THREE.LineBasicMaterial({ color: 0x888888, linewidth: 1 }), // 通り芯用マテリアル (線)
  storyLine: new THREE.LineBasicMaterial({
    color: 0xaaaaaa,
    linewidth: 1,
    transparent: true,
    opacity: 0.5,
  }), // 階表示用マテリアル (線)
  axisPlane: new THREE.MeshBasicMaterial({
    color: 0x888888,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
  }),
  storyPlane: new THREE.MeshBasicMaterial({
    color: 0xaaaaaa,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
  }),
  // ★★★ 追加: ハイライト用マテリアル ★★★
  highlightMesh: new THREE.MeshStandardMaterial({
    color: 0xffff00,
    roughness: 0.5,
    metalness: 0.2,
    side: THREE.DoubleSide,
    emissive: 0x333300,
  }), // メッシュ要素（節点、スラブ、壁）用
  // ★★★ 変更: ハイライト線の太さを増やす ★★★
  highlightLine: new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 5 }), // 線要素（柱、梁）用 (linewidth を 3 から 5 に変更)
};

/**
 * レンダラー初期化後にマテリアルのclippingPlanesを更新する関数
 */
export function updateMaterialClippingPlanes() {
  if (!renderer) return;
  for (const key in materials) {
    if (materials[key]) {
      // マテリアルが存在するか確認
      materials[key].clippingPlanes = renderer.clippingPlanes;
      materials[key].needsUpdate = true; // 更新を反映させる
    }
  }
  console.log("Updated material clipping planes.");
}

/**
 * 要素に適用するマテリアルを取得する関数
 * 色付けモードに応じて適切なマテリアルを返す
 * @param {string} elementType 要素タイプ (Column, Girder, Beam, etc.)
 * @param {string} comparisonState 比較状態 ('matched', 'onlyA', 'onlyB')
 * @param {boolean} isLine 線要素かどうか
 * @param {boolean} isPoly ポリゴン要素かどうか
 * @returns {THREE.Material} 適用するマテリアル
 */
export function getMaterialForElementWithMode(
  elementType,
  comparisonState,
  isLine = false,
  isPoly = false,
  elementId = null
) {
  const colorMode = getCurrentColorMode();

  // 差分表示モード以外の場合は、専用マテリアルを取得
  if (colorMode !== COLOR_MODES.DIFF) {
    const customMaterial = getMaterialForElement(
      elementType,
      isLine,
      elementId
    );
    if (customMaterial) {
      // クリッピング平面を設定
      customMaterial.clippingPlanes = renderer?.clippingPlanes || [];
      customMaterial.needsUpdate = true;
      return customMaterial;
    }
  }

  // 差分表示モード（デフォルト）の場合は従来のマテリアルを使用
  if (isPoly) {
    switch (comparisonState) {
      case "matched":
        return materials.polyMatched;
      case "onlyA":
        return materials.polyOnlyA;
      case "onlyB":
        return materials.polyOnlyB;
      default:
        return materials.polyMatched;
    }
  } else if (isLine) {
    switch (comparisonState) {
      case "matched":
        return materials.lineMatched;
      case "onlyA":
        return materials.lineOnlyA;
      case "onlyB":
        return materials.lineOnlyB;
      default:
        return materials.lineMatched;
    }
  } else {
    switch (comparisonState) {
      case "matched":
        return materials.matched;
      case "onlyA":
        return materials.onlyA;
      case "onlyB":
        return materials.onlyB;
      default:
        return materials.matched;
    }
  }
}

/**
 * 色付けモードが変更された時にマテリアルを更新する関数
 */
export function updateMaterialsForColorMode() {
  // 既存のマテリアルのクリッピング平面を更新
  updateMaterialClippingPlanes();

  console.log(`Materials updated for color mode: ${getCurrentColorMode()}`);
}

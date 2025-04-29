import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";
import { renderer } from "./core.js";

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

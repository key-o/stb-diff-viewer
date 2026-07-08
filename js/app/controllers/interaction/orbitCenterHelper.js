/**
 * @fileoverview 回転中心ヘルパー表示モジュール
 *
 * カメラの回転中心を視覚的に示すヘルパー球体の作成・削除を行います。
 */

import * as THREE from 'three';
import { scene } from '../../../viewer/index.js';

// 回転中心ヘルパー球体のジオメトリパラメータ
const ORBIT_CENTER_RADIUS_MM = 150;
const ORBIT_SPHERE_SEGMENTS = { width: 16, height: 12 };

// 回転中心表示用のヘルパーオブジェクト
let orbitCenterHelper = null;

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
  if (scene && orbitCenterHelper) {
    scene.remove(orbitCenterHelper);
    if (orbitCenterHelper.geometry) orbitCenterHelper.geometry.dispose();
    if (orbitCenterHelper.material) orbitCenterHelper.material.dispose();
    orbitCenterHelper = null;
  }
}

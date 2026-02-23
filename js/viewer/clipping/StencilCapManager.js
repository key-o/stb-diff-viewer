/**
 * @fileoverview スタンシルベースのクリッピングキャップ管理
 *
 * SectionBoxでクリッピングしたとき、断面に「蓋」を描画して
 * 中空ではなくソリッドに見せるためのスタンシルバッファ利用実装。
 *
 * 仕組み:
 *   各クリッピング平面 P[i] に対して:
 *     1. ステンシル書き込みメッシュ (背面: +1, 前面: -1) を生成
 *        → "他の平面" だけでクリップすることで、平面 P[i] の断面を対象にする
 *     2. キャップ平面 (stencil != 0 の領域のみ描画) を生成
 *        → 描画後にステンシルを 0 にリセット (次の平面汚染防止)
 *
 * renderOrder:
 *   ステンシル書き込み: 100 + i*2
 *   キャップ描画:      100 + i*2 + 1
 */

import * as THREE from 'three';
import { elementGroups } from '../core/core.js';
import { ELEMENT_CATEGORIES } from '../../constants/elementTypes.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('viewer:stencilCap');

/** ステンシルキャップ対象外の要素タイプ（参照要素: Story/Axis/Node） */
const EXCLUDED_ELEMENT_TYPES = new Set(ELEMENT_CATEGORIES.REFERENCE);

/** キャップ平面のデフォルト色 */
const DEFAULT_CAP_COLOR = 0xaaaaaa;

/** キャップ平面のサイズ (mm) - 建物全体を覆う十分な大きさ */
const CAP_PLANE_SIZE = 500000;

export class StencilCapManager {
  constructor() {
    /** @type {THREE.Scene|null} */
    this._scene = null;
    /** @type {Array<{group: THREE.Group, cap: THREE.Mesh}>} */
    this._objects = [];
  }

  /**
   * スタンシルキャップを有効化する
   * @param {THREE.Scene} scene
   * @param {THREE.Plane[]} clipPlanes - セクションボックスのクリッピング平面
   * @param {number} [capColor] - 色取得できない場合のキャップ既定色
   */
  activate(scene, clipPlanes, capColor = DEFAULT_CAP_COLOR) {
    this.deactivate();

    if (!clipPlanes || clipPlanes.length === 0) return;

    this._scene = scene;

    // 要素メッシュを色ごとに収集
    const meshColorGroups = _collectElementMeshesByColor(capColor);
    const meshCount = meshColorGroups.reduce((sum, item) => sum + item.meshes.length, 0);
    if (meshCount === 0) {
      log.debug('No element meshes found for stencil caps');
      return;
    }

    log.debug(
      `Creating stencil caps for ${clipPlanes.length} planes, ${meshCount} meshes, ${meshColorGroups.length} color groups`,
    );

    let renderOrder = 100;

    for (let i = 0; i < clipPlanes.length; i++) {
      const otherPlanes = clipPlanes.filter((_, j) => j !== i);

      for (let colorIndex = 0; colorIndex < meshColorGroups.length; colorIndex++) {
        const { color, meshes } = meshColorGroups[colorIndex];
        const stencilRO = renderOrder++;
        const capRO = renderOrder++;

        // ステンシル書き込みグループ
        const group = new THREE.Group();
        group.name = `StencilCap_${i}_${colorIndex}`;
        group.userData.isStencilCap = true;

        for (const src of meshes) {
          const backMat = _makeStencilMat(THREE.BackSide, THREE.IncrementWrapStencilOp, otherPlanes);
          const frontMat = _makeStencilMat(
            THREE.FrontSide,
            THREE.DecrementWrapStencilOp,
            otherPlanes,
          );
          group.add(_makeStencilMesh(src, backMat, stencilRO));
          group.add(_makeStencilMesh(src, frontMat, stencilRO));
        }

        scene.add(group);

        // キャップ平面（色グループ別）
        const cap = _makeCapPlaneMesh(clipPlanes[i], otherPlanes, color, capRO);
        scene.add(cap);

        this._objects.push({ group, cap });
      }
    }

    log.info(`Stencil caps activated: ${clipPlanes.length} planes`);
  }

  /**
   * スタンシルキャップを無効化してリソースを解放する
   */
  deactivate() {
    if (!this._scene) return;

    for (const { group, cap } of this._objects) {
      this._scene.remove(group);
      // ジオメトリは元のメッシュと共有しているので dispose しない
      group.traverse((child) => {
        if (child.material) child.material.dispose();
      });

      this._scene.remove(cap);
      if (cap.geometry) cap.geometry.dispose();
      if (cap.material) cap.material.dispose();
    }

    this._objects = [];
    log.debug('Stencil caps deactivated');
  }

  /** @returns {boolean} */
  isActive() {
    return this._objects.length > 0;
  }
}

// ============================================
// ヘルパー関数
// ============================================

/**
 * elementGroups からステンシル対象のメッシュを色ごとに収集する
 * @param {number} fallbackColor
 * @returns {Array<{color: number, meshes: THREE.Mesh[]}>}
 */
function _collectElementMeshesByColor(fallbackColor) {
  const colorToMeshes = new Map();

  Object.entries(elementGroups).forEach(([type, group]) => {
    // Story/Axis/Node などの参照要素はステンシル対象外
    if (EXCLUDED_ELEMENT_TYPES.has(type)) return;

    group.traverse((child) => {
      if (
        child instanceof THREE.Mesh &&
        !child.userData.isSectionBox &&
        !child.userData.isStencilCap
      ) {
        // ワールド行列を最新化してからコピー
        child.updateWorldMatrix(true, false);
        const color = _extractMeshColorHex(child, fallbackColor);
        if (!colorToMeshes.has(color)) {
          colorToMeshes.set(color, []);
        }
        colorToMeshes.get(color).push(child);
      }
    });
  });

  return Array.from(colorToMeshes.entries()).map(([color, meshes]) => ({ color, meshes }));
}

/**
 * メッシュの表示色(HEX)を抽出する
 * @param {THREE.Mesh} mesh
 * @param {number} fallbackColor
 * @returns {number}
 */
function _extractMeshColorHex(mesh, fallbackColor) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const mat of materials) {
    if (!mat || !mat.color || !mat.color.isColor) continue;
    return mat.color.getHex();
  }
  return fallbackColor;
}

/**
 * ステンシル書き込み用マテリアルを作成する
 * @param {THREE.Side} side
 * @param {number} stencilZPass
 * @param {THREE.Plane[]} clippingPlanes
 * @returns {THREE.MeshBasicMaterial}
 */
function _makeStencilMat(side, stencilZPass, clippingPlanes) {
  return new THREE.MeshBasicMaterial({
    side,
    depthTest: false,
    depthWrite: false,
    colorWrite: false,
    stencilWrite: true,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilFail: THREE.KeepStencilOp,
    stencilZFail: THREE.KeepStencilOp,
    stencilZPass,
    clippingPlanes,
  });
}

/**
 * ステンシル書き込み用メッシュを作成する
 * ジオメトリは元メッシュと共有し、ワールド行列をコピーする
 * @param {THREE.Mesh} src - 元のメッシュ
 * @param {THREE.Material} material
 * @param {number} renderOrder
 * @returns {THREE.Mesh}
 */
function _makeStencilMesh(src, material, renderOrder) {
  const mesh = new THREE.Mesh(src.geometry, material);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(src.matrixWorld);
  mesh.renderOrder = renderOrder;
  mesh.userData.isStencilCap = true;
  return mesh;
}

/**
 * キャップ平面メッシュを作成する
 * @param {THREE.Plane} clipPlane - 対象のクリッピング平面
 * @param {THREE.Plane[]} otherPlanes - 他のクリッピング平面（このキャップをクリップする）
 * @param {number} capColor
 * @param {number} renderOrder
 * @returns {THREE.Mesh}
 */
function _makeCapPlaneMesh(clipPlane, otherPlanes, capColor, renderOrder) {
  const geometry = new THREE.PlaneGeometry(CAP_PLANE_SIZE, CAP_PLANE_SIZE);

  const material = new THREE.MeshBasicMaterial({
    color: capColor,
    side: THREE.DoubleSide,
    depthTest: false,
    stencilWrite: true,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilRef: 0,
    stencilFail: THREE.ZeroStencilOp,
    stencilZFail: THREE.ZeroStencilOp,
    stencilZPass: THREE.ZeroStencilOp,
    clippingPlanes: otherPlanes,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = renderOrder;
  mesh.userData.isStencilCap = true;

  // クリッピング平面の位置と向きに合わせる
  // 平面方程式: normal·point + constant = 0  →  point = normal * (-constant)
  const planePoint = clipPlane.normal.clone().multiplyScalar(-clipPlane.constant);
  mesh.position.copy(planePoint);

  // PlaneGeometry は +Z 向きなので clipPlane.normal 方向に回転
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    clipPlane.normal.clone(),
  );
  mesh.quaternion.copy(q);

  return mesh;
}

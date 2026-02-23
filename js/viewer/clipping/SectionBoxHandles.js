/**
 * @fileoverview セクションボックスのドラッグハンドル生成ヘルパー
 *
 * 各面（+X, -X, +Y, -Y, +Z, -Z）にコーン型のハンドルメッシュを配置する。
 */

import * as THREE from 'three';

/** ハンドル設定 */
const HANDLE_CONFIG = {
  coneRadius: 300,
  coneHeight: 600,
  color: 0xff6600,
  hoverColor: 0xffaa00,
  activeColor: 0xff0000,
  segments: 12,
};

/**
 * 各面の定義
 * @type {Array<{name: string, axis: string, sign: number, normal: THREE.Vector3, rotation: THREE.Euler}>}
 */
const FACE_DEFINITIONS = [
  {
    name: '+X',
    axis: 'x',
    sign: 1,
    normal: new THREE.Vector3(1, 0, 0),
    rotation: new THREE.Euler(0, 0, -Math.PI / 2),
  },
  {
    name: '-X',
    axis: 'x',
    sign: -1,
    normal: new THREE.Vector3(-1, 0, 0),
    rotation: new THREE.Euler(0, 0, Math.PI / 2),
  },
  {
    name: '+Y',
    axis: 'y',
    sign: 1,
    normal: new THREE.Vector3(0, 1, 0),
    rotation: new THREE.Euler(0, 0, 0),
  },
  {
    name: '-Y',
    axis: 'y',
    sign: -1,
    normal: new THREE.Vector3(0, -1, 0),
    rotation: new THREE.Euler(Math.PI, 0, 0),
  },
  {
    name: '+Z',
    axis: 'z',
    sign: 1,
    normal: new THREE.Vector3(0, 0, 1),
    rotation: new THREE.Euler(Math.PI / 2, 0, 0),
  },
  {
    name: '-Z',
    axis: 'z',
    sign: -1,
    normal: new THREE.Vector3(0, 0, -1),
    rotation: new THREE.Euler(-Math.PI / 2, 0, 0),
  },
];

/**
 * グローバルクリッピングプレーンからオブジェクトを除外する。
 * マテリアルの clippingPlanes を空配列に設定し、グローバル平面を無効化する。
 * @param {THREE.Mesh} mesh - 除外対象のメッシュ
 */
export function exemptFromClipping(mesh) {
  if (mesh.material) {
    mesh.material.clippingPlanes = [];
  }
}

/**
 * 全6面のハンドルメッシュを生成する
 * @returns {THREE.Mesh[]} 6つのハンドルメッシュ
 */
export function createAllHandles() {
  const geometry = new THREE.ConeGeometry(
    HANDLE_CONFIG.coneRadius,
    HANDLE_CONFIG.coneHeight,
    HANDLE_CONFIG.segments,
  );
  // 先端をローカル原点に移動し、コーン本体がボックス内側に収まるようにする。
  // これによりグローバルクリッピングプレーンで切り取られなくなる。
  geometry.translate(0, -HANDLE_CONFIG.coneHeight / 2, 0);

  return FACE_DEFINITIONS.map((face) => {
    const material = new THREE.MeshBasicMaterial({
      color: HANDLE_CONFIG.color,
      depthTest: false,
      transparent: true,
      opacity: 0.85,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.copy(face.rotation);
    mesh.renderOrder = 999;
    mesh.userData = {
      isSectionBoxHandle: true,
      faceName: face.name,
      axis: face.axis,
      sign: face.sign,
      normal: face.normal.clone(),
    };

    return mesh;
  });
}

/**
 * ハンドルをボックスの各面中心に配置する
 * @param {THREE.Mesh[]} handles - 6つのハンドルメッシュ
 * @param {THREE.Box3} box - バウンディングボックス
 */
export function positionHandles(handles, box) {
  const center = new THREE.Vector3();
  box.getCenter(center);

  for (const handle of handles) {
    const { axis, sign } = handle.userData;
    const pos = center.clone();

    if (sign > 0) {
      pos[axis] = box.max[axis];
    } else {
      pos[axis] = box.min[axis];
    }

    handle.position.copy(pos);
  }
}

/**
 * ハンドルの色を変更する
 * @param {THREE.Mesh} handle - ハンドルメッシュ
 * @param {'default' | 'hover' | 'active'} state - 状態
 */
export function setHandleState(handle, state) {
  const colorMap = {
    default: HANDLE_CONFIG.color,
    hover: HANDLE_CONFIG.hoverColor,
    active: HANDLE_CONFIG.activeColor,
  };
  handle.material.color.setHex(colorMap[state] || HANDLE_CONFIG.color);
}

/**
 * カメラ距離に応じてハンドルのスケールを調整する
 * @param {THREE.Mesh[]} handles - ハンドルメッシュ配列
 * @param {THREE.Camera} camera - カメラ
 * @param {number} [baseDistance=15000] - 基準距離(mm)
 */
export function updateHandleScale(handles, camera, baseDistance = 15000) {
  for (const handle of handles) {
    const distance = camera.position.distanceTo(handle.position);
    const scale = Math.max(0.3, Math.min(3, distance / baseDistance));
    handle.scale.setScalar(scale);
  }
}

export { HANDLE_CONFIG, FACE_DEFINITIONS };

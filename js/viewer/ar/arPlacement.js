/**
 * @fileoverview AR空間へのモデル配置モジュール
 *
 * ヒットテスト結果に基づくレティクル表示とモデル配置を管理します。
 */

import * as THREE from 'three';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('viewer/ar/arPlacement');

/**
 * AR空間でのモデル配置を管理
 */
export class ArPlacement {
  /**
   * @param {THREE.Scene} scene - Three.jsシーン
   */
  constructor(scene) {
    this._scene = scene;
    /** @type {THREE.Group|null} ARルートグループ */
    this._arRoot = null;
    /** @type {THREE.Mesh|null} 配置位置を示すレティクル */
    this._reticle = null;
    /** @type {boolean} モデルが配置済みかどうか */
    this._placed = false;
    /** @type {boolean} 有効なヒットテスト結果を保持しているか */
    this._hasValidHit = false;
    /** @type {THREE.Matrix4} 最後のヒットテスト変換行列 */
    this._lastHitMatrix = new THREE.Matrix4();
  }

  /**
   * 初期化（ARセッション開始時に呼ばれる）
   * @param {THREE.Group} arRoot - ARルートグループ
   */
  init(arRoot) {
    this._arRoot = arRoot;
    this._placed = false;
    this._hasValidHit = false;
    this._lastHitMatrix.identity();

    // レティクル（配置位置インジケータ）を作成
    this._reticle = this._createReticle();
    this._scene.add(this._reticle);
    this._reticle.visible = false;

    log.info('AR配置マネージャを初期化しました');
  }

  /**
   * レティクルを作成
   * @private
   * @returns {THREE.Mesh}
   */
  _createReticle() {
    const geometry = new THREE.RingGeometry(0.08, 0.1, 32);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  /**
   * ヒットテスト結果でレティクル位置を更新
   * @param {XRRigidTransform} transform - ヒットテスト結果の変換
   */
  updateReticle(transform) {
    if (!this._reticle || this._placed) return;

    this._reticle.visible = true;
    this._lastHitMatrix.fromArray(transform.matrix);
    this._reticle.matrix.copy(this._lastHitMatrix);
    this._hasValidHit = true;
  }

  /**
   * ヒットテスト結果がない場合にレティクルをクリア
   */
  clearReticle() {
    if (!this._reticle || this._placed) return;
    this._reticle.visible = false;
    this._hasValidHit = false;
  }

  /**
   * 現在のレティクル位置にモデルを配置確定
   * @param {Object} [options]
   * @param {THREE.WebGLRenderer} [options.renderer]
   * @param {THREE.Camera} [options.baseCamera]
   * @param {number} [options.startDistanceMeters=10] - 初期配置時の目安距離（最低値）
   */
  confirmPlacement(options = {}) {
    if (!this._arRoot || this._placed) return false;
    if (!this._hasValidHit) {
      log.warn('ヒットテスト結果がないため、AR配置をスキップしました');
      return false;
    }
    const { renderer = null, baseCamera = null, startDistanceMeters = 10 } = options;

    // ARルートをレティクル位置に移動
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    this._lastHitMatrix.decompose(position, quaternion, scale);

    let finalPosition = position.clone();

    // 建物モデル向け: 初期配置はユーザーから最低 startDistanceMeters 離す
    if (renderer?.xr?.isPresenting && baseCamera) {
      const xrCamera = renderer.xr.getCamera(baseCamera);
      if (xrCamera) {
        const cameraPos = new THREE.Vector3();
        xrCamera.getWorldPosition(cameraPos);

        const horizontalDir = position.clone().sub(cameraPos);
        horizontalDir.y = 0;

        if (horizontalDir.lengthSq() > 1e-8) {
          const currentDistance = horizontalDir.length();
          const targetDistance = Math.max(startDistanceMeters, currentDistance);
          horizontalDir.normalize().multiplyScalar(targetDistance);
          finalPosition = cameraPos.clone().add(horizontalDir);
          finalPosition.y = position.y;
        }
      }
    }

    this._arRoot.position.copy(finalPosition);
    this._arRoot.quaternion.copy(quaternion);
    this._arRoot.visible = true;
    this._placed = true;

    // レティクルを非表示
    if (this._reticle) {
      this._reticle.visible = false;
    }

    log.info('モデルをAR空間に配置しました', {
      x: finalPosition.x.toFixed(3),
      y: finalPosition.y.toFixed(3),
      z: finalPosition.z.toFixed(3),
    });
    return true;
  }

  /**
   * 配置をリセット（再配置可能にする）
   */
  resetPlacement() {
    this._placed = false;
    this._hasValidHit = false;
    if (this._arRoot) {
      this._arRoot.visible = false;
    }
    if (this._reticle) {
      this._reticle.visible = false;
    }
    log.info('AR配置をリセットしました');
  }

  /**
   * モデルが配置済みかどうか
   * @returns {boolean}
   */
  get isPlaced() {
    return this._placed;
  }

  /**
   * リソースを解放
   */
  dispose() {
    if (this._reticle) {
      this._reticle.geometry.dispose();
      this._reticle.material.dispose();
      this._scene.remove(this._reticle);
      this._reticle = null;
    }
    this._arRoot = null;
    this._placed = false;
    this._hasValidHit = false;
    log.info('AR配置マネージャをクリーンアップしました');
  }
}

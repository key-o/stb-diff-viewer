/**
 * @fileoverview DXFビューアモジュール
 *
 * パースされたDXFデータをThree.jsで描画します。
 * 座標変換、グループ管理、カメラ制御、編集モードを担当し、
 * 個別エンティティの描画はサブモジュールに委譲します。
 */

import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { createLogger } from '../utils/logger.js';
import { scene, camera, renderer, controls, getActiveCamera } from './core/core.js';
import { transformCoordinates } from './dxfCoordinates.js';
import {
  renderLines,
  renderPolylines,
  renderCircles,
  renderArcs,
  renderPoints,
} from './dxfEntityRenderers.js';
import { renderTexts } from './dxfTextRenderer.js';
import { renderDimensions } from './dxfDimensionRenderer.js';

const log = createLogger('DXFViewer');

// DXFエンティティを保持するグループ
let dxfGroup = null;
let transformControl = null;

/**
 * DXFグループを取得または作成
 * @returns {THREE.Group} DXFエンティティを保持するグループ
 */
export function getDxfGroup() {
  if (!dxfGroup) {
    dxfGroup = new THREE.Group();
    dxfGroup.name = 'DXFEntities';
  }
  return dxfGroup;
}

/**
 * DXFグループをクリア
 */
export function clearDxfGroup() {
  if (dxfGroup) {
    while (dxfGroup.children.length > 0) {
      const child = dxfGroup.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
      dxfGroup.remove(child);
    }
  }
}

// transformCoordinates is re-exported from dxfCoordinates.js
export { transformCoordinates };

/**
 * DXFエンティティをシーンに描画
 * @param {Object} entities - 抽出されたエンティティ
 * @param {Object} options - 描画オプション
 * @returns {THREE.Group} 描画されたエンティティのグループ
 */
export function renderDxfEntities(entities, options = {}) {
  const {
    scale = 1,
    offsetX = 0,
    offsetY = 0,
    offsetZ = 0,
    plane = 'xy',
    visibleLayers = null, // nullの場合は全レイヤー表示
  } = options;

  // 座標変換オプションをまとめる
  const transformOptions = { scale, offsetX, offsetY, offsetZ, plane };

  clearDxfGroup();
  const group = getDxfGroup();

  // 線分を描画
  renderLines(entities.lines, group, transformOptions, visibleLayers);

  // ポリラインを描画
  renderPolylines(entities.lwpolylines, group, transformOptions, visibleLayers);

  // 円を描画
  renderCircles(entities.circles, group, transformOptions, visibleLayers);

  // 円弧を描画
  renderArcs(entities.arcs, group, transformOptions, visibleLayers);

  // 点を描画
  renderPoints(entities.points, group, transformOptions, visibleLayers);

  // 寸法を描画
  renderDimensions(entities.dimensions, group, transformOptions, visibleLayers);

  // テキストを描画
  renderTexts(entities.texts, group, transformOptions, visibleLayers);

  log.info('DXF描画完了:', {
    totalObjects: group.children.length,
    plane: plane,
  });

  return group;
}

/**
 * レイヤーの表示/非表示を切り替え
 * @param {string} layerName - レイヤー名
 * @param {boolean} visible - 表示状態
 */
export function setLayerVisibility(layerName, visible) {
  if (!dxfGroup) return;

  dxfGroup.traverse((object) => {
    if (object.userData && object.userData.layer === layerName) {
      object.visible = visible;
    }
  });
}

/**
 * DXFデータのバウンドに合わせてカメラを調整
 * @param {Object} bounds - バウンディングボックス
 * @param {THREE.Camera} camera - カメラ
 * @param {Object} controls - カメラコントロール
 */
export function fitCameraToDxfBounds(bounds, camera, controls) {
  const centerX = (bounds.min.x + bounds.max.x) / 2;
  const centerY = (bounds.min.y + bounds.max.y) / 2;
  const centerZ = (bounds.min.z + bounds.max.z) / 2;

  const sizeX = bounds.max.x - bounds.min.x;
  const sizeY = bounds.max.y - bounds.min.y;
  const sizeZ = bounds.max.z - bounds.min.z;

  const maxSize = Math.max(sizeX, sizeY, sizeZ);
  const distance = maxSize * 1.5;

  // カメラ位置を設定（上から見下ろす視点）
  camera.position.set(centerX, centerY, centerZ + distance);
  camera.lookAt(centerX, centerY, centerZ);

  // コントロールのターゲットを設定
  if (controls) {
    controls.setTarget(centerX, centerY, centerZ, false);
  }

  log.info('カメラ調整完了:', {
    center: { x: centerX, y: centerY, z: centerZ },
    size: { x: sizeX, y: sizeY, z: sizeZ },
    distance,
  });
}

/**
 * DXF位置編集モードの切り替え
 * @param {boolean} enabled - 有効にするかどうか
 */
export function toggleDxfEditMode(enabled) {
  const group = getDxfGroup();
  if (!group) return;

  if (enabled) {
    const currentCamera = getActiveCamera() || camera;

    if (!transformControl) {
      transformControl = new TransformControls(currentCamera, renderer.domElement);
      scene.add(transformControl);
    } else {
      transformControl.camera = currentCamera;
    }

    transformControl.attach(group);
    transformControl.setMode('translate');

    // モード中はカメラ操作を完全に無効化して誤操作を防ぐ
    if (controls) {
      controls.enabled = false;
    }

    log.info('DXF位置編集モード: ON');
  } else {
    if (transformControl) {
      transformControl.detach();
    }

    // モード終了時にカメラ操作を有効化
    if (controls) {
      controls.enabled = true;
    }
    log.info('DXF位置編集モード: OFF');
  }
}

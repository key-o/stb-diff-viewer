/**
 * @fileoverview グリッドヘルパー管理モジュール
 *
 * Three.jsシーンのグリッドヘルパーを管理します:
 * - モデルサイズに応じたグリッドの生成
 * - グリッドの更新と削除
 */

import * as THREE from 'three';
import { scene } from '../core/core.js';
import { createLogger } from '../../utils/logger.js';
import { GRID_SETTINGS } from '../../config/renderingConstants.js';

const log = createLogger('viewer:grid');

/**
 * モデルのバウンディングボックスに基づいてグリッドヘルパーを作成または更新する。
 * - モデルが空ならデフォルトグリッドを生成
 * - そうでなければモデルサイズ・中心に合わせてグリッドを生成
 * @param {THREE.Box3} modelBounds - モデル全体のバウンディングボックス (mm単位)。
 */
export function createOrUpdateGridHelper(modelBounds) {
  // 既存のグリッドヘルパーを検索して削除
  const existingGridHelper = scene.children.find((child) => child instanceof THREE.GridHelper);
  if (existingGridHelper) {
    scene.remove(existingGridHelper);
  }

  let newGridHelper;
  if (modelBounds.isEmpty()) {
    // ★★★ デフォルトグリッドも mm 単位に ★★★
    newGridHelper = new THREE.GridHelper(
      GRID_SETTINGS.SIZE,
      GRID_SETTINGS.DIVISIONS,
      GRID_SETTINGS.CENTER_LINE_COLOR,
      GRID_SETTINGS.GRID_LINE_COLOR,
    ); // 100m, 1m間隔
    newGridHelper.rotation.x = Math.PI / 2;
    scene.add(newGridHelper);
    return;
  }

  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  modelBounds.getCenter(center);
  modelBounds.getSize(size);

  // ★★★ グリッドサイズと分割数を mm 単位で調整 ★★★
  const gridSize = Math.max(size.x, size.y, 20000) * 1.5; // 最小20m
  const divisions = Math.max(10, Math.floor(gridSize / 1000)); // 1m間隔程度を目安に
  log.info(
    `Creating grid: Size=${gridSize.toFixed(
      0,
    )}mm, Divisions=${divisions}, Center(XY)=(${center.x.toFixed(
      0,
    )}mm, ${center.y.toFixed(0)}mm), Z=${modelBounds.min.z.toFixed(0)}mm`,
  );

  newGridHelper = new THREE.GridHelper(gridSize, divisions, 0x888888, 0xcccccc);
  newGridHelper.rotation.x = Math.PI / 2;
  newGridHelper.position.set(center.x, center.y, modelBounds.min.z); // Z座標はモデルの最小Zに合わせる
  scene.add(newGridHelper);
}

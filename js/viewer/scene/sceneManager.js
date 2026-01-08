/**
 * @fileoverview シーン管理モジュール
 *
 * Three.jsシーンのコンテンツ管理機能を提供します:
 * - シーンコンテンツのクリアと管理
 * - モデル境界の計算
 */

import * as THREE from 'three';
import { scene, elementGroups as viewerElementGroups } from '../core/core.js';
import { createLogger } from '../../utils/logger.js';
import { disposeRecursive, disposeLabels, getResourceStats } from '../utils/ResourceDisposer.js';
import { getElementRegistry } from '../utils/ElementRegistry.js';

const log = createLogger('viewer:scene');

/**
 * シーン内のモデル要素（メッシュ、線分、ラベル）、バウンディングボックスをクリアする。
 * - elementGroupsの各子要素のgeometry/materialをdispose（再帰的に処理）
 * - ラベル(Sprite)もdisposeし、親から除去
 * - グリッドヘルパーも削除
 * - ElementRegistryもクリア
 * @param {Object<string, THREE.Group>} elementGroups - クリア対象の要素グループ。
 * @param {Array<THREE.Sprite>} nodeLabels - クリア対象のラベル配列。
 * @returns {THREE.Box3} 新しい空のバウンディングボックス。
 */
export function clearSceneContent(groups = viewerElementGroups, nodeLabels = []) {
  if (!groups) {
    console.warn('[viewer:scene] No element groups provided to clearSceneContent');
    return new THREE.Box3();
  }

  // クリア前のリソース統計をログ出力
  const beforeStats = getResourceStats(scene);
  log.info('Clearing scene content. Before:', beforeStats);

  let totalDisposed = 0;

  // 各要素グループの子要素を再帰的に解放
  for (const type in groups) {
    if (!Object.prototype.hasOwnProperty.call(groups, type)) continue;

    const group = groups[type];
    // 後ろから処理して配列変更の影響を回避
    while (group.children.length > 0) {
      const child = group.children[group.children.length - 1];
      totalDisposed += disposeRecursive(child, {
        removeFromParent: true,
        disposeGeometry: true,
        disposeMaterial: true,
      });
    }
  }

  // ラベルを解放
  const labelsDisposed = disposeLabels(nodeLabels);
  totalDisposed += labelsDisposed;

  // ElementRegistryをクリア
  const registry = getElementRegistry();
  registry.clear();

  // グリッドヘルパーがあれば削除
  const existingGridHelper = scene.children.find((child) => child instanceof THREE.GridHelper);
  if (existingGridHelper) {
    scene.remove(existingGridHelper);
    totalDisposed++;
  }

  log.info(`Scene cleared: ${totalDisposed} resources disposed`);

  return new THREE.Box3();
}

/**
 * シーン要素から現在のモデル境界を取得
 * @param {Object<string, THREE.Group>} elementGroups - 要素グループ（省略時はviewerElementGroupsを使用）
 * @returns {THREE.Box3|null} モデル境界ボックスまたは要素がない場合null
 */
export function getModelBounds(elementGroups = viewerElementGroups) {
  if (!scene || !elementGroups) {
    log.warn('Scene or elementGroups not available for bounds calculation');
    return null;
  }

  const box = new THREE.Box3();
  let hasElements = false;

  // Calculate bounds from all element groups
  for (const groupName in elementGroups) {
    const group = elementGroups[groupName];
    if (group && group.children.length > 0) {
      const groupBox = new THREE.Box3().setFromObject(group);
      if (!groupBox.isEmpty()) {
        if (!hasElements) {
          box.copy(groupBox);
          hasElements = true;
        } else {
          box.union(groupBox);
        }
      }
    }
  }

  if (!hasElements) {
    log.warn('No elements found for bounds calculation');
    return null;
  }

  log.info('Model bounds calculated:', {
    min: box.min,
    max: box.max,
    center: box.getCenter(new THREE.Vector3()),
    size: box.getSize(new THREE.Vector3()),
  });

  return box;
}

/**
 * @fileoverview セクションボックスUI統合モジュール
 *
 * セクションボックスのトグル制御と既存クリッピングとの連携を管理する。
 *
 * @module ui/viewer3d/sectionBox
 */

import * as THREE from 'three';
import {
  SectionBox,
  scene,
  getActiveCamera,
  renderer,
  controls,
  getModelBounds,
  clearClippingPlanes,
} from '../../viewer/index.js';
import { scheduleRender } from '../../utils/renderScheduler.js';
import { showWarning } from '../common/toast.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('ui:sectionBox');

/** @type {SectionBox|null} */
let sectionBoxInstance = null;

/**
 * セクションボックスのON/OFFを切り替える
 */
export function toggleSectionBox() {
  if (sectionBoxInstance && sectionBoxInstance.isActive()) {
    deactivateSectionBox();
    return;
  }

  // 既存のクリッピング平面を解除
  clearClippingPlanes();

  const modelBounds = getModelBounds();
  if (!modelBounds || modelBounds.isEmpty()) {
    showWarning('モデルが読み込まれていません');
    return;
  }

  // モデル範囲に5%のマージンを追加
  const size = modelBounds.getSize(new THREE.Vector3());
  const margin = size.multiplyScalar(0.05);
  const expandedBox = modelBounds.clone();
  expandedBox.min.sub(margin);
  expandedBox.max.add(margin);

  const domElement = renderer.domElement;

  sectionBoxInstance = new SectionBox(
    scene,
    () => getActiveCamera(),
    renderer,
    domElement,
    controls,
  );
  sectionBoxInstance.activate(expandedBox);

  updateToggleButtonState(true);
  updateHintVisibility(true);

  scheduleRender();
  log.info('Section box activated via UI');
}

/**
 * セクションボックスを解除する
 */
export function deactivateSectionBox() {
  if (sectionBoxInstance) {
    sectionBoxInstance.deactivate();
    sectionBoxInstance.dispose();
    sectionBoxInstance = null;
  }

  updateToggleButtonState(false);
  updateHintVisibility(false);

  scheduleRender();
  log.info('Section box deactivated via UI');
}

/**
 * クリッピング範囲データからセクションボックスを起動する
 *
 * 階クリップの場合はZ方向のみ、軸クリップの場合はX/Y方向のみを制限し、
 * その他の方向はモデル全体の範囲を使用する。
 *
 * @param {Object} boundsData - getStoryClipBounds / getAxisClipBounds の戻り値
 */
export function activateSectionBoxForBounds(boundsData) {
  const modelBounds = getModelBounds();
  if (!modelBounds || modelBounds.isEmpty()) {
    showWarning('モデルが読み込まれていません');
    return;
  }

  // モデル全体の範囲をベースにクリッピング方向のみ上書き
  const box3 = modelBounds.clone();

  if (boundsData.type === 'story') {
    box3.min.z = boundsData.lowerBound;
    box3.max.z = boundsData.upperBound;
  } else if (boundsData.type === 'axis') {
    if (boundsData.axisType === 'X') {
      box3.min.x = boundsData.lowerBound;
      box3.max.x = boundsData.upperBound;
    } else if (boundsData.axisType === 'Y') {
      box3.min.y = boundsData.lowerBound;
      box3.max.y = boundsData.upperBound;
    }
  }

  // 既存インスタンスがある場合は範囲のみ更新（再生成コストを避ける）
  if (sectionBoxInstance && sectionBoxInstance.isActive()) {
    sectionBoxInstance.updateBox(box3);
    scheduleRender();
    log.info('Section box updated for bounds', boundsData.type);
    return;
  }

  // 新規作成
  if (sectionBoxInstance) {
    sectionBoxInstance.dispose();
    sectionBoxInstance = null;
  }

  const domElement = renderer.domElement;
  sectionBoxInstance = new SectionBox(
    scene,
    () => getActiveCamera(),
    renderer,
    domElement,
    controls,
  );
  sectionBoxInstance.activate(box3);

  updateToggleButtonState(true);
  updateHintVisibility(true);

  scheduleRender();
  log.info('Section box activated for bounds', boundsData.type);
}

/**
 * 指定したバウンディングボックスでセクションボックスを起動する
 *
 * 選択要素のバウンディングボックスなど、任意のBox3を渡してセクションボックスを適用する。
 * ボックスの各方向に10%のマージンを追加する。
 *
 * @param {THREE.Box3} box3 - セクションボックスの範囲
 */
export function activateSectionBoxForBox(box3) {
  if (!box3 || box3.isEmpty()) {
    showWarning('バウンディングボックスが空です');
    return;
  }

  // マージンを追加（各方向に10%）
  const size = box3.getSize(new THREE.Vector3());
  const margin = size.multiplyScalar(0.1);
  // 最小マージンを保証（小さい部材でも操作しやすいように）
  const MIN_MARGIN = 500; // 500mm
  margin.x = Math.max(margin.x, MIN_MARGIN);
  margin.y = Math.max(margin.y, MIN_MARGIN);
  margin.z = Math.max(margin.z, MIN_MARGIN);

  const expandedBox = box3.clone();
  expandedBox.min.sub(margin);
  expandedBox.max.add(margin);

  // 既存インスタンスがある場合は範囲のみ更新
  if (sectionBoxInstance && sectionBoxInstance.isActive()) {
    sectionBoxInstance.updateBox(expandedBox);
    scheduleRender();
    log.info('Section box updated for selection');
    return;
  }

  // 新規作成
  if (sectionBoxInstance) {
    sectionBoxInstance.dispose();
    sectionBoxInstance = null;
  }

  // 既存のクリッピング平面を解除
  clearClippingPlanes();

  const domElement = renderer.domElement;
  sectionBoxInstance = new SectionBox(
    scene,
    () => getActiveCamera(),
    renderer,
    domElement,
    controls,
  );
  sectionBoxInstance.activate(expandedBox);

  updateToggleButtonState(true);
  updateHintVisibility(true);

  scheduleRender();
  log.info('Section box activated for selection');
}

/**
 * セクションボックスがアクティブかどうか
 * @returns {boolean}
 */
export function isSectionBoxActive() {
  return sectionBoxInstance !== null && sectionBoxInstance.isActive();
}

/**
 * トグルボタンの表示状態を更新する
 * @param {boolean} active
 */
function updateToggleButtonState(active) {
  const btn = document.getElementById('toggleSectionBoxButton');
  if (!btn) return;

  if (active) {
    btn.classList.add('active');
    btn.textContent = 'セクションボックス解除';
  } else {
    btn.classList.remove('active');
    btn.textContent = 'セクションボックス';
  }
}

/**
 * ヒントテキストの表示/非表示を切り替える
 * @param {boolean} visible
 */
function updateHintVisibility(visible) {
  const hint = document.getElementById('sectionBoxHint');
  if (!hint) return;

  if (visible) {
    hint.classList.remove('hidden');
  } else {
    hint.classList.add('hidden');
  }
}

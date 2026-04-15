/**
 * @fileoverview Grid helper management for the Three.js viewer.
 */

import * as THREE from 'three';
import { scene } from '../core/core.js';
import { createLogger } from '../../utils/logger.js';
import { GRID_SETTINGS } from '../../config/renderingConstants.js';

const log = createLogger('viewer:grid');

let gridVisibility = true;

function getCurrentGridHelper() {
  return scene.children.find((child) => child instanceof THREE.GridHelper) || null;
}

export function setGridHelperVisibility(isVisible) {
  gridVisibility = Boolean(isVisible);
  const helper = getCurrentGridHelper();
  if (helper) {
    helper.visible = gridVisibility;
  }
  return gridVisibility;
}

export function isGridHelperVisible() {
  const helper = getCurrentGridHelper();
  return helper ? helper.visible : gridVisibility;
}

/**
 * Create or replace the grid helper sized to the current model bounds.
 * The current visibility state is preserved across replacements.
 *
 * @param {THREE.Box3} modelBounds
 * @returns {THREE.GridHelper}
 */
export function createOrUpdateGridHelper(modelBounds) {
  const existingGridHelper = getCurrentGridHelper();
  if (existingGridHelper) {
    gridVisibility = existingGridHelper.visible;
    scene.remove(existingGridHelper);
  }

  let newGridHelper;
  if (modelBounds.isEmpty()) {
    newGridHelper = new THREE.GridHelper(
      GRID_SETTINGS.SIZE,
      GRID_SETTINGS.DIVISIONS,
      GRID_SETTINGS.CENTER_LINE_COLOR,
      GRID_SETTINGS.GRID_LINE_COLOR,
    );
    newGridHelper.rotation.x = Math.PI / 2;
    newGridHelper.visible = gridVisibility;
    scene.add(newGridHelper);
    return newGridHelper;
  }

  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  modelBounds.getCenter(center);
  modelBounds.getSize(size);

  const gridSize = Math.max(size.x, size.y, 20000) * 1.5;
  const divisions = Math.max(10, Math.floor(gridSize / 1000));
  log.info(
    `Creating grid: Size=${gridSize.toFixed(
      0,
    )}mm, Divisions=${divisions}, Center(XY)=(${center.x.toFixed(
      0,
    )}mm, ${center.y.toFixed(0)}mm), Z=${modelBounds.min.z.toFixed(0)}mm`,
  );

  newGridHelper = new THREE.GridHelper(gridSize, divisions, 0x888888, 0xcccccc);
  newGridHelper.rotation.x = Math.PI / 2;
  newGridHelper.position.set(center.x, center.y, modelBounds.min.z);
  newGridHelper.visible = gridVisibility;
  scene.add(newGridHelper);
  return newGridHelper;
}

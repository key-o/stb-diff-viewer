/**
 * @fileoverview ビューワ依存する選択系 API を集約するインタラクション管理 API。
 *
 * アプリ側（app/controllers/interactionController.js）から実装を注入し、
 * ビューワ側は直接 app/modules を import しないようにする。
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('viewer:interaction-manager');

/** @type {Record<string, Function>} */
const defaultServices = {
  getSelectedCenter: () => null,
  getSelectedObjects: () => [],
  createOrUpdateOrbitCenterHelper: () => {},
  hideOrbitCenterHelper: () => {},
  resetSelection: () => {},
};

let interactionServices = { ...defaultServices };

/**
 * ビューワ側が利用するインタラクションサービスを注入する。
 *
 * @param {Object} services
 * @param {Function} [services.getSelectedCenter]
 * @param {Function} [services.getSelectedObjects]
 * @param {Function} [services.createOrUpdateOrbitCenterHelper]
 * @param {Function} [services.hideOrbitCenterHelper]
 * @param {Function} [services.resetSelection]
 */
export function installInteractionManager(services = {}) {
  interactionServices = {
    ...defaultServices,
    ...interactionServices,
    ...services,
  };
}

/**
 * テスト用に注入状態を既定値へ戻す。
 */
export function resetInteractionManagerForTests() {
  interactionServices = { ...defaultServices };
}

/**
 * 選択中心座標を返す。
 * @returns {THREE.Vector3 | null}
 */
export function getSelectedCenter() {
  try {
    return interactionServices.getSelectedCenter();
  } catch (error) {
    log.warn('getSelectedCenter failed:', error);
    return null;
  }
}

/**
 * 現在選択中のオブジェクトを返す。
 * @returns {Array}
 */
export function getSelectedObjects() {
  try {
    return interactionServices.getSelectedObjects();
  } catch (error) {
    log.warn('getSelectedObjects failed:', error);
    return [];
  }
}

/**
 * 選択された要素の中心に追従する目印を更新する。
 * @param {THREE.Vector3} position
 */
export function createOrUpdateOrbitCenterHelper(position) {
  try {
    return interactionServices.createOrUpdateOrbitCenterHelper(position);
  } catch (error) {
    log.warn('createOrUpdateOrbitCenterHelper failed:', error);
    return undefined;
  }
}

/**
 * 選択中心の目印を非表示にする。
 */
export function hideOrbitCenterHelper() {
  try {
    return interactionServices.hideOrbitCenterHelper();
  } catch (error) {
    log.warn('hideOrbitCenterHelper failed:', error);
    return undefined;
  }
}

/**
 * 選択状態をクリアする。
 */
export function resetSelection() {
  try {
    return interactionServices.resetSelection();
  } catch (error) {
    log.warn('resetSelection failed:', error);
    return undefined;
  }
}

export default {
  installInteractionManager,
  resetInteractionManagerForTests,
  getSelectedCenter,
  getSelectedObjects,
  createOrUpdateOrbitCenterHelper,
  hideOrbitCenterHelper,
  resetSelection,
};

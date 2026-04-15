/**
 * @fileoverview modelLoader層の依存性注入プロバイダー
 *
 * App層への直接依存を排除するために、modelLoader内部モジュールが
 * 必要とする外部依存（globalState、notificationController、viewModes等）を
 * 依存性注入パターンで提供します。
 *
 * 初期化時に `setModelLoaderDependencies()` でプロバイダーを注入し、
 * 内部モジュールは各getter関数で依存を取得します。
 *
 * @module modelLoader/loaderDependencies
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('modelLoader:dependencies');

/**
 * @typedef {Object} ModelLoaderDependencies
 * @property {function(string, *): void} setState - globalState.setState
 * @property {function(string): *} getState - globalState.getState
 * @property {Object} notify - notificationController.notify
 * @property {function(): Object} getImportanceManager - importanceManager.getImportanceManager
 * @property {function(Object, *): *} normalizeSectionData - sectionEquivalenceEngine.normalizeSectionData
 * @property {function(Object, Function): (void|Promise<Object>)} initViewModes - viewModes.initViewModes
 * @property {function(Function): void} updateModelVisibility - viewModes.updateModelVisibility
 */

/** @type {ModelLoaderDependencies} */
let _deps = {};

/**
 * modelLoader層の依存関係を設定する
 *
 * App初期化時に呼び出し、app層のモジュールを注入する。
 *
 * @param {ModelLoaderDependencies} deps - 依存関係オブジェクト
 */
export function setModelLoaderDependencies(deps) {
  _deps = { ..._deps, ...deps };
  log.info('modelLoader依存関係が設定されました');
}

/**
 * globalState.setState を取得
 * @returns {function(string, *): void}
 */
export function getLoaderSetState() {
  if (!_deps.setState) {
    log.error('setState が未注入です。setModelLoaderDependencies() を初期化時に呼び出してください');
  }
  return _deps.setState || (() => {});
}

/**
 * globalState.getState を取得
 * @returns {function(string): *}
 */
export function getLoaderGetState() {
  if (!_deps.getState) {
    log.error('getState が未注入です。setModelLoaderDependencies() を初期化時に呼び出してください');
  }
  return _deps.getState || (() => undefined);
}

/**
 * notificationController.notify を取得
 * @returns {Object}
 */
export function getLoaderNotify() {
  if (!_deps.notify) {
    log.warn('notify が未注入です');
    return { warning: () => {}, error: () => {}, info: () => {}, success: () => {} };
  }
  return _deps.notify;
}

/**
 * importanceManager インスタンスを取得する
 *
 * 他の getLoader* 関数と異なり、ファクトリー関数ではなくインスタンスを直接返す。
 * （_deps.getImportanceManager を呼び出してその結果を返す）
 * DI未注入時は安全なスタブオブジェクト（isInitialized: false）を返す。
 * 呼び出し側で null チェックなしに manager.isInitialized を参照しても
 * クラッシュしない。
 *
 * @returns {Object} importanceManager インスタンス（未注入時はスタブ）
 */
export function getLoaderImportanceManager() {
  if (!_deps.getImportanceManager) {
    log.warn('getImportanceManager が未注入です');
    return { isInitialized: false };
  }
  return _deps.getImportanceManager();
}

/**
 * sectionEquivalenceEngine.normalizeSectionData を取得
 * @returns {function(Object, string): Object}
 */
export function getLoaderNormalizeSectionData() {
  if (!_deps.normalizeSectionData) {
    log.warn('normalizeSectionData が未注入です');
    return (data) => data;
  }
  return _deps.normalizeSectionData;
}

/**
 * viewModes.initViewModes を取得
 * @returns {function(Object, Function): (void|Promise<Object>)}
 */
export function getLoaderInitViewModes() {
  if (!_deps.initViewModes) {
    log.warn('initViewModes が未注入です');
    return () => {};
  }
  return _deps.initViewModes;
}

/**
 * viewModes.updateModelVisibility を取得
 * @returns {function(Function): void}
 */
export function getLoaderUpdateModelVisibility() {
  if (!_deps.updateModelVisibility) {
    log.warn('updateModelVisibility が未注入です');
    return () => {};
  }
  return _deps.updateModelVisibility;
}

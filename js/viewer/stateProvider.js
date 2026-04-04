/**
 * @fileoverview Viewer層の状態プロバイダー（依存性注入）
 *
 * App層（globalState）への直接依存を排除するために、
 * viewer内部モジュールが必要とする状態アクセスを
 * 依存性注入パターンで提供します。
 *
 * 初期化時に `setViewerStateProvider()` でプロバイダーを注入し、
 * 内部モジュールは `getViewerState()` で状態を取得します。
 *
 * @module viewer/stateProvider
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('viewer:stateProvider');

/**
 * @typedef {Object} ViewerStateProvider
 * @property {function(string): *} getState - 状態パスから値を取得
 * @property {function(string, *): void} [setState] - 状態パスに値を設定
 */

/** @type {ViewerStateProvider|null} */
let _stateProvider = null;

/**
 * Viewer層の状態プロバイダーを設定する
 *
 * App初期化時に呼び出し、globalStateのgetState/setStateを注入する。
 *
 * @param {ViewerStateProvider} provider - 状態プロバイダー
 */
export function setViewerStateProvider(provider) {
  if (!provider || typeof provider.getState !== 'function') {
    throw new Error('setViewerStateProvider: provider.getState must be a function');
  }
  _stateProvider = provider;
  log.info('Viewer状態プロバイダーが設定されました');
}

/**
 * Viewer層から状態を取得する
 *
 * @param {string} path - 状態パス（例: 'ui.labelContentType', 'models.documentA'）
 * @returns {*} 状態値
 * @throws {Error} プロバイダーが未設定の場合
 */
export function getViewerState(path) {
  if (!_stateProvider) {
    log.warn(`Viewer状態プロバイダーが未設定です（取得パス: ${path}）`);
    return undefined;
  }
  return _stateProvider.getState(path);
}

/**
 * Viewer層から状態を設定する
 *
 * @param {string} path - 状態パス
 * @param {*} value - 設定値
 * @throws {Error} プロバイダーが未設定またはsetState未提供の場合
 */
export function setViewerState(path, value) {
  if (!_stateProvider || typeof _stateProvider.setState !== 'function') {
    log.warn(`Viewer状態プロバイダーのsetStateが未設定です（設定パス: ${path}）`);
    return;
  }
  _stateProvider.setState(path, value);
}

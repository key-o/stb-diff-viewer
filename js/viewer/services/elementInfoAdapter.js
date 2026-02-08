/**
 * @fileoverview 要素情報表示アダプター
 *
 * viewer層からUI層の要素情報パネルへの依存を排除するためのアダプター。
 * 依存性注入パターンを使用して、viewer層がUI層に直接依存しないようにします。
 *
 * @module viewer/services/elementInfoAdapter
 */

/**
 * @typedef {Object} ElementInfoService
 * @property {Function} setProviders - プロバイダー設定関数
 * @property {Function} [display] - 要素情報表示関数
 */

/** @type {ElementInfoService|null} */
let elementInfoService = null;

/**
 * 要素情報サービスを注入
 *
 * アプリケーション初期化時にmain.jsから呼び出されます。
 * UI層の要素情報パネル機能をviewer層から利用可能にします。
 *
 * @param {ElementInfoService} service - 要素情報サービス
 *
 * @example
 * import { injectElementInfoService } from './viewer/services/elementInfoAdapter.js';
 * import * as elementInfo from './ui/panels/element-info/index.js';
 *
 * injectElementInfoService(elementInfo);
 */
export function injectElementInfoService(service) {
  elementInfoService = service;
}

/**
 * 要素情報プロバイダーを設定
 *
 * viewer層から要素情報プロバイダーを設定する際に使用します。
 * 注入されたサービスがある場合のみ、プロバイダーを設定します。
 *
 * @param {Object} providers - プロバイダーオブジェクト
 *
 * @example
 * import { setElementInfoProviders } from './viewer/services/elementInfoAdapter.js';
 *
 * setElementInfoProviders({
 *   getElementData: (id) => { ... },
 *   getGeometry: (id) => { ... }
 * });
 */
export function setElementInfoProviders(providers) {
  if (elementInfoService && elementInfoService.setProviders) {
    elementInfoService.setProviders(providers);
  }
}

/**
 * 要素情報を表示
 *
 * 選択された要素の情報を表示パネルに表示します。
 * 注入されたサービスがある場合のみ表示を行います。
 *
 * @param {Object} elementData - 要素データ
 *
 * @example
 * import { displayElementInfo } from './viewer/services/elementInfoAdapter.js';
 *
 * displayElementInfo({
 *   id: 'C001',
 *   type: 'Column',
 *   properties: { ... }
 * });
 */
export function displayElementInfo(elementData) {
  if (elementInfoService && elementInfoService.display) {
    elementInfoService.display(elementData);
  }
}

/**
 * @fileoverview STBバージョン表示機能
 *
 * 2つのモデルのSTBバージョンをインライン表示し、
 * クロスバージョン比較時の差異情報を管理します。
 */

import { eventBus } from '../../app/events/eventBus.js';
import { EventTypes, VersionEvents } from '../../app/events/eventTypes.js';

/**
 * バージョン情報の状態
 */
let currentVersionInfo = {
  versionA: null,
  versionB: null,
  isCrossVersion: false,
};

/**
 * バージョン差分フィルタの状態
 * true: バージョン固有差分を表示する
 * false: バージョン固有差分を除外する
 */
let showVersionSpecificDifferences = true;

/**
 * バージョン情報を更新し、インラインバッジを更新
 * @param {Object} versionInfo - バージョン情報
 * @param {string} versionInfo.versionA - モデルAのバージョン
 * @param {string} versionInfo.versionB - モデルBのバージョン
 */
export function updateVersionPanel(versionInfo) {
  currentVersionInfo = {
    ...versionInfo,
    isCrossVersion:
      versionInfo.versionA !== versionInfo.versionB &&
      versionInfo.versionA !== 'unknown' &&
      versionInfo.versionB !== 'unknown',
  };

  // インライン要素を更新
  updateInlineVersionBadge('versionA-inline', versionInfo.versionA);
  updateInlineVersionBadge('versionB-inline', versionInfo.versionB);
}

/**
 * インラインバージョンバッジを更新
 * @param {string} elementId - 更新する要素のID
 * @param {string} version - バージョン文字列
 */
function updateInlineVersionBadge(elementId, version) {
  const el = document.getElementById(elementId);
  if (!el) return;

  el.textContent = formatVersion(version);
  el.className = 'version-badge-inline ' + getVersionClass(version);
}

/**
 * バージョン番号をフォーマット
 * @param {string} version - バージョン文字列
 * @returns {string} フォーマットされたバージョン
 */
function formatVersion(version) {
  if (!version || version === 'unknown') {
    return '不明';
  }
  return `STB ${version}`;
}

/**
 * バージョンに対応するCSSクラスを取得
 * @param {string} version - バージョン文字列
 * @returns {string} CSSクラス名
 */
function getVersionClass(version) {
  if (!version || version === 'unknown') {
    return 'version-unknown';
  }
  if (version.startsWith('2.0')) {
    return 'version-202';
  }
  if (version.startsWith('2.1')) {
    return 'version-210';
  }
  return 'version-other';
}

/**
 * バージョン情報をクリア
 */
export function clearVersionPanel() {
  currentVersionInfo = {
    versionA: null,
    versionB: null,
    isCrossVersion: false,
  };

  // インライン要素をクリア
  const versionAEl = document.getElementById('versionA-inline');
  const versionBEl = document.getElementById('versionB-inline');
  if (versionAEl) {
    versionAEl.textContent = '';
    versionAEl.className = 'version-badge-inline';
  }
  if (versionBEl) {
    versionBEl.textContent = '';
    versionBEl.className = 'version-badge-inline';
  }
}

/**
 * 現在のバージョン情報を取得
 * @returns {Object} 現在のバージョン情報
 */
export function getCurrentVersionInfo() {
  return { ...currentVersionInfo };
}

/**
 * クロスバージョン比較かどうかを判定
 * @returns {boolean} クロスバージョンの場合true
 */
export function isCrossVersionComparison() {
  return currentVersionInfo.isCrossVersion;
}

/**
 * バージョン固有差分を表示するかどうかを取得
 * @returns {boolean} 表示する場合true
 */
export function shouldShowVersionSpecificDifferences() {
  return showVersionSpecificDifferences;
}

/**
 * バージョン固有差分の表示設定を変更
 * @param {boolean} show - 表示する場合true
 */
export function setShowVersionSpecificDifferences(show) {
  showVersionSpecificDifferences = show;
  const checkbox = document.getElementById('version-diff-filter');
  if (checkbox) {
    checkbox.checked = show;
  }
  eventBus.emit(VersionEvents.FILTER_CHANGED, {
    showVersionSpecificDifferences: show,
  });
}

/**
 * イベントリスナーを設定
 */
export function setupVersionPanelEventListeners() {
  // 比較完了時
  eventBus.on(EventTypes.Comparison.COMPLETED, (data) => {
    if (data?.versionInfo) {
      updateVersionPanel(data.versionInfo);
    }
  });
}

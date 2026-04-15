/**
 * @fileoverview 重要度設定管理
 *
 * ImportanceManagerの設定読み込み・保存・リセット・通知ロジックを分離したモジュール。
 *
 * @module app/importance/settingsManager
 */

import { validateImportanceSettings } from '../../common-stb/validation/importanceValidation.js';
import { setState } from '../../data/state/globalState.js';
import { eventBus, ImportanceEvents } from '../../data/events/index.js';
import { FALLBACK_IMPORTANCE_SETTINGS } from '../../config/importanceConfig.js';
import { IMPORTANCE_LEVELS } from '../../constants/importanceLevels.js';
import { MVD_MODES, STB_ELEMENT_TABS } from '../../constants/importanceConstants.js';
import { createLogger } from '../../utils/logger.js';
import { recordFallback, recordCheck } from './statisticsCollector.js';
import { rebuildEffectiveImportanceSettings, setMvdImportanceLevel } from './mvdModeManager.js';

const log = createLogger('app:importance:settings');

/**
 * デフォルト重要度設定を読み込む
 * MVDベースのFALLBACK_IMPORTANCE_SETTINGSから設定を読み込む
 * @param {ImportanceManager} manager
 */
export async function loadDefaultSettings(manager) {
  // FALLBACK_IMPORTANCE_SETTINGSから設定を読み込む
  for (const [rawPath, importance] of Object.entries(FALLBACK_IMPORTANCE_SETTINGS)) {
    const path = manager.normalizePath(rawPath);
    if (!path) continue;
    if (!manager.orderedElementPaths.includes(path)) {
      manager.orderedElementPaths.push(path);
    }
    manager.userImportanceSettings.set(path, importance);
  }

  // 各タブの要素パスを生成（タブ表示用）
  for (const tab of STB_ELEMENT_TABS) {
    const elementPaths = manager.generateElementPathsForTab(tab.id);

    if (!manager.elementPathsByTab.has(tab.id)) {
      manager.elementPathsByTab.set(tab.id, []);
    }

    for (const path of elementPaths) {
      const normalizedPath = manager.normalizePath(path);
      if (!normalizedPath) continue;

      const tabPaths = manager.elementPathsByTab.get(tab.id);

      // 全体リストへの重複チェック
      if (!manager.orderedElementPaths.includes(normalizedPath)) {
        manager.orderedElementPaths.push(normalizedPath);
      }

      // タブ別リストへの重複チェック
      if (!tabPaths.includes(normalizedPath)) {
        tabPaths.push(normalizedPath);
      }

      // FALLBACK_IMPORTANCE_SETTINGSにない場合はREQUIREDをデフォルトとする
      if (!manager.userImportanceSettings.has(normalizedPath)) {
        manager.userImportanceSettings.set(normalizedPath, IMPORTANCE_LEVELS.REQUIRED);
      }
    }
  }
}

/**
 * 要素パスの重要度を取得する
 * @param {ImportanceManager} manager
 * @param {string} elementPath - 要素パス
 * @returns {string} 重要度レベル（設定がない場合はOPTIONAL）
 */
export function getImportanceLevel(manager, elementPath) {
  const normalizedPath = manager.normalizePath(elementPath);
  if (!normalizedPath) {
    return IMPORTANCE_LEVELS.OPTIONAL;
  }

  const importance = manager.userImportanceSettings.get(normalizedPath);

  if (!importance) {
    recordFallback(normalizedPath);

    // デバッグログ（開発時のみ）
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      log.debug(`[Importance] Fallback to OPTIONAL: ${normalizedPath}`);
    }
  } else {
    recordCheck();
  }

  // 設定がない場合はOPTIONAL（MVDに記載されていない要素は任意扱い）
  return importance || IMPORTANCE_LEVELS.OPTIONAL;
}

/**
 * 要素パスの重要度を設定する
 * @param {ImportanceManager} manager
 * @param {string} elementPath - 要素パス
 * @param {string} importanceLevel - 重要度レベル
 * @returns {boolean} 設定成功フラグ
 */
export function setImportanceLevel(manager, elementPath, importanceLevel) {
  if (!Object.values(IMPORTANCE_LEVELS).includes(importanceLevel)) {
    log.error(`無効な重要度レベル: ${importanceLevel}`);
    return false;
  }

  // 互換性維持: 単一レベル変更は S2/S4 の両方へ適用
  const setS2 = setMvdImportanceLevel(manager, elementPath, MVD_MODES.S2, importanceLevel, {
    notify: false,
    rebuild: false,
  });
  const setS4 = setMvdImportanceLevel(manager, elementPath, MVD_MODES.S4, importanceLevel, {
    notify: false,
    rebuild: false,
  });

  if (!setS2 || !setS4) {
    return false;
  }

  rebuildEffectiveImportanceSettings(manager);
  notifySettingsChanged(manager);
  return true;
}

/**
 * 全ての重要度設定を取得する
 * @param {ImportanceManager} manager
 * @returns {Map<string, string>} 要素パスと重要度のマップ
 */
export function getAllImportanceSettings(manager) {
  return new Map(manager.userImportanceSettings);
}

/**
 * 重要度設定の変更を関連システムに通知する
 * @param {ImportanceManager} manager
 */
export function notifySettingsChanged(manager) {
  // グローバル状態を更新
  setState('importanceSettings', {
    userSettings: Object.fromEntries(manager.userImportanceSettings),
    mvdSettings: {
      s2: Object.fromEntries(manager.mvdImportanceSettings[MVD_MODES.S2]),
      s4: Object.fromEntries(manager.mvdImportanceSettings[MVD_MODES.S4]),
    },
    orderedPaths: [...manager.orderedElementPaths],
    elementPathsByTab: Object.fromEntries(manager.elementPathsByTab),
    lastModified: new Date().toISOString(),
  });

  // MVD設定情報をglobalStateに反映
  setState('importance.currentConfigId', manager.currentConfigId);
  setState('importance.currentConfigName', manager.currentConfigName);

  // EventBus経由でイベントを発行
  eventBus.emit(ImportanceEvents.SETTINGS_CHANGED, {
    manager: manager,
    timestamp: Date.now(),
  });
}

/**
 * 重要度設定を検証する
 * @param {ImportanceManager} manager
 * @returns {Object} 検証結果
 */
export function validateSettings(manager) {
  const settingsObject = {
    elements: Object.fromEntries(manager.userImportanceSettings),
    attributes: {},
    lastModified: new Date().toISOString(),
  };

  return validateImportanceSettings(settingsObject);
}

/**
 * 重要度設定をリセットする
 * @param {ImportanceManager} manager
 */
export function resetToDefaults(manager) {
  manager.userImportanceSettings.clear();
  manager.orderedElementPaths = [];
  manager.elementPathsByTab.clear();
  manager.mvdImportanceSettings[MVD_MODES.S2] = new Map(
    manager.defaultMvdImportanceSettings[MVD_MODES.S2],
  );
  manager.mvdImportanceSettings[MVD_MODES.S4] = new Map(
    manager.defaultMvdImportanceSettings[MVD_MODES.S4],
  );
  manager.currentConfigId = MVD_MODES.COMBINED;
  manager.currentConfigName = 'MVD 統合';
  loadDefaultSettings(manager);
  rebuildEffectiveImportanceSettings(manager);
  notifySettingsChanged(manager);
}

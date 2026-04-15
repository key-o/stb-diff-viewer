/**
 * @fileoverview MVDモード管理
 *
 * ImportanceManagerのMVDモード関連ロジックを分離したモジュール。
 * S2/S4のMVD設定初期化、レベル管理、設定切り替えを担当します。
 *
 * @module app/importance/mvdModeManager
 */

import { loadConfigById } from '../../config/importanceConfigLoader.js';
import { IMPORTANCE_LEVELS } from '../../constants/importanceLevels.js';
import { MVD_MODES, IMPORTANCE_PRIORITY } from '../../constants/importanceConstants.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('app:importance:mvdMode');

/**
 * S4レベルをS2包含ルールで正規化
 * @param {ImportanceManager} manager
 * @param {string} path
 * @param {string} s2Level
 * @param {string} s4Level
 * @returns {string}
 */
export function normalizeS4Level(manager, path, s2Level, s4Level) {
  const fallbackS2 = s2Level || IMPORTANCE_LEVELS.OPTIONAL;
  const candidateS4 = s4Level || fallbackS2;
  return getPriority(candidateS4) >= getPriority(fallbackS2) ? candidateS4 : fallbackS2;
}

/**
 * 重要度レベルの優先度を取得
 * @param {string} level
 * @returns {number}
 */
export function getPriority(level) {
  return IMPORTANCE_PRIORITY[level] ?? IMPORTANCE_PRIORITY[IMPORTANCE_LEVELS.OPTIONAL];
}

/**
 * パターンに基づいて重要度マップを更新する
 * @param {Map<string, string>} map - 重要度マップ
 * @param {Array<{contains: string, level: string}>} patterns - パターン配列
 * @param {Set<string>} [excludePaths] - 除外するパス（明示設定済み）
 */
export function applyPatterns(map, patterns, excludePaths) {
  if (!patterns || patterns.length === 0) return;
  for (const [path] of map) {
    if (excludePaths && excludePaths.has(path)) continue;
    const pathLower = path.toLowerCase();
    for (const { contains, level } of patterns) {
      if (pathLower.includes(contains.toLowerCase())) {
        map.set(path, level);
        break;
      }
    }
  }
}

/**
 * MVD設定にパスが存在することを保証
 * @param {ImportanceManager} manager
 * @param {string} path
 * @returns {string|null}
 */
export function ensurePathExistsInMvdSettings(manager, path) {
  const normalizedPath = manager.resolveCanonicalPath(path);
  if (!normalizedPath) return null;
  if (!manager.orderedElementPaths.includes(normalizedPath)) {
    manager.orderedElementPaths.push(normalizedPath);
  }
  // 未登録パスは対象外として追加
  if (!manager.mvdImportanceSettings[MVD_MODES.S2].has(normalizedPath)) {
    manager.mvdImportanceSettings[MVD_MODES.S2].set(
      normalizedPath,
      IMPORTANCE_LEVELS.NOT_APPLICABLE,
    );
  }
  if (!manager.mvdImportanceSettings[MVD_MODES.S4].has(normalizedPath)) {
    manager.mvdImportanceSettings[MVD_MODES.S4].set(
      normalizedPath,
      IMPORTANCE_LEVELS.NOT_APPLICABLE,
    );
  }
  return normalizedPath;
}

/**
 * 現在の評価モードで有効な重要度設定を再構築
 * @param {ImportanceManager} manager
 */
export function rebuildEffectiveImportanceSettings(manager) {
  const sourceMode = manager.currentConfigId === MVD_MODES.S2 ? MVD_MODES.S2 : MVD_MODES.S4;
  const allPaths = new Set([
    ...manager.orderedElementPaths,
    ...manager.mvdImportanceSettings[MVD_MODES.S2].keys(),
    ...manager.mvdImportanceSettings[MVD_MODES.S4].keys(),
  ]);

  manager.userImportanceSettings.clear();

  for (const path of allPaths) {
    const level = getMvdImportanceLevel(manager, path, sourceMode);
    manager.userImportanceSettings.set(path, level);
  }

  if (!manager.currentConfigId) {
    manager.currentConfigId = MVD_MODES.COMBINED;
  }

  if (manager.currentConfigId === MVD_MODES.S2) {
    manager.currentConfigName = 'MVD S2 (必須)';
  } else if (manager.currentConfigId === MVD_MODES.S4) {
    manager.currentConfigName = 'MVD S4 (任意)';
  } else {
    manager.currentConfigName = 'MVD 統合';
  }
}

/**
 * 指定MVDでの重要度を取得
 * @param {ImportanceManager} manager
 * @param {string} elementPath
 * @param {'s2'|'s4'} mvdMode
 * @returns {string}
 */
export function getMvdImportanceLevel(manager, elementPath, mvdMode) {
  const normalizedPath = ensurePathExistsInMvdSettings(manager, elementPath);
  if (!normalizedPath) {
    return IMPORTANCE_LEVELS.NOT_APPLICABLE;
  }

  const map =
    mvdMode === MVD_MODES.S2
      ? manager.mvdImportanceSettings[MVD_MODES.S2]
      : manager.mvdImportanceSettings[MVD_MODES.S4];
  return map.get(normalizedPath) ?? IMPORTANCE_LEVELS.NOT_APPLICABLE;
}

/**
 * 指定MVDでの重要度を設定
 * @param {ImportanceManager} manager
 * @param {string} elementPath
 * @param {'s2'|'s4'} mvdMode
 * @param {string} importanceLevel
 * @param {Object} [options]
 * @param {boolean} [options.notify=true]
 * @param {boolean} [options.rebuild=true]
 * @returns {boolean}
 */
export function setMvdImportanceLevel(
  manager,
  elementPath,
  mvdMode,
  importanceLevel,
  options = {},
) {
  const { notify = true, rebuild = true } = options;
  if (!Object.values(IMPORTANCE_LEVELS).includes(importanceLevel)) {
    log.error(`無効な重要度レベル: ${importanceLevel}`);
    return false;
  }
  if (mvdMode !== MVD_MODES.S2 && mvdMode !== MVD_MODES.S4) {
    log.error(`無効なMVDモード: ${mvdMode}`);
    return false;
  }

  const normalizedPath = ensurePathExistsInMvdSettings(manager, elementPath);
  if (!normalizedPath) {
    return false;
  }

  if (mvdMode === MVD_MODES.S2) {
    manager.mvdImportanceSettings[MVD_MODES.S2].set(normalizedPath, importanceLevel);
    const currentS4 = manager.mvdImportanceSettings[MVD_MODES.S4].get(normalizedPath);
    manager.mvdImportanceSettings[MVD_MODES.S4].set(
      normalizedPath,
      normalizeS4Level(manager, normalizedPath, importanceLevel, currentS4),
    );
  } else {
    const s2Level = manager.mvdImportanceSettings[MVD_MODES.S2].get(normalizedPath);
    manager.mvdImportanceSettings[MVD_MODES.S4].set(
      normalizedPath,
      normalizeS4Level(manager, normalizedPath, s2Level, importanceLevel),
    );
  }

  if (rebuild) {
    rebuildEffectiveImportanceSettings(manager);
  }
  if (notify) {
    manager.notifySettingsChanged();
  }
  return true;
}

/**
 * S2/S4 のMVD設定を初期化する
 * @param {ImportanceManager} manager
 */
export async function initializeMvdSettings(manager) {
  let s2Config = null;
  let s4Config = null;

  try {
    [s2Config, s4Config] = await Promise.all([
      loadConfigById(MVD_MODES.S2),
      loadConfigById(MVD_MODES.S4),
    ]);
  } catch (error) {
    log.warn('[ImportanceManager] MVD設定ファイルの読み込みに失敗しました:', error);
  }

  manager.s2ParameterChecks.clear();

  // 設定ファイルが読めなかった場合は機能利用不可
  if (!s2Config || !s4Config) {
    log.error('[ImportanceManager] MVD設定ファイルが読み込めないため重要度設定を利用できません。');
    manager.mvdImportanceSettings[MVD_MODES.S2] = new Map();
    manager.mvdImportanceSettings[MVD_MODES.S4] = new Map();
    rebuildEffectiveImportanceSettings(manager);
    return;
  }

  // S2/S4 の REQUIRED パスセットを構築
  const s2RequiredPaths = new Set();
  for (const [rawPath, level] of Object.entries(s2Config.settings || {})) {
    if (level !== IMPORTANCE_LEVELS.REQUIRED) continue;
    const path = manager.resolveCanonicalPath(rawPath);
    if (path) s2RequiredPaths.add(path);
  }

  const s4RequiredPaths = new Set();
  for (const [rawPath, level] of Object.entries(s4Config.settings || {})) {
    if (level !== IMPORTANCE_LEVELS.REQUIRED) continue;
    const path = manager.resolveCanonicalPath(rawPath);
    if (path) s4RequiredPaths.add(path);
  }

  // S4 は S2 を包含するため S2 の REQUIRED は S4 にも追加
  for (const path of s2RequiredPaths) {
    s4RequiredPaths.add(path);
  }

  // 全既知パスを収集（XSD由来 + S2/S4 JSON由来）
  const allPaths = new Set([
    ...manager.orderedElementPaths.map((p) => manager.normalizePath(p)).filter(Boolean),
    ...s2RequiredPaths,
    ...s4RequiredPaths,
  ]);

  // orderedElementPaths を更新（JSON由来の新規パスを追加）
  for (const path of allPaths) {
    if (!manager.orderedElementPaths.includes(path)) {
      manager.orderedElementPaths.push(path);
    }
  }

  // フラットパス（JSON由来）から「要素名/@属性名」の末尾キーセットを構築。
  // XSD由来の階層パス（StbSecColumn_RC/StbSecFigureColumn_RC/StbSecColumn_RC_Rect/@width_X）
  // とフラットパス（StbSecColumn_RC_Rect/@width_X）のマッチングに使用。
  const buildTailKeySet = (requiredPaths) => {
    const tails = new Set();
    for (const p of requiredPaths) {
      const atIdx = p.lastIndexOf('/@');
      if (atIdx === -1) continue;
      const slashBefore = p.lastIndexOf('/', atIdx - 1);
      if (slashBefore === -1) continue;
      tails.add(p.slice(slashBefore + 1)); // "ElementName/@attrName"
    }
    return tails;
  };
  const s2TailKeys = buildTailKeySet(s2RequiredPaths);
  const s4TailKeys = buildTailKeySet(s4RequiredPaths);

  const matchesTailKey = (path, tailKeys) => {
    const atIdx = path.lastIndexOf('/@');
    if (atIdx === -1) return false;
    const slashBefore = path.lastIndexOf('/', atIdx - 1);
    if (slashBefore === -1) return false;
    return tailKeys.has(path.slice(slashBefore + 1));
  };

  // S2/S4 マップを構築：JSON の required リストに含まれる → REQUIRED、それ以外 → NOT_APPLICABLE
  const s2Map = new Map();
  const s4Map = new Map();
  for (const path of allPaths) {
    const isS2 = s2RequiredPaths.has(path) || matchesTailKey(path, s2TailKeys);
    const isS4 = s4RequiredPaths.has(path) || matchesTailKey(path, s4TailKeys);
    s2Map.set(path, isS2 ? IMPORTANCE_LEVELS.REQUIRED : IMPORTANCE_LEVELS.NOT_APPLICABLE);
    s4Map.set(path, isS4 ? IMPORTANCE_LEVELS.REQUIRED : IMPORTANCE_LEVELS.NOT_APPLICABLE);
  }

  manager.mvdImportanceSettings[MVD_MODES.S2] = s2Map;
  manager.mvdImportanceSettings[MVD_MODES.S4] = s4Map;

  if (manager.defaultMvdImportanceSettings[MVD_MODES.S2].size === 0) {
    manager.defaultMvdImportanceSettings[MVD_MODES.S2] = new Map(s2Map);
    manager.defaultMvdImportanceSettings[MVD_MODES.S4] = new Map(s4Map);
  }

  rebuildEffectiveImportanceSettings(manager);
}

/**
 * 外部設定ファイルから重要度設定を読み込む
 * @param {ImportanceManager} manager
 * @param {string} configId - 設定ID ('mvd-combined', 's2', 's4')
 * @returns {Promise<boolean>} 読み込み成功フラグ
 */
export async function loadExternalConfig(manager, configId) {
  try {
    const normalizedConfigId = configId || MVD_MODES.COMBINED;

    if (![MVD_MODES.S2, MVD_MODES.S4, MVD_MODES.COMBINED].includes(normalizedConfigId)) {
      throw new Error(`不明な設定ID: ${configId}`);
    }

    // 初期化前の利用にも対応
    if (
      manager.mvdImportanceSettings[MVD_MODES.S2].size === 0 ||
      manager.mvdImportanceSettings[MVD_MODES.S4].size === 0
    ) {
      await initializeMvdSettings(manager);
    }

    manager.currentConfigId = normalizedConfigId;
    rebuildEffectiveImportanceSettings(manager);

    manager.notifySettingsChanged();
    return true;
  } catch (error) {
    log.error('[ImportanceManager] 外部設定の読み込みに失敗:', error);
    return false;
  }
}

/**
 * 現在の設定IDを取得
 * @param {ImportanceManager} manager
 * @returns {string|null} 設定ID
 */
export function getCurrentConfigId(manager) {
  return manager.currentConfigId || null;
}

/**
 * 現在の設定名を取得
 * @param {ImportanceManager} manager
 * @returns {string|null} 設定名
 */
export function getCurrentConfigName(manager) {
  return manager.currentConfigName || 'デフォルト';
}

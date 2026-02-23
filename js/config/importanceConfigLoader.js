/**
 * @fileoverview 重要度設定ローダー
 */

import { IMPORTANCE_LEVELS } from '../constants/importanceLevels.js';

/**
 * 利用可能な設定ファイル一覧
 */
export const AVAILABLE_CONFIGS = [
  {
    id: 'mvd-combined',
    name: 'MVD 統合',
    path: '../config/importance-mvd-combined.json',
    description: 'S2/S4 の統合設定',
  },
  {
    id: 's2',
    name: 'MVD S2 (必須)',
    path: '../config/importance-s2.json',
    description: 'S2対応項目を必須対象として設定',
  },
  {
    id: 's4',
    name: 'MVD S4 (任意)',
    path: '../config/importance-s4.json',
    description: 'S4対応項目を対象として設定',
  },
];

/**
 * 外部JSONファイルから重要度設定を読み込む
 * @param {string} configPath - 設定ファイルのパス
 * @returns {Promise<Object>} 設定オブジェクト
 */
export async function loadImportanceConfig(configPath) {
  try {
    const response = await fetch(configPath);
    if (!response.ok) {
      throw new Error(`設定ファイルの読み込みに失敗: ${response.status}`);
    }
    const config = await response.json();

    // 設定を正規化（文字列からIMPORTANCE_LEVELSの値に変換）
    const normalizedSettings = {};
    for (const [path, level] of Object.entries(config.settings || {})) {
      normalizedSettings[path] = normalizeImportanceLevel(level);
    }

    // パターン設定を正規化
    const normalizedPatterns = [];
    if (config.patterns) {
      for (const [pattern, level] of Object.entries(config.patterns)) {
        normalizedPatterns.push({
          contains: pattern,
          level: normalizeImportanceLevel(level),
        });
      }
    }

    // S2パラメータチェック設定（JSON拡張）
    const normalizedParameterChecks = {};
    if (config.parameterChecks && typeof config.parameterChecks === 'object') {
      for (const [path, options] of Object.entries(config.parameterChecks)) {
        normalizedParameterChecks[path] = normalizeParameterCheckOptions(options);
      }
    }

    return {
      name: config.name || 'カスタム設定',
      description: config.description || '',
      defaultLevel: normalizeImportanceLevel(config.defaultLevel || 'optional'),
      patterns: normalizedPatterns,
      settings: normalizedSettings,
      parameterChecks: normalizedParameterChecks,
    };
  } catch (error) {
    console.error('[ImportanceConfigLoader] 設定ファイルの読み込みエラー:', error);
    throw error;
  }
}

/**
 * 重要度レベル文字列を正規化
 * @param {string} level - 重要度レベル文字列
 * @returns {string} 正規化された重要度レベル
 */
function normalizeImportanceLevel(level) {
  if (typeof level !== 'string') {
    return IMPORTANCE_LEVELS.OPTIONAL;
  }

  const levelMap = {
    required: IMPORTANCE_LEVELS.REQUIRED,
    optional: IMPORTANCE_LEVELS.OPTIONAL,
    unnecessary: IMPORTANCE_LEVELS.UNNECESSARY,
    notapplicable: IMPORTANCE_LEVELS.NOT_APPLICABLE,
    not_applicable: IMPORTANCE_LEVELS.NOT_APPLICABLE,
  };
  return levelMap[level.toLowerCase()] || IMPORTANCE_LEVELS.OPTIONAL;
}

/**
 * S2パラメータチェック設定を正規化
 * @param {boolean|Object} options
 * @returns {{checkRequired: boolean, checkValue: boolean}}
 */
function normalizeParameterCheckOptions(options) {
  if (options === false) {
    return { checkRequired: false, checkValue: false };
  }

  if (!options || typeof options !== 'object') {
    return { checkRequired: true, checkValue: true };
  }

  return {
    checkRequired: options.checkRequired !== false,
    checkValue: options.checkValue !== false,
  };
}

/**
 * 設定IDから設定ファイルを読み込む
 * @param {string} configId - 設定ID（'mvd-combined', 's2', 's4'など）
 * @returns {Promise<Object>} 設定オブジェクト
 */
export async function loadConfigById(configId) {
  const configInfo = AVAILABLE_CONFIGS.find((c) => c.id === configId);
  if (!configInfo) {
    throw new Error(`不明な設定ID: ${configId}`);
  }

  // パスをベースURLから計算
  const basePath = import.meta.url.replace(/\/[^/]+$/, '');
  const fullPath = new URL(configInfo.path, basePath).href;

  const config = await loadImportanceConfig(fullPath);

  return config;
}

/**
 * デフォルト設定（MVD統合）を読み込む
 * @returns {Promise<Object>} 設定オブジェクト
 */
export async function loadDefaultConfig() {
  return loadConfigById('mvd-combined');
}

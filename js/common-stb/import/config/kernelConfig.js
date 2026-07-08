/**
 * @fileoverview STB読み込み共通カーネルの依存性注入（DI）設定
 *
 * 共通カーネル（common-stb/import/）をアプリケーション非依存に保つための
 * 注入ポイントを提供します。MatrixCalc の stb-parser-setup.js と同じ思想で、
 * アプリケーション側のセットアップモジュールから以下を注入できます:
 *
 * - setSectionConfig(config): 断面抽出設定（未注入時はカーネル同梱の
 *   sectionConfig.js を使用）
 * - setLoggerFactory(factory): ロガーファクトリ（未注入時は console ベースの
 *   軽量ロガーを使用。warn/error のみ出力）
 *
 * カーネル内のモジュールは createKernelLogger(namespace) でロガーを取得します。
 * 返されるロガーは遅延解決プロキシであり、モジュール読み込み後に
 * setLoggerFactory が呼ばれても注入後のファクトリが使用されます。
 *
 * @module common-stb/import/config/kernelConfig
 */

import { SECTION_CONFIG as DEFAULT_SECTION_CONFIG } from './sectionConfig.js';

// ─────────────────────────────────────────────
// SECTION_CONFIG 注入
// ─────────────────────────────────────────────

let _sectionConfig = DEFAULT_SECTION_CONFIG;

/**
 * 断面抽出設定を注入する（アプリケーション固有の設定で上書き）
 * @param {Object|null} config - SECTION_CONFIG 形式の設定。null でデフォルトに戻す
 */
export function setSectionConfig(config) {
  _sectionConfig = config || DEFAULT_SECTION_CONFIG;
}

/**
 * 現在の断面抽出設定を取得する
 * @returns {Object} SECTION_CONFIG 形式の設定
 */
export function getSectionConfig() {
  return _sectionConfig;
}

// ─────────────────────────────────────────────
// ロガー注入
// ─────────────────────────────────────────────

const noop = () => {};

/**
 * デフォルトロガーファクトリ（console ベース、warn/error のみ出力）
 * @param {string} namespace - ログ名前空間
 * @returns {Object} ロガー
 */
function defaultLoggerFactory(namespace) {
  return {
    error: (...args) => console.error(`[${namespace}]`, ...args),
    warn: (...args) => console.warn(`[${namespace}]`, ...args),
    info: noop,
    debug: noop,
    trace: noop,
    once: noop,
  };
}

let _loggerFactory = defaultLoggerFactory;
const _loggerCache = new Map();

/**
 * ロガーファクトリを注入する
 * @param {(namespace: string) => Object|null} factory - namespace を受け取り
 *   { error, warn, info, debug } を持つロガーを返す関数。null でデフォルトに戻す
 */
export function setLoggerFactory(factory) {
  _loggerFactory = factory || defaultLoggerFactory;
  _loggerCache.clear();
}

/**
 * カーネル用ロガーを作成する（遅延解決プロキシ）
 * @param {string} namespace - ログ名前空間
 * @returns {Object} ロガー（error/warn/info/debug/trace/once）
 */
export function createKernelLogger(namespace) {
  const resolve = () => {
    let logger = _loggerCache.get(namespace);
    if (!logger) {
      logger = _loggerFactory(namespace);
      _loggerCache.set(namespace, logger);
    }
    return logger;
  };
  return {
    error: (...args) => resolve().error?.(...args),
    warn: (...args) => resolve().warn?.(...args),
    info: (...args) => resolve().info?.(...args),
    debug: (...args) => resolve().debug?.(...args),
    trace: (...args) => resolve().trace?.(...args),
    once: (key, ...args) => resolve().once?.(key, ...args),
  };
}

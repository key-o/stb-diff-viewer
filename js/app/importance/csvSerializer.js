/**
 * @fileoverview 重要度設定CSV入出力モジュール
 *
 * 重要度設定のCSVインポート/エクスポート機能を提供する。
 * Layer 2（app）に配置。
 *
 * @module app/importance/csvSerializer
 */

import { IMPORTANCE_LEVEL_NAMES } from '../../constants/importanceLevels.js';

/**
 * CSV行を解析する
 * @param {string} line - CSV行
 * @returns {[string|null, string|null, string|null, string|null]} パス/S2/S4/有効重要度
 */
export function parseCSVLine(line) {
  if (!line || typeof line !== 'string') {
    return [null, null, null, null];
  }

  // "..." で囲まれたカラムを優先的に解析（RFC 4180: "" はエスケープされた " を表す）
  const quoted = [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1].replace(/""/g, '"'));
  if (quoted.length >= 2) {
    return [quoted[0], quoted[1], quoted[2] ?? null, quoted[3] ?? null];
  }

  const parts = line.split(',').map((part) => part.trim());
  if (parts.length >= 4) {
    return [parts[0], parts[1], parts[2], parts[3]];
  }
  if (parts.length >= 2) {
    return [parts[0], parts[1], null, null];
  }

  return [null, null, null, null];
}

/**
 * 日本語名から重要度レベルを取得する
 * @param {string} importanceName - 重要度の日本語名
 * @returns {string|null} 重要度レベル
 */
export function getImportanceLevelFromName(importanceName) {
  for (const [level, name] of Object.entries(IMPORTANCE_LEVEL_NAMES)) {
    if (name === importanceName) {
      return level;
    }
  }
  return null;
}

/**
 * 重要度設定をCSV形式にエクスポートする
 *
 * @param {string[]} orderedPaths - 順序付きパス配列
 * @param {function(string, string): string} getMvdLevel - MVD重要度取得関数 (path, mode) => level
 * @param {function(string): string} getImportance - 有効重要度取得関数 (path) => level
 * @returns {string} CSV形式の文字列
 */
export function exportToCSV(orderedPaths, getMvdLevel, getImportance) {
  const lines = ['Element Path,S2 Level,S4 Level,Effective Level'];

  for (const path of orderedPaths) {
    const s2Level = getMvdLevel(path, 's2');
    const s4Level = getMvdLevel(path, 's4');
    const effectiveLevel = getImportance(path);
    lines.push(
      `"${path}","${IMPORTANCE_LEVEL_NAMES[s2Level] ?? ''}","${IMPORTANCE_LEVEL_NAMES[s4Level] ?? ''}","${IMPORTANCE_LEVEL_NAMES[effectiveLevel] ?? ''}"`,
    );
  }

  return lines.join('\n');
}

/**
 * CSV形式の重要度設定をインポートする
 *
 * @param {string} csvContent - CSV形式の文字列
 * @param {function(string, string, string, Object): boolean} setMvdLevel
 *   MVD重要度設定関数 (path, mode, level, options) => success
 * @param {function(): void} rebuild - 有効設定再構築関数
 * @param {function(): void} notify - 変更通知関数
 * @param {Object} logger - ログ出力オブジェクト
 * @returns {boolean} インポート成功フラグ
 */
export function importFromCSV(csvContent, setMvdLevel, rebuild, notify, logger) {
  try {
    const lines = csvContent.split('\n').filter((line) => line.trim());
    if (lines.length <= 1) {
      return false;
    }

    // ヘッダー行をスキップ
    const dataLines = lines.slice(1);
    let updated = false;

    for (const line of dataLines) {
      const [pathStr, s2Name, s4Name, effectiveName] = parseCSVLine(line);
      if (!pathStr) {
        continue;
      }

      const s2Level = getImportanceLevelFromName(s2Name);
      const s4Level = getImportanceLevelFromName(s4Name);
      const effectiveLevel = effectiveName ? getImportanceLevelFromName(effectiveName) : null;

      if (s2Level) {
        setMvdLevel(pathStr, 's2', s2Level, { notify: false, rebuild: false });
        updated = true;
      }

      if (s4Level) {
        setMvdLevel(pathStr, 's4', s4Level, { notify: false, rebuild: false });
        updated = true;
      }

      // 旧形式（Element Path,Importance Level）も受け入れる
      if (!s2Level && !s4Level && effectiveLevel) {
        setMvdLevel(pathStr, 's2', effectiveLevel, { notify: false, rebuild: false });
        setMvdLevel(pathStr, 's4', effectiveLevel, { notify: false, rebuild: false });
        updated = true;
      }
    }

    if (!updated) {
      return false;
    }

    rebuild();
    notify();
    return true;
  } catch (error) {
    logger.error('CSVのインポートに失敗しました:', error);
    return false;
  }
}

/**
 * @fileoverview 重要度統計収集モジュール
 *
 * 重要度設定に関する統計情報の収集とフォールバック統計管理を提供する。
 * Layer 2（app）に配置。
 *
 * @module app/importance/statisticsCollector
 */

import { IMPORTANCE_LEVELS } from '../../constants/importanceLevels.js';
import { getState, setState } from '../globalState.js';

/**
 * 重要度設定の統計情報を収集する
 *
 * @param {string[]} orderedPaths - 順序付きパス配列
 * @param {Map<string, string>} userSettings - ユーザー重要度設定マップ
 * @param {function(string, string): string} getMvdLevel - MVD重要度取得関数 (path, mode) => level
 * @param {function(string): {required: boolean, kind: string}} getSchemaReq - スキーマ必須判定関数
 * @returns {Object} 統計情報
 */
export function collectStatistics(orderedPaths, userSettings, getMvdLevel, getSchemaReq) {
  const stats = {
    total: orderedPaths.length,
    byLevel: {},
    totalParameterCount: 0,
    xsdRequiredCount: 0,
    s2TargetCount: 0,
    s4TargetCount: 0,
  };

  // レベル別の統計
  for (const level of Object.values(IMPORTANCE_LEVELS)) {
    stats.byLevel[level] = 0;
  }

  for (const importance of userSettings.values()) {
    stats.byLevel[importance]++;
  }

  for (const path of orderedPaths) {
    // 重要度設定画面では属性パラメータを対象とする
    if (!path.includes('/@')) {
      continue;
    }
    stats.totalParameterCount++;

    if (getSchemaReq(path).required) {
      stats.xsdRequiredCount++;
    }

    const s2Level = getMvdLevel(path, 's2');
    const s4Level = getMvdLevel(path, 's4');

    if (s2Level !== IMPORTANCE_LEVELS.NOT_APPLICABLE) {
      stats.s2TargetCount++;
    }
    if (s4Level !== IMPORTANCE_LEVELS.NOT_APPLICABLE) {
      stats.s4TargetCount++;
    }
  }

  return stats;
}

/**
 * フォールバック統計をリセットする
 */
export function resetFallbackStats() {
  setState('importance.fallbackStats', {
    totalChecks: 0,
    fallbackCount: 0,
    undefinedPaths: new Set(),
  });
}

/**
 * フォールバック統計を記録する
 *
 * @param {string} normalizedPath - 正規化されたパス
 */
export function recordFallback(normalizedPath) {
  const stats = getState('importance.fallbackStats') || {
    totalChecks: 0,
    fallbackCount: 0,
    undefinedPaths: new Set(),
  };

  stats.totalChecks++;
  stats.fallbackCount++;
  stats.undefinedPaths.add(normalizedPath);
  setState('importance.fallbackStats', stats);
}

/**
 * 統計カウンターをインクリメントする（フォールバックなし）
 */
export function recordCheck() {
  const stats = getState('importance.fallbackStats') || {
    totalChecks: 0,
    fallbackCount: 0,
    undefinedPaths: new Set(),
  };

  stats.totalChecks++;
  setState('importance.fallbackStats', stats);
}

/**
 * @fileoverview バージョン対応比較戦略
 *
 * STBバージョン間の差異を考慮して要素を比較する戦略。
 * バージョン固有の属性差異を区別し、実質的な差異のみを報告します。
 */

import { BaseStrategy } from './BaseStrategy.js';
import { BasicComparisonStrategy } from './BaseStrategy.js';
import {
  compareElementsWithVersionAwareness as semanticCompare,
  isVersionSpecificAttribute,
  normalizeAttributeName,
  DIFF_TYPE,
} from './semanticEquivalence.js';

/**
 * バージョン対応比較結果の型定義
 * @typedef {Object} VersionAwareComparisonResult
 * @property {Array} matched - 一致した要素
 * @property {Array} onlyA - モデルAのみの要素
 * @property {Array} onlyB - モデルBのみの要素
 * @property {Array} versionDifferences - バージョン固有の差異
 * @property {Object} versionInfo - バージョン情報
 * @property {Object} summary - サマリー情報
 */

/**
 * バージョン対応比較戦略
 */
export class VersionAwareStrategy extends BaseStrategy {
  /**
   * @param {Object} [defaultVersionInfo={}] - デフォルトバージョン情報
   */
  constructor(defaultVersionInfo = {}) {
    super();
    this.defaultVersionInfo = {
      versionA: '2.0.2',
      versionB: '2.1.0',
      ...defaultVersionInfo,
    };
  }

  get name() {
    return 'versionAware';
  }

  /**
   * @override
   */
  isApplicable(options = {}) {
    const versionInfo = options.versionInfo || this.defaultVersionInfo;
    return (
      versionInfo &&
      versionInfo.versionA !== versionInfo.versionB &&
      versionInfo.versionA !== 'unknown' &&
      versionInfo.versionB !== 'unknown'
    );
  }

  /**
   * @override
   */
  compare(elementsA, elementsB, nodeMapA, nodeMapB, keyExtractor, options = {}) {
    const versionInfo = options.versionInfo || this.defaultVersionInfo;
    const { versionA = '2.0.2', versionB = '2.1.0' } = versionInfo;

    // 基本比較を実行
    const basicStrategy = new BasicComparisonStrategy();
    const basicResult = basicStrategy.compare(
      elementsA,
      elementsB,
      nodeMapA,
      nodeMapB,
      keyExtractor,
      options,
    );

    // 一致した要素に対してバージョン対応比較を追加
    const enhancedMatched = basicResult.matched.map((match) => {
      const versionCompare = this.compareElementData(match.dataA, match.dataB, {
        versionInfo: { versionA, versionB },
      });

      return {
        ...match,
        versionComparison: versionCompare,
        hasVersionOnlyDiff: versionCompare.isVersionSpecificOnly,
        versionDifferences: versionCompare.versionOnlyDifferences,
      };
    });

    // バージョン固有の差異を集計
    const versionDifferences = enhancedMatched
      .filter((m) => m.hasVersionOnlyDiff)
      .map((m) => ({
        elementA: m.dataA,
        elementB: m.dataB,
        differences: m.versionDifferences,
      }));

    return {
      matched: enhancedMatched,
      onlyA: basicResult.onlyA,
      onlyB: basicResult.onlyB,
      versionDifferences,
      versionInfo: { versionA, versionB },
      summary: {
        totalMatched: enhancedMatched.length,
        totalOnlyA: basicResult.onlyA.length,
        totalOnlyB: basicResult.onlyB.length,
        versionOnlyDiffCount: versionDifferences.length,
        isCrossVersionComparison: versionA !== versionB,
      },
    };
  }

  /**
   * @override
   */
  compareElementData(dataA, dataB, options = {}) {
    const versionInfo = options.versionInfo || this.defaultVersionInfo;
    const { versionA = '2.0.2', versionB = '2.1.0' } = versionInfo;

    // セマンティック比較を実行
    const semanticResult = semanticCompare(dataA, dataB, {
      versionA,
      versionB,
      excludeVersionSpecific: true,
    });

    return {
      isEqual: semanticResult.isEqual,
      realDifferences: semanticResult.differences,
      versionOnlyDifferences: semanticResult.versionOnlyDifferences,
      hasRealDifferences: semanticResult.hasRealDifferences,
      isVersionSpecificOnly: semanticResult.isVersionSpecificOnly,
      versionA,
      versionB,
    };
  }
}

/**
 * クロスバージョン比較かどうかを判定
 * @param {string} versionA - モデルAのバージョン
 * @param {string} versionB - モデルBのバージョン
 * @returns {boolean} クロスバージョンの場合true
 */
export function isCrossVersionComparison(versionA, versionB) {
  return versionA !== versionB && versionA !== 'unknown' && versionB !== 'unknown';
}

/**
 * バージョン固有の属性差異をフィルタリング
 * @param {Array} differences - 差異の配列
 * @param {string} elementType - 要素タイプ
 * @param {string} version - バージョン
 * @returns {Array} フィルタリング後の差異
 */
export function filterVersionSpecificDifferences(differences, elementType, version) {
  return differences.filter((diff) => {
    const attrName = diff.attribute || diff.key;
    return !isVersionSpecificAttribute(elementType, attrName, version);
  });
}

/**
 * 属性名を正規化して比較
 * @param {string} attrA - 属性名A
 * @param {string} attrB - 属性名B
 * @returns {boolean} 正規化後に等しい場合true
 */
export function areAttributesEquivalent(attrA, attrB) {
  if (attrA === attrB) return true;
  return normalizeAttributeName(attrA) === normalizeAttributeName(attrB);
}

// DIFF_TYPE定数の再エクスポート
export { DIFF_TYPE };

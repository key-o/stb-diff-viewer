/**
 * @fileoverview 許容差を考慮した比較戦略
 *
 * 数値パラメータの許容差を考慮して要素を比較する戦略。
 * 座標、寸法などの微小な差異を許容範囲として扱います。
 */

import { BaseStrategy } from './BaseStrategy.js';
import { BasicComparisonStrategy } from './ComparisonStrategy.js';
import { getToleranceConfig } from '../../config/toleranceConfig.js';
import { compareElementDataWithTolerance } from '../../app/toleranceComparison.js';

/**
 * 許容差を考慮した比較戦略
 */
export class ToleranceStrategy extends BaseStrategy {
  /**
   * @param {Object} [defaultConfig=null] - デフォルト許容差設定
   */
  constructor(defaultConfig = null) {
    super();
    this.defaultConfig = defaultConfig;
  }

  get name() {
    return 'tolerance';
  }

  /**
   * @override
   */
  isApplicable(options = {}) {
    const config = options.toleranceConfig || this.defaultConfig || getToleranceConfig();
    return config && config.enabled && !config.strictMode;
  }

  /**
   * @override
   */
  compare(elementsA, elementsB, nodeMapA, nodeMapB, keyExtractor, options = {}) {
    const config = options.toleranceConfig || this.defaultConfig || getToleranceConfig();

    // 厳密モードまたは許容差無効の場合は基本比較
    if (config.strictMode || !config.enabled) {
      const basicStrategy = new BasicComparisonStrategy();
      const basicResult = basicStrategy.compare(
        elementsA,
        elementsB,
        nodeMapA,
        nodeMapB,
        keyExtractor,
        options,
      );
      return {
        exact: basicResult.matched,
        withinTolerance: [],
        mismatch: [],
        onlyA: basicResult.onlyA,
        onlyB: basicResult.onlyB,
        // 従来互換のmatched
        matched: basicResult.matched,
      };
    }

    const result = {
      exact: [],
      withinTolerance: [],
      mismatch: [],
      onlyA: [],
      onlyB: [],
    };

    const mapA = new Map();
    const mapB = new Map();

    // モデルAの要素をマッピング
    for (const elementA of elementsA) {
      const { key, data } = keyExtractor(elementA, nodeMapA);
      if (key !== null) {
        if (!mapA.has(key)) {
          mapA.set(key, []);
        }
        mapA.get(key).push(data);
      }
    }

    // モデルBの要素をマッピングし、マッチングを試行
    for (const elementB of elementsB) {
      const { key, data } = keyExtractor(elementB, nodeMapB);
      if (key === null) continue;

      let foundMatch = false;

      // 同じキーの要素を探す（完全一致）
      if (mapA.has(key)) {
        const candidatesA = mapA.get(key);

        for (let i = 0; i < candidatesA.length; i++) {
          const dataA = candidatesA[i];
          const comparisonResult = compareElementDataWithTolerance(dataA, data, config);

          if (comparisonResult.match && comparisonResult.type === 'exact') {
            result.exact.push({
              dataA: dataA,
              dataB: data,
              matchType: 'exact',
              differences: comparisonResult.differences,
            });
            candidatesA.splice(i, 1);
            if (candidatesA.length === 0) {
              mapA.delete(key);
            }
            foundMatch = true;
            break;
          }
        }
      }

      // 完全一致が見つからない場合、許容差内の一致を探す
      if (!foundMatch) {
        for (const [keyA, candidatesA] of mapA.entries()) {
          for (let i = 0; i < candidatesA.length; i++) {
            const dataA = candidatesA[i];
            const comparisonResult = compareElementDataWithTolerance(dataA, data, config);

            if (comparisonResult.match && comparisonResult.type === 'withinTolerance') {
              result.withinTolerance.push({
                dataA: dataA,
                dataB: data,
                matchType: 'withinTolerance',
                differences: comparisonResult.differences,
              });
              candidatesA.splice(i, 1);
              if (candidatesA.length === 0) {
                mapA.delete(keyA);
              }
              foundMatch = true;
              break;
            }
          }
          if (foundMatch) break;
        }
      }

      // マッチが見つからない場合
      if (!foundMatch) {
        if (!mapB.has(key)) {
          mapB.set(key, []);
        }
        mapB.get(key).push(data);
      }
    }

    // 残りの要素を振り分け
    for (const candidatesA of mapA.values()) {
      result.onlyA.push(...candidatesA);
    }

    for (const candidatesB of mapB.values()) {
      result.onlyB.push(...candidatesB);
    }

    // 従来互換のmatchedプロパティ
    result.matched = [...result.exact, ...result.withinTolerance];

    return result;
  }

  /**
   * @override
   */
  compareElementData(dataA, dataB, options = {}) {
    const config = options.toleranceConfig || this.defaultConfig || getToleranceConfig();
    return compareElementDataWithTolerance(dataA, dataB, config);
  }
}

// デフォルトインスタンス
export const toleranceStrategy = new ToleranceComparisonStrategy();

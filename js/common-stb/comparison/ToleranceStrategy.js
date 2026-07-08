/**
 * @fileoverview 許容差を考慮した比較戦略
 *
 * 数値パラメータの許容差を考慮して要素を比較する戦略。
 * 座標、寸法などの微小な差異を許容範囲として扱います。
 */

import { BaseStrategy } from './BaseStrategy.js';
import { BasicComparisonStrategy } from './BaseStrategy.js';
import { evaluateAttributeComparator } from './BaseStrategy.js';
import { getToleranceConfig } from '../../config/toleranceConfig.js';
import {
  compareElementDataWithTolerance,
  compareGeometryCenterDirectionWithTolerance,
} from './toleranceComparison.js';
import { COMPARISON_KEY_TYPE } from '../../config/comparisonKeyConfig.js';

function createAttributeMismatchPair(pair, attributeComparison = {}, positionState = 'exact') {
  return {
    ...pair,
    matchType: 'attributeMismatch',
    positionState,
    attributeState: 'mismatch',
    attributeMismatchKind: attributeComparison.attributeMismatchKind || attributeComparison.kind,
    attributeDiffScope: attributeComparison.attributeDiffScope || attributeComparison.scope,
    attributeDiffDetails:
      attributeComparison.attributeDiffDetails || attributeComparison.differences,
  };
}

function createPositionMatchPair(dataA, dataB, comparisonResult) {
  return {
    dataA,
    dataB,
    matchType: comparisonResult.type,
    positionState: comparisonResult.type,
    differences: comparisonResult.differences,
  };
}

function pushComparedPair(result, pair, attributeComparator) {
  const attributeComparison = evaluateAttributeComparator(
    attributeComparator,
    pair.dataA,
    pair.dataB,
  );
  if (!attributeComparison.matches) {
    result.mismatch.push(
      createAttributeMismatchPair(pair, attributeComparison, pair.positionState),
    );
    return;
  }

  if (pair.positionState === 'exact') {
    result.exact.push(pair);
  } else {
    result.withinTolerance.push(pair);
  }
}

function removeCandidate(map, key, candidates, index) {
  candidates.splice(index, 1);
  if (candidates.length === 0) {
    map.delete(key);
  }
}

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
    const keyType = options.keyType || COMPARISON_KEY_TYPE.POSITION_NODE_ONLY;
    const isGuidBased = keyType === COMPARISON_KEY_TYPE.GUID_BASED;
    const isGeometryCenterDirectionBased =
      keyType === COMPARISON_KEY_TYPE.GEOMETRY_CENTER_DIRECTION_BASED;
    const classifyNullKeysAsOnly = options.classifyNullKeysAsOnly === true;
    const attributeComparator = options.attributeComparator;

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
        mismatch: basicResult.mismatch || [],
        onlyA: basicResult.onlyA,
        onlyB: basicResult.onlyB,
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
      } else if (classifyNullKeysAsOnly && data !== null) {
        result.onlyA.push(data);
      }
    }

    // モデルBの要素をマッピングし、マッチングを試行
    for (const elementB of elementsB) {
      const { key, data } = keyExtractor(elementB, nodeMapB);
      if (key === null) {
        if (classifyNullKeysAsOnly && data !== null) {
          result.onlyB.push(data);
        }
        continue;
      }

      let foundMatch = false;

      if (isGeometryCenterDirectionBased) {
        const candidateEntries = mapA.has(key) ? [[key, mapA.get(key)]] : [];
        let bestMatch = null;

        for (const [keyA, candidatesA] of candidateEntries) {
          if (!candidatesA) continue;

          for (let i = 0; i < candidatesA.length; i++) {
            const dataA = candidatesA[i];
            const comparisonResult = compareGeometryCenterDirectionWithTolerance(
              dataA,
              data,
              config,
            );
            if (!comparisonResult || !comparisonResult.match) continue;

            if (
              !bestMatch ||
              comparisonResult.type === 'exact' ||
              comparisonResult.score < bestMatch.comparisonResult.score
            ) {
              bestMatch = { keyA, candidatesA, index: i, dataA, comparisonResult };
            }
            if (comparisonResult.type === 'exact') break;
          }
          if (bestMatch?.comparisonResult.type === 'exact') break;
        }

        if (bestMatch) {
          const pair = createPositionMatchPair(bestMatch.dataA, data, bestMatch.comparisonResult);
          pushComparedPair(result, pair, attributeComparator);
          removeCandidate(mapA, bestMatch.keyA, bestMatch.candidatesA, bestMatch.index);
          foundMatch = true;
        }
      } else {
        // 同じキーの要素を探す（完全一致）
        if (mapA.has(key)) {
          const candidatesA = mapA.get(key);

          for (let i = 0; i < candidatesA.length; i++) {
            const dataA = candidatesA[i];
            const comparisonResult = compareElementDataWithTolerance(dataA, data, config);

            if (comparisonResult.match && comparisonResult.type === 'exact') {
              const pair = createPositionMatchPair(dataA, data, comparisonResult);
              pushComparedPair(result, pair, attributeComparator);
              removeCandidate(mapA, key, candidatesA, i);
              foundMatch = true;
              break;
            }
          }
        }
      }

      // 完全一致が見つからない場合、許容差内の一致を探す
      if (!foundMatch && !isGeometryCenterDirectionBased) {
        const candidateEntries = isGuidBased
          ? mapA.has(key)
            ? [[key, mapA.get(key)]]
            : []
          : mapA.entries();

        for (const [keyA, candidatesA] of candidateEntries) {
          if (!candidatesA) continue;

          for (let i = 0; i < candidatesA.length; i++) {
            const dataA = candidatesA[i];
            // 断面キー部（断面一致基準由来）が異なる候補は位置が許容差内でも対応させない。
            // 完全一致フェーズは同一キー（＝同一断面キー部）のみを対象とするため、
            // ここで断面差を無視すると「同位置・別断面は割れるのに、僅差位置・別断面は
            // ペアになる」という非対称が生じる。
            if ((dataA.sectionSignature ?? null) !== (data.sectionSignature ?? null)) {
              continue;
            }
            const comparisonResult = compareElementDataWithTolerance(dataA, data, config);

            if (comparisonResult.match && comparisonResult.type === 'withinTolerance') {
              const pair = createPositionMatchPair(dataA, data, comparisonResult);
              pushComparedPair(result, pair, attributeComparator);
              removeCandidate(mapA, keyA, candidatesA, i);
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

/**
 * @fileoverview 比較戦略モジュールのエクスポート
 */

export {
  ComparisonStrategy,
  BasicComparisonStrategy,
  ComparisonStrategyRegistry,
  defaultRegistry,
} from './ComparisonStrategy.js';

export { ToleranceComparisonStrategy, toleranceStrategy } from './ToleranceComparisonStrategy.js';

export {
  VersionAwareComparisonStrategy,
  versionAwareStrategy,
  isCrossVersionComparison,
  filterVersionSpecificDifferences,
  areAttributesEquivalent,
  DIFF_TYPE,
} from './VersionAwareComparisonStrategy.js';

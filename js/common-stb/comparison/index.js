/**
 * @fileoverview 比較モジュールのエントリポイント
 */

export * from './BaseStrategy.js';
export * from './comparator.js';
export * from './keyGenerator.js';
export * from './ToleranceStrategy.js';
export * from './attributeComparator.js';
export {
  DIFF_TYPE,
  compareElementsWithVersionAwareness,
  filterVersionSpecificDifferences,
  generateVersionDifferenceSummary,
  isVersionSpecificAttribute,
  normalizeAttributeName,
} from './semanticEquivalence.js';
export {
  VersionAwareStrategy,
  areAttributesEquivalent,
  filterVersionSpecificDifferences as filterStrategyVersionSpecificDifferences,
  isCrossVersionComparison,
} from './VersionAwareStrategy.js';

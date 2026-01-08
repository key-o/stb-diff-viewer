/**
 * 重要度レベル定数
 * 重要度評価システムで使用される定数を一元管理
 */

// 重要度レベル（C#版との互換性を保つ）
export const IMPORTANCE_LEVELS = {
  REQUIRED: 'required',
  OPTIONAL: 'optional',
  UNNECESSARY: 'unnecessary',
  NOT_APPLICABLE: 'notApplicable',
};

// 重要度レベルの日本語名
export const IMPORTANCE_LEVEL_NAMES = {
  [IMPORTANCE_LEVELS.REQUIRED]: '高',
  [IMPORTANCE_LEVELS.OPTIONAL]: '中',
  [IMPORTANCE_LEVELS.UNNECESSARY]: '低',
  [IMPORTANCE_LEVELS.NOT_APPLICABLE]: '対象外',
};

// 重要度レベルの優先順位（ソート用）
export const IMPORTANCE_LEVEL_PRIORITY = {
  [IMPORTANCE_LEVELS.REQUIRED]: 0,
  [IMPORTANCE_LEVELS.OPTIONAL]: 1,
  [IMPORTANCE_LEVELS.UNNECESSARY]: 2,
  [IMPORTANCE_LEVELS.NOT_APPLICABLE]: 3,
};

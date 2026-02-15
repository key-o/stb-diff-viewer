/**
 * イベントタイプ定数
 * アプリケーション全体で使用されるイベント名を一元管理
 */

// 重要度関連イベント定数
export const IMPORTANCE_EVENTS = {
  RATING_CHANGED: 'importance:ratingChanged',
  MODE_SWITCHED: 'importance:modeSwitched',
  FILTER_UPDATED: 'importance:filterUpdated',
  SETTINGS_LOADED: 'importance:settingsLoaded',
  EVALUATION_COMPLETE: 'importance:evaluationComplete',
  EVALUATION_STARTED: 'importance:evaluationStarted',
  LEVEL_CHANGED: 'importance:levelChanged',
};

// 比較キー関連イベント定数
export const COMPARISON_KEY_EVENTS = {
  KEY_TYPE_CHANGED: 'comparisonKey:typeChanged',
};

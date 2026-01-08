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

// 全イベントタイプを統合したオブジェクト
export const EVENT_TYPES = {
  // 重要度関連
  ...IMPORTANCE_EVENTS,

  // 比較キー関連
  ...COMPARISON_KEY_EVENTS,

  // 表示関連（将来の拡張用）
  DISPLAY_MODE_CHANGED: 'display:modeChanged',
  LABEL_CONTENT_CHANGED: 'label:contentChanged',
  CAMERA_MODE_CHANGED: 'camera:modeChanged',

  // モデル関連
  MODEL_LOADED: 'model:loaded',
  MODEL_COMPARED: 'model:compared',
  MODEL_CLEARED: 'model:cleared',

  // UI関連
  SELECTION_CHANGED: 'ui:selectionChanged',
  CLIPPING_CHANGED: 'ui:clippingChanged',
  FILTER_CHANGED: 'ui:filterChanged',

  // エクスポート関連
  EXPORT_STARTED: 'export:started',
  EXPORT_COMPLETED: 'export:completed',
  EXPORT_FAILED: 'export:failed',
};

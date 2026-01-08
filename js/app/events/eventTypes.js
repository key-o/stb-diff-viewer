/**
 * @fileoverview イベントタイプ定義
 *
 * アプリケーション全体で使用されるイベントタイプを一元管理します。
 * 各イベントタイプはドメインごとにグループ化されています。
 *
 * @module app/events/eventTypes
 */

/**
 * 重要度関連イベント
 * @constant {Object}
 */
export const ImportanceEvents = {
  /** 重要度設定が変更された */
  SETTINGS_CHANGED: 'importance:settingsChanged',
  /** 重要度フィルタが変更された */
  FILTER_CHANGED: 'importance:filterChanged',
  /** 重要度フィルタが適用された */
  FILTER_APPLIED: 'importance:filterApplied',
  /** 自動再描画が完了した */
  AUTO_REDRAW_COMPLETED: 'importance:autoRedrawCompleted',
  /** 自動再描画でエラーが発生した */
  AUTO_REDRAW_ERROR: 'importance:autoRedrawError',
};

/**
 * 比較関連イベント
 * @constant {Object}
 */
export const ComparisonEvents = {
  /** 比較統計を更新 */
  UPDATE_STATISTICS: 'comparison:updateStatistics',
  /** 比較が完了した */
  COMPLETED: 'comparison:completed',
  /** 比較がエラーで失敗した */
  ERROR: 'comparison:error',
  /** 比較キーが変更された */
  KEY_CHANGED: 'comparison:keyChanged',
};

/**
 * レンダリング関連イベント
 * @constant {Object}
 */
export const RenderEvents = {
  /** 要素の再描画をリクエスト */
  REQUEST_ELEMENT_RERENDER: 'render:requestElementRerender',
  /** モデルの読み込みが完了した */
  MODEL_LOADED: 'render:modelLoaded',
  /** 表示モードが変更された */
  VIEW_MODE_CHANGED: 'render:viewModeChanged',
  /** 描画フレームをリクエスト */
  REQUEST_RENDER: 'render:requestRender',
  /** 描画フレームが完了した */
  RENDER_COMPLETED: 'render:renderCompleted',
};

/**
 * 軸描画関連イベント
 * @constant {Object}
 */
export const AxisEvents = {
  /** 軸の再描画をリクエスト */
  REDRAW_REQUESTED: 'axis:redrawRequested',
  /** 軸の再描画が完了した */
  REDRAW_COMPLETED: 'axis:redrawCompleted',
};

/**
 * UI関連イベント
 * @constant {Object}
 */
export const UIEvents = {
  /** パネルが開かれた */
  PANEL_OPENED: 'ui:panelOpened',
  /** パネルが閉じられた */
  PANEL_CLOSED: 'ui:panelClosed',
  /** テーマが変更された */
  THEME_CHANGED: 'ui:themeChanged',
};

/**
 * 選択関連イベント
 * @constant {Object}
 */
export const SelectionEvents = {
  /** 要素が選択された */
  ELEMENT_SELECTED: 'selection:elementSelected',
  /** 選択がクリアされた */
  SELECTION_CLEARED: 'selection:cleared',
  /** 複数要素が選択された */
  MULTI_SELECT: 'selection:multiSelect',
};

/**
 * 設定関連イベント
 * @constant {Object}
 */
export const SettingsEvents = {
  /** 設定が変更された */
  CHANGED: 'settings:changed',
  /** 設定がリセットされた */
  RESET: 'settings:reset',
  /** 設定がインポートされた */
  IMPORTED: 'settings:imported',
  /** 設定がエクスポートされた */
  EXPORTED: 'settings:exported',
};

/**
 * 差分ステータスフィルタ関連イベント
 * @constant {Object}
 */
export const DiffStatusEvents = {
  /** 差分フィルタが変更された */
  FILTER_CHANGED: 'diffStatus:filterChanged',
  /** 差分フィルタが適用された */
  FILTER_APPLIED: 'diffStatus:filterApplied',
  /** プリセットが適用された */
  PRESET_APPLIED: 'diffStatus:presetApplied',
};

/**
 * バージョン比較関連イベント
 * @constant {Object}
 */
export const VersionEvents = {
  /** バージョン固有差分フィルタが変更された */
  FILTER_CHANGED: 'version:filterChanged',
  /** バージョン情報が更新された */
  INFO_UPDATED: 'version:infoUpdated',
};

/**
 * モデル関連イベント
 * @constant {Object}
 */
export const ModelEvents = {
  /** モデルがロードされた */
  LOADED: 'model:loaded',
  /** モデルがクリアされた */
  CLEARED: 'model:cleared',
  /** モデルの読み込みエラー */
  LOAD_ERROR: 'model:loadError',
  /** モデルのパースが開始された */
  PARSE_STARTED: 'model:parseStarted',
  /** モデルのパースが完了した */
  PARSE_COMPLETED: 'model:parseCompleted',
  /** モデルのバウンディングボックスが更新された */
  BOUNDS_UPDATED: 'model:boundsUpdated',
};

/**
 * 表示関連イベント
 * @constant {Object}
 */
export const ViewEvents = {
  /** 表示モード変更 */
  MODE_CHANGED: 'view:modeChanged',
  /** カラーモード変更 */
  COLOR_MODE_CHANGED: 'view:colorModeChanged',
  /** 要素表示/非表示切替 */
  ELEMENT_VISIBILITY_CHANGED: 'view:elementVisibilityChanged',
  /** カメラモード変更 */
  CAMERA_MODE_CHANGED: 'view:cameraModeChanged',
  /** ビュー方向変更（正面、上面など） */
  VIEW_DIRECTION_CHANGED: 'view:directionChanged',
  /** クリッピング状態変更 */
  CLIPPING_CHANGED: 'view:clippingChanged',
  /** グリッド表示切替 */
  GRID_TOGGLED: 'view:gridToggled',
  /** ラベル表示切替 */
  LABELS_TOGGLED: 'view:labelsToggled',
};

/**
 * エクスポート関連イベント
 * @constant {Object}
 */
export const ExportEvents = {
  /** エクスポート開始 */
  STARTED: 'export:started',
  /** エクスポート完了 */
  COMPLETED: 'export:completed',
  /** エクスポートエラー */
  ERROR: 'export:error',
  /** エクスポート進捗 */
  PROGRESS: 'export:progress',
};

/**
 * 荷重表示関連イベント
 * @constant {Object}
 */
export const LoadEvents = {
  /** 荷重ケースが変更された */
  CASE_CHANGED: 'load:caseChanged',
  /** 荷重表示モードが変更された */
  DISPLAY_MODE_CHANGED: 'load:displayModeChanged',
  /** 荷重スケールが変更された */
  SCALE_CHANGED: 'load:scaleChanged',
  /** 荷重データが読み込まれた */
  DATA_LOADED: 'load:dataLoaded',
};

/**
 * 編集関連イベント
 * @constant {Object}
 */
export const EditEvents = {
  /** 属性編集が開始された */
  EDIT_STARTED: 'edit:started',
  /** 属性値が変更された */
  ATTRIBUTE_CHANGED: 'edit:attributeChanged',
  /** ジオメトリが再生成された */
  GEOMETRY_REGENERATED: 'edit:geometryRegenerated',
  /** 編集がキャンセルされた */
  EDIT_CANCELLED: 'edit:cancelled',
  /** 編集モードが切り替わった */
  MODE_TOGGLED: 'edit:modeToggled',
};

/**
 * バリデーション関連イベント
 * @constant {Object}
 */
export const ValidationEvents = {
  /** バリデーションが開始された */
  STARTED: 'validation:started',
  /** バリデーションが完了した */
  COMPLETED: 'validation:completed',
  /** バリデーションでエラーが発生した */
  ERROR: 'validation:error',
  /** バリデーション統計が更新された */
  STATS_UPDATED: 'validation:statsUpdated',
};

/**
 * すべてのイベントタイプを統合したオブジェクト
 * @constant {Object}
 */
export const EventTypes = {
  Importance: ImportanceEvents,
  Comparison: ComparisonEvents,
  Render: RenderEvents,
  Axis: AxisEvents,
  UI: UIEvents,
  Selection: SelectionEvents,
  Settings: SettingsEvents,
  DiffStatus: DiffStatusEvents,
  Version: VersionEvents,
  Model: ModelEvents,
  View: ViewEvents,
  Export: ExportEvents,
  Load: LoadEvents,
  Edit: EditEvents,
  Validation: ValidationEvents,
};

/**
 * イベントタイプが有効かどうかを検証
 * @param {string} eventType - 検証するイベントタイプ
 * @returns {boolean} 有効な場合true
 */
export function isValidEventType(eventType) {
  const allTypes = [
    ...Object.values(ImportanceEvents),
    ...Object.values(ComparisonEvents),
    ...Object.values(RenderEvents),
    ...Object.values(AxisEvents),
    ...Object.values(UIEvents),
    ...Object.values(SelectionEvents),
    ...Object.values(SettingsEvents),
    ...Object.values(DiffStatusEvents),
    ...Object.values(VersionEvents),
    ...Object.values(ModelEvents),
    ...Object.values(ViewEvents),
    ...Object.values(ExportEvents),
    ...Object.values(LoadEvents),
    ...Object.values(EditEvents),
    ...Object.values(ValidationEvents),
  ];
  return allTypes.includes(eventType);
}

/**
 * @fileoverview イベントシステムの統一エクスポート
 *
 * EventBusとイベントタイプをまとめてエクスポートします。
 *
 * 使用例:
 * ```javascript
 * import { eventBus, ImportanceEvents } from '../app/events/index.js';
 *
 * // イベントを購読
 * eventBus.on(ImportanceEvents.SETTINGS_CHANGED, (data) => {
 *   console.log('Settings changed:', data);
 * });
 *
 * // イベントを発行
 * eventBus.emit(ImportanceEvents.SETTINGS_CHANGED, { level: 'high' });
 * ```
 *
 * @module app/events
 */

// EventBus
export { EventBus, eventBus, default } from './eventBus.js';

// Event Types
export {
  EventTypes,
  ImportanceEvents,
  ComparisonEvents,
  RenderEvents,
  AxisEvents,
  UIEvents,
  SelectionEvents,
  SettingsEvents,
  DiffStatusEvents,
  VersionEvents,
  ModelEvents,
  ViewEvents,
  ExportEvents,
  LoadEvents,
  EditEvents,
  isValidEventType,
} from './eventTypes.js';

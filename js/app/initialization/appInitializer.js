/**
 * @fileoverview アプリケーションコアの初期化
 */
import { createLogger } from '../../utils/logger.js';
import {
  registerAppGlobals,
  initializeApplicationServices,
  initializeRuntimeUI,
  startViewerRuntime,
  setupZoomToCursorBehavior,
} from './appInitializationHelpers.js';

const log = createLogger('appInitializer');

/**
 * アプリケーションコアを初期化
 * @param {Function} scheduleRender - 再描画関数
 * @param {boolean} rendererInitialized - レンダラー初期化フラグ
 */
export function initializeApp(scheduleRender, rendererInitialized) {
  registerAppGlobals(scheduleRender);
  initializeApplicationServices(rendererInitialized);
  initializeRuntimeUI(scheduleRender);
  startViewerRuntime();
  setupZoomToCursorBehavior();

  log.info('アプリケーションコアの初期化が完了しました');
}

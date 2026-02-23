/**
 * @fileoverview ラベル表示切り替えイベントリスナー
 *
 * ラベルの表示切り替えとコンテンツ変更を処理するイベントリスナー。
 *
 * @module ui/events/labelVisibilityListeners
 */

import { updateLabelVisibility } from '../viewer3d/unifiedLabelManager.js';
import { setState } from '../../app/globalState.js';
import { renderingController } from '../../app/controllers/renderingController.js';
import { REDRAW_REQUIRED_ELEMENT_TYPES } from '../../config/uiElementConfig.js';
import { eventBus, RenderEvents } from '../../app/events/index.js';

/**
 * 要素タイプと再描画関数名のマッピング
 * @type {Object.<string, string>}
 */
const ELEMENT_REDRAW_FUNCTION_MAP = {
  Column: 'redrawColumnsForViewMode',
  Post: 'redrawPostsForViewMode',
  Girder: 'redrawBeamsForViewMode',
  Beam: 'redrawBeamsForViewMode',
  Brace: 'redrawBracesForViewMode',
  Pile: 'redrawPilesForViewMode',
  Footing: 'redrawFootingsForViewMode',
  FoundationColumn: 'redrawFoundationColumnsForViewMode',
};

/**
 * Setup label toggle checkbox listeners to update label visibility
 */
export function setupLabelToggleListeners() {
  const labelToggles = document.querySelectorAll('input[name="labelToggle"]');
  labelToggles.forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const elementType = checkbox.value;

      // labelDisplayManagerと同期
      renderingController.setLabelVisibility(elementType, checkbox.checked);

      // 立体表示モードの場合は再描画が必要
      const needsRedraw = checkIfRedrawNeeded(elementType);

      if (needsRedraw) {
        // 立体表示モードの再描画を実行
        triggerViewModeRedraw(elementType);
      } else {
        // 通常のラベル表示更新
        updateLabelVisibility();
        // Request render via EventBus
        eventBus.emit(RenderEvents.REQUEST_RENDER);
      }
    });
  });
}

/**
 * Check if redraw is needed for solid view modes
 * 設定ファイルの REDRAW_REQUIRED_ELEMENT_TYPES を使用
 * @param {string} elementType - Element type
 * @returns {boolean} Whether redraw is needed
 */
function checkIfRedrawNeeded(elementType) {
  return REDRAW_REQUIRED_ELEMENT_TYPES.has(elementType);
}

/**
 * Trigger view mode redraw for specific element types
 * @param {string} elementType - Element type
 */
function triggerViewModeRedraw(elementType) {
  const functionName = ELEMENT_REDRAW_FUNCTION_MAP[elementType];
  if (!functionName) {
    // 未サポートの要素タイプは通常のラベル更新
    updateLabelVisibility();
    eventBus.emit(RenderEvents.REQUEST_RENDER);
    return;
  }

  // Import redraw functions dynamically to avoid circular dependencies
  import('../../app/viewModes/index.js')
    .then((viewModes) => {
      const scheduleRender = () => eventBus.emit(RenderEvents.REQUEST_RENDER);
      const redrawFn = viewModes[functionName];
      if (redrawFn) {
        redrawFn(scheduleRender);
      }
    })
    .catch((error) => {
      console.error('Failed to import view mode functions:', error);
      // Fallback to normal label update
      updateLabelVisibility();
      eventBus.emit(RenderEvents.REQUEST_RENDER);
    });
}

/**
 * Setup label content selector listener
 */
export function setupLabelContentListener() {
  const labelContentSelector = document.getElementById('labelContentSelector');

  if (labelContentSelector) {
    labelContentSelector.addEventListener('change', handleLabelContentChange);
  } else {
    console.warn('[UI] ラベル: コンテンツセレクタが見つかりません');
  }
}

/**
 * Handle label content type change
 * @param {Event} event - Change event
 */
function handleLabelContentChange(event) {
  const newContentType = event.target.value;
  console.log(`[Event] ラベル内容変更: ${newContentType}`);

  // Update global state
  setState('ui.labelContentType', newContentType);

  // Trigger label regeneration
  if (typeof window.regenerateAllLabels === 'function') {
    window.regenerateAllLabels();
  } else {
    console.warn('[UI] ラベル: regenerateAllLabels関数が未設定');
  }

  // Request render update via EventBus
  eventBus.emit(RenderEvents.REQUEST_RENDER);
}

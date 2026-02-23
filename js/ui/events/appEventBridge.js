/**
 * @fileoverview App→UIイベントブリッジ
 *
 * app層がeventBusで発行したイベントを受け取り、実際のUI関数を呼び出します。
 * これにより app/ が ui/ に直接依存する R1 違反を解消します。
 *
 * @module ui/events/appEventBridge
 */

import {
  eventBus,
  AppEvents,
  ToastEvents,
  InteractionEvents,
  LoadingIndicatorEvents,
  FinalizationEvents,
} from '../../app/events/index.js';

import { clearUIState, setGlobalStateForUI } from '../state.js';
import { clearTree, clearTreeSelection, selectElementInTree } from '../panels/elementTreeView.js';
import { clearSectionTree } from '../panels/sectionTreeView.js';
import { showError, showWarning } from '../common/toast.js';
import { showContextMenu, initializeContextMenu } from '../common/contextMenu.js';
import { displayElementInfo } from '../panels/element-info/ElementInfoDisplay.js';
import { activateSectionBoxForBox } from '../viewer3d/sectionBox.js';
import {
  getLoadingIndicator,
  showLoading,
  hideLoading,
  completeLoading,
} from '../common/loadingIndicator.js';
import { updateStorySelector, updateAxisSelectors } from '../viewer3d/selectors.js';
import { updateLabelVisibility } from '../viewer3d/unifiedLabelManager.js';

/**
 * app層イベントをUI関数に接続するブリッジを初期化
 */
export function setupAppEventBridge() {
  // --- AppEvents ---
  eventBus.on(AppEvents.CLEAR_UI_STATE, clearUIState);

  eventBus.on(AppEvents.CLEAR_TREE, () => {
    clearTree();
    clearTreeSelection();
  });

  eventBus.on(AppEvents.CLEAR_SECTION_TREE, clearSectionTree);

  // --- ToastEvents ---
  eventBus.on(ToastEvents.SHOW_ERROR, ({ message } = {}) => {
    showError(message);
  });

  eventBus.on(ToastEvents.SHOW_WARNING, ({ message } = {}) => {
    showWarning(message);
  });

  // --- InteractionEvents ---
  eventBus.on(
    InteractionEvents.DISPLAY_ELEMENT_INFO,
    ({ idA, idB, elementType, modelSource } = {}) => {
      displayElementInfo(idA, idB, elementType, modelSource);
    },
  );

  eventBus.on(
    InteractionEvents.SELECT_ELEMENT_IN_TREE,
    ({ elementType, elementId, modelSource } = {}) => {
      selectElementInTree(elementType, elementId, modelSource);
    },
  );

  eventBus.on(InteractionEvents.SHOW_CONTEXT_MENU, ({ x, y, menuItems } = {}) => {
    showContextMenu(x, y, menuItems);
  });

  eventBus.on(InteractionEvents.INIT_CONTEXT_MENU, initializeContextMenu);

  eventBus.on(InteractionEvents.ACTIVATE_SECTION_BOX_FOR_SELECTION, ({ box3 } = {}) => {
    if (box3) {
      activateSectionBoxForBox(box3);
    }
  });

  // --- LoadingIndicatorEvents ---
  eventBus.on(LoadingIndicatorEvents.SHOW, ({ message } = {}) => {
    showLoading(message);
  });

  eventBus.on(LoadingIndicatorEvents.UPDATE, ({ progress, message, detail } = {}) => {
    const indicator = getLoadingIndicator();
    indicator.update(progress, message, detail);
  });

  eventBus.on(LoadingIndicatorEvents.COMPLETE, ({ message } = {}) => {
    completeLoading(message);
  });

  eventBus.on(LoadingIndicatorEvents.HIDE, () => {
    hideLoading();
  });

  eventBus.on(LoadingIndicatorEvents.ERROR, ({ message } = {}) => {
    const indicator = getLoadingIndicator();
    indicator.error(message);
    setTimeout(() => hideLoading(), 3000);
  });

  // --- FinalizationEvents ---
  eventBus.on(FinalizationEvents.SET_GLOBAL_STATE, ({ nodeLabels, stories, axesData } = {}) => {
    setGlobalStateForUI(nodeLabels, stories, axesData);
  });

  eventBus.on(FinalizationEvents.UPDATE_SELECTORS, () => {
    updateStorySelector();
    updateAxisSelectors();
    updateLabelVisibility();
  });
}

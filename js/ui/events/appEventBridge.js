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
  ComparisonEvents,
  ViewEvents,
} from '../../data/events/index.js';

import { clearUIState, setGlobalStateForUI } from '../state.js';
import {
  clearTree,
  clearTreeSelection,
  selectElementInTree,
  buildTree,
  updateTreeElementTypes,
} from '../panels/elementTreeView.js';
import { clearSectionTree } from '../panels/sectionTreeView.js';
import { showError, showWarning, showSuccess, showInfo } from '../common/toast.js';
import { showContextMenu, initializeContextMenu } from '../common/contextMenu.js';
import {
  displayElementInfo,
  displayMultiSelectionSummary,
} from '../panels/element-info/ElementInfoDisplay.js';
import { activateSectionBoxForBox } from '../viewer3d/sectionBox.js';
import {
  getLoadingIndicator,
  showLoading,
  hideLoading,
  completeLoading,
} from '../common/loadingIndicator.js';
import { updateStorySelector, updateAxisSelectors } from '../viewer3d/selectors.js';
import { updateLabelVisibility, handleColorModeChange } from '../viewer3d/unifiedLabelManager.js';
import { updateLegendContent } from './legendListeners.js';
import { refreshElementInfoPanel } from '../panels/element-info/ElementInfoDisplay.js';
import { convertComparisonResultsForTree } from '../../app/initialization/initializationUtils.js';

function scheduleUiIdle(task) {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(task, { timeout: 100 });
  } else {
    setTimeout(task, 0);
  }
}

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

  eventBus.on(ToastEvents.SHOW_SUCCESS, ({ message } = {}) => {
    showSuccess(message);
  });

  eventBus.on(ToastEvents.SHOW_INFO, ({ message } = {}) => {
    showInfo(message);
  });

  // --- InteractionEvents ---
  eventBus.on(
    InteractionEvents.DISPLAY_ELEMENT_INFO,
    ({ idA, idB, elementType, modelSource } = {}) => {
      displayElementInfo(idA, idB, elementType, modelSource);
    },
  );

  eventBus.on(InteractionEvents.DISPLAY_MULTI_SELECTION_INFO, (summaryData = {}) => {
    displayMultiSelectionSummary(summaryData);
  });

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
    scheduleUiIdle(() => {
      updateStorySelector();
      updateAxisSelectors();
    });
    scheduleUiIdle(() => {
      updateLabelVisibility();
    });
  });

  // --- ViewEvents (色付けモード変更通知) ---
  eventBus.on(ViewEvents.COLOR_MODE_CHANGED, (_payload) => {
    // ラベル管理システムに通知
    handleColorModeChange();

    // 凡例を表示中の場合は内容を更新
    const legendPanel = document.getElementById('legendPanel');
    if (legendPanel && legendPanel.style.display !== 'none') {
      updateLegendContent();
    }

    // 要素情報パネルを更新
    refreshElementInfoPanel();
  });

  // --- ComparisonEvents (編集後の再比較でTree View を再構築) ---
  eventBus.on(
    ComparisonEvents.UPDATE_STATISTICS,
    ({ reason, comparisonResults, changedElementTypes } = {}) => {
      if (reason === 'editRecomparison' && comparisonResults) {
        const treeData = convertComparisonResultsForTree(comparisonResults, changedElementTypes);
        if (Array.isArray(changedElementTypes) && changedElementTypes.length > 0) {
          updateTreeElementTypes(treeData, changedElementTypes);
        } else {
          buildTree(treeData);
        }
      }
    },
  );
}

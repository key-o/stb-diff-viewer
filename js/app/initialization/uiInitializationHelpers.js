/**
 * @fileoverview UI初期化ヘルパー
 */

import { createLogger } from '../../utils/logger.js';
import { initializeTheme, setThemeSetting, getThemeSetting } from '../../ui/common/theme.js';
import {
  initializeToast,
  showSuccess,
  showError,
  showWarning,
  showInfo,
  initializeToastEventListeners,
} from '../../ui/common/toast.js';
import { initializeFloatingWindow } from '../../ui/panels/floatingWindow.js';
import { initializeTreeView } from '../../ui/panels/elementTreeView.js';
import {
  initializeSectionTreeView,
  buildSectionTree,
  setGroupingMode,
} from '../../ui/panels/sectionTreeView.js';
import { initializeComparisonKeySelector } from '../../ui/panels/comparisonKeySelector.js';
import { initializeToleranceSettings } from '../../ui/panels/toleranceSettings.js';
import { initDxfLoaderUI, initDxfLoaderEventListeners } from '../dxfLoader.js';
import { setupVersionPanelEventListeners } from '../../ui/panels/versionPanel.js';
import { initClipping2DEventListeners } from '../../ui/viewer3d/clipping2DImpl.js';
import { initSectionBoxEventListeners } from '../../ui/viewer3d/sectionBox.js';
import { injectElementInfoService } from '../../viewer/services/elementInfoAdapter.js';
import { initializeValidationPanel } from '../../ui/panels/validationPanelIntegration.js';
import { initializeXmlViewer } from '../../ui/panels/xmlViewer.js';
import { getState } from '../../data/state/globalState.js';
import { convertComparisonResultsForTree } from './initializationUtils.js';
import { handleTreeElementSelection } from './eventHandlers.js';
import {
  initColumnSectionListPanel,
  initBeamSectionListPanel,
} from '../../ui/panels/sectionList/index.js';

const log = createLogger('uiInitializationHelpers');

/**
 * テーマ関連UIを初期化
 */
export function initializeThemeSystem() {
  initializeTheme({
    onThemeChange: (theme, setting) => {
      log.info(`テーマが変更されました: ${theme} (設定: ${setting})`);
    },
  });

  const buttonGroup = document.getElementById('theme-button-group');
  if (!buttonGroup) {
    return;
  }

  const buttons = buttonGroup.querySelectorAll('button[data-theme]');
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const theme = button.dataset.theme;
      setThemeSetting(theme);

      buttons.forEach((candidate) => candidate.classList.remove('active'));
      button.classList.add('active');
    });
  });

  const currentSetting = getThemeSetting();
  buttons.forEach((button) => {
    button.classList.toggle('active', button.dataset.theme === currentSetting);
  });

  log.info('テーマシステムが初期化されました');
}

/**
 * 通知・共通パネルを初期化
 */
export function initializeSharedPanels() {
  initializeToast({
    position: 'bottom-right',
    duration: 4000,
    maxToasts: 5,
  });
  initializeToastEventListeners();
  initClipping2DEventListeners();
  initSectionBoxEventListeners();
  initDxfLoaderEventListeners();

  import('../../ui/panels/element-info/index.js').then((elementInfo) => {
    injectElementInfoService(elementInfo);
    log.info('要素情報サービスが注入されました');
  });

  window.showToast = { showSuccess, showError, showWarning, showInfo };

  initializeFloatingWindow();
  initializeValidationPanel();
  initializeXmlViewer();

  log.info('共通UIパネルが初期化されました');
}

/**
 * ツリーパネルを初期化
 * @param {Function} scheduleRender - 再描画関数
 * @param {Object} elementGroups - 要素グループ
 */
export function initializeTreePanels(scheduleRender, elementGroups) {
  initializeTreeView('element-tree-container', (selectedElement) => {
    handleTreeSelection(selectedElement, '要素ツリー', true, scheduleRender, elementGroups);
  });

  initializeSectionTreeView('section-tree-container', (selectedElement) => {
    handleTreeSelection(selectedElement, '断面ツリー', false, scheduleRender, elementGroups);
  });

  const groupingModeSelect = document.getElementById('section-grouping-mode');
  if (groupingModeSelect) {
    groupingModeSelect.addEventListener('change', (event) => {
      const newMode = event.target.value;
      log.info(`断面ツリーのグループ化モードを変更: ${newMode}`);
      setGroupingMode(newMode);
      rebuildSectionTreeFromState();
    });
  }
}

/**
 * 比較関連UIを初期化
 */
export function initializeComparisonControls() {
  initializeComparisonKeySelector('#comparison-key-selector-container', (newKeyType) => {
    log.info(`比較キータイプが変更されました: ${newKeyType}`);
  });
  log.info('比較キー選択UIが初期化されました');

  const toleranceContainer = document.getElementById('tolerance-settings-container');
  if (toleranceContainer) {
    initializeToleranceSettings(toleranceContainer);
    log.info('許容差設定パネルを初期化しました');
  } else {
    log.warn('許容差設定コンテナー #tolerance-settings-container が見つかりません');
  }

  initDxfLoaderUI();
  setupVersionPanelEventListeners();
  log.info('補助UIコントロールを初期化しました');
}

/**
 * 断面リスト関連パネルを初期化
 */
export function initializeSectionListPanels() {
  initializeOptionalPanel(initColumnSectionListPanel, 'RC柱断面リストパネル');
  initializeOptionalPanel(initBeamSectionListPanel, 'RC梁断面リストパネル');
}

function handleTreeSelection(
  selectedElement,
  sourceName,
  prefersElementTree,
  scheduleRender,
  elementGroups,
) {
  try {
    log.info(`${sourceName}から要素が選択されました:`, selectedElement);
    handleTreeElementSelection(
      selectedElement,
      sourceName,
      prefersElementTree,
      scheduleRender,
      elementGroups,
    );
  } catch (error) {
    log.error(`${sourceName}選択処理でエラーが発生:`, error);
  }
}

function rebuildSectionTreeFromState() {
  const comparisonResult = getState('comparisonResults');
  const sectionsData = getState('sectionsData');
  if (!comparisonResult || !sectionsData) {
    return;
  }

  const treeData = convertComparisonResultsForTree(comparisonResult);
  buildSectionTree(treeData, sectionsData);
}

function initializeOptionalPanel(initializer, label) {
  try {
    initializer();
    log.info(`${label}を初期化しました`);
  } catch (error) {
    log.warn(`${label}の初期化に失敗:`, error);
  }
}

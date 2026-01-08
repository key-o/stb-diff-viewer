/**
 * @fileoverview UIコンポーネントとボタンイベントリスナーの初期化
 */

import { createLogger } from '../../utils/logger.js';
import { initializeTheme, setThemeSetting, getThemeSetting } from '../../ui/theme.js';
import { initializeToast, showSuccess, showError, showWarning, showInfo } from '../../ui/toast.js';
import { initializeFloatingWindow } from '../../ui/floatingWindow.js';
import { initializeTreeView, buildTree } from '../../ui/elementTreeView.js';
import {
  initializeSectionTreeView,
  buildSectionTree,
  setGroupingMode,
} from '../../ui/sectionTreeView.js';
import { initializeComparisonKeySelector } from '../../ui/comparisonKeySelector.js';
import { initializeToleranceSettings } from '../../ui/toleranceSettings.js';
import { initDxfLoaderUI } from '../../dxfLoader.js';
import { setupVersionPanelEventListeners } from '../../ui/versionPanel.js';
import { getState } from '../globalState.js';
import { convertComparisonResultsForTree } from './initializationUtils.js';
import {
  handleTreeElementSelection,
  toggleOriginAxesVisibility,
  togglePlacementLinesVisibility,
} from './eventHandlers.js';
import {
  getLoadDisplayManager,
  LOAD_DISPLAY_MODE,
} from '../../viewer/rendering/loadDisplayManager.js';
import {
  initColumnSectionListPanel,
  initBeamSectionListPanel,
} from '../../ui/sectionList/index.js';

const log = createLogger('uiInitializer');

/**
 * テーマボタンのイベントリスナーをセットアップ
 */
function setupThemeButtonListeners() {
  const buttonGroup = document.getElementById('theme-button-group');
  if (!buttonGroup) return;

  const buttons = buttonGroup.querySelectorAll('button[data-theme]');
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const theme = button.dataset.theme;
      setThemeSetting(theme);

      // アクティブ状態を更新
      buttons.forEach((btn) => btn.classList.remove('active'));
      button.classList.add('active');
    });
  });

  // 初期状態を設定
  const currentSetting = getThemeSetting();
  buttons.forEach((btn) => {
    if (btn.dataset.theme === currentSetting) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  log.info('テーマボタンリスナーをセットアップしました');
}

/**
 * UIコンポーネントを初期化
 * @param {Function} scheduleRender - 再描画関数
 * @param {Object} elementGroups - 要素グループ
 */
export function initializeUIComponents(scheduleRender, elementGroups) {
  // テーマシステムを初期化
  initializeTheme({
    onThemeChange: (theme, setting) => {
      log.info(`テーマが変更されました: ${theme} (設定: ${setting})`);
    },
  });
  setupThemeButtonListeners();
  log.info('テーマシステムが初期化されました');

  // トースト通知システムを初期化
  initializeToast({
    position: 'bottom-right',
    duration: 4000,
    maxToasts: 5,
  });
  log.info('トースト通知システムが初期化されました');

  // グローバルにトースト関数を公開
  window.showToast = { showSuccess, showError, showWarning, showInfo };

  // フローティングウィンドウを初期化
  initializeFloatingWindow();

  // 要素ツリー表示を初期化
  initializeTreeView('element-tree-container', (selectedElement) => {
    try {
      log.info('要素ツリーから要素が選択されました:', selectedElement);
      handleTreeElementSelection(
        selectedElement,
        '要素ツリー',
        true,
        scheduleRender,
        elementGroups,
      );
    } catch (err) {
      log.error('要素ツリー選択処理でエラーが発生:', err);
    }
  });

  // 断面ツリー表示を初期化（要素ツリーと同じハンドラを使用）
  initializeSectionTreeView('section-tree-container', (selectedElement) => {
    try {
      log.info('断面ツリーから要素が選択されました:', selectedElement);
      handleTreeElementSelection(
        selectedElement,
        '断面ツリー',
        false,
        scheduleRender,
        elementGroups,
      );
    } catch (err) {
      log.error('断面ツリー選択処理でエラーが発生:', err);
    }
  });

  // グループ化モードの変更イベントリスナー
  const groupingModeSelect = document.getElementById('section-grouping-mode');
  if (groupingModeSelect) {
    groupingModeSelect.addEventListener('change', (e) => {
      const newMode = e.target.value;
      log.info(`断面ツリーのグループ化モードを変更: ${newMode}`);
      setGroupingMode(newMode);

      // 現在の比較結果と断面データで再構築
      const comparisonResult = getState('comparisonResults');
      const sectionsData = getState('sectionsData');
      if (comparisonResult && sectionsData) {
        const treeData = convertComparisonResultsForTree(comparisonResult);
        buildSectionTree(treeData, sectionsData);
      }
    });
  }

  // 比較キー選択UIを初期化
  initializeComparisonKeySelector('#comparison-key-selector-container', async (newKeyType) => {
    log.info(`比較キータイプが変更されました: ${newKeyType}`);

    const fileAInput = document.getElementById('fileA');
    const fileBInput = document.getElementById('fileB');
    const hasFiles = fileAInput?.files[0] || fileBInput?.files[0];

    if (hasFiles) {
      log.info('再比較を実行します...');
      await window.handleCompareModelsClick();
      log.info('再比較が完了しました');
    } else {
      log.warn('再比較をスキップしました: モデルが読み込まれていません');
    }
  });
  log.info('比較キー選択UIが初期化されました');

  // 許容差設定パネルを初期化
  const toleranceContainer = document.getElementById('tolerance-settings-container');
  if (toleranceContainer) {
    initializeToleranceSettings(toleranceContainer);
    log.info('許容差設定パネルを初期化しました');
  } else {
    log.warn('許容差設定コンテナー #tolerance-settings-container が見つかりません');
  }

  // DXFローダーUIを初期化
  initDxfLoaderUI();
  log.info('DXFローダーUIを初期化しました');

  // バージョンパネルのイベントリスナーを設定
  setupVersionPanelEventListeners();
  log.info('バージョンパネルのイベントリスナーを設定しました');

  // RC柱断面リストパネルを初期化
  try {
    initColumnSectionListPanel();
    log.info('RC柱断面リストパネルを初期化しました');
  } catch (e) {
    log.warn('RC柱断面リストパネルの初期化に失敗:', e);
  }

  // RC梁断面リストパネルを初期化
  try {
    initBeamSectionListPanel();
    log.info('RC梁断面リストパネルを初期化しました');
  } catch (e) {
    log.warn('RC梁断面リストパネルの初期化に失敗:', e);
  }
}

/**
 * ボタンイベントリスナーをセットアップ
 */
export function setupButtonEventListeners() {
  // 比較ボタン
  const compareBtn = document.getElementById('compareButton');
  if (compareBtn) {
    compareBtn.addEventListener('click', window.handleCompareModelsClick);
  } else {
    log.error('比較ボタンが見つかりません。');
  }

  // 原点軸（XYZ）表示切り替え
  const originAxesToggle = document.getElementById('toggleOriginAxes');
  if (originAxesToggle) {
    originAxesToggle.addEventListener('change', (event) => {
      const isVisible = event.target.checked;
      toggleOriginAxesVisibility(isVisible);
      log.info(`原点軸の表示状態を設定しました: ${isVisible}`);
    });
  } else {
    log.warn('原点軸切り替えボタンが見つかりません。');
  }

  // 配置基準線表示切り替え
  const placementLinesToggle = document.getElementById('togglePlacementLines');
  if (placementLinesToggle) {
    placementLinesToggle.addEventListener('change', (event) => {
      const isVisible = event.target.checked;
      togglePlacementLinesVisibility(isVisible);
      log.info(`配置基準線の表示状態を設定しました: ${isVisible}`);
    });
  } else {
    log.warn('配置基準線切り替えボタンが見つかりません。');
  }

  // 荷重表示切り替え
  const loadDisplayToggle = document.getElementById('toggleLoadDisplay');
  const loadCaseSelector = document.getElementById('loadCaseSelector');

  if (loadDisplayToggle) {
    loadDisplayToggle.addEventListener('change', (event) => {
      const isVisible = event.target.checked;
      const loadManager = getLoadDisplayManager();

      if (loadManager) {
        if (isVisible) {
          // データ存在チェック
          const calDataA = getState('models.calDataA');
          const calDataB = getState('models.calDataB');

          if (!calDataA && !calDataB) {
            // 警告を表示
            import('../../ui/toast.js').then(({ showWarning }) => {
              showWarning('荷重データがありません。StbCalDataを含むSTBファイルを読み込んでください。');
            }).catch(() => {
              // toast.jsがない場合はalertで代替
              alert('荷重データがありません。StbCalDataを含むSTBファイルを読み込んでください。');
            });
            event.target.checked = false;
            log.warn('荷重データが見つからないため、表示を無効にしました');
            return;
          }

          loadManager.setDisplayMode(LOAD_DISPLAY_MODE.ARROW);
        } else {
          loadManager.setDisplayMode(LOAD_DISPLAY_MODE.NONE);
        }
        if (isVisible) {
          log.info('荷重表示を有効化しました');
        } else {
          log.info('荷重表示を無効化しました');
        }

        // 荷重ケースセレクターの表示を切り替え
        if (loadCaseSelector) {
          loadCaseSelector.style.display = isVisible ? 'inline-block' : 'none';
        }

        // 再描画をリクエスト
        if (typeof window.requestRender === 'function') {
          window.requestRender();
        }
      } else {
        log.warn('LoadDisplayManagerが初期化されていません');
      }
    });
  } else {
    log.warn('荷重表示切り替えボタンが見つかりません。');
  }

  // 荷重ケースセレクター
  if (loadCaseSelector) {
    loadCaseSelector.addEventListener('change', (event) => {
      const loadCaseId = event.target.value || null;
      const loadManager = getLoadDisplayManager();

      if (loadManager) {
        loadManager.selectLoadCase(loadCaseId);
        log.info(`荷重ケースを選択しました: ${loadCaseId || '全て'}`);

        // 再描画をリクエスト
        if (typeof window.requestRender === 'function') {
          window.requestRender();
        }
      }
    });
  }

  log.info('ボタンイベントリスナーをセットアップしました');
}

/**
 * @fileoverview UIコンポーネントとボタンイベントリスナーの初期化
 */

import { createLogger } from '../../utils/logger.js';
import { getState } from '../../data/state/globalState.js';
import {
  toggleOriginAxesVisibility,
  togglePlacementLinesVisibility,
  toggleGridVisibility,
} from './eventHandlers.js';
import { getLoadDisplayManager, LOAD_DISPLAY_MODE } from '../../viewer/index.js';
import {
  initializeThemeSystem,
  initializeSharedPanels,
  initializeTreePanels,
  initializeComparisonControls,
  initializeSectionListPanels,
} from './uiInitializationHelpers.js';

const log = createLogger('uiInitializer');

/**
 * UIコンポーネントを初期化
 * @param {Function} scheduleRender - 再描画関数
 * @param {Object} elementGroups - 要素グループ
 */
export function initializeUIComponents(scheduleRender, elementGroups) {
  initializeThemeSystem();
  initializeSharedPanels();
  initializeTreePanels(scheduleRender, elementGroups);
  initializeComparisonControls();
  initializeSectionListPanels();
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
  const gridToggle = document.getElementById('toggleViewerGrid');
  if (gridToggle) {
    gridToggle.addEventListener('change', (event) => {
      const isVisible = event.target.checked;
      toggleGridVisibility(isVisible);
      log.info(`グリッドの表示状態を設定しました: ${isVisible}`);
    });
  } else {
    log.warn('グリッド切替用のチェックボックスが見つかりません');
  }

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
            import('../../ui/common/toast.js')
              .then(({ showWarning }) => {
                showWarning(
                  '荷重データがありません。StbCalDataを含むSTBファイルを読み込んでください。',
                );
              })
              .catch(() => {
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

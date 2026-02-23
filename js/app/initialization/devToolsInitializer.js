/**
 * @fileoverview 開発/テストツールのセットアップ
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('devToolsInitializer');

/**
 * 開発/テストツールをセットアップ
 */
export function setupDevelopmentTools() {
  // パフォーマンス統計表示関数とリセット関数を追加
  import('../../colorModes/index.js').then(
    ({
      showImportancePerformanceStats,
      resetImportanceColors,
      resetElementColors,
      resetSchemaColors,
    }) => {
      window.showImportancePerformanceStats = showImportancePerformanceStats;
      window.resetImportanceColors = resetImportanceColors;
      window.resetElementColors = resetElementColors;
      window.resetSchemaColors = resetSchemaColors;
    },
  );

  // テストページからのメッセージ受信処理
  window.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'testPlacementLinesToggle') {
      const placementLinesToggle = document.getElementById('togglePlacementLines');
      if (placementLinesToggle) {
        placementLinesToggle.checked = !placementLinesToggle.checked;
        placementLinesToggle.dispatchEvent(new Event('change'));
      }
    }

    if (event.data && event.data.action === 'loadSample') {
      try {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.stb';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        fileInput.addEventListener('change', (e) => {
          if (e.target.files.length > 0) {
            const file = e.target.files[0];
            if (window.handleCompareModelsClick) {
              window.handleCompareModelsClick([file]);
            }
          }
          document.body.removeChild(fileInput);
        });

        fileInput.click();
      } catch (error) {
        log.error('ファイル選択の実行エラー:', error);
      }
    }
  });

  log.info('開発/テストツールをセットアップしました');

  // 荷重データ診断コマンド
  window.debugLoadData = () => {
    const calDataA = getState('models.calDataA');
    const calDataB = getState('models.calDataB');
    const loadManager = getLoadDisplayManager();

    console.group('🔍 荷重データ診断');
    console.log('models.calDataA:', calDataA);
    console.log('models.calDataB:', calDataB);
    console.log('LoadDisplayManager:', loadManager);

    if (calDataA) {
      console.log('モデルA荷重統計:', {
        荷重ケース数: calDataA.loadCases?.length,
        部材荷重数: calDataA.memberLoads?.length,
        荷重配置: {
          柱: calDataA.loadArrangements?.columns?.size,
          大梁: calDataA.loadArrangements?.girders?.size,
          小梁: calDataA.loadArrangements?.beams?.size,
        },
      });
    }

    console.groupEnd();
    return { calDataA, calDataB, loadManager };
  };

  log.info('デバッグコマンド利用可能: window.debugLoadData().');

  // 重要度デバッグツール
  import('../../diagnostics/importanceDebug.js')
    .then((module) => {
      // デバッグツールを初期化
      if (module.initializeDebugTools) {
        module.initializeDebugTools();
      }

      // デバッグ関数が利用可能か確認
      if (window.importanceDebug) {
        log.info('重要度デバッグツール利用可能: window.importanceDebug.logDuplicateReport()');
      } else {
        log.warn('重要度デバッグツールの初期化に失敗しました');
      }
    })
    .catch((error) => {
      log.warn('重要度デバッグツールの読み込みに失敗:', error);
    });
}

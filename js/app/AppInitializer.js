/**
 * @fileoverview アプリケーション初期化クラス
 *
 * アプリケーションの各種初期化処理を管理します:
 * - UIコンポーネントの初期化
 * - 統合システムの初期化
 * - イベントリスナーのセットアップ
 * - デバッグツールの設定
 */

import { createLogger } from '../utils/logger.js';
import {
  scene,
  elementGroups,
  getActiveCamera,
  setLabelProvider,
  setElementsLabelProvider,
  setElementInfoProviders,
  setClippingStateProvider,
} from '../viewer/index.js';
import { initializeSettingsManager } from './settingsManager.js';
import { initializeGlobalMessenger } from './moduleMessaging.js';
import { viewerEventBridge } from '../viewer/services/viewerEventBridge.js';
import { initializeImportanceManager } from './importanceManager.js';
import { setDxfExporterProviders } from '../export/index.js';

const log = createLogger('AppInitializer');

/**
 * アプリケーション初期化クラス
 */
export class AppInitializer {
  constructor() {
    this.initialized = false;
  }

  /**
   * 必要なモジュールの初期化
   */
  async initializeRequiredModules() {
    // 統合ラベル管理システムを初期化
    const { initializeLabelManager, generateLabelText } =
      await import('../ui/unifiedLabelManager.js');
    initializeLabelManager();
    log.info('統合ラベル管理システムが初期化されました');

    // viewer層へのラベルプロバイダー注入
    const [{ attachElementDataToLabel }, { createLabelSprite }] = await Promise.all([
      import('../ui/labelRegeneration.js'),
      import('../viewer/ui/labels.js'),
    ]);

    const labelProvider = {
      generateLabelText,
      attachElementDataToLabel,
      createLabelSprite,
    };
    setLabelProvider(labelProvider);
    setElementsLabelProvider(labelProvider);
    log.info('ラベルプロバイダーがviewer層に注入されました');

    // XSDスキーマを初期化
    try {
      const { loadXsdSchema } = await import('../parser/xsdSchemaParser.js');
      const xsdPath = './schemas/ST-Bridge202.xsd';
      const success = await loadXsdSchema(xsdPath);
      if (success) {
        log.info('起動時にXSDスキーマが初期化されました');
      } else {
        log.warn('起動時のXSDスキーマ初期化に失敗しました');
      }
    } catch (error) {
      log.warn('XSDスキーマモジュールの読み込みに失敗しました:', error);
    }

    // clippingManagerへの状態プロバイダー注入
    const { getState: getStateFunc } = await import('./globalState.js');
    setClippingStateProvider({ getState: getStateFunc });
    log.info('clippingManager状態プロバイダーが注入されました');

    // elementInfoDisplayへの依存プロバイダー注入
    await this._injectElementInfoProviders();

    // DxfExporterへの依存プロバイダー注入
    await this._injectDxfExporterProviders();
  }

  /**
   * elementInfoDisplayへのプロバイダー注入
   * @private
   */
  async _injectElementInfoProviders() {
    try {
      const [
        { ParameterEditor },
        { SuggestionEngine },
        { floatingWindowManager },
        { getImportanceManager },
        { evaluateSectionEquivalence },
        { updateLabelsForElement },
      ] = await Promise.all([
        import('../ui/parameterEditor.js'),
        import('./suggestionEngine.js'),
        import('../ui/floatingWindow.js'),
        import('./importanceManager.js'),
        import('./sectionEquivalenceEngine.js'),
        import('../ui/labelRegeneration.js'),
      ]);

      setElementInfoProviders({
        parameterEditor: ParameterEditor,
        suggestionEngine: SuggestionEngine,
        floatingWindowManager,
        getImportanceManager,
        evaluateSectionEquivalence,
        updateLabelsForElement,
      });
      log.info('elementInfoDisplayプロバイダーが注入されました');
    } catch (error) {
      log.warn('elementInfoDisplayプロバイダーの初期化に失敗しました:', error);
    }
  }

  /**
   * DxfExporterへのプロバイダー注入
   * @private
   */
  async _injectDxfExporterProviders() {
    try {
      const [
        { getState: getStateFunc },
        { generateLabelText },
        { getCurrentClippingState, applyStoryClip, applyAxisClip, clearAllClippingPlanes },
        { getCurrentStories, getCurrentAxesData },
      ] = await Promise.all([
        import('./globalState.js'),
        import('../ui/unifiedLabelManager.js'),
        import('../ui/clipping.js'),
        import('../ui/state.js'),
      ]);

      const { orthographicCamera } = await import('../viewer/index.js');

      setDxfExporterProviders({
        getState: getStateFunc,
        generateLabelText,
        getCurrentClippingState,
        applyStoryClip,
        applyAxisClip,
        clearAllClippingPlanes,
        getCurrentStories,
        getCurrentAxesData,
        getElementGroups: () => elementGroups,
        getActiveCamera: getActiveCamera,
        getOrthographicCamera: () => orthographicCamera,
        getLoadedFilename: () => {
          const fileA = getStateFunc('files.originalFileA');
          const fileB = getStateFunc('files.originalFileB');
          return (fileA && fileA.name) || (fileB && fileB.name) || 'stb_export';
        },
      });
      log.info('DxfExporterプロバイダーが注入されました');
    } catch (error) {
      log.warn('DxfExporterプロバイダーの初期化に失敗しました:', error);
    }
  }

  /**
   * コアシステムの初期化
   */
  initializeCoreSystem() {
    initializeSettingsManager();
    initializeGlobalMessenger();
    viewerEventBridge.initialize();

    // 重要度管理システムの初期化
    initializeImportanceManager()
      .then(() => {
        log.info('重要度マネージャーが初期化されました');
      })
      .catch((error) => {
        log.error('重要度マネージャーの初期化に失敗しました:', error);
      });
  }

  /**
   * デバッグ用グローバルオブジェクトのセットアップ
   */
  async setupDebugGlobals() {
    const { camera, renderer, controls } = await import('../viewer/index.js');
    const GeometryDebugger = await import('../viewer/geometry/debug/GeometryDebugger.js');

    if (!window.viewer) window.viewer = {};
    window.viewer.scene = scene;
    window.viewer.camera = camera;
    window.viewer.renderer = renderer;
    window.viewer.controls = controls;
    window.scene = scene;
    window.GeometryDebugger = GeometryDebugger;

    // 断面比較一括実行ショートカット
    window.runSectionComparison = (opts = {}) => {
      try {
        if (!window.GeometryDiagnostics) {
          console.warn('GeometryDiagnosticsモジュールがまだ読み込まれていません');
          return;
        }
        return window.GeometryDiagnostics.logDefaultSceneComparisons(null, opts.limit || 300, {
          tolerance: opts.tolerance ?? 0.02,
          level: opts.level || 'info',
        });
      } catch (e) {
        console.error('断面比較の実行に失敗しました', e);
      }
    };
  }

  /**
   * 開発/テストツールのセットアップ
   */
  async setupDevelopmentTools() {
    const {
      showImportancePerformanceStats,
      resetImportanceColors,
      resetElementColors,
      resetSchemaColors,
    } = await import('../colorModes/index.js');

    window.showImportancePerformanceStats = showImportancePerformanceStats;
    window.resetImportanceColors = resetImportanceColors;
    window.resetElementColors = resetElementColors;
    window.resetSchemaColors = resetSchemaColors;

    // テストページからのメッセージ受信処理
    window.addEventListener('message', (event) => {
      this._handleTestMessage(event);
    });
  }

  /**
   * テストメッセージの処理
   * @private
   */
  _handleTestMessage(event) {
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
        console.error('ファイル選択の実行エラー:', error);
      }
    }
  }
}

// シングルトンインスタンス
export const appInitializer = new AppInitializer();

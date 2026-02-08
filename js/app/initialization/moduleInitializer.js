/**
 * @fileoverview 必要なモジュールの非同期初期化
 */

import { createLogger } from '../../utils/logger.js';
import {
  orthographicCamera,
  setLabelProvider,
  setElementsLabelProvider,
  setElementInfoProviders,
  setClippingStateProvider,
} from '../../viewer/index.js';
import { setDxfExporterProviders } from '../../export/index.js';
import { getState } from '../globalState.js';
import { getActiveCamera } from '../../viewer/index.js';

const log = createLogger('moduleInitializer');

/**
 * 必要なモジュールの初期化（ラベル管理、XSDスキーマ、プロバイダー注入）
 * @param {Object} elementGroups - 要素グループ
 * @returns {Promise<void>}
 */
export async function initializeRequiredModules(elementGroups) {
  // 統合ラベル管理システムを初期化
  import('../../ui/viewer3d/unifiedLabelManager.js').then(
    ({ initializeLabelManager, generateLabelText }) => {
      initializeLabelManager();
      log.info('統合ラベル管理システムが初期化されました');

      // viewer層へのラベルプロバイダー注入（逆依存解消）
      Promise.all([
        import('../../ui/viewer3d/labelRegeneration.js'),
        import('../../viewer/annotations/labels.js'),
      ]).then(([{ attachElementDataToLabel }, { createLabelSprite }]) => {
        const labelProvider = {
          generateLabelText,
          attachElementDataToLabel,
          createLabelSprite,
        };
        // batchedElements.js用
        setLabelProvider(labelProvider);
        // elements.js用
        setElementsLabelProvider(labelProvider);
        log.info('ラベルプロバイダーがviewer層に注入されました');
      });
    },
  );

  // XSDスキーマを初期化
  import('../../common-stb/parser/xsdSchemaParser.js')
    .then(({ loadXsdSchema }) => {
      const xsdPath = './schemas/ST-Bridge202.xsd';
      loadXsdSchema(xsdPath).then((success) => {
        if (success) {
          log.info('起動時にXSDスキーマが初期化されました');
        } else {
          log.warn('起動時のXSDスキーマ初期化に失敗しました');
        }
      });
    })
    .catch((error) => {
      log.warn('XSDスキーマモジュールの読み込みに失敗しました:', error);
    });

  // clippingManagerへの状態プロバイダー注入（逆依存解消）
  import('../globalState.js').then(({ getState }) => {
    setClippingStateProvider({ getState });
    log.info('clippingManager状態プロバイダーが注入されました');
  });

  // elementInfoDisplayへの依存プロバイダー注入（逆依存解消）
  Promise.all([
    import('../../ui/panels/parameterEditor.js'),
    import('../suggestionEngine.js'),
    import('../../ui/panels/floatingWindow.js'),
    import('../importanceManager.js'),
    import('../sectionEquivalenceEngine.js'),
    import('../../ui/viewer3d/labelRegeneration.js'),
  ])
    .then(
      ([
        { ParameterEditor },
        { SuggestionEngine },
        { floatingWindowManager },
        { getImportanceManager },
        { evaluateSectionEquivalence },
        { updateLabelsForElement },
      ]) => {
        setElementInfoProviders({
          parameterEditor: ParameterEditor,
          suggestionEngine: SuggestionEngine,
          floatingWindowManager,
          getImportanceManager,
          evaluateSectionEquivalence,
          updateLabelsForElement,
        });
        log.info('elementInfoDisplayプロバイダーが注入されました');
      },
    )
    .catch((error) => {
      log.warn('elementInfoDisplayプロバイダーの初期化に失敗しました:', error);
    });

  // DxfExporterへの依存プロバイダー注入（逆依存解消）
  // awaitで待機することで、フローティングウィンドウ表示時にプロバイダーが確実に設定されている
  try {
    const [
      { getState },
      { generateLabelText },
      { getCurrentClippingState, applyStoryClip, applyAxisClip, clearAllClippingPlanes },
      { getCurrentStories, getCurrentAxesData },
    ] = await Promise.all([
      import('../globalState.js'),
      import('../../ui/viewer3d/unifiedLabelManager.js'),
      import('../../ui/viewer3d/clipping.js'),
      import('../../ui/state.js'),
    ]);
    setDxfExporterProviders({
      getState,
      generateLabelText,
      getCurrentClippingState,
      applyStoryClip,
      applyAxisClip,
      clearAllClippingPlanes,
      getCurrentStories,
      getCurrentAxesData,

      // Viewer関連のプロバイダーを注入（モデル・カメラ・ファイル名）
      getElementGroups: () => elementGroups,
      getActiveCamera: getActiveCamera,
      getOrthographicCamera: () => orthographicCamera,
      getLoadedFilename: () => {
        const fileA = getState('files.originalFileA');
        const fileB = getState('files.originalFileB');
        return (fileA && fileA.name) || (fileB && fileB.name) || 'stb_export';
      },
    });
    log.info('DxfExporterプロバイダーが注入されました');
  } catch (error) {
    log.warn('DxfExporterプロバイダーの初期化に失敗しました:', error);
  }
}

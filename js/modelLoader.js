/**
 * @fileoverview モデルロード・管理モジュール
 *
 * このファイルは、STBモデルのロードと管理に関する機能を提供します:
 * - STBファイルの選択とロード
 * - モデルAとモデルBの読み込みと管理
 * - ファイルの解析とパース処理
 * - モデル比較の実行と結果の管理
 * - 3Dビューへのモデル適用
 * - ビュー状態の調整
 *
 * このモジュールは、ファイル選択からモデル表示までの一連の流れを
 * 制御し、他のモジュールと連携してモデルデータを適切に扱います。
 */

import * as THREE from 'three';
import { createLogger } from './utils/logger.js';
import {
  clearSceneContent,
  createOrUpdateGridHelper,
  elementGroups,
  clearClippingPlanes,
  scene,
} from './viewer/index.js';
import { UI_TIMING } from './config/uiTimingConfig.js';

const log = createLogger('ModelLoader');
import { clearUIState } from './ui.js';
import { resetSelection } from './interaction.js';
import { clearTree, clearTreeSelection } from './ui/elementTreeView.js';
import { clearSectionTree } from './ui/sectionTreeView.js';
import { clearParseCache } from './viewer/geometry/stbStructureReader.js';
import { setState, getState, resetApplicationState } from './app/globalState.js';
import { eventBus } from './app/events/eventBus.js';
import { scheduleRender } from './utils/renderScheduler.js';
import { EventTypes, ModelEvents, ComparisonEvents } from './app/events/eventTypes.js';
import { JsonDisplayIntegration } from './viewer/integration/jsonDisplayIntegration.js';
import comparisonKeyManager from './app/comparisonKeyManager.js';
import {
  processJsonIntegratedModels,
  detectJsonIntegrationSupport,
} from './modelLoader/jsonIntegration.js';

// Refactored modules
import {
  validateAndGetFiles,
  getSelectedElementTypes,
  setLoadingState,
  validateComparisonParameters,
} from './modelLoader/fileValidation.js';
import { processModelDocuments, clearModelProcessingState } from './modelLoader/modelProcessing.js';
import {
  processElementComparison,
  calculateElementBounds,
  getComparisonStatistics,
} from './modelLoader/elementComparison.js';
import {
  orchestrateElementRendering,
  calculateRenderingBounds,
  getRenderingStatistics,
} from './modelLoader/renderingOrchestrator.js';
import {
  orchestrateProgressiveRendering,
  isProgressiveRenderingEnabled,
  onLoadingStart,
  onLoadingComplete,
  onLoadingError,
} from './modelLoader/progressiveRendering.js';
import {
  finalizeVisualization,
  handleFinalizationError,
  createFinalizationSummary,
} from './modelLoader/visualizationFinalizer.js';
import { showError } from './ui/toast.js';

// モデル状態管理
let stories = [];
let nodeMapA = new Map();
let nodeMapB = new Map();
let nodeLabels = [];
let modelBounds = new THREE.Box3();
let axesData = { xAxes: [], yAxes: [] };
let modelADocument = null;
let modelBDocument = null;
let modelsLoaded = false;
let sectionMaps = null; // 断面データ

/**
 * モデルデータへの参照を取得
 * @returns {Object} モデルデータオブジェクト
 */
export function getModelData() {
  return {
    stories,
    nodeMapA,
    nodeMapB,
    nodeLabels,
    modelBounds,
    axesData,
    modelADocument,
    modelBDocument,
    modelsLoaded,
    sectionMaps,
  };
}

/**
 * モデルのロード状態を取得
 * @returns {boolean} モデルがロードされているかのフラグ
 */
export function isModelLoaded() {
  return modelsLoaded;
}

/**
 * モデルを読み込み比較する（リファクタリング版）
 * @param {Function} scheduleRender - 再描画要求関数
 * @param {Object} options - カメラとコントロールの参照
 * @returns {Promise<boolean>} 処理結果
 */
export async function compareModels(scheduleRender, { camera, controls } = {}) {
  // Phase 1: Validation and Input Processing
  const fileValidation = validateAndGetFiles();
  if (!fileValidation.isValid) {
    return false;
  }

  const { fileA, fileB } = fileValidation;
  const selectedElementTypes = getSelectedElementTypes();

  // JSON統合機能の検出とサポート
  const jsonSupport = detectJsonIntegrationSupport(fileA, fileB);
  const { hasJsonFiles, isJsonFileA, isJsonFileB } = jsonSupport;

  // Validate comparison parameters
  const paramValidation = validateComparisonParameters({
    fileA,
    fileB,
    selectedElementTypes,
    scheduleRender,
    cameraControls: { camera, controls },
  });

  if (!paramValidation.isValid) {
    log.error('パラメータ検証に失敗:', paramValidation.errors);
    showError('パラメータ検証に失敗しました: ' + paramValidation.errors.join(', '));
    return false;
  }

  // Set loading state
  setLoadingState(true);
  onLoadingStart();

  // === Phase 0: Comprehensive State Reset ===
  log.info('全状態を初期化しています...');

  // Clear 3D scene content
  modelBounds = clearSceneContent(elementGroups, nodeLabels);

  // Clear local module state
  stories.length = 0;
  nodeMapA.clear();
  nodeMapB.clear();
  axesData = { xAxes: [], yAxes: [] };
  nodeLabels = [];
  modelADocument = null;
  modelBDocument = null;
  sectionMaps = null;
  modelsLoaded = false;

  // Clear model processing state (window.docA, window.docB)
  clearModelProcessingState();

  // Reset global application state
  resetApplicationState();

  // Clear UI state (labels, stories, axes)
  clearUIState();

  // Clear selection state in 3D viewer
  resetSelection();

  // Clear tree views
  clearTree();
  clearTreeSelection();
  clearSectionTree();

  // Clear STB parse cache to ensure fresh parsing
  clearParseCache();

  log.info('全状態の初期化が完了しました');

  // 元のSTBファイルをグローバル状態に再保存（リセット後に行う）
  // IFC変換やSTBバージョン変換で使用するため
  if (fileA) {
    setState('files.originalFileA', fileA);
  }
  if (fileB) {
    setState('files.originalFileB', fileB);
  }

  try {
    // Phase 2: Model Document Processing
    // JSON統合処理
    if (hasJsonFiles) {
      const jsonIntegration = new JsonDisplayIntegration();

      // JSON統合表示システムを活用した処理
      const jsonDisplayResult = await processJsonIntegratedModels(
        fileA,
        fileB,
        isJsonFileA,
        isJsonFileB,
        jsonIntegration,
      );

      if (jsonDisplayResult.success) {
        // UI更新（必要に応じて）
        if (scheduleRender) {
          scheduleRender();
        }

        return jsonDisplayResult.result;
      } else {
        log.error('JSON統合処理失敗:', jsonDisplayResult.error);
        showError(`JSON統合処理エラー: ${jsonDisplayResult.error}`);
        return false;
      }
    }

    const processingResult = await processModelDocuments(fileA, fileB);

    if (!processingResult.success) {
      throw new Error(processingResult.error);
    }

    // Update local state with processed data
    ({ modelADocument, modelBDocument, nodeMapA, nodeMapB, stories, axesData, sectionMaps } =
      processingResult);

    // Extract version info from processing result
    const versionInfo = processingResult.versionInfo || {
      versionA: 'unknown',
      versionB: 'unknown',
      isCrossVersion: false,
    };

    // Extract calculation data (StbCalData) for load visualization
    const calDataA = processingResult.calDataA || null;
    const calDataB = processingResult.calDataB || null;

    // Save model documents to global state for IFC conversion
    setState('models.documentA', modelADocument);
    setState('models.documentB', modelBDocument);
    setState('models.nodeMapA', nodeMapA);
    setState('models.nodeMapB', nodeMapB);
    setState('models.stories', stories);
    setState('models.axesData', axesData);
    setState('sectionsData', sectionMaps); // 断面データを保存
    setState('models.versionInfo', versionInfo); // バージョン情報を保存
    setState('models.calDataA', calDataA); // 計算データ（モデルA）を保存
    setState('models.calDataB', calDataB); // 計算データ（モデルB）を保存

    // Emit model loaded events for version comparison panel
    if (fileA) {
      eventBus.emit(ModelEvents.LOADED, {
        model: {
          fileName: fileA.name,
          version: versionInfo.versionA,
          document: modelADocument,
          nodeMap: nodeMapA,
        },
        slot: 'A',
        timestamp: new Date().toISOString(),
      });
    }

    if (fileB) {
      eventBus.emit(ModelEvents.LOADED, {
        model: {
          fileName: fileB.name,
          version: versionInfo.versionB,
          document: modelBDocument,
          nodeMap: nodeMapB,
        },
        slot: 'B',
        timestamp: new Date().toISOString(),
      });
    }

    // Phase 3: Element Comparison
    const comparisonKeyType = comparisonKeyManager.getKeyType();

    const comparisonOptions = {
      useImportanceFiltering: true,
      targetImportanceLevels: null, // null = all levels
      comparisonKeyType: comparisonKeyType, // 比較キータイプを追加
    };
    const comparisonResult = processElementComparison(
      processingResult,
      selectedElementTypes,
      comparisonOptions,
    );
    const { comparisonResults } = comparisonResult;

    // 比較結果をグローバル状態に保存
    setState('comparisonResults', comparisonResults);

    // 統計更新イベントを発行
    window.dispatchEvent(
      new CustomEvent('updateComparisonStatistics', {
        detail: {
          comparisonResults: comparisonResults,
          reason: 'modelComparison',
          timestamp: new Date().toISOString(),
        },
      }),
    );

    // 比較完了イベントをEventBusで発行（バージョン情報を含む）
    eventBus.emit(EventTypes.Comparison.COMPLETED, {
      comparisonResults,
      versionInfo,
      timestamp: new Date().toISOString(),
    });

    // Calculate model bounds
    modelBounds = calculateElementBounds(comparisonResults, nodeMapA, nodeMapB);

    // Phase 4: 3D Rendering（段階的レンダリング対応）
    // globalDataにnodeMapA/nodeMapBを含めてAdapter層で利用可能にする
    const globalRenderData = { stories, axesData, nodeMapA, nodeMapB };

    let renderingResult;

    // common/viewerモードの場合はアダプター経由でレンダリング
    const useCommonViewer = getState('viewer.useCommonViewer');
    const adapter = getState('viewer.adapter');

    if (useCommonViewer && adapter) {
      log.info('common/viewerモードでレンダリングを実行します...');

      // アダプター用の比較結果形式に変換
      const adapterComparisonResult = convertToAdapterFormat(
        comparisonResults,
        nodeMapA,
        nodeMapB,
        sectionMaps,
      );

      // アダプター経由でレンダリング
      adapter.loadComparisonResult(adapterComparisonResult);

      // モデルバウンドを計算（通り芯・階描画用）
      const adapterModelBounds = new THREE.Box3();
      for (const node of nodeMapA.values()) {
        adapterModelBounds.expandByPoint(new THREE.Vector3(node.x, node.y, node.z));
      }
      for (const node of nodeMapB.values()) {
        adapterModelBounds.expandByPoint(new THREE.Vector3(node.x, node.y, node.z));
      }

      // 通り芯を描画
      if (axesData && (axesData.xAxes.length > 0 || axesData.yAxes.length > 0)) {
        try {
          adapter.drawAxes(axesData, adapterModelBounds, { stories });
          log.info(
            `common/viewerモード: 通り芯を描画 X=${axesData.xAxes.length}, Y=${axesData.yAxes.length}`,
          );
        } catch (error) {
          log.error('通り芯描画エラー:', error);
        }
      }

      // 階を描画
      if (stories && stories.length > 0) {
        try {
          adapter.drawStories(stories, adapterModelBounds);
          log.info(`common/viewerモード: ${stories.length}階を描画`);
        } catch (error) {
          log.error('階描画エラー:', error);
        }
      }

      // レンダリング結果を構築（後続処理との互換性のため）
      renderingResult = {
        nodeLabels: [],
        renderedElements: {
          matched: [],
          onlyA: [],
          onlyB: [],
        },
        stats: {
          totalRendered: adapter.sceneManager?.getObjectCount() || 0,
        },
      };

      log.info(
        `common/viewerモード: ${renderingResult.stats.totalRendered}オブジェクトをレンダリング`,
      );
    } else if (isProgressiveRenderingEnabled()) {
      renderingResult = await orchestrateProgressiveRendering(
        comparisonResults,
        modelBounds,
        globalRenderData,
        scheduleRender,
      );
    } else {
      renderingResult = orchestrateElementRendering(
        comparisonResults,
        modelBounds,
        globalRenderData,
      );
    }

    // Update node labels
    nodeLabels = renderingResult.nodeLabels;

    // Recalculate bounds after rendering
    modelBounds = calculateRenderingBounds(renderingResult.renderedElements, nodeMapA, nodeMapB);

    // Phase 5: Visualization Finalization
    const finalizationData = {
      nodeLabels,
      stories,
      axesData,
      modelBounds,
      renderingStats: getRenderingStatistics(renderingResult),
      modelADocument,
      modelBDocument,
      nodeMapA,
      nodeMapB,
    };

    const finalizationResult = finalizeVisualization(finalizationData, scheduleRender, {
      camera,
      controls,
    });

    if (!finalizationResult.success) {
      throw new Error('Visualization finalization failed: ' + finalizationResult.error);
    }

    // Clear clipping planes
    clearClippingPlanes();

    // Mark models as loaded
    modelsLoaded = true;
    onLoadingComplete();

    // Apply appropriate color mode based on loaded models
    setTimeout(() => {
      import('./colorModes/index.js').then(({ applyDefaultColorModeAfterLoad }) => {
        const hasBothModels = !!modelADocument && !!modelBDocument;
        const hasSingleModel = (!!modelADocument || !!modelBDocument) && !hasBothModels;
        applyDefaultColorModeAfterLoad(hasBothModels, hasSingleModel, reapplyColorMode);
      });
    }, UI_TIMING.COLOR_MODE_APPLY_DELAY_MS);

    // Log completion statistics
    // const comparisonStats = getComparisonStatistics(comparisonResults);
    // const finalizationSummary = createFinalizationSummary(
    //   finalizationData,
    //   finalizationResult.stats || {},
    // );

    // 差分フィルタパネル等の統計更新イベントを発行
    eventBus.emit(ComparisonEvents.UPDATE_STATISTICS, {
      comparisonResults: comparisonResults,
      reason: 'modelComparison',
      timestamp: new Date().toISOString(),
    });

    return true;
  } catch (error) {
    log.error('モデル比較に失敗:', error);
    onLoadingError(error.message || '不明なエラー');
    showError(`エラーが発生しました: ${error.message || '不明なエラー'}`);

    // Error cleanup
    handleFinalizationError(error, {});

    // Reset state safely
    try {
      modelBounds = clearSceneContent(elementGroups, nodeLabels || []);
      stories.length = 0;
      nodeMapA.clear();
      nodeMapB.clear();
      axesData = { xAxes: [], yAxes: [] };
      nodeLabels = [];
      createOrUpdateGridHelper(modelBounds);
      clearModelProcessingState();
      modelsLoaded = false;
    } catch (cleanupError) {
      log.error('状態クリーンアップ中のエラー:', cleanupError);
    }

    return false;
  } finally {
    // Always reset loading state
    setLoadingState(false);
  }
}

/**
 * 色付けモード変更時に全要素に新しい色付けを適用する
 */
export function reapplyColorMode() {
  if (!modelsLoaded) {
    log.warn('[ModelLoader] No models loaded, color mode will be applied when models are loaded');
    return;
  }

  try {
    // 色付けモードを取得
    import('./colorModes/index.js').then(({ getCurrentColorMode }) => {
      const currentMode = getCurrentColorMode();

      // 現在のシーンの全オブジェクトに新しいマテリアルを適用
      // グローバル状態のシーンを優先し、なければ直接インポートしたシーンを使用
      const currentScene = getState('rendering.scene') || scene;
      if (!currentScene) {
        log.warn('シーンが利用できません');
        return;
      }

      // 全ての要素を収集（Mesh/Line要素のみ、Spriteは除外）
      const objectsToUpdate = [];
      currentScene.traverse((object) => {
        if (
          (object.isMesh || object.isLine) &&
          object.userData &&
          object.userData.elementType
        ) {
          objectsToUpdate.push(object);
        }
      });

      // マテリアルを非同期で更新
      Promise.all(
        objectsToUpdate.map((object) => updateObjectMaterialAsync(object, currentMode)),
      ).then(() => {
        // 全ての更新が完了したら再描画をリクエスト
        scheduleRender();
      });
    });
  } catch (error) {
    log.error('カラーモード再適用中のエラー:', error);
  }
}

/**
 * オブジェクトのマテリアルを色付けモードに応じて非同期で更新
 * @param {THREE.Object3D} object - 更新対象のオブジェクト
 * @param {string} colorMode - 色付けモード
 * @returns {Promise} 更新完了のPromise
 */
function updateObjectMaterialAsync(object, _colorMode) {
  return import('./viewer/rendering/materials.js').then(({ getMaterialForElementWithMode }) => {
    if (getMaterialForElementWithMode && object.userData) {
      const elementType = object.userData.elementType;

      // AxisとStoryは色付けモードの対象外（独自のマテリアルを使用）
      if (elementType === 'Axis' || elementType === 'Story') {
        return;
      }

      const comparisonState = object.userData.modelSource || 'matched';
      const isLine = object.userData.isLine || false;
      const isPoly = object.userData.isPoly || false;
      const elementId = object.userData.elementId || null;

      const newMaterial = getMaterialForElementWithMode(
        elementType,
        comparisonState,
        isLine,
        isPoly,
        elementId,
      );

      if (newMaterial && object.material !== newMaterial) {
        object.material = newMaterial;
      }
    }
  });
}

/**
 * 比較結果をStbViewerAdapter用の形式に変換
 * @param {Map} comparisonResults - 比較結果Map
 * @param {Map} nodeMapA - モデルAの節点Map
 * @param {Map} nodeMapB - モデルBの節点Map
 * @param {Object} sectionMaps - 断面データ
 * @returns {Object} アダプター用の比較結果オブジェクト
 */
function convertToAdapterFormat(comparisonResults, nodeMapA, nodeMapB, sectionMaps) {
  const result = {
    columns: [],
    girders: [],
    beams: [],
    braces: [],
    slabs: [],
    walls: [],
    nodes: [],
  };

  // 要素タイプのマッピング
  const typeMapping = {
    Column: 'columns',
    Girder: 'girders',
    Beam: 'beams',
    Brace: 'braces',
    Slab: 'slabs',
    Wall: 'walls',
    StbNode: 'nodes',
  };

  // 比較結果を変換
  if (comparisonResults && comparisonResults instanceof Map) {
    for (const [elementType, categoryResult] of comparisonResults) {
      const targetKey = typeMapping[elementType];
      if (!targetKey) continue;

      // matched要素
      if (categoryResult.matched) {
        for (const item of categoryResult.matched) {
          const element = convertElementForAdapter(
            item.dataA || item.dataB,
            elementType,
            'matched',
            item.hasMismatch || false,
            'A',
            nodeMapA,
            nodeMapB,
            sectionMaps,
          );
          if (element) {
            result[targetKey].push(element);
          }
        }
      }

      // onlyA要素
      if (categoryResult.onlyA) {
        for (const item of categoryResult.onlyA) {
          const element = convertElementForAdapter(
            item,
            elementType,
            'onlyA',
            false,
            'A',
            nodeMapA,
            nodeMapB,
            sectionMaps,
          );
          if (element) {
            result[targetKey].push(element);
          }
        }
      }

      // onlyB要素
      if (categoryResult.onlyB) {
        for (const item of categoryResult.onlyB) {
          const element = convertElementForAdapter(
            item,
            elementType,
            'onlyB',
            false,
            'B',
            nodeMapA,
            nodeMapB,
            sectionMaps,
          );
          if (element) {
            result[targetKey].push(element);
          }
        }
      }
    }
  }

  return result;
}

/**
 * 単一要素をアダプター形式に変換
 * @private
 */
function convertElementForAdapter(
  elementData,
  elementType,
  comparisonStatus,
  hasMismatch,
  modelSource,
  nodeMapA,
  nodeMapB,
  sectionMaps,
) {
  if (!elementData) return null;

  const nodeMap = modelSource === 'A' ? nodeMapA : nodeMapB;

  // 線状要素（柱、梁、ブレース）
  if (['Column', 'Girder', 'Beam', 'Brace'].includes(elementType)) {
    const idNode1 = elementData.id_node_bottom || elementData.id_node_start;
    const idNode2 = elementData.id_node_top || elementData.id_node_end;

    const startNode = nodeMap.get(idNode1);
    const endNode = nodeMap.get(idNode2);

    if (!startNode || !endNode) {
      return null;
    }

    // 断面情報を取得
    let section = null;
    if (sectionMaps) {
      const sectionKey = getSectionMapKey(elementType);
      const sectionMap = sectionMaps[sectionKey];
      if (sectionMap) {
        const sectionId = elementData.id_section;
        section = sectionMap.get(sectionId);
      }
    }

    return {
      id: elementData.id,
      modelSource,
      comparisonStatus,
      hasMismatch,
      startNode: { x: startNode.x, y: startNode.y, z: startNode.z },
      endNode: { x: endNode.x, y: endNode.y, z: endNode.z },
      section: section ? convertSectionForAdapter(section) : null,
    };
  }

  // 節点
  if (elementType === 'StbNode') {
    return {
      id: elementData.id,
      modelSource,
      comparisonStatus,
      x: parseFloat(elementData.X || elementData.x || 0),
      y: parseFloat(elementData.Y || elementData.y || 0),
      z: parseFloat(elementData.Z || elementData.z || 0),
    };
  }

  // 面要素（スラブ、壁）- 簡略化実装
  if (['Slab', 'Wall'].includes(elementType)) {
    // 面要素は節点リストを持つ
    const nodeIds = elementData.nodeIds || [];
    const nodes = nodeIds
      .map((id) => {
        const node = nodeMap.get(id);
        return node ? { x: node.x, y: node.y, z: node.z } : null;
      })
      .filter((n) => n !== null);

    if (nodes.length < 3) return null;

    return {
      id: elementData.id,
      modelSource,
      comparisonStatus,
      hasMismatch,
      nodes,
    };
  }

  return null;
}

/**
 * 要素タイプから断面マップのキーを取得
 * @private
 */
function getSectionMapKey(elementType) {
  const mapping = {
    Column: 'columnSections',
    Girder: 'girderSections',
    Beam: 'beamSections',
    Brace: 'braceSections',
  };
  return mapping[elementType];
}

/**
 * 断面情報をアダプター形式に変換
 * @private
 */
function convertSectionForAdapter(section) {
  if (!section) return null;

  // 断面タイプを判定
  const sectionType = section.shape || section.type || 'RECTANGLE';

  // 基本的な断面プロパティを抽出
  const result = {
    type: sectionType.toUpperCase(),
  };

  // 矩形断面
  if (sectionType === 'RECTANGLE' || sectionType === 'RC') {
    result.width = parseFloat(section.width || section.A || 400);
    result.height = parseFloat(section.height || section.B || 400);
  }
  // H形鋼
  else if (sectionType === 'H' || sectionType === 'H-SHAPE') {
    result.type = 'H';
    result.height = parseFloat(section.A || section.height || 400);
    result.width = parseFloat(section.B || section.width || 200);
    result.tw = parseFloat(section.t1 || section.tw || 8);
    result.tf = parseFloat(section.t2 || section.tf || 13);
  }
  // 円形断面
  else if (sectionType === 'PIPE' || sectionType === 'CIRCLE') {
    result.type = 'PIPE';
    result.outerRadius = parseFloat(section.D || section.diameter || 300) / 2;
    result.thickness = parseFloat(section.t || section.thickness || 10);
  }

  return result;
}

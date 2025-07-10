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

import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";
import {
  clearSceneContent,
  createOrUpdateGridHelper,
  materials,
  elementGroups,
  SUPPORTED_ELEMENTS,
  drawNodes,
  drawLineElements,
  drawPolyElements,
  drawAxes,
  drawStories,
  clearClippingPlanes,
  adjustCameraToFitModel,
} from "./viewer/index.js";
import { loadStbXmlAutoEncoding } from "./viewer/utils/utils.js";
import {
  buildNodeMap,
  parseStories,
  parseElements,
  parseAxes,
} from "./parser/stbXmlParser.js";
import {
  compareElements,
  lineElementKeyExtractor,
  polyElementKeyExtractor,
  nodeElementKeyExtractor,
} from "./comparator.js";
import {
  setGlobalStateForUI,
  updateStorySelector,
  updateAxisSelectors,
  updateAllLabelVisibility,
} from "./ui.js";
import { initViewModes, updateModelVisibility } from "./viewModes.js";

// Refactored modules
import {
  validateAndGetFiles,
  getSelectedElementTypes,
  setLoadingState,
  validateComparisonParameters
} from "./modelLoader/fileValidation.js";
import {
  processModelDocuments,
  clearModelProcessingState
} from "./modelLoader/modelProcessing.js";
import {
  processElementComparison,
  calculateElementBounds,
  getComparisonStatistics
} from "./modelLoader/elementComparison.js";
import {
  orchestrateElementRendering,
  calculateRenderingBounds,
  getRenderingStatistics
} from "./modelLoader/renderingOrchestrator.js";
import {
  finalizeVisualization,
  handleFinalizationError,
  createFinalizationSummary
} from "./modelLoader/visualizationFinalizer.js";

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
  console.log("=== STB Model Comparison Started ===");

  // Phase 1: Validation and Input Processing
  const fileValidation = validateAndGetFiles();
  if (!fileValidation.isValid) {
    return false;
  }

  const { fileA, fileB } = fileValidation;
  const selectedElementTypes = getSelectedElementTypes();

  // Validate comparison parameters
  const paramValidation = validateComparisonParameters({
    fileA,
    fileB,
    selectedElementTypes,
    scheduleRender,
    cameraControls: { camera, controls }
  });

  if (!paramValidation.isValid) {
    console.error("Parameter validation failed:", paramValidation.errors);
    alert("パラメータ検証に失敗しました: " + paramValidation.errors.join(", "));
    return false;
  }

  // Set loading state
  setLoadingState(true);

  // Clear existing scene content
  modelBounds = clearSceneContent(elementGroups, nodeLabels);
  stories.length = 0;
  nodeMapA.clear();
  nodeMapB.clear();
  axesData = { xAxes: [], yAxes: [] };
  nodeLabels = [];
  modelADocument = null;
  modelBDocument = null;
  clearModelProcessingState();
  modelsLoaded = false;

  try {
    // Phase 2: Model Document Processing
    console.log("=== Phase 2: Model Processing ===");
    const processingResult = await processModelDocuments(fileA, fileB);
    
    if (!processingResult.success) {
      throw new Error(processingResult.error);
    }

    // Update local state with processed data
    ({
      modelADocument,
      modelBDocument,
      nodeMapA,
      nodeMapB,
      stories,
      axesData
    } = processingResult);

    // Phase 3: Element Comparison
    console.log("=== Phase 3: Element Comparison ===");
    const comparisonResult = processElementComparison(processingResult, selectedElementTypes);
    const { comparisonResults } = comparisonResult;

    // Calculate model bounds
    modelBounds = calculateElementBounds(comparisonResults, nodeMapA, nodeMapB);

    // Phase 4: 3D Rendering
    console.log("=== Phase 4: 3D Rendering ===");
    const renderingResult = orchestrateElementRendering(
      comparisonResults,
      modelBounds,
      { stories, axesData }
    );

    // Update node labels
    nodeLabels = renderingResult.nodeLabels;

    // Recalculate bounds after rendering
    modelBounds = calculateRenderingBounds(renderingResult.renderedElements, nodeMapA, nodeMapB);

    // Phase 5: Visualization Finalization
    console.log("=== Phase 5: Finalization ===");
    const finalizationData = {
      nodeLabels,
      stories,
      axesData,
      modelBounds,
      renderingStats: getRenderingStatistics(renderingResult),
      modelADocument,
      modelBDocument,
      nodeMapA,
      nodeMapB
    };

    const finalizationResult = finalizeVisualization(
      finalizationData,
      scheduleRender,
      { camera, controls }
    );

    if (!finalizationResult.success) {
      throw new Error("Visualization finalization failed: " + finalizationResult.error);
    }

    // Clear clipping planes
    console.log("Clearing clipping planes...");
    clearClippingPlanes();

    // Mark models as loaded
    modelsLoaded = true;

    // Log completion statistics
    const comparisonStats = getComparisonStatistics(comparisonResults);
    const finalizationSummary = createFinalizationSummary(finalizationData, finalizationResult.stats || {});
    
    console.log("=== Comparison Complete ===");
    console.log("Comparison Statistics:", comparisonStats);
    console.log("Finalization Summary:", finalizationSummary);

    return true;

  } catch (error) {
    console.error("Model comparison failed:", error);
    alert(`エラーが発生しました: ${error.message || "不明なエラー"}`);

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
      console.error("Error during state cleanup:", cleanupError);
    }

    return false;

  } finally {
    // Always reset loading state
    setLoadingState(false);
  }
}

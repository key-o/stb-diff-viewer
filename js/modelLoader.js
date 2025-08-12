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
  updateLabelVisibility,
} from "./ui.js";
import { initViewModes, updateModelVisibility } from "./viewModes.js";
import { setState, getState } from "./core/globalState.js";
import { JsonDisplayIntegration } from "./viewer/integration/jsonDisplayIntegration.js";
import { processJsonIntegratedModels, detectJsonIntegrationSupport } from "./modelLoader/jsonIntegration.js";

// Refactored modules
import {
  validateAndGetFiles,
  getSelectedElementTypes,
  setLoadingState,
  validateComparisonParameters,
} from "./modelLoader/fileValidation.js";
import {
  processModelDocuments,
  clearModelProcessingState,
} from "./modelLoader/modelProcessing.js";
import {
  processElementComparison,
  calculateElementBounds,
  getComparisonStatistics,
} from "./modelLoader/elementComparison.js";
import {
  orchestrateElementRendering,
  calculateRenderingBounds,
  getRenderingStatistics,
} from "./modelLoader/renderingOrchestrator.js";
import {
  finalizeVisualization,
  handleFinalizationError,
  createFinalizationSummary,
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
    
    // JSON統合処理
    if (hasJsonFiles) {
      const jsonIntegration = new JsonDisplayIntegration();
      console.log("JsonDisplayIntegration初期化完了 - ProfileBased生成器使用");
      
      // JSON統合表示システムを活用した処理
      const jsonDisplayResult = await processJsonIntegratedModels(
        fileA, fileB, isJsonFileA, isJsonFileB, jsonIntegration
      );
      
      if (jsonDisplayResult.success) {
        console.log("JSON統合処理完了 - ProfileBased表示システム使用");
        console.log(`生成統計: ${JSON.stringify(jsonDisplayResult.statistics)}`);
        
        // UI更新（必要に応じて）
        if (scheduleRender) {
          scheduleRender();
        }
        
        return jsonDisplayResult.result;
      } else {
        console.error("JSON統合処理失敗:", jsonDisplayResult.error);
        alert(`JSON統合処理エラー: ${jsonDisplayResult.error}`);
        return false;
      }
    }
    
    const processingResult = await processModelDocuments(fileA, fileB);

    if (!processingResult.success) {
      throw new Error(processingResult.error);
    }

    // Update local state with processed data
    ({ modelADocument, modelBDocument, nodeMapA, nodeMapB, stories, axesData } =
      processingResult);

    // Save model documents to global state for IFC conversion
    setState("models.documentA", modelADocument);
    setState("models.documentB", modelBDocument);
    setState("models.nodeMapA", nodeMapA);
    setState("models.nodeMapB", nodeMapB);
    setState("models.stories", stories);
    setState("models.axesData", axesData);

    console.log("Model documents saved to global state for IFC conversion");

    // Phase 3: Element Comparison
    console.log("=== Phase 3: Element Comparison ===");
    const comparisonOptions = {
      useImportanceFiltering: true,
      targetImportanceLevels: null, // null = all levels
    };
    const comparisonResult = processElementComparison(
      processingResult,
      selectedElementTypes,
      comparisonOptions
    );
    const { comparisonResults } = comparisonResult;

    // 比較結果をグローバル状態に保存
    setState("comparisonResults", comparisonResults);

    // 統計更新イベントを発行
    window.dispatchEvent(
      new CustomEvent("updateComparisonStatistics", {
        detail: {
          comparisonResults: comparisonResults,
          reason: "modelComparison",
          timestamp: new Date().toISOString(),
        },
      })
    );

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
    modelBounds = calculateRenderingBounds(
      renderingResult.renderedElements,
      nodeMapA,
      nodeMapB
    );

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
      nodeMapB,
    };

    const finalizationResult = finalizeVisualization(
      finalizationData,
      scheduleRender,
      { camera, controls }
    );

    if (!finalizationResult.success) {
      throw new Error(
        "Visualization finalization failed: " + finalizationResult.error
      );
    }

    // Clear clipping planes
    console.log("Clearing clipping planes...");
    clearClippingPlanes();

    // Mark models as loaded
    modelsLoaded = true;

    // Apply current color mode to newly loaded models
    setTimeout(() => {
      import("./colorModes.js").then(({ getCurrentColorMode, COLOR_MODES }) => {
        const currentMode = getCurrentColorMode();
        if (currentMode !== COLOR_MODES.DIFF) {
          console.log(
            `[ModelLoader] Applying current color mode: ${currentMode}`
          );
          reapplyColorMode();

          // 色付けモードが適用されたことをユーザーに通知
          const modeDisplayNames = {
            [COLOR_MODES.ELEMENT]: "部材別色付け",
            [COLOR_MODES.SCHEMA]: "スキーマエラー表示",
            [COLOR_MODES.IMPORTANCE]: "重要度別色付け",
          };
          const displayName = modeDisplayNames[currentMode] || currentMode;

          // 状況メッセージを表示
          setTimeout(() => {
            const statusElement = document.getElementById("color-mode-status");
            const textElement = document.getElementById(
              "color-mode-status-text"
            );
            if (statusElement && textElement) {
              textElement.textContent = `「${displayName}」モードを適用しました。`;
              statusElement.classList.remove("hidden");
              setTimeout(() => {
                statusElement.classList.add("hidden");
              }, 3000);
            }
          }, 500);
        }
      });
    }, 100);

    // Log completion statistics
    const comparisonStats = getComparisonStatistics(comparisonResults);
    const finalizationSummary = createFinalizationSummary(
      finalizationData,
      finalizationResult.stats || {}
    );

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

/**
 * 色付けモード変更時に全要素に新しい色付けを適用する
 */
export function reapplyColorMode() {
  console.log("[ModelLoader] Reapplying color mode to all elements");

  if (!modelsLoaded) {
    console.warn(
      "[ModelLoader] No models loaded, color mode will be applied when models are loaded"
    );
    return;
  }

  try {
    // 色付けモードを取得
    import("./colorModes.js").then(({ getCurrentColorMode, COLOR_MODES }) => {
      const currentMode = getCurrentColorMode();
      console.log(`[ModelLoader] Applying color mode: ${currentMode}`);

      // 現在のシーンの全オブジェクトに新しいマテリアルを適用
      const scene = getState("rendering.scene");
      if (!scene) {
        console.warn("[ModelLoader] Scene not available");
        return;
      }

      // 全ての要素を収集
      const objectsToUpdate = [];
      scene.traverse((object) => {
        if (object.userData && object.userData.elementType) {
          objectsToUpdate.push(object);
        }
      });

      console.log(
        `[ModelLoader] Found ${objectsToUpdate.length} objects to update`
      );

      // マテリアルを非同期で更新
      Promise.all(
        objectsToUpdate.map((object) =>
          updateObjectMaterialAsync(object, currentMode)
        )
      ).then(() => {
        // 全ての更新が完了したら再描画をリクエスト
        const scheduleRender = getState("rendering.scheduleRender");
        if (scheduleRender) {
          scheduleRender();
          console.log("[ModelLoader] All materials updated, redraw requested");
        } else {
          console.warn("[ModelLoader] scheduleRender not available");
        }
      });
    });
  } catch (error) {
    console.error("[ModelLoader] Error reapplying color mode:", error);
  }
}

/**
 * オブジェクトのマテリアルを色付けモードに応じて非同期で更新
 * @param {THREE.Object3D} object - 更新対象のオブジェクト
 * @param {string} colorMode - 色付けモード
 * @returns {Promise} 更新完了のPromise
 */
function updateObjectMaterialAsync(object, colorMode) {
  return import("./viewer/rendering/materials.js").then(
    ({ getMaterialForElementWithMode }) => {
      if (getMaterialForElementWithMode && object.userData) {
        const elementType = object.userData.elementType;
        const comparisonState = object.userData.modelSource || "matched";
        const isLine = object.userData.isLine || false;
        const isPoly = object.userData.isPoly || false;
        const elementId = object.userData.elementId || null;

        const newMaterial = getMaterialForElementWithMode(
          elementType,
          comparisonState,
          isLine,
          isPoly,
          elementId
        );

        if (newMaterial && object.material !== newMaterial) {
          object.material = newMaterial;
          console.log(
            `[ModelLoader] Updated material for ${elementType} (${elementId})`
          );
        }
      }
    }
  );
}

/**
 * オブジェクトのマテリアルを色付けモードに応じて更新
 * @param {THREE.Object3D} object - 更新対象のオブジェクト
 * @param {string} colorMode - 色付けモード
 */
function updateObjectMaterial(object, colorMode) {
  // マテリアル更新ロジックをインポートして適用
  import("./viewer/rendering/materials.js").then(
    ({ getMaterialForElementWithMode }) => {
      if (getMaterialForElementWithMode && object.userData) {
        const elementType = object.userData.elementType;
        const comparisonState = object.userData.modelSource || "matched";
        const isLine = object.userData.isLine || false;
        const isPoly = object.userData.isPoly || false;
        const elementId = object.userData.elementId || null;

        const newMaterial = getMaterialForElementWithMode(
          elementType,
          comparisonState,
          isLine,
          isPoly,
          elementId
        );

        if (newMaterial && object.material !== newMaterial) {
          object.material = newMaterial;
          console.log(
            `[ModelLoader] Updated material for ${elementType} (${elementId})`
          );
        }
      }
    }
  );
}

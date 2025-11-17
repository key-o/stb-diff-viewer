/**
 * @fileoverview 可視化最終処理モジュール
 *
 * このモジュールはモデル可視化の最終ステップを処理します：
 * - UI更新と状態同期
 * - カメラポジショニングとビューフィッティング
 * - グリッドヘルパー作成
 * - モデル可視性管理
 * - グローバル状態更新
 *
 * 保守性向上のため、巨大なcompareModels()関数から抽出されました。
 */

import {
  setGlobalStateForUI,
  updateStorySelector,
  updateAxisSelectors,
  updateLabelVisibility,
} from "../ui.js";
import { initViewModes, updateModelVisibility } from "../viewModes.js";
import {
  createOrUpdateGridHelper,
  adjustCameraToFitModel,
} from "../viewer/index.js";
import { adjustDepth2DClippingRangeFromModel } from "../ui/clipping2D.js";

/**
 * Finalize visualization after rendering completion
 * @param {Object} finalizationData - Data needed for finalization
 * @param {Function} scheduleRender - Render scheduling function
 * @param {Object} cameraControls - Camera and controls objects
 * @returns {Object} Finalization result
 */
export function finalizeVisualization(
  finalizationData,
  scheduleRender,
  cameraControls
) {
  const { nodeLabels, stories, axesData, modelBounds, renderingStats } =
    finalizationData;

  console.log("=== Starting Visualization Finalization ===");

  try {
    // Update global UI state
    updateGlobalUIState(nodeLabels, stories, axesData);

    // Update UI selectors
    updateUISelectors();

    // Update label visibility
    updateLabelDisplay();

    // Initialize view modes
    initializeViewModes(finalizationData);

    // Update model visibility based on current settings
    updateModelVisibility(scheduleRender);

    // Setup camera and grid
    setupCameraAndGrid(modelBounds, cameraControls);

    // Mark models as loaded
    setModelsLoadedState(true);

    console.log("=== Visualization Finalization Complete ===");
    console.log("Finalization statistics:", {
      totalLabels: nodeLabels.length,
      stories: stories.length,
      xAxes: axesData.xAxes.length,
      yAxes: axesData.yAxes.length,
      renderingErrors: renderingStats.errors,
    });

    return {
      success: true,
      stats: renderingStats,
    };
  } catch (error) {
    console.error("Visualization finalization failed:", error);
    return {
      success: false,
      error: error.message,
      stats: {
        totalMeshes: 0,
        totalLabels: 0,
        errors: 1,
        elementTypes: {},
      },
    };
  }
}

/**
 * Update global UI state with model data
 * @param {Array} nodeLabels - Array of node labels
 * @param {Array} stories - Array of story data
 * @param {Object} axesData - Axes data object
 */
function updateGlobalUIState(nodeLabels, stories, axesData) {
  console.log("Updating global UI state...");

  try {
    setGlobalStateForUI(nodeLabels, stories, axesData);
    console.log("Global UI state updated successfully");
  } catch (error) {
    console.error("Failed to update global UI state:", error);
    throw error;
  }
}

/**
 * Update UI selectors with current data
 */
function updateUISelectors() {
  console.log("Updating UI selectors...");

  try {
    updateStorySelector();
    updateAxisSelectors();
    console.log("UI selectors updated successfully");
  } catch (error) {
    console.error("Failed to update UI selectors:", error);
    throw error;
  }
}

/**
 * Update label display visibility
 */
function updateLabelDisplay() {
  console.log("Updating label visibility...");

  try {
    updateLabelVisibility();
    console.log("Label visibility updated successfully");
  } catch (error) {
    console.error("Failed to update label visibility:", error);
    throw error;
  }
}

/**
 * Initialize view modes with model data
 * @param {Object} modelData - Complete model data
 */
function initializeViewModes(modelData) {
  console.log("Initializing view modes...");

  try {
    initViewModes(modelData);
    console.log("View modes initialized successfully");
  } catch (error) {
    console.error("Failed to initialize view modes:", error);
    throw error;
  }
}

/**
 * Setup camera positioning and grid helper
 * @param {THREE.Box3} modelBounds - Model bounding box
 * @param {Object} cameraControls - Camera and controls objects
 */
function setupCameraAndGrid(modelBounds, cameraControls) {
  console.log("Setting up camera and grid...");

  try {
    // Create or update grid helper
    createOrUpdateGridHelper(modelBounds);
    console.log("Grid helper updated");

    // Adjust camera to fit model
    if (cameraControls && cameraControls.camera && cameraControls.controls) {
      adjustCameraToFitModel(
        modelBounds,
        cameraControls.camera,
        cameraControls.controls
      );
      console.log("Camera adjusted to fit model");
    } else {
      console.warn("Camera controls not available for fitting");
    }

    // Adjust 2D depth clipping range based on model bounds
    adjustDepth2DClippingRangeFromModel(modelBounds);
    console.log("2D depth clipping range adjusted to model bounds");
  } catch (error) {
    console.error("Failed to setup camera and grid:", error);
    throw error;
  }
}

/**
 * Set global models loaded state
 * @param {boolean} loaded - Whether models are loaded
 */
function setModelsLoadedState(loaded) {
  // This would typically update a global state manager
  // For now, we'll use the existing pattern
  console.log(`Models loaded state set to: ${loaded}`);
}

/**
 * Handle finalization errors and cleanup
 * @param {Error} error - Error that occurred
 * @param {Object} cleanupData - Data needed for cleanup
 */
export function handleFinalizationError(error, cleanupData) {
  console.error("Finalization error occurred:", error);

  try {
    // Reset UI state
    setGlobalStateForUI([], [], { xAxes: [], yAxes: [] });

    // Clear selectors
    updateStorySelector();
    updateAxisSelectors();

    // Set models as not loaded
    setModelsLoadedState(false);

    console.log("Cleanup completed after finalization error");
  } catch (cleanupError) {
    console.error("Error during cleanup:", cleanupError);
  }
}

/**
 * Create finalization summary
 * @param {Object} modelData - Complete model data
 * @param {Object} renderingStats - Rendering statistics
 * @returns {Object} Summary object
 */
export function createFinalizationSummary(modelData, renderingStats) {
  // Safely extract data with defaults
  const {
    modelADocument = null,
    modelBDocument = null,
    nodeMapA = new Map(),
    nodeMapB = new Map(),
    stories = [],
    axesData = { xAxes: [], yAxes: [] },
    nodeLabels = [],
  } = modelData || {};

  // Safely extract rendering stats with defaults
  const {
    totalMeshes = 0,
    totalLabels = 0,
    errors = 0,
    elementTypes = {},
  } = renderingStats || {};

  return {
    models: {
      hasModelA: !!modelADocument,
      hasModelB: !!modelBDocument,
      nodesA: nodeMapA ? nodeMapA.size : 0,
      nodesB: nodeMapB ? nodeMapB.size : 0,
    },
    structure: {
      stories: stories ? stories.length : 0,
      xAxes: axesData && axesData.xAxes ? axesData.xAxes.length : 0,
      yAxes: axesData && axesData.yAxes ? axesData.yAxes.length : 0,
      labels: nodeLabels ? nodeLabels.length : 0,
    },
    rendering: {
      totalMeshes,
      totalLabels,
      errors,
      elementTypes: elementTypes ? Object.keys(elementTypes).length : 0,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Validate finalization data before processing
 * @param {Object} finalizationData - Data to validate
 * @returns {Object} Validation result
 */
export function validateFinalizationData(finalizationData) {
  const validation = {
    isValid: true,
    errors: [],
    warnings: [],
  };

  const requiredFields = [
    "nodeLabels",
    "stories",
    "axesData",
    "modelBounds",
    "renderingStats",
  ];

  for (const field of requiredFields) {
    if (!finalizationData.hasOwnProperty(field)) {
      validation.isValid = false;
      validation.errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate specific field types
  if (
    finalizationData.nodeLabels &&
    !Array.isArray(finalizationData.nodeLabels)
  ) {
    validation.errors.push("nodeLabels must be an array");
    validation.isValid = false;
  }

  if (finalizationData.stories && !Array.isArray(finalizationData.stories)) {
    validation.errors.push("stories must be an array");
    validation.isValid = false;
  }

  if (
    finalizationData.axesData &&
    typeof finalizationData.axesData !== "object"
  ) {
    validation.errors.push("axesData must be an object");
    validation.isValid = false;
  }

  // Warnings for potentially problematic data
  if (finalizationData.nodeLabels && finalizationData.nodeLabels.length === 0) {
    validation.warnings.push("No node labels found");
  }

  if (
    finalizationData.renderingStats &&
    finalizationData.renderingStats.errors > 0
  ) {
    validation.warnings.push(
      `${finalizationData.renderingStats.errors} rendering errors occurred`
    );
  }

  return validation;
}

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

import { createLogger } from '../utils/logger.js';

const logger = createLogger('modelLoader:finalizer');

import {
  setGlobalStateForUI,
  updateStorySelector,
  updateAxisSelectors,
  updateLabelVisibility,
} from '../ui/index.js';
import { initViewModes, updateModelVisibility } from '../app/viewModes.js';
import { createOrUpdateGridHelper, setView, VIEW_DIRECTIONS } from '../viewer/index.js';
import { setColorMode, COLOR_MODES } from '../colorModes/index.js';
import { eventBus, ModelEvents } from '../app/events/index.js';
import { redrawAxesAtStory } from '../ui/events/index.js';

/**
 * Finalize visualization after rendering completion
 * @param {Object} finalizationData - Data needed for finalization
 * @param {Function} scheduleRender - Render scheduling function
 * @param {Object} cameraControls - Camera and controls objects
 * @returns {Object} Finalization result
 */
export function finalizeVisualization(finalizationData, scheduleRender, cameraControls) {
  const {
    nodeLabels,
    stories,
    axesData,
    modelBounds,
    renderingStats,
    modelADocument,
    modelBDocument,
  } = finalizationData;

  try {
    // Update global UI state
    updateGlobalUIState(nodeLabels, stories, axesData);

    // Update UI selectors
    updateUISelectors();

    // Update label visibility
    updateLabelDisplay();

    // Set appropriate color mode BEFORE initializing view modes
    // This ensures the correct color mode is used when elements are redrawn
    const hasBothModels = !!modelADocument && !!modelBDocument;
    const targetColorMode = hasBothModels ? COLOR_MODES.DIFF : COLOR_MODES.ELEMENT;
    setColorMode(targetColorMode);

    // Initialize view modes
    initializeViewModes(finalizationData, scheduleRender);

    // Update model visibility based on current settings
    updateModelVisibility(scheduleRender);

    // Setup camera and grid
    setupCameraAndGrid(modelBounds, cameraControls);

    // 通り芯を最終的なmodelBoundsで再描画
    // 初期描画時は構造要素が追加される前のmodelBoundsを使用しているため、
    // 全ての構造要素が追加された後に再描画する必要がある
    redrawAxesAtStory('all');
    logger.info('Axes redrawn with final model bounds');

    // Mark models as loaded
    setModelsLoadedState(true);

    return {
      success: true,
      stats: renderingStats,
    };
  } catch (error) {
    logger.error('Visualization finalization failed:', error);
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
  try {
    setGlobalStateForUI(nodeLabels, stories, axesData);
  } catch (error) {
    logger.error('Failed to update global UI state:', error);
    throw error;
  }
}

/**
 * Update UI selectors with current data
 */
function updateUISelectors() {
  try {
    updateStorySelector();
    updateAxisSelectors();
  } catch (error) {
    logger.error('Failed to update UI selectors:', error);
    throw error;
  }
}

/**
 * Update label display visibility
 */
function updateLabelDisplay() {
  try {
    updateLabelVisibility();
  } catch (error) {
    logger.error('Failed to update label visibility:', error);
    throw error;
  }
}

/**
 * Initialize view modes with model data
 * @param {Object} modelData - Complete model data
 * @param {Function} scheduleRender - Render scheduling function
 */
function initializeViewModes(modelData, scheduleRender) {
  try {
    initViewModes(modelData, scheduleRender);
  } catch (error) {
    logger.error('Failed to initialize view modes:', error);
    throw error;
  }
}

/**
 * Setup camera positioning and grid helper
 * @param {THREE.Box3} modelBounds - Model bounding box
 * @param {Object} cameraControls - Camera and controls objects
 */
function setupCameraAndGrid(modelBounds, cameraControls) {
  try {
    // グリッドヘルパーを更新
    createOrUpdateGridHelper(modelBounds);

    // カメラを「左前斜め上」のISOMETRIC角度に統一
    setView(VIEW_DIRECTIONS.ISOMETRIC, modelBounds, false);

    // Adjust 2D depth clipping range based on model bounds (via event)
    eventBus.emit(ModelEvents.BOUNDS_UPDATED, { modelBounds });
  } catch (error) {
    logger.error('Failed to setup camera and grid:', error);
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
}

/**
 * Handle finalization errors and cleanup
 * @param {Error} error - Error that occurred
 * @param {Object} cleanupData - Data needed for cleanup
 */
export function handleFinalizationError(error, cleanupData) {
  logger.error('Finalization error occurred:', error);

  try {
    // Reset UI state
    setGlobalStateForUI([], [], { xAxes: [], yAxes: [] });

    // Clear selectors
    updateStorySelector();
    updateAxisSelectors();

    // Set models as not loaded
    setModelsLoadedState(false);
  } catch (cleanupError) {
    logger.error('Error during cleanup:', cleanupError);
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
  const { totalMeshes = 0, totalLabels = 0, errors = 0, elementTypes = {} } = renderingStats || {};

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

  const requiredFields = ['nodeLabels', 'stories', 'axesData', 'modelBounds', 'renderingStats'];

  for (const field of requiredFields) {
    if (!finalizationData.hasOwnProperty(field)) {
      validation.isValid = false;
      validation.errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate specific field types
  if (finalizationData.nodeLabels && !Array.isArray(finalizationData.nodeLabels)) {
    validation.errors.push('nodeLabels must be an array');
    validation.isValid = false;
  }

  if (finalizationData.stories && !Array.isArray(finalizationData.stories)) {
    validation.errors.push('stories must be an array');
    validation.isValid = false;
  }

  if (finalizationData.axesData && typeof finalizationData.axesData !== 'object') {
    validation.errors.push('axesData must be an object');
    validation.isValid = false;
  }

  // Warnings for potentially problematic data
  if (finalizationData.nodeLabels && finalizationData.nodeLabels.length === 0) {
    validation.warnings.push('No node labels found');
  }

  if (finalizationData.renderingStats && finalizationData.renderingStats.errors > 0) {
    validation.warnings.push(`${finalizationData.renderingStats.errors} rendering errors occurred`);
  }

  return validation;
}

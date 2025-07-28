/**
 * @fileoverview UI event handling module
 *
 * This module manages UI event listeners and interactions:
 * - Event listener setup and management
 * - UI interaction handling
 * - Event delegation and coordination
 * - Model visibility toggle handling
 *
 * Split from the large ui.js module for better organization.
 */

import { updateAllLabelVisibility } from "./labelManager.js";
import { applyStoryClip, applyAxisClip } from "./clipping.js";
import { setImportanceState, getImportanceState } from "../core/globalState.js";

// --- UI Element References ---
const toggleModelACheckbox = document.getElementById("toggleModelA");
const toggleModelBCheckbox = document.getElementById("toggleModelB");
const legendPanel = document.getElementById("legendPanel");

// --- 重要度関連イベント定数 ---
export const IMPORTANCE_EVENTS = {
  RATING_CHANGED: 'importance:ratingChanged',
  MODE_SWITCHED: 'importance:modeSwitched',
  FILTER_UPDATED: 'importance:filterUpdated',
  SETTINGS_LOADED: 'importance:settingsLoaded',
  EVALUATION_COMPLETE: 'importance:evaluationComplete',
  EVALUATION_STARTED: 'importance:evaluationStarted',
  LEVEL_CHANGED: 'importance:levelChanged'
};

/**
 * Setup all UI event listeners
 */
export function setupUIEventListeners() {
  console.log("Setting up UI event listeners...");

  try {
    setupModelVisibilityListeners();
    setupSelectorChangeListeners();
    setupLegendToggleListener();
    setupKeyboardShortcuts();
    setupWindowResizeListener();
    setupImportanceEventListeners();
    
    console.log("UI event listeners setup completed");
  } catch (error) {
    console.error("Error setting up UI event listeners:", error);
  }
}

/**
 * Setup model visibility toggle listeners
 */
function setupModelVisibilityListeners() {
  if (toggleModelACheckbox) {
    toggleModelACheckbox.addEventListener("change", handleModelAToggle);
    console.log("Model A toggle listener setup");
  } else {
    console.warn("Model A toggle checkbox not found");
  }

  if (toggleModelBCheckbox) {
    toggleModelBCheckbox.addEventListener("change", handleModelBToggle);
    console.log("Model B toggle listener setup");
  } else {
    console.warn("Model B toggle checkbox not found");
  }
}

/**
 * Setup selector change listeners
 */
function setupSelectorChangeListeners() {
  const storySelector = document.getElementById("storySelector");
  const xAxisSelector = document.getElementById("xAxisSelector");
  const yAxisSelector = document.getElementById("yAxisSelector");

  if (storySelector) {
    storySelector.addEventListener("change", handleStorySelectionChange);
    console.log("Story selector listener setup");
  }

  if (xAxisSelector) {
    xAxisSelector.addEventListener("change", handleXAxisSelectionChange);
    console.log("X-axis selector listener setup");
  }

  if (yAxisSelector) {
    yAxisSelector.addEventListener("change", handleYAxisSelectionChange);
    console.log("Y-axis selector listener setup");
  }
}

/**
 * Setup legend toggle listener
 */
function setupLegendToggleListener() {
  const toggleLegendBtn = document.getElementById("toggleLegendBtn");
  
  if (toggleLegendBtn) {
    toggleLegendBtn.addEventListener("click", handleLegendToggle);
    console.log("Legend toggle listener setup");
  }
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
  document.addEventListener("keydown", handleKeyboardShortcuts);
  console.log("Keyboard shortcuts setup");
}

/**
 * Setup window resize listener for responsive UI
 */
function setupWindowResizeListener() {
  window.addEventListener("resize", handleWindowResize);
  console.log("Window resize listener setup");
}

/**
 * Setup importance-related event listeners
 */
export function setupImportanceEventListeners() {
  document.addEventListener(IMPORTANCE_EVENTS.RATING_CHANGED, handleRatingChange);
  document.addEventListener(IMPORTANCE_EVENTS.MODE_SWITCHED, handleModeSwitch);
  document.addEventListener(IMPORTANCE_EVENTS.FILTER_UPDATED, handleFilterUpdate);
  document.addEventListener(IMPORTANCE_EVENTS.SETTINGS_LOADED, handleSettingsLoaded);
  document.addEventListener(IMPORTANCE_EVENTS.EVALUATION_COMPLETE, handleEvaluationComplete);
  document.addEventListener(IMPORTANCE_EVENTS.EVALUATION_STARTED, handleEvaluationStarted);
  document.addEventListener(IMPORTANCE_EVENTS.LEVEL_CHANGED, handleLevelChanged);
  
  console.log("Importance event listeners setup completed");
}

// --- Event Handlers ---

/**
 * Handle Model A visibility toggle
 * @param {Event} event - Change event
 */
function handleModelAToggle(event) {
  const isVisible = event.target.checked;
  console.log(`Model A visibility toggled: ${isVisible}`);
  
  // Trigger model visibility update through view modes
  if (typeof window.setModelVisibility === 'function') {
    window.setModelVisibility('A', isVisible, window.requestRender);
  } else {
    console.warn("setModelVisibility function not available");
  }
}

/**
 * Handle Model B visibility toggle
 * @param {Event} event - Change event
 */
function handleModelBToggle(event) {
  const isVisible = event.target.checked;
  console.log(`Model B visibility toggled: ${isVisible}`);
  
  // Trigger model visibility update through view modes
  if (typeof window.setModelVisibility === 'function') {
    window.setModelVisibility('B', isVisible, window.requestRender);
  } else {
    console.warn("setModelVisibility function not available");
  }
}

/**
 * Handle story selection change
 * @param {Event} event - Change event
 */
function handleStorySelectionChange(event) {
  const selectedStoryId = event.target.value;
  console.log(`Story selection changed: ${selectedStoryId}`);
  
  // Apply story clipping if not "all"
  if (selectedStoryId !== "all") {
    applyStoryClip(selectedStoryId);
  }
  
  // Update label visibility
  updateAllLabelVisibility();
  
  // Request render update
  if (typeof window.requestRender === 'function') {
    window.requestRender();
  }
}

/**
 * Handle X-axis selection change
 * @param {Event} event - Change event
 */
function handleXAxisSelectionChange(event) {
  const selectedAxisId = event.target.value;
  console.log(`X-axis selection changed: ${selectedAxisId}`);
  
  // Apply axis clipping if not "all"
  if (selectedAxisId !== "all") {
    applyAxisClip("X", selectedAxisId);
  }
  
  // Update label visibility
  updateAllLabelVisibility();
  
  // Request render update
  if (typeof window.requestRender === 'function') {
    window.requestRender();
  }
}

/**
 * Handle Y-axis selection change
 * @param {Event} event - Change event
 */
function handleYAxisSelectionChange(event) {
  const selectedAxisId = event.target.value;
  console.log(`Y-axis selection changed: ${selectedAxisId}`);
  
  // Apply axis clipping if not "all"
  if (selectedAxisId !== "all") {
    applyAxisClip("Y", selectedAxisId);
  }
  
  // Update label visibility
  updateAllLabelVisibility();
  
  // Request render update
  if (typeof window.requestRender === 'function') {
    window.requestRender();
  }
}

/**
 * Handle legend toggle
 * @param {Event} event - Click event
 */
function handleLegendToggle(event) {
  event.preventDefault();
  toggleLegend();
}

/**
 * Handle keyboard shortcuts
 * @param {KeyboardEvent} event - Keyboard event
 */
function handleKeyboardShortcuts(event) {
  // Only handle shortcuts when not typing in inputs
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
    return;
  }

  switch (event.key.toLowerCase()) {
    case 'l':
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        toggleLegend();
      }
      break;
      
    case '1':
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        toggleModelAVisibility();
      }
      break;
      
    case '2':
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        toggleModelBVisibility();
      }
      break;
      
    case 'r':
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        resetAllSelectors();
      }
      break;
  }
}

/**
 * Handle window resize
 * @param {Event} event - Resize event
 */
function handleWindowResize(event) {
  // Debounce resize handling
  clearTimeout(window.resizeTimeout);
  window.resizeTimeout = setTimeout(() => {
    console.log("Window resized, updating UI layout");
    // Could trigger layout updates here if needed
  }, 250);
}

// --- Helper Functions ---

/**
 * Toggle Model A visibility programmatically
 */
export function toggleModelAVisibility() {
  if (toggleModelACheckbox) {
    toggleModelACheckbox.checked = !toggleModelACheckbox.checked;
    toggleModelACheckbox.dispatchEvent(new Event('change'));
  }
}

/**
 * Toggle Model B visibility programmatically
 */
export function toggleModelBVisibility() {
  if (toggleModelBCheckbox) {
    toggleModelBCheckbox.checked = !toggleModelBCheckbox.checked;
    toggleModelBCheckbox.dispatchEvent(new Event('change'));
  }
}

/**
 * Toggle legend visibility
 */
export function toggleLegend() {
  if (!legendPanel) {
    console.warn("Legend panel element not found");
    return;
  }

  const isCurrentlyVisible = legendPanel.style.display !== "none";
  
  if (isCurrentlyVisible) {
    legendPanel.style.display = "none";
    console.log("Legend hidden");
  } else {
    legendPanel.style.display = "block";
    console.log("Legend shown");
  }

  // Update toggle button text if it exists
  const toggleBtn = document.getElementById("toggleLegendBtn");
  if (toggleBtn) {
    toggleBtn.textContent = isCurrentlyVisible ? "凡例を表示" : "凡例を非表示";
  }
}

/**
 * Reset all selectors to default values
 */
export function resetAllSelectors() {
  const storySelector = document.getElementById("storySelector");
  const xAxisSelector = document.getElementById("xAxisSelector");
  const yAxisSelector = document.getElementById("yAxisSelector");

  if (storySelector) storySelector.value = "all";
  if (xAxisSelector) xAxisSelector.value = "all";
  if (yAxisSelector) yAxisSelector.value = "all";

  // Clear clipping planes
  if (typeof window.clearClippingPlanes === 'function') {
    window.clearClippingPlanes();
  }

  // Update label visibility
  updateAllLabelVisibility();

  // Request render update
  if (typeof window.requestRender === 'function') {
    window.requestRender();
  }

  console.log("All selectors reset to default values");
}

// --- 重要度イベントハンドラー ---

/**
 * 重要度評価の変更を処理
 * @param {CustomEvent} event - 重要度変更イベント
 */
function handleRatingChange(event) {
  const { elementPath, newRating, oldRating } = event.detail;
  console.log(`Rating changed for ${elementPath}: ${oldRating} -> ${newRating}`);
  
  // 状態更新
  const elementRatings = getImportanceState('elementRatings') || new Map();
  elementRatings.set(elementPath, newRating);
  setImportanceState('elementRatings', elementRatings);
  
  // UI更新
  updateElementVisuals(elementPath, newRating);
  
  // レンダリング要求
  if (typeof window.requestRender === 'function') {
    window.requestRender();
  }
}

/**
 * 重要度表示モードの切り替えを処理
 * @param {CustomEvent} event - モード切り替えイベント
 */
function handleModeSwitch(event) {
  const { newMode, oldMode } = event.detail;
  console.log(`Importance mode switched: ${oldMode} -> ${newMode}`);
  
  setImportanceState('currentMode', newMode);
  applyImportanceMode(newMode);
  
  // レンダリング要求
  if (typeof window.requestRender === 'function') {
    window.requestRender();
  }
}

/**
 * 重要度フィルターの更新を処理
 * @param {CustomEvent} event - フィルター更新イベント
 */
function handleFilterUpdate(event) {
  const { filters } = event.detail;
  console.log(`Importance filters updated:`, filters);
  
  setImportanceState('displayFilters', filters);
  applyImportanceFilters(filters);
  
  // レンダリング要求
  if (typeof window.requestRender === 'function') {
    window.requestRender();
  }
}

/**
 * 重要度設定の読み込み完了を処理
 * @param {CustomEvent} event - 設定読み込みイベント
 */
function handleSettingsLoaded(event) {
  const { settings, source } = event.detail;
  console.log(`Importance settings loaded from ${source}:`, settings);
  
  // 設定を状態に反映
  if (settings.elementRatings) {
    setImportanceState('elementRatings', settings.elementRatings);
  }
  
  if (settings.displayFilters) {
    setImportanceState('displayFilters', settings.displayFilters);
  }
  
  if (settings.currentMode) {
    setImportanceState('currentMode', settings.currentMode);
  }
  
  // UI更新
  updateImportanceUI();
}

/**
 * 重要度評価の開始を処理
 * @param {CustomEvent} event - 評価開始イベント
 */
function handleEvaluationStarted(event) {
  const { elementCount } = event.detail;
  console.log(`Importance evaluation started for ${elementCount} elements`);
  
  setImportanceState('evaluationInProgress', true);
  setImportanceState('lastEvaluationTime', Date.now());
  
  // 進捗表示の開始
  showEvaluationProgress(true);
}

/**
 * 重要度評価の完了を処理
 * @param {CustomEvent} event - 評価完了イベント
 */
function handleEvaluationComplete(event) {
  const { results, metrics } = event.detail;
  console.log(`Importance evaluation completed:`, { results, metrics });
  
  setImportanceState('evaluationInProgress', false);
  setImportanceState('elementRatings', results);
  
  // 進捗表示の終了
  showEvaluationProgress(false);
  
  // 結果の適用
  applyEvaluationResults(results);
  
  // レンダリング要求
  if (typeof window.requestRender === 'function') {
    window.requestRender();
  }
}

/**
 * 重要度レベルの変更を処理
 * @param {CustomEvent} event - レベル変更イベント
 */
function handleLevelChanged(event) {
  const { elementPath, newLevel, oldLevel } = event.detail;
  console.log(`Importance level changed for ${elementPath}: ${oldLevel} -> ${newLevel}`);
  
  // 重要度変更イベントを発行
  const ratingChangeEvent = new CustomEvent(IMPORTANCE_EVENTS.RATING_CHANGED, {
    detail: {
      elementPath,
      newRating: newLevel,
      oldRating: oldLevel
    }
  });
  document.dispatchEvent(ratingChangeEvent);
}

// --- 重要度処理関数 ---

/**
 * 要素の視覚的表示を更新
 * @param {string} elementPath - 要素パス
 * @param {string} rating - 新しい重要度
 */
function updateElementVisuals(elementPath, rating) {
  // TODO: 実際の要素表示更新ロジックを実装
  // 現時点では重要度に基づく色変更のプレースホルダー
  console.log(`Updating visual for ${elementPath} with rating ${rating}`);
}

/**
 * 重要度モードを適用
 * @param {string} mode - 適用する重要度モード
 */
function applyImportanceMode(mode) {
  // TODO: 重要度モード適用ロジックを実装
  console.log(`Applying importance mode: ${mode}`);
}

/**
 * 重要度フィルターを適用
 * @param {Array<string>} filters - 適用するフィルター
 */
function applyImportanceFilters(filters) {
  // TODO: フィルター適用ロジックを実装
  console.log(`Applying importance filters:`, filters);
}

/**
 * 重要度UIを更新
 */
function updateImportanceUI() {
  // TODO: UI更新ロジックを実装
  console.log('Updating importance UI');
}

/**
 * 評価進捗表示の制御
 * @param {boolean} show - 表示するかどうか
 */
function showEvaluationProgress(show) {
  // TODO: 進捗表示ロジックを実装
  console.log(`Evaluation progress display: ${show ? 'shown' : 'hidden'}`);
}

/**
 * 評価結果を適用
 * @param {Map} results - 評価結果
 */
function applyEvaluationResults(results) {
  // TODO: 結果適用ロジックを実装
  console.log('Applying evaluation results:', results);
}

/**
 * Get current UI event listener status
 * @returns {Object} Event listener status
 */
export function getEventListenerStatus() {
  return {
    modelAToggle: !!toggleModelACheckbox,
    modelBToggle: !!toggleModelBCheckbox,
    legendPanel: !!legendPanel,
    storySelector: !!document.getElementById("storySelector"),
    xAxisSelector: !!document.getElementById("xAxisSelector"),
    yAxisSelector: !!document.getElementById("yAxisSelector"),
    toggleLegendBtn: !!document.getElementById("toggleLegendBtn"),
    importanceEventsSetup: true
  };
}
/**
 * @fileoverview UI状態管理モジュール
 *
 * このモジュールはSTB Diff ViewerのグローバルUI状態を管理します：
 * - グローバルラベル保存と管理
 * - 階データ追跡
 * - 軸データ追跡
 * - モジュール間の状態同期
 *
 * より良い整理のため、大きなui.jsモジュールから分割されました。
 */

// --- Global UI State ---
let allLabels = []; // All label objects
let currentStories = []; // Current story information
let currentAxesData = { xAxes: [], yAxes: [] }; // Current axis information

/**
 * Set/update global state used by UI module
 * @param {Array} labels - Array of all label objects
 * @param {Array} stories - Array of story information
 * @param {Object} axesData - Axis information object
 */
export function setGlobalStateForUI(labels, stories, axesData) {
  allLabels = labels || [];
  currentStories = stories || [];
  currentAxesData = axesData || { xAxes: [], yAxes: [] };

  // Trigger state change notification
  notifyStateChange();
}

/**
 * Get current global UI state
 * @returns {Object} Current UI state
 */
export function getGlobalUIState() {
  return {
    allLabels: [...allLabels],
    currentStories: [...currentStories],
    currentAxesData: {
      xAxes: [...currentAxesData.xAxes],
      yAxes: [...currentAxesData.yAxes],
    },
  };
}

/**
 * Get all labels
 * @returns {Array} Array of all label objects
 */
export function getAllLabels() {
  return allLabels;
}

/**
 * Set all labels (replace existing labels)
 * @param {Array} labels - Array of label objects to set
 */
export function setAllLabels(labels) {
  allLabels = labels || [];
  notifyStateChange();
}

/**
 * Get current stories
 * @returns {Array} Array of story data
 */
export function getCurrentStories() {
  return currentStories;
}

/**
 * Get current axes data
 * @returns {Object} Axes data object
 */
export function getCurrentAxesData() {
  return currentAxesData;
}

/**
 * Remove labels for a specific element type
 * @param {string} elementType - Element type to remove labels for
 */
export function removeLabelsForElementType(elementType) {
  allLabels = allLabels.filter(
    (label) => !label.userData || label.userData.elementType !== elementType,
  );
  notifyStateChange();
}

/**
 * Add labels to global state
 * @param {Array} labels - Labels to add
 */
export function addLabelsToGlobalState(labels) {
  if (Array.isArray(labels) && labels.length > 0) {
    allLabels.push(...labels);
    notifyStateChange();
  }
}

/**
 * Clear all UI state
 */
export function clearUIState() {
  allLabels = [];
  currentStories = [];
  currentAxesData = { xAxes: [], yAxes: [] };
  notifyStateChange();
}

/**
 * Update stories data
 * @param {Array} stories - New stories data
 */
export function updateStoriesData(stories) {
  currentStories = stories || [];
  notifyStateChange();
}

/**
 * Update axes data
 * @param {Object} axesData - New axes data
 */
export function updateAxesData(axesData) {
  currentAxesData = axesData || { xAxes: [], yAxes: [] };
  notifyStateChange();
}

// --- State Change Notification System ---
const stateChangeListeners = new Set();

/**
 * Add a listener for state changes
 * @param {Function} listener - Function to call when state changes
 */
export function addStateChangeListener(listener) {
  stateChangeListeners.add(listener);
}

/**
 * Remove a state change listener
 * @param {Function} listener - Listener to remove
 */
export function removeStateChangeListener(listener) {
  stateChangeListeners.delete(listener);
}

/**
 * Notify all listeners of state change
 */
function notifyStateChange() {
  const currentState = getGlobalUIState();
  stateChangeListeners.forEach((listener) => {
    try {
      listener(currentState);
    } catch (error) {
      console.error('Error in state change listener:', error);
    }
  });
}

/**
 * Get state statistics for debugging
 * @returns {Object} State statistics
 */
export function getStateStatistics() {
  return {
    labelCount: allLabels.length,
    storyCount: currentStories.length,
    xAxisCount: currentAxesData.xAxes.length,
    yAxisCount: currentAxesData.yAxes.length,
    listenerCount: stateChangeListeners.size,
    memoryUsage: {
      labelsMemory: allLabels.length * 64, // Rough estimate
      storiesMemory: currentStories.length * 128,
      axesMemory: (currentAxesData.xAxes.length + currentAxesData.yAxes.length) * 64,
    },
  };
}

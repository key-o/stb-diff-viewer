/**
 * @fileoverview UI coordination module (v2.0)
 *
 * This module serves as the main coordination point for UI functionality:
 * - Exports functions from specialized UI modules
 * - Coordinates interaction between UI modules
 * - Provides a unified interface for UI operations
 *
 * The original 620-line ui.js has been split into focused modules:
 * - ui/state.js - Global state management
 * - ui/selectors.js - Story/axis selector management
 * - ui/unifiedLabelManager.js - Unified label management
 * - ui/events.js - Event listener setup and handling
 * - ui/clipping.js - Clipping plane operations
 */

// Export functions from specialized modules
export {
  setGlobalStateForUI,
  getGlobalUIState,
  getAllLabels,
  getCurrentStories,
  getCurrentAxesData,
  removeLabelsForElementType,
  addLabelsToGlobalState,
  clearUIState,
  updateStoriesData,
  updateAxesData,
  addStateChangeListener,
  removeStateChangeListener,
  getStateStatistics,
} from "./ui/state.js";

export {
  updateStorySelector,
  updateAxisSelectors,
  getCurrentStorySelection,
  getCurrentXAxisSelection,
  getCurrentYAxisSelection,
  setStorySelection,
  setXAxisSelection,
  setYAxisSelection,
  resetSelectorsToDefault,
  getSelectorStatistics,
  validateSelectorElements,
} from "./ui/selectors.js";

import { updateLabelVisibility } from "./ui/unifiedLabelManager.js";
export { updateLabelVisibility };

export {
  setupUIEventListeners,
  toggleModelAVisibility,
  toggleModelBVisibility,
  toggleLegend,
  resetAllSelectors,
  getEventListenerStatus,
} from "./ui/events.js";

export {
  applyStoryClip,
  applyAxisClip,
  clearAllClippingPlanes,
  getClippingStatus,
  applyCustomClippingPlanes,
  createClippingPlaneFromPointAndNormal,
  createBoxClippingPlanes,
  getCurrentClippingState,
  updateClippingRange,
  restoreCameraView,
} from "./ui/clipping.js";

/**
 * Initialize all UI modules
 * This function coordinates the initialization of all UI sub-modules
 */
export function initializeUI() {
  console.log("Initializing UI modules...");

  try {
    // Validate that required DOM elements exist
    const validation = validateSelectorElements();
    if (!validation.isValid) {
      console.warn("Some UI elements are missing:", validation.missing);
    }

    // Setup event listeners
    setupUIEventListeners();

    // Initialize state change coordination
    initializeStateChangeCoordination();

    console.log("UI modules initialized successfully");
    return true;
  } catch (error) {
    console.error("Failed to initialize UI modules:", error);
    return false;
  }
}

/**
 * Setup coordination between UI modules
 */
function initializeStateChangeCoordination() {
  // Listen for state changes and coordinate updates between modules
  addStateChangeListener((newState) => {
    console.log("UI state changed, coordinating module updates");

    // Trigger label visibility update when state changes
    updateLabelVisibility();

    // Could add other coordination logic here
  });
}

/**
 * Get comprehensive UI status for debugging
 * @returns {Object} Complete UI status
 */
export function getUIStatus() {
  return {
    state: getStateStatistics(),
    selectors: getSelectorStatistics(),
    labels: getLabelVisibilityStatistics(),
    events: getEventListenerStatus(),
    clipping: getClippingStatus(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Reset all UI modules to default state
 */
export function resetAllUI() {
  console.log("Resetting all UI modules to default state");

  try {
    // Clear state
    clearUIState();

    // Reset selectors
    resetSelectorsToDefault();

    // Clear clipping
    clearAllClippingPlanes();

    // Hide all labels initially
    // Labels will be hidden automatically by the unified manager

    console.log("All UI modules reset successfully");
  } catch (error) {
    console.error("Error resetting UI modules:", error);
  }
}

// Import validation and other utilities
import { validateSelectorElements } from "./ui/selectors.js";
import { setupUIEventListeners } from "./ui/events.js";

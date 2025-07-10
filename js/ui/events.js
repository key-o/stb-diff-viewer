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

// --- UI Element References ---
const toggleModelACheckbox = document.getElementById("toggleModelA");
const toggleModelBCheckbox = document.getElementById("toggleModelB");
const legendPanel = document.getElementById("legendPanel");

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
    toggleLegendBtn: !!document.getElementById("toggleLegendBtn")
  };
}
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

import { updateLabelVisibility } from "./unifiedLabelManager.js";
import {
  applyStoryClip,
  applyAxisClip,
  updateClippingRange,
  clearAllClippingPlanes,
} from "./clipping.js";
import { setState } from "../core/globalState.js";

// --- UI Element References ---
const toggleModelACheckbox = document.getElementById("toggleModelA");
const toggleModelBCheckbox = document.getElementById("toggleModelB");
const legendPanel = document.getElementById("legendPanel");

// --- 重要度関連イベント定数 ---
export const IMPORTANCE_EVENTS = {
  RATING_CHANGED: "importance:ratingChanged",
  MODE_SWITCHED: "importance:modeSwitched",
  FILTER_UPDATED: "importance:filterUpdated",
  SETTINGS_LOADED: "importance:settingsLoaded",
  EVALUATION_COMPLETE: "importance:evaluationComplete",
  EVALUATION_STARTED: "importance:evaluationStarted",
  LEVEL_CHANGED: "importance:levelChanged",
};

/**
 * Setup all UI event listeners
 */
export function setupUIEventListeners() {
  console.log("Setting up UI event listeners...");

  try {
    setupModelVisibilityListeners();
    setupSelectorChangeListeners();
    setupLabelToggleListeners(); // ラベル表示切替イベントリスナーを追加
    setupLabelContentListener();
    setupLegendToggleListener();
    setupAccordionListeners();
    setupClippingRangeListeners();
    setupClippingButtonListeners();
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
 * Setup label toggle checkbox listeners to update label visibility
 */
function setupLabelToggleListeners() {
  const labelToggles = document.querySelectorAll('input[name="labelToggle"]');
  labelToggles.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const elementType = checkbox.value;
      console.log(
        `Label toggle changed: ${elementType} -> ${checkbox.checked}`
      );

      // 立体表示モードの場合は再描画が必要
      const needsRedraw = checkIfRedrawNeeded(elementType);

      if (needsRedraw) {
        // 立体表示モードの再描画を実行
        triggerViewModeRedraw(elementType);
      } else {
        // 通常のラベル表示更新
        updateLabelVisibility();
        // Request render if available
        if (typeof window.requestRender === "function") {
          window.requestRender();
        }
      }
    });
  });
  console.log(
    `Label toggle listeners setup for ${labelToggles.length} checkboxes`
  );
}

/**
 * Check if redraw is needed for solid view modes
 * @param {string} elementType - Element type
 * @returns {boolean} Whether redraw is needed
 */
function checkIfRedrawNeeded(elementType) {
  if (elementType === "Column") {
    const columnViewCheckbox = document.getElementById("toggleColumnView");
    return columnViewCheckbox && columnViewCheckbox.checked;
  } else if (elementType === "Girder" || elementType === "Beam") {
    const girderViewCheckbox = document.getElementById("toggleGirderView");
    return girderViewCheckbox && girderViewCheckbox.checked;
  }
  return false;
}

/**
 * Trigger view mode redraw for specific element types
 * @param {string} elementType - Element type
 */
function triggerViewModeRedraw(elementType) {
  // Import redraw functions dynamically to avoid circular dependencies
  import("../viewModes.js")
    .then(({ redrawColumnsForViewMode, redrawBeamsForViewMode }) => {
      const scheduleRender = window.requestRender || (() => {});

      if (elementType === "Column") {
        redrawColumnsForViewMode(scheduleRender);
      } else if (elementType === "Girder" || elementType === "Beam") {
        redrawBeamsForViewMode(scheduleRender);
      }
    })
    .catch((error) => {
      console.error("Failed to import view mode functions:", error);
      // Fallback to normal label update
      updateLabelVisibility();
      if (typeof window.requestRender === "function") {
        window.requestRender();
      }
    });
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
  if (typeof window.setModelVisibility === "function") {
    window.setModelVisibility("A", isVisible, window.requestRender);
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
  if (typeof window.setModelVisibility === "function") {
    window.setModelVisibility("B", isVisible, window.requestRender);
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
  updateLabelVisibility();

  // Request render update
  if (typeof window.requestRender === "function") {
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
  updateLabelVisibility();

  // Request render update
  if (typeof window.requestRender === "function") {
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
  updateLabelVisibility();

  // Request render update
  if (typeof window.requestRender === "function") {
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
  if (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA") {
    return;
  }

  switch (event.key.toLowerCase()) {
    case "l":
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        toggleLegend();
      }
      break;

    case "1":
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        toggleModelAVisibility();
      }
      break;

    case "2":
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        toggleModelBVisibility();
      }
      break;

    case "r":
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
    toggleModelACheckbox.dispatchEvent(new Event("change"));
  }
}

/**
 * Toggle Model B visibility programmatically
 */
export function toggleModelBVisibility() {
  if (toggleModelBCheckbox) {
    toggleModelBCheckbox.checked = !toggleModelBCheckbox.checked;
    toggleModelBCheckbox.dispatchEvent(new Event("change"));
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
    updateLegendContent(); // 凡例内容を更新
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
  if (typeof window.clearClippingPlanes === "function") {
    window.clearClippingPlanes();
  }

  // Update label visibility
  updateLabelVisibility();

  // Request render update
  if (typeof window.requestRender === "function") {
    window.requestRender();
  }

  console.log("All selectors reset to default values");
}

/**
 * Setup label content selector listener
 */
function setupLabelContentListener() {
  const labelContentSelector = document.getElementById("labelContentSelector");

  if (labelContentSelector) {
    labelContentSelector.addEventListener("change", handleLabelContentChange);
    console.log("Label content selector listener setup");
  } else {
    console.warn("Label content selector not found");
  }
}

/**
 * Handle label content type change
 * @param {Event} event - Change event
 */
function handleLabelContentChange(event) {
  const newContentType = event.target.value;
  console.log(`Label content type changed to: ${newContentType}`);

  // Update global state
  setState("ui.labelContentType", newContentType);

  // Trigger label regeneration
  if (typeof window.regenerateAllLabels === "function") {
    window.regenerateAllLabels();
  } else {
    console.warn(
      "regenerateAllLabels function not found - labels will update on next model reload"
    );
  }

  // Request render update
  if (typeof window.requestRender === "function") {
    window.requestRender();
  }
}

/**
 * Setup accordion event listeners
 */
function setupAccordionListeners() {
  const accordionHeaders = document.querySelectorAll(".accordion-header");

  accordionHeaders.forEach((header) => {
    header.addEventListener("click", handleAccordionToggle);
  });

  // Initialize accordion states
  initializeAccordionStates();

  console.log(
    `Accordion listeners setup for ${accordionHeaders.length} sections`
  );
}

/**
 * Handle accordion section toggle
 * @param {Event} event - Click event
 */
function handleAccordionToggle(event) {
  const header = event.currentTarget;
  const targetId = header.dataset.target;
  const content = document.getElementById(targetId);

  if (!content) {
    console.warn(`Accordion content not found for target: ${targetId}`);
    return;
  }

  const isCollapsed = content.classList.contains("collapsed");

  if (isCollapsed) {
    // Expand
    content.classList.remove("collapsed");
    header.classList.remove("collapsed");
    console.log(`Accordion section expanded: ${targetId}`);
  } else {
    // Collapse
    content.classList.add("collapsed");
    header.classList.add("collapsed");
    console.log(`Accordion section collapsed: ${targetId}`);
  }

  // Save accordion state to localStorage
  saveAccordionState(targetId, !isCollapsed);
}

/**
 * Initialize accordion states from localStorage or defaults
 */
function initializeAccordionStates() {
  const defaultOpenSections = [
    "file-loading",
    "display-settings",
    "element-settings",
  ];
  const accordionSections = document.querySelectorAll(".accordion-section");

  accordionSections.forEach((section, index) => {
    const header = section.querySelector(".accordion-header");
    const content = section.querySelector(".accordion-content");

    if (!header || !content) return;

    const targetId = header.dataset.target;
    const savedState = getAccordionState(targetId);
    const shouldBeOpen =
      savedState !== null ? savedState : defaultOpenSections.includes(targetId);

    if (shouldBeOpen) {
      content.classList.remove("collapsed");
      header.classList.remove("collapsed");
    } else {
      content.classList.add("collapsed");
      header.classList.add("collapsed");
    }
  });

  console.log("Accordion states initialized");
}

/**
 * Save accordion state to localStorage
 * @param {string} sectionId - Section identifier
 * @param {boolean} isOpen - Whether section is open
 */
function saveAccordionState(sectionId, isOpen) {
  try {
    const accordionStates = JSON.parse(
      localStorage.getItem("accordionStates") || "{}"
    );
    accordionStates[sectionId] = isOpen;
    localStorage.setItem("accordionStates", JSON.stringify(accordionStates));
  } catch (error) {
    console.warn("Failed to save accordion state:", error);
  }
}

/**
 * Get accordion state from localStorage
 * @param {string} sectionId - Section identifier
 * @returns {boolean|null} Saved state or null if not found
 */
function getAccordionState(sectionId) {
  try {
    const accordionStates = JSON.parse(
      localStorage.getItem("accordionStates") || "{}"
    );
    return accordionStates[sectionId] !== undefined
      ? accordionStates[sectionId]
      : null;
  } catch (error) {
    console.warn("Failed to get accordion state:", error);
    return null;
  }
}

/**
 * Expand all accordion sections
 */
export function expandAllAccordions() {
  const contents = document.querySelectorAll(".accordion-content");
  const headers = document.querySelectorAll(".accordion-header");

  contents.forEach((content) => content.classList.remove("collapsed"));
  headers.forEach((header) => header.classList.remove("collapsed"));

  // Save states
  headers.forEach((header) => {
    const targetId = header.dataset.target;
    saveAccordionState(targetId, true);
  });

  console.log("All accordion sections expanded");
}

/**
 * Collapse all accordion sections
 */
export function collapseAllAccordions() {
  const contents = document.querySelectorAll(".accordion-content");
  const headers = document.querySelectorAll(".accordion-header");

  contents.forEach((content) => content.classList.add("collapsed"));
  headers.forEach((header) => header.classList.add("collapsed"));

  // Save states
  headers.forEach((header) => {
    const targetId = header.dataset.target;
    saveAccordionState(targetId, false);
  });

  console.log("All accordion sections collapsed");
}

/**
 * Setup clipping range slider listeners
 */
function setupClippingRangeListeners() {
  // Story clipping range slider
  const storyRangeSlider = document.getElementById("storyClipRange");
  const storyRangeValue = document.getElementById("storyRangeValue");

  if (storyRangeSlider && storyRangeValue) {
    storyRangeSlider.addEventListener("input", (event) => {
      const rangeValue = parseInt(event.target.value);
      storyRangeValue.textContent = (rangeValue / 1000).toFixed(1);
      updateClippingRange(rangeValue);
    });
    console.log("Story clipping range slider listener setup");
  }

  // X-axis clipping range slider
  const xAxisRangeSlider = document.getElementById("xAxisClipRange");
  const xAxisRangeValue = document.getElementById("xAxisRangeValue");

  if (xAxisRangeSlider && xAxisRangeValue) {
    xAxisRangeSlider.addEventListener("input", (event) => {
      const rangeValue = parseInt(event.target.value);
      xAxisRangeValue.textContent = (rangeValue / 1000).toFixed(1);
      updateClippingRange(rangeValue);
    });
    console.log("X-axis clipping range slider listener setup");
  }

  // Y-axis clipping range slider
  const yAxisRangeSlider = document.getElementById("yAxisClipRange");
  const yAxisRangeValue = document.getElementById("yAxisRangeValue");

  if (yAxisRangeSlider && yAxisRangeValue) {
    yAxisRangeSlider.addEventListener("input", (event) => {
      const rangeValue = parseInt(event.target.value);
      yAxisRangeValue.textContent = (rangeValue / 1000).toFixed(1);
      updateClippingRange(rangeValue);
    });
    console.log("Y-axis clipping range slider listener setup");
  }
}

/**
 * Setup clipping button listeners
 */
function setupClippingButtonListeners() {
  // Story clipping apply button
  const storyClipButton = document.getElementById("applyStoryClipButton");
  if (storyClipButton) {
    storyClipButton.addEventListener("click", () => {
      const storySelector = document.getElementById("storySelector");
      const storyRange = document.getElementById("storyClipRange");
      if (storySelector && storyRange) {
        const storyId = storySelector.value;
        const range = parseInt(storyRange.value);
        applyStoryClip(storyId, range);
      }
    });
    console.log("Story clipping apply button listener setup");
  }

  // X-axis clipping apply button
  const xAxisClipButton = document.getElementById("applyXAxisClipButton");
  if (xAxisClipButton) {
    xAxisClipButton.addEventListener("click", () => {
      const xAxisSelector = document.getElementById("xAxisSelector");
      const xAxisRange = document.getElementById("xAxisClipRange");
      if (xAxisSelector && xAxisRange) {
        const axisId = xAxisSelector.value;
        const range = parseInt(xAxisRange.value);
        applyAxisClip("X", axisId, range);
      }
    });
    console.log("X-axis clipping apply button listener setup");
  }

  // Y-axis clipping apply button
  const yAxisClipButton = document.getElementById("applyYAxisClipButton");
  if (yAxisClipButton) {
    yAxisClipButton.addEventListener("click", () => {
      const yAxisSelector = document.getElementById("yAxisSelector");
      const yAxisRange = document.getElementById("yAxisClipRange");
      if (yAxisSelector && yAxisRange) {
        const axisId = yAxisSelector.value;
        const range = parseInt(yAxisRange.value);
        applyAxisClip("Y", axisId, range);
      }
    });
    console.log("Y-axis clipping apply button listener setup");
  }

  // Clear clipping button
  const clearClipButton = document.getElementById("clearClipButton");
  if (clearClipButton) {
    clearClipButton.addEventListener("click", () => {
      clearAllClippingPlanes();
    });
    console.log("Clear clipping button listener setup");
  }
}

/**
 * 色分けモードに応じて凡例内容を更新
 */
export function updateLegendContent() {
  if (!legendPanel) return;

  // 現在の色分けモードを取得
  import("../colorModes.js").then(({ getCurrentColorMode, COLOR_MODES }) => {
    const currentMode = getCurrentColorMode();
    const legendContent = legendPanel.querySelector(".legend-content");

    if (!legendContent) return;

    switch (currentMode) {
      case COLOR_MODES.IMPORTANCE:
        updateImportanceLegend(legendContent);
        break;
      case COLOR_MODES.ELEMENT:
        updateElementLegend(legendContent);
        break;
      case COLOR_MODES.SCHEMA:
        updateSchemaLegend(legendContent);
        break;
      case COLOR_MODES.DIFF:
      default:
        updateDiffLegend(legendContent);
        break;
    }
  });
}

/**
 * 重要度別凡例を生成
 */
function updateImportanceLegend(container) {
  import("../core/importanceManager.js").then(
    ({ IMPORTANCE_LEVELS, IMPORTANCE_LEVEL_NAMES }) => {
      import("../config/importanceConfig.js").then(({ IMPORTANCE_COLORS }) => {
        // ランタイム色設定があれば使用
        const runtimeColors =
          window.runtimeImportanceColors || IMPORTANCE_COLORS;

        const html = `
        <div class="panel-header">重要度別凡例</div>
        ${Object.entries(IMPORTANCE_LEVELS)
          .map(([key, level]) => {
            const color = runtimeColors[level] || IMPORTANCE_COLORS[level];
            const name = IMPORTANCE_LEVEL_NAMES[level];
            return `
            <div class="legend-item">
              <span class="legend-color" style="background-color: ${color};"></span>
              <span>${name}</span>
            </div>
          `;
          })
          .join("")}
        <hr />
        <div class="legend-item">
          <span><b>操作方法:</b></span>
        </div>
        <div class="legend-item">
          <span>回転: 左ドラッグ</span>
        </div>
        <div class="legend-item">
          <span>平行移動: 右ドラッグ</span>
        </div>
        <div class="legend-item">
          <span>ズーム: ホイール</span>
        </div>
      `;
        container.innerHTML = html;
      });
    }
  );
}

/**
 * 部材別凡例を生成
 */
function updateElementLegend(container) {
  import("../colorModes.js").then(({ getElementColors }) => {
    const elementColors = getElementColors();
    const html = `
      <div class="panel-header">部材別凡例</div>
      ${Object.entries(elementColors)
        .map(
          ([type, color]) => `
        <div class="legend-item">
          <span class="legend-color" style="background-color: ${color};"></span>
          <span>${type}</span>
        </div>
      `
        )
        .join("")}
      <hr />
      <div class="legend-item">
        <span><b>操作方法:</b></span>
      </div>
      <div class="legend-item">
        <span>回転: 左ドラッグ</span>
      </div>
      <div class="legend-item">
        <span>平行移動: 右ドラッグ</span>
      </div>
      <div class="legend-item">
        <span>ズーム: ホイール</span>
      </div>
    `;
    container.innerHTML = html;
  });
}

/**
 * スキーマエラー凡例を生成
 */
function updateSchemaLegend(container) {
  import("../colorModes.js").then(({ getSchemaColors }) => {
    const schemaColors = getSchemaColors();
    const html = `
      <div class="panel-header">スキーマ検証凡例</div>
      <div class="legend-item">
        <span class="legend-color" style="background-color: ${schemaColors.valid};"></span>
        <span>正常要素</span>
      </div>
      <div class="legend-item">
        <span class="legend-color" style="background-color: ${schemaColors.error};"></span>
        <span>エラー要素</span>
      </div>
      <hr />
      <div class="legend-item">
        <span><b>操作方法:</b></span>
      </div>
      <div class="legend-item">
        <span>回転: 左ドラッグ</span>
      </div>
      <div class="legend-item">
        <span>平行移動: 右ドラッグ</span>
      </div>
      <div class="legend-item">
        <span>ズーム: ホイール</span>
      </div>
    `;
    container.innerHTML = html;
  });
}

/**
 * 差分表示凡例を生成（デフォルト）
 */
function updateDiffLegend(container) {
  const html = `
    <div class="panel-header">凡例</div>
    <div class="legend-item">
      <span class="legend-color legend-color-matched"></span>
      <span>一致要素</span>
    </div>
    <div class="legend-item">
      <span class="legend-color legend-color-onlya"></span>
      <span>モデルAのみ</span>
    </div>
    <div class="legend-item">
      <span class="legend-color legend-color-onlyb"></span>
      <span>モデルBのみ</span>
    </div>
    <hr />
    <div class="legend-item">
      <span><b>操作方法:</b></span>
    </div>
    <div class="legend-item">
      <span>回転: 左ドラッグ</span>
    </div>
    <div class="legend-item">
      <span>平行移動: 右ドラッグ</span>
    </div>
    <div class="legend-item">
      <span>ズーム: ホイール</span>
    </div>
  `;
  container.innerHTML = html;
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
    accordionSections: document.querySelectorAll(".accordion-section").length,
    clippingRangeSliders:
      document.querySelectorAll(".clip-range-slider").length,
  };
}

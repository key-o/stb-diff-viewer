/**
 * @fileoverview File validation and input processing module
 *
 * This module handles file validation and input processing for STB model comparison:
 * - File input validation and retrieval
 * - Element type selection validation
 * - UI state management for loading process
 * - Input parameter validation
 *
 * Extracted from the massive compareModels() function for better maintainability.
 */

/**
 * Validate and retrieve files for comparison
 * @returns {Object} File validation result
 */
export function validateAndGetFiles() {
  const fileAInput = document.getElementById("fileA");
  const fileBInput = document.getElementById("fileB");
  const fileA = fileAInput?.files[0];
  const fileB = fileBInput?.files[0];

  if (!fileA && !fileB) {
    alert("表示するモデルファイル（モデルAまたはモデルB）を選択してください。");
    return { isValid: false, fileA: null, fileB: null };
  }

  // 元のSTBファイルをグローバル状態に保存（IFC変換用）
  // グローバル状態システムが利用可能な場合のみ保存
  if (typeof window !== 'undefined' && window.globalState && window.globalState.setState) {
    if (fileA) {
      window.globalState.setState("files.originalFileA", fileA);
      console.log("元のSTBファイルA を保存:", fileA.name);
    }
    if (fileB) {
      window.globalState.setState("files.originalFileB", fileB);
      console.log("元のSTBファイルB を保存:", fileB.name);
    }
  } else {
    // フォールバック: windowオブジェクトに直接保存
    if (!window.originalSTBFiles) {
      window.originalSTBFiles = {};
    }
    if (fileA) {
      window.originalSTBFiles.fileA = fileA;
      console.log("元のSTBファイルA をフォールバック保存:", fileA.name);
    }
    if (fileB) {
      window.originalSTBFiles.fileB = fileB;
      console.log("元のSTBファイルB をフォールバック保存:", fileB.name);
    }
  }

  return { isValid: true, fileA, fileB };
}

/**
 * Get selected element types from UI
 * @returns {Array<string>} Selected element types
 */
export function getSelectedElementTypes() {
  const selectedElementTypes = [
    ...document.querySelectorAll(
      '#elementSelector input[name="elements"]:checked'
    ),
  ].map((cb) => cb.value);

  console.log("Selected elements for comparison:", selectedElementTypes);
  if (selectedElementTypes.length === 0) {
    console.warn("表示する要素が選択されていません。");
  }

  return selectedElementTypes;
}

/**
 * Set loading state for UI elements
 * @param {boolean} isLoading - Whether loading is in progress
 */
export function setLoadingState(isLoading) {
  const compareButton = document.querySelector(
    '#overlay button[onclick="compareModels()"]'
  );
  
  if (compareButton) {
    if (isLoading) {
      compareButton.textContent = "読込/比較中...";
      compareButton.disabled = true;
    } else {
      compareButton.textContent = "読込/比較";
      compareButton.disabled = false;
    }
  }
  
  const overlay = document.getElementById("overlay");
  if (overlay) {
    overlay.style.cursor = isLoading ? "wait" : "default";
  }
}

/**
 * Validate comparison parameters
 * @param {Object} params - Comparison parameters
 * @param {File|null} params.fileA - Model A file
 * @param {File|null} params.fileB - Model B file
 * @param {Array<string>} params.selectedElementTypes - Selected element types
 * @param {Function} params.scheduleRender - Render function
 * @param {Object} params.cameraControls - Camera and controls
 * @returns {Object} Validation result
 */
export function validateComparisonParameters(params) {
  const { fileA, fileB, selectedElementTypes, scheduleRender, cameraControls } = params;
  const errors = [];

  // File validation
  if (!fileA && !fileB) {
    errors.push("No model files selected");
  }

  // Render function validation
  if (typeof scheduleRender !== 'function') {
    errors.push("Invalid render function");
  }

  // Camera controls validation
  if (!cameraControls || !cameraControls.camera || !cameraControls.controls) {
    errors.push("Invalid camera/controls configuration");
  }

  // Element types validation (warning, not error)
  if (selectedElementTypes.length === 0) {
    console.warn("No element types selected for display");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings: selectedElementTypes.length === 0 ? ["No elements selected"] : []
  };
}
/**
 * @fileoverview ファイル検証・入力処理モジュール
 *
 * このモジュールはSTBモデル比較のファイル検証と入力処理を処理します：
 * - ファイル入力検証と取得
 * - 要素タイプ選択検証
 * - 読み込みプロセスのUI状態管理
 * - 入力パラメータ検証
 *
 * ファイルタイプ設定は config/fileTypeConfig.js で一元管理されています。
 *
 * 保守性向上のため、巨大なcompareModels()関数から抽出されました。
 */

import { notify } from '../app/controllers/notificationController.js';
import { setState } from '../app/globalState.js';
import { validateFileType } from '../config/fileTypeConfig.js';

/**
 * Validate and retrieve files for comparison
 * @returns {Object} File validation result
 */
export function validateAndGetFiles() {
  const fileAInput = document.getElementById('fileA');
  const fileBInput = document.getElementById('fileB');
  const fileA = fileAInput?.files[0] || null;
  const fileB = fileBInput?.files[0] || null;

  if (!fileA && !fileB) {
    notify.warning('表示するモデルファイル（モデルAまたはモデルB）を選択してください。');
    return { isValid: false, fileA: null, fileB: null, fileTypes: {} };
  }

  // ファイルタイプを検証（設定ファイルベース）
  const fileTypes = {};

  if (fileA) {
    const validationA = validateFileType(fileA);
    if (!validationA.isValid) {
      notify.warning(`モデルA: ${validationA.errors.join(', ')}`);
      return { isValid: false, fileA: null, fileB: null, fileTypes: {} };
    }
    fileTypes.fileA = validationA.fileType;
    setState('files.originalFileA', fileA);
  }

  if (fileB) {
    const validationB = validateFileType(fileB);
    if (!validationB.isValid) {
      notify.warning(`モデルB: ${validationB.errors.join(', ')}`);
      return { isValid: false, fileA: null, fileB: null, fileTypes: {} };
    }
    fileTypes.fileB = validationB.fileType;
    setState('files.originalFileB', fileB);
  }

  return { isValid: true, fileA, fileB, fileTypes };
}

/**
 * Get selected element types from UI
 * @returns {Array<string>} Selected element types
 */
export function getSelectedElementTypes() {
  const selectedElementTypes = [
    ...document.querySelectorAll('#elementSelector input[name="elements"]:checked'),
  ].map((cb) => cb.value);

  if (selectedElementTypes.length === 0) {
    console.warn('表示する要素が選択されていません。');
  }

  return selectedElementTypes;
}

/**
 * Set loading state for UI elements
 * @param {boolean} isLoading - Whether loading is in progress
 */
export function setLoadingState(isLoading) {
  const compareButton = document.querySelector('#overlay button[onclick="compareModels()"]');

  if (compareButton) {
    if (isLoading) {
      compareButton.textContent = '読込/比較中...';
      compareButton.disabled = true;
    } else {
      compareButton.textContent = '読込/比較';
      compareButton.disabled = false;
    }
  }

  const overlay = document.getElementById('overlay');
  if (overlay) {
    overlay.style.cursor = isLoading ? 'wait' : 'default';
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
    errors.push('No model files selected');
  }

  // Render function validation
  if (typeof scheduleRender !== 'function') {
    errors.push('Invalid render function');
  }

  // Camera controls validation
  if (!cameraControls || !cameraControls.camera || !cameraControls.controls) {
    errors.push('Invalid camera/controls configuration');
  }

  // Element types validation (warning, not error)
  if (selectedElementTypes.length === 0) {
    console.warn('No element types selected for display');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings: selectedElementTypes.length === 0 ? ['No elements selected'] : [],
  };
}

/**
 * @fileoverview モデル可視性切り替えイベントリスナー
 *
 * モデルA/Bの表示切り替えを処理するイベントリスナー。
 *
 * @module ui/events/modelVisibilityListeners
 */

import { scheduleRender } from '../../utils/renderScheduler.js';
import { setModelVisibility } from '../../app/viewModes.js';

// --- UI Element References ---
const toggleModelACheckbox = document.getElementById('toggleModelA');
const toggleModelBCheckbox = document.getElementById('toggleModelB');

/**
 * Setup model visibility toggle listeners
 */
export function setupModelVisibilityListeners() {
  if (toggleModelACheckbox) {
    toggleModelACheckbox.addEventListener('change', handleModelAToggle);
  }

  if (toggleModelBCheckbox) {
    toggleModelBCheckbox.addEventListener('change', handleModelBToggle);
  }
}

/**
 * Handle Model A visibility toggle
 * @param {Event} event - Change event
 */
function handleModelAToggle(event) {
  const isVisible = event.target.checked;
  setModelVisibility('A', isVisible, scheduleRender);
}

/**
 * Handle Model B visibility toggle
 * @param {Event} event - Change event
 */
function handleModelBToggle(event) {
  const isVisible = event.target.checked;
  setModelVisibility('B', isVisible, scheduleRender);
}

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
 * Get model visibility checkbox status
 * @returns {{ modelA: boolean, modelB: boolean }} Visibility status
 */
export function getModelVisibilityStatus() {
  return {
    modelA: !!toggleModelACheckbox,
    modelB: !!toggleModelBCheckbox,
  };
}

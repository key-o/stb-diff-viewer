/**
 * @fileoverview 繧ｭ繝ｼ繝懊・繝峨す繝ｧ繝ｼ繝医き繝・ヨ繝｢繧ｸ繝･繝ｼ繝ｫ
 *
 * 繝薙Η繝ｼ謫堺ｽ懊・繧ｭ繝ｼ繝懊・繝峨す繝ｧ繝ｼ繝医き繝・ヨ繧呈署萓帙＠縺ｾ縺・
 * - F: 驕ｸ謚櫁ｦ∫ｴ縺ｫ繝輔か繝ｼ繧ｫ繧ｹ・・屓霆｢荳ｭ蠢・ｨｭ螳・
 * - Home: 繝｢繝・Ν蜈ｨ菴薙↓繝輔ぅ繝・ヨ・・屓霆｢荳ｭ蠢・Μ繧ｻ繝・ヨ
 * - Escape: 驕ｸ謚櫁ｧ｣髯､
 */

import { controls } from '../core/core.js';
import { focusOnSelected, fitCameraToModel } from '../camera/cameraFitter.js';
import { createLogger } from '../../utils/logger.js';
import {
  createOrUpdateOrbitCenterHelper,
  getSelectedCenter,
  hideOrbitCenterHelper,
  resetSelection,
} from './interactionManager.js';

const log = createLogger('viewer:keyboard');

let isInitialized = false;

/**
 * 驕ｸ謚櫁ｦ∫ｴ縺ｫ蝗櫁ｻ｢荳ｭ蠢・ｒ險ｭ螳・
 * @returns {boolean} 謌仙粥縺励◆蝣ｴ蜷・rue
 */
export function setOrbitCenterToSelected() {
  const center = getSelectedCenter();

  if (!center) {
    log.debug('No selected element for orbit center');
    return false;
  }

  // 蝗櫁ｻ｢荳ｭ蠢・ｒ險ｭ螳・
  if (controls && typeof controls.setOrbitPoint === 'function') {
    controls.stop?.();
    controls.setOrbitPoint(center.x, center.y, center.z);
    log.debug('Orbit point set to selected element', center.toArray());
  } else if (controls && controls.target) {
    controls.target.copy(center);
    controls.update?.();
  }

  // 蝗櫁ｻ｢荳ｭ蠢・・繝ｫ繝代・繧定｡ｨ遉ｺ
  createOrUpdateOrbitCenterHelper(center);

  return true;
}

/**
 * 蝗櫁ｻ｢荳ｭ蠢・ｒ繝ｪ繧ｻ繝・ヨ・医・繝ｫ繝代・繧帝撼陦ｨ遉ｺ縺ｫ・・
 */
export function resetOrbitCenter() {
  hideOrbitCenterHelper();
}

/**
 * 繧ｭ繝ｼ繝懊・繝峨う繝吶Φ繝医ワ繝ｳ繝峨Λ繝ｼ
 * @param {KeyboardEvent} event
 */
function handleKeyDown(event) {
  // 蜈･蜉帙ヵ繧｣繝ｼ繝ｫ繝牙・縺ｧ縺ｯ辟｡隕・
  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  ) {
    return;
  }

  switch (event.key.toLowerCase()) {
    case 'f':
      // F: 驕ｸ謚櫁ｦ∫ｴ縺ｫ繝輔か繝ｼ繧ｫ繧ｹ
      if (!event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        const success = focusOnSelected({ enableTransition: true, padding: 2.0 });
        if (success) {
          // 繝輔か繝ｼ繧ｫ繧ｹ蠕後↓蝗櫁ｻ｢荳ｭ蠢・ｂ險ｭ螳・
          setOrbitCenterToSelected();
          log.info('Focused on selected element');
        } else {
          log.debug('No element to focus on');
        }
      }
      break;

    case 'home':
      // Home: 繝｢繝・Ν蜈ｨ菴薙↓繝輔ぅ繝・ヨ
      if (!event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        const success = fitCameraToModel({ enableTransition: true, padding: 1.2 });
        if (success) {
          // 繝｢繝・Ν蜈ｨ菴薙ヵ繧｣繝・ヨ譎ゅ・蝗櫁ｻ｢荳ｭ蠢・・繝ｫ繝代・繧帝撼陦ｨ遉ｺ
          resetOrbitCenter();
          log.info('Camera fitted to model');
        } else {
          log.debug('No model content to fit');
        }
      }
      break;

    case 'escape':
      // Escape: 驕ｸ謚櫁ｧ｣髯､
      resetSelection();
      log.debug('Selection cleared via Escape key');
      break;
  }
}

/**
 * 繧ｭ繝ｼ繝懊・繝峨す繝ｧ繝ｼ繝医き繝・ヨ繧貞・譛溷喧
 */
export function initKeyboardShortcuts() {
  if (isInitialized) {
    log.warn('Keyboard shortcuts already initialized');
    return;
  }

  window.addEventListener('keydown', handleKeyDown);
  isInitialized = true;

  log.info('Keyboard shortcuts initialized (F: focus, Home: fit model, Escape: clear)');
}

/**
 * 繧ｭ繝ｼ繝懊・繝峨す繝ｧ繝ｼ繝医き繝・ヨ繧堤ｴ譽・
 */
export function disposeKeyboardShortcuts() {
  if (!isInitialized) return;

  window.removeEventListener('keydown', handleKeyDown);
  isInitialized = false;

  log.info('Keyboard shortcuts disposed');
}

export default {
  initKeyboardShortcuts,
  disposeKeyboardShortcuts,
  setOrbitCenterToSelected,
  resetOrbitCenter,
};

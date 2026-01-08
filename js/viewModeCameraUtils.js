/**
 * @fileoverview カメラモードユーティリティ
 *
 * カメラモード切り替え時のボタン同期とビュー方向の管理を提供します。
 */

import { createLogger } from './utils/logger.js';
import { setCameraMode } from './viewer/camera/cameraManagerImpl.js';
import { CAMERA_MODES } from './constants/displayModes.js';
import { setView } from './viewer/camera/viewManagerImpl.js';
import { updateDepth2DClippingVisibility } from './ui/clipping2DImpl.js';
import { setStbExportPanelVisibility } from './dxfLoader.js';
import { redrawAxesAtStory } from './ui/events/index.js';

const log = createLogger('viewModeCameraUtils');

/**
 * すべての表示モードボタンのアクティブ状態を同期
 * @param {string} mode - 'perspective' または 'orthographic'
 */
export function syncViewModeButtons(mode) {
  const isPerspective = mode === 'perspective';

  // フローティングウィンドウ内のボタン
  const cameraPerspectiveBtn = document.getElementById('cameraPerspectiveBtn');
  const cameraOrthographicBtn = document.getElementById('cameraOrthographicBtn');

  if (cameraPerspectiveBtn) {
    cameraPerspectiveBtn.classList.toggle('active', isPerspective);
  }
  if (cameraOrthographicBtn) {
    cameraOrthographicBtn.classList.toggle('active', !isPerspective);
  }

  // パネル上部の常時表示ボタン
  const viewModePerspectiveBtn = document.getElementById('viewModePerspectiveBtn');
  const viewModeOrthographicBtn = document.getElementById('viewModeOrthographicBtn');

  if (viewModePerspectiveBtn) {
    viewModePerspectiveBtn.classList.toggle('active', isPerspective);
  }
  if (viewModeOrthographicBtn) {
    viewModeOrthographicBtn.classList.toggle('active', !isPerspective);
  }

  // ビュー方向ボタンの表示/非表示
  const viewDirectionButtons = document.getElementById('viewDirectionButtons');
  const viewDirectionPanel = document.getElementById('viewDirectionPanel');

  if (viewDirectionButtons) {
    viewDirectionButtons.classList.toggle('hidden', isPerspective);
  }
  if (viewDirectionPanel) {
    viewDirectionPanel.classList.toggle('hidden', isPerspective);
  }
}

/**
 * すべてのビュー方向ボタンのアクティブ状態を同期
 * @param {string} viewType - ビュータイプ（'top', 'front', 'right', 'left', 'iso'）
 */
export function syncViewDirectionButtons(viewType) {
  // パネル上部のビュー方向ボタン
  const viewDirectionButtons = document.getElementById('viewDirectionButtons');
  const panelBtns = viewDirectionButtons?.querySelectorAll('.view-dir-btn');
  if (panelBtns) {
    panelBtns.forEach((b) => b.classList.remove('active'));
    const activeBtn = viewDirectionButtons?.querySelector(`.view-dir-btn[data-view="${viewType}"]`);
    if (activeBtn) activeBtn.classList.add('active');
  }

  // フローティングウィンドウ内のビュー方向ボタン
  const floatBtns = document.querySelectorAll('#viewDirectionPanel button[data-view]');
  floatBtns.forEach((b) => b.classList.remove('active'));
  const floatActiveBtn = document.querySelector(
    `#viewDirectionPanel button[data-view="${viewType}"]`,
  );
  if (floatActiveBtn) floatActiveBtn.classList.add('active');
}

/**
 * 3D（立体表示）モードに切り替え
 * @param {Function} scheduleRender - 再描画要求関数
 * @param {Object} modelBounds - モデルの境界
 */
export function switchToPerspective(scheduleRender, modelBounds) {
  log.info('カメラモード切り替え: 3D（立体表示）');
  syncViewModeButtons('perspective');
  setCameraMode(CAMERA_MODES.PERSPECTIVE);
  setView('iso', modelBounds);
  updateDepth2DClippingVisibility(CAMERA_MODES.PERSPECTIVE);
  setStbExportPanelVisibility(false);
  redrawAxesAtStory('all');
  if (scheduleRender) scheduleRender();
}

/**
 * 2D（図面表示）モードに切り替え
 * @param {Function} scheduleRender - 再描画要求関数
 * @param {Object} modelBounds - モデルの境界
 */
export function switchToOrthographic(scheduleRender, modelBounds) {
  log.info('カメラモード切り替え: 2D（図面表示）');
  syncViewModeButtons('orthographic');
  setCameraMode(CAMERA_MODES.ORTHOGRAPHIC);
  setView('top', modelBounds);
  syncViewDirectionButtons('top');
  updateDepth2DClippingVisibility(CAMERA_MODES.ORTHOGRAPHIC);
  setStbExportPanelVisibility(true);
  redrawAxesAtStory('all');
  if (scheduleRender) scheduleRender();
}

/**
 * ビュー方向を変更
 * @param {string} viewType - ビュータイプ（'top', 'front', 'right', 'left', 'iso'）
 * @param {Object} modelBounds - モデルの境界
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function changeViewDirection(viewType, modelBounds, scheduleRender) {
  log.info('ビュー方向切り替え:', viewType);
  syncViewDirectionButtons(viewType);
  try {
    setView(viewType, modelBounds);
    if (scheduleRender) scheduleRender();
  } catch (error) {
    log.error('ビュー方向の設定に失敗:', error);
  }
}


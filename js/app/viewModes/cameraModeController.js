/**
 * @fileoverview カメラモード制御モジュール
 *
 * 3D/2Dカメラモードの切り替えとビュー方向の管理を行います。
 * このモジュールは以下の責務を持ちます：
 * - 3D（透視投影）/2D（正投影）カメラモードの切り替え
 * - ビュー方向の設定（上面、正面、右、左、等角投影）
 * - カメラモードボタンの同期
 * - 2Dクリッピング表示制御
 */

import { CAMERA_MODES } from '../../constants/displayModes.js';
import { setCameraMode, setView } from '../../viewer/index.js';
import { updateDepth2DClippingVisibility } from '../../ui/viewer3d/clipping2DImpl.js';
import { setStbExportPanelVisibility } from '../dxfLoader.js';
import { redrawAxesAtStory } from '../../ui/events/index.js';
import { createLogger } from '../../utils/logger.js';
import { getModelContext } from './displayModeController.js';

// ロガー
const log = createLogger('cameraModeController');

/**
 * 正投影ビューの種類
 * @private
 */
const ORTHOGRAPHIC_VIEWS = {
  PLAN: 'top', // 平面図
  ISOMETRIC: 'iso', // 等角投影
};

/**
 * 正投影ビューを設定
 * @private
 * @param {string} view - ビューの種類（'top', 'iso' など）
 */
function setOrthographicView(view) {
  const { modelBounds } = getModelContext();
  setView(view, modelBounds);
}

/**
 * すべての表示モードボタンのアクティブ状態を同期
 * @private
 * @param {string} mode - 'perspective' または 'orthographic'
 */
function syncViewModeButtons(mode) {
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
 * @private
 * @param {string} viewType - ビュータイプ（'top', 'front', 'right', 'left', 'iso'）
 */
function syncViewDirectionButtons(viewType) {
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
 * カメラモード関連のイベントリスナーを設定
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setupCameraModeListeners(scheduleRender) {
  log.debug('[setupCameraModeListeners] Initializing camera mode listeners');

  // カメラモード切り替え
  const cameraPerspective = document.getElementById('cameraPerspective');
  const cameraOrthographic = document.getElementById('cameraOrthographic');
  const viewDirectionPanel = document.getElementById('viewDirectionPanel');

  // ボタン形式のカメラモード切り替え（フローティングウィンドウ内）
  const cameraPerspectiveBtn = document.getElementById('cameraPerspectiveBtn');
  const cameraOrthographicBtn = document.getElementById('cameraOrthographicBtn');

  // パネル上部の常時表示ボタン
  const viewModePerspectiveBtn = document.getElementById('viewModePerspectiveBtn');
  const viewModeOrthographicBtn = document.getElementById('viewModeOrthographicBtn');
  const viewDirectionButtons = document.getElementById('viewDirectionButtons');

  // 少なくとも1組のボタンが必要
  const hasRadioButtons = cameraPerspective && cameraOrthographic;
  const hasFloatingButtons = cameraPerspectiveBtn && cameraOrthographicBtn;
  const hasPanelButtons = viewModePerspectiveBtn && viewModeOrthographicBtn;

  if (!hasRadioButtons && !hasFloatingButtons && !hasPanelButtons) {
    log.warn('[setupCameraModeListeners] No camera mode buttons found in DOM');
    return;
  }

  /**
   * 3D（立体表示）モードに切り替え
   * カメラモード変更 + ビュー設定 + UI副作用を一括実行
   */
  function switchToPerspective() {
    log.info('カメラモード切り替え: 3D（立体表示）');
    syncViewModeButtons('perspective');
    setCameraMode(CAMERA_MODES.PERSPECTIVE);
    setOrthographicView(ORTHOGRAPHIC_VIEWS.ISOMETRIC);
    // 2Dクリッピングコントロールを非表示
    updateDepth2DClippingVisibility(CAMERA_MODES.PERSPECTIVE);
    // STBエクスポートパネルを非表示（3Dモードでは使用不可）
    setStbExportPanelVisibility(false);
    // 通り芯を3Dモード用に再描画
    redrawAxesAtStory('all');
    scheduleRender();
  }

  /**
   * 2D（図面表示）モードに切り替え
   * カメラモード変更 + ビュー設定 + UI副作用を一括実行
   */
  function switchToOrthographic() {
    log.info('カメラモード切り替え: 2D（図面表示）');
    syncViewModeButtons('orthographic');
    setCameraMode(CAMERA_MODES.ORTHOGRAPHIC);
    setOrthographicView(ORTHOGRAPHIC_VIEWS.PLAN);
    syncViewDirectionButtons('top');
    // 2Dクリッピングコントロールを表示
    updateDepth2DClippingVisibility(CAMERA_MODES.ORTHOGRAPHIC);
    // STBエクスポートパネルを表示（2Dモードで使用可能）
    setStbExportPanelVisibility(true);
    // 通り芯を2Dモード用に再描画
    redrawAxesAtStory('all');
    scheduleRender();
  }

  // フローティングウィンドウ内のボタン
  if (hasFloatingButtons) {
    // 3Dボタンクリック
    cameraPerspectiveBtn.addEventListener('click', () => {
      switchToPerspective();
      // ラジオボタンがある場合は同期
      if (cameraPerspective) {
        cameraPerspective.checked = true;
      }
    });

    // 2Dボタンクリック
    cameraOrthographicBtn.addEventListener('click', () => {
      switchToOrthographic();
      // ラジオボタンがある場合は同期
      if (cameraOrthographic) {
        cameraOrthographic.checked = true;
      }
    });
  }

  // パネル上部の常時表示ボタン
  if (hasPanelButtons) {
    // 立体表示ボタンクリック
    viewModePerspectiveBtn.addEventListener('click', () => {
      switchToPerspective();
      // ラジオボタンがある場合は同期
      if (cameraPerspective) {
        cameraPerspective.checked = true;
      }
    });

    // 図面表示ボタンクリック
    viewModeOrthographicBtn.addEventListener('click', () => {
      switchToOrthographic();
      // ラジオボタンがある場合は同期
      if (cameraOrthographic) {
        cameraOrthographic.checked = true;
      }
    });
  }

  // フローティングウィンドウ内のビュー方向ボタン
  const viewButtons = document.querySelectorAll('#viewDirectionPanel button[data-view]');
  log.debug(
    `[setupCameraModeListeners] Found ${viewButtons.length} view direction buttons in floating window`,
  );

  viewButtons.forEach((btn) => {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      const viewType = this.dataset.view;
      log.info('ビュー方向切り替え（フローティング）:', viewType);
      syncViewDirectionButtons(viewType);
      try {
        const { modelBounds } = getModelContext();
        setView(viewType, modelBounds);
        if (scheduleRender) scheduleRender();
      } catch (error) {
        log.error('ビュー方向の設定に失敗:', error);
      }
    });
  });

  // パネル上部のビュー方向ボタン
  const viewDirBtns = viewDirectionButtons?.querySelectorAll('.view-dir-btn');
  if (viewDirBtns) {
    log.debug(
      `[setupCameraModeListeners] Found ${viewDirBtns.length} view direction buttons in panel`,
    );
    viewDirBtns.forEach((btn) => {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        const viewType = this.dataset.view;
        log.info('ビュー方向切り替え（パネル上部）:', viewType);
        syncViewDirectionButtons(viewType);
        try {
          const { modelBounds } = getModelContext();
          setView(viewType, modelBounds);
          if (scheduleRender) scheduleRender();
        } catch (error) {
          log.error('ビュー方向の設定に失敗:', error);
        }
      });
    });
  }

  // ラジオボタンがある場合のみリスナーを設定
  if (!hasRadioButtons) {
    log.info('[setupCameraModeListeners] Camera mode listeners initialized (panel buttons only)');
    return;
  }

  cameraPerspective.addEventListener('change', function () {
    if (this.checked) {
      switchToPerspective();
    }
  });

  cameraOrthographic.addEventListener('change', function () {
    if (this.checked) {
      switchToOrthographic();
    }
  });

  log.info('[setupCameraModeListeners] Camera mode listeners initialized successfully');
}

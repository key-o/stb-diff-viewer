/**
 * @fileoverview 表示モードUIの同期管理
 *
 * 表示モードの状態とUI要素（チェックボックス、ボタン等）の同期を管理します。
 * - チェックボックス状態の読み取りと同期
 * - イベントリスナーの設定
 * - カメラモードUI同期
 */

import { createLogger } from '../../utils/logger.js';
import displayModeManager from '../rendering/displayModeManager.js';
import modelVisibilityManager from '../rendering/modelVisibilityManager.js';
import { elementGroups } from '../index.js';
import { VIEW_MODE_CHECKBOX_IDS } from '../../config/uiElementConfig.js';
import { setCameraMode } from '../camera/cameraManagerImpl.js';
import { setView } from '../camera/viewManagerImpl.js';
import { eventBus, ViewEvents, ExportEvents } from '../../app/events/index.js';

const log = createLogger('DisplayModeUISync');

/**
 * UIのチェックボックスの状態をdisplayModeManagerに同期
 */
export function syncDisplayModeFromUI() {
  Object.entries(VIEW_MODE_CHECKBOX_IDS).forEach(([type, id]) => {
    const checkbox = document.getElementById(id);
    if (checkbox) {
      const mode = checkbox.checked ? 'solid' : 'line';
      displayModeManager.setDisplayMode(type, mode);
      log.debug(`Synced ${type} display mode from UI: ${mode}`);
    }
  });
}

/**
 * 状態からUIのチェックボックスを同期
 * @param {string} elementType - 要素タイプ
 */
export function syncUIFromDisplayMode(elementType) {
  const checkboxId = VIEW_MODE_CHECKBOX_IDS[elementType];
  if (!checkboxId) return;

  const checkbox = document.getElementById(checkboxId);
  if (checkbox) {
    const mode = displayModeManager.getDisplayMode(elementType);
    checkbox.checked = mode === 'solid';
    log.debug(`Synced UI checkbox for ${elementType}: ${mode}`);
  }
}

/**
 * すべての要素タイプのUIを状態から同期
 */
export function syncAllUIFromDisplayMode() {
  Object.keys(VIEW_MODE_CHECKBOX_IDS).forEach((elementType) => {
    syncUIFromDisplayMode(elementType);
  });
}

/**
 * 表示モード関連のイベントリスナーを設定
 * @param {Function} scheduleRender - 再描画要求関数
 * @param {Object} redrawFunctions - 要素タイプごとの再描画関数
 */
export function setupViewModeListeners(scheduleRender, redrawFunctions) {
  // 立体/線表示モード切替リスナー
  Object.entries(VIEW_MODE_CHECKBOX_IDS).forEach(([elementType, checkboxId]) => {
    const checkbox = document.getElementById(checkboxId);
    if (!checkbox) return;

    checkbox.addEventListener('change', function () {
      const mode = this.checked ? 'solid' : 'line';
      displayModeManager.setDisplayMode(elementType, mode);

      // Beam/Girderは特殊ケース
      if (elementType === 'Beam' || elementType === 'Girder') {
        if (redrawFunctions.redrawBeamsForViewMode) {
          redrawFunctions.redrawBeamsForViewMode(scheduleRender);
        }
      } else if (elementType === 'Joint') {
        if (redrawFunctions.redrawJointsForViewMode) {
          redrawFunctions.redrawJointsForViewMode(scheduleRender);
        }
      } else {
        if (redrawFunctions.redrawElementByType) {
          redrawFunctions.redrawElementByType(elementType, scheduleRender);
        }
      }

      eventBus.emit(ExportEvents.STB_STATUS_UPDATE_REQUESTED);
      log.info(`${elementType}表示モード:`, mode);
    });
  });

  // 節点表示切替リスナー
  setupNodeViewListener(scheduleRender);

  // 要素カテゴリ表示切替リスナー
  setupElementCategoryListeners(scheduleRender);

  // モデル表示切り替えリスナー
  setupModelVisibilityListeners(scheduleRender, redrawFunctions.updateModelVisibility);
}

/**
 * 節点表示切替リスナーを設定
 * @param {Function} scheduleRender - 再描画要求関数
 */
function setupNodeViewListener(scheduleRender) {
  const toggleNodeViewCheckbox = document.getElementById('toggleNodeView');
  if (toggleNodeViewCheckbox) {
    toggleNodeViewCheckbox.addEventListener('change', function () {
      const nodeGroup = elementGroups['Node'];
      if (nodeGroup) {
        nodeGroup.visible = this.checked;
        log.debug('節点表示:', this.checked);
        if (scheduleRender) scheduleRender();
      }
    });
  }
}

/**
 * 要素カテゴリ表示切替リスナーを設定
 * @param {Function} scheduleRender - 再描画要求関数
 */
function setupElementCategoryListeners(scheduleRender) {
  const categoryConfigs = [
    { elementValue: 'Column', solidViewId: 'toggleColumnView', name: '柱' },
    { elementValue: 'Girder', solidViewId: 'toggleGirderView', name: '大梁' },
    { elementValue: 'Beam', solidViewId: 'toggleBeam3DView', name: '小梁' },
    { elementValue: 'Post', solidViewId: 'togglePost3DView', name: '間柱' },
  ];

  categoryConfigs.forEach(({ elementValue, solidViewId, name }) => {
    const checkbox = document.querySelector(`input[name="elements"][value="${elementValue}"]`);
    if (checkbox) {
      checkbox.addEventListener('change', function () {
        const elementGroup = elementGroups[elementValue];
        const solidViewCheckbox = document.getElementById(solidViewId);

        if (elementGroup) {
          elementGroup.visible = this.checked;
          log.debug(`${name}カテゴリ表示:`, this.checked);

          if (solidViewCheckbox) {
            solidViewCheckbox.disabled = !this.checked;
          }

          if (scheduleRender) scheduleRender();
        }
      });
    }
  });

  // その他の要素タイプの表示切替リスナー
  const elementToggleIds = [
    { id: 'toggleBraceView', type: 'Brace', name: 'ブレース', solidViewId: 'toggleBrace3DView' },
    { id: 'togglePileView', type: 'Pile', name: '杭', solidViewId: 'togglePile3DView' },
    { id: 'toggleFootingView', type: 'Footing', name: '基礎', solidViewId: 'toggleFooting3DView' },
    {
      id: 'toggleFoundationColumnView',
      type: 'FoundationColumn',
      name: '基礎柱',
      solidViewId: 'toggleFoundationColumn3DView',
    },
    { id: 'toggleSlabView', type: 'Slab', name: 'スラブ' },
    { id: 'toggleWallView', type: 'Wall', name: '壁' },
    {
      id: 'toggleParapetView',
      type: 'Parapet',
      name: 'パラペット',
      solidViewId: 'toggleParapet3DView',
    },
    { id: 'toggleAxisView', type: 'Axis', name: '通り芯' },
    { id: 'toggleStoryView', type: 'Story', name: '階' },
  ];

  elementToggleIds.forEach(({ id, type, name, solidViewId }) => {
    const checkbox = document.getElementById(id);
    if (checkbox) {
      checkbox.addEventListener('change', function () {
        const elementGroup = elementGroups[type];
        const solidViewCheckbox = solidViewId ? document.getElementById(solidViewId) : null;

        if (elementGroup) {
          elementGroup.visible = this.checked;
          log.debug(`${name}表示:`, this.checked);

          if (solidViewCheckbox) {
            solidViewCheckbox.disabled = !this.checked;
          }

          if (scheduleRender) scheduleRender();
        }
      });
    }
  });
}

/**
 * モデル表示切り替えリスナーを設定
 * @param {Function} scheduleRender - 再描画要求関数
 * @param {Function} updateModelVisibility - モデル表示更新関数
 */
function setupModelVisibilityListeners(scheduleRender, updateModelVisibility) {
  const toggleModelACheckbox = document.getElementById('toggleModelA');
  if (toggleModelACheckbox) {
    toggleModelACheckbox.addEventListener('change', function () {
      modelVisibilityManager.setModelVisibility('A', this.checked);
      log.info('Model A visibility changed:', this.checked);
      if (updateModelVisibility) {
        updateModelVisibility(scheduleRender);
      }
    });
  }

  const toggleModelBCheckbox = document.getElementById('toggleModelB');
  if (toggleModelBCheckbox) {
    toggleModelBCheckbox.addEventListener('change', function () {
      modelVisibilityManager.setModelVisibility('B', this.checked);
      log.info('Model B visibility changed:', this.checked);
      if (updateModelVisibility) {
        updateModelVisibility(scheduleRender);
      }
    });
  }
}

/**
 * カメラモード関連のイベントリスナーを設定
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setupCameraModeListeners(scheduleRender) {
  log.debug('[setupCameraModeListeners] Initializing camera mode listeners');

  const cameraPerspective = document.getElementById('cameraPerspective');
  const cameraOrthographic = document.getElementById('cameraOrthographic');
  const viewDirectionPanel = document.getElementById('viewDirectionPanel');

  if (!cameraPerspective || !cameraOrthographic) {
    log.warn('[setupCameraModeListeners] Camera mode radio buttons not found in DOM');
    return;
  }

  // ボタン形式のカメラモード切り替え
  const cameraPerspectiveBtn = document.getElementById('cameraPerspectiveBtn');
  const cameraOrthographicBtn = document.getElementById('cameraOrthographicBtn');

  // パネル上部の常時表示ボタン
  const viewModePerspectiveBtn = document.getElementById('viewModePerspectiveBtn');
  const viewModeOrthographicBtn = document.getElementById('viewModeOrthographicBtn');
  const viewDirectionButtons = document.getElementById('viewDirectionButtons');

  /**
   * すべての表示モードボタンのアクティブ状態を同期
   */
  function syncViewModeButtons(mode) {
    const isPerspective = mode === 'perspective';

    if (cameraPerspectiveBtn) {
      cameraPerspectiveBtn.classList.toggle('active', isPerspective);
    }
    if (cameraOrthographicBtn) {
      cameraOrthographicBtn.classList.toggle('active', !isPerspective);
    }
    if (viewModePerspectiveBtn) {
      viewModePerspectiveBtn.classList.toggle('active', isPerspective);
    }
    if (viewModeOrthographicBtn) {
      viewModeOrthographicBtn.classList.toggle('active', !isPerspective);
    }

    // 視点方向ボタンの表示制御
    if (viewDirectionButtons) {
      viewDirectionButtons.style.display = isPerspective ? 'none' : 'flex';
    }
    if (viewDirectionPanel) {
      viewDirectionPanel.style.display = isPerspective ? 'none' : 'block';
    }

    // 2Dクリッピング表示の更新
    eventBus.emit(ViewEvents.CAMERA_MODE_CHANGED, {
      mode: isPerspective ? 'perspective' : 'orthographic',
      is2DMode: !isPerspective,
    });
  }

  /**
   * カメラモードを設定
   */
  function setMode(mode) {
    setCameraMode(mode);
    syncViewModeButtons(mode);

    cameraPerspective.checked = mode === 'perspective';
    cameraOrthographic.checked = mode === 'orthographic';

    log.debug('カメラモード:', mode);
    if (scheduleRender) scheduleRender();
  }

  // ラジオボタンのリスナー
  cameraPerspective.addEventListener('change', () => {
    if (cameraPerspective.checked) {
      setMode('perspective');
    }
  });

  cameraOrthographic.addEventListener('change', () => {
    if (cameraOrthographic.checked) {
      setMode('orthographic');
    }
  });

  // ボタン形式のリスナー
  if (cameraPerspectiveBtn) {
    cameraPerspectiveBtn.addEventListener('click', () => setMode('perspective'));
  }
  if (cameraOrthographicBtn) {
    cameraOrthographicBtn.addEventListener('click', () => setMode('orthographic'));
  }
  if (viewModePerspectiveBtn) {
    viewModePerspectiveBtn.addEventListener('click', () => setMode('perspective'));
  }
  if (viewModeOrthographicBtn) {
    viewModeOrthographicBtn.addEventListener('click', () => setMode('orthographic'));
  }

  // 視点方向ボタン
  setupViewDirectionButtons(scheduleRender);

  // 初期状態の同期
  const currentMode = cameraPerspective.checked ? 'perspective' : 'orthographic';
  syncViewModeButtons(currentMode);
}

/**
 * 視点方向ボタンのリスナーを設定
 * @param {Function} scheduleRender - 再描画要求関数
 */
function setupViewDirectionButtons(scheduleRender) {
  const viewDirectionConfigs = [
    { id: 'viewXY', view: 'top' },
    { id: 'viewXYBtn', view: 'top' },
    { id: 'viewXZ', view: 'front' },
    { id: 'viewXZBtn', view: 'front' },
    { id: 'viewYZ', view: 'side' },
    { id: 'viewYZBtn', view: 'side' },
  ];

  viewDirectionConfigs.forEach(({ id, view }) => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('click', () => {
        setView(view, scheduleRender);
        log.debug('視点方向:', view);
      });
    }
  });
}

/**
 * 初期ロード時の表示モードを判定
 * @returns {Object} 再描画が必要な要素タイプのマップ
 */
export function getInitialRedrawNeeds() {
  return {
    Column: displayModeManager.getDisplayMode('Column') === 'solid',
    Post: displayModeManager.getDisplayMode('Post') === 'solid',
    Beam:
      displayModeManager.getDisplayMode('Beam') === 'solid' ||
      displayModeManager.getDisplayMode('Girder') === 'solid',
    Brace: displayModeManager.getDisplayMode('Brace') === 'solid',
    Pile: displayModeManager.getDisplayMode('Pile') === 'solid',
    Footing: displayModeManager.getDisplayMode('Footing') === 'solid',
    FoundationColumn: displayModeManager.getDisplayMode('FoundationColumn') === 'solid',
    Slab: true, // 常に再描画
    Wall: true, // 常に再描画
    Parapet: displayModeManager.getDisplayMode('Parapet') === 'solid',
  };
}

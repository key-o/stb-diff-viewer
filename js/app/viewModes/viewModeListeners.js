/**
 * @fileoverview 表示モードイベントリスナー
 *
 * このファイルは、表示モード関連のUI要素のイベントリスナーを管理します:
 * - UI要素（チェックボックス、ボタン）のイベントリスナー設定
 * - 表示モード切り替えイベントの処理
 * - モデル表示/非表示の制御
 * - 要素タイプごとの表示切り替え
 */

import { createLogger } from '../../utils/logger.js';
import { VIEW_MODE_CHECKBOX_IDS } from '../../config/uiElementConfig.js';
import {
  elementGroups,
  SUPPORTED_ELEMENTS,
  displayModeManager,
  modelVisibilityManager,
} from '../../viewer/index.js';
import {
  redrawElementByType,
  redrawBeamsForViewMode,
  redrawJointsForViewMode,
} from './elementRedrawer.js';
import { updateLabelVisibility } from '../../ui/viewer3d/unifiedLabelManager.js';
import { updateStbExportStatus } from '../dxfLoader.js';
import { getState, setState } from '../globalState.js';
import {
  isVisibleByStructuralFilter,
  setStructuralSystemVisible,
} from './structuralSystemFilter.js';

// ロガー
const log = createLogger('viewModeListeners');

/**
 * 汎用: 要素の表示モードを設定
 * @param {string} elementType - 要素タイプ（"Column", "Beam"等）
 * @param {string} mode - "line" または "solid"
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setElementViewMode(elementType, mode, scheduleRender) {
  if (mode !== 'line' && mode !== 'solid') return;

  // common/viewerモードの場合はアダプター経由で表示モード設定
  const useCommonViewer = getState('viewer.useCommonViewer');
  const adapter = getState('viewer.adapter');

  if (useCommonViewer && adapter) {
    adapter.setDisplayMode(elementType, mode);
    return;
  }

  // 通常モード
  displayModeManager.setDisplayMode(elementType, mode);

  // Beam/Girderは特殊ケース
  if (elementType === 'Beam' || elementType === 'Girder') {
    redrawBeamsForViewMode(scheduleRender);
  } else if (elementType === 'Joint') {
    redrawJointsForViewMode(scheduleRender);
  } else {
    redrawElementByType(elementType, scheduleRender);
  }
}

/**
 * 柱の表示モードを設定
 * @param {string} mode - "line" または "solid"
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setColumnViewMode(mode, scheduleRender) {
  setElementViewMode('Column', mode, scheduleRender);
}

/**
 * 間柱の表示モードを設定
 * @param {string} mode - "line" または "solid"
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setPostViewMode(mode, scheduleRender) {
  setElementViewMode('Post', mode, scheduleRender);
}

/**
 * 梁の表示モードを設定
 * @param {string} mode - "line" または "solid"
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setBeamViewMode(mode, scheduleRender) {
  setElementViewMode('Beam', mode, scheduleRender);
}

/**
 * ブレースの表示モードを設定
 * @param {string} mode - "line" または "solid"
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setBraceViewMode(mode, scheduleRender) {
  setElementViewMode('Brace', mode, scheduleRender);
}

/**
 * 杭の表示モードを設定
 * @param {string} mode - "line" または "solid"
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setPileViewMode(mode, scheduleRender) {
  setElementViewMode('Pile', mode, scheduleRender);
}

/**
 * 基礎の表示モードを設定
 * @param {string} mode - "line" または "solid"
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setFootingViewMode(mode, scheduleRender) {
  setElementViewMode('Footing', mode, scheduleRender);
}

/**
 * 基礎柱の表示モードを設定
 * @param {string} mode - "line" または "solid"
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setFoundationColumnViewMode(mode, scheduleRender) {
  setElementViewMode('FoundationColumn', mode, scheduleRender);
}

/**
 * モデルの表示状態を設定
 * @param {string} model - "A" または "B"
 * @param {boolean} visible - 表示状態
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setModelVisibility(model, visible, scheduleRender) {
  // common/viewerモードの場合はアダプター経由で表示設定
  const useCommonViewer = getState('viewer.useCommonViewer');
  const adapter = getState('viewer.adapter');

  if (useCommonViewer && adapter) {
    adapter.setModelVisibility(model, visible);
    return;
  }

  // 通常モード
  const success = modelVisibilityManager.setModelVisibility(model, visible);
  if (success) {
    updateModelVisibility(scheduleRender);
  }
}

/**
 * モデルの表示状態を取得
 * @param {string} model - "A" または "B"
 * @returns {boolean} 現在の表示状態
 */
export function getModelVisibility(model) {
  return modelVisibilityManager.isModelVisible(model);
}

/**
 * モデル表示状態に基づいてオブジェクトの表示/非表示を更新
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function updateModelVisibility(scheduleRender) {
  log.debug(
    `Updating model visibility: A=${modelVisibilityManager.isModelVisible(
      'A',
    )}, B=${modelVisibilityManager.isModelVisible('B')}`,
  );

  SUPPORTED_ELEMENTS.forEach((elementType) => {
    const group = elementGroups[elementType];
    if (group) {
      group.children.forEach((child) => {
        if (child.userData && child.userData.modelSource) {
          const source = child.userData.modelSource;
          let shouldBeVisible = false;
          if (source === 'A' && modelVisibilityManager.isModelVisible('A')) {
            shouldBeVisible = true;
          } else if (source === 'B' && modelVisibilityManager.isModelVisible('B')) {
            shouldBeVisible = true;
          } else if (
            source === 'matched' &&
            (modelVisibilityManager.isModelVisible('A') ||
              modelVisibilityManager.isModelVisible('B'))
          ) {
            // matched はどちらかのモデルが表示されていれば表示
            shouldBeVisible = true;
          } else if (
            source === 'mismatch' &&
            (modelVisibilityManager.isModelVisible('A') ||
              modelVisibilityManager.isModelVisible('B'))
          ) {
            // mismatch はどちらかのモデルが表示されていれば表示
            shouldBeVisible = true;
          }
          // 要素タイプ自体の表示状態も考慮する
          const elementCheckbox = document.querySelector(
            `#elementSelector input[name="elements"][value="${elementType}"]`,
          );
          const isElementTypeVisible = elementCheckbox ? elementCheckbox.checked : false;

          // 構造種別フィルタも考慮する
          const isSystemVisible = isVisibleByStructuralFilter(elementType, child.userData);

          child.visible = shouldBeVisible && isElementTypeVisible && isSystemVisible;
        } else if (elementType === 'Axis' || elementType === 'Story') {
          // 軸と階はモデルA/Bに依存しないが、要素タイプのチェックボックスには従う
          const elementCheckbox = document.querySelector(
            `#elementSelector input[name="elements"][value="${elementType}"]`,
          );
          const isElementTypeVisible = elementCheckbox ? elementCheckbox.checked : false;
          child.visible = isElementTypeVisible;
        }
      });
    }
  });

  // ラベルの表示状態も更新
  updateLabelVisibility();

  // 再描画を要求
  if (scheduleRender) scheduleRender();
}

/**
 * 表示モード関連のイベントリスナーを設定
 * ファクトリーパターンを使用して、要素タイプ別のリスナーを統一
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setupViewModeListeners(scheduleRender) {
  // ==========================================================================
  // 立体/線表示モード切替リスナー（VIEW_MODE_CHECKBOX_IDSを使用した統一ループ）
  // ==========================================================================
  Object.entries(VIEW_MODE_CHECKBOX_IDS).forEach(([elementType, checkboxId]) => {
    const checkbox = document.getElementById(checkboxId);
    if (!checkbox) return;

    checkbox.addEventListener('change', function () {
      const mode = this.checked ? 'solid' : 'line';
      displayModeManager.setDisplayMode(elementType, mode);

      // Beam/Girderは特殊ケース（redrawBeamsForViewModeで両方処理）
      if (elementType === 'Beam' || elementType === 'Girder') {
        redrawBeamsForViewMode(scheduleRender);
      } else if (elementType === 'Joint') {
        redrawJointsForViewMode(scheduleRender);
      } else {
        // ファクトリーパターンを使用した汎用再描画
        redrawElementByType(elementType, scheduleRender);
      }

      updateStbExportStatus();
      log.info(`${elementType}表示モード:`, mode);
    });
  });

  // ==========================================================================
  // 節点表示切替リスナー
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

  // 柱カテゴリ表示切替リスナー（立体表示チェックボックスと連動）
  const columnElementCheckbox = document.querySelector('input[name="elements"][value="Column"]');
  if (columnElementCheckbox) {
    columnElementCheckbox.addEventListener('change', function () {
      const elementGroup = elementGroups['Column'];
      const solidViewCheckbox = document.getElementById('toggleColumnView');

      if (elementGroup) {
        elementGroup.visible = this.checked;
        log.debug('柱カテゴリ表示:', this.checked);

        // カテゴリがオフの場合、立体表示チェックボックスを無効化
        if (solidViewCheckbox) {
          solidViewCheckbox.disabled = !this.checked;
        }

        if (scheduleRender) scheduleRender();
      }
    });
  }

  // 大梁カテゴリ表示切替リスナー（立体表示チェックボックスと連動）
  const girderElementCheckbox = document.querySelector('input[name="elements"][value="Girder"]');
  if (girderElementCheckbox) {
    girderElementCheckbox.addEventListener('change', function () {
      const elementGroup = elementGroups['Girder'];
      const solidViewCheckbox = document.getElementById('toggleGirderView');

      if (elementGroup) {
        elementGroup.visible = this.checked;
        log.debug('大梁カテゴリ表示:', this.checked);

        // カテゴリがオフの場合、立体表示チェックボックスを無効化
        if (solidViewCheckbox) {
          solidViewCheckbox.disabled = !this.checked;
        }

        if (scheduleRender) scheduleRender();
      }
    });
  }

  // 小梁カテゴリ表示切替リスナー（立体表示チェックボックスと連動）
  const beamElementCheckbox = document.querySelector('input[name="elements"][value="Beam"]');
  if (beamElementCheckbox) {
    beamElementCheckbox.addEventListener('change', function () {
      const elementGroup = elementGroups['Beam'];
      const solidViewCheckbox = document.getElementById('toggleBeam3DView');

      if (elementGroup) {
        elementGroup.visible = this.checked;
        log.debug('小梁カテゴリ表示:', this.checked);

        // カテゴリがオフの場合、立体表示チェックボックスを無効化
        if (solidViewCheckbox) {
          solidViewCheckbox.disabled = !this.checked;
        }

        if (scheduleRender) scheduleRender();
      }
    });
  }

  // 間柱カテゴリ表示切替リスナー（立体表示チェックボックスと連動）
  const postElementCheckbox = document.querySelector('input[name="elements"][value="Post"]');
  if (postElementCheckbox) {
    postElementCheckbox.addEventListener('change', function () {
      const elementGroup = elementGroups['Post'];
      const solidViewCheckbox = document.getElementById('togglePost3DView');

      if (elementGroup) {
        elementGroup.visible = this.checked;
        log.debug('間柱カテゴリ表示:', this.checked);

        // カテゴリがオフの場合、立体表示チェックボックスを無効化
        if (solidViewCheckbox) {
          solidViewCheckbox.disabled = !this.checked;
        }

        if (scheduleRender) scheduleRender();
      }
    });
  }

  // その他の要素タイプの表示切替リスナー（立体表示チェックボックスと連動）
  const elementToggleIds = [
    { id: 'toggleBraceView', type: 'Brace', name: 'ブレース', solidViewId: 'toggleBrace3DView' },
    { id: 'togglePileView', type: 'Pile', name: '杭', solidViewId: 'togglePile3DView' },
    { id: 'toggleFootingView', type: 'Footing', name: '基礎' },
    { id: 'toggleFoundationColumnView', type: 'FoundationColumn', name: '基礎柱' },
    { id: 'toggleSlabView', type: 'Slab', name: 'スラブ', solidViewId: 'toggleSlab3DView' },
    { id: 'toggleWallView', type: 'Wall', name: '壁', solidViewId: 'toggleWall3DView' },
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

          // カテゴリがオフの場合、立体表示チェックボックスを無効化
          if (solidViewCheckbox) {
            solidViewCheckbox.disabled = !this.checked;
          }

          if (scheduleRender) scheduleRender();
        }
      });
    }
  });

  // モデル表示切り替えは ui/events/modelVisibilityListeners.js で一元管理
  // ラベル表示切り替えは events.js で一元管理されるため、ここでは設定しない
  // 立体表示モードでのラベル更新は、該当する再描画関数内で処理される

  // ==========================================================================
  // 構造種別フィルタのリスナー
  // ==========================================================================
  const structuralSystemCheckboxes = document.querySelectorAll(
    'input[name="structuralSystemFilter"]',
  );
  structuralSystemCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener('change', function () {
      const [elementType, system] = this.value.split(':');
      setStructuralSystemVisible(elementType, system, this.checked);
      log.info(`構造種別フィルタ: ${elementType}/${system} = ${this.checked}`);
      updateModelVisibility(scheduleRender);
    });
  });
}

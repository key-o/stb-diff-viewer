/**
 * @fileoverview 色付けモード管理モジュール
 *
 * このファイルは、色付けモードの管理と統合APIを提供します：
 * 1. 差分表示モード（デフォルト）- モデルA/Bの差分を表示
 * 2. 部材別色付けモード - 要素タイプごとに色を設定
 * 3. スキーマエラー表示モード - スキーマチェックエラーを表示
 * 4. 重要度別色付けモード - 属性の重要度で色分け
 *
 * @module colorModes/colorModeManager
 */

import { UI_TIMING } from '../config/uiTimingConfig.js';
import { elementGroups, colorManager } from '../viewer/index.js';
import { scheduleRender } from '../utils/renderScheduler.js';

// 各色付けモードのモジュールをインポート
import {
  initializeElementColorControls,
  applyElementColorModeToAll,
  setElementColorInputsEnabled,
} from './elementColorMode.js';

import {
  initializeSchemaColorControls,
  applySchemaColorModeToAll,
  runValidationForSchemaMode,
  getSchemaError,
} from './schemaColorMode.js';

import {
  initializeImportanceColorControls,
  applyImportanceColorModeToAll,
  setupImportanceChangeListeners,
} from './importanceColorMode.js';

import { applyDiffColorModeToAll } from './diffColorMode.js';

// 色付けモードの定数
export const COLOR_MODES = {
  DIFF: 'diff',
  ELEMENT: 'element',
  SCHEMA: 'schema',
  IMPORTANCE: 'importance',
};

// 現在の色付けモード
let currentColorMode = COLOR_MODES.DIFF;

// 色モード変更のロック機構（非同期競合防止）
let isColorModeChanging = false;
let pendingColorMode = null;

/**
 * 現在の色付けモードを取得
 * @returns {string} 現在の色付けモード
 */
export function getCurrentColorMode() {
  return currentColorMode;
}

/**
 * 色付けモードを設定
 * @param {string} mode 設定する色付けモード
 */
export function setColorMode(mode) {
  if (!Object.values(COLOR_MODES).includes(mode)) {
    return;
  }

  // ロック中の場合は待機キューに追加
  if (isColorModeChanging) {
    pendingColorMode = mode;
    console.log('[ColorMode] Queued mode change:', mode);
    return;
  }

  // ロックを取得
  isColorModeChanging = true;
  currentColorMode = mode;
  updateColorModeUI();

  // モデルが読み込まれているかチェック
  import('../app/modelLoader.js').then(({ isModelLoaded }) => {
    const modelsLoaded = isModelLoaded();

    if (!modelsLoaded) {
      // UI要素の表示状態を更新
      updateColorModeUI();
      // 状況メッセージを表示
      showColorModeStatus(
        `表示モードを「${getModeDisplayName(
          mode,
        )}」に設定しました。モデル読み込み後に適用されます。`,
      );
      // ロック解除と待機キュー処理
      finishColorModeChange();
      return;
    }

    // 色付けモード変更処理
    try {
      updateElementsForColorMode();
      // 変更成功メッセージを表示
      showColorModeStatus(`「${getModeDisplayName(mode)}」モードを適用しました。`, 3000);
    } catch (error) {
      console.error('[ColorMode] Error updating elements for color mode:', error);
      // エラーメッセージを表示
      showColorModeStatus(`色付けモード変更でエラーが発生しました: ${error.message}`, 5000);
    }

    // 色付けモード変更時は確実に再描画を実行
    setTimeout(() => {
      scheduleRender();
      // ロック解除と待機キュー処理
      finishColorModeChange();
    }, UI_TIMING.COLOR_MODE_REDRAW_DELAY_MS);
  });
}

/**
 * 色モード変更完了処理（ロック解除と待機キュー処理）
 * @private
 */
function finishColorModeChange() {
  isColorModeChanging = false;

  // 待機中のモード変更があれば実行
  if (pendingColorMode !== null) {
    const nextMode = pendingColorMode;
    pendingColorMode = null;
    console.log('[ColorMode] Processing queued mode:', nextMode);
    setColorMode(nextMode);
  }
}

/**
 * 色付けモードUIの更新
 */
function updateColorModeUI() {
  const schemaSettings = document.getElementById('schema-color-settings');
  const importanceSettings = document.getElementById('importance-color-settings');
  const comparisonKeySettings = document.getElementById('comparison-key-settings');
  const diffFilterSettings = document.getElementById('diff-filter-settings');

  // ドロップダウンセレクターの値を同期
  const selector = document.getElementById('colorModeSelector');
  if (selector && selector.value !== currentColorMode) {
    selector.value = currentColorMode;
  }

  // 部材別色付けモードの色ボックスを有効/無効切替
  const isElementMode = currentColorMode === COLOR_MODES.ELEMENT;
  setElementColorInputsEnabled(isElementMode);

  if (schemaSettings && importanceSettings) {
    // 設定パネルを非表示にする
    schemaSettings.style.display = 'none';
    importanceSettings.style.display = 'none';

    // 現在のモードに応じて適切なパネルを表示
    switch (currentColorMode) {
      case COLOR_MODES.SCHEMA:
        schemaSettings.style.display = 'block';
        break;
      case COLOR_MODES.IMPORTANCE:
        importanceSettings.style.display = 'block';
        break;
      // DIFF モードと ELEMENT モードはデフォルトなので特別な表示は不要
    }
  }

  const shouldShowDiffSettings = currentColorMode === COLOR_MODES.DIFF;

  if (comparisonKeySettings) {
    comparisonKeySettings.classList.toggle('hidden', !shouldShowDiffSettings);
  }

  if (diffFilterSettings) {
    diffFilterSettings.style.display = shouldShowDiffSettings ? 'block' : 'none';
  }
}

/**
 * 色付けモードイベントリスナーを設定
 */
export function setupColorModeListeners() {
  console.log('[ColorModeManager] setupColorModeListeners() called');
  const selector = document.getElementById('colorModeSelector');
  if (selector) {
    selector.addEventListener('change', (e) => {
      setColorMode(e.target.value);
    });
  } else {
    console.warn('[ColorModeManager] colorModeSelector not found');
  }

  // 重要度設定変更時のイベントリスナーを追加
  setupImportanceChangeListeners();

  // 初期化
  colorManager.clearMaterialCache();
  initializeElementColorControls();
  initializeSchemaColorControls();
  initializeImportanceColorControls();
  updateColorModeUI();
  console.log('[ColorModeManager] setupColorModeListeners() completed');
}

/**
 * 色付けモード変更時に全ての要素を再描画する
 */
export function updateElementsForColorMode() {
  const currentMode = getCurrentColorMode();

  // モード別の特別な処理
  switch (currentMode) {
    case COLOR_MODES.IMPORTANCE:
      // 重要度モードの場合は全要素に重要度マテリアルを適用
      import('../viewer/rendering/materials.js').then(({ clearImportanceMaterialCache }) => {
        clearImportanceMaterialCache();
        applyImportanceColorModeToAll();
      });
      break;

    case COLOR_MODES.SCHEMA:
      // スキーマモードの場合は実際のバリデーションを実行
      runValidationForSchemaMode();
      applySchemaColorModeToAll();
      break;

    case COLOR_MODES.ELEMENT:
      // 部材別色付けモードの場合
      applyElementColorModeToAll();
      break;

    case COLOR_MODES.DIFF:
    default:
      // 差分表示モード（デフォルト）
      applyDiffColorModeToAll();
      break;
  }

  // Note: Slab/Wallの再描画は不要（viewModes.jsのredrawElementForViewModeで
  // updateElementsForColorModeが呼ばれるため、ここで再度redrawすると循環依存になる）
  // マテリアルの更新は各色付けモード関数（applyDiffColorModeToAll等）で処理される

  // 統合ラベル管理システムに色付けモード変更を通知
  import('../ui/viewer3d/unifiedLabelManager.js').then(({ handleColorModeChange }) => {
    if (handleColorModeChange) {
      handleColorModeChange();
    }
  });

  // 凡例を表示中の場合は内容を更新
  const legendPanel = document.getElementById('legendPanel');
  if (legendPanel && legendPanel.style.display !== 'none') {
    import('../ui/events/index.js').then(({ updateLegendContent }) => {
      updateLegendContent();
    });
  }

  // 要素情報パネルを更新（バリデーション情報の反映）
  import('../ui/panels/element-info/index.js').then(({ refreshElementInfoPanel }) => {
    if (refreshElementInfoPanel) {
      refreshElementInfoPanel();
    }
  });
}

/**
 * 色付けモード変更時の再描画をリクエスト
 */
export function requestColorModeRedraw() {
  scheduleRender();

  // さらに確実にするため、少し遅延させて再度描画をリクエスト
  setTimeout(() => {
    scheduleRender();
  }, UI_TIMING.COLOR_MODE_APPLY_DELAY_MS);
}

/**
 * 共通: 全要素にマテリアルを適用
 * @param {string} modeName - モード名（ログ用）
 */
export function applyColorModeToAllObjects(modeName) {
  // elementGroupsは直接インポートしたものを使用
  if (!elementGroups || Object.keys(elementGroups).length === 0) {
    console.warn(`[Render] ${modeName}: elementGroupsが未設定`);
    return;
  }

  // 全オブジェクトを収集
  const allObjects = [];
  const groups = Array.isArray(elementGroups) ? elementGroups : Object.values(elementGroups);

  groups.forEach((group) => {
    group.traverse((object) => {
      if ((object.isMesh || object.isLine) && object.userData && object.userData.elementType) {
        allObjects.push(object);
      }
    });
  });

  // マテリアルを適用（現在のカラーモードに基づいて自動選択される）
  import('../viewer/rendering/materials.js').then(({ getMaterialForElementWithMode }) => {
    allObjects.forEach((object) => {
      const elementType = object.userData.elementType;

      // AxisとStoryは色付けモードの対象外（独自のマテリアルを使用）
      if (elementType === 'Axis' || elementType === 'Story') {
        return;
      }
      // modelSourceを色管理の状態名にマッピング
      const modelSource = object.userData.modelSource || 'matched';
      let comparisonState;
      switch (modelSource) {
        case 'A':
          comparisonState = 'onlyA';
          break;
        case 'B':
          comparisonState = 'onlyB';
          break;
        case 'solid':
        case 'line':
          comparisonState = 'matched';
          break;
        default:
          comparisonState = modelSource;
      }
      const isLine = object.isLine || object.userData.isLine || false;
      const isPoly = object.userData.isPoly || false;
      const elementId = object.userData.elementId || null;
      const toleranceState = object.userData.toleranceState || null;

      const newMaterial = getMaterialForElementWithMode(
        elementType,
        comparisonState,
        isLine,
        isPoly,
        elementId,
        toleranceState,
      );

      if (newMaterial) {
        object.material = newMaterial;
      }
    });

    // マテリアル適用完了後に再描画をリクエスト
    requestColorModeRedraw();
  });
}

/**
 * 要素タイプに基づいてマテリアルを取得
 * @param {string} elementType 要素タイプ
 * @param {boolean} isLine 線要素かどうか
 * @param {string} elementId 要素ID（スキーマエラー判定用）
 * @returns {THREE.Material} マテリアル
 */
export function getMaterialForElement(elementType, isLine = false, elementId = null) {
  const colorMode = getCurrentColorMode();

  // ColorManagerを使用してマテリアルを取得
  switch (colorMode) {
    case COLOR_MODES.ELEMENT:
      // 部材別色付けモード
      // 注意: Storyは半透明の面として表示すべきなので、ワイヤーフレームにしない
      // Axisは別途LineBasicMaterialを使用するのでここでは不要
      return colorManager.getMaterial('element', {
        elementType,
        isLine,
        wireframe: false,
      });

    case COLOR_MODES.SCHEMA:
      // スキーマエラーチェック結果に基づく色付け
      // 注意: Storyは半透明の面として表示すべきなので、ワイヤーフレームにしない
      const errorInfo = elementId ? getSchemaError(elementId) : { status: 'valid' };

      return colorManager.getMaterial('schema', {
        elementType,
        isLine,
        status: errorInfo.status,
        wireframe: false,
      });

    case COLOR_MODES.IMPORTANCE:
      // 重要度モードは materials.js で処理するため null を返す
      return null;

    case COLOR_MODES.DIFF:
    default:
      // デフォルトの差分表示モードは既存の材料システムを使用
      return null;
  }
}

/**
 * 色付けモードの表示名を取得
 * @param {string} mode - 色付けモード
 * @returns {string} 表示名
 */
function getModeDisplayName(mode) {
  const displayNames = {
    [COLOR_MODES.DIFF]: '差分表示',
    [COLOR_MODES.ELEMENT]: '部材別色付け',
    [COLOR_MODES.SCHEMA]: 'スキーマエラー表示',
    [COLOR_MODES.IMPORTANCE]: '重要度別色付け',
  };
  return displayNames[mode] || mode;
}

/**
 * 色付けモード状況メッセージを表示
 * @param {string} message - 表示するメッセージ
 * @param {number} duration - 表示時間（ミリ秒、0で自動非表示なし）
 */
function showColorModeStatus(message, duration = 5000) {
  const statusElement = document.getElementById('color-mode-status');
  const textElement = document.getElementById('color-mode-status-text');

  if (statusElement && textElement) {
    textElement.textContent = message;
    statusElement.classList.remove('hidden');

    if (duration > 0) {
      setTimeout(() => {
        statusElement.classList.add('hidden');
      }, duration);
    }
  }
}

/**
 * モデル読み込み後にデフォルトの色付けモードを適用する
 *
 * @param {boolean} hasBothModels - 両方のモデルが読み込まれているか
 * @param {boolean} hasSingleModel - 片方のモデルのみ読み込まれているか
 * @param {Function} reapplyColorModeFn - 色モード再適用関数
 */
export function applyDefaultColorModeAfterLoad(hasBothModels, hasSingleModel, reapplyColorModeFn) {
  // デフォルトの色付けモードを決定
  let targetMode;
  if (hasBothModels) {
    targetMode = COLOR_MODES.DIFF;
  } else if (hasSingleModel) {
    targetMode = COLOR_MODES.ELEMENT;
  } else {
    targetMode = COLOR_MODES.DIFF; // フォールバック
  }

  const currentMode = getCurrentColorMode();

  // 現在のモードと異なる場合のみ変更
  if (currentMode !== targetMode) {
    setColorMode(targetMode);

    // 色付けモードが適用されたことをユーザーに通知
    const displayName = getModeDisplayName(targetMode);
    const reason = hasBothModels ? '両モデル読み込み' : '単一モデル読み込み';

    // 状況メッセージを表示（遅延付き）
    setTimeout(() => {
      showColorModeStatus(
        `${reason}のため「${displayName}」モードを自動適用しました。`,
        UI_TIMING.STATUS_MESSAGE_LONG_DURATION_MS,
      );
    }, UI_TIMING.STATUS_MESSAGE_SHOW_DELAY_MS);
  } else if (currentMode !== COLOR_MODES.DIFF) {
    // 現在のモードが維持される場合でも、DIFF以外なら再適用
    if (typeof reapplyColorModeFn === 'function') {
      reapplyColorModeFn();
    }

    const displayName = getModeDisplayName(currentMode);

    // 状況メッセージを表示（遅延付き）
    setTimeout(() => {
      showColorModeStatus(
        `「${displayName}」モードを適用しました。`,
        UI_TIMING.STATUS_MESSAGE_SHORT_DURATION_MS,
      );
    }, UI_TIMING.STATUS_MESSAGE_SHOW_DELAY_MS);
  }
}

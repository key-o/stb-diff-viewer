/**
 * @fileoverview 色付けモード管理モジュール
 *
 * このファイルは、3種類の色付けモードを管理します：
 * 1. 差分表示モード（デフォルト）- モデルA/Bの差分を表示
 * 2. 部材別色付けモード - 要素タイプごとに色を設定
 * 3. スキーマエラー表示モード - スキーマチェックエラーを表示
 */

import * as THREE from 'three';
import { getState } from './core/globalState.js';
import { applyImportanceColorMode } from './viewer/rendering/materials.js';
import { colorManager } from './viewer/rendering/colorManager.js';
import { validateAndIntegrate, getLastValidationResult, generateValidationSummaryHtml, getValidationStats } from './validation/validationIntegration.js';
// 色設定ファイル
import {
  DEFAULT_ELEMENT_COLORS,
  DEFAULT_SCHEMA_COLORS
} from './config/colorConfig.js';
import { UI_TIMING } from './config/uiTimingConfig.js';

// 色付けモードの定数
export const COLOR_MODES = {
  DIFF: 'diff',
  ELEMENT: 'element',
  SCHEMA: 'schema',
  IMPORTANCE: 'importance'
};

// 現在の色付けモード
let currentColorMode = COLOR_MODES.DIFF;

// 部材別色設定（ColorManagerと同期するため、getterを使用）
const elementColors = new Proxy(
  {},
  {
    get(target, prop) {
      return colorManager.getElementColor(prop);
    },
    set(target, prop, value) {
      colorManager.setElementColor(prop, value);
      return true;
    }
  }
);

// スキーマエラー色設定（ColorManagerと同期するため、getterを使用）
const schemaColors = new Proxy(
  {
    get valid() {
      return colorManager.getSchemaColor('valid');
    },
    set valid(value) {
      colorManager.setSchemaColor('valid', value);
    },
    get info() {
      return colorManager.getSchemaColor('info');
    },
    set info(value) {
      colorManager.setSchemaColor('info', value);
    },
    get warning() {
      return colorManager.getSchemaColor('warning');
    },
    set warning(value) {
      colorManager.setSchemaColor('warning', value);
    },
    get error() {
      return colorManager.getSchemaColor('error');
    },
    set error(value) {
      colorManager.setSchemaColor('error', value);
    }
  },
  {}
);

// スキーマエラー情報を保存するマップ
const schemaErrorMap = new Map();

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
  if (Object.values(COLOR_MODES).includes(mode)) {
    currentColorMode = mode;
    updateColorModeUI();

    // モデルが読み込まれているかチェック
    import('./modelLoader.js').then(({ isModelLoaded }) => {
      const modelsLoaded = isModelLoaded();

      if (!modelsLoaded) {
        // UI要素の表示状態を更新
        updateColorModeUI();
        // 状況メッセージを表示
        showColorModeStatus(
          `表示モードを「${getModeDisplayName(
            mode
          )}」に設定しました。モデル読み込み後に適用されます。`
        );
        return;
      }

      // 色付けモード変更処理
      try {
        updateElementsForColorMode();
        // 変更成功メッセージを表示
        showColorModeStatus(
          `「${getModeDisplayName(mode)}」モードを適用しました。`,
          3000
        );
      } catch (error) {
        console.error(
          '[ColorMode] Error updating elements for color mode:',
          error
        );
        // エラーメッセージを表示
        showColorModeStatus(
          `色付けモード変更でエラーが発生しました: ${error.message}`,
          5000
        );
      }

      // 色付けモード変更時は確実に再描画を実行
      setTimeout(() => {
        const scheduleRender = getState('rendering.scheduleRender');
        if (scheduleRender) {
          scheduleRender();
        } else {
          console.warn(
            '[ColorMode] scheduleRender not available for final redraw'
          );
        }
      }, UI_TIMING.COLOR_MODE_REDRAW_DELAY_MS);
    });
  }
}
/**
 * 色付けモードUIの更新
 */
function updateColorModeUI() {
  const elementSettings = document.getElementById('element-color-settings');
  const schemaSettings = document.getElementById('schema-color-settings');
  const importanceSettings = document.getElementById(
    'importance-color-settings'
  );
  const comparisonKeySettings = document.getElementById(
    'comparison-key-settings'
  );

  // ドロップダウンセレクターの値を同期
  const selector = document.getElementById('colorModeSelector');
  if (selector && selector.value !== currentColorMode) {
    selector.value = currentColorMode;
  }

  if (elementSettings && schemaSettings && importanceSettings) {
    // 全ての設定パネルを非表示にする
    elementSettings.style.display = 'none';
    schemaSettings.style.display = 'none';
    importanceSettings.style.display = 'none';

    // 現在のモードに応じて適切なパネルを表示
    switch (currentColorMode) {
      case COLOR_MODES.ELEMENT:
        elementSettings.style.display = 'block';
        break;
      case COLOR_MODES.SCHEMA:
        schemaSettings.style.display = 'block';
        break;
      case COLOR_MODES.IMPORTANCE:
        importanceSettings.style.display = 'block';
        break;
      // DIFF モードはデフォルトなので特別な表示は不要
    }
  }

  if (comparisonKeySettings) {
    const shouldShowComparisonKey = currentColorMode === COLOR_MODES.DIFF;
    comparisonKeySettings.classList.toggle('hidden', !shouldShowComparisonKey);
  }
}

/**
 * 部材別色設定UIを初期化
 */
export function initializeElementColorControls() {
  const container = document.getElementById('element-color-controls');
  if (!container) return;

  container.innerHTML = '';

  const elementTypes = ['Column', 'Girder', 'Beam', 'Slab', 'Wall', 'Node'];
  const elementNames = {
    Column: '柱',
    Girder: '大梁',
    Beam: '小梁',
    Slab: 'スラブ',
    Wall: '壁',
    Node: '節点'
  };

  elementTypes.forEach((type) => {
    const div = document.createElement('div');
    div.className = 'legend-item';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = colorManager.getElementColor(type);
    colorInput.className = 'legend-color-box';
    colorInput.id = `element-color-${type}`;
    colorInput.title = `${elementNames[type] || type}の色を変更`;

    colorInput.addEventListener('change', (e) => {
      // ColorManagerを使用して色を更新
      colorManager.setElementColor(type, e.target.value);
      updateElementMaterials();

      // 色プレビューも更新
      const preview = div.querySelector('.color-preview');
      if (preview) {
        preview.style.backgroundColor = e.target.value;
      }

      const scheduleRender = getState('rendering.scheduleRender');
      if (scheduleRender) scheduleRender();
    });

    const label = document.createElement('span');
    label.className = 'legend-label';
    label.textContent = elementNames[type] || type;

    // 色プレビューを追加
    const colorPreview = document.createElement('span');
    colorPreview.className = 'color-preview';
    const currentColor = colorManager.getElementColor(type);
    colorPreview.style.backgroundColor = currentColor;
    colorPreview.title = `現在の色: ${currentColor}`;

    div.appendChild(colorInput);
    div.appendChild(label);
    div.appendChild(colorPreview);
    container.appendChild(div);
  });

  // リセットボタンを追加 (ButtonManagerを使用)
  import('./ui/buttonManager.js').then(({ buttonManager }) => {
    const resetButton = buttonManager.createButton({
      type: 'reset',
      text: 'デフォルト色に戻す',
      onClick: () => resetElementColors(),
      ariaLabel: '部材色をデフォルトに戻す',
      title: '部材色をデフォルト設定に戻します',
      customStyle: {
        marginTop: '10px',
        fontSize: '0.8em',
        width: '100%'
      }
    });
    container.appendChild(resetButton);
  });
}

/**
 * スキーマ色タイプの定義
 */
const SCHEMA_COLOR_TYPES = ['valid', 'info', 'warning', 'error'];

/**
 * 単一のスキーマ色コントロールを初期化
 * @param {string} colorType - 色タイプ（valid, info, warning, error）
 */
function initializeSingleSchemaColorControl(colorType) {
  const colorInput = document.getElementById(`schema-${colorType}-color`);
  const preview = document.getElementById(`schema-${colorType}-preview`);

  // 初期の色プレビューを設定
  if (preview) {
    preview.style.backgroundColor = colorManager.getSchemaColor(colorType);
  }

  // 色変更イベントリスナーを設定
  if (colorInput) {
    colorInput.addEventListener('change', (e) => {
      colorManager.setSchemaColor(colorType, e.target.value);
      updateSchemaErrorMaterials();

      // 色プレビューを更新
      if (preview) {
        preview.style.backgroundColor = e.target.value;
        preview.title = `現在の色: ${e.target.value}`;
      }

      const scheduleRender = getState('rendering.scheduleRender');
      if (scheduleRender) scheduleRender();
    });
  }
}

/**
 * スキーマエラー色設定UIのイベントリスナーを設定
 */
export function initializeSchemaColorControls() {
  // 全ての色タイプに対してコントロールを初期化
  SCHEMA_COLOR_TYPES.forEach(initializeSingleSchemaColorControl);

  // リセットボタンを追加 (ButtonManagerを使用)
  const container = document.getElementById('schema-color-settings');
  if (container) {
    // 既存のリセットボタンがあるかチェック
    if (container.querySelector('button')) {
      return;
    }

    import('./ui/buttonManager.js').then(({ buttonManager }) => {
      const resetButton = buttonManager.createButton({
        type: 'reset',
        text: 'デフォルト色に戻す',
        onClick: () => resetSchemaColors(),
        ariaLabel: 'スキーマ色をデフォルトに戻す',
        title: 'スキーマエラー色をデフォルト設定に戻します',
        customStyle: {
          marginTop: '10px',
          fontSize: '0.8em',
          width: '100%'
        }
      });
      container.appendChild(resetButton);
    });
  }
}

/**
 * 部材別マテリアルを更新
 */
function updateElementMaterials() {
  // ColorManagerのキャッシュをクリアして再生成を促す
  colorManager.clearMaterialCache();
}

/**
 * スキーマエラー用マテリアルを更新
 */
function updateSchemaErrorMaterials() {
  // ColorManagerのキャッシュをクリアして再生成を促す
  colorManager.clearMaterialCache();
}

/**
 * 要素タイプに基づいてマテリアルを取得
 * @param {string} elementType 要素タイプ
 * @param {boolean} isLine 線要素かどうか
 * @param {string} elementId 要素ID（スキーマエラー判定用）
 * @returns {THREE.Material} マテリアル
 */
export function getMaterialForElement(
  elementType,
  isLine = false,
  elementId = null
) {
  const colorMode = getCurrentColorMode();

  // ColorManagerを使用してマテリアルを取得
  switch (colorMode) {
    case COLOR_MODES.ELEMENT:
      // 部材別色付けモード
      return colorManager.getMaterial('element', {
        elementType,
        isLine,
        wireframe: elementType === 'Axis' || elementType === 'Story'
      });

    case COLOR_MODES.SCHEMA:
      // スキーマエラーチェック結果に基づく色付け
      const errorInfo = elementId
        ? getSchemaError(elementId)
        : { status: 'valid' };

      return colorManager.getMaterial('schema', {
        elementType,
        isLine,
        status: errorInfo.status,
        wireframe: elementType === 'Axis' || elementType === 'Story'
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
 * 色付けモードイベントリスナーを設定
 */
export function setupColorModeListeners() {
  const selector = document.getElementById('colorModeSelector');
  if (selector) {
    selector.addEventListener('change', (e) => {
      setColorMode(e.target.value);
    });
  }

  // 重要度設定変更時のイベントリスナーを追加
  setupImportanceChangeListeners();

  // 初期化
  updateElementMaterials();
  initializeElementColorControls();
  initializeSchemaColorControls();
  initializeImportanceColorControls();
  updateColorModeUI();
}

/**
 * 重要度変更イベントリスナーを設定
 */
function setupImportanceChangeListeners() {
  // 重要度設定変更時のグローバルイベントリスナー
  window.addEventListener('importanceSettingsChanged', (event) => {
    // 重要度モードが有効な場合は色分けを更新
    if (getCurrentColorMode() === COLOR_MODES.IMPORTANCE) {
      // 少し遅延させて実行（要素の重要度データ更新を待つ）
      setTimeout(() => {
        applyImportanceColorModeToAll();

        // 凡例も更新
        const legendPanel = document.getElementById('legendPanel');
        if (legendPanel && legendPanel.style.display !== 'none') {
          import('./ui/events.js').then(({ updateLegendContent }) => {
            updateLegendContent();
          });
        }

        // 再描画をリクエスト
        const scheduleRender = getState('rendering.scheduleRender');
        if (scheduleRender) {
          scheduleRender();
        }
      }, UI_TIMING.COLOR_MODE_APPLY_DELAY_MS);
    }
  });

  // 重要度フィルタ変更時のイベントリスナー
  window.addEventListener('importanceFilterChanged', (event) => {
    // 重要度モードが有効な場合は表示を更新
    // フィルタ変更は表示・非表示の切り替えなので、色分けの再適用は不要
  });

  // モデル比較完了時のイベントリスナー
  window.addEventListener('updateComparisonStatistics', (event) => {
    // 重要度モードが有効な場合は新しい要素に色分けを適用
    if (getCurrentColorMode() === COLOR_MODES.IMPORTANCE) {
      setTimeout(() => {
        applyImportanceColorModeToAll();

        // 再描画をリクエスト
        const scheduleRender = getState('rendering.scheduleRender');
        if (scheduleRender) {
          scheduleRender();
        }
      }, UI_TIMING.IMPORTANCE_COLOR_APPLY_DELAY_MS);
    }
  });
}

/**
 * 重要度色設定UIを初期化
 */
function initializeImportanceColorControls() {
  const container = document.getElementById('importance-color-controls');
  if (!container) return;

  // 重要度設定をインポートして色設定コントロールを生成
  import('./core/importanceManager.js').then(
    ({ IMPORTANCE_LEVELS, IMPORTANCE_LEVEL_NAMES }) => {
      import('./config/importanceConfig.js').then(({ IMPORTANCE_COLORS }) => {
        container.innerHTML = '';

        // ランタイム色設定を初期化
        if (!window.runtimeImportanceColors) {
          window.runtimeImportanceColors = { ...IMPORTANCE_COLORS };
        }

        Object.entries(IMPORTANCE_LEVELS).forEach(([key, level]) => {
          const color =
            window.runtimeImportanceColors[level] || IMPORTANCE_COLORS[level];
          const name = IMPORTANCE_LEVEL_NAMES[level];

          const item = document.createElement('div');
          item.className = 'legend-item';
          item.innerHTML = `
          <input
            type="color"
            id="importance-${level}-color"
            value="${color}"
            class="legend-color-box"
            title="${name}の色を変更"
          />
          <span class="legend-label">${name}</span>
          <span
            class="color-preview"
            id="importance-${level}-preview"
            style="background-color: ${color};"
            title="現在の色: ${color}"
          ></span>
        `;

          container.appendChild(item);

          // 色変更イベントリスナーを追加
          const colorInput = item.querySelector(`#importance-${level}-color`);
          const preview = item.querySelector(`#importance-${level}-preview`);

          colorInput.addEventListener('change', (e) => {
            const newColor = e.target.value;
            preview.style.backgroundColor = newColor;
            preview.title = `現在の色: ${newColor}`;

            // 重要度色設定を更新
            updateImportanceColor(level, newColor);
          });

          // リアルタイム色変更（input イベント）
          colorInput.addEventListener('input', (e) => {
            const newColor = e.target.value;
            preview.style.backgroundColor = newColor;
            preview.title = `現在の色: ${newColor}`;
          });
        });

        // リセットボタンを追加 (ButtonManagerを使用)
        import('./ui/buttonManager.js').then(
          ({ buttonManager: importanceBtnManager }) => {
            const resetButton = importanceBtnManager.createButton({
              type: 'reset',
              text: 'デフォルト色に戻す',
              onClick: () => resetImportanceColors(),
              ariaLabel: '重要度色をデフォルトに戻す',
              title: '重要度色をデフォルト設定に戻します',
              customStyle: {
                marginTop: '10px',
                fontSize: '0.8em',
                width: '100%'
              }
            });
            container.appendChild(resetButton);
          }
        );
      });
    }
  );
}

/**
 * 重要度色設定をデフォルトにリセット
 */
export function resetImportanceColors() {
  import('./config/importanceConfig.js').then(({ IMPORTANCE_COLORS }) => {
    // ColorManagerを使用して色をリセット
    Object.entries(IMPORTANCE_COLORS).forEach(([level, color]) => {
      colorManager.setImportanceColor(level, color);
    });

    // ランタイム色設定をデフォルトに戻す
    window.runtimeImportanceColors = { ...IMPORTANCE_COLORS };

    // UIの色設定コントロールを更新
    initializeImportanceColorControls();

    // 重要度モードが有効な場合は即座に適用
    if (getCurrentColorMode() === COLOR_MODES.IMPORTANCE) {
      import('./viewer/rendering/materials.js').then(
        ({ clearImportanceMaterialCache }) => {
          clearImportanceMaterialCache();
          updateElementsForColorMode();
        }
      );
    }

  });
}

/**
 * 部材別色設定をデフォルトにリセット
 */
export function resetElementColors() {
  // ColorManagerを使用して色をリセット
  Object.entries(DEFAULT_ELEMENT_COLORS).forEach(([type, color]) => {
    colorManager.setElementColor(type, color);
  });

  // UIの色設定コントロールを更新
  initializeElementColorControls();

  // 部材別モードが有効な場合は即座に適用
  if (getCurrentColorMode() === COLOR_MODES.ELEMENT) {
    updateElementMaterials();
    updateElementsForColorMode();
  }
}

/**
 * スキーマエラー色設定をデフォルトにリセット
 */
export function resetSchemaColors() {
  // ColorManagerを使用して色をリセット
  colorManager.setSchemaColor('valid', DEFAULT_SCHEMA_COLORS.valid);
  colorManager.setSchemaColor('info', DEFAULT_SCHEMA_COLORS.info);
  colorManager.setSchemaColor('warning', DEFAULT_SCHEMA_COLORS.warning);
  colorManager.setSchemaColor('error', DEFAULT_SCHEMA_COLORS.error);

  // UIの色設定コントロールを更新
  const updateColorInput = (id, color) => {
    const input = document.getElementById(id);
    const preview = document.getElementById(id.replace('-color', '-preview'));
    if (input) input.value = color;
    if (preview) {
      preview.style.backgroundColor = color;
      preview.title = `現在の色: ${color}`;
    }
  };

  updateColorInput('schema-valid-color', DEFAULT_SCHEMA_COLORS.valid);
  updateColorInput('schema-info-color', DEFAULT_SCHEMA_COLORS.info);
  updateColorInput('schema-warning-color', DEFAULT_SCHEMA_COLORS.warning);
  updateColorInput('schema-error-color', DEFAULT_SCHEMA_COLORS.error);

  // スキーマエラーモードが有効な場合は即座に適用
  if (getCurrentColorMode() === COLOR_MODES.SCHEMA) {
    updateSchemaErrorMaterials();
    updateElementsForColorMode();
  }
}

/**
 * パフォーマンス統計を表示
 */
export function showImportancePerformanceStats() {
  import('./viewer/rendering/materials.js').then(
    ({ getImportanceRenderingStats }) => {
      const stats = getImportanceRenderingStats();
      const elementGroups = getState('elementGroups');

      let totalObjects = 0;
      if (elementGroups) {
        elementGroups.forEach((group) => {
          group.traverse((object) => {
            if (object.isMesh) totalObjects++;
          });
        });
      }

      const perfInfo = {
        totalObjects,
        ...stats,
        currentColorMode: getCurrentColorMode(),
        isImportanceMode: getCurrentColorMode() === COLOR_MODES.IMPORTANCE
      };

      console.group('🎨 重要度色分けパフォーマンス統計');
      console.log('総オブジェクト数:', perfInfo.totalObjects);
      console.log('マテリアルキャッシュサイズ:', perfInfo.materialCacheSize);
      console.log('ランタイム色設定有効:', perfInfo.runtimeColorsActive);
      console.log('カスタム色数:', perfInfo.runtimeColorCount);
      console.log('現在の色分けモード:', perfInfo.currentColorMode);
      console.log('重要度モード有効:', perfInfo.isImportanceMode);
      console.groupEnd();

      return perfInfo;
    }
  );
}

/**
 * 重要度色を更新
 * @param {string} importanceLevel - 重要度レベル
 * @param {string} color - 新しい色
 */
function updateImportanceColor(importanceLevel, color) {
  // ColorManagerを使用して色を更新
  colorManager.setImportanceColor(importanceLevel, color);

  // 重要度モードが有効な場合は即座に適用
  if (getCurrentColorMode() === COLOR_MODES.IMPORTANCE) {
    // マテリアルキャッシュをクリアして再生成
    import('./viewer/rendering/materials.js').then(
      ({ clearImportanceMaterialCache }) => {
        clearImportanceMaterialCache();
        updateElementsForColorMode();
      }
    );
  }
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
      // まず重要度マテリアルキャッシュをクリア
      import('./viewer/rendering/materials.js').then(
        ({ clearImportanceMaterialCache }) => {
          clearImportanceMaterialCache();
          // その後、重要度色分けを適用
          applyImportanceColorModeToAll();
          // 再描画をリクエスト
          requestColorModeRedraw();
        }
      );
      break;

    case COLOR_MODES.SCHEMA:
      // スキーマモードの場合は実際のバリデーションを実行
      runValidationForSchemaMode();
      // 直接的にマテリアルを適用
      applySchemaColorModeToAll();
      // 再描画をリクエスト
      requestColorModeRedraw();
      break;

    case COLOR_MODES.ELEMENT:
      // 部材別色付けモードの場合
      // 直接的にマテリアルを適用
      applyElementColorModeToAll();
      // 再描画をリクエスト
      requestColorModeRedraw();
      break;

    case COLOR_MODES.DIFF:
    default:
      // 差分表示モード（デフォルト）
      // 直接的にマテリアルを適用
      applyDiffColorModeToAll();
      // 再描画をリクエスト
      requestColorModeRedraw();
      break;
  }

  // 統合ラベル管理システムに色付けモード変更を通知
  import('./ui/unifiedLabelManager.js').then(({ handleColorModeChange }) => {
    if (handleColorModeChange) {
      handleColorModeChange();
    }
  });

  // 凡例を表示中の場合は内容を更新
  const legendPanel = document.getElementById('legendPanel');
  if (legendPanel && legendPanel.style.display !== 'none') {
    // 凡例更新関数をインポートして実行
    import('./ui/events.js').then(({ updateLegendContent }) => {
      updateLegendContent();
    });
  }

  // 要素情報パネルを更新（バリデーション情報の反映）
  import('./viewer/ui/elementInfoDisplay.js').then(({ refreshElementInfoPanel }) => {
    if (refreshElementInfoPanel) {
      refreshElementInfoPanel();
    }
  });
}

/**
 * 色付けモード変更時の再描画をリクエスト
 */
function requestColorModeRedraw() {
  const scheduleRender = getState('rendering.scheduleRender');
  if (scheduleRender) {
    scheduleRender();

    // さらに確実にするため、少し遅延させて再度描画をリクエスト
    setTimeout(() => {
      scheduleRender();
    }, UI_TIMING.COLOR_MODE_APPLY_DELAY_MS);
  } else {
    console.warn('[ColorMode] scheduleRender not available');

    // scheduleRenderが利用できない場合、直接renderer.render()を呼び出す
    const renderer = getState('rendering.renderer');
    const scene = getState('rendering.scene');
    const camera = getState('rendering.camera');

    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }
}

/**
 * 全要素を再構築する
 */
function rebuildAllElements() {
  // modelLoader の再読み込み機能を使用
  import('./modelLoader.js').then(({ reapplyColorMode }) => {
    if (reapplyColorMode) {
      // シーンが利用可能かチェック
      const scene = getState('rendering.scene');
      if (scene) {
        reapplyColorMode();
      } else {
        console.warn(
          '[ColorMode] Scene not available, skipping reapplyColorMode'
        );
        // 少し遅延させて再試行
        setTimeout(() => {
          const retryScene = getState('rendering.scene');
          if (retryScene) {
            reapplyColorMode();
          } else {
            console.warn('[ColorMode] Scene still not available after retry');
          }
        }, UI_TIMING.COLOR_MODE_APPLY_DELAY_MS);
      }
    } else {
      console.warn('[ColorMode] reapplyColorMode function not available');
      // フォールバック: 全シーンを再構築
      rebuildScene();
    }
  });
}

/**
 * シーンの再構築（フォールバック）
 */
function rebuildScene() {
  // compareModels 関数を使用してモデルを再表示
  import('./modelLoader.js').then(({ compareModels }) => {
    if (compareModels) {
      const scheduleRender = getState('rendering.scheduleRender');
      const camera = getState('camera');
      const controls = getState('controls');
      compareModels(scheduleRender, { camera, controls });
    } else {
      console.warn('[ColorMode] compareModels function not available');
    }
  });
}

/**
 * 共通: 全要素にマテリアルを適用
 * @param {string} modeName - モード名（ログ用）
 * @private
 */
function applyColorModeToAllObjects(modeName) {
  const elementGroups = getState('elementGroups');
  if (!elementGroups) {
    console.warn(`[${modeName}] elementGroups not found in global state`);
    return;
  }

  // 全オブジェクトを収集
  const allObjects = [];
  const groups = Array.isArray(elementGroups)
    ? elementGroups
    : Object.values(elementGroups);

  groups.forEach((group) => {
    group.traverse((object) => {
      if (
        (object.isMesh || object.isLine) &&
        object.userData &&
        object.userData.elementType
      ) {
        allObjects.push(object);
      }
    });
  });

  // マテリアルを適用（現在のカラーモードに基づいて自動選択される）
  import('./viewer/rendering/materials.js').then(
    ({ getMaterialForElementWithMode }) => {
      allObjects.forEach((object) => {
        const elementType = object.userData.elementType;
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
            // 表示モード（solid/line）は比較状態ではないので、matchedとして扱う
            comparisonState = 'matched';
            break;
          default:
            // 'matched', 'mismatch' はそのまま使用
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
          toleranceState
        );

        if (newMaterial) {
          object.material = newMaterial;
        }
      });

    }
  );
}

/**
 * 全要素に部材別色分けを適用
 */
function applyElementColorModeToAll() {
  applyColorModeToAllObjects('ElementColorMode');
}

/**
 * 全要素にスキーマエラー色分けを適用
 */
function applySchemaColorModeToAll() {
  applyColorModeToAllObjects('SchemaColorMode');
}

/**
 * 全要素に差分色分けを適用
 */
function applyDiffColorModeToAll() {
  applyColorModeToAllObjects('DiffColorMode');
}

/**
 * 全要素に重要度色分けを適用
 */
function applyImportanceColorModeToAll() {
  const elementGroups = getState('elementGroups');
  if (!elementGroups) {
    console.warn(
      '[ImportanceColorMode] elementGroups not found in global state'
    );
    return;
  }

  // 全オブジェクトを収集
  const allObjects = [];
  // elementGroups may be an object, so iterate its values
  const groups = Array.isArray(elementGroups)
    ? elementGroups
    : Object.values(elementGroups);

  groups.forEach((group) => {
    group.traverse((object) => {
      if (object.isMesh) {
        allObjects.push(object);
      }
    });
  });

  // オブジェクト数に応じて処理方法を選択
  const objectCount = allObjects.length;
  const useBatchProcessing = objectCount > 200; // 200個以上でバッチ処理を使用

  if (useBatchProcessing) {
    // バッチ処理を使用
    import('./viewer/rendering/materials.js').then(
      ({ applyImportanceColorModeBatch }) => {
        const batchOptions = {
          batchSize: Math.max(50, Math.min(200, Math.floor(objectCount / 10))), // 動的バッチサイズ
          delay: 5 // 短い遅延でスムーズな処理
        };

        applyImportanceColorModeBatch(allObjects, batchOptions);
      }
    );
  } else {
    // 通常処理
    allObjects.forEach((object) => {
      applyImportanceColorMode(object);
    });

    // 再描画をリクエスト
    const scheduleRender = getState('rendering.scheduleRender');
    if (scheduleRender) {
      scheduleRender();
    }
  }
}

// 部材色設定の取得
export function getElementColors() {
  // ColorManagerから最新の色設定を取得
  const colors = {};
  Object.keys(DEFAULT_ELEMENT_COLORS).forEach((type) => {
    colors[type] = colorManager.getElementColor(type);
  });
  return colors;
}

// スキーマ色設定の取得
export function getSchemaColors() {
  return {
    valid: colorManager.getSchemaColor('valid'),
    info: colorManager.getSchemaColor('info'),
    warning: colorManager.getSchemaColor('warning'),
    error: colorManager.getSchemaColor('error')
  };
}

/**
 * 要素のスキーマエラー情報を設定
 * @param {string} elementId 要素ID
 * @param {string|boolean} status エラー状態 ('valid', 'info', 'warning', 'error') または hasError (boolean)
 * @param {string[]} errorMessages エラーメッセージの配列
 */
export function setSchemaError(elementId, status, errorMessages = []) {
  // 後方互換性のため、booleanの場合は変換
  let normalizedStatus = status;
  if (typeof status === 'boolean') {
    normalizedStatus = status ? 'error' : 'valid';
  }

  schemaErrorMap.set(elementId, {
    status: normalizedStatus,
    errorMessages
  });
}

/**
 * 要素のスキーマエラー情報を取得
 * @param {string} elementId 要素ID
 * @returns {object} エラー情報オブジェクト
 */
export function getSchemaError(elementId) {
  return (
    schemaErrorMap.get(elementId) || {
      status: 'valid',
      errorMessages: []
    }
  );
}

/**
 * 全てのスキーマエラー情報をクリア
 */
export function clearSchemaErrors() {
  schemaErrorMap.clear();
}

/**
 * スキーマエラーの統計情報を取得
 * @returns {object} 統計情報
 */
export function getSchemaErrorStats() {
  const totalElements = schemaErrorMap.size;
  let errorElements = 0;

  schemaErrorMap.forEach((errorInfo) => {
    if (errorInfo.hasError) {
      errorElements++;
    }
  });

  return {
    totalElements,
    errorElements,
    validElements: totalElements - errorElements
  };
}

/**
 * スキーマモード用バリデーション実行
 * 読み込まれているモデルに対してバリデーションを実行し、結果をスキーマエラー表示に連携
 */
function runValidationForSchemaMode() {
  // 読み込まれているドキュメントを取得
  const docA = window.docA;
  const docB = window.docB;

  if (!docA && !docB) {
    console.warn('[ColorMode] No documents loaded for validation');
    // デモエラーをフォールバックとして設定
    setDemoSchemaErrors();
    return;
  }

  // モデルAをバリデーション
  if (docA) {
    validateAndIntegrate(docA);
  }

  // モデルBも同様にバリデーション（必要に応じて）
  // 現在はモデルAのみ
  if (docB && !docA) {
    validateAndIntegrate(docB);
  }

  // バリデーションサマリーをステータスバーに表示
  const lastResult = getLastValidationResult();
  if (lastResult) {
    const errorCount = lastResult.issues.filter(i => i.severity === 'error').length;
    const warningCount = lastResult.issues.filter(i => i.severity === 'warning').length;
    showColorModeStatus(
      `バリデーション完了: エラー ${errorCount}件, 警告 ${warningCount}件`,
      5000
    );

    // 統計UIを更新
    updateSchemaStatsUI();
  }
}

/**
 * スキーマ検証統計UIを更新
 */
function updateSchemaStatsUI() {
  const stats = getValidationStats();

  // 全要素数を計算
  let totalElements = 0;
  const elementGroups = getState('elementGroups');
  if (elementGroups) {
    const groups = Array.isArray(elementGroups) ? elementGroups : Object.values(elementGroups);
    groups.forEach((group) => {
      group.traverse((object) => {
        // メッシュかつユーザーデータにelementIdがあるものをカウント
        if (object.isMesh && object.userData && object.userData.elementId) {
          totalElements++;
        }
      });
    });
  }

  // 正常要素数を計算 (全要素数 - 問題がある要素数)
  // stats.total は問題がある要素の総数
  const validCount = Math.max(0, totalElements - (stats.info + stats.warning + stats.error));

  const validCountEl = document.getElementById('schema-valid-count');
  const infoCountEl = document.getElementById('schema-info-count');
  const warningCountEl = document.getElementById('schema-warning-count');
  const errorCountEl = document.getElementById('schema-error-count');

  if (validCountEl) validCountEl.textContent = validCount;
  if (infoCountEl) infoCountEl.textContent = stats.info;
  if (warningCountEl) warningCountEl.textContent = stats.warning;
  if (errorCountEl) errorCountEl.textContent = stats.error;
}

/**
 * デモ用スキーマエラー設定関数
 * 実際のスキーマチェック機能と連携する際に置き換える
 */
export function setDemoSchemaErrors() {
  // デモ用のエラー設定
  setSchemaError('C1', true, ['断面サイズが規定外']);
  setSchemaError('G1', true, ['材料強度不明']);
  setSchemaError('B3', false, []);
  setSchemaError('S1', false, []);
  setSchemaError('W1', true, ['厚み設定エラー']);
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
    [COLOR_MODES.IMPORTANCE]: '重要度別色付け'
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
  // - 両モデルがロードされている場合: 差分表示
  // - 片方のモデルのみの場合: 部材別色分け
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
        UI_TIMING.STATUS_MESSAGE_LONG_DURATION_MS
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
        UI_TIMING.STATUS_MESSAGE_SHORT_DURATION_MS
      );
    }, UI_TIMING.STATUS_MESSAGE_SHOW_DELAY_MS);
  }
}

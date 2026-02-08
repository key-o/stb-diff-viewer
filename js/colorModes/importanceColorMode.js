/**
 * @fileoverview 重要度別色付けモード
 *
 * 属性の重要度レベルに基づいて要素を色分けするモードを提供します。
 *
 * @module colorModes/importanceColorMode
 */

import { getState } from '../app/globalState.js';
import { UI_TIMING } from '../config/uiTimingConfig.js';
import { eventBus, ImportanceEvents, ComparisonEvents } from '../app/events/index.js';
import { colorManager, applyImportanceColorMode } from '../viewer/index.js';
import { scheduleRender } from '../utils/renderScheduler.js';
import { elementGroups as viewerElementGroups } from '../viewer/index.js';

/**
 * 重要度色設定UIを初期化
 */
export function initializeImportanceColorControls() {
  const container = document.getElementById('importance-color-controls');
  if (!container) return;

  // 重要度設定をインポートして色設定コントロールを生成
  Promise.all([
    import('../app/importanceManager.js'),
    import('../constants/importanceLevels.js'),
    import('../config/importanceConfigLoader.js'),
    import('../config/importanceConfig.js'),
  ]).then(
    ([
      { getImportanceManager },
      { IMPORTANCE_LEVELS, IMPORTANCE_LEVEL_NAMES },
      { AVAILABLE_CONFIGS },
      { IMPORTANCE_COLORS: _IMPORTANCE_COLORS },
    ]) => {
      container.innerHTML = '';

      // === MVD設定セレクター ===
      const configSelectorContainer = document.createElement('div');
      configSelectorContainer.className = 'config-selector-container';
      configSelectorContainer.style.cssText =
        'margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #ddd;';

      const configLabel = document.createElement('label');
      configLabel.textContent = 'MVD設定:';
      configLabel.style.cssText =
        'display: block; font-size: 0.85em; margin-bottom: 5px; color: #666;';
      configSelectorContainer.appendChild(configLabel);

      const configSelect = document.createElement('select');
      configSelect.id = 'mvd-config-selector';
      configSelect.style.cssText =
        'width: 100%; padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 0.9em;';

      // オプションを追加
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'デフォルト（組み込み）';
      configSelect.appendChild(defaultOption);

      AVAILABLE_CONFIGS.forEach((config) => {
        const option = document.createElement('option');
        option.value = config.id;
        option.textContent = config.name;
        option.title = config.description;
        configSelect.appendChild(option);
      });

      // 設定変更イベント
      configSelect.addEventListener('change', async (e) => {
        const configId = e.target.value;
        const manager = getImportanceManager();

        if (configId) {
          const success = await manager.loadExternalConfig(configId);
          if (success) {
            window.dispatchEvent(new CustomEvent('importanceConfigChanged'));
          }
        } else {
          manager.resetToDefaults();
          await manager.initialize();
          window.dispatchEvent(new CustomEvent('importanceConfigChanged'));
        }
      });

      configSelectorContainer.appendChild(configSelect);
      container.appendChild(configSelectorContainer);

      // ColorManagerから現在の色を取得（単一データソース）
      Object.entries(IMPORTANCE_LEVELS).forEach(([_key, level]) => {
        const color = colorManager.getImportanceColor(level);
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
        `;

        container.appendChild(item);

        // 色変更イベントリスナーを追加
        const colorInput = item.querySelector(`#importance-${level}-color`);

        colorInput.addEventListener('change', (e) => {
          const newColor = e.target.value;
          // 重要度色設定を更新
          updateImportanceColor(level, newColor);
        });

        // リアルタイム色変更（input イベント）
        colorInput.addEventListener('input', (e) => {
          const newColor = e.target.value;
          updateImportanceColor(level, newColor);
        });
      });

      // リセットボタンを追加
      import('../ui/common/buttonManager.js').then(({ buttonManager: importanceBtnManager }) => {
        const resetButton = importanceBtnManager.createButton({
          type: 'reset',
          text: 'デフォルト色に戻す',
          onClick: () => resetImportanceColors(),
          ariaLabel: '重要度色をデフォルトに戻す',
          title: '重要度色をデフォルト設定に戻します',
          customStyle: {
            marginTop: '10px',
            fontSize: '0.8em',
            width: '100%',
          },
        });
        container.appendChild(resetButton);
      });
    },
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
  import('./index.js').then(({ getCurrentColorMode, COLOR_MODES, updateElementsForColorMode }) => {
    if (getCurrentColorMode() === COLOR_MODES.IMPORTANCE) {
      // マテリアルキャッシュをクリアして再生成
      import('../viewer/rendering/materials.js').then(({ clearImportanceMaterialCache }) => {
        clearImportanceMaterialCache();
        updateElementsForColorMode();
      });
    }
  });
}

/**
 * 重要度色設定をデフォルトにリセット
 */
export function resetImportanceColors() {
  import('../config/importanceConfig.js').then(({ IMPORTANCE_COLORS }) => {
    // ColorManagerを使用して色をリセット（単一データソース）
    Object.entries(IMPORTANCE_COLORS).forEach(([level, color]) => {
      colorManager.setImportanceColor(level, color);
    });

    // UIの色設定コントロールを更新
    initializeImportanceColorControls();

    // 重要度モードが有効な場合は即座に適用
    import('./index.js').then(
      ({ getCurrentColorMode, COLOR_MODES, updateElementsForColorMode }) => {
        if (getCurrentColorMode() === COLOR_MODES.IMPORTANCE) {
          import('../viewer/rendering/materials.js').then(({ clearImportanceMaterialCache }) => {
            clearImportanceMaterialCache();
            updateElementsForColorMode();
          });
        }
      },
    );
  });
}

/**
 * 重要度変更イベントリスナーを設定
 */
export function setupImportanceChangeListeners() {
  // 重要度設定変更時のグローバルイベントリスナー（EventBus経由）
  eventBus.on(ImportanceEvents.SETTINGS_CHANGED, (_data) => {
    import('./index.js').then(({ getCurrentColorMode, COLOR_MODES }) => {
      if (getCurrentColorMode() === COLOR_MODES.IMPORTANCE) {
        // 少し遅延させて実行（要素の重要度データ更新を待つ）
        setTimeout(() => {
          applyImportanceColorModeToAll();

          // 凡例も更新
          const legendPanel = document.getElementById('legendPanel');
          if (legendPanel && legendPanel.style.display !== 'none') {
            import('../ui/events/index.js').then(({ updateLegendContent }) => {
              updateLegendContent();
            });
          }

          // 要素情報パネルの重要度表示も更新
          import('../ui/panels/element-info/index.js').then(({ refreshElementInfoPanel }) => {
            if (refreshElementInfoPanel) {
              refreshElementInfoPanel();
            }
          });

          // 再描画をリクエスト
          scheduleRender();
        }, UI_TIMING.COLOR_MODE_APPLY_DELAY_MS);
      }
    });
  });

  // 重要度フィルタ変更時のイベントリスナー
  eventBus.on(ImportanceEvents.FILTER_CHANGED, (_data) => {
    // フィルタ変更は表示・非表示の切り替えなので、色分けの再適用は不要
  });

  // モデル比較完了時のイベントリスナー
  eventBus.on(ComparisonEvents.UPDATE_STATISTICS, (_data) => {
    import('./index.js').then(({ getCurrentColorMode, COLOR_MODES }) => {
      if (getCurrentColorMode() === COLOR_MODES.IMPORTANCE) {
        setTimeout(() => {
          applyImportanceColorModeToAll();

          scheduleRender();
        }, UI_TIMING.IMPORTANCE_COLOR_APPLY_DELAY_MS);
      }
    });
  });
}

/**
 * 全要素に重要度色分けを適用
 */
export function applyImportanceColorModeToAll() {
  const elementGroups = getState('elementGroups') || viewerElementGroups;
  if (!elementGroups || typeof elementGroups !== 'object') {
    console.warn('[ImportanceColorMode] elementGroups not found in global state');
    return;
  }

  // 全オブジェクトを収集
  const allObjects = [];
  const groups = Array.isArray(elementGroups) ? elementGroups : Object.values(elementGroups);

  // グループが空の場合は警告を出して終了
  if (groups.length === 0 || groups.every((g) => !g || (g.children && g.children.length === 0))) {
    console.warn(
      '[ImportanceColorMode] No element groups or empty groups - model may not be loaded yet',
    );
    return;
  }

  groups.forEach((group) => {
    if (group && group.traverse) {
      group.traverse((object) => {
        if (object.isMesh) {
          allObjects.push(object);
        }
      });
    }
  });

  // オブジェクト数に応じて処理方法を選択
  const objectCount = allObjects.length;

  if (objectCount === 0) {
    console.warn(
      '[ImportanceColorMode] No meshes found in elementGroups - model may not be loaded yet',
    );
    return;
  }

  console.log(`[ImportanceColorMode] Applying importance colors to ${objectCount} objects`);
  const useBatchProcessing = objectCount > 200;

  if (useBatchProcessing) {
    // バッチ処理を使用
    import('../viewer/rendering/materials.js').then(({ applyImportanceColorModeBatch }) => {
      const batchOptions = {
        batchSize: Math.max(50, Math.min(200, Math.floor(objectCount / 10))),
        delay: 5,
      };

      applyImportanceColorModeBatch(allObjects, batchOptions);
    });
  } else {
    // 通常処理
    allObjects.forEach((object) => {
      applyImportanceColorMode(object);
    });

    // 再描画をリクエスト
    scheduleRender();
  }
}

/**
 * パフォーマンス統計を表示
 */
export function showImportancePerformanceStats() {
  import('../viewer/rendering/materials.js').then(({ getImportanceRenderingStats }) => {
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

    import('./index.js').then(({ getCurrentColorMode, COLOR_MODES }) => {
      const perfInfo = {
        totalObjects,
        ...stats,
        currentColorMode: getCurrentColorMode(),
        isImportanceMode: getCurrentColorMode() === COLOR_MODES.IMPORTANCE,
      };

      return perfInfo;
    });
  });
}

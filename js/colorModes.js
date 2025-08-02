/**
 * @fileoverview 色付けモード管理モジュール
 *
 * このファイルは、3種類の色付けモードを管理します：
 * 1. 差分表示モード（デフォルト）- モデルA/Bの差分を表示
 * 2. 部材別色付けモード - 要素タイプごとに色を設定
 * 3. スキーマエラー表示モード - スキーマチェックエラーを表示
 */

import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";
import { getState } from "./core/globalState.js";
import { applyImportanceColorMode } from "./viewer/rendering/materials.js";

// 色付けモードの定数
export const COLOR_MODES = {
  DIFF: "diff",
  ELEMENT: "element",
  SCHEMA: "schema",
  IMPORTANCE: "importance",
};

// 現在の色付けモード
let currentColorMode = COLOR_MODES.DIFF;

// デフォルト色設定（リセット用）
const DEFAULT_ELEMENT_COLORS = {
  Column: "#D2691E", // サドルブラウン（柱らしい色）
  Girder: "#4169E1", // ロイヤルブルー（大梁用）
  Beam: "#32CD32", // ライムグリーン（小梁用）
  Slab: "#708090", // スレートグレー（スラブ用）
  Wall: "#CD853F", // ペルー（壁用）
  Node: "#FF6347", // トマト色（節点用 - 目立つ色）
};

const DEFAULT_SCHEMA_COLORS = {
  valid: "#00aaff", // 正常要素（水色）
  error: "#ff0000", // エラー要素（赤色）
};

// 部材別色設定（デフォルト値 - 視認性重視）
const elementColors = { ...DEFAULT_ELEMENT_COLORS };

// スキーマエラー色設定
const schemaColors = { ...DEFAULT_SCHEMA_COLORS };

// 部材別マテリアルキャッシュ
const elementMaterials = {};
const elementLineMaterials = {};

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
    import("./modelLoader.js").then(({ isModelLoaded }) => {
      const modelsLoaded = isModelLoaded();

      if (!modelsLoaded) {
        console.log(
          `[ColorMode] Color mode set to ${mode}. Will be applied when models are loaded.`
        );
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
          "[ColorMode] Error updating elements for color mode:",
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
        const scheduleRender = getState("rendering.scheduleRender");
        if (scheduleRender) {
          scheduleRender();
        } else {
          console.warn(
            "[ColorMode] scheduleRender not available for final redraw"
          );
        }
      }, 300);
    });
  }
}
/**
 * 色付けモードUIの更新
 */
function updateColorModeUI() {
  const elementSettings = document.getElementById("element-color-settings");
  const schemaSettings = document.getElementById("schema-color-settings");
  const importanceSettings = document.getElementById(
    "importance-color-settings"
  );

  if (elementSettings && schemaSettings && importanceSettings) {
    // 全ての設定パネルを非表示にする
    elementSettings.style.display = "none";
    schemaSettings.style.display = "none";
    importanceSettings.style.display = "none";

    // 現在のモードに応じて適切なパネルを表示
    switch (currentColorMode) {
      case COLOR_MODES.ELEMENT:
        elementSettings.style.display = "block";
        break;
      case COLOR_MODES.SCHEMA:
        schemaSettings.style.display = "block";
        break;
      case COLOR_MODES.IMPORTANCE:
        importanceSettings.style.display = "block";
        break;
      // DIFF モードはデフォルトなので特別な表示は不要
    }
  }
}

/**
 * 部材別色設定UIを初期化
 */
export function initializeElementColorControls() {
  const container = document.getElementById("element-color-controls");
  if (!container) return;

  container.innerHTML = "";

  const elementTypes = ["Column", "Girder", "Beam", "Slab", "Wall", "Node"];
  const elementNames = {
    Column: "柱",
    Girder: "大梁",
    Beam: "小梁",
    Slab: "スラブ",
    Wall: "壁",
    Node: "節点",
  };

  elementTypes.forEach((type) => {
    const div = document.createElement("div");
    div.className = "legend-item";

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = elementColors[type];
    colorInput.className = "legend-color-box";
    colorInput.id = `element-color-${type}`;
    colorInput.title = `${elementNames[type] || type}の色を変更`;

    colorInput.addEventListener("change", (e) => {
      elementColors[type] = e.target.value;
      updateElementMaterials();

      // 色プレビューも更新
      const preview = div.querySelector(".color-preview");
      if (preview) {
        preview.style.backgroundColor = e.target.value;
      }

      const scheduleRender = getState("rendering.scheduleRender");
      if (scheduleRender) scheduleRender();
    });

    const label = document.createElement("span");
    label.className = "legend-label";
    label.textContent = elementNames[type] || type;

    // 色プレビューを追加
    const colorPreview = document.createElement("span");
    colorPreview.className = "color-preview";
    colorPreview.style.backgroundColor = elementColors[type];
    colorPreview.title = `現在の色: ${elementColors[type]}`;

    div.appendChild(colorInput);
    div.appendChild(label);
    div.appendChild(colorPreview);
    container.appendChild(div);
  });

  // リセットボタンを追加
  const resetButton = document.createElement("button");
  resetButton.textContent = "デフォルト色に戻す";
  resetButton.className = "btn btn-sm";
  resetButton.style.cssText =
    "margin-top: 10px; font-size: 0.8em; width: 100%;";
  resetButton.addEventListener("click", () => {
    resetElementColors();
  });
  container.appendChild(resetButton);
}

/**
 * スキーマエラー色設定UIのイベントリスナーを設定
 */
export function initializeSchemaColorControls() {
  const validColorInput = document.getElementById("schema-valid-color");
  const errorColorInput = document.getElementById("schema-error-color");

  // 初期の色プレビューを設定
  const validPreview = document.getElementById("schema-valid-preview");
  const errorPreview = document.getElementById("schema-error-preview");

  if (validPreview) {
    validPreview.style.backgroundColor = schemaColors.valid;
  }
  if (errorPreview) {
    errorPreview.style.backgroundColor = schemaColors.error;
  }

  if (validColorInput) {
    validColorInput.addEventListener("change", (e) => {
      schemaColors.valid = e.target.value;
      updateSchemaErrorMaterials();

      // 色プレビューを更新
      if (validPreview) {
        validPreview.style.backgroundColor = e.target.value;
        validPreview.title = `現在の色: ${e.target.value}`;
      }

      const scheduleRender = getState("rendering.scheduleRender");
      if (scheduleRender) scheduleRender();
    });
  }

  if (errorColorInput) {
    errorColorInput.addEventListener("change", (e) => {
      schemaColors.error = e.target.value;
      updateSchemaErrorMaterials();

      // 色プレビューを更新
      if (errorPreview) {
        errorPreview.style.backgroundColor = e.target.value;
        errorPreview.title = `現在の色: ${e.target.value}`;
      }

      const scheduleRender = getState("rendering.scheduleRender");
      if (scheduleRender) scheduleRender();
    });
  }

  // リセットボタンを追加
  const resetButton = document.createElement("button");
  resetButton.textContent = "デフォルト色に戻す";
  resetButton.className = "btn btn-sm";
  resetButton.style.cssText =
    "margin-top: 10px; font-size: 0.8em; width: 100%;";
  resetButton.addEventListener("click", () => {
    resetSchemaColors();
  });

  const container = document.getElementById("schema-color-settings");
  if (container) {
    container.appendChild(resetButton);
  }
}

/**
 * 部材別マテリアルを更新
 */
function updateElementMaterials() {
  Object.keys(elementColors).forEach((type) => {
    const color = new THREE.Color(elementColors[type]);

    // メッシュマテリアル
    if (!elementMaterials[type]) {
      elementMaterials[type] = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.6,
        metalness: 0.1,
        side: THREE.DoubleSide,
      });
    } else {
      elementMaterials[type].color = color;
    }

    // ラインマテリアル
    if (!elementLineMaterials[type]) {
      elementLineMaterials[type] = new THREE.LineBasicMaterial({
        color: color,
      });
    } else {
      elementLineMaterials[type].color = color;
    }
  });
}

/**
 * スキーマエラー用マテリアルを更新
 */
function updateSchemaErrorMaterials() {
  // 実装は後でスキーマチェック機能と連携
  console.log("Schema error materials updated:", schemaColors);
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
  switch (currentColorMode) {
    case COLOR_MODES.ELEMENT:
      // Axis（通り芯）とStory（階）はワイヤーフレーム表示
      const shouldUseWireframeForElement =
        elementType === "Axis" || elementType === "Story";

      if (isLine) {
        return (
          elementLineMaterials[elementType] ||
          new THREE.LineBasicMaterial({ color: 0x888888 })
        );
      } else {
        const baseMaterial =
          elementMaterials[elementType] ||
          new THREE.MeshStandardMaterial({ color: 0x888888 });

        if (shouldUseWireframeForElement) {
          // ワイヤーフレーム用のマテリアルを作成
          return new THREE.MeshStandardMaterial({
            color: baseMaterial.color,
            wireframe: true,
            side: THREE.DoubleSide,
          });
        }
        return baseMaterial;
      }
    case COLOR_MODES.SCHEMA:
      // スキーマエラーチェック結果に基づく色付け
      const errorInfo = elementId
        ? getSchemaError(elementId)
        : { hasError: false };
      const color = errorInfo.hasError
        ? schemaColors.error
        : schemaColors.valid;

      // Axis（通り芯）とStory（階）はワイヤーフレーム表示
      const shouldUseWireframeForSchema =
        elementType === "Axis" || elementType === "Story";

      if (isLine) {
        return new THREE.LineBasicMaterial({ color: color });
      } else {
        return new THREE.MeshStandardMaterial({
          color: color,
          roughness: 0.6,
          metalness: 0.1,
          side: THREE.DoubleSide,
          wireframe: shouldUseWireframeForSchema,
        });
      }
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
  const selector = document.getElementById("colorModeSelector");
  if (selector) {
    selector.addEventListener("change", (e) => {
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
  window.addEventListener("importanceSettingsChanged", (event) => {
    console.log("Importance settings changed:", event.detail);

    // 重要度モードが有効な場合は色分けを更新
    if (getCurrentColorMode() === COLOR_MODES.IMPORTANCE) {
      // 少し遅延させて実行（要素の重要度データ更新を待つ）
      setTimeout(() => {
        applyImportanceColorModeToAll();

        // 凡例も更新
        const legendPanel = document.getElementById("legendPanel");
        if (legendPanel && legendPanel.style.display !== "none") {
          import("./ui/events.js").then(({ updateLegendContent }) => {
            updateLegendContent();
          });
        }

        // 再描画をリクエスト
        const scheduleRender = getState("rendering.scheduleRender");
        if (scheduleRender) {
          scheduleRender();
        }
      }, 100);
    }
  });

  // 重要度フィルタ変更時のイベントリスナー
  window.addEventListener("importanceFilterChanged", (event) => {
    console.log("Importance filter changed:", event.detail);

    // 重要度モードが有効な場合は表示を更新
    if (getCurrentColorMode() === COLOR_MODES.IMPORTANCE) {
      // フィルタ変更は表示・非表示の切り替えなので、色分けの再適用は不要
      // ただし統計情報などは更新が必要な場合がある
      console.log("Importance mode active during filter change");
    }
  });

  // モデル比較完了時のイベントリスナー
  window.addEventListener("updateComparisonStatistics", (event) => {
    console.log("Comparison statistics updated");

    // 重要度モードが有効な場合は新しい要素に色分けを適用
    if (getCurrentColorMode() === COLOR_MODES.IMPORTANCE) {
      setTimeout(() => {
        applyImportanceColorModeToAll();

        // 再描画をリクエスト
        const scheduleRender = getState("rendering.scheduleRender");
        if (scheduleRender) {
          scheduleRender();
        }
      }, 200); // 要素描画完了を待つため少し長めの遅延
    }
  });
}

/**
 * 重要度色設定UIを初期化
 */
function initializeImportanceColorControls() {
  const container = document.getElementById("importance-color-controls");
  if (!container) return;

  // 重要度設定をインポートして色設定コントロールを生成
  import("./core/importanceManager.js").then(
    ({ IMPORTANCE_LEVELS, IMPORTANCE_LEVEL_NAMES }) => {
      import("./config/importanceConfig.js").then(({ IMPORTANCE_COLORS }) => {
        container.innerHTML = "";

        // ランタイム色設定を初期化
        if (!window.runtimeImportanceColors) {
          window.runtimeImportanceColors = { ...IMPORTANCE_COLORS };
        }

        Object.entries(IMPORTANCE_LEVELS).forEach(([key, level]) => {
          const color =
            window.runtimeImportanceColors[level] || IMPORTANCE_COLORS[level];
          const name = IMPORTANCE_LEVEL_NAMES[level];

          const item = document.createElement("div");
          item.className = "legend-item";
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

          colorInput.addEventListener("change", (e) => {
            const newColor = e.target.value;
            preview.style.backgroundColor = newColor;
            preview.title = `現在の色: ${newColor}`;

            // 重要度色設定を更新
            updateImportanceColor(level, newColor);
          });

          // リアルタイム色変更（input イベント）
          colorInput.addEventListener("input", (e) => {
            const newColor = e.target.value;
            preview.style.backgroundColor = newColor;
            preview.title = `現在の色: ${newColor}`;
          });
        });

        // リセットボタンを追加
        const resetButton = document.createElement("button");
        resetButton.textContent = "デフォルト色に戻す";
        resetButton.className = "btn btn-sm";
        resetButton.style.cssText =
          "margin-top: 10px; font-size: 0.8em; width: 100%;";
        resetButton.addEventListener("click", () => {
          resetImportanceColors();
        });
        container.appendChild(resetButton);
      });
    }
  );
}

/**
 * 重要度色設定をデフォルトにリセット
 */
export function resetImportanceColors() {
  import("./config/importanceConfig.js").then(({ IMPORTANCE_COLORS }) => {
    // ランタイム色設定をデフォルトに戻す
    window.runtimeImportanceColors = { ...IMPORTANCE_COLORS };

    // UIの色設定コントロールを更新
    initializeImportanceColorControls();

    // 重要度モードが有効な場合は即座に適用
    if (getCurrentColorMode() === COLOR_MODES.IMPORTANCE) {
      import("./viewer/rendering/materials.js").then(
        ({ clearImportanceMaterialCache }) => {
          clearImportanceMaterialCache();
          updateElementsForColorMode();
        }
      );
    }

    console.log("Importance colors reset to default");
  });
}

/**
 * 部材別色設定をデフォルトにリセット
 */
export function resetElementColors() {
  // 色設定をデフォルトに戻す
  Object.assign(elementColors, DEFAULT_ELEMENT_COLORS);

  // UIの色設定コントロールを更新
  initializeElementColorControls();

  // 部材別モードが有効な場合は即座に適用
  if (getCurrentColorMode() === COLOR_MODES.ELEMENT) {
    updateElementMaterials();
    updateElementsForColorMode();
  }

  console.log("Element colors reset to default");
}

/**
 * スキーマエラー色設定をデフォルトにリセット
 */
export function resetSchemaColors() {
  // 色設定をデフォルトに戻す
  Object.assign(schemaColors, DEFAULT_SCHEMA_COLORS);

  // UIの色設定コントロールを更新
  initializeSchemaColorControls();

  // スキーマエラーモードが有効な場合は即座に適用
  if (getCurrentColorMode() === COLOR_MODES.SCHEMA) {
    updateSchemaErrorMaterials();
    updateElementsForColorMode();
  }

  console.log("Schema colors reset to default");
}

/**
 * パフォーマンス統計を表示
 */
export function showImportancePerformanceStats() {
  import("./viewer/rendering/materials.js").then(
    ({ getImportanceRenderingStats }) => {
      const stats = getImportanceRenderingStats();
      const elementGroups = getState("elementGroups");

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
        isImportanceMode: getCurrentColorMode() === COLOR_MODES.IMPORTANCE,
      };

      console.group("🎨 重要度色分けパフォーマンス統計");
      console.log("総オブジェクト数:", perfInfo.totalObjects);
      console.log("マテリアルキャッシュサイズ:", perfInfo.materialCacheSize);
      console.log("ランタイム色設定有効:", perfInfo.runtimeColorsActive);
      console.log("カスタム色数:", perfInfo.runtimeColorCount);
      console.log("現在の色分けモード:", perfInfo.currentColorMode);
      console.log("重要度モード有効:", perfInfo.isImportanceMode);
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
  // 動的に色設定を更新
  import("./config/importanceConfig.js").then(({ IMPORTANCE_COLORS }) => {
    // 色設定を更新（実際には実行時の色設定として保存）
    if (!window.runtimeImportanceColors) {
      window.runtimeImportanceColors = { ...IMPORTANCE_COLORS };
    }
    window.runtimeImportanceColors[importanceLevel] = color;

    console.log(`Importance color updated: ${importanceLevel} -> ${color}`);

    // 重要度モードが有効な場合は即座に適用
    if (getCurrentColorMode() === COLOR_MODES.IMPORTANCE) {
      // マテリアルキャッシュをクリアして再生成
      import("./viewer/rendering/materials.js").then(
        ({ clearImportanceMaterialCache }) => {
          clearImportanceMaterialCache();
          updateElementsForColorMode();
        }
      );
    }
  });
}

/**
 * 色付けモード変更時に全ての要素を再描画する
 */
export function updateElementsForColorMode() {
  console.log(`[ColorMode] Switching to: ${getCurrentColorMode()}`);

  const currentMode = getCurrentColorMode();

  // モード別の特別な処理
  switch (currentMode) {
    case COLOR_MODES.IMPORTANCE:
      // 重要度モードの場合は全要素に重要度マテリアルを適用
      // まず重要度マテリアルキャッシュをクリア
      import("./viewer/rendering/materials.js").then(
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
      // スキーマモードの場合はデモエラーを設定
      setDemoSchemaErrors();
      // 直接的にマテリアルを適用
      applySchemaColorModeToAll();
      // 再描画をリクエスト
      requestColorModeRedraw();
      break;

    case COLOR_MODES.ELEMENT:
      // 部材別色付けモードの場合
      console.log("[ColorMode] Applying element-based coloring");
      // 直接的にマテリアルを適用
      applyElementColorModeToAll();
      // 再描画をリクエスト
      requestColorModeRedraw();
      break;

    case COLOR_MODES.DIFF:
    default:
      // 差分表示モード（デフォルト）
      console.log("[ColorMode] Applying diff-based coloring");
      // 直接的にマテリアルを適用
      applyDiffColorModeToAll();
      // 再描画をリクエスト
      requestColorModeRedraw();
      break;
  }

  // 統合ラベル管理システムに色付けモード変更を通知
  import("./ui/unifiedLabelManager.js").then(({ handleColorModeChange }) => {
    if (handleColorModeChange) {
      handleColorModeChange();
    }
  });

  // 凡例を表示中の場合は内容を更新
  const legendPanel = document.getElementById("legendPanel");
  if (legendPanel && legendPanel.style.display !== "none") {
    // 凡例更新関数をインポートして実行
    import("./ui/events.js").then(({ updateLegendContent }) => {
      updateLegendContent();
    });
  }

  // 色付けモードが変更されたことをログ出力
  console.log(`Color mode changed to: ${currentMode}`);
}

/**
 * 色付けモード変更時の再描画をリクエスト
 */
function requestColorModeRedraw() {
  const scheduleRender = getState("rendering.scheduleRender");
  if (scheduleRender) {
    console.log("[ColorMode] Requesting redraw");
    scheduleRender();

    // さらに確実にするため、少し遅延させて再度描画をリクエスト
    setTimeout(() => {
      scheduleRender();
    }, 100);
  } else {
    console.warn("[ColorMode] scheduleRender not available");

    // scheduleRenderが利用できない場合、直接renderer.render()を呼び出す
    const renderer = getState("rendering.renderer");
    const scene = getState("rendering.scene");
    const camera = getState("rendering.camera");

    if (renderer && scene && camera) {
      console.log("[ColorMode] Fallback: Direct render call");
      renderer.render(scene, camera);
    }
  }
}

/**
 * 全要素を再構築する
 */
function rebuildAllElements() {
  console.log("[ColorMode] Rebuilding all elements for new color mode");

  // modelLoader の再読み込み機能を使用
  import("./modelLoader.js").then(({ reapplyColorMode }) => {
    if (reapplyColorMode) {
      // シーンが利用可能かチェック
      const scene = getState("rendering.scene");
      if (scene) {
        reapplyColorMode();
      } else {
        console.warn(
          "[ColorMode] Scene not available, skipping reapplyColorMode"
        );
        // 少し遅延させて再試行
        setTimeout(() => {
          const retryScene = getState("rendering.scene");
          if (retryScene) {
            reapplyColorMode();
          } else {
            console.warn("[ColorMode] Scene still not available after retry");
          }
        }, 100);
      }
    } else {
      console.warn("[ColorMode] reapplyColorMode function not available");
      // フォールバック: 全シーンを再構築
      rebuildScene();
    }
  });
}

/**
 * シーンの再構築（フォールバック）
 */
function rebuildScene() {
  console.log("[ColorMode] Rebuilding scene as fallback");

  // compareModels 関数を使用してモデルを再表示
  import("./modelLoader.js").then(({ compareModels }) => {
    if (compareModels) {
      console.log("[ColorMode] Calling compareModels to rebuild scene");
      const scheduleRender = getState("rendering.scheduleRender");
      const camera = getState("camera");
      const controls = getState("controls");
      compareModels(scheduleRender, { camera, controls });
    } else {
      console.warn("[ColorMode] compareModels function not available");
    }
  });
}

/**
 * 全要素に部材別色分けを適用
 */
function applyElementColorModeToAll() {
  const elementGroups = getState("elementGroups");
  if (!elementGroups) {
    console.warn("[ElementColorMode] elementGroups not found in global state");
    return;
  }

  // 全オブジェクトを収集
  const allObjects = [];
  const groups = Array.isArray(elementGroups)
    ? elementGroups
    : Object.values(elementGroups);

  console.log(`[ElementColorMode] Processing ${groups.length} groups`);

  groups.forEach((group) => {
    group.traverse((object) => {
      if (object.isMesh && object.userData && object.userData.elementType) {
        allObjects.push(object);
      }
    });
  });

  console.log(`[ElementColorMode] Found ${allObjects.length} objects to color`);

  // 部材別色分けマテリアルを適用
  import("./viewer/rendering/materials.js").then(
    ({ getMaterialForElementWithMode }) => {
      allObjects.forEach((object) => {
        const elementType = object.userData.elementType;
        const comparisonState = object.userData.modelSource || "matched";
        const isLine = object.userData.isLine || false;
        const isPoly = object.userData.isPoly || false;
        const elementId = object.userData.elementId || null;

        const newMaterial = getMaterialForElementWithMode(
          elementType,
          comparisonState,
          isLine,
          isPoly,
          elementId
        );

        if (newMaterial) {
          object.material = newMaterial;
        }
      });

      console.log(
        `[ElementColorMode] Applied element coloring to ${allObjects.length} objects`
      );
    }
  );
}

/**
 * 全要素にスキーマエラー色分けを適用
 */
function applySchemaColorModeToAll() {
  const elementGroups = getState("elementGroups");
  if (!elementGroups) {
    console.warn("[SchemaColorMode] elementGroups not found in global state");
    return;
  }

  // 全オブジェクトを収集
  const allObjects = [];
  const groups = Array.isArray(elementGroups)
    ? elementGroups
    : Object.values(elementGroups);

  console.log(`[SchemaColorMode] Processing ${groups.length} groups`);

  groups.forEach((group) => {
    group.traverse((object) => {
      if (object.isMesh && object.userData && object.userData.elementType) {
        allObjects.push(object);
      }
    });
  });

  console.log(`[SchemaColorMode] Found ${allObjects.length} objects to color`);

  // スキーマエラー色分けマテリアルを適用
  import("./viewer/rendering/materials.js").then(
    ({ getMaterialForElementWithMode }) => {
      allObjects.forEach((object) => {
        const elementType = object.userData.elementType;
        const comparisonState = object.userData.modelSource || "matched";
        const isLine = object.userData.isLine || false;
        const isPoly = object.userData.isPoly || false;
        const elementId = object.userData.elementId || null;

        const newMaterial = getMaterialForElementWithMode(
          elementType,
          comparisonState,
          isLine,
          isPoly,
          elementId
        );

        if (newMaterial) {
          object.material = newMaterial;
        }
      });

      console.log(
        `[SchemaColorMode] Applied schema coloring to ${allObjects.length} objects`
      );
    }
  );
}

/**
 * 全要素に差分色分けを適用
 */
function applyDiffColorModeToAll() {
  const elementGroups = getState("elementGroups");
  if (!elementGroups) {
    console.warn("[DiffColorMode] elementGroups not found in global state");
    return;
  }

  // 全オブジェクトを収集
  const allObjects = [];
  const groups = Array.isArray(elementGroups)
    ? elementGroups
    : Object.values(elementGroups);

  console.log(`[DiffColorMode] Processing ${groups.length} groups`);

  groups.forEach((group) => {
    group.traverse((object) => {
      if (object.isMesh && object.userData && object.userData.elementType) {
        allObjects.push(object);
      }
    });
  });

  console.log(`[DiffColorMode] Found ${allObjects.length} objects to color`);

  // 差分色分けマテリアルを適用
  import("./viewer/rendering/materials.js").then(
    ({ getMaterialForElementWithMode }) => {
      allObjects.forEach((object) => {
        const elementType = object.userData.elementType;
        const comparisonState = object.userData.modelSource || "matched";
        const isLine = object.userData.isLine || false;
        const isPoly = object.userData.isPoly || false;
        const elementId = object.userData.elementId || null;

        const newMaterial = getMaterialForElementWithMode(
          elementType,
          comparisonState,
          isLine,
          isPoly,
          elementId
        );

        if (newMaterial) {
          object.material = newMaterial;
        }
      });

      console.log(
        `[DiffColorMode] Applied diff coloring to ${allObjects.length} objects`
      );
    }
  );
}

/**
 * 全要素に重要度色分けを適用
 */
function applyImportanceColorModeToAll() {
  const elementGroups = getState("elementGroups");
  if (!elementGroups) {
    console.warn(
      "[ImportanceColorMode] elementGroups not found in global state"
    );
    return;
  }

  // 全オブジェクトを収集
  const allObjects = [];
  // elementGroups may be an object, so iterate its values
  const groups = Array.isArray(elementGroups)
    ? elementGroups
    : Object.values(elementGroups);

  console.log(`[ImportanceColorMode] Processing ${groups.length} groups`);

  groups.forEach((group) => {
    group.traverse((object) => {
      if (object.isMesh) {
        allObjects.push(object);
      }
    });
  });

  console.log(
    `[ImportanceColorMode] Found ${allObjects.length} mesh objects to process`
  );

  // オブジェクト数に応じて処理方法を選択
  const objectCount = allObjects.length;
  const useBatchProcessing = objectCount > 200; // 200個以上でバッチ処理を使用

  if (useBatchProcessing) {
    console.log(
      `Large dataset detected (${objectCount} objects), using batch processing`
    );

    // バッチ処理を使用
    import("./viewer/rendering/materials.js").then(
      ({ applyImportanceColorModeBatch }) => {
        const batchOptions = {
          batchSize: Math.max(50, Math.min(200, Math.floor(objectCount / 10))), // 動的バッチサイズ
          delay: 5, // 短い遅延でスムーズな処理
        };

        applyImportanceColorModeBatch(allObjects, batchOptions);
      }
    );
  } else {
    // 通常処理
    console.log(
      `[ImportanceColorMode] Standard processing for ${objectCount} objects`
    );

    allObjects.forEach((object, index) => {
      // 重要度データが設定されていない場合は警告を出力
      if (!object.userData.importance) {
        console.warn(
          `[ImportanceColorMode] Object ${
            object.userData.originalId || object.userData.id
          } has no importance data, applying default`
        );
      }

      applyImportanceColorMode(object);

      // サンプリングしてオブジェクト状況をログ出力
      if (index < 5) {
        console.log(`[ImportanceColorMode] Sample object ${index}:`, {
          id: object.userData.originalId || object.userData.id,
          importance: object.userData.importance,
          materialColor: object.material?.color?.getHexString(),
          materialType: object.material?.type,
        });
      }
    });

    // 再描画をリクエスト
    const scheduleRender = getState("rendering.scheduleRender");
    if (scheduleRender) {
      scheduleRender();
    }

    console.log(
      `[ImportanceColorMode] Completed processing ${objectCount} objects`
    );
  }
}

// 部材色設定の取得
export function getElementColors() {
  return { ...elementColors };
}

// スキーマ色設定の取得
export function getSchemaColors() {
  return { ...schemaColors };
}

/**
 * 要素のスキーマエラー情報を設定
 * @param {string} elementId 要素ID
 * @param {boolean} hasError エラーがあるかどうか
 * @param {string[]} errorMessages エラーメッセージの配列
 */
export function setSchemaError(elementId, hasError, errorMessages = []) {
  schemaErrorMap.set(elementId, {
    hasError,
    errorMessages,
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
      hasError: false,
      errorMessages: [],
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
  let totalElements = schemaErrorMap.size;
  let errorElements = 0;

  schemaErrorMap.forEach((errorInfo) => {
    if (errorInfo.hasError) {
      errorElements++;
    }
  });

  return {
    totalElements,
    errorElements,
    validElements: totalElements - errorElements,
  };
}

/**
 * デモ用スキーマエラー設定関数
 * 実際のスキーマチェック機能と連携する際に置き換える
 */
export function setDemoSchemaErrors() {
  // デモ用のエラー設定
  setSchemaError("C1", true, ["断面サイズが規定外"]);
  setSchemaError("G1", true, ["材料強度不明"]);
  setSchemaError("B3", false, []);
  setSchemaError("S1", false, []);
  setSchemaError("W1", true, ["厚み設定エラー"]);

  console.log("Demo schema errors set:", getSchemaErrorStats());
}

/**
 * 色付けモードの表示名を取得
 * @param {string} mode - 色付けモード
 * @returns {string} 表示名
 */
function getModeDisplayName(mode) {
  const displayNames = {
    [COLOR_MODES.DIFF]: "差分表示",
    [COLOR_MODES.ELEMENT]: "部材別色付け",
    [COLOR_MODES.SCHEMA]: "スキーマエラー表示",
    [COLOR_MODES.IMPORTANCE]: "重要度別色付け",
  };
  return displayNames[mode] || mode;
}

/**
 * 色付けモード状況メッセージを表示
 * @param {string} message - 表示するメッセージ
 * @param {number} duration - 表示時間（ミリ秒、0で自動非表示なし）
 */
function showColorModeStatus(message, duration = 5000) {
  const statusElement = document.getElementById("color-mode-status");
  const textElement = document.getElementById("color-mode-status-text");

  if (statusElement && textElement) {
    textElement.textContent = message;
    statusElement.classList.remove("hidden");

    if (duration > 0) {
      setTimeout(() => {
        statusElement.classList.add("hidden");
      }, duration);
    }
  }
}

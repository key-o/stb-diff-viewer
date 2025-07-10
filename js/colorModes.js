/**
 * @fileoverview 色付けモード管理モジュール
 *
 * このファイルは、3種類の色付けモードを管理します：
 * 1. 差分表示モード（デフォルト）- モデルA/Bの差分を表示
 * 2. 部材別色付けモード - 要素タイプごとに色を設定
 * 3. スキーマエラー表示モード - スキーマチェックエラーを表示
 */

import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";

// 色付けモードの定数
export const COLOR_MODES = {
  DIFF: "diff",
  ELEMENT: "element",
  SCHEMA: "schema",
};

// 現在の色付けモード
let currentColorMode = COLOR_MODES.DIFF;

// 部材別色設定（デフォルト値）
const elementColors = {
  Column: "#8B4513", // 茶色
  Girder: "#4169E1", // ロイヤルブルー
  Beam: "#32CD32", // ライムグリーン
  Slab: "#808080", // グレー
  Wall: "#D2691E", // チョコレート色
  Node: "#FF1493", // ディープピンク
};

// スキーマエラー色設定
const schemaColors = {
  valid: "#00aaff", // 正常要素（水色）
  error: "#ff0000", // エラー要素（赤色）
};

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
    updateElementsForColorMode();
  }
}

/**
 * 色付けモードUIの更新
 */
function updateColorModeUI() {
  const elementSettings = document.getElementById("element-color-settings");
  const schemaSettings = document.getElementById("schema-color-settings");

  if (elementSettings && schemaSettings) {
    // 全ての設定パネルを非表示にする
    elementSettings.style.display = "none";
    schemaSettings.style.display = "none";

    // 現在のモードに応じて適切なパネルを表示
    switch (currentColorMode) {
      case COLOR_MODES.ELEMENT:
        elementSettings.style.display = "block";
        break;
      case COLOR_MODES.SCHEMA:
        schemaSettings.style.display = "block";
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
    colorInput.addEventListener("change", (e) => {
      elementColors[type] = e.target.value;
      updateElementMaterials();
      if (window.scheduleRender) window.scheduleRender();
    });

    const label = document.createElement("span");
    label.className = "legend-label";
    label.textContent = elementNames[type] || type;

    div.appendChild(colorInput);
    div.appendChild(label);
    container.appendChild(div);
  });
}

/**
 * スキーマエラー色設定UIのイベントリスナーを設定
 */
export function initializeSchemaColorControls() {
  const validColorInput = document.getElementById("schema-valid-color");
  const errorColorInput = document.getElementById("schema-error-color");

  if (validColorInput) {
    validColorInput.addEventListener("change", (e) => {
      schemaColors.valid = e.target.value;
      updateSchemaErrorMaterials();
      if (window.scheduleRender) window.scheduleRender();
    });
  }

  if (errorColorInput) {
    errorColorInput.addEventListener("change", (e) => {
      schemaColors.error = e.target.value;
      updateSchemaErrorMaterials();
      if (window.scheduleRender) window.scheduleRender();
    });
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
      if (isLine) {
        return (
          elementLineMaterials[elementType] ||
          new THREE.LineBasicMaterial({ color: 0x888888 })
        );
      } else {
        return (
          elementMaterials[elementType] ||
          new THREE.MeshStandardMaterial({ color: 0x888888 })
        );
      }
    case COLOR_MODES.SCHEMA:
      // スキーマエラーチェック結果に基づく色付け
      const errorInfo = elementId
        ? getSchemaError(elementId)
        : { hasError: false };
      const color = errorInfo.hasError
        ? schemaColors.error
        : schemaColors.valid;
      if (isLine) {
        return new THREE.LineBasicMaterial({ color: color });
      } else {
        return new THREE.MeshStandardMaterial({
          color: color,
          roughness: 0.6,
          metalness: 0.1,
          side: THREE.DoubleSide,
        });
      }
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

  // 初期化
  updateElementMaterials();
  initializeElementColorControls();
  initializeSchemaColorControls();
  updateColorModeUI();
}

/**
 * 色付けモード変更時に全ての要素を再描画する
 */
export function updateElementsForColorMode() {
  // 再描画をリクエスト
  if (window.scheduleRender) {
    window.scheduleRender();
  }

  // 色付けモードが変更されたことをログ出力
  console.log(`Color mode changed to: ${getCurrentColorMode()}`);

  // スキーマモードの場合はデモエラーを設定
  if (getCurrentColorMode() === COLOR_MODES.SCHEMA) {
    setDemoSchemaErrors();
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

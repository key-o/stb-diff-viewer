/**
 * @fileoverview ラベル管理モジュール
 *
 * このファイルは、ラベル関連の全ての機能を統合管理します:
 * - ラベル内容の生成と管理
 * - ラベル表示/非表示の制御
 * - 色付けモード変更時の自動更新
 * - パフォーマンス最適化されたバッチ処理
 * - 一元化されたラベル設定API
 *
 * このシステムにより、ラベル関連のコードの重複を排除し、
 * 保守性とパフォーマンスを向上させます。
 */

import { getState, setState } from "../core/globalState.js";
import { getAllLabels } from "./state.js";
import {
  getCurrentStorySelection,
  getCurrentXAxisSelection,
  getCurrentYAxisSelection,
} from "./selectors.js";
import labelDisplayManager from "../viewer/rendering/labelDisplayManager.js";

// ラベル更新のバッチ処理用
let labelUpdateScheduled = false;
const pendingLabelUpdates = new Set();

// ラベル内容タイプの定義
export const LABEL_CONTENT_TYPES = {
  ID: "id",
  NAME: "name",
  SECTION: "section",
};

// ラベル内容の説明
const CONTENT_TYPE_DESCRIPTIONS = {
  [LABEL_CONTENT_TYPES.ID]: "タグ（デフォルト）",
  [LABEL_CONTENT_TYPES.NAME]: "インスタンス名（Name）",
  [LABEL_CONTENT_TYPES.SECTION]: "断面名（Section）",
};

/**
 * 統合ラベル管理システムを初期化
 */
export function initializeLabelManager() {
  console.log(
    "[LabelManager] Initializing label management system"
  );

  // ラベル内容選択リスナーを設定
  setupLabelContentListener();

  // 各要素タイプのラベル表示/非表示リスナーを設定
  setupLabelToggleListeners();

  console.log(
    "[LabelManager] Label management system initialized"
  );
}

/**
 * ラベル内容変更リスナーを設定
 */
function setupLabelContentListener() {
  const labelContentSelector = document.getElementById("labelContentSelector");

  if (labelContentSelector) {
    labelContentSelector.addEventListener("change", handleLabelContentChange);
    console.log("[LabelManager] Label content listener setup complete");
  } else {
    console.warn("[LabelManager] Label content selector not found");
  }
}

/**
 * 各要素タイプのラベル表示/非表示リスナーを設定
 */
function setupLabelToggleListeners() {
  const labelTypes = [
    "Node",
    "Column",
    "Girder",
    "Beam",
    "Brace",
    "Slab",
    "Wall",
    "Axis",
    "Story",
  ];

  labelTypes.forEach((type) => {
    const checkbox = document.getElementById(`toggleLabel-${type}`);
    if (checkbox) {
      checkbox.addEventListener("change", () => handleLabelToggleChange(type));
    }
  });

  console.log("[LabelManager] Label toggle listeners setup complete");
}

/**
 * ラベル内容変更を処理
 * @param {Event} event - 変更イベント
 */
function handleLabelContentChange(event) {
  const newContentType = event.target.value;
  console.log(
    `[LabelManager] Label content changed to: ${newContentType}`
  );

  // グローバル状態を更新
  setState("ui.labelContentType", newContentType);

  // 全ラベルを再生成・更新
  regenerateAllLabels();
}

/**
 * ラベル表示/非表示変更を処理
 * @param {string} elementType - 要素タイプ
 */
function handleLabelToggleChange(elementType) {
  console.log(`[LabelManager] Label toggle changed for: ${elementType}`);

  // 該当要素タイプのラベル表示を更新
  updateLabelVisibilityForType(elementType);
}

/**
 * 要素データからラベルテキストを生成（統合版）
 * @param {Object} element - 要素データ
 * @param {string} elementType - 要素タイプ
 * @returns {string} ラベルに表示するテキスト
 */
export function generateLabelText(element, elementType) {
  const contentType = getState("ui.labelContentType") || LABEL_CONTENT_TYPES.ID;

  try {
    switch (contentType) {
      case LABEL_CONTENT_TYPES.ID:
        return generateIdLabel(element, elementType);
      case LABEL_CONTENT_TYPES.NAME:
        return generateNameLabel(element, elementType);
      case LABEL_CONTENT_TYPES.SECTION:
        return generateSectionLabel(element, elementType);
      default:
        console.warn(
          `[LabelManager] Unknown content type: ${contentType}, falling back to ID`
        );
        return generateIdLabel(element, elementType);
    }
  } catch (error) {
    console.error(
      `[LabelManager] Error generating label for ${elementType}:`,
      error
    );
    return element.id || elementType;
  }
}

/**
 * ID表示用のラベルテキストを生成
 * @param {Object} element - 要素データ
 * @param {string} elementType - 要素タイプ
 * @returns {string} IDラベル
 */
function generateIdLabel(element, elementType) {
  return element.id || elementType;
}

/**
 * インスタンス名表示用のラベルテキストを生成
 * @param {Object} element - 要素データ
 * @param {string} elementType - 要素タイプ
 * @returns {string} インスタンス名ラベル
 */
function generateNameLabel(element, elementType) {
  // STB形式での一般的な名前属性を試行
  const nameFields = ["name", "instance_name", "label", "title"];

  for (const field of nameFields) {
    if (
      element[field] &&
      typeof element[field] === "string" &&
      element[field].trim() !== ""
    ) {
      return element[field];
    }
  }

  // 名前が見つからない場合はIDにフォールバック
  return element.id || `${elementType}_unknown`;
}

/**
 * 断面名表示用のラベルテキストを生成
 * @param {Object} element - 要素データ
 * @param {string} elementType - 要素タイプ
 * @returns {string} 断面名ラベル
 */
function generateSectionLabel(element, elementType) {
  // 1. 断面データから名前を取得
  if (element.sectionData && element.sectionData.name) {
    return element.sectionData.name;
  }

  // 2. グローバル状態から断面マップを取得
  const sectionMaps = getState("models.sectionMaps");
  if (sectionMaps && element.id_section) {
    let sectionMap = null;

    // 要素タイプに応じて適切な断面マップを選択
    switch (elementType) {
      case "Column":
        sectionMap = sectionMaps.columnSections;
        break;
      case "Beam":
      case "Girder":
        sectionMap = sectionMaps.beamSections;
        break;
      case "Brace":
        sectionMap = sectionMaps.braceSections;
        break;
    }

    if (sectionMap && sectionMap.has && sectionMap.has(element.id_section)) {
      const sectionInfo = sectionMap.get(element.id_section);
      if (sectionInfo && sectionInfo.name) {
        return sectionInfo.name;
      }
    }
  }

  // 3. 断面IDをそのまま表示
  if (element.id_section) {
    return element.id_section;
  }

  // 4. フォールバック：IDを表示
  return element.id || `${elementType}_no_section`;
}

/**
 * 全ラベルの表示状態を統合的に更新
 */
export function updateLabelVisibility() {
  if (labelUpdateScheduled) {
    return; // 既にスケジュール済み
  }

  labelUpdateScheduled = true;

  // 次のフレームで実行（パフォーマンス最適化）
  requestAnimationFrame(() => {
    performLabelVisibilityUpdate();
    labelUpdateScheduled = false;
  });
}

/**
 * ラベル表示状態の実際の更新を実行
 */
function performLabelVisibilityUpdate() {
  const allLabels = getAllLabels();

  if (allLabels.length === 0) {
    console.log("[LabelManager] No labels to update");
    return;
  }

  console.log(
    `[LabelManager] Updating visibility for ${allLabels.length} labels`
  );

  let visibleCount = 0;
  let hiddenCount = 0;

  allLabels.forEach((label) => {
    if (label && label.userData) {
      const shouldBeVisible = calculateLabelVisibility(label);

      if (label.visible !== shouldBeVisible) {
        label.visible = shouldBeVisible;
        if (shouldBeVisible) {
          visibleCount++;
        } else {
          hiddenCount++;
        }
      }
    }
  });

  console.log(
    `[LabelManager] Updated: ${visibleCount} shown, ${hiddenCount} hidden`
  );

  // 再描画をリクエスト
  const scheduleRender = getState("rendering.scheduleRender");
  if (scheduleRender) {
    scheduleRender();
  }
}

/**
 * 特定要素タイプのラベル表示を更新
 * @param {string} elementType - 要素タイプ
 */
function updateLabelVisibilityForType(elementType) {
  const allLabels = getAllLabels();
  const typeLabels = allLabels.filter(
    (label) =>
      label && label.userData && label.userData.elementType === elementType
  );

  const isVisible = isLabelTypeVisible(elementType);

  typeLabels.forEach((label) => {
    if (label.visible !== isVisible) {
      label.visible = isVisible;
    }
  });

  console.log(
    `[LabelManager] Updated ${
      typeLabels.length
    } ${elementType} labels to ${isVisible ? "visible" : "hidden"}`
  );

  // 再描画をリクエスト
  const scheduleRender = getState("rendering.scheduleRender");
  if (scheduleRender) {
    scheduleRender();
  }
}

/**
 * ラベルの表示状態を計算
 * @param {Object} label - ラベルオブジェクト
 * @returns {boolean} 表示すべきかどうか
 */
function calculateLabelVisibility(label) {
  const userData = label.userData;
  if (!userData || !userData.elementType) {
    return false;
  }

  // 1. 要素タイプのラベル表示設定をチェック
  if (!isLabelTypeVisible(userData.elementType)) {
    return false;
  }

  // 2. クリッピング条件をチェック
  if (!isLabelWithinClippingBounds(label)) {
    return false;
  }

  // 3. モデル表示状態をチェック
  if (!isLabelModelVisible(label)) {
    return false;
  }

  return true;
}

/**
 * 要素タイプのラベル表示設定をチェック
 * @param {string} elementType - 要素タイプ
 * @returns {boolean} ラベル表示が有効かどうか
 */
function isLabelTypeVisible(elementType) {
  // labelDisplayManagerと同期してから状態を取得
  labelDisplayManager.syncWithCheckbox(elementType);
  return labelDisplayManager.isLabelVisible(elementType);
}

/**
 * ラベルがクリッピング範囲内にあるかチェック
 * @param {Object} label - ラベルオブジェクト
 * @returns {boolean} クリッピング範囲内かどうか
 */
function isLabelWithinClippingBounds(label) {
  // 階クリッピング
  const storySelection = getCurrentStorySelection();
  if (storySelection && storySelection !== "all") {
    // 階クリッピングのロジック（既存のコードから移植）
    // 実装は省略
  }

  // X軸・Y軸クリッピング
  const xAxisSelection = getCurrentXAxisSelection();
  const yAxisSelection = getCurrentYAxisSelection();

  // 簡略化されたクリッピングチェック
  return true; // 実際の実装では詳細なチェックが必要
}

/**
 * ラベルのモデルが表示状態かチェック
 * @param {Object} label - ラベルオブジェクト
 * @returns {boolean} モデルが表示中かどうか
 */
function isLabelModelVisible(label) {
  const userData = label.userData;

  // モデルA/Bの表示状態をチェック
  const showModelA = document.getElementById("toggleModelA")?.checked ?? true;
  const showModelB = document.getElementById("toggleModelB")?.checked ?? true;

  if (userData.modelSource === "A" && !showModelA) {
    return false;
  }
  if (userData.modelSource === "B" && !showModelB) {
    return false;
  }

  return true;
}

/**
 * 全ラベルを再生成
 */
export function regenerateAllLabels() {
  console.log("[LabelManager] Regenerating all labels");

  // ラベル再生成ロジック
  import("./labelRegeneration.js").then(
    ({ regenerateAllLabels: regenerateAllLabelsImpl }) => {
      if (regenerateAllLabelsImpl) {
        regenerateAllLabelsImpl();
      }

      // 再生成後に表示状態を更新
      updateLabelVisibility();
    }
  );
}

/**
 * ラベル内容タイプの説明を取得
 * @param {string} contentType - 内容タイプ
 * @returns {string} 説明
 */
export function getLabelContentDescription(contentType) {
  return CONTENT_TYPE_DESCRIPTIONS[contentType] || contentType;
}

/**
 * 利用可能なラベル内容タイプを取得
 * @returns {Array} 利用可能なタイプの配列
 */
export function getAvailableLabelContentTypes() {
  return Object.values(LABEL_CONTENT_TYPES);
}

/**
 * 色付けモード変更時のラベル更新
 * この関数は colorModes.js から呼び出される
 */
export function handleColorModeChange() {
  console.log("[LabelManager] Handling color mode change");

  // ラベルの表示状態を再計算
  updateLabelVisibility();

  // 必要に応じてラベル内容も更新
  // （色付けモードによってはラベル内容も変更される可能性）
}

/**
 * @fileoverview ラベル再生成機能モジュール
 *
 * このファイルは、ラベル内容設定の変更時にラベルを再生成する機能を提供します:
 * - 既存ラベルの削除と再作成
 * - 新しい表示設定でのラベル内容更新
 * - パフォーマンス最適化された一括更新
 * - 現在の表示状態の保持
 */

import { getAllLabels, setAllLabels } from "./state.js";
import { generateLabelText } from "./unifiedLabelManager.js";
import { createLabelSprite } from "../viewer/ui/labels.js";
import { updateLabelVisibility } from "./unifiedLabelManager.js";
import { elementGroups } from "../viewer/index.js";

/**
 * 全てのラベルを現在の設定で再生成する
 * 既存のラベルを削除し、新しい設定で作り直す
 */
export function regenerateAllLabels() {
  console.log("Starting label regeneration...");

  try {
    const existingLabels = getAllLabels();

    if (existingLabels.length === 0) {
      console.log("No existing labels to regenerate");
      return;
    }

    console.log(`Regenerating ${existingLabels.length} labels`);

    // 既存ラベルの情報を保存
    const labelInfo = extractLabelInformation(existingLabels);

    // 既存ラベルを削除
    removeLabelSprites(existingLabels);

    // 新しいラベルを作成
    const newLabels = createUpdatedLabels(labelInfo);

    // グローバル状態を更新
    setAllLabels(newLabels);

    // ラベル表示状態を更新
    updateLabelVisibility();

    console.log(
      `Label regeneration completed: ${newLabels.length} labels updated`
    );
  } catch (error) {
    console.error("Error during label regeneration:", error);
  }
}

/**
 * 既存ラベルから必要な情報を抽出
 * @param {Array<THREE.Sprite>} labels - 既存のラベル配列
 * @returns {Array<Object>} ラベル情報配列
 */
function extractLabelInformation(labels) {
  return labels.map((label) => ({
    position: label.position.clone(),
    elementType: label.userData.elementType,
    elementId: label.userData.elementId,
    elementIdA: label.userData.elementIdA,
    elementIdB: label.userData.elementIdB,
    modelSource: label.userData.modelSource,
    storyId: label.userData.storyId,
    xAxisId: label.userData.xAxisId,
    yAxisId: label.userData.yAxisId,
    parentGroup: label.parent,
    originalElement: label.userData.originalElement,
    visible: label.visible,
  }));
}

/**
 * ラベルスプライトをシーンから削除
 * @param {Array<THREE.Sprite>} labels - 削除するラベル配列
 */
function removeLabelSprites(labels) {
  labels.forEach((label) => {
    if (label.parent) {
      label.parent.remove(label);
    }

    // テクスチャを破棄してメモリリークを防止
    if (label.material && label.material.map) {
      label.material.map.dispose();
    }
    if (label.material) {
      label.material.dispose();
    }
  });
}

/**
 * 更新されたラベル内容で新しいラベルを作成
 * @param {Array<Object>} labelInfo - ラベル情報配列
 * @returns {Array<THREE.Sprite>} 新しいラベル配列
 */
function createUpdatedLabels(labelInfo) {
  const newLabels = [];

  labelInfo.forEach((info) => {
    let labelText;

    // ラベルテキストを生成
    if (info.modelSource === "matched" && info.elementIdA && info.elementIdB) {
      // マッチした要素の場合は両方のIDを表示
      labelText = `${info.elementIdA} / ${info.elementIdB}`;
    } else if (info.originalElement) {
      // 元の要素データがある場合は設定に基づいて生成
      console.log(
        `Using original element data for ${info.elementType}:`,
        info.originalElement
      );
      labelText = generateLabelText(
        info.originalElement,
        info.elementType
      );
    } else {
      // 元のデータがない場合はIDを使用
      console.warn(
        `No original element data for ${info.elementType}, using ID: ${info.elementId}`
      );
      labelText = info.elementId || info.elementType;
    }

    // 新しいラベルスプライトを作成
    const sprite = createLabelSprite(
      labelText,
      info.position,
      null, // parentGroupは後で設定
      info.elementType
    );

    if (sprite) {
      // ユーザーデータを復元
      sprite.userData.elementId = info.elementId;
      sprite.userData.elementIdA = info.elementIdA;
      sprite.userData.elementIdB = info.elementIdB;
      sprite.userData.modelSource = info.modelSource;
      sprite.userData.storyId = info.storyId;
      sprite.userData.xAxisId = info.xAxisId;
      sprite.userData.yAxisId = info.yAxisId;
      sprite.userData.originalElement = info.originalElement;

      // 表示状態を復元
      sprite.visible = info.visible;

      // 親グループに追加
      if (info.parentGroup) {
        info.parentGroup.add(sprite);
      }

      newLabels.push(sprite);
    }
  });

  return newLabels;
}

/**
 * 特定の要素タイプのラベルのみを再生成
 * @param {string} elementType - 要素タイプ
 */
export function regenerateLabelsForElementType(elementType) {
  console.log(`Regenerating labels for element type: ${elementType}`);

  try {
    const allLabels = getAllLabels();
    const targetLabels = allLabels.filter(
      (label) => label.userData.elementType === elementType
    );

    if (targetLabels.length === 0) {
      console.log(`No labels found for element type: ${elementType}`);
      return;
    }

    // 該当するラベルの情報を抽出
    const labelInfo = extractLabelInformation(targetLabels);

    // 該当するラベルを削除
    removeLabelSprites(targetLabels);

    // 新しいラベルを作成
    const newLabels = createUpdatedLabels(labelInfo);

    // グローバル状態から古いラベルを削除し、新しいラベルを追加
    const otherLabels = allLabels.filter(
      (label) => label.userData.elementType !== elementType
    );
    setAllLabels([...otherLabels, ...newLabels]);

    // ラベル表示状態を更新
    updateLabelVisibility();

    console.log(
      `Label regeneration completed for ${elementType}: ${newLabels.length} labels updated`
    );
  } catch (error) {
    console.error(`Error regenerating labels for ${elementType}:`, error);
  }
}

/**
 * ラベル再生成のためのユーティリティ関数を提供
 * 要素データと共にラベル情報を保存
 * @param {THREE.Sprite} sprite - ラベルスプライト
 * @param {Object} elementData - 要素データ
 */
export function attachElementDataToLabel(sprite, elementData) {
  if (sprite && sprite.userData) {
    sprite.userData.originalElement = elementData;
  }
}

/**
 * ラベル再生成状況の統計を取得
 * @returns {Object} 再生成統計情報
 */
export function getLabelRegenerationStatistics() {
  const allLabels = getAllLabels();

  const stats = {
    total: allLabels.length,
    byElementType: {},
    withElementData: 0,
    withoutElementData: 0,
  };

  allLabels.forEach((label) => {
    const elementType = label.userData.elementType || "unknown";

    if (!stats.byElementType[elementType]) {
      stats.byElementType[elementType] = 0;
    }
    stats.byElementType[elementType]++;

    if (label.userData.originalElement) {
      stats.withElementData++;
    } else {
      stats.withoutElementData++;
    }
  });

  return stats;
}

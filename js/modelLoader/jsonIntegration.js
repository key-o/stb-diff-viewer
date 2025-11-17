/**
 * @fileoverview JSON統合モデル処理モジュール
 *
 * このファイルは、JSON形式のモデルデータをSTBビューワーに統合する機能を提供します。
 * ProfileBased生成器を活用した3D表示システムとの統合を担当します。
 */

import * as THREE from "three";
import { JsonDisplayIntegration } from "../viewer/integration/jsonDisplayIntegration.js";
import {
  clearSceneContent,
  elementGroups,
  adjustCameraToFitModel,
  createOrUpdateGridHelper,
  camera,
  controls,
} from "../viewer/index.js";
import { setState } from "../core/globalState.js";
import { getAllLabels, setAllLabels } from "../ui/state.js";

/**
 * JSON統合モデル処理関数
 * @param {File} fileA - ファイルA
 * @param {File} fileB - ファイルB
 * @param {boolean} isJsonFileA - ファイルAがJSONかどうか
 * @param {boolean} isJsonFileB - ファイルBがJSONかどうか
 * @param {JsonDisplayIntegration} jsonIntegration - JSON統合システム
 * @returns {Promise<Object>} 処理結果
 */
export async function processJsonIntegratedModels(
  fileA,
  fileB,
  isJsonFileA,
  isJsonFileB,
  jsonIntegration
) {
  console.log("=== JSON統合モデル処理開始 ===");

  try {
    let displayResultA = null;
    let displayResultB = null;

    // ファイルAの処理
    if (isJsonFileA) {
      console.log("ファイルA: JSON統合処理中...");
      displayResultA = await jsonIntegration.generateFrom3DDataFromJson(fileA);
      console.log(
        `ファイルA: ${displayResultA.allMeshes.length}個のメッシュ生成完了 (ProfileBased)`
      );

      // パフォーマンス統計
      const perfStats = jsonIntegration.getPerformanceStats();
      console.log(
        `ファイルA 処理時間: ${perfStats.totalTime.toFixed(1)}ms, ${
          perfStats.meshesPerSecond
        } meshes/sec`
      );
    }

    // ファイルBの処理
    if (isJsonFileB) {
      console.log("ファイルB: JSON統合処理中...");
      const jsonIntegrationB = new JsonDisplayIntegration();
      displayResultB = await jsonIntegrationB.generateFrom3DDataFromJson(fileB);
      console.log(
        `ファイルB: ${displayResultB.allMeshes.length}個のメッシュ生成完了 (ProfileBased)`
      );

      // パフォーマンス統計
      const perfStatsB = jsonIntegrationB.getPerformanceStats();
      console.log(
        `ファイルB 処理時間: ${perfStatsB.totalTime.toFixed(1)}ms, ${
          perfStatsB.meshesPerSecond
        } meshes/sec`
      );
    }

    // シーンクリアとメッシュ追加
    const existingLabels = getAllLabels();
    clearSceneContent(elementGroups, existingLabels);
    if (existingLabels.length > 0) {
      setAllLabels([]);
    }
    console.log("既存シーンコンテンツクリア完了");

    // モデルAのメッシュをシーンに追加
    if (displayResultA) {
      displayResultA.allMeshes.forEach((mesh) => {
        // JSON統合メタデータを追加
        mesh.userData.modelSource = "A";
        mesh.userData.comparison = "modelA";
        mesh.userData.isJsonInput = true;
        mesh.userData.generationMethod = "ProfileBased";

        // 要素タイプ別グループ化
        const elementType = mesh.userData.elementType;
        if (elementType && elementGroups[elementType]) {
          elementGroups[elementType].add(mesh);
        }
      });
      console.log(
        `モデルA: ${displayResultA.allMeshes.length}個のメッシュをシーンに追加`
      );
    }

    // モデルBのメッシュをシーンに追加
    if (displayResultB) {
      displayResultB.allMeshes.forEach((mesh) => {
        mesh.userData.modelSource = "B";
        mesh.userData.comparison = "modelB";
        mesh.userData.isJsonInput = true;
        mesh.userData.generationMethod = "ProfileBased";

        const elementType = mesh.userData.elementType;
        if (elementType && elementGroups[elementType]) {
          elementGroups[elementType].add(mesh);
        }
      });
      console.log(
        `モデルB: ${displayResultB.allMeshes.length}個のメッシュをシーンに追加`
      );
    }

    // カメラフィッティングとグリッド調整
    const allMeshes = [
      ...(displayResultA?.allMeshes || []),
      ...(displayResultB?.allMeshes || []),
    ];

    if (allMeshes.length > 0) {
      console.log("カメラフィッティングとグリッド調整実行中...");

      const box = new THREE.Box3();
      allMeshes.forEach((mesh) => box.expandByObject(mesh));

      // モデル境界情報
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      console.log(
        `モデル境界: サイズ ${size.x.toFixed(0)}x${size.y.toFixed(
          0
        )}x${size.z.toFixed(0)}mm, 中心 (${center.x.toFixed(
          0
        )}, ${center.y.toFixed(0)}, ${center.z.toFixed(0)})`
      );

      if (camera && controls) {
        adjustCameraToFitModel(box, camera, controls);
      } else {
        console.warn(
          "カメラまたはコントロールが未初期化のためフィット処理をスキップしました"
        );
      }
      createOrUpdateGridHelper(box);

      console.log(`JSON統合表示完了: 総メッシュ数 ${allMeshes.length}個`);
    } else {
      console.warn("JSON統合処理: メッシュが生成されませんでした");
    }

    // グローバル状態更新
    setState("models.hasJsonFiles", true);
    setState("models.jsonDisplayA", displayResultA);
    setState("models.jsonDisplayB", displayResultB);
    setState("models.jsonIntegrationComplete", true);

    // 統計情報
    const totalMeshes = allMeshes.length;
    const columnMeshes = allMeshes.filter(
      (m) => m.userData.elementType === "Column"
    ).length;
    const beamMeshes = allMeshes.filter(
      (m) => m.userData.elementType === "Beam"
    ).length;
    const braceMeshes = allMeshes.filter(
      (m) => m.userData.elementType === "Brace"
    ).length;

    console.log("JSON統合統計:");
    console.log(`  - 総メッシュ: ${totalMeshes}個`);
    console.log(`  - 柱: ${columnMeshes}個`);
    console.log(`  - 梁: ${beamMeshes}個`);
    console.log(`  - ブレース: ${braceMeshes}個`);

    return {
      success: true,
      result: true,
      meshCount: totalMeshes,
      displayResultA,
      displayResultB,
      statistics: {
        totalMeshes,
        columnMeshes,
        beamMeshes,
        braceMeshes,
      },
    };
  } catch (error) {
    console.error("JSON統合モデル処理エラー:", error);
    console.error("スタックトレース:", error.stack);

    return {
      success: false,
      error: error.message,
      stack: error.stack,
    };
  }
}

/**
 * JSON統合機能の検出とサポート確認
 * @param {File} fileA - ファイルA
 * @param {File} fileB - ファイルB
 * @returns {Object} JSON対応情報
 */
export function detectJsonIntegrationSupport(fileA, fileB) {
  const isJsonFileA = fileA?.name.toLowerCase().endsWith(".json");
  const isJsonFileB = fileB?.name.toLowerCase().endsWith(".json");
  const hasJsonFiles = isJsonFileA || isJsonFileB;

  const supportInfo = {
    hasJsonFiles,
    isJsonFileA,
    isJsonFileB,
    supportedModes: [],
  };

  if (isJsonFileA && isJsonFileB) {
    supportInfo.supportedModes.push("JSON-JSON比較");
  } else if (isJsonFileA && !isJsonFileB) {
    supportInfo.supportedModes.push("JSON-STB混合比較");
  } else if (!isJsonFileA && isJsonFileB) {
    supportInfo.supportedModes.push("STB-JSON混合比較");
  }

  if (hasJsonFiles) {
    console.log("JSON統合サポート検出:", supportInfo);
  }

  return supportInfo;
}

/**
 * JSON統合処理の検証
 * @param {Object} displayResult - 表示結果
 * @returns {Object} 検証結果
 */
export function validateJsonIntegrationResult(displayResult) {
  const validation = {
    isValid: false,
    errors: [],
    warnings: [],
    statistics: {},
  };

  try {
    if (!displayResult) {
      validation.errors.push("表示結果が null または undefined");
      return validation;
    }

    if (!displayResult.allMeshes || !Array.isArray(displayResult.allMeshes)) {
      validation.errors.push("allMeshes が配列ではない");
      return validation;
    }

    const meshCount = displayResult.allMeshes.length;
    if (meshCount === 0) {
      validation.warnings.push("メッシュが生成されていない");
    }

    // メッシュの検証
    let validMeshes = 0;
    let invalidMeshes = 0;

    displayResult.allMeshes.forEach((mesh, index) => {
      if (
        mesh.userData &&
        mesh.userData.elementId &&
        mesh.userData.elementType
      ) {
        validMeshes++;
      } else {
        invalidMeshes++;
        validation.warnings.push(`メッシュ ${index + 1}: userData検証失敗`);
      }
    });

    validation.statistics = {
      totalMeshes: meshCount,
      validMeshes,
      invalidMeshes,
      validityRate:
        meshCount > 0 ? ((validMeshes / meshCount) * 100).toFixed(1) : 0,
    };

    validation.isValid = meshCount > 0 && invalidMeshes === 0;

    if (validation.isValid) {
      console.log("JSON統合処理検証: 成功");
    } else {
      console.warn("JSON統合処理検証: 問題あり", validation);
    }

    return validation;
  } catch (error) {
    validation.errors.push(`検証エラー: ${error.message}`);
    return validation;
  }
}

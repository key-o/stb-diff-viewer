/**
 * @fileoverview 基礎形状生成モジュール
 *
 * 新しい共通ユーティリティ（ElementGeometryUtils）を活用した基礎形状生成:
 * - 単一ノード（id_node）+ level_bottom属性による配置
 * - STB形式とJSON形式の両対応
 * - 直方体形状（width_X, width_Y, depth）
 * - 地中配置（負のZ座標）対応
 *
 * 設計思想:
 * - ElementGeometryUtilsで共通処理を統一
 * - 1ノード要素専用の新しい配置ロジックを導入
 * - 柱・梁とは異なる配置基準（底面中心基準）
 */

import * as THREE from "three";
import { materials } from "../rendering/materials.js";
import { ElementGeometryUtils } from "./ElementGeometryUtils.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("viewer:geometry:footing");

/**
 * 基礎形状生成クラス
 */
export class FootingGenerator {
  /**
   * 基礎要素からメッシュを作成
   * @param {Array} footingElements - 基礎要素配列
   * @param {Map<string, THREE.Vector3>} nodes - ノードマップ
   * @param {Map<string, Object>} footingSections - 基礎断面マップ
   * @param {Map<string, Object>} steelSections - 鋼材形状マップ（未使用だがインターフェース統一のため）
   * @param {string} elementType - 要素タイプ（デフォルト: "Footing"）
   * @param {boolean} isJsonInput - JSON入力かどうか
   * @returns {Array<THREE.Mesh>} 生成されたメッシュ配列
   */
  static createFootingMeshes(
    footingElements,
    nodes,
    footingSections,
    steelSections,
    elementType = "Footing",
    isJsonInput = false
  ) {
    log.info(`Creating ${footingElements.length} footing meshes`);
    const meshes = [];

    for (const footing of footingElements) {
      try {
        const mesh = this._createSingleFootingMesh(
          footing,
          nodes,
          footingSections,
          steelSections,
          elementType,
          isJsonInput
        );

        if (mesh) {
          meshes.push(mesh);
        }
      } catch (error) {
        log.error(`Error creating footing ${footing.id}:`, error);
      }
    }

    log.info(`Generated ${meshes.length} footing meshes`);
    return meshes;
  }

  /**
   * 単一基礎メッシュを作成（ElementGeometryUtils活用）
   * @private
   */
  static _createSingleFootingMesh(
    footing,
    nodes,
    footingSections,
    steelSections,
    elementType,
    isJsonInput
  ) {
    // 1. ノード位置の取得（ElementGeometryUtils使用）
    const nodePositions = ElementGeometryUtils.getNodePositions(
      footing,
      nodes,
      {
        nodeType: "1node",
        isJsonInput: isJsonInput,
        node1Key: "id_node",
      }
    );

    if (!nodePositions.valid) {
      log.warn(`Skipping footing ${footing.id}: Invalid node position`);
      return null;
    }

    // 2. 断面データの取得（ElementGeometryUtils使用）
    const sectionData = ElementGeometryUtils.getSectionData(
      footing,
      footingSections,
      isJsonInput
    );

    if (!sectionData) {
      log.warn(`Skipping footing ${footing.id}: Missing section data`);
      return null;
    }

    // 3. 断面寸法の取得
    const dimensions = sectionData.dimensions || sectionData;

    // 基礎の寸法（STB属性名に対応）
    const widthX =
      dimensions.width_X || dimensions.outer_width || dimensions.width || 1000; // mm
    const widthY =
      dimensions.width_Y ||
      dimensions.overall_depth ||
      dimensions.height ||
      1000; // mm
    const depth = dimensions.depth || dimensions.overall_height || 1500; // mm

    if (!widthX || !widthY || !depth) {
      log.warn(
        `Skipping footing ${footing.id}: Invalid dimensions (widthX=${widthX}, widthY=${widthY}, depth=${depth})`
      );
      return null;
    }

    log.debug(`Creating footing ${footing.id}: ${widthX}×${widthY}×${depth}mm`);

    // 4. level_bottom の取得
    const levelBottom = footing.level_bottom || 0;

    // 5. オフセットと回転の取得（ElementGeometryUtils使用）
    const offsetAndRotation = ElementGeometryUtils.getOffsetAndRotation(
      footing,
      {
        nodeType: "1node",
      }
    );

    // 6. 配置計算（1ノード要素専用ロジック - ElementGeometryUtils使用）
    const placement = ElementGeometryUtils.calculateSingleNodePlacement(
      nodePositions.node,
      levelBottom,
      depth,
      {
        offset: offsetAndRotation.startOffset,
        rotation: (offsetAndRotation.rollAngle * Math.PI) / 180, // 度→ラジアン変換
      }
    );

    log.debug(
      `Footing ${footing.id}: position=(${placement.position.x.toFixed(
        0
      )}, ${placement.position.y.toFixed(0)}, ${placement.position.z.toFixed(
        0
      )}), ` +
        `bottomZ=${placement.bottomZ.toFixed(0)}, topZ=${placement.topZ.toFixed(
          0
        )}`
    );

    // 7. 直方体ジオメトリを作成
    const geometry = new THREE.BoxGeometry(widthX, widthY, depth);

    // 8. メッシュ作成（ElementGeometryUtils使用）
    const mesh = ElementGeometryUtils.createMeshWithMetadata(
      geometry,
      materials.matchedMesh,
      footing,
      {
        elementType: elementType,
        isJsonInput: isJsonInput,
        length: depth,
        sectionType: "RECTANGLE",
        profileMeta: { profileSource: "BoxGeometry", profileType: "RECTANGLE" },
        sectionData: sectionData,
      }
    );

    // 9. 配置を適用
    mesh.position.copy(placement.position);
    mesh.quaternion.setFromEuler(placement.rotation);

    // 10. 追加メタデータ（基礎固有情報）
    mesh.userData.footingData = {
      widthX: widthX,
      widthY: widthY,
      depth: depth,
      levelBottom: levelBottom,
      bottomZ: placement.bottomZ,
      topZ: placement.topZ,
    };

    // 11. 配置基準線を添付（オプション - 基礎では省略可能）
    // ElementGeometryUtils.attachPlacementLine(...);

    return mesh;
  }
}

// デバッグ・開発支援
if (typeof window !== "undefined") {
  window.FootingGenerator = FootingGenerator;
}

export default FootingGenerator;

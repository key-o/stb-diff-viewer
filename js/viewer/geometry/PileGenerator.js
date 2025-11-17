/**
 * @fileoverview 杭形状生成モジュール
 *
 * 新しい共通ユーティリティ（ElementGeometryUtils）を活用した杭形状生成:
 * - 柱と同じ2ノード垂直要素構造
 * - STB形式とJSON形式の両対応
 * - 円形・矩形断面の対応
 * - 地中配置（負のZ座標）対応
 *
 * 設計思想:
 * - ElementGeometryUtilsで共通処理を統一
 * - 柱との差分は最小限に抑える
 * - 既存の3層アーキテクチャを活用
 */

import * as THREE from "three";
import { materials } from "../rendering/materials.js";
import { ElementGeometryUtils } from "./ElementGeometryUtils.js";
import { createExtrudeGeometry } from "./core/ThreeJSConverter.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("viewer:geometry:pile");

/**
 * 杭形状生成クラス
 */
export class PileGenerator {
  /**
   * 杭要素からメッシュを作成
   * @param {Array} pileElements - 杭要素配列
   * @param {Map<string, THREE.Vector3>} nodes - ノードマップ
   * @param {Map<string, Object>} pileSections - 杭断面マップ
   * @param {Map<string, Object>} steelSections - 鋼材形状マップ（未使用だがインターフェース統一のため）
   * @param {string} elementType - 要素タイプ（デフォルト: "Pile"）
   * @param {boolean} isJsonInput - JSON入力かどうか
   * @returns {Array<THREE.Mesh>} 生成されたメッシュ配列
   */
  static createPileMeshes(
    pileElements,
    nodes,
    pileSections,
    steelSections,
    elementType = "Pile",
    isJsonInput = false
  ) {
    log.info(`Creating ${pileElements.length} pile meshes`);
    const meshes = [];

    for (const pile of pileElements) {
      try {
        const mesh = this._createSinglePileMesh(
          pile,
          nodes,
          pileSections,
          steelSections,
          elementType,
          isJsonInput
        );

        if (mesh) {
          meshes.push(mesh);
        }
      } catch (error) {
        log.error(`Error creating pile ${pile.id}:`, error);
      }
    }

    log.info(`Generated ${meshes.length} pile meshes`);
    return meshes;
  }

  /**
   * 単一杭メッシュを作成（ElementGeometryUtils活用）
   * @private
   */
  static _createSinglePileMesh(
    pile,
    nodes,
    pileSections,
    steelSections,
    elementType,
    isJsonInput
  ) {
    // 1. 断面データの取得（1-node format時に長さ情報が必要なため先に取得）
    const sectionData = ElementGeometryUtils.getSectionData(
      pile,
      pileSections,
      isJsonInput
    );

    if (!sectionData) {
      log.warn(`Skipping pile ${pile.id}: Missing section data`);
      return null;
    }

    // 2. ノード位置の取得
    let nodePositions;

    // 1-node format (id_node + level_top)
    if (pile.pileFormat === "1node") {
      const topNode = nodes.get(pile.id_node);
      if (!topNode) {
        log.warn(`Skipping pile ${pile.id}: Node ${pile.id_node} not found`);
        return null;
      }

      // Extract pile length (priority: length_all attribute > section dimensions > diameter-based estimate)
      let pileLength = 0;
      const dims = sectionData.dimensions || {};

      if (pile.length_all !== undefined && pile.length_all !== null) {
        // 1st priority: Use length_all attribute from pile element (STB standard)
        pileLength = parseFloat(pile.length_all);
        log.debug(`Pile ${pile.id}: Using length_all=${pileLength}mm from element attribute`);
      } else if (dims.length_pile) {
        // 2nd priority: Use length_pile from section dimensions
        pileLength = parseFloat(dims.length_pile);
        log.debug(`Pile ${pile.id}: Using length_pile=${pileLength}mm from section dimensions`);
      } else if (dims.D || dims.diameter) {
        // 3rd priority: Estimate from diameter (fallback for incomplete data)
        const diameter = dims.D || dims.diameter;
        pileLength = parseFloat(diameter) * 20; // Assume 20x diameter
        log.warn(
          `Pile ${pile.id}: No explicit length, estimating ${pileLength}mm (20×diameter)`
        );
      } else {
        log.warn(
          `Pile ${pile.id}: Cannot determine pile length. Element keys: ${Object.keys(pile).join(', ')}, Section keys: ${Object.keys(sectionData).join(', ')}`
        );
        return null;
      }

      // Calculate top node position (id_node + offsets + level_top for Z)
      const topNodePos = {
        x: topNode.x + (pile.offset_X || 0),
        y: topNode.y + (pile.offset_Y || 0),
        z: pile.level_top, // level_top is the top Z coordinate
      };

      // Calculate bottom node position (top - pile length)
      const bottomNode = {
        x: topNodePos.x,
        y: topNodePos.y,
        z: topNodePos.z - pileLength, // Bottom is below top
      };

      nodePositions = {
        type: "2node-vertical",
        bottomNode: bottomNode,
        topNode: topNodePos,
        valid: true,
      };

      log.debug(
        `Pile ${pile.id} (1-node format): length=${pileLength}mm, top=(${topNodePos.x},${topNodePos.y},${topNodePos.z}), bottom=(${bottomNode.x},${bottomNode.y},${bottomNode.z})`
      );
    }
    // 2-node format (id_node_bottom + id_node_top) - existing logic
    else {
      nodePositions = ElementGeometryUtils.getNodePositions(pile, nodes, {
        nodeType: "2node-vertical",
        isJsonInput: isJsonInput,
        node1KeyStart: "id_node_bottom",
        node1KeyEnd: "id_node_top",
      });
    }

    if (!nodePositions.valid) {
      log.warn(`Skipping pile ${pile.id}: Invalid node positions`);
      return null;
    }

    // 3. 断面タイプの推定（ElementGeometryUtils使用）
    const sectionType = ElementGeometryUtils.inferSectionType(sectionData);

    log.debug(
      `Creating pile ${pile.id}: section_type=${sectionType}, kind=${pile.kind}`
    );

    // 4. プロファイル生成（ElementGeometryUtils使用）
    const profileResult = ElementGeometryUtils.createProfile(
      sectionData,
      sectionType,
      pile
    );

    if (!profileResult || !profileResult.shape) {
      log.warn(`Skipping pile ${pile.id}: Failed to create profile`);
      return null;
    }

    // 5. オフセットと回転の取得（ElementGeometryUtils使用）
    const offsetAndRotation = ElementGeometryUtils.getOffsetAndRotation(pile, {
      nodeType: "2node-vertical",
    });

    // 6. 配置計算（ElementGeometryUtils使用）
    const placement = ElementGeometryUtils.calculateDualNodePlacement(
      nodePositions.bottomNode,
      nodePositions.topNode,
      {
        startOffset: offsetAndRotation.startOffset,
        endOffset: offsetAndRotation.endOffset,
        rollAngle: offsetAndRotation.rollAngle,
      }
    );

    if (placement.length <= 0) {
      log.warn(`Skipping pile ${pile.id}: Invalid length ${placement.length}`);
      return null;
    }

    log.debug(`Pile ${pile.id}: length=${placement.length.toFixed(1)}mm`);

    // 7. 押し出しジオメトリを作成
    const geometry = createExtrudeGeometry(
      profileResult.shape,
      placement.length
    );

    if (!geometry) {
      log.warn(`Skipping pile ${pile.id}: Failed to create geometry`);
      return null;
    }

    // 8. メッシュ作成（ElementGeometryUtils使用）
    const mesh = ElementGeometryUtils.createMeshWithMetadata(
      geometry,
      materials.matchedMesh,
      pile,
      {
        elementType: elementType,
        isJsonInput: isJsonInput,
        length: placement.length,
        sectionType: sectionType,
        profileMeta: profileResult.meta,
        sectionData: sectionData,
      }
    );

    // 9. 配置を適用（Three.jsのメソッドを直接使用）
    mesh.position.copy(placement.center);
    mesh.quaternion.copy(placement.rotation);

    // 10. 配置基準線を添付（ElementGeometryUtils使用）
    ElementGeometryUtils.attachPlacementLine(
      mesh,
      placement.length,
      materials.placementLine,
      {
        elementType: elementType,
        elementId: pile.id,
        modelSource: "solid",
      }
    );

    return mesh;
  }
}

// デバッグ・開発支援
if (typeof window !== "undefined") {
  window.PileGenerator = PileGenerator;
}

export default PileGenerator;

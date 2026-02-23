/**
 * @fileoverview パラペット形状生成モジュール
 *
 * BaseElementGeneratorを継承した統一アーキテクチャ:
 * - 2ノード（id_node_start, id_node_end）による線状要素
 * - 壁断面（StbSecWall_RC）を参照して厚さを取得
 * - オフセット対応
 * - STB形式とJSON形式の両対応
 *
 * 作成: 2025-12
 */

import * as THREE from 'three';
import { colorManager } from '../rendering/colorManager.js';
import { BaseElementGenerator } from './core/BaseElementGenerator.js';

/**
 * パラペット形状生成クラス
 * パラペットは屋上の手すり壁で、2ノード間に配置される線状要素
 */
export class ParapetGenerator extends BaseElementGenerator {
  /**
   * ジェネレーター設定
   */
  static getConfig() {
    return {
      elementName: 'Parapet',
      loggerName: 'viewer:geometry:parapet',
      defaultElementType: 'Parapet',
    };
  }

  /**
   * パラペット要素からメッシュを作成
   * @param {Array} parapetElements - パラペット要素配列
   * @param {Map<string, THREE.Vector3>} nodes - ノードマップ
   * @param {Map<string, Object>} wallSections - 壁断面マップ（パラペットは壁断面を参照）
   * @param {Map<string, Object>} steelSections - 鋼材形状マップ（未使用だがインターフェース統一のため）
   * @param {string} elementType - 要素タイプ（デフォルト: "Parapet"）
   * @param {boolean} isJsonInput - JSON入力かどうか
   * @returns {Array<THREE.Mesh>} 生成されたメッシュ配列
   */
  static createParapetMeshes(
    parapetElements,
    nodes,
    wallSections,
    steelSections,
    elementType = 'Parapet',
    isJsonInput = false,
  ) {
    const config = this.getConfig();
    const log = this._getLogger();

    if (!parapetElements || parapetElements.length === 0) {
      log.warn(`No ${config.elementName} elements provided.`);
      return [];
    }

    const meshes = [];
    let processed = 0;
    let skipped = 0;

    for (const element of parapetElements) {
      const context = {
        nodes,
        sections: wallSections,
        steelSections,
        elementType,
        isJsonInput,
        log,
      };

      try {
        const mesh = this._createSingleMesh(element, context);
        if (mesh) {
          meshes.push(mesh);
          processed++;
        } else {
          skipped++;
        }
      } catch (error) {
        log.warn(`Error creating ${config.elementName} ${element.id}:`, error.message);
        skipped++;
      }
    }

    log.info(`${config.elementName}: Created ${processed}, Skipped ${skipped}`);
    return meshes;
  }

  /**
   * 単一パラペットメッシュを作成
   * @param {Object} parapet - パラペット要素
   * @param {Object} context - コンテキスト
   * @returns {THREE.Mesh|null} メッシュまたはnull
   */
  static _createSingleMesh(parapet, context) {
    const { nodes, sections, elementType, isJsonInput, log } = context;

    // 1. ノード座標の取得
    const startNodeId = parapet.id_node_start;
    const endNodeId = parapet.id_node_end;

    const startNode = nodes.get(startNodeId);
    const endNode = nodes.get(endNodeId);

    if (!startNode || !endNode) {
      log.warn(
        `Skipping parapet ${parapet.id}: Node not found (start=${startNodeId}, end=${endNodeId})`,
      );
      return null;
    }

    // 2. 断面データの取得（厚さと高さ）
    let thickness = 150; // デフォルト厚さ (mm)
    let height = 1200; // デフォルト高さ (mm)

    if (sections) {
      // 型統一: sectionExtractorは数値IDを整数として保存するため変換
      const rawId = parapet.id_section;
      const parsedId = parseInt(rawId, 10);
      const sectionId = isNaN(parsedId) ? rawId : parsedId;
      const sectionData = sections.get(sectionId);
      if (sectionData) {
        // 壁断面から厚さを取得
        thickness =
          sectionData.t ||
          sectionData.thickness ||
          sectionData.dimensions?.t ||
          sectionData.dimensions?.thickness ||
          150;
        // 壁断面から高さを取得（パラペット固有の高さがあれば使用）
        height =
          sectionData.h ||
          sectionData.height ||
          sectionData.dimensions?.h ||
          sectionData.dimensions?.height ||
          1200;
      }
    }

    // 3. パラペットの方向と寸法を計算
    const startPos = new THREE.Vector3(startNode.x, startNode.y, startNode.z);
    const endPos = new THREE.Vector3(endNode.x, endNode.y, endNode.z);

    // 水平方向のベクトル
    const direction = new THREE.Vector3().subVectors(endPos, startPos);
    const wallWidth = direction.length();

    if (wallWidth < 1) {
      log.warn(`Skipping parapet ${parapet.id}: Invalid width (${wallWidth})`);
      return null;
    }

    direction.normalize();

    // 壁の法線方向（Z軸と方向ベクトルの外積）
    const wallUp = new THREE.Vector3(0, 0, 1);
    const wallNormal = new THREE.Vector3().crossVectors(direction, wallUp).normalize();

    // オフセット適用（法線方向）
    const offset = parapet.offset || 0;
    const offsetVector = wallNormal.clone().multiplyScalar(offset);

    // 中心位置を計算
    const center = new THREE.Vector3()
      .addVectors(startPos, endPos)
      .multiplyScalar(0.5)
      .add(offsetVector);
    // パラペットは始点・終点の高さから上に伸びる
    center.z += height / 2;

    log.debug(
      `Parapet ${parapet.id}: width=${wallWidth.toFixed(0)}, height=${height}, thickness=${thickness}`,
    );

    // 4. ジオメトリを作成（BoxGeometry）
    const geometry = new THREE.BoxGeometry(wallWidth, thickness, height);

    if (!this._validateGeometry(geometry, parapet, context)) {
      return null;
    }

    // 5. メッシュ作成
    const mesh = new THREE.Mesh(
      geometry,
      colorManager.getMaterial('diff', { comparisonState: 'matched' }),
    );

    // 6. 配置と回転
    mesh.position.copy(center);

    // パラペットの向きを設定（水平方向に合わせる）
    const angle = Math.atan2(direction.y, direction.x);
    mesh.rotation.z = angle;

    // 7. メタデータ設定
    mesh.userData = {
      id: parapet.id,
      elementId: parapet.id,
      name: parapet.name || `Parapet_${parapet.id}`,
      elementType: elementType,
      stbElementId: parapet.id,
      isSTB: !isJsonInput,
      sectionId: parapet.id_section,
      parapetData: {
        id_node_start: startNodeId,
        id_node_end: endNodeId,
        thickness: thickness,
        height: height,
        width: wallWidth,
        center: { x: center.x, y: center.y, z: center.z },
        direction: { x: direction.x, y: direction.y, z: direction.z },
        normal: { x: wallNormal.x, y: wallNormal.y, z: wallNormal.z },
        kind_structure: parapet.kind_structure,
        kind_layout: parapet.kind_layout,
        offset: offset,
      },
    };

    log.debug(
      `Parapet ${parapet.id}: center=(${center.x.toFixed(0)}, ${center.y.toFixed(0)}, ${center.z.toFixed(0)}), ` +
        `angle=${((angle * 180) / Math.PI).toFixed(1)}deg`,
    );

    return mesh;
  }
}

export default ParapetGenerator;

/**
 * @fileoverview 布基礎形状生成モジュール
 *
 * BaseElementGeneratorを継承した統一アーキテクチャ:
 * - 2ノード（id_node_start, id_node_end）による線状要素
 * - RC断面を参照して幅・高さを取得
 * - 壁下の連続基礎を3D表示
 * - STB形式とJSON形式の両対応
 *
 * 作成: 2025-12
 */

import * as THREE from 'three';
import { materials } from '../rendering/materials.js';
import { BaseElementGenerator } from './core/BaseElementGenerator.js';

/**
 * 布基礎形状生成クラス
 * 布基礎は壁下に連続して設置される基礎で、2ノード間の線状要素
 */
export class StripFootingGenerator extends BaseElementGenerator {
  /**
   * ジェネレーター設定
   */
  static getConfig() {
    return {
      elementName: 'StripFooting',
      loggerName: 'viewer:geometry:stripFooting',
      defaultElementType: 'StripFooting',
    };
  }

  /**
   * 布基礎要素からメッシュを作成
   * @param {Array} stripFootingElements - 布基礎要素配列
   * @param {Map<string, THREE.Vector3>} nodes - ノードマップ
   * @param {Map<string, Object>} footingSections - 基礎断面マップ
   * @param {Map<string, Object>} steelSections - 鋼材形状マップ（未使用だがインターフェース統一のため）
   * @param {string} elementType - 要素タイプ（デフォルト: "StripFooting"）
   * @param {boolean} isJsonInput - JSON入力かどうか
   * @returns {Array<THREE.Mesh>} 生成されたメッシュ配列
   */
  static createStripFootingMeshes(
    stripFootingElements,
    nodes,
    footingSections,
    steelSections,
    elementType = 'StripFooting',
    isJsonInput = false,
  ) {
    const config = this.getConfig();
    const log = this._getLogger();

    if (!stripFootingElements || stripFootingElements.length === 0) {
      log.warn(`No ${config.elementName} elements provided.`);
      return [];
    }

    const meshes = [];
    let processed = 0;
    let skipped = 0;

    for (const element of stripFootingElements) {
      const context = {
        nodes,
        sections: footingSections,
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
   * 単一布基礎メッシュを作成
   * @param {Object} stripFooting - 布基礎要素
   * @param {Object} context - コンテキスト
   * @returns {THREE.Mesh|null} メッシュまたはnull
   */
  static _createSingleMesh(stripFooting, context) {
    const { nodes, sections, elementType, isJsonInput, log } = context;

    // 1. ノード座標の取得
    const startNodeId = stripFooting.id_node_start;
    const endNodeId = stripFooting.id_node_end;

    const startNode = nodes.get(startNodeId);
    const endNode = nodes.get(endNodeId);

    if (!startNode || !endNode) {
      log.warn(
        `Skipping strip footing ${stripFooting.id}: Node not found (start=${startNodeId}, end=${endNodeId})`,
      );
      return null;
    }

    // 2. 断面データの取得（幅と高さ）
    let width = 600; // デフォルト幅 (mm)
    let height = 400; // デフォルト高さ (mm)

    if (sections) {
      // 型統一: sectionExtractorは数値IDを整数として保存するため変換
      const rawId = stripFooting.id_section;
      const parsedId = parseInt(rawId, 10);
      const sectionId = isNaN(parsedId) ? rawId : parsedId;
      const sectionData = sections.get(sectionId);
      if (sectionData) {
        // 基礎断面から寸法を取得
        width =
          sectionData.width_X ||
          sectionData.width ||
          sectionData.dimensions?.width_X ||
          sectionData.dimensions?.width ||
          600;
        height =
          sectionData.depth ||
          sectionData.height ||
          sectionData.dimensions?.depth ||
          sectionData.dimensions?.height ||
          400;
      }
    }

    // 3. 布基礎の方向と寸法を計算
    const startPos = new THREE.Vector3(startNode.x, startNode.y, startNode.z);
    const endPos = new THREE.Vector3(endNode.x, endNode.y, endNode.z);

    // 方向ベクトル
    const direction = new THREE.Vector3().subVectors(endPos, startPos);
    const footingLength = direction.length();

    if (footingLength < 1) {
      log.warn(`Skipping strip footing ${stripFooting.id}: Invalid length (${footingLength})`);
      return null;
    }

    direction.normalize();

    // 中心位置を計算
    const center = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);

    // レベル調整（布基礎は地中に配置）
    const level = stripFooting.level || 0;
    center.z = level - height / 2;

    // オフセット適用
    const offset = stripFooting.offset || 0;
    // オフセット方向（水平面内で直交する方向）
    const offsetDir = new THREE.Vector3(-direction.y, direction.x, 0).normalize();
    center.add(offsetDir.multiplyScalar(offset));

    log.debug(
      `StripFooting ${stripFooting.id}: length=${footingLength.toFixed(0)}, width=${width}, height=${height}`,
    );

    // 4. ジオメトリを作成（BoxGeometry）
    // X方向 = 長さ方向, Y方向 = 幅方向, Z方向 = 高さ方向
    const geometry = new THREE.BoxGeometry(footingLength, width, height);

    if (!this._validateGeometry(geometry, stripFooting, context)) {
      return null;
    }

    // 5. メッシュ作成
    const mesh = new THREE.Mesh(geometry, materials.matchedMesh);

    // 6. 配置と回転
    mesh.position.copy(center);

    // 布基礎の向きを設定（水平方向に合わせる）
    const angle = Math.atan2(direction.y, direction.x);
    mesh.rotation.z = angle;

    // 7. メタデータ設定
    mesh.userData = {
      id: stripFooting.id,
      elementId: stripFooting.id,
      name: stripFooting.name || `StripFooting_${stripFooting.id}`,
      elementType: elementType,
      stbElementId: stripFooting.id,
      isSTB: !isJsonInput,
      sectionId: stripFooting.id_section,
      stripFootingData: {
        id_node_start: startNodeId,
        id_node_end: endNodeId,
        width: width,
        height: height,
        length: footingLength,
        center: { x: center.x, y: center.y, z: center.z },
        direction: { x: direction.x, y: direction.y, z: direction.z },
        kind_structure: stripFooting.kind_structure,
        level: level,
        offset: offset,
      },
    };

    log.debug(
      `StripFooting ${stripFooting.id}: center=(${center.x.toFixed(0)}, ${center.y.toFixed(0)}, ${center.z.toFixed(0)}), ` +
        `angle=${((angle * 180) / Math.PI).toFixed(1)}deg`,
    );

    return mesh;
  }
}

export default StripFootingGenerator;

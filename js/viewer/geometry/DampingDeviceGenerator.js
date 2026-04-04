/**
 * @fileoverview 制振装置（StbDampingDevice）のジオメトリ生成
 *
 * 制振装置はブレース型（BRACE）、間柱型（POST）、梁型（GIRDER）の3形状を持つ。
 * ブレースと同様に2ノード間の線形要素として描画する。
 * 断面形状情報を持たない製品型が多いため、簡易的な円筒形状で表現する。
 */

import * as THREE from 'three';
import { colorManager } from '../rendering/colorManager.js';
import { MeshMetadataBuilder } from './core/MeshMetadataBuilder.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('viewer:geometry:dampingDevice');

// 制振装置のデフォルト表示サイズ（mm）
const DEFAULT_RADIUS = 75;
const RADIAL_SEGMENTS = 12;

/**
 * 制振装置ジオメトリジェネレータ
 */
export class DampingDeviceGenerator {
  /**
   * 制振装置メッシュを一括生成
   * @param {Array} elements - 制振装置要素データ配列
   * @param {Map} nodes - ノードマップ (id → THREE.Vector3)
   * @param {Map} sections - 断面マップ
   * @param {Map} _steelSections - 鋼材形状マップ（未使用）
   * @param {string} [elementType='DampingDevice'] - 要素タイプ
   * @param {boolean} [isJsonInput=false] - JSON入力フラグ
   * @returns {THREE.Mesh[]} 生成されたメッシュ配列
   */
  static createDampingDeviceMeshes(
    elements,
    nodes,
    sections,
    _steelSections,
    elementType = 'DampingDevice',
    isJsonInput = false,
  ) {
    log.info(`Creating ${elements.length} DampingDevice meshes`);
    const meshes = [];

    for (const element of elements) {
      try {
        const mesh = this._createSingleMesh(element, nodes, sections, elementType, isJsonInput);
        if (mesh) meshes.push(mesh);
      } catch (error) {
        log.error(`Error creating DampingDevice ${element.id}:`, error);
      }
    }

    log.info(`Generated ${meshes.length} DampingDevice meshes`);
    return meshes;
  }

  /**
   * 単一の制振装置メッシュを生成
   */
  static _createSingleMesh(element, nodes, sections, elementType, isJsonInput) {
    const startNodeId = isJsonInput ? element.id_node_start : element.id_node_start;
    const endNodeId = isJsonInput ? element.id_node_end : element.id_node_end;

    const startNode = nodes.get(startNodeId);
    const endNode = nodes.get(endNodeId);

    if (!startNode || !endNode) {
      log.warn(
        `DampingDevice ${element.id}: node not found (start=${startNodeId}, end=${endNodeId})`,
      );
      return null;
    }

    // オフセットを適用
    const start = new THREE.Vector3().copy(startNode);
    const end = new THREE.Vector3().copy(endNode);
    this._applyOffsets(element, start, end);

    // 装置長さ（2ノード間距離）
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    if (length < 0.001) {
      log.warn(`DampingDevice ${element.id}: zero length`);
      return null;
    }

    const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

    // 円筒ジオメトリ（ダンパーの外形を簡易表現）
    const geometry = new THREE.CylinderGeometry(
      DEFAULT_RADIUS,
      DEFAULT_RADIUS,
      length,
      RADIAL_SEGMENTS,
    );

    const mesh = new THREE.Mesh(
      geometry,
      colorManager.getMaterial('diff', { comparisonState: 'matched' }),
    );

    // 位置と回転を設定
    mesh.position.copy(center);

    // 円柱のY軸を装置方向に回転
    const dir = direction.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
    mesh.quaternion.copy(quat);

    // 断面名の取得
    const sectionId = parseInt(element.id_section, 10);
    const sectionData = sections ? sections.get(sectionId) : null;

    // メタデータ設定
    mesh.userData = MeshMetadataBuilder.build({
      element,
      elementType,
      placement: { center, length },
      sectionType: 'DAMPING_DEVICE',
      sectionData,
      isJsonInput,
      extraData: {
        typeShape: element.type_shape || '',
        deviceName: element.name || '',
      },
    });

    log.debug(
      `DampingDevice ${element.id}: length=${length.toFixed(1)}mm, type_shape=${element.type_shape || 'N/A'}`,
    );
    return mesh;
  }

  /**
   * オフセットを適用
   */
  static _applyOffsets(element, start, end) {
    if (element.offset_start_X) start.x += element.offset_start_X;
    if (element.offset_start_Y) start.y += element.offset_start_Y;
    if (element.offset_start_Z) start.z += element.offset_start_Z;
    if (element.offset_end_X) end.x += element.offset_end_X;
    if (element.offset_end_Y) end.y += element.offset_end_Y;
    if (element.offset_end_Z) end.z += element.offset_end_Z;
  }
}

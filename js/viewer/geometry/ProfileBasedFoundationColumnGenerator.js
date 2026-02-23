/**
 * @fileoverview 基礎柱形状生成モジュール
 *
 * BaseElementGeneratorを継承した基礎柱専用ジェネレーター:
 * - 1ノード（id_node）から下方向（-Z方向）に伸びる
 * - 二重断面対応（Foundation部 + Wall Rise部）
 * - ProfileBasedColumnGeneratorと同様のアーキテクチャを使用
 *
 * 実装: 2025-12
 */

import * as THREE from 'three';
import { createExtrudeGeometry } from './core/ThreeJSConverter.js';
import { colorManager } from '../rendering/colorManager.js';
import { BaseElementGenerator } from './core/BaseElementGenerator.js';
import { createSectionProfile } from './core/ProfileCreationUtils.js';

/**
 * 基礎柱の配置情報を計算
 * @param {Object} baseNode - 基準ノード座標（id_nodeの位置）
 * @param {number} lengthFD - 基礎部の長さ（mm）
 * @param {number} lengthWR - 立上り部の長さ（mm、オプション）
 * @param {Object} options - オプション
 * @returns {Object} 配置情報
 */
function calculateFoundationColumnPlacement(baseNode, lengthFD, lengthWR = 0, options = {}) {
  const { offsetX = 0, offsetY = 0, rollAngle = 0 } = options;

  // 基礎柱の全長
  const totalLength = lengthFD + lengthWR;

  // 基準点（id_node）にオフセットを適用
  const offsetBaseNode = {
    x: baseNode.x + offsetX,
    y: baseNode.y + offsetY,
    z: baseNode.z,
  };

  // 下端の座標（Z軸負方向）
  const bottomNode = {
    x: offsetBaseNode.x,
    y: offsetBaseNode.y,
    z: offsetBaseNode.z - totalLength,
  };

  // 配置の中心点（上端と下端の中間）
  const center = {
    x: (offsetBaseNode.x + bottomNode.x) / 2,
    y: (offsetBaseNode.y + bottomNode.y) / 2,
    z: (offsetBaseNode.z + bottomNode.z) / 2,
  };

  // 方向ベクトル（Z軸負方向）
  const direction = { x: 0, y: 0, z: -1 };

  // 配置情報を返す
  return {
    center: center,
    length: totalLength,
    direction: direction,
    rollAngle: rollAngle,
    topNode: offsetBaseNode,
    bottomNode: bottomNode,
    // 回転行列の計算（Z軸下向き固定、rollAngleのみ）
    rotation: {
      axis: new THREE.Vector3(0, 0, -1),
      angle: rollAngle,
    },
  };
}

/**
 * プロファイルベースの基礎柱形状生成
 */
export class ProfileBasedFoundationColumnGenerator extends BaseElementGenerator {
  /**
   * ジェネレーター設定
   */
  static getConfig() {
    return {
      elementName: 'FoundationColumn',
      loggerName: 'viewer:profile:foundationcolumn',
      defaultElementType: 'FoundationColumn',
    };
  }

  /**
   * 基礎柱要素からメッシュを作成
   * @param {Array} foundationColumnElements - 基礎柱要素配列
   * @param {Map<string, THREE.Vector3>} nodes - ノードマップ
   * @param {Map<string, Object>} foundationColumnSections - 基礎柱断面マップ
   * @param {Map<string, Object>} steelSections - 鋼材形状マップ
   * @param {string} elementType - 要素タイプ
   * @param {boolean} isJsonInput - JSON入力かどうか
   * @returns {Array<THREE.Mesh>} 生成されたメッシュ配列
   */
  static createFoundationColumnMeshes(
    foundationColumnElements,
    nodes,
    foundationColumnSections,
    steelSections,
    elementType = 'FoundationColumn',
    isJsonInput = false,
  ) {
    return this.createMeshes(
      foundationColumnElements,
      nodes,
      foundationColumnSections,
      steelSections,
      elementType,
      isJsonInput,
    );
  }

  /**
   * 単一基礎柱メッシュを作成（BaseElementGeneratorの抽象メソッドを実装）
   * @param {Object} foundationColumn - 基礎柱要素
   * @param {Object} context - コンテキスト
   * @returns {THREE.Mesh|Array<THREE.Mesh>|null} メッシュまたはnull
   */
  static _createSingleMesh(foundationColumn, context) {
    const { nodes, sections, steelSections, elementType, isJsonInput, log } = context;

    // 1. ノード位置の取得
    const baseNodeId = isJsonInput
      ? foundationColumn.geometry?.nodeId
      : foundationColumn.getAttribute('id_node');

    if (!baseNodeId) {
      log.warn(`FoundationColumn ${foundationColumn.id}: id_nodeが見つかりません`);
      return null;
    }

    const baseNode = nodes.get(baseNodeId);
    if (!baseNode) {
      log.warn(`FoundationColumn ${foundationColumn.id}: ノード ${baseNodeId} が見つかりません`);
      return null;
    }

    // 2. 長さの取得
    const lengthFD = isJsonInput
      ? foundationColumn.geometry?.lengthFD
      : parseFloat(foundationColumn.getAttribute('length_FD'));

    if (!lengthFD || lengthFD <= 0) {
      log.warn(`FoundationColumn ${foundationColumn.id}: length_FDが不正です (${lengthFD})`);
      return null;
    }

    // 立上り部の長さ（オプション）
    const lengthWR = isJsonInput
      ? foundationColumn.geometry?.lengthWR || 0
      : parseFloat(foundationColumn.getAttribute('length_WR') || 0);

    // 3. 断面データの取得
    // 基礎部断面（必須）
    const rawSectionFDId = isJsonInput
      ? foundationColumn.section?.idFD
      : foundationColumn.getAttribute('id_section_FD');

    if (!rawSectionFDId) {
      log.warn(`FoundationColumn ${foundationColumn.id}: id_section_FDが見つかりません`);
      return null;
    }

    // 型統一: sectionExtractorは数値IDを整数として保存するため変換
    const parsedFDId = parseInt(rawSectionFDId, 10);
    const sectionFDId = isNaN(parsedFDId) ? rawSectionFDId : parsedFDId;
    const sectionFD = sections.get(sectionFDId);
    if (!sectionFD) {
      log.warn(`FoundationColumn ${foundationColumn.id}: 断面 ${sectionFDId} が見つかりません`);
      return null;
    }

    // 立上り部断面（オプション）
    const rawSectionWRId = isJsonInput
      ? foundationColumn.section?.idWR
      : foundationColumn.getAttribute('id_section_WR');

    // 型統一: sectionExtractorは数値IDを整数として保存するため変換
    let sectionWR = null;
    if (rawSectionWRId && rawSectionWRId !== '0') {
      const parsedWRId = parseInt(rawSectionWRId, 10);
      const sectionWRId = isNaN(parsedWRId) ? rawSectionWRId : parsedWRId;
      sectionWR = sections.get(sectionWRId);
    }

    // 4. オフセット・回転の取得
    const offsetX = isJsonInput
      ? foundationColumn.geometry?.offsetFD_X || 0
      : parseFloat(foundationColumn.getAttribute('offset_FD_X') || 0);

    const offsetY = isJsonInput
      ? foundationColumn.geometry?.offsetFD_Y || 0
      : parseFloat(foundationColumn.getAttribute('offset_FD_Y') || 0);

    const rotateDegrees = isJsonInput
      ? foundationColumn.geometry?.rotation || 0
      : parseFloat(foundationColumn.getAttribute('rotate') || 0);

    const rollAngle = (rotateDegrees * Math.PI) / 180;

    // 5. 配置情報を計算
    const placement = calculateFoundationColumnPlacement(
      { x: baseNode.x, y: baseNode.y, z: baseNode.z },
      lengthFD,
      lengthWR,
      { offsetX, offsetY, rollAngle },
    );

    log.debug(
      `Creating FoundationColumn ${foundationColumn.id}: lengthFD=${lengthFD}, lengthWR=${lengthWR}, total=${placement.length}mm`,
    );

    // 6. メッシュ生成（二重断面の場合は2つのメッシュを作成）
    const meshes = [];

    // 6-1. 基礎部のメッシュ
    const meshFD = this._createSectionMesh(
      sectionFD,
      steelSections,
      lengthFD,
      foundationColumn,
      placement,
      elementType,
      isJsonInput,
      'FD',
      log,
    );

    if (meshFD) {
      // 基礎部は底部から上に伸びるように配置を調整
      const fdCenter = {
        x: placement.center.x,
        y: placement.center.y,
        z: placement.bottomNode.z + lengthFD / 2,
      };
      meshFD.position.set(fdCenter.x, fdCenter.y, fdCenter.z);
      meshFD.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), rollAngle);
      meshes.push(meshFD);
    }

    // 6-2. 立上り部のメッシュ（存在する場合）
    if (sectionWR && lengthWR > 0) {
      const meshWR = this._createSectionMesh(
        sectionWR,
        steelSections,
        lengthWR,
        foundationColumn,
        placement,
        elementType,
        isJsonInput,
        'WR',
        log,
      );

      if (meshWR) {
        // 立上り部は基礎部の上に配置
        const wrCenter = {
          x: placement.center.x,
          y: placement.center.y,
          z: placement.topNode.z - lengthWR / 2,
        };
        meshWR.position.set(wrCenter.x, wrCenter.y, wrCenter.z);
        meshWR.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), rollAngle);
        meshes.push(meshWR);
      }
    }

    if (meshes.length === 0) {
      log.warn(`FoundationColumn ${foundationColumn.id}: メッシュ生成に失敗しました`);
      return null;
    }

    // 7. 配列で返す（複数メッシュの場合があるため）
    return meshes.length === 1 ? meshes[0] : meshes;
  }

  /**
   * 断面メッシュを作成
   * @private
   */
  static _createSectionMesh(
    sectionData,
    steelSections,
    length,
    foundationColumn,
    placement,
    elementType,
    isJsonInput,
    sectionPart, // 'FD' or 'WR'
    log,
  ) {
    // 断面タイプの推定
    const sectionType = this._resolveGeometryProfileType(sectionData);

    log.debug(
      `Creating ${sectionPart} section for FoundationColumn ${foundationColumn.id}: section_type=${sectionType}, length=${length}`,
    );

    // プロファイル生成（共有ユーティリティを使用）
    const profileResult = createSectionProfile(sectionData, sectionType, foundationColumn.id, log, { supportCircle: true });

    if (!profileResult || !profileResult.shape) {
      log.warn(
        `FoundationColumn ${foundationColumn.id}: ${sectionPart}部分のプロファイル生成に失敗`,
      );
      return null;
    }

    // ジオメトリ作成
    const geometry = createExtrudeGeometry(profileResult.shape, length);

    if (!geometry) {
      log.warn(`FoundationColumn ${foundationColumn.id}: ${sectionPart}部分のジオメトリ生成に失敗`);
      return null;
    }

    // メッシュを作成
    const mesh = new THREE.Mesh(
      geometry,
      colorManager.getMaterial('diff', { comparisonState: 'matched' }),
    );

    // メタデータを設定
    mesh.userData = this._buildColumnMetadata({
      element: foundationColumn,
      elementType: elementType,
      placement: placement,
      sectionType: sectionType,
      profileResult: profileResult,
      sectionData: sectionData,
      isJsonInput: isJsonInput,
    });
    mesh.userData.foundationColumnPart = sectionPart; // 'FD' or 'WR'

    return mesh;
  }
}

// デフォルトエクスポート用のレガシーインターフェース
export function createFoundationColumnMeshes(
  foundationColumnElements,
  nodes,
  foundationColumnSections,
  steelSections,
  elementType = 'FoundationColumn',
  isJsonInput = false,
) {
  return ProfileBasedFoundationColumnGenerator.createFoundationColumnMeshes(
    foundationColumnElements,
    nodes,
    foundationColumnSections,
    steelSections,
    elementType,
    isJsonInput,
  );
}

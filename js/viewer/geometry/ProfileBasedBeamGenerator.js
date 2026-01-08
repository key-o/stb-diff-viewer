/**
 * @fileoverview プロファイルベース梁形状生成モジュール（リファクタリング版）
 *
 * BaseElementGeneratorを継承した統一アーキテクチャ:
 * - MeshCreationValidator: バリデーション
 * - MeshMetadataBuilder: メタデータ構築
 * - SectionTypeNormalizer: 断面タイプ正規化
 *
 * 梁特有の機能:
 * - 天端基準配置（placementMode: 'top-aligned'）
 * - 多断面（テーパー）対応（TaperedGeometryBuilder使用）
 *
 * リファクタリング: 2025-12
 * - BaseElementGenerator基底クラスを使用
 * - 統一されたバリデーションとメタデータ構築
 */

import * as THREE from 'three';
import { createExtrudeGeometry } from './core/ThreeJSConverter.js';
import {
  createTaperedGeometry,
  createMultiSectionGeometry,
} from './core/TaperedGeometryBuilder.js';
import { materials } from '../rendering/materials.js';
import { ElementGeometryUtils } from './ElementGeometryUtils.js';
import { BaseElementGenerator } from './core/BaseElementGenerator.js';
import { MeshMetadataBuilder } from './core/MeshMetadataBuilder.js';

/**
 * プロファイルベースの梁形状生成
 */
export class ProfileBasedBeamGenerator extends BaseElementGenerator {
  /**
   * ジェネレーター設定
   */
  static getConfig() {
    return {
      elementName: 'Beam',
      loggerName: 'viewer:profile:beam',
      defaultElementType: 'Beam',
    };
  }

  /**
   * 梁要素からメッシュを作成
   * @param {Array} beamElements - 梁要素配列
   * @param {Map<string, THREE.Vector3>} nodes - ノードマップ
   * @param {Map<string, Object>} beamSections - 梁断面マップ
   * @param {Map<string, Object>} steelSections - 鋼材形状マップ
   * @param {string} elementType - 要素タイプ
   * @param {boolean} isJsonInput - JSON入力かどうか
   * @returns {Array<THREE.Mesh>} 生成されたメッシュ配列
   */
  static createBeamMeshes(
    beamElements,
    nodes,
    beamSections,
    steelSections,
    elementType = 'Beam',
    isJsonInput = false,
  ) {
    return this.createMeshes(
      beamElements,
      nodes,
      beamSections,
      steelSections,
      elementType,
      isJsonInput,
    );
  }

  /**
   * 単一梁メッシュを作成
   * @param {Object} beam - 梁要素
   * @param {Object} context - コンテキスト
   * @returns {THREE.Mesh|null} メッシュまたはnull
   */
  static _createSingleMesh(beam, context) {
    const { nodes, sections, steelSections, elementType, isJsonInput, log } = context;

    // 1. ノード位置の取得（ElementGeometryUtils使用）
    const nodePositions = ElementGeometryUtils.getNodePositions(beam, nodes, {
      nodeType: '2node-horizontal',
      isJsonInput: isJsonInput,
      node1KeyStart: 'id_node_start',
      node1KeyEnd: 'id_node_end',
    });

    if (!this._validateNodePositions(nodePositions, beam, context)) {
      return null;
    }

    // 2. 断面データの取得（ElementGeometryUtils使用）
    const sectionData = ElementGeometryUtils.getSectionData(beam, sections, isJsonInput);

    if (!this._validateSectionData(sectionData, beam, context)) {
      return null;
    }

    // 3. 断面タイプの推定（SectionTypeNormalizer使用）
    const sectionType = this._normalizeSectionType(sectionData);

    log.debug(
      `Creating beam ${beam.id}: section_type=${sectionType}, mode=${sectionData.mode || 'single'}`,
    );

    // 4. オフセットと回転角度の取得（ElementGeometryUtils使用）
    const offsets = ElementGeometryUtils.getHorizontalElementOffsets(beam);

    // 5. 断面高さの取得（天端基準用）
    const sectionHeight = ElementGeometryUtils.getSectionHeight(sectionData, sectionType);

    // 6. 断面モードの判定
    const mode = sectionData.mode || 'single';
    const isMultiSection = mode === 'double' || mode === 'multi';

    // 7. ジオメトリ作成
    let geometry = null;
    let profileMeta = null;

    if (mode === 'single') {
      // ===== 単一断面処理 =====
      const profileResult = ElementGeometryUtils.createProfile(sectionData, sectionType, beam);

      if (!this._validateProfile(profileResult, beam, context)) {
        return null;
      }

      profileMeta = profileResult.meta;

      // 配置計算（長さを取得するため）
      const tempPlacement = ElementGeometryUtils.calculateHorizontalElementPlacement(
        nodePositions.startNode,
        nodePositions.endNode,
        {
          startOffset: offsets.startOffset,
          endOffset: offsets.endOffset,
          rollAngle: (offsets.rollAngle * Math.PI) / 180,
          placementMode: 'center',
          sectionHeight: 0,
        },
      );

      if (!this._validatePlacement(tempPlacement, beam, context)) {
        return null;
      }

      // 押し出しジオメトリを作成
      geometry = createExtrudeGeometry(profileResult.shape, tempPlacement.length);
    } else {
      // ===== 多断面処理 =====
      // 長さ計算用の配置計算
      const tempPlacement = ElementGeometryUtils.calculateHorizontalElementPlacement(
        nodePositions.startNode,
        nodePositions.endNode,
        {
          startOffset: offsets.startOffset,
          endOffset: offsets.endOffset,
          placementMode: 'center',
          sectionHeight: 0,
        },
      );

      if (!this._validatePlacement(tempPlacement, beam, context)) {
        return null;
      }

      geometry = this._createMultiSectionGeometry(
        sectionData,
        beam,
        steelSections,
        tempPlacement.length,
        log,
      );

      profileMeta = { profileSource: 'multi-section', mode: mode };
    }

    if (!this._validateGeometry(geometry, beam, context)) {
      return null;
    }

    // 7.5. 材軸（Z軸）回りの断面回転をジオメトリに適用
    // rotate属性は配置基準線（材軸）を中心に断面を回転させる
    const rollAngleRad = (offsets.rollAngle * Math.PI) / 180;
    if (rollAngleRad !== 0) {
      geometry.rotateZ(rollAngleRad);
    }

    // 8. 配置計算（ElementGeometryUtils使用）
    const placement = ElementGeometryUtils.calculateHorizontalElementPlacement(
      nodePositions.startNode,
      nodePositions.endNode,
      {
        startOffset: offsets.startOffset,
        endOffset: offsets.endOffset,
        rollAngle: (offsets.rollAngle * Math.PI) / 180,
        placementMode: isMultiSection ? 'center' : 'top-aligned',
        sectionHeight: isMultiSection ? 0 : sectionHeight,
      },
    );

    // 9. メッシュを作成
    const mesh = new THREE.Mesh(geometry, materials.matchedMesh);

    // 10. 配置を適用
    mesh.position.copy(placement.center);
    mesh.quaternion.copy(placement.rotation);

    // 11. メタデータを設定（MeshMetadataBuilder使用）
    mesh.userData = MeshMetadataBuilder.buildForBeam({
      element: beam,
      elementType: elementType,
      placement: placement,
      sectionType: sectionType,
      profileResult: { shape: null, meta: profileMeta },
      sectionData: sectionData,
      isJsonInput: isJsonInput,
      sectionHeight: sectionHeight,
      placementMode: placement.placementMode,
    });

    // 12. 配置基準線を添付（ElementGeometryUtils使用）
    try {
      ElementGeometryUtils.attachPlacementLine(mesh, placement.length, materials.placementLine, {
        elementType: elementType,
        elementId: beam.id,
        modelSource: 'solid',
      });
    } catch (e) {
      log.warn(`Beam ${beam.id}: Failed to attach placement axis line`, e);
    }

    log.debug(
      `Beam ${beam.id}: length=${placement.length.toFixed(1)}mm, ` +
        `sectionHeight=${sectionHeight.toFixed(1)}mm, ` +
        `placementMode=${placement.placementMode}`,
    );

    // 13. stb-diff-viewer造の場合、RC部分のメッシュも生成して配列で返す
    if (sectionData.isStbDiffViewer && sectionData.concreteProfile) {
      const rcMesh = this._createStbDiffViewerConcreteGeometry(
        sectionData,
        beam,
        placement,
        sectionHeight,
        elementType,
        isJsonInput,
        log,
      );
      if (rcMesh) {
        log.debug(`Beam ${beam.id}: stb-diff-viewer造 - RC部分のメッシュを追加生成`);
        return [mesh, rcMesh];
      }
    }

    return mesh;
  }

  /**
   * stb-diff-viewer造のRC（コンクリート）部分のジオメトリを生成
   * @private
   * @param {Object} sectionData - 断面データ
   * @param {Object} beam - 梁要素データ
   * @param {Object} placement - 配置情報
   * @param {number} sectionHeight - 断面高さ
   * @param {string} elementType - 要素タイプ
   * @param {boolean} isJsonInput - JSON入力かどうか
   * @param {Object} log - ロガー
   * @returns {THREE.Mesh|null} RC部分のメッシュ
   */
  static _createStbDiffViewerConcreteGeometry(
    sectionData,
    beam,
    placement,
    sectionHeight,
    elementType,
    isJsonInput,
    log,
  ) {
    const concreteProfile = sectionData.concreteProfile;
    if (!concreteProfile) {
      return null;
    }

    // RC部分の寸法を取得
    let width, height;
    if (concreteProfile.profileType === 'CIRCLE') {
      // 円形断面
      const diameter = concreteProfile.diameter;
      if (!diameter) {
        log.warn(`Beam ${beam.id}: stb-diff-viewer円形断面の直径が不明です`);
        return null;
      }
      width = diameter;
      height = diameter;
    } else {
      // 矩形断面
      width = concreteProfile.width;
      height = concreteProfile.height;
      if (!width || !height) {
        log.warn(
          `Beam ${beam.id}: stb-diff-viewer矩形断面の寸法が不明です (width=${width}, height=${height})`,
        );
        return null;
      }
    }

    log.debug(
      `Beam ${beam.id}: stb-diff-viewer RC部分 - ${concreteProfile.profileType} ${width}x${height}`,
    );

    // RC部分用の断面データを作成
    const rcSectionData = {
      section_type: concreteProfile.profileType,
      dimensions: {
        width: width,
        height: height,
        outer_width: width,
        outer_height: height,
      },
    };

    // RC部分のプロファイルを生成
    const rcProfileResult = ElementGeometryUtils.createProfile(
      rcSectionData,
      concreteProfile.profileType,
      beam,
    );

    if (!rcProfileResult || !rcProfileResult.shape) {
      log.warn(`Beam ${beam.id}: stb-diff-viewer RC部分のプロファイル生成に失敗`);
      return null;
    }

    // RC部分のジオメトリを生成
    const rcGeometry = createExtrudeGeometry(rcProfileResult.shape, placement.length);
    if (!rcGeometry) {
      log.warn(`Beam ${beam.id}: stb-diff-viewer RC部分のジオメトリ生成に失敗`);
      return null;
    }

    // RC部分用のメッシュを作成（半透明マテリアル）
    const rcMesh = new THREE.Mesh(
      rcGeometry,
      materials.matchedMeshTransparent || materials.matchedMesh,
    );

    // Removed unused rcPlacement calculation

    // 同じ位置に配置（元のS造と同じ位置）
    rcMesh.position.copy(placement.center);
    rcMesh.quaternion.copy(placement.rotation);

    // メタデータを設定
    rcMesh.userData = MeshMetadataBuilder.buildForBeam({
      element: beam,
      elementType: elementType,
      placement: placement,
      sectionType: concreteProfile.profileType,
      profileResult: rcProfileResult,
      sectionData: rcSectionData,
      isJsonInput: isJsonInput,
      sectionHeight: height,
      placementMode: 'top-aligned',
    });
    rcMesh.userData.isStbDiffViewerConcrete = true;
    rcMesh.userData.stbDiffViewerComponentType = 'RC';

    return rcMesh;
  }

  /**
   * 多断面ジオメトリを作成
   * @private
   * @param {Object} sectionData - 断面データ（mode='double'/'multi', shapes配列を含む）
   * @param {Object} beam - 梁要素データ
   * @param {Map} steelSections - 鋼材形状マップ
   * @param {number} length - 要素長さ（mm）
   * @param {Object} log - ロガー
   * @returns {THREE.BufferGeometry} テーパージオメトリ
   */
  static _createMultiSectionGeometry(sectionData, beam, steelSections, length, log) {
    if (!sectionData.shapes || sectionData.shapes.length < 2) {
      log.error(
        `Beam ${beam.id}: Multi-section geometry requires shapes array with at least 2 elements`,
      );
      return null;
    }

    // 各断面のプロファイルを作成
    const sections = [];
    log.debug(
      `Beam ${beam.id}: Creating multi-section geometry (${sectionData.shapes.length} sections)`,
    );

    for (const shapeInfo of sectionData.shapes) {
      const { pos, shapeName, variant } = shapeInfo;

      // 仮の断面データを作成（各断面用）
      const tempSectionData = {
        shapeName: shapeName,
        section_type: sectionData.section_type,
        profile_type: sectionData.profile_type,
      };

      // steelSectionsから寸法情報を取得
      const steelShape = steelSections?.get(shapeName);
      if (steelShape) {
        tempSectionData.steelShape = steelShape;
        tempSectionData.dimensions = steelShape.dimensions || steelShape;
      }

      // variantから追加の属性情報をコピー（strength等）
      if (variant && variant.attributes) {
        tempSectionData.variantAttributes = variant.attributes;
      }

      log.debug(
        `  Section[${pos}]: shape=${shapeName}, ` +
          `dims=${JSON.stringify(tempSectionData.dimensions || {}).substring(0, 100)}`,
      );

      // プロファイルを作成（ElementGeometryUtils使用）
      const sectionType = this._normalizeSectionType(tempSectionData);
      const prof = ElementGeometryUtils.createProfile(tempSectionData, sectionType, beam);

      if (!prof || !prof.shape || !prof.shape.extractPoints) {
        log.warn(`Beam ${beam.id}: Failed to create profile for section ${shapeName} (pos=${pos})`);
        continue;
      }

      // extractPointsでプロファイルの頂点を取得
      const points = prof.shape.extractPoints(12); // 12分割で円弧を近似
      const vertices = points.shape;

      if (!vertices || vertices.length < 3) {
        log.warn(`Beam ${beam.id}: Insufficient vertices for section ${shapeName} (pos=${pos})`);
        continue;
      }

      // STBの天端基準に合わせるため、各断面の天端（最大Y値）を y=0 に揃える
      const currentMaxY = Math.max(...vertices.map((v) => v.y));
      const shiftedVertices = vertices.map((v) => ({
        x: v.x,
        y: v.y - currentMaxY,
      }));

      const tempSectionHeight = ElementGeometryUtils.getSectionHeight(tempSectionData, sectionType);
      log.debug(
        `  → Profile created: vertices=${vertices.length}, ` +
          `sectionHeight=${tempSectionHeight?.toFixed(1) || 'N/A'}mm, ` +
          `shift=${(-currentMaxY).toFixed(1)}mm`,
      );

      sections.push({
        pos: pos,
        profile: { vertices: shiftedVertices, holes: [] },
      });
    }

    if (sections.length < 2) {
      log.error(`Beam ${beam.id}: Less than 2 valid profiles (${sections.length})`);
      return null;
    }

    // ハンチ/ジョイント長さの取得（両方のパターンに対応）
    const haunchLengths = {
      start: beam.haunch_start || beam.joint_start || 0,
      end: beam.haunch_end || beam.joint_end || 0,
    };

    log.debug(
      `Beam ${beam.id}: haunchLengths = start:${haunchLengths.start}, end:${haunchLengths.end}`,
    );

    // ジオメトリ生成
    // 2断面以上は常にcreateMultiSectionGeometryを使用（位置情報を正しく反映するため）
    try {
      return createMultiSectionGeometry(sections, length, haunchLengths);
    } catch (error) {
      log.error(`Beam ${beam.id}: Failed to create tapered geometry:`, error);
      return null;
    }
  }
}

// デフォルトエクスポート用のレガシーインターフェース
export function createBeamMeshes(
  beamElements,
  nodes,
  beamSections,
  steelSections,
  elementType = 'Beam',
  isJsonInput = false,
) {
  return ProfileBasedBeamGenerator.createBeamMeshes(
    beamElements,
    nodes,
    beamSections,
    steelSections,
    elementType,
    isJsonInput,
  );
}

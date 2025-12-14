/**
 * @fileoverview プロファイルベース間柱形状生成モジュール（リファクタリング版）
 *
 * BaseElementGeneratorを継承した統一アーキテクチャ:
 * 1. ProfileCalculator: プロファイル頂点座標を計算（Three.js非依存）
 * 2. GeometryCalculator: 配置・回転を計算（Three.js非依存）
 * 3. ThreeJSConverter: Three.jsオブジェクトに変換
 *
 * 柱(Column)と同じ実装を使用（間柱は柱と同じ構造を持つため）。
 * IFCProfileFactoryとの統合準備完了。
 *
 * リファクタリング: 2025-12
 * - BaseElementGenerator基底クラスを使用
 * - 統一されたバリデーションとメタデータ構築
 */

import * as THREE from 'three';
import { materials } from '../rendering/materials.js';
import { IFCProfileFactory } from './IFCProfileFactory.js';
import { ElementGeometryUtils } from './ElementGeometryUtils.js';

// 新しいコアレイヤーをインポート
import { calculateProfile } from './core/ProfileCalculator.js';
import {
  calculateColumnPlacement
} from './core/GeometryCalculator.js';
import {
  convertProfileToThreeShape,
  createExtrudeGeometry,
  applyPlacementToMesh,
  attachPlacementAxisLine
} from './core/ThreeJSConverter.js';
import { mapToProfileParams } from './core/ProfileParameterMapper.js';
import { BaseElementGenerator } from './core/BaseElementGenerator.js';
import { MeshMetadataBuilder } from './core/MeshMetadataBuilder.js';

/**
 * プロファイルベースの間柱形状生成（リファクタリング版）
 *
 * 間柱(Post)は柱(Column)と同じ構造を持つため、同じロジックを使用します。
 */
export class ProfileBasedPostGenerator extends BaseElementGenerator {
  /**
   * ジェネレーター設定
   */
  static getConfig() {
    return {
      elementName: 'Post',
      loggerName: 'viewer:profile:post',
      defaultElementType: 'Post'
    };
  }

  /**
   * 間柱要素からメッシュを作成
   * @param {Array} postElements - 間柱要素配列
   * @param {Map<string, THREE.Vector3>} nodes - ノードマップ
   * @param {Map<string, Object>} postSections - 間柱断面マップ
   * @param {Map<string, Object>} steelSections - 鋼材形状マップ
   * @param {string} elementType - 要素タイプ
   * @param {boolean} isJsonInput - JSON入力かどうか
   * @returns {Array<THREE.Mesh>} 生成されたメッシュ配列
   */
  static createPostMeshes(
    postElements,
    nodes,
    postSections,
    steelSections,
    elementType = 'Post',
    isJsonInput = false
  ) {
    return this.createMeshes(
      postElements,
      nodes,
      postSections,
      steelSections,
      elementType,
      isJsonInput
    );
  }

  /**
   * 単一間柱メッシュを作成（BaseElementGeneratorの抽象メソッドを実装）
   * @param {Object} post - 間柱要素
   * @param {Object} context - コンテキスト
   * @returns {THREE.Mesh|null} メッシュまたはnull
   */
  static _createSingleMesh(post, context) {
    const { nodes, sections, elementType, isJsonInput, log } = context;

    // 1. ノード位置の取得（ElementGeometryUtils使用）
    const nodePositions = ElementGeometryUtils.getNodePositions(post, nodes, {
      nodeType: '2node-vertical',
      isJsonInput: isJsonInput,
      node1KeyStart: 'id_node_bottom',
      node1KeyEnd: 'id_node_top'
    });

    if (!this._validateNodePositions(nodePositions, post, context)) {
      return null;
    }

    // 2. 断面データの取得（ElementGeometryUtils使用）
    const sectionData = ElementGeometryUtils.getSectionData(post, sections, isJsonInput);

    if (!this._validateSectionData(sectionData, post, context)) {
      return null;
    }

    // 3. 断面タイプの推定（BaseElementGeneratorのヘルパー使用）
    const sectionType = this._normalizeSectionType(sectionData);

    log.debug(
      `Creating post ${post.id}: section_type=${sectionType}`
    );

    // 4. プロファイル生成（IFC優先、フォールバックでProfileCalculator）
    const profileResult = this._createSectionProfile(sectionData, sectionType, post);

    if (!this._validateProfile(profileResult, post, context)) {
      return null;
    }

    // 5. Three.Vector3 → Plain Objectに変換して配置計算
    const bottomNodePlain = {
      x: nodePositions.bottomNode.x,
      y: nodePositions.bottomNode.y,
      z: nodePositions.bottomNode.z
    };
    const topNodePlain = {
      x: nodePositions.topNode.x,
      y: nodePositions.topNode.y,
      z: nodePositions.topNode.z
    };

    const bottomOffset = {
      x: Number(post.offset_bottom_X || 0),
      y: Number(post.offset_bottom_Y || 0)
    };
    const topOffset = {
      x: Number(post.offset_top_X || 0),
      y: Number(post.offset_top_Y || 0)
    };

    // 回転角度の取得（度単位）
    let rollAngleDegrees = 0;
    if (post.geometry && post.geometry.rotation !== undefined) {
      rollAngleDegrees = post.geometry.rotation;
    } else if (post.rotate !== undefined) {
      rollAngleDegrees = post.rotate;
    } else if (post.angle !== undefined) {
      rollAngleDegrees = post.angle;
    }

    // isReferenceDirectionの処理（BaseElementGeneratorのヘルパー使用）
    rollAngleDegrees = this._calculateRotation(sectionData, rollAngleDegrees);

    // 度からラジアンに変換
    const rollAngle = (rollAngleDegrees * Math.PI) / 180;

    // GeometryCalculatorで配置計算
    const placement = calculateColumnPlacement(bottomNodePlain, topNodePlain, {
      bottomOffset,
      topOffset,
      rollAngle
    });

    if (!this._validatePlacement(placement, post, context)) {
      return null;
    }

    log.debug(
      `Post ${post.id}: length=${placement.length.toFixed(1)}mm`
    );

    // 6. 押し出しジオメトリを作成
    const geometry = createExtrudeGeometry(profileResult.shape, placement.length);

    if (!this._validateGeometry(geometry, post, context)) {
      return null;
    }

    // 7. メッシュを作成
    const mesh = new THREE.Mesh(geometry, materials.matchedMesh);

    // 8. 配置を適用（ThreeJSConverter使用）
    applyPlacementToMesh(mesh, placement);

    // 9. メタデータを設定（BaseElementGeneratorのヘルパー使用）
    mesh.userData = this._buildColumnMetadata({
      element: post,
      elementType: elementType,
      placement: placement,
      sectionType: sectionType,
      profileResult: profileResult,
      sectionData: sectionData,
      isJsonInput: isJsonInput
    });

    // 10. 配置基準線を添付
    try {
      attachPlacementAxisLine(
        mesh,
        placement.length,
        materials.placementLine,
        {
          elementType: elementType,
          elementId: post.id,
          modelSource: 'solid'
        }
      );
    } catch (e) {
      log.warn(`Post ${post.id}: failed to attach placement axis line`, e);
    }

    // 11. stb-diff-viewer造の場合、RC部分のメッシュも生成して配列で返す
    if (sectionData.isStbDiffViewer && sectionData.concreteProfile) {
      const rcMesh = this._createStbDiffViewerConcreteGeometry(
        sectionData,
        post,
        placement,
        elementType,
        isJsonInput,
        log
      );
      if (rcMesh) {
        log.debug(`Post ${post.id}: stb-diff-viewer造 - RC部分のメッシュを追加生成`);
        return [mesh, rcMesh];
      }
    }

    return mesh;
  }

  /**
   * stb-diff-viewer造のRC（コンクリート）部分のジオメトリを生成
   * @private
   * @param {Object} sectionData - 断面データ
   * @param {Object} post - 間柱要素データ
   * @param {Object} placement - 配置情報
   * @param {string} elementType - 要素タイプ
   * @param {boolean} isJsonInput - JSON入力かどうか
   * @param {Object} log - ロガー
   * @returns {THREE.Mesh|null} RC部分のメッシュ
   */
  static _createStbDiffViewerConcreteGeometry(sectionData, post, placement, elementType, isJsonInput, log) {
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
        log.warn(`Post ${post.id}: stb-diff-viewer円形断面の直径が不明です`);
        return null;
      }
      width = diameter;
      height = diameter;
    } else {
      // 矩形断面
      width = concreteProfile.width_X || concreteProfile.width;
      height = concreteProfile.width_Y || concreteProfile.height;
      if (!width || !height) {
        log.warn(`Post ${post.id}: stb-diff-viewer矩形断面の寸法が不明です (width=${width}, height=${height})`);
        return null;
      }
    }

    log.debug(`Post ${post.id}: stb-diff-viewer RC部分 - ${concreteProfile.profileType} ${width}x${height}`);

    // RC部分用の断面データを作成
    const rcSectionData = {
      section_type: concreteProfile.profileType,
      dimensions: {
        width: width,
        height: height,
        outer_width: width,
        outer_height: height
      }
    };

    // RC部分のプロファイルを生成
    const rcProfileResult = this._createSectionProfile(
      rcSectionData,
      concreteProfile.profileType,
      post
    );

    if (!rcProfileResult || !rcProfileResult.shape) {
      log.warn(`Post ${post.id}: stb-diff-viewer RC部分のプロファイル生成に失敗`);
      return null;
    }

    // RC部分のジオメトリを生成
    const rcGeometry = createExtrudeGeometry(rcProfileResult.shape, placement.length);
    if (!rcGeometry) {
      log.warn(`Post ${post.id}: stb-diff-viewer RC部分のジオメトリ生成に失敗`);
      return null;
    }

    // RC部分用のメッシュを作成（半透明マテリアル）
    const rcMesh = new THREE.Mesh(rcGeometry, materials.matchedMeshTransparent || materials.matchedMesh);

    // 配置を適用
    applyPlacementToMesh(rcMesh, placement);

    // メタデータを設定
    rcMesh.userData = this._buildColumnMetadata({
      element: post,
      elementType: elementType,
      placement: placement,
      sectionType: concreteProfile.profileType,
      profileResult: rcProfileResult,
      sectionData: rcSectionData,
      isJsonInput: isJsonInput
    });
    rcMesh.userData.isStbDiffViewerConcrete = true;
    rcMesh.userData.stbDiffViewerComponentType = 'RC';

    return rcMesh;
  }

  /**
   * 断面プロファイルを作成（IFC優先、フォールバックでProfileCalculator）
   * @private
   */
  static _createSectionProfile(sectionData, sectionType, post) {
    const log = this._getLogger();

    log.debug(
      `Creating profile for post ${post.id}: section_type=${sectionType}`
    );

    // IFC経路を優先的に試行
    const ifcResult = this._tryIFCProfile(sectionData, sectionType);
    if (ifcResult) {
      return ifcResult;
    }

    // フォールバック: ProfileCalculatorを使用
    return this._createProfileUsingCalculator(sectionData, sectionType);
  }

  /**
   * IFCProfileFactoryを使用したプロファイル生成を試行
   * @private
   */
  static _tryIFCProfile(sectionData, sectionType) {
    const log = this._getLogger();
    const steelTypes = new Set(['H', 'BOX', 'PIPE', 'L', 'T', 'C', 'CIRCLE']);

    try {
      let ifcProfile = null;

      if (steelTypes.has(sectionType) && sectionData.steelShape) {
        ifcProfile = IFCProfileFactory.createProfileFromSTB(
          sectionData.steelShape,
          sectionType
        );
      } else if (sectionType === 'RECTANGLE') {
        // RCなど矩形は寸法からIFC矩形を生成
        const rectDims = sectionData.dimensions || sectionData;
        ifcProfile = {
          ProfileType: IFCProfileFactory.mapSTBToIFCProfileType('RECTANGLE'),
          ProfileName: `STB_RECT_${
            rectDims.width || rectDims.outer_width || 'W'
          }x${rectDims.height || rectDims.outer_height || 'H'}`,
          ProfileParameters: {
            XDim: rectDims.width || rectDims.outer_width,
            YDim: rectDims.height || rectDims.outer_height || rectDims.depth
          }
        };
      }

      if (ifcProfile) {
        const threeJSProfile = IFCProfileFactory.createGeometryFromProfile(
          ifcProfile,
          'center'
        );
        if (threeJSProfile) {
          log.debug(
            `IFC profile created successfully: ${ifcProfile.ProfileType}`
          );
          return {
            shape: threeJSProfile,
            meta: {
              profileSource: 'ifc',
              sectionTypeResolved: sectionType,
              factoryType: ifcProfile.ProfileType
            }
          };
        }
      }
    } catch (error) {
      log.warn(
        `IFC profile creation failed for ${sectionType}: ${error?.message}`
      );
    }

    return null;
  }

  /**
   * ProfileCalculatorを使用したプロファイル生成（フォールバック）
   * @private
   */
  static _createProfileUsingCalculator(sectionData, sectionType) {
    const log = this._getLogger();
    const dimensions = sectionData.dimensions || sectionData;

    // 断面タイプに応じたパラメータを準備（ProfileParameterMapper使用）
    const profileParams = mapToProfileParams(dimensions, sectionType);

    try {
      // ProfileCalculatorでプロファイル頂点座標を計算
      const profileData = calculateProfile(sectionType, profileParams);

      // ThreeJSConverterでTHREE.Shapeに変換
      const threeShape = convertProfileToThreeShape(profileData);

      log.debug(
        `Profile created using ProfileCalculator: ${sectionType}`
      );

      return {
        shape: threeShape,
        meta: {
          profileSource: 'calculator',
          sectionTypeResolved: sectionType
        }
      };
    } catch (error) {
      log.error(
        `ProfileCalculator creation failed for ${sectionType}: ${error?.message}`
      );
      return null;
    }
  }
}

// デフォルトエクスポート用のレガシーインターフェース
export function createPostMeshes(
  postElements,
  nodes,
  postSections,
  steelSections,
  elementType = 'Post',
  isJsonInput = false
) {
  return ProfileBasedPostGenerator.createPostMeshes(
    postElements,
    nodes,
    postSections,
    steelSections,
    elementType,
    isJsonInput
  );
}

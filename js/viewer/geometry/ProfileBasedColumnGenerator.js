/**
 * @fileoverview プロファイルベース柱形状生成モジュール（リファクタリング版）
 *
 * BaseElementGeneratorを継承した統一アーキテクチャ:
 * 1. ProfileCalculator: プロファイル頂点座標を計算（Three.js非依存）
 * 2. GeometryCalculator: 配置・回転を計算（Three.js非依存）
 * 3. ThreeJSConverter: Three.jsオブジェクトに変換
 *
 * IFCProfileFactoryとの統合準備完了。
 *
 * リファクタリング: 2025-12
 * - BaseElementGenerator基底クラスを使用
 * - 統一されたバリデーションとメタデータ構築
 */

import * as THREE from 'three';
import { calculateProfile } from './core/ProfileCalculator.js';
import { calculateColumnPlacement } from './core/GeometryCalculator.js';
import {
  convertProfileToThreeShape,
  createExtrudeGeometry,
  applyPlacementToMesh,
} from './core/ThreeJSConverter.js';
import {
  createTaperedGeometry,
  createMultiSectionGeometry,
} from './core/TaperedGeometryBuilder.js';
import { materials } from '../rendering/materials.js';
import { IFCProfileFactory } from './IFCProfileFactory.js';
import { ElementGeometryUtils } from './ElementGeometryUtils.js';
import { mapToProfileParams } from './core/ProfileParameterMapper.js';
import { BaseElementGenerator } from './core/BaseElementGenerator.js';
import { MeshCreationValidator } from './core/MeshCreationValidator.js';
import { SectionTypeNormalizer } from './core/SectionTypeNormalizer.js';

/**
 * プロファイルベースの柱形状生成（リファクタリング版）
 */
export class ProfileBasedColumnGenerator extends BaseElementGenerator {
  /**
   * ジェネレーター設定
   */
  static getConfig() {
    return {
      elementName: 'Column',
      loggerName: 'viewer:profile:column',
      defaultElementType: 'Column',
    };
  }

  /**
   * 柱要素からメッシュを作成
   * @param {Array} columnElements - 柱要素配列
   * @param {Map<string, THREE.Vector3>} nodes - ノードマップ
   * @param {Map<string, Object>} columnSections - 柱断面マップ
   * @param {Map<string, Object>} steelSections - 鋼材形状マップ
   * @param {string} elementType - 要素タイプ
   * @param {boolean} isJsonInput - JSON入力かどうか
   * @returns {Array<THREE.Mesh>} 生成されたメッシュ配列
   */
  static createColumnMeshes(
    columnElements,
    nodes,
    columnSections,
    steelSections,
    elementType = 'Column',
    isJsonInput = false,
  ) {
    return this.createMeshes(
      columnElements,
      nodes,
      columnSections,
      steelSections,
      elementType,
      isJsonInput,
    );
  }

  /**
   * 単一柱メッシュを作成（BaseElementGeneratorの抽象メソッドを実装）
   * @param {Object} column - 柱要素
   * @param {Object} context - コンテキスト
   * @returns {THREE.Mesh|null} メッシュまたはnull
   */
  static _createSingleMesh(column, context) {
    const { nodes, sections, steelSections, elementType, isJsonInput, log } = context;

    // 1. ノード位置の取得（ElementGeometryUtils使用）
    const nodePositions = ElementGeometryUtils.getNodePositions(column, nodes, {
      nodeType: '2node-vertical',
      isJsonInput: isJsonInput,
      node1KeyStart: 'id_node_bottom',
      node1KeyEnd: 'id_node_top',
    });

    if (!this._validateNodePositions(nodePositions, column, context)) {
      return null;
    }

    // 2. 断面データの取得（ElementGeometryUtils使用）
    const sectionData = ElementGeometryUtils.getSectionData(column, sections, isJsonInput);

    if (!this._validateSectionData(sectionData, column, context)) {
      return null;
    }

    // 3. 断面タイプの推定（SectionTypeNormalizer使用）
    const sectionType = this._normalizeSectionType(sectionData);

    log.debug(`Creating column ${column.id}: section_type=${sectionType}`);

    // 4. プロファイル生成（IFC優先、フォールバックでProfileCalculator）
    const profileResult = this._createSectionProfile(sectionData, sectionType, column);

    if (!this._validateProfile(profileResult, column, context)) {
      return null;
    }

    // 5. Three.Vector3 → Plain Objectに変換して配置計算
    const bottomNodePlain = {
      x: nodePositions.bottomNode.x,
      y: nodePositions.bottomNode.y,
      z: nodePositions.bottomNode.z,
    };
    const topNodePlain = {
      x: nodePositions.topNode.x,
      y: nodePositions.topNode.y,
      z: nodePositions.topNode.z,
    };

    const bottomOffset = {
      x: Number(column.offset_bottom_X || 0),
      y: Number(column.offset_bottom_Y || 0),
    };
    const topOffset = {
      x: Number(column.offset_top_X || 0),
      y: Number(column.offset_top_Y || 0),
    };

    // 回転角度の取得（度単位からラジアンに変換）
    let rollAngleDegrees = 0;
    if (column.geometry && column.geometry.rotation !== undefined) {
      // JSON形式: geometry.rotation（度単位）
      rollAngleDegrees = column.geometry.rotation;
    } else if (column.rotate !== undefined) {
      // STB XML形式: rotate属性（度単位）
      rollAngleDegrees = column.rotate;
    } else if (column.angle !== undefined) {
      // レガシー形式: angle属性（度単位）
      rollAngleDegrees = column.angle;
    }

    // isReferenceDirectionの処理（BaseElementGeneratorのヘルパー使用）
    rollAngleDegrees = this._calculateRotation(sectionData, rollAngleDegrees);

    // 度からラジアンに変換
    const rollAngle = (rollAngleDegrees * Math.PI) / 180;

    // GeometryCalculatorで配置計算
    const placement = calculateColumnPlacement(bottomNodePlain, topNodePlain, {
      bottomOffset,
      topOffset,
      rollAngle,
    });

    if (!this._validatePlacement(placement, column, context)) {
      return null;
    }

    log.debug(
      `Column ${column.id}: length=${placement.length.toFixed(1)}mm, mode=${sectionData.mode || 'single'}`,
    );

    // 6. ジオメトリ作成（断面モードに応じて分岐）
    let geometry = null;
    const mode = sectionData.mode || 'single';

    if (mode === 'single') {
      // ===== 既存の1断面処理 =====
      geometry = createExtrudeGeometry(profileResult.shape, placement.length);
    } else if (mode === 'double' || mode === 'multi') {
      // ===== 新規: 多断面処理 =====
      geometry = this._createMultiSectionGeometry(
        sectionData,
        column,
        steelSections,
        placement.length,
      );
    }

    if (!this._validateGeometry(geometry, column, context)) {
      return null;
    }

    // 7. メッシュを作成
    const mesh = new THREE.Mesh(geometry, materials.matchedMesh);

    // 8. 配置を適用（ThreeJSConverter使用）
    applyPlacementToMesh(mesh, placement);

    // 9. メタデータを設定（BaseElementGeneratorのヘルパー使用）
    mesh.userData = this._buildColumnMetadata({
      element: column,
      elementType: elementType,
      placement: placement,
      sectionType: sectionType,
      profileResult: profileResult,
      sectionData: sectionData,
      isJsonInput: isJsonInput,
    });

    // 10. stb-diff-viewer造の場合、RC部分のメッシュも生成して配列で返す
    if (sectionData.isStbDiffViewer && sectionData.concreteProfile) {
      const rcMesh = this._createStbDiffViewerConcreteGeometry(
        sectionData,
        column,
        placement,
        elementType,
        isJsonInput,
        log,
      );
      if (rcMesh) {
        log.debug(`Column ${column.id}: stb-diff-viewer造 - RC部分のメッシュを追加生成`);
        return [mesh, rcMesh];
      }
    }

    // 12. ベースプレートメッシュの生成（S造・SRC造・CFT造柱脚）
    if (sectionData.basePlate) {
      const basePlateMesh = this._createBasePlateMesh(
        sectionData.basePlate,
        nodePositions.bottomNode,
        column,
        elementType,
        isJsonInput,
        rollAngle,
        log,
      );
      if (basePlateMesh) {
        log.debug(
          `Column ${column.id}: ベースプレートメッシュを追加生成 (${sectionData.basePlate.baseType})`,
        );
        return [mesh, basePlateMesh];
      }
    }

    return mesh;
  }

  /**
   * stb-diff-viewer造のRC（コンクリート）部分のジオメトリを生成
   * @private
   * @param {Object} sectionData - 断面データ
   * @param {Object} column - 柱要素データ
   * @param {Object} placement - 配置情報
   * @param {string} elementType - 要素タイプ
   * @param {boolean} isJsonInput - JSON入力かどうか
   * @param {Object} log - ロガー
   * @returns {THREE.Mesh|null} RC部分のメッシュ
   */
  static _createStbDiffViewerConcreteGeometry(
    sectionData,
    column,
    placement,
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
        log.warn(`Column ${column.id}: stb-diff-viewer円形断面の直径が不明です`);
        return null;
      }
      width = diameter;
      height = diameter;
    } else {
      // 矩形断面
      width = concreteProfile.width_X || concreteProfile.width;
      height = concreteProfile.width_Y || concreteProfile.height;
      if (!width || !height) {
        log.warn(
          `Column ${column.id}: stb-diff-viewer矩形断面の寸法が不明です (width=${width}, height=${height})`,
        );
        return null;
      }
    }

    log.debug(
      `Column ${column.id}: stb-diff-viewer RC部分 - ${concreteProfile.profileType} ${width}x${height}`,
    );

    // RC部分用の断面データを作成（steelShapeを含めないことでH鋼断面の誤取得を防止）
    const rcDimensions = {
      width: width,
      height: height,
      outer_width: width,
      outer_height: height,
    };

    // 円形の場合はdiameterを明示的に設定
    // （mapCircleParams/calculateCircleProfileがdiameter/radiusキーを要求するため）
    if (concreteProfile.profileType === 'CIRCLE') {
      rcDimensions.diameter = concreteProfile.diameter;
    }

    const rcSectionData = {
      section_type: concreteProfile.profileType,
      dimensions: rcDimensions,
    };

    // RC部分のプロファイルを生成
    const rcProfileResult = this._createSectionProfile(
      rcSectionData,
      concreteProfile.profileType,
      column,
    );

    if (!rcProfileResult || !rcProfileResult.shape) {
      log.warn(`Column ${column.id}: stb-diff-viewer RC部分のプロファイル生成に失敗`);
      return null;
    }

    // RC部分のジオメトリを生成
    const rcGeometry = createExtrudeGeometry(rcProfileResult.shape, placement.length);
    if (!rcGeometry) {
      log.warn(`Column ${column.id}: stb-diff-viewer RC部分のジオメトリ生成に失敗`);
      return null;
    }

    // RC部分用のメッシュを作成（半透明マテリアル）
    const rcMesh = new THREE.Mesh(
      rcGeometry,
      materials.matchedMeshTransparent || materials.matchedMesh,
    );

    // 配置を適用
    applyPlacementToMesh(rcMesh, placement);

    // メタデータを設定
    rcMesh.userData = this._buildColumnMetadata({
      element: column,
      elementType: elementType,
      placement: placement,
      sectionType: concreteProfile.profileType,
      profileResult: rcProfileResult,
      sectionData: rcSectionData,
      isJsonInput: isJsonInput,
    });
    rcMesh.userData.isStbDiffViewerConcrete = true;
    rcMesh.userData.stbDiffViewerComponentType = 'RC';

    return rcMesh;
  }

  /**
   * ベースプレート（柱脚プレート）のメッシュを生成
   *
   * S造・SRC造・CFT造の柱脚位置に矩形プレートを配置する。
   * プレート上面が柱の下端ノードと一致するように配置。
   *
   * @private
   * @param {Object} basePlate - ベースプレートデータ {baseType, B_X, B_Y, t, offset_X, offset_Y, ...}
   * @param {Object} bottomNode - 柱の下端ノード座標 {x, y, z}
   * @param {Object} column - 柱要素データ
   * @param {string} elementType - 要素タイプ
   * @param {boolean} isJsonInput - JSON入力かどうか
   * @param {number} rollAngle - 柱の回転角度（ラジアン）
   * @param {Object} log - ロガー
   * @returns {THREE.Mesh|null} ベースプレートメッシュまたはnull
   */
  static _createBasePlateMesh(
    basePlate,
    bottomNode,
    column,
    elementType,
    isJsonInput,
    rollAngle,
    log,
  ) {
    const { B_X, B_Y, t, offset_X, offset_Y } = basePlate;

    if (!B_X || !B_Y || !t) {
      log.warn(`Column ${column.id}: ベースプレートの寸法が不足 (B_X=${B_X}, B_Y=${B_Y}, t=${t})`);
      return null;
    }

    // BoxGeometry: width=B_X, depth=B_Y, height=t
    const geometry = new THREE.BoxGeometry(B_X, B_Y, t);

    const mesh = new THREE.Mesh(geometry, materials.matchedMesh);

    // プレート上面が柱の下端ノードと一致するように配置
    // (z方向: プレート中心 = bottomNode.z - t/2)
    mesh.position.set(bottomNode.x + offset_X, bottomNode.y + offset_Y, bottomNode.z - t / 2);

    // 柱の回転を適用
    if (rollAngle !== 0) {
      mesh.rotation.z = rollAngle;
    }

    // メタデータ
    mesh.userData = {
      elementType: elementType,
      elementId: column.id,
      isJsonInput: isJsonInput,
      isBasePlate: true,
      basePlateData: {
        baseType: basePlate.baseType,
        B_X,
        B_Y,
        t,
      },
      sectionType: 'RECTANGLE',
      profileBased: false,
      profileMeta: { profileSource: 'BoxGeometry', profileType: 'BASE_PLATE' },
    };

    return mesh;
  }

  /**
   * 断面プロファイルを作成（IFC優先、フォールバックでProfileCalculator）
   * @private
   */
  static _createSectionProfile(sectionData, sectionType, column) {
    const log = this._getLogger();

    // デバッグ（チャンネル）
    if (sectionData?.steelShape?.name?.includes('[-')) {
    }

    log.debug(`Creating profile for column ${column.id}: section_type=${sectionType}`);

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
        ifcProfile = IFCProfileFactory.createProfileFromSTB(sectionData.steelShape, sectionType);
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
            YDim: rectDims.height || rectDims.outer_height || rectDims.depth,
          },
        };
      }

      if (ifcProfile) {
        const threeJSProfile = IFCProfileFactory.createGeometryFromProfile(ifcProfile, 'center');
        if (threeJSProfile) {
          log.debug(`IFC profile created successfully: ${ifcProfile.ProfileType}`);
          return {
            shape: threeJSProfile,
            meta: {
              profileSource: 'ifc',
              sectionTypeResolved: sectionType,
              factoryType: ifcProfile.ProfileType,
            },
          };
        }
      }
    } catch (error) {
      log.warn(`IFC profile creation failed for ${sectionType}: ${error?.message}`);
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

      log.debug(`Profile created using ProfileCalculator: ${sectionType}`);

      return {
        shape: threeShape,
        meta: {
          profileSource: 'calculator',
          sectionTypeResolved: sectionType,
        },
      };
    } catch (error) {
      log.error(`ProfileCalculator creation failed for ${sectionType}: ${error?.message}`);
      return null;
    }
  }

  /**
   * 多断面ジオメトリを作成
   * @private
   * @param {Object} sectionData - 断面データ（mode='double'/'multi', shapes配列を含む）
   * @param {Object} column - 柱要素データ
   * @param {Map} steelSections - 鋼材形状マップ
   * @param {number} length - 要素長さ（mm）
   * @returns {THREE.BufferGeometry} テーパージオメトリ
   */
  static _createMultiSectionGeometry(sectionData, column, steelSections, length) {
    const log = this._getLogger();

    // MeshCreationValidatorで多断面データを検証
    if (
      !MeshCreationValidator.validateMultiSectionData(sectionData, column.id, {
        elementType: 'Column',
      })
    ) {
      return null;
    }

    // 各断面のプロファイルを作成
    const sections = [];
    log.debug(`Column ${column.id}: 多断面ジオメトリ生成開始 (${sectionData.shapes.length}断面)`);

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

      // 断面タイプの推定（BaseElementGeneratorのヘルパー使用）
      const sectionType = this._normalizeSectionType(tempSectionData);

      log.debug(
        `  断面[${pos}]: shape=${shapeName}, type=${sectionType}, ` +
          `dims=${JSON.stringify(tempSectionData.dimensions || {}).substring(0, 100)}, ` +
          `variant=${variant ? 'あり' : 'なし'}`,
      );

      // プロファイルを作成
      const prof = this._createSectionProfile(tempSectionData, sectionType, column);
      if (!prof || !prof.shape || !prof.shape.extractPoints) {
        log.warn(
          `Column ${column.id}: 断面 ${shapeName}（pos=${pos}）のプロファイル作成に失敗しました`,
        );
        continue;
      }

      // extractPointsでプロファイルの頂点を取得
      const points = prof.shape.extractPoints(12); // 12分割で円弧を近似
      const vertices = points.shape;

      // 頂点を検証（MeshCreationValidator使用）
      if (
        !MeshCreationValidator.validateProfileVertices(vertices, column.id, {
          elementType: 'Column',
          shapeName: shapeName,
        })
      ) {
        continue;
      }

      log.debug(`  → プロファイル生成成功: 頂点数=${vertices.length}`);

      sections.push({
        pos: pos,
        profile: { vertices, holes: [] },
      });
    }

    if (sections.length < 2) {
      log.error(`Column ${column.id}: 有効なプロファイルが2つ未満です（${sections.length}個）`);
      return null;
    }

    // ジオメトリ生成
    try {
      if (sections.length === 2) {
        // 2断面: createTaperedGeometry
        return createTaperedGeometry(sections[0].profile, sections[1].profile, length, {
          segments: 1,
        });
      } else {
        // 3断面以上: createMultiSectionGeometry（柱はハンチ長さ無し）
        return createMultiSectionGeometry(sections, length, {});
      }
    } catch (error) {
      log.error(`Column ${column.id}: テーパージオメトリの生成に失敗しました:`, error);
      return null;
    }
  }
}

// デフォルトエクスポート用のレガシーインターフェース
export function createColumnMeshes(
  columnElements,
  nodes,
  columnSections,
  steelSections,
  elementType = 'Column',
  isJsonInput = false,
) {
  return ProfileBasedColumnGenerator.createColumnMeshes(
    columnElements,
    nodes,
    columnSections,
    steelSections,
    elementType,
    isJsonInput,
  );
}

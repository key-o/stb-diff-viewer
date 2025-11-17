/**
 * @fileoverview プロファイルベース柱形状生成モジュール（リファクタリング版）
 *
 * 新しい3層アーキテクチャを使用した柱形状生成:
 * 1. ProfileCalculator: プロファイル頂点座標を計算（Three.js非依存）
 * 2. GeometryCalculator: 配置・回転を計算（Three.js非依存）
 * 3. ThreeJSConverter: Three.jsオブジェクトに変換
 *
 * IFCProfileFactoryとの統合準備完了。
 */

import * as THREE from "three";
import { materials } from "../rendering/materials.js";
import { IFCProfileFactory } from "./IFCProfileFactory.js";
import { ensureUnifiedSectionType } from "../../common/sectionTypeUtil.js";
import { createLogger } from "../../utils/logger.js";

// 新しいコアレイヤーをインポート
import { calculateProfile } from "./core/ProfileCalculator.js";
import {
  calculateColumnPlacement,
  inferSectionTypeFromDimensions,
} from "./core/GeometryCalculator.js";
import {
  convertProfileToThreeShape,
  createExtrudeGeometry,
  applyPlacementToMesh,
  attachPlacementAxisLine,
} from "./core/ThreeJSConverter.js";
import {
  createTaperedGeometry,
  createMultiSectionGeometry,
} from "./core/TaperedGeometryBuilder.js";

const log = createLogger("viewer:profile:column");

/**
 * プロファイルベースの柱形状生成（リファクタリング版）
 */
export class ProfileBasedColumnGenerator {
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
    elementType = "Column",
    isJsonInput = false
  ) {
    log.info(
      `ProfileBasedColumnGenerator: Creating ${columnElements.length} column meshes`
    );
    const meshes = [];

    for (const column of columnElements) {
      try {
        const mesh = this._createSingleColumnMesh(
          column,
          nodes,
          columnSections,
          steelSections,
          elementType,
          isJsonInput
        );

        if (mesh) {
          meshes.push(mesh);
        }
      } catch (error) {
        log.error(`Error creating column ${column.id}:`, error);
      }
    }

    log.info(
      `ProfileBasedColumnGenerator: Generated ${meshes.length} column meshes`
    );
    return meshes;
  }

  /**
   * 単一柱メッシュを作成（新しいコアレイヤーを使用）
   * @private
   */
  static _createSingleColumnMesh(
    column,
    nodes,
    columnSections,
    steelSections,
    elementType,
    isJsonInput
  ) {
    // 1. ノード位置の取得（THREE.Vector3）
    const nodePositions = this._getNodePositions(column, nodes, isJsonInput);
    if (!nodePositions.bottomNode || !nodePositions.topNode) {
      console.warn(`Skipping column ${column.id}: Missing node data`);
      return null;
    }

    // 2. 断面データの取得
    const sectionData = ensureUnifiedSectionType(
      this._getSectionData(column, columnSections, isJsonInput)
    );
    if (!sectionData) {
      console.warn(`Skipping column ${column.id}: Missing section data`);
      return null;
    }

    // 3. 断面タイプの推定（GeometryCalculatorを使用）
    let sectionType =
      (sectionData.section_type && sectionData.section_type.toUpperCase()) ||
      (sectionData.profile_type && sectionData.profile_type.toUpperCase()) ||
      "RECTANGLE";

    if (!sectionType || sectionType === "UNKNOWN") {
      sectionType = inferSectionTypeFromDimensions(sectionData.dimensions);
    }

    log.debug(
      `Creating column ${column.id}: section_type=${sectionType}`
    );

    // 4. プロファイル生成（IFC優先、フォールバックでProfileCalculator）
    const profileResult = this._createSectionProfile(sectionData, sectionType, column);
    if (!profileResult || !profileResult.shape) {
      console.warn(`Skipping column ${column.id}: Failed to create profile`);
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

    // 回転角度の取得
    let rollAngle = 0;
    if (column.geometry && column.geometry.rotation) {
      rollAngle = column.geometry.rotation;
    } else if (column.angle) {
      rollAngle = column.angle;
    }

    // GeometryCalculatorで配置計算
    const placement = calculateColumnPlacement(bottomNodePlain, topNodePlain, {
      bottomOffset,
      topOffset,
      rollAngle,
    });

    if (placement.length <= 0) {
      console.warn(`Skipping column ${column.id}: Invalid length ${placement.length}`);
      return null;
    }

    log.debug(
      `Column ${column.id}: length=${placement.length.toFixed(1)}mm, mode=${sectionData.mode || 'single'}`
    );

    // 6. ジオメトリ作成（断面モードに応じて分岐）
    let geometry = null;
    const mode = sectionData.mode || 'single';

    if (mode === 'single') {
      // ===== 既存の1断面処理 =====
      geometry = createExtrudeGeometry(profileResult.shape, placement.length);
      if (!geometry) {
        console.warn(`Skipping column ${column.id}: Failed to create geometry`);
        return null;
      }
    } else if (mode === 'double' || mode === 'multi') {
      // ===== 新規: 多断面処理 =====
      geometry = this._createMultiSectionGeometry(sectionData, column, steelSections, placement.length);
      if (!geometry) {
        console.warn(
          `Skipping column ${column.id}: Failed to create multi-section geometry`
        );
        return null;
      }
    }

    if (!geometry) {
      console.warn(`Skipping column ${column.id}: Failed to create geometry`);
      return null;
    }

    // 7. メッシュを作成
    const mesh = new THREE.Mesh(geometry, materials.matchedMesh);

    // 8. 配置を適用（ThreeJSConverter使用）
    applyPlacementToMesh(mesh, placement);

    // 9. メタデータを設定
    mesh.userData = {
      elementType: elementType,
      elementId: column.id,
      isJsonInput: isJsonInput,
      columnData: column,
      length: placement.length,
      sectionType: sectionType,
      profileBased: true,
      profileMeta: profileResult.meta || { profileSource: "unknown" },
      sectionDataOriginal: sectionData,
    };

    // 10. 配置基準線を添付
    try {
      attachPlacementAxisLine(
        mesh,
        placement.length,
        materials.placementLine,
        {
          elementType: elementType,
          elementId: column.id,
          modelSource: "solid",
        }
      );
    } catch (e) {
      log.warn(`Column ${column.id}: failed to attach placement axis line`, e);
    }

    return mesh;
  }

  /**
   * ノード位置を取得
   * @private
   */
  static _getNodePositions(column, nodes, isJsonInput) {
    if (isJsonInput) {
      // JSON形式：直接座標を使用
      const startPoint = column.geometry?.start_point;
      const endPoint = column.geometry?.end_point;

      if (!startPoint || !endPoint) {
        return { bottomNode: null, topNode: null };
      }

      return {
        bottomNode: Array.isArray(startPoint)
          ? new THREE.Vector3(startPoint[0], startPoint[1], startPoint[2])
          : new THREE.Vector3(startPoint.x, startPoint.y, startPoint.z),
        topNode: Array.isArray(endPoint)
          ? new THREE.Vector3(endPoint[0], endPoint[1], endPoint[2])
          : new THREE.Vector3(endPoint.x, endPoint.y, endPoint.z),
      };
    } else {
      // STB形式：ノードマップから取得
      return {
        bottomNode: nodes.get(column.id_node_bottom),
        topNode: nodes.get(column.id_node_top),
      };
    }
  }

  /**
   * 断面データを取得
   * @private
   */
  static _getSectionData(column, columnSections, isJsonInput) {
    if (isJsonInput) {
      return column.section;
    } else {
      return columnSections.get(column.id_section);
    }
  }

  /**
   * 断面プロファイルを作成（IFC優先、フォールバックでProfileCalculator）
   * @private
   */
  static _createSectionProfile(sectionData, sectionType, column) {
    // デバッグ（チャンネル）
    if (sectionData?.steelShape?.name?.includes("[-")) {
      console.log(
        `_createSectionProfile: type=${sectionType} steel=${sectionData.steelShape.name}`
      );
    }

    log.debug(
      `Creating profile for column ${column.id}: section_type=${sectionType}`
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
    const steelTypes = new Set(["H", "BOX", "PIPE", "L", "T", "C", "CIRCLE"]);

    try {
      let ifcProfile = null;

      if (steelTypes.has(sectionType) && sectionData.steelShape) {
        ifcProfile = IFCProfileFactory.createProfileFromSTB(
          sectionData.steelShape,
          sectionType
        );
      } else if (sectionType === "RECTANGLE") {
        // RCなど矩形は寸法からIFC矩形を生成
        const rectDims = sectionData.dimensions || sectionData;
        ifcProfile = {
          ProfileType: IFCProfileFactory.mapSTBToIFCProfileType("RECTANGLE"),
          ProfileName: `STB_RECT_${
            rectDims.width || rectDims.outer_width || "W"
          }x${rectDims.height || rectDims.outer_height || "H"}`,
          ProfileParameters: {
            XDim: rectDims.width || rectDims.outer_width,
            YDim: rectDims.height || rectDims.outer_height || rectDims.depth,
          },
        };
      }

      if (ifcProfile) {
        const threeJSProfile = IFCProfileFactory.createGeometryFromProfile(
          ifcProfile,
          "center"
        );
        if (threeJSProfile) {
          log.debug(
            `IFC profile created successfully: ${ifcProfile.ProfileType}`
          );
          return {
            shape: threeJSProfile,
            meta: {
              profileSource: "ifc",
              sectionTypeResolved: sectionType,
              factoryType: ifcProfile.ProfileType,
            },
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
    const dimensions = sectionData.dimensions || sectionData;

    // 断面タイプに応じたパラメータを準備
    const profileParams = this._prepareProfileParameters(dimensions, sectionType);

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
          profileSource: "calculator",
          sectionTypeResolved: sectionType,
        },
      };
    } catch (error) {
      log.error(
        `ProfileCalculator creation failed for ${sectionType}: ${error?.message}`
      );
      return null;
    }
  }

  /**
   * 断面タイプに応じたパラメータを準備
   * @private
   */
  static _prepareProfileParameters(dimensions, sectionType) {
    switch (sectionType.toUpperCase()) {
      case "H":
      case "I":
      case "IBEAM":
      case "H-SECTION":
        return {
          overallDepth:
            dimensions.overall_depth || dimensions.height || dimensions.A || 450.0,
          overallWidth:
            dimensions.overall_width || dimensions.width || dimensions.B || 200.0,
          webThickness: dimensions.web_thickness || dimensions.t1 || 9.0,
          flangeThickness:
            dimensions.flange_thickness || dimensions.t2 || 14.0,
        };

      case "BOX":
      case "BOX-SECTION":
      case "SQUARE-SECTION":
        return {
          width: dimensions.width || dimensions.outer_width || 150.0,
          height: dimensions.height || dimensions.outer_height || 150.0,
          wallThickness:
            dimensions.wall_thickness || dimensions.thickness || 9.0,
        };

      case "PIPE":
      case "PIPE-SECTION":
      case "ROUND-SECTION":
        return {
          outerDiameter:
            dimensions.diameter || dimensions.outer_diameter || dimensions.A || 150.0,
          wallThickness:
            dimensions.thickness || dimensions.wall_thickness || dimensions.t || 6.0,
          segments: 32,
        };

      case "RECTANGLE":
      case "RECT":
      case "RC-SECTION":
        return {
          width: dimensions.width || 400.0,
          height: dimensions.height || 400.0,
        };

      case "CIRCLE":
        return {
          radius: dimensions.radius || (dimensions.diameter || 200.0) / 2,
          segments: 32,
        };

      case "C":
      case "CHANNEL":
      case "U-SHAPE":
        return {
          overallDepth:
            dimensions.overall_depth || dimensions.height || dimensions.A || 300.0,
          flangeWidth:
            dimensions.flange_width || dimensions.width || dimensions.B || 90.0,
          webThickness: dimensions.web_thickness || dimensions.t1 || 9.0,
          flangeThickness:
            dimensions.flange_thickness || dimensions.t2 || 13.0,
        };

      case "L":
      case "L-SHAPE":
        return {
          depth: dimensions.overall_depth || dimensions.depth || 65.0,
          width: dimensions.flange_width || dimensions.width || 65.0,
          thickness: dimensions.web_thickness || dimensions.thickness || 6.0,
        };

      case "T":
      case "T-SHAPE":
        return {
          overallDepth:
            dimensions.overall_depth || dimensions.height || 200.0,
          flangeWidth: dimensions.flange_width || dimensions.width || 150.0,
          webThickness: dimensions.web_thickness || 8.0,
          flangeThickness: dimensions.flange_thickness || 12.0,
        };

      default:
        // デフォルトは矩形
        return {
          width: dimensions.width || 400.0,
          height: dimensions.height || 400.0,
        };
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
    if (!sectionData.shapes || sectionData.shapes.length < 2) {
      log.error(
        `Column ${column.id}: 多断面ジオメトリにはshapes配列（2要素以上）が必要です`
      );
      return null;
    }

    // 各断面のプロファイルを作成
    const sections = [];
    log.debug(
      `Column ${column.id}: 多断面ジオメトリ生成開始 (${sectionData.shapes.length}断面)`
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

      // 断面タイプの推定
      let sectionType =
        (tempSectionData.section_type && tempSectionData.section_type.toUpperCase()) ||
        (tempSectionData.profile_type && tempSectionData.profile_type.toUpperCase()) ||
        "RECTANGLE";

      if (!sectionType || sectionType === "UNKNOWN") {
        sectionType = inferSectionTypeFromDimensions(tempSectionData.dimensions);
      }

      log.debug(
        `  断面[${pos}]: shape=${shapeName}, type=${sectionType}, ` +
        `dims=${JSON.stringify(tempSectionData.dimensions || {}).substring(0, 100)}, ` +
        `variant=${variant ? 'あり' : 'なし'}`
      );

      // プロファイルを作成
      const prof = this._createSectionProfile(tempSectionData, sectionType, column);
      if (!prof || !prof.shape || !prof.shape.extractPoints) {
        log.warn(
          `Column ${column.id}: 断面 ${shapeName}（pos=${pos}）のプロファイル作成に失敗しました`
        );
        continue;
      }

      // extractPointsでプロファイルの頂点を取得
      const points = prof.shape.extractPoints(12); // 12分割で円弧を近似
      const vertices = points.shape;

      if (!vertices || vertices.length < 3) {
        log.warn(
          `Column ${column.id}: 断面 ${shapeName}（pos=${pos}）の頂点が不十分です`
        );
        continue;
      }

      log.debug(
        `  → プロファイル生成成功: 頂点数=${vertices.length}`
      );

      sections.push({
        pos: pos,
        profile: { vertices, holes: [] },
      });
    }

    if (sections.length < 2) {
      log.error(
        `Column ${column.id}: 有効なプロファイルが2つ未満です（${sections.length}個）`
      );
      return null;
    }

    // ジオメトリ生成
    try {
      if (sections.length === 2) {
        // 2断面: createTaperedGeometry
        return createTaperedGeometry(
          sections[0].profile,
          sections[1].profile,
          length,
          { segments: 1 }
        );
      } else {
        // 3断面以上: createMultiSectionGeometry（柱はハンチ長さ無し）
        return createMultiSectionGeometry(sections, length, {});
      }
    } catch (error) {
      log.error(
        `Column ${column.id}: テーパージオメトリの生成に失敗しました:`,
        error
      );
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
  elementType = "Column",
  isJsonInput = false
) {
  return ProfileBasedColumnGenerator.createColumnMeshes(
    columnElements,
    nodes,
    columnSections,
    steelSections,
    elementType,
    isJsonInput
  );
}

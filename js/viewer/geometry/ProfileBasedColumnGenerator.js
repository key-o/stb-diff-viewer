/**
 * @fileoverview プロファイルベース柱形状生成モジュール
 *
 * ブレースの実装をベースにしたプロファイルベースの柱形状生成:
 * 1. プロファイル（断面）形状を作成
 * 2. Z軸方向に押し出して3Dジオメトリを生成
 * 3. 精密な配置と回転を適用
 *
 * ブレースのProfileBasedBraceGeneratorと同じロジックを使用
 */

import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";
import { materials } from "../rendering/materials.js";
import { MeshPositioner } from "./MeshPositioner.js";
import { IFCProfileFactory } from "./IFCProfileFactory.js";
import { ensureUnifiedSectionType } from "../../common/sectionTypeUtil.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("viewer:profile:column");

/**
 * プロファイルベースの柱形状生成
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
   * 単一柱メッシュを作成
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
    // 1. ノード位置の取得
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

    // 3. 長さ計算
    const length = nodePositions.bottomNode.distanceTo(nodePositions.topNode);
    if (length <= 0) {
      console.warn(`Skipping column ${column.id}: Invalid length ${length}`);
      return null;
    }

    log.debug(
      `Creating column ${column.id}: length=${length.toFixed(
        1
      )}mm, section_type=${
        sectionData.section_type || sectionData.profile_type || "unknown"
      }`
    );

    // 4. プロファイル（断面）形状を作成
    const prof = this._createSectionProfile(sectionData, column);
    const profile = prof?.shape;
    const profileMeta = prof?.meta;
    if (!profile) {
      console.warn(`Skipping column ${column.id}: Failed to create profile`);
      return null;
    }

    // 5. 押し出しジオメトリを作成
    const geometry = this._createExtrudedGeometry(profile, length);
    if (!geometry) {
      console.warn(`Skipping column ${column.id}: Failed to create geometry`);
      return null;
    }

    // 6. メッシュを作成
    const mesh = new THREE.Mesh(geometry, materials.matchedMesh);

    // 7. 精密配置を適用（柱用）
    this._applyPrecisePlacement(
      mesh,
      nodePositions.bottomNode,
      nodePositions.topNode,
      sectionData,
      column
    );

    // 8. メタデータを設定
    mesh.userData = {
      elementType: elementType,
      elementId: column.id,
      isJsonInput: isJsonInput,
      columnData: column,
      length: length,
      sectionType:
        sectionData.section_type || sectionData.profile_type || "unknown",
      profileBased: true,
      profileMeta: profileMeta || { profileSource: "unknown" },
      sectionDataOriginal: sectionData,
    };

    // 9. 配置基準線（軸）を重ねて表示
    try {
      this._attachPlacementAxisLine(
        mesh,
        nodePositions.bottomNode,
        nodePositions.topNode
      );
    } catch (e) {
      log.warn(`Column ${column.id}: failed to attach placement axis line`, e);
    }

    return mesh;
  }

  /**
   * 立体表示における配置基準線（bottom→top の中心線）をメッシュに添付
   * @private
   */
  static _attachPlacementAxisLine(mesh, bottomNode, topNode) {
    // メッシュのローカルZ軸（押し出し方向）に沿って、中心から上下に線を引く
    const L =
      (mesh.userData && typeof mesh.userData.length === "number"
        ? mesh.userData.length
        : mesh.geometry?.parameters?.depth) || 0;
    if (!L || !isFinite(L) || L <= 0) return;
    const p0 = new THREE.Vector3(0, 0, -L / 2);
    const p1 = new THREE.Vector3(0, 0, +L / 2);
    const geom = new THREE.BufferGeometry().setFromPoints([p0, p1]);
    const line = new THREE.Line(geom, materials.placementLine);
    line.userData = {
      isPlacementLine: true,
      elementType: mesh.userData?.elementType || "Column",
      elementId: mesh.userData?.elementId,
      modelSource: "solid",
    };
    line.matrixAutoUpdate = true;
    mesh.add(line);
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
   * 断面プロファイルを作成（IFC方式 - IFCProfileFactory使用）
   * @private
   */
  static _createSectionProfile(sectionData, column) {
    let sectionType =
      (sectionData.section_type && sectionData.section_type.toUpperCase()) ||
      (sectionData.profile_type && sectionData.profile_type.toUpperCase()) ||
      "RECTANGLE";

    // 必要なら寸法から推定（名前ベースは使わない）
    if (!sectionType || sectionType === "UNKNOWN") {
      sectionType = this._inferSectionTypeFromDimensions(
        sectionData.dimensions
      );
    }

    // デバッグ（チャンネル）
    if (sectionData?.steelShape?.name?.includes("[-")) {
      console.log(
        `_createSectionProfile: initial type=${sectionType} steel=${sectionData.steelShape.name}`
      );
    }

    log.debug(
      `Creating IFC profile for column ${column.id}: section_type=${sectionType}`
    );

    // IFC経路: 鋼材タイプの場合は steelShape を渡す
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

    // フォールバック: 手動プロファイル作成
    return this._createManualProfile(sectionData, sectionType);
  }

  /**
   * 寸法情報から断面タイプを推定
   * @private
   */
  static _inferSectionTypeFromDimensions(dimensions) {
    if (!dimensions) {
      return "RECTANGLE";
    }

    // チャンネル材の推定デバッグ（dimensions内容確認）
    if (
      dimensions.overall_depth === 300 ||
      dimensions.overall_depth === 200 ||
      dimensions.overall_depth === 100
    ) {
      console.log(
        `_inferSectionTypeFromDimensions - Channel check:`,
        dimensions
      );
      console.log(
        `Depth: ${dimensions.overall_depth}, FlangeWidth: ${dimensions.flange_width}, WebThickness: ${dimensions.web_thickness}, FlangeThickness: ${dimensions.flange_thickness}`
      );
    }

    // 円形鋼管: outer_diameter または diameter が存在
    if (dimensions.outer_diameter || dimensions.diameter) {
      log.debug("Inferred section type: PIPE (from diameter)");
      return "PIPE";
    }

    // 角形鋼管: outer_height + outer_width + wall_thickness
    if (
      dimensions.outer_height &&
      dimensions.outer_width &&
      dimensions.wall_thickness
    ) {
      log.debug(
        "Inferred section type: BOX (from outer_height/width + wall_thickness)"
      );
      return "BOX";
    }

    // BOX形: width + height + thickness (wall_thickness含む)
    if (
      dimensions.width &&
      dimensions.height &&
      (dimensions.thickness || dimensions.wall_thickness)
    ) {
      log.debug("Inferred section type: BOX (from width/height + thickness)");
      return "BOX";
    }

    // H形鋼: overall_depth + overall_width + web_thickness + flange_thickness
    if (
      dimensions.overall_depth &&
      dimensions.overall_width &&
      dimensions.web_thickness &&
      dimensions.flange_thickness
    ) {
      log.debug("Inferred section type: H (from H-shape dimensions)");
      return "H";
    }

    // チャンネル材: overall_depth + flange_width + web_thickness + flange_thickness
    if (
      dimensions.overall_depth &&
      dimensions.flange_width &&
      dimensions.web_thickness &&
      dimensions.flange_thickness
    ) {
      log.debug("Inferred section type: C (from channel dimensions)");
      return "C";
    }

    // RC柱: width + height (肉厚情報なし)
    if (
      dimensions.width &&
      dimensions.height &&
      !dimensions.thickness &&
      !dimensions.wall_thickness &&
      !dimensions.web_thickness &&
      !dimensions.flange_thickness
    ) {
      log.debug("Inferred section type: RECTANGLE (from RC dimensions)");
      return "RECTANGLE";
    }

    // デフォルト: 矩形断面
    log.debug("Defaulted to section type: RECTANGLE");
    return "RECTANGLE";
  }

  /**
   * 手動プロファイル作成（フォールバック）
   * @private
   */
  static _createManualProfile(sectionData, sectionType) {
    switch (sectionType) {
      case "H":
      case "I":
      case "IBEAM":
      case "H-SECTION":
        return {
          shape: this._createHShapeProfile(sectionData),
          meta: { profileSource: "manual", sectionTypeResolved: "H" },
        };

      case "C":
      case "CHANNEL":
      case "U-SHAPE":
        return {
          shape: this._createChannelProfile(sectionData),
          meta: { profileSource: "manual", sectionTypeResolved: "C" },
        };

      case "BOX":
      case "BOX-SECTION":
      case "SQUARE-SECTION":
        return {
          shape: this._createBoxProfile(sectionData),
          meta: { profileSource: "manual", sectionTypeResolved: "BOX" },
        };

      case "PIPE":
      case "PIPE-SECTION":
      case "ROUND-SECTION":
        return {
          shape: this._createPipeProfile(sectionData),
          meta: { profileSource: "manual", sectionTypeResolved: "PIPE" },
        };

      case "RECTANGLE":
      case "RECT":
      case "RC-SECTION":
        return {
          shape: this._createRectangleProfile(sectionData),
          meta: { profileSource: "manual", sectionTypeResolved: "RECTANGLE" },
        };

      case "CIRCLE":
        return {
          shape: this._createCircleProfile(sectionData),
          meta: { profileSource: "manual", sectionTypeResolved: "CIRCLE" },
        };

      default:
        log.warn(`Unsupported section type: ${sectionType}, using rectangle`);
        return {
          shape: this._createRectangleProfile(sectionData),
          meta: {
            profileSource: "manual",
            sectionTypeResolved: "RECTANGLE",
            reason: "unsupported-section",
          },
        };
    }
  }

  /**
   * H形プロファイル作成
   * @private
   */
  static _createHShapeProfile(sectionData) {
    const dimensions = sectionData.dimensions || sectionData;
    const overallDepth =
      dimensions.overall_depth || dimensions.height || dimensions.A || 200.0;
    const overallWidth =
      dimensions.overall_width || dimensions.width || dimensions.B || 200.0;
    const webThickness = dimensions.web_thickness || dimensions.t1 || 8.0;
    const flangeThickness =
      dimensions.flange_thickness || dimensions.t2 || 12.0;

    const shape = new THREE.Shape();
    const halfWidth = overallWidth / 2;
    const halfDepth = overallDepth / 2;
    const halfWeb = webThickness / 2;

    // H形状を描画（中心を原点とする）
    shape.moveTo(-halfWidth, -halfDepth);
    shape.lineTo(halfWidth, -halfDepth);
    shape.lineTo(halfWidth, -halfDepth + flangeThickness);
    shape.lineTo(halfWeb, -halfDepth + flangeThickness);
    shape.lineTo(halfWeb, halfDepth - flangeThickness);
    shape.lineTo(halfWidth, halfDepth - flangeThickness);
    shape.lineTo(halfWidth, halfDepth);
    shape.lineTo(-halfWidth, halfDepth);
    shape.lineTo(-halfWidth, halfDepth - flangeThickness);
    shape.lineTo(-halfWeb, halfDepth - flangeThickness);
    shape.lineTo(-halfWeb, -halfDepth + flangeThickness);
    shape.lineTo(-halfWidth, -halfDepth + flangeThickness);
    shape.closePath();

    console.log(
      `H-Shape profile: depth=${overallDepth}mm, width=${overallWidth}mm`
    );
    return shape;
  }

  /**
   * チャンネル形プロファイル作成
   * @private
   */
  static _createChannelProfile(sectionData) {
    const dimensions = sectionData.dimensions || sectionData;
    const overallDepth =
      dimensions.overall_depth || dimensions.height || dimensions.A || 300.0;
    const flangeWidth =
      dimensions.flange_width || dimensions.width || dimensions.B || 90.0;
    const webThickness = dimensions.web_thickness || dimensions.t1 || 9.0;
    const flangeThickness =
      dimensions.flange_thickness || dimensions.t2 || 13.0;

    const shape = new THREE.Shape();
    const halfFlangeWidth = flangeWidth / 2;
    const halfWebThickness = webThickness / 2;
    const halfDepth = overallDepth / 2;

    // チャンネル形状を描画（中心を原点とする）
    // 反時計回りで描画
    shape.moveTo(-halfFlangeWidth, -halfDepth);
    shape.lineTo(halfFlangeWidth, -halfDepth);
    shape.lineTo(halfFlangeWidth, -halfDepth + flangeThickness);
    shape.lineTo(halfWebThickness, -halfDepth + flangeThickness);
    shape.lineTo(halfWebThickness, halfDepth - flangeThickness);
    shape.lineTo(halfFlangeWidth, halfDepth - flangeThickness);
    shape.lineTo(halfFlangeWidth, halfDepth);
    shape.lineTo(-halfFlangeWidth, halfDepth);
    shape.lineTo(-halfFlangeWidth, halfDepth - flangeThickness);
    shape.lineTo(-halfWebThickness, halfDepth - flangeThickness);
    shape.lineTo(-halfWebThickness, -halfDepth + flangeThickness);
    shape.lineTo(-halfFlangeWidth, -halfDepth + flangeThickness);
    shape.closePath();

    console.log(
      `Channel profile: depth=${overallDepth}mm, flangeWidth=${flangeWidth}mm, webThickness=${webThickness}mm, flangeThickness=${flangeThickness}mm`
    );
    return shape;
  }

  /**
   * BOX形プロファイル作成
   * @private
   */
  static _createBoxProfile(sectionData) {
    const dimensions = sectionData.dimensions || sectionData;
    const width = dimensions.width || dimensions.outer_width || 150.0;
    const height = dimensions.height || dimensions.outer_height || width;
    const thickness = dimensions.wall_thickness || dimensions.thickness || 9.0;

    const shape = new THREE.Shape();
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const innerHalfWidth = halfWidth - thickness;
    const innerHalfHeight = halfHeight - thickness;

    // 外形
    shape.moveTo(-halfWidth, -halfHeight);
    shape.lineTo(halfWidth, -halfHeight);
    shape.lineTo(halfWidth, halfHeight);
    shape.lineTo(-halfWidth, halfHeight);
    shape.closePath();

    // 内部をくり抜き
    if (innerHalfWidth > 0 && innerHalfHeight > 0) {
      const hole = new THREE.Path();
      hole.moveTo(-innerHalfWidth, -innerHalfHeight);
      hole.lineTo(innerHalfWidth, -innerHalfHeight);
      hole.lineTo(innerHalfWidth, innerHalfHeight);
      hole.lineTo(-innerHalfWidth, innerHalfHeight);
      hole.closePath();
      shape.holes.push(hole);
    }

    console.log(
      `Box profile: width=${width}mm, height=${height}mm, thickness=${thickness}mm`
    );
    return shape;
  }

  /**
   * パイプ形プロファイル作成
   * @private
   */
  static _createPipeProfile(sectionData) {
    const dimensions = sectionData.dimensions || sectionData;
    const outerDiameter =
      dimensions.diameter || dimensions.outer_diameter || dimensions.A || 150.0;
    const thickness =
      dimensions.thickness || dimensions.wall_thickness || dimensions.t || 6.0;

    const outerRadius = outerDiameter / 2;
    const innerRadius = Math.max(0, outerRadius - thickness);

    const shape = new THREE.Shape();
    shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);

    // 内部をくり抜き
    if (innerRadius > 0) {
      const hole = new THREE.Path();
      hole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }

    console.log(
      `Pipe profile: diameter=${outerDiameter}mm, thickness=${thickness}mm`
    );
    return shape;
  }

  /**
   * 矩形プロファイル作成
   * @private
   */
  static _createRectangleProfile(sectionData) {
    const dimensions = sectionData.dimensions || sectionData;
    const width = dimensions.width || 400.0;
    const height = dimensions.height || 400.0;

    const shape = new THREE.Shape();
    const halfWidth = width / 2;
    const halfHeight = height / 2;

    shape.moveTo(-halfWidth, -halfHeight);
    shape.lineTo(halfWidth, -halfHeight);
    shape.lineTo(halfWidth, halfHeight);
    shape.lineTo(-halfWidth, halfHeight);
    shape.closePath();

    console.log(`Rectangle profile: width=${width}mm, height=${height}mm`);
    return shape;
  }

  /**
   * 円形プロファイル作成
   * @private
   */
  static _createCircleProfile(sectionData) {
    const dimensions = sectionData.dimensions || sectionData;
    const radius = dimensions.radius || (dimensions.diameter || 200.0) / 2;

    const shape = new THREE.Shape();
    shape.absarc(0, 0, radius, 0, Math.PI * 2, false);

    console.log(`Circle profile: radius=${radius}mm`);
    return shape;
  }

  /**
   * 押し出しジオメトリを作成（IFC方式）
   * @private
   */
  static _createExtrudedGeometry(profile, length) {
    try {
      const extrudeSettings = {
        depth: length,
        bevelEnabled: false,
        // UVジェネレーター設定（必要に応じて）
        UVGenerator: THREE.ExtrudeGeometry.WorldUVGenerator,
      };

      const geometry = new THREE.ExtrudeGeometry(profile, extrudeSettings);

      // ジオメトリの中心を調整（IFC方式：Z軸中心）
      geometry.translate(0, 0, -length / 2);

      console.log(`Created extruded geometry: length=${length}mm`);
      return geometry;
    } catch (error) {
      console.error("Failed to create extruded geometry:", error);
      return null;
    }
  }

  /**
   * 精密配置を適用（IFC方式）
   * @private
   */
  static _applyPrecisePlacement(
    mesh,
    bottomNode,
    topNode,
    sectionData,
    column
  ) {
    try {
      // 1. 中心点・方向ベクトルを計算
      const center = new THREE.Vector3().lerpVectors(bottomNode, topNode, 0.5);
      const direction = new THREE.Vector3()
        .subVectors(topNode, bottomNode)
        .normalize();

      // 2. bottom/top オフセット（mm）をグローバルX/Yで適用し、節点を調整
      const obx = Number(column.offset_bottom_X || 0);
      const oby = Number(column.offset_bottom_Y || 0);
      const otx = Number(column.offset_top_X || 0);
      const oty = Number(column.offset_top_Y || 0);

      const bottomAdjusted = new THREE.Vector3(
        bottomNode.x + obx,
        bottomNode.y + oby,
        bottomNode.z
      );
      const topAdjusted = new THREE.Vector3(
        topNode.x + otx,
        topNode.y + oty,
        topNode.z
      );

      // 3. 調整後の中心で配置
      const adjustedCenter = new THREE.Vector3()
        .copy(bottomAdjusted)
        .lerp(topAdjusted, 0.5);
      mesh.position.copy(adjustedCenter);

      // 4. ジオメトリの押し出し(Z)を柱軸に合わせる回転
      const zAxis = new THREE.Vector3()
        .subVectors(topAdjusted, bottomAdjusted)
        .normalize();
      const quaternion = new THREE.Quaternion();
      quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), zAxis);
      mesh.quaternion.copy(quaternion);

      // 5. 柱固有の回転調整（角度指定など）
      this._applyColumnSpecificRotation(mesh, zAxis, sectionData, column);

      // 6. 端部オフセットが異なる場合の微小ねじれは無視（押し出しは直線軸）

      console.log(
        `Applied precise placement with offsets: center=${adjustedCenter
          .toArray()
          .map((v) => v.toFixed(1))}, ` +
          `dir=${zAxis.toArray().map((v) => v.toFixed(3))}, ` +
          `offsets(bottom=[${obx},${oby}], top=[${otx},${oty}])`
      );
    } catch (error) {
      console.error("Failed to apply precise placement:", error);
    }
  }

  /**
   * 柱固有の回転調整
   * @private
   */
  static _applyColumnSpecificRotation(mesh, direction, sectionData, column) {
    const sectionType =
      (sectionData.section_type && sectionData.section_type.toUpperCase()) ||
      (sectionData.profile_type && sectionData.profile_type.toUpperCase()) ||
      "RECTANGLE";

    // 柱の回転角（JSON形式から取得）
    let rotationAngle = 0;
    if (column.geometry && column.geometry.rotation) {
      rotationAngle = column.geometry.rotation;
    } else if (column.angle) {
      rotationAngle = column.angle;
    }

    switch (sectionType) {
      case "H":
      case "I":
      case "H-SECTION":
        // H形鋼柱：フランジを強軸方向（通常はX-Z平面）に配置
        // デフォルトでは既に正しい向きなので、追加回転は不要
        if (rotationAngle !== 0) {
          const hRollQuaternion = new THREE.Quaternion();
          hRollQuaternion.setFromAxisAngle(direction, rotationAngle);
          mesh.quaternion.multiply(hRollQuaternion);
        }
        break;

      case "RECTANGLE":
      case "RC-SECTION":
        // 矩形柱：指定角度で回転
        if (rotationAngle !== 0) {
          const rectRollQuaternion = new THREE.Quaternion();
          rectRollQuaternion.setFromAxisAngle(direction, rotationAngle);
          mesh.quaternion.multiply(rectRollQuaternion);
        }
        break;

      // 円形・円管は回転不要
      case "PIPE":
      case "CIRCLE":
        break;

      default:
        // その他の断面：指定角度で回転
        if (rotationAngle !== 0) {
          const defaultRollQuaternion = new THREE.Quaternion();
          defaultRollQuaternion.setFromAxisAngle(direction, rotationAngle);
          mesh.quaternion.multiply(defaultRollQuaternion);
        }
        break;
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

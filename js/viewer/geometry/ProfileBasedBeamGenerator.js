/**
 * @fileoverview プロファイルベース梁形状生成モジュール
 *
 * ブレースの実装をベースにしたプロファイルベースの梁形状生成:
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

const log = createLogger("viewer:profile:beam");

/**
 * プロファイルベースの梁形状生成
 */
export class ProfileBasedBeamGenerator {
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
    elementType = "Beam",
    isJsonInput = false
  ) {
    log.info(
      `ProfileBasedBeamGenerator: Creating ${beamElements.length} beam meshes`
    );
    const meshes = [];

    for (const beam of beamElements) {
      try {
        const mesh = this._createSingleBeamMesh(
          beam,
          nodes,
          beamSections,
          steelSections,
          elementType,
          isJsonInput
        );

        if (mesh) {
          meshes.push(mesh);
        }
      } catch (error) {
        log.error(`Error creating beam ${beam.id}:`, error);
      }
    }

    log.info(
      `ProfileBasedBeamGenerator: Generated ${meshes.length} beam meshes`
    );
    return meshes;
  }

  /**
   * 単一梁メッシュを作成
   * @private
   */
  static _createSingleBeamMesh(
    beam,
    nodes,
    beamSections,
    steelSections,
    elementType,
    isJsonInput
  ) {
    // 1. ノード位置の取得
    const nodePositions = this._getNodePositions(beam, nodes, isJsonInput);
    if (!nodePositions.startNode || !nodePositions.endNode) {
      console.warn(`Skipping beam ${beam.id}: Missing node data`);
      return null;
    }

    // 2. 断面データの取得
    const sectionData = ensureUnifiedSectionType(
      this._getSectionData(beam, beamSections, isJsonInput)
    );
    if (!sectionData) {
      console.warn(`Skipping beam ${beam.id}: Missing section data`);
      return null;
    }

    // 3. 長さ計算
    const length = nodePositions.startNode.distanceTo(nodePositions.endNode);
    if (length <= 0) {
      console.warn(`Skipping beam ${beam.id}: Invalid length ${length}`);
      return null;
    }

    log.debug(
      `Creating beam ${beam.id}: length=${length.toFixed(1)}mm, section_type=${
        sectionData.section_type || sectionData.profile_type || "unknown"
      }`
    );

    // 4. プロファイル（断面）形状を作成
    const prof = this._createSectionProfile(sectionData, beam);
    const profile = prof?.shape;
    const profileMeta = prof?.meta;
    if (!profile) {
      console.warn(`Skipping beam ${beam.id}: Failed to create profile`);
      return null;
    }

    // 5. 押し出しジオメトリを作成
    const geometry = this._createExtrudedGeometry(profile, length);
    if (!geometry) {
      console.warn(`Skipping beam ${beam.id}: Failed to create geometry`);
      return null;
    }

    // 6. メッシュを作成
    const mesh = new THREE.Mesh(geometry, materials.matchedMesh);

    // 7. 精密配置を適用（梁用）
    this._applyPrecisePlacement(
      mesh,
      nodePositions.startNode,
      nodePositions.endNode,
      sectionData,
      beam
    );

    // 8. メタデータを設定
    mesh.userData = {
      elementType: elementType,
      elementId: beam.id,
      isJsonInput: isJsonInput,
      beamData: beam,
      length: length,
      sectionType:
        sectionData.section_type || sectionData.profile_type || "unknown",
      profileBased: true,
      profileMeta: profileMeta || { profileSource: "unknown" },
      sectionDataOriginal: sectionData,
      // 断面高さ（天端基準オフセットの根拠）
      sectionHeight: ProfileBasedBeamGenerator._getSectionHeight(sectionData),
    };

    // 9. 配置基準線（軸）を重ねて表示
    try {
      this._attachPlacementAxisLine(
        mesh,
        nodePositions.startNode,
        nodePositions.endNode
      );
    } catch (e) {
      log.warn(`Beam ${beam.id}: failed to attach placement axis line`, e);
    }

    return mesh;
  }

  /**
   * 立体表示における配置基準線（start→end の中心線）をメッシュに添付
   * @private
   */
  static _attachPlacementAxisLine(mesh, startNode, endNode) {
    // メッシュのローカルZ軸（押し出し方向）に沿って、中心から前後に線を引く
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
      elementType: mesh.userData?.elementType || "Beam",
      elementId: mesh.userData?.elementId,
      modelSource: "solid",
    };
    // 親メッシュの変換に追随させる（ローカル座標で一致させる）
    line.matrixAutoUpdate = true;
    mesh.add(line);
  }

  /**
   * ノード位置を取得
   * @private
   */
  static _getNodePositions(beam, nodes, isJsonInput) {
    if (isJsonInput) {
      // JSON形式：直接座標を使用
      const startPoint = beam.geometry?.start_point;
      const endPoint = beam.geometry?.end_point;

      if (!startPoint || !endPoint) {
        return { startNode: null, endNode: null };
      }

      return {
        startNode: Array.isArray(startPoint)
          ? new THREE.Vector3(startPoint[0], startPoint[1], startPoint[2])
          : new THREE.Vector3(startPoint.x, startPoint.y, startPoint.z),
        endNode: Array.isArray(endPoint)
          ? new THREE.Vector3(endPoint[0], endPoint[1], endPoint[2])
          : new THREE.Vector3(endPoint.x, endPoint.y, endPoint.z),
      };
    } else {
      // STB形式：ノードマップから取得
      return {
        startNode: nodes.get(beam.id_node_start),
        endNode: nodes.get(beam.id_node_end),
      };
    }
  }

  /**
   * 断面データを取得
   * @private
   */
  static _getSectionData(beam, beamSections, isJsonInput) {
    if (isJsonInput) {
      return beam.section;
    } else {
      return beamSections.get(beam.id_section);
    }
  }

  /**
   * 断面プロファイルを作成（IFC方式 - IFCProfileFactory使用）
   * @private
   */
  static _createSectionProfile(sectionData, beam) {
    let sectionType =
      (sectionData.section_type && sectionData.section_type.toUpperCase()) ||
      (sectionData.profile_type && sectionData.profile_type.toUpperCase()) ||
      "H";

    if (sectionType === "UNKNOWN" || !sectionType) {
      sectionType = this._inferSectionTypeFromDimensions(
        sectionData.dimensions
      );
    }

    log.debug(
      `Creating IFC profile for beam ${beam.id}: section_type=${sectionType}`
    );

    try {
      // IFCProfileFactoryを使用してプロファイル作成（梁用に中心配置を指定）
      let ifcProfile = null;
      const steelTypes = new Set(["H", "BOX", "PIPE", "L", "T", "C", "CIRCLE"]);
      if (steelTypes.has(sectionType) && sectionData.steelShape) {
        ifcProfile = IFCProfileFactory.createProfileFromSTB(
          sectionData.steelShape,
          sectionType
        );
      } else if (sectionType === "RECTANGLE") {
        const dims = sectionData.dimensions || sectionData;
        ifcProfile = {
          ProfileType: IFCProfileFactory.mapSTBToIFCProfileType("RECTANGLE"),
          ProfileName: `STB_RECT_${dims.width || dims.outer_width || "W"}x${
            dims.height || dims.outer_height || dims.depth || "H"
          }`,
          ProfileParameters: {
            XDim: dims.width || dims.outer_width,
            YDim: dims.height || dims.outer_height || dims.depth,
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
        `IFC profile creation failed for ${sectionType}: ${error.message}, falling back to manual creation`
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
      return "H";
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

    // 円形鋼管: outer_diameter または diameter が存在
    if (dimensions.outer_diameter || dimensions.diameter) {
      log.debug("Inferred section type: PIPE (from diameter)");
      return "PIPE";
    }

    // RC梁: width + height (肉厚情報なし)
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

    // チャンネル形: overall_depth + flange_width + web_thickness + flange_thickness
    if (
      dimensions.overall_depth &&
      dimensions.flange_width &&
      dimensions.web_thickness &&
      dimensions.flange_thickness
    ) {
      log.debug("Inferred section type: C (from Channel dimensions)");
      return "C";
    }

    // デフォルト: H形鋼
    log.debug("Defaulted to section type: H");
    return "H";
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

      case "C":
      case "CHANNEL":
        return {
          shape: this._createChannelProfile(sectionData),
          meta: { profileSource: "manual", sectionTypeResolved: "C" },
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
        log.warn(`Unsupported section type: ${sectionType}, using H-shape`);
        return {
          shape: this._createHShapeProfile(sectionData),
          meta: {
            profileSource: "manual",
            sectionTypeResolved: "H",
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
      dimensions.overall_depth || dimensions.height || dimensions.A || 450.0;
    const overallWidth =
      dimensions.overall_width || dimensions.width || dimensions.B || 200.0;
    const webThickness = dimensions.web_thickness || dimensions.t1 || 9.0;
    const flangeThickness =
      dimensions.flange_thickness || dimensions.t2 || 14.0;

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

    log.trace(
      `H-Shape profile: depth=${overallDepth}mm, width=${overallWidth}mm`
    );
    return shape;
  }

  /**
   * BOX形プロファイル作成
   * @private
   */
  static _createBoxProfile(sectionData) {
    const dimensions = sectionData.dimensions || sectionData;
    const width = dimensions.width || dimensions.outer_width || 200.0;
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

    log.trace(
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
      dimensions.diameter || dimensions.outer_diameter || dimensions.A || 200.0;
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

    log.trace(
      `Pipe profile: diameter=${outerDiameter}mm, thickness=${thickness}mm`
    );
    return shape;
  }

  /**
   * チャンネル形プロファイル作成
   * @private
   */
  static _createChannelProfile(sectionData) {
    const dimensions = sectionData.dimensions || sectionData;
    // IFC IfcCShapeProfileDef準拠パラメータ（梁用）
    const depth = dimensions.overall_depth || dimensions.height || 300.0;
    const width = dimensions.flange_width || dimensions.width || 90.0;
    const wallThickness = dimensions.web_thickness || 5.0;
    const girth = dimensions.flange_thickness || 5.0;

    const shape = new THREE.Shape();

    // C字形状を描画（IFC IfcCShapeProfileDef準拠）
    // 開口部が右側になるように配置
    shape.moveTo(0, 0);
    shape.lineTo(width, 0);
    shape.lineTo(width, girth);
    shape.lineTo(wallThickness, girth);
    shape.lineTo(wallThickness, depth - girth);
    shape.lineTo(width, depth - girth);
    shape.lineTo(width, depth);
    shape.lineTo(0, depth);
    shape.lineTo(0, 0);

    log.trace(
      `Channel profile: depth=${depth}mm, width=${width}mm, wallThickness=${wallThickness}mm, girth=${girth}mm`
    );
    return shape;
  }

  /**
   * 矩形プロファイル作成
   * @private
   */
  static _createRectangleProfile(sectionData) {
    const dimensions = sectionData.dimensions || sectionData;
    const width = dimensions.width || 300.0;
    const height = dimensions.height || 600.0;

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
  static _applyPrecisePlacement(mesh, startNode, endNode, sectionData, beam) {
    try {
      // 1. 初期方向ベクトルを計算
      const baseDir = new THREE.Vector3()
        .subVectors(endNode, startNode)
        .normalize();

      // 2. start/end オフセットをグローバル座標系で適用（STB仕様）
      const osx = Number(beam.offset_start_X || 0);
      const osy = Number(beam.offset_start_Y || 0);
      const osz = Number(beam.offset_start_Z || 0);
      const oex = Number(beam.offset_end_X || 0);
      const oey = Number(beam.offset_end_Y || 0);
      const oez = Number(beam.offset_end_Z || 0);

      const startAdjusted = new THREE.Vector3(
        startNode.x + osx,
        startNode.y + osy,
        startNode.z + osz
      );
      const endAdjusted = new THREE.Vector3(
        endNode.x + oex,
        endNode.y + oey,
        endNode.z + oez
      );

      // 3. STBの天端基準に合わせて端点をグローバルZにシフト（Zオフセットが指定されていない場合のみ）
      const sectionHeight =
        ProfileBasedBeamGenerator._getSectionHeight(sectionData);
      const hasZOffsets =
        (Number(beam?.offset_start_Z) || 0) !== 0 ||
        (Number(beam?.offset_end_Z) || 0) !== 0;
      if (
        sectionHeight &&
        isFinite(sectionHeight) &&
        sectionHeight > 0 &&
        !hasZOffsets
      ) {
        const topAlignShift = new THREE.Vector3(0, 0, -sectionHeight / 2);
        startAdjusted.add(topAlignShift);
        endAdjusted.add(topAlignShift);
      }

      // 4. 調整後の中心と方向・長さを再計算
      const center = new THREE.Vector3().lerpVectors(
        startAdjusted,
        endAdjusted,
        0.5
      );
      const direction = new THREE.Vector3()
        .subVectors(endAdjusted, startAdjusted)
        .normalize();
      const elementLength = startAdjusted.distanceTo(endAdjusted);

      // 5. ジオメトリの中心を軸に配置（IFC標準準拠）
      mesh.position.copy(center);

      // 6. 梁の正確な配置と向き（Three.js座標系での中心配置）
      this._applyArchitecturalBeamOrientation(
        mesh,
        direction,
        sectionData,
        beam,
        elementLength
      );

      console.log(
        `Beam ${beam.id} precise placement (with offsets): center=${center
          .toArray()
          .map((v) => v.toFixed(1))}, ` +
          `length=${elementLength.toFixed(1)}mm, direction=${direction
            .toArray()
            .map((v) =>
              v.toFixed(3)
            )}, offsets(start=[${osx},${osy},${osz}], end=[${oex},${oey},${oez}])`
      );
    } catch (error) {
      console.error("Failed to apply precise placement:", error);
    }
  }

  /**
   * 建築座標系での梁配置（せい方向をZ方向に配置）
   * @private
   */
  static _applyArchitecturalBeamOrientation(
    mesh,
    direction,
    sectionData,
    beam,
    elementLength
  ) {
    const sectionType =
      (sectionData.section_type && sectionData.section_type.toUpperCase()) ||
      (sectionData.profile_type && sectionData.profile_type.toUpperCase()) ||
      "H";

    // 梁の回転角（JSON/STB由来）
    let rotationAngle = 0;
    if (beam?.geometry?.rotation) {
      rotationAngle = beam.geometry.rotation;
    } else if (beam?.angle) {
      rotationAngle = beam.angle;
    }

    // stb2Ifc の参照方向ロジックに合わせて、断面基底（X:幅, Y:せい, Z:梁軸）を構築
    // Z_local（梁軸）
    const zAxis = new THREE.Vector3().copy(direction).normalize();
    // X_local（幅方向）: [-dy, dx, 0]
    const xAxis = new THREE.Vector3(-zAxis.y, zAxis.x, 0);
    if (xAxis.lengthSq() < 1e-10) {
      // 垂直梁などで水平成分がない場合は既定のXを使用
      xAxis.set(1, 0, 0);
    } else {
      xAxis.normalize();
    }
    // Y_local（せい方向）
    const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
    // 直交再調整（数値誤差の抑制）
    xAxis.crossVectors(yAxis, zAxis).normalize();

    // 基底から回転行列/クォータニオンを作成
    const basis = new THREE.Matrix4();
    basis.makeBasis(xAxis, yAxis, zAxis);
    const quat = new THREE.Quaternion().setFromRotationMatrix(basis);
    mesh.quaternion.copy(quat);

    // 追加のロール（部材軸回り）
    if (rotationAngle) {
      const rollQ = new THREE.Quaternion();
      rollQ.setFromAxisAngle(zAxis, rotationAngle);
      mesh.quaternion.multiply(rollQ);
    }

    // 天端合わせは _applyPrecisePlacement 内で端点に適用済み（ここでは位置シフトしない）

    console.log(
      `Beam ${beam.id} orientation(basis): sectionType=${sectionType}, ` +
        `dir=[${direction
          .toArray()
          .map((v) => v.toFixed(3))
          .join(",")}], ` +
        `x=[${xAxis
          .toArray()
          .map((v) => v.toFixed(3))
          .join(",")}], ` +
        `y=[${yAxis
          .toArray()
          .map((v) => v.toFixed(3))
          .join(",")}], ` +
        `z=[${zAxis
          .toArray()
          .map((v) => v.toFixed(3))
          .join(",")}]`
    );
  }

  /**
   * 断面高さ（梁せい）を抽出
   * - H形鋼: overall_depth/height
   * - 矩形/RC/BOX: height または outer_height（height欠如時はwidthを高さとみなす）
   * - Cチャンネル: overall_depth/height/depth
   * - 円形/パイプ: 天端基準不要のため 0 を返す
   */
  static _getSectionHeight(sectionData) {
    if (!sectionData) return 0;
    const dims = sectionData.dimensions || sectionData;
    if (!dims) return 0;

    // 円形系は天端基準の概念が弱いので除外
    const type = (sectionData.section_type || sectionData.profile_type || "")
      .toString()
      .toUpperCase();
    if (type.includes("PIPE") || type.includes("CIRCLE")) return 0;

    const candidates = [
      dims.overall_depth,
      dims.height,
      dims.outer_height,
      dims.depth,
    ];
    for (const v of candidates) {
      if (typeof v === "number" && isFinite(v) && v > 0) return v;
    }
    if (
      typeof dims.width === "number" &&
      isFinite(dims.width) &&
      dims.width > 0
    ) {
      return dims.width; // 正方断面の推定
    }
    return 0;
  }
}

// デフォルトエクスポート用のレガシーインターフェース
export function createBeamMeshes(
  beamElements,
  nodes,
  beamSections,
  steelSections,
  elementType = "Beam",
  isJsonInput = false
) {
  return ProfileBasedBeamGenerator.createBeamMeshes(
    beamElements,
    nodes,
    beamSections,
    steelSections,
    elementType,
    isJsonInput
  );
}

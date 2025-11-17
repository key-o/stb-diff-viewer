/**
 * @fileoverview プロファイルベースブレース形状生成モジュール
 *
 * IFC変換と同じアプローチを使用したThree.jsブレース形状生成:
 * 1. プロファイル（断面）形状を作成
 * 2. Z軸方向に押し出して3Dジオメトリを生成
 * 3. 精密な配置と回転を適用
 *
 * STB2IFCのbrace_creator.pyと同じロジックを使用
 */

import * as THREE from "three";
import { materials } from "../rendering/materials.js";
import { MeshPositioner } from "./MeshPositioner.js";
import { IFCProfileFactory } from "./IFCProfileFactory.js";
import { ensureUnifiedSectionType } from "../../common/sectionTypeUtil.js";

/**
 * プロファイルベースのブレース形状生成
 */
export class ProfileBasedBraceGenerator {
  /**
   * ブレース要素からメッシュを作成
   * @param {Array} braceElements - ブレース要素配列
   * @param {Map<string, THREE.Vector3>} nodes - ノードマップ
   * @param {Map<string, Object>} braceSections - ブレース断面マップ
   * @param {Map<string, Object>} steelSections - 鋼材形状マップ
   * @param {string} elementType - 要素タイプ
   * @param {boolean} isJsonInput - JSON入力かどうか
   * @returns {Array<THREE.Mesh>} 生成されたメッシュ配列
   */
  static createBraceMeshes(
    braceElements,
    nodes,
    braceSections,
    steelSections,
    elementType = "Brace",
    isJsonInput = false
  ) {
    console.log(
      `ProfileBasedBraceGenerator: Creating ${braceElements.length} brace meshes`
    );
    const meshes = [];

    for (const brace of braceElements) {
      try {
        const mesh = this._createSingleBraceMesh(
          brace,
          nodes,
          braceSections,
          steelSections,
          elementType,
          isJsonInput
        );

        if (mesh) {
          meshes.push(mesh);
        }
      } catch (error) {
        console.error(`Error creating brace ${brace.id}:`, error);
      }
    }

    console.log(
      `ProfileBasedBraceGenerator: Generated ${meshes.length} brace meshes`
    );
    return meshes;
  }

  /**
   * 単一ブレースメッシュを作成
   * @private
   */
  static _createSingleBraceMesh(
    brace,
    nodes,
    braceSections,
    steelSections,
    elementType,
    isJsonInput
  ) {
    // 1. ノード位置の取得
    const nodePositions = this._getNodePositions(brace, nodes, isJsonInput);
    if (!nodePositions.startNode || !nodePositions.endNode) {
      console.warn(`Skipping brace ${brace.id}: Missing node data`);
      return null;
    }

    // 2. 断面データの取得
    const sectionData = ensureUnifiedSectionType(
      this._getSectionData(brace, braceSections, isJsonInput)
    );
    if (!sectionData) {
      console.warn(`Skipping brace ${brace.id}: Missing section data`);
      return null;
    }

    // 3. 長さ計算
    const length = nodePositions.startNode.distanceTo(nodePositions.endNode);
    if (length <= 0) {
      console.warn(`Skipping brace ${brace.id}: Invalid length ${length}`);
      return null;
    }

    console.log(
      `Creating brace ${brace.id}: length=${length.toFixed(
        1
      )}mm, section_type=${sectionData.section_type}`
    );

    // 4. プロファイル（断面）形状を作成
    const profile = this._createSectionProfile(sectionData, brace);
    if (!profile) {
      console.warn(`Skipping brace ${brace.id}: Failed to create profile`);
      return null;
    }

    // 5. 押し出しジオメトリを作成
    const geometry = this._createExtrudedGeometry(profile, length);
    if (!geometry) {
      console.warn(`Skipping brace ${brace.id}: Failed to create geometry`);
      return null;
    }

    // 6. メッシュを作成
    const mesh = new THREE.Mesh(geometry, materials.matchedMesh);

    // 7. 精密配置を適用（IFC方式）
    this._applyPrecisePlacement(
      mesh,
      nodePositions.startNode,
      nodePositions.endNode,
      sectionData,
      brace
    );

    // 8. 立体表示における配置基準線を追加
    this._attachPlacementAxisLine(
      mesh,
      nodePositions.startNode,
      nodePositions.endNode
    );

    // 9. メタデータを設定
    mesh.userData = {
      elementType: elementType,
      elementId: brace.id,
      isJsonInput: isJsonInput,
      braceData: brace,
      length: length,
      sectionType: sectionData.section_type,
      profileBased: true,
    };

    return mesh;
  }

  /**
   * ノード位置を取得
   * @private
   */
  static _getNodePositions(brace, nodes, isJsonInput) {
    if (isJsonInput) {
      // JSON形式：直接座標を使用
      const startPoint = brace.geometry?.start_point;
      const endPoint = brace.geometry?.end_point;

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
        startNode: nodes.get(brace.id_node_start),
        endNode: nodes.get(brace.id_node_end),
      };
    }
  }

  /**
   * 断面データを取得
   * @private
   */
  static _getSectionData(brace, braceSections, isJsonInput) {
    if (isJsonInput) {
      return brace.section;
    } else {
      return braceSections.get(brace.id_section);
    }
  }

  /**
   * 断面プロファイルを作成（IFC方式 - IFCProfileFactory使用）
   * @private
   */
  static _createSectionProfile(sectionData, brace) {
    let sectionType =
      (sectionData.section_type && sectionData.section_type.toUpperCase()) ||
      (sectionData.profile_type && sectionData.profile_type.toUpperCase()) ||
      "RECTANGLE";

    // "Unknown"タイプの場合、寸法情報から断面タイプを推定
    if (
      sectionType === "UNKNOWN" ||
      !sectionType ||
      sectionType === "RECTANGLE"
    ) {
      sectionType = this._inferSectionTypeFromDimensions(
        sectionData.dimensions
      );
    }

    console.log(
      `Creating IFC profile for brace ${brace.id}: section_type=${sectionType}`
    );
    console.log("Section data:", sectionData);

    try {
      // IFCProfileFactoryを使用してプロファイル作成（鋼材は steelShape を渡す）
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
          console.log(
            `IFC profile created successfully: ${ifcProfile.ProfileType}`
          );
          return threeJSProfile;
        }
      }
    } catch (error) {
      console.warn(
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
      return "RECTANGLE";
    }

    // 円形鋼管: outer_diameter または diameter が存在
    if (dimensions.outer_diameter || dimensions.diameter) {
      console.log("Inferred section type: PIPE (from diameter)");
      return "PIPE";
    }

    // 角形鋼管: outer_height + outer_width + wall_thickness
    if (
      dimensions.outer_height &&
      dimensions.outer_width &&
      dimensions.wall_thickness
    ) {
      console.log(
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
      console.log("Inferred section type: BOX (from width/height + thickness)");
      return "BOX";
    }

    // H形鋼: overall_depth + overall_width + web_thickness + flange_thickness
    if (
      dimensions.overall_depth &&
      dimensions.overall_width &&
      dimensions.web_thickness &&
      dimensions.flange_thickness
    ) {
      console.log("Inferred section type: H (from H-shape dimensions)");
      return "H";
    }

    // L形鋼: depth + width + thickness (flangeの概念がない)
    if (
      dimensions.depth &&
      dimensions.width &&
      dimensions.thickness &&
      !dimensions.overall_depth &&
      !dimensions.web_thickness
    ) {
      console.log("Inferred section type: L (from L-shape dimensions)");
      return "L";
    }

    // チャンネル形: overall_depth + flange_width + web_thickness + flange_thickness
    if (
      dimensions.overall_depth &&
      dimensions.flange_width &&
      dimensions.web_thickness &&
      dimensions.flange_thickness
    ) {
      console.log("Inferred section type: C (from Channel dimensions)");
      return "C";
    }

    // T形鋼: overall_depth + flange_width + web_thickness (T字の特徴)
    if (
      dimensions.overall_depth &&
      dimensions.flange_width &&
      dimensions.web_thickness &&
      !dimensions.overall_width
    ) {
      console.log("Inferred section type: T (from T-shape dimensions)");
      return "T";
    }

    // 円形断面: radius のみ
    if (
      dimensions.radius &&
      !dimensions.thickness &&
      !dimensions.wall_thickness
    ) {
      console.log("Inferred section type: CIRCLE (from radius only)");
      return "CIRCLE";
    }

    // デフォルト: 矩形断面
    console.log("Defaulted to section type: RECTANGLE");
    return "RECTANGLE";
  }

  /**
   * 手動プロファイル作成（フォールバック）
   * @private
   */
  static _createManualProfile(sectionData, sectionType) {
    switch (sectionType) {
      case "L":
        return this._createLShapeProfile(sectionData);

      case "H":
      case "I":
      case "IBEAM":
      case "H-SECTION":
        return this._createHShapeProfile(sectionData);

      case "BOX":
      case "BOX-SECTION":
      case "SQUARE-SECTION":
        return this._createBoxProfile(sectionData);

      case "PIPE":
      case "PIPE-SECTION":
      case "ROUND-SECTION":
        return this._createPipeProfile(sectionData);

      case "C":
      case "CHANNEL":
        return this._createChannelProfile(sectionData);

      case "T":
        return this._createTShapeProfile(sectionData);

      case "RECTANGLE":
      case "RECT":
        return this._createRectangleProfile(sectionData);

      case "CIRCLE":
        return this._createCircleProfile(sectionData);

      default:
        console.warn(
          `Unsupported section type: ${sectionType}, using rectangle`
        );
        return this._createRectangleProfile(sectionData);
    }
  }

  /**
   * L形プロファイル作成
   * @private
   */
  static _createLShapeProfile(sectionData) {
    const dimensions = sectionData.dimensions || sectionData;
    // IFC仕様に合わせた寸法パラメータ（STB2IFCと同じ）
    const depth = dimensions.overall_depth || dimensions.depth || 65.0;
    const width = dimensions.flange_width || dimensions.width || 65.0;
    const thickness = dimensions.web_thickness || dimensions.thickness || 6.0;

    const shape = new THREE.Shape();

    // L字形状を描画（IFC IfcLShapeProfileDef準拠）
    // 原点を左下角として、右方向にwidth、上方向にdepth
    shape.moveTo(0, 0);
    shape.lineTo(width, 0);
    shape.lineTo(width, thickness);
    shape.lineTo(thickness, thickness);
    shape.lineTo(thickness, depth);
    shape.lineTo(0, depth);
    shape.lineTo(0, 0);

    console.log(
      `L-Shape profile: depth=${depth}mm, width=${width}mm, thickness=${thickness}mm`
    );
    return shape;
  }

  /**
   * H形プロファイル作成
   * @private
   */
  static _createHShapeProfile(sectionData) {
    const dimensions = sectionData.dimensions || sectionData;
    const overallDepth =
      dimensions.overall_depth || dimensions.height || dimensions.A || 100.0;
    const overallWidth =
      dimensions.overall_width || dimensions.width || dimensions.B || 100.0;
    const webThickness = dimensions.web_thickness || dimensions.t1 || 6.0;
    const flangeThickness = dimensions.flange_thickness || dimensions.t2 || 8.0;

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
   * BOX形プロファイル作成
   * @private
   */
  static _createBoxProfile(sectionData) {
    const dimensions = sectionData.dimensions || sectionData;
    const width = dimensions.width || dimensions.outer_width || 100.0;
    const height = dimensions.height || dimensions.outer_height || width;
    const thickness = dimensions.wall_thickness || dimensions.thickness || 6.0;

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
      dimensions.diameter || dimensions.outer_diameter || dimensions.A || 100.0;
    const thickness =
      dimensions.thickness || dimensions.wall_thickness || dimensions.t || 5.0;

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
   * チャンネル形プロファイル作成
   * @private
   */
  static _createChannelProfile(sectionData) {
    const dimensions = sectionData.dimensions || sectionData;
    // IFC IfcCShapeProfileDef準拠パラメータ（STB2IFCと同じ）
    const depth = dimensions.overall_depth || dimensions.height || 250.0;
    const width = dimensions.flange_width || dimensions.width || 75.0;
    const wallThickness = dimensions.web_thickness || 4.5;
    const girth = dimensions.flange_thickness || 4.5;

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

    console.log(
      `Channel profile: depth=${depth}mm, width=${width}mm, wallThickness=${wallThickness}mm, girth=${girth}mm`
    );
    return shape;
  }

  /**
   * T形プロファイル作成
   * @private
   */
  static _createTShapeProfile(sectionData) {
    const dimensions = sectionData.dimensions || sectionData;
    // IFC IfcTShapeProfileDef準拠パラメータ（STB2IFCと同じ）
    const depth = dimensions.overall_depth || dimensions.height || 200.0;
    const flangeWidth = dimensions.flange_width || dimensions.width || 150.0;
    const webThickness = dimensions.web_thickness || 8.0;
    const flangeThickness = dimensions.flange_thickness || 12.0;

    const shape = new THREE.Shape();
    const halfWidth = flangeWidth / 2;
    const halfWeb = webThickness / 2;

    // T字形状を描画（IFC IfcTShapeProfileDef準拠）
    shape.moveTo(-halfWidth, 0);
    shape.lineTo(halfWidth, 0);
    shape.lineTo(halfWidth, flangeThickness);
    shape.lineTo(halfWeb, flangeThickness);
    shape.lineTo(halfWeb, depth);
    shape.lineTo(-halfWeb, depth);
    shape.lineTo(-halfWeb, flangeThickness);
    shape.lineTo(-halfWidth, flangeThickness);
    shape.lineTo(-halfWidth, 0);

    console.log(
      `T-Shape profile: depth=${depth}mm, flangeWidth=${flangeWidth}mm, webThickness=${webThickness}mm, flangeThickness=${flangeThickness}mm`
    );
    return shape;
  }

  /**
   * 矩形プロファイル作成
   * @private
   */
  static _createRectangleProfile(sectionData) {
    const dimensions = sectionData.dimensions || sectionData;
    const width = dimensions.width || 100.0;
    const height = dimensions.height || 100.0;

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
    const radius = dimensions.radius || (dimensions.diameter || 100.0) / 2;

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
  static _applyPrecisePlacement(mesh, startNode, endNode, sectionData, brace) {
    try {
      // 1. 中心点を計算
      const center = new THREE.Vector3().lerpVectors(startNode, endNode, 0.5);
      mesh.position.copy(center);

      // 2. 方向ベクトルを計算
      const direction = new THREE.Vector3()
        .subVectors(endNode, startNode)
        .normalize();

      // 3. IFC方式の回転を適用
      // ExtrudeGeometryはZ軸方向に押し出されているので、directionに向けて回転
      const quaternion = new THREE.Quaternion();
      quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
      mesh.quaternion.copy(quaternion);

      // 4. 断面固有の回転調整（必要に応じて）
      this._applySectionSpecificRotation(mesh, direction, sectionData);

      console.log(
        `Applied precise placement: center=${center
          .toArray()
          .map((v) => v.toFixed(1))}, ` +
          `direction=${direction.toArray().map((v) => v.toFixed(3))}`
      );
    } catch (error) {
      console.error("Failed to apply precise placement:", error);
    }
  }

  /**
   * 断面固有の回転調整
   * @private
   */
  static _applySectionSpecificRotation(mesh, direction, sectionData) {
    const sectionType =
      (sectionData.section_type && sectionData.section_type.toUpperCase()) ||
      (sectionData.profile_type && sectionData.profile_type.toUpperCase()) ||
      "RECTANGLE";

    console.log(
      `Brace section rotation: type=${sectionType}, element=${mesh.userData?.elementId}`
    );

    switch (sectionType) {
      case "H":
      case "I":
      case "H-SECTION":
        // H形鋼：デフォルトの向きを維持（π/2回転を削除）
        // プロファイルの標準的な向きが正しい場合が多い
        console.log(
          `H-section: No rotation applied for brace ${mesh.userData?.elementId}`
        );
        break;

      case "L":
        // L形鋼：正しい向きに調整（π/4回転を削除）
        // デフォルトのプロファイル向きを維持
        console.log(
          `L-section: No rotation applied for brace ${mesh.userData?.elementId}`
        );
        break;

      // 他の断面タイプは必要に応じて追加
      default:
        console.log(
          `Section type ${sectionType}: No specific rotation for brace ${mesh.userData?.elementId}`
        );
        break;
    }
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
      elementType: mesh.userData?.elementType || "Brace",
      elementId: mesh.userData?.elementId,
      modelSource: "solid",
    };
    // 親メッシュの変換に追随させる（ローカル座標で一致させる）
    line.matrixAutoUpdate = true;
    mesh.add(line);
  }
}

// デフォルトエクスポート用のレガシーインターフェース
export function createBraceMeshes(
  braceElements,
  nodes,
  braceSections,
  steelSections,
  elementType = "Brace",
  isJsonInput = false
) {
  return ProfileBasedBraceGenerator.createBraceMeshes(
    braceElements,
    nodes,
    braceSections,
    steelSections,
    elementType,
    isJsonInput
  );
}

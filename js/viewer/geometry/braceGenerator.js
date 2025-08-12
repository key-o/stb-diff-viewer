/**
 * @fileoverview ブレース形状生成モジュール
 *
 * このファイルは、STBデータに基づいてブレースの3D形状を生成します:
 * - 鉄骨ブレースの形状生成（H形鋼、L形鋼、Pipe、T形鋼など）
 * - RC/SRCブレースの形状生成
 * - 断面情報に基づく正確な形状表現
 * - メッシュの位置・回転の調整
 *
 * STBの断面データから適切な3D形状を生成し、
 * 建築モデルのブレース要素を視覚的に表現します。
 */

import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";
import { materials } from "../rendering/materials.js";
import { SteelShapeFactory, ConcreteShapeFactory } from "./ShapeFactory.js";
import { MeshPositioner } from "./MeshPositioner.js";

/**
 * ブレース要素データに基づいてブレースのメッシュを作成する
 * @param {Array} braceElements - ブレース要素の配列
 * @param {Map<string, THREE.Vector3>|Object} nodes - 節点データのマップまたはJSON形式オブジェクト
 * @param {Map<string, Object>|Object} braceSections - ブレース断面データのマップまたはJSON形式
 * @param {Map<string, Object>|Object} steelSections - 鋼材形状データのマップまたはJSON形式
 * @param {string} [elementType="Brace"] - 要素タイプ識別子
 * @param {boolean} [isJsonInput=false] - JSON統合形式かどうか
 * @returns {Array<THREE.Mesh>} 作成されたブレースメッシュの配列
 */
export function createBraceMeshes(
  braceElements,
  nodes,
  braceSections,
  steelSections,
  elementType = "Brace",
  isJsonInput = false
) {
  const meshes = [];
  
  for (const brace of braceElements) {
    try {
      // ノード位置の取得（JSON形式と既存STB形式の両方に対応）
      const { startNode, endNode } = _getNodePositions(brace, nodes, isJsonInput);
      
      if (!startNode || !endNode) {
        console.warn(
          `Skipping ${elementType} ${brace.id}: Missing node data.`
        );
        continue;
      }

      // 断面データの取得
      const sectionData = _getSectionData(brace, braceSections, isJsonInput);
      
      if (!sectionData) {
        console.warn(
          `Skipping ${elementType} ${brace.id}: Missing section data.`
        );
        continue;
      }

      // ブレース幾何情報の計算
      const braceGeometry = _calculateBraceGeometry(startNode, endNode, brace);
      
      console.log(
        `${elementType} ${brace.id}: Creating brace - length=${braceGeometry.length.toFixed(1)}mm, angle=${braceGeometry.angle.toFixed(1)}°`
      );

      // 3Dジオメトリの生成
      let geometry = null;
      
      if (isJsonInput) {
        // JSON統合形式の処理
        geometry = _createBraceGeometryFromJson(brace, braceGeometry, sectionData);
      } else {
        // 既存STB形式の処理
        geometry = _createBraceGeometryFromStb(sectionData, braceGeometry, steelSections);
      }

      // デフォルトジオメトリの設定
      if (!geometry) {
        geometry = createDefaultBraceGeometry(100, braceGeometry.length);
        console.warn(
          `${elementType} ${brace.id}: Using default geometry.`
        );
      }

      // メッシュ生成
      const mesh = new THREE.Mesh(geometry, materials.matchedMesh);
      
      // ブレース特有のメッシュ配置処理
      _positionBraceMesh(mesh, startNode, endNode, braceGeometry, brace, isJsonInput);

      // メタデータの設定
      mesh.userData = {
        elementType: elementType,
        elementId: brace.id,
        isJsonInput: isJsonInput,
        braceData: brace,
        length: braceGeometry.length,
        angle: braceGeometry.angle
      };

      meshes.push(mesh);

    } catch (error) {
      console.error(`Error creating ${elementType} ${brace.id}:`, error);
      continue;
    }
  }

  console.log(`Generated ${meshes.length} brace meshes`);
  return meshes;
}

/**
 * 鋼材ブレースの形状を生成
 * @param {Object} steelShape - 鋼材形状データ
 * @param {number} length - ブレースの長さ
 * @returns {THREE.BufferGeometry|null} 生成されたジオメトリ
 */
function createSteelBraceGeometry(steelShape, length) {
  const shapeType = steelShape.shapeTypeAttr || steelShape.elementTag;
  
  switch (shapeType) {
    case "StbSecSteelH":
      return createHShapeBraceGeometry(steelShape, length);
    case "StbSecSteelL":
      return createLShapeBraceGeometry(steelShape, length);
    case "StbSecSteelPipe":
      return createPipeShapeBraceGeometry(steelShape, length);
    case "StbSecSteelT":
      return createTShapeBraceGeometry(steelShape, length);
    case "StbSecSteelC":
      return createCShapeBraceGeometry(steelShape, length);
    case "StbSecSteelBox":
      return createBoxShapeBraceGeometry(steelShape, length);
    default:
      console.warn(`Unsupported steel shape type for brace: ${shapeType}`);
      return createDefaultBraceGeometry(100, length); // 100mm角のデフォルト形状
  }
}

/**
 * RC/SRCブレースの形状を生成
 * @param {Object} sectionData - 断面データ
 * @param {number} length - ブレースの長さ
 * @returns {THREE.BufferGeometry} 生成されたジオメトリ
 */
function createConcreteBraceGeometry(sectionData, length) {
  // RC/SRCブレースは通常矩形断面
  const width = parseFloat(sectionData.width_x) || 300;
  const height = parseFloat(sectionData.width_y) || 300;
  
  return new THREE.BoxGeometry(width, length, height);
}

/**
 * H形鋼ブレースの形状を生成
 * @param {Object} steelShape - H形鋼データ
 * @param {number} length - 長さ
 * @returns {THREE.BufferGeometry|null} 生成されたジオメトリ
 */
function createHShapeBraceGeometry(steelShape, length) {
  const shape = SteelShapeFactory.createHShape(steelShape);
  if (!shape) return null;
  
  const extrudeSettings = {
    depth: length,
    bevelEnabled: false,
  };
  
  return new THREE.ExtrudeGeometry(shape, extrudeSettings);
}

/**
 * L形鋼ブレースの形状を生成
 * @param {Object} steelShape - L形鋼データ
 * @param {number} length - 長さ
 * @returns {THREE.BufferGeometry|null} 生成されたジオメトリ
 */
function createLShapeBraceGeometry(steelShape, length) {
  const shape = SteelShapeFactory.createLShape(steelShape);
  if (!shape) return null;
  
  const extrudeSettings = {
    depth: length,
    bevelEnabled: false,
  };
  
  return new THREE.ExtrudeGeometry(shape, extrudeSettings);
}

/**
 * パイプ形鋼ブレースの形状を生成
 * @param {Object} steelShape - パイプ形鋼データ
 * @param {number} length - 長さ
 * @returns {THREE.BufferGeometry|null} 生成されたジオメトリ
 */
function createPipeShapeBraceGeometry(steelShape, length) {
  const outerRadius = parseFloat(steelShape.A) / 2; // 外径の半径
  const thickness = parseFloat(steelShape.t);
  const innerRadius = outerRadius - thickness;
  
  if (isNaN(outerRadius) || isNaN(thickness) || innerRadius <= 0) {
    console.warn("Invalid pipe parameters for brace");
    return null;
  }
  
  // CylinderGeometryを作成し、すぐにZ軸方向に回転させて一貫性を保つ
  const outerGeometry = new THREE.CylinderGeometry(outerRadius, outerRadius, length, 16);
  const innerGeometry = new THREE.CylinderGeometry(innerRadius, innerRadius, length + 1, 16);
  
  // ジオメトリをX軸回り-90度回転させて、Z軸を長軸にする（IFC標準準拠）
  outerGeometry.rotateX(-Math.PI / 2);
  
  // CSG操作の代わりに簡略化（実際の実装ではCSGライブラリを使用）
  return outerGeometry;
}

/**
 * T形鋼ブレースの形状を生成
 * @param {Object} steelShape - T形鋼データ
 * @param {number} length - 長さ
 * @returns {THREE.BufferGeometry|null} 生成されたジオメトリ
 */
function createTShapeBraceGeometry(steelShape, length) {
  const shape = SteelShapeFactory.createTShape(steelShape);
  if (!shape) return null;
  
  const extrudeSettings = {
    depth: length,
    bevelEnabled: false,
  };
  
  return new THREE.ExtrudeGeometry(shape, extrudeSettings);
}

/**
 * C形鋼ブレースの形状を生成
 * @param {Object} steelShape - C形鋼データ
 * @param {number} length - 長さ
 * @returns {THREE.BufferGeometry|null} 生成されたジオメトリ
 */
function createCShapeBraceGeometry(steelShape, length) {
  const shape = SteelShapeFactory.createCShape(steelShape);
  if (!shape) return null;
  
  const extrudeSettings = {
    depth: length,
    bevelEnabled: false,
  };
  
  return new THREE.ExtrudeGeometry(shape, extrudeSettings);
}

/**
 * BOX形鋼ブレースの形状を生成
 * @param {Object} steelShape - BOX形鋼データ
 * @param {number} length - 長さ
 * @returns {THREE.BufferGeometry|null} 生成されたジオメトリ
 */
function createBoxShapeBraceGeometry(steelShape, length) {
  const width = parseFloat(steelShape.A);
  const height = parseFloat(steelShape.B);
  
  if (isNaN(width) || isNaN(height)) {
    console.warn("Invalid box parameters for brace");
    return null;
  }
  
  return new THREE.BoxGeometry(width, length, height);
}

/**
 * デフォルトブレース形状を生成
 * @param {number} size - 断面サイズ
 * @param {number} length - 長さ
 * @returns {THREE.BufferGeometry} デフォルトのボックス形状
 */
function createDefaultBraceGeometry(size, length) {
  return new THREE.BoxGeometry(size, length, size);
}

// ===== JSON統合対応のためのヘルパー関数 =====

/**
 * ノード位置を取得（JSON/STB両形式対応）
 * @private
 */
function _getNodePositions(brace, nodes, isJsonInput) {
  if (isJsonInput) {
    // JSON統合形式：geometry内の座標を直接使用
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
        : new THREE.Vector3(endPoint.x, endPoint.y, endPoint.z)
    };
  } else {
    // 既存STB形式：ノードIDから座標を取得
    return {
      startNode: nodes.get(brace.id_node_start),
      endNode: nodes.get(brace.id_node_end)
    };
  }
}

/**
 * 断面データを取得（JSON/STB両形式対応）
 * @private
 */
function _getSectionData(brace, sections, isJsonInput) {
  if (isJsonInput) {
    // JSON統合形式：要素内の断面データを直接使用
    return brace.section || null;
  } else {
    // 既存STB形式：断面IDから断面データを取得
    return sections.get(brace.id_section) || null;
  }
}

/**
 * ブレースの幾何情報を計算
 * @private
 */
function _calculateBraceGeometry(startNode, endNode, brace) {
  const elementVector = new THREE.Vector3().subVectors(endNode, startNode);
  const length = elementVector.length();
  
  // 水平面からの角度を計算（ブレース特有）
  const horizontalLength = Math.sqrt(elementVector.x ** 2 + elementVector.y ** 2);
  const angle = horizontalLength > 0 ? Math.atan(elementVector.z / horizontalLength) * (180 / Math.PI) : 0;
  
  return {
    vector: elementVector,
    length: length,
    angle: angle, // 度単位
    direction: elementVector.clone().normalize()
  };
}

/**
 * JSON統合形式からブレースジオメトリを生成
 * @private
 */
function _createBraceGeometryFromJson(brace, braceGeometry, sectionData) {
  const profileType = sectionData.profile_type;
  const dimensions = sectionData.dimensions;
  
  console.log(
    `Brace ${brace.id}: JSON profile_type='${profileType}', dimensions:`,
    dimensions
  );

  switch (profileType) {
    case "Pipe-Section":
      return _createJsonPipeBraceGeometry(dimensions, braceGeometry.length);
      
    case "Box-Section":
    case "Square-Section":
      return _createJsonBoxBraceGeometry(dimensions, braceGeometry.length);
      
    case "L-Section":
      return _createJsonLShapeBraceGeometry(dimensions, braceGeometry.length);
      
    case "H-Section":
      return _createJsonHShapeBraceGeometry(dimensions, braceGeometry.length);
      
    case "Round-Section":
      return _createJsonRoundBraceGeometry(dimensions, braceGeometry.length);
      
    default:
      console.warn(`Brace ${brace.id}: Unsupported JSON profile type '${profileType}'`);
      return null;
  }
}

/**
 * 既存STB形式からブレースジオメトリを生成
 * @private
 */
function _createBraceGeometryFromStb(sectionData, braceGeometry, steelSections) {
  // 断面種類に応じて形状を生成
  if (sectionData.shape_type === "S") {
    // 鋼材断面
    const steelShape = steelSections.get(sectionData.pos);
    if (steelShape) {
      return createSteelBraceGeometry(steelShape, braceGeometry.length);
    }
  } else if (sectionData.shape_type === "RC" || sectionData.shape_type === "SRC") {
    // RC/SRC断面
    return createConcreteBraceGeometry(sectionData, braceGeometry.length);
  }
  
  return null;
}

/**
 * JSON形式パイプ断面ブレースの生成
 * @private
 */
function _createJsonPipeBraceGeometry(dimensions, length) {
  const diameter = dimensions.diameter || dimensions.outer_diameter || 100;
  const thickness = dimensions.thickness || dimensions.wall_thickness || 5;
  
  const outerRadius = diameter / 2;
  const innerRadius = Math.max(0, outerRadius - thickness);
  
  // パイプ形状の生成（簡易版：外径のみ）
  const geometry = new THREE.CylinderGeometry(outerRadius, outerRadius, length, 16);
  
  // X軸回り-90度回転してZ軸を長軸にする（STB形式と統一）
  geometry.rotateX(-Math.PI / 2);
  
  console.log(`JSON Pipe brace: diameter=${diameter}mm, thickness=${thickness}mm`);
  
  return geometry;
}

/**
 * JSON形式角形鋼管断面ブレースの生成
 * @private
 */
function _createJsonBoxBraceGeometry(dimensions, length) {
  const width = dimensions.width || dimensions.side_length || 100;
  const height = dimensions.height || width;
  
  const geometry = new THREE.BoxGeometry(width, height, length);
  
  console.log(`JSON Box brace: width=${width}mm, height=${height}mm`);
  
  return geometry;
}

/**
 * JSON形式L形鋼断面ブレースの生成
 * @private
 */
function _createJsonLShapeBraceGeometry(dimensions, length) {
  const width = dimensions.width || dimensions.leg_length || 75;
  const height = dimensions.height || width;
  const thickness = dimensions.thickness || 6;
  
  // L形鋼プロファイルの作成
  const shape = new THREE.Shape();
  
  // L字形状を描画
  shape.moveTo(-width/2, -height/2);
  shape.lineTo(width/2, -height/2);
  shape.lineTo(width/2, -height/2 + thickness);
  shape.lineTo(-width/2 + thickness, -height/2 + thickness);
  shape.lineTo(-width/2 + thickness, height/2);
  shape.lineTo(-width/2, height/2);
  shape.closePath();
  
  const extrudeSettings = {
    depth: length,
    bevelEnabled: false
  };
  
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  
  console.log(`JSON L-Shape brace: width=${width}mm, height=${height}mm, thickness=${thickness}mm`);
  
  return geometry;
}

/**
 * JSON形式H形鋼断面ブレースの生成
 * @private
 */
function _createJsonHShapeBraceGeometry(dimensions, length) {
  const overall_depth = dimensions.overall_depth || dimensions.height || 200;
  const overall_width = dimensions.overall_width || dimensions.width || 100;
  const web_thickness = dimensions.web_thickness || 7;
  const flange_thickness = dimensions.flange_thickness || 11;
  
  // H形鋼プロファイルの作成
  const shape = new THREE.Shape();
  
  const halfWidth = overall_width / 2;
  const halfHeight = overall_depth / 2;
  const halfWeb = web_thickness / 2;
  
  // H字形状を描画
  shape.moveTo(-halfWidth, -halfHeight);
  shape.lineTo(halfWidth, -halfHeight);
  shape.lineTo(halfWidth, -halfHeight + flange_thickness);
  shape.lineTo(halfWeb, -halfHeight + flange_thickness);
  shape.lineTo(halfWeb, halfHeight - flange_thickness);
  shape.lineTo(halfWidth, halfHeight - flange_thickness);
  shape.lineTo(halfWidth, halfHeight);
  shape.lineTo(-halfWidth, halfHeight);
  shape.lineTo(-halfWidth, halfHeight - flange_thickness);
  shape.lineTo(-halfWeb, halfHeight - flange_thickness);
  shape.lineTo(-halfWeb, -halfHeight + flange_thickness);
  shape.lineTo(-halfWidth, -halfHeight + flange_thickness);
  shape.closePath();
  
  const extrudeSettings = {
    depth: length,
    bevelEnabled: false
  };
  
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  
  console.log(`JSON H-Shape brace: depth=${overall_depth}mm, width=${overall_width}mm`);
  
  return geometry;
}

/**
 * JSON形式円形断面ブレースの生成
 * @private
 */
function _createJsonRoundBraceGeometry(dimensions, length) {
  const diameter = dimensions.diameter || 50;
  const radius = diameter / 2;
  
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 16);
  
  // 90度回転（Z軸方向がデフォルトの長さ方向）
  geometry.rotateX(Math.PI / 2);
  
  console.log(`JSON Round brace: diameter=${diameter}mm`);
  
  return geometry;
}

/**
 * ブレースメッシュの配置処理
 * @private
 */
function _positionBraceMesh(mesh, startNode, endNode, braceGeometry, braceData, isJsonInput) {
  // オフセット情報の取得
  const offsets = isJsonInput ? 
    _getJsonOffsets(braceData) : 
    _getStbOffsets(braceData);

  // 断面寸法情報
  const sectionDimensions = isJsonInput ?
    _getJsonSectionDimensions(braceData) :
    _getStbSectionDimensions(braceData);

  // MeshPositionerを使用した統一配置処理
  MeshPositioner.positionLinearElement(
    mesh,
    startNode,
    endNode,
    mesh.geometry,
    {
      elementType: 'brace',
      coordinateSystem: 'architectural',
      rollAngle: braceData.geometry?.rotation || 0,
      offsets: offsets,
      sectionDimensions: sectionDimensions
    }
  );
}

/**
 * JSON形式のオフセット取得
 * @private
 */
function _getJsonOffsets(braceData) {
  const structuralInfo = braceData.structural_info || {};
  return {
    start_X: structuralInfo.start_offset_x || 0,
    start_Y: structuralInfo.start_offset_y || 0,
    start_Z: structuralInfo.start_offset_z || 0,
    end_X: structuralInfo.end_offset_x || 0,
    end_Y: structuralInfo.end_offset_y || 0,
    end_Z: structuralInfo.end_offset_z || 0
  };
}

/**
 * STB形式のオフセット取得
 * @private
 */
function _getStbOffsets(braceData) {
  return {
    start_X: braceData.offset_start_X || 0,
    start_Y: braceData.offset_start_Y || 0,
    start_Z: braceData.offset_start_Z || 0,
    end_X: braceData.offset_end_X || 0,
    end_Y: braceData.offset_end_Y || 0,
    end_Z: braceData.offset_end_Z || 0
  };
}

/**
 * JSON形式の断面寸法取得
 * @private
 */
function _getJsonSectionDimensions(braceData) {
  const dimensions = braceData.section?.dimensions || {};
  return {
    height: dimensions.overall_depth || dimensions.height || dimensions.diameter || 0,
    width: dimensions.overall_width || dimensions.width || dimensions.diameter || 0
  };
}

/**
 * STB形式の断面寸法取得
 * @private
 */
function _getStbSectionDimensions(braceData) {
  return {
    height: 0,
    width: 0
  };
}

/**
 * ブレース要素のバリデーション（JSON統合対応）
 * @param {Object} braceData - ブレース要素データ
 * @param {boolean} isJsonInput - JSON形式かどうか
 * @returns {boolean} バリデーション結果
 */
export function validateBraceElement(braceData, isJsonInput = false) {
  if (!braceData || !braceData.id) {
    return false;
  }
  
  if (isJsonInput) {
    // JSON統合形式のバリデーション
    const geometry = braceData.geometry;
    if (!geometry || !geometry.start_point || !geometry.end_point) {
      return false;
    }
    
    const section = braceData.section;
    if (!section || !section.profile_type) {
      return false;
    }
  } else {
    // STB形式のバリデーション
    if (!braceData.id_node_start || !braceData.id_node_end || !braceData.id_section) {
      return false;
    }
  }
  
  return true;
}
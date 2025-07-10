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
 * @param {Map<string, THREE.Vector3>} nodes - 節点データのマップ
 * @param {Map<string, Object>} braceSections - ブレース断面データのマップ
 * @param {Map<string, Object>} steelSections - 鋼材形状データのマップ
 * @returns {Array<THREE.Mesh>} 作成されたブレースメッシュの配列
 */
export function createBraceMeshes(
  braceElements,
  nodes,
  braceSections,
  steelSections
) {
  const meshes = [];
  
  for (const brace of braceElements) {
    const start = nodes.get(brace.id_node_start);
    const end = nodes.get(brace.id_node_end);
    const sectionData = braceSections.get(brace.id_section);
    
    if (!start || !end || !sectionData) {
      console.warn(
        `Skipping Brace ${brace.id}: Missing node or section data.`
      );
      continue;
    }

    const length = start.distanceTo(end);
    let geometry = null;

    // 断面種類に応じて形状を生成
    if (sectionData.shape_type === "S") {
      // 鋼材断面
      const steelShape = steelSections.get(sectionData.pos);
      if (steelShape) {
        geometry = createSteelBraceGeometry(steelShape, length);
      }
    } else if (sectionData.shape_type === "RC" || sectionData.shape_type === "SRC") {
      // RC/SRC断面
      geometry = createConcreteBraceGeometry(sectionData, length);
    }

    if (!geometry) {
      console.warn(`Could not create geometry for Brace ${brace.id}`);
      continue;
    }

    // メッシュ作成
    const mesh = new THREE.Mesh(geometry, materials.steel);
    
    // 統一された配置ロジックを使用
    MeshPositioner.positionLinearElement(mesh, start, end, geometry, {
      elementType: 'brace',
      coordinateSystem: 'architectural'
    });

    // メタデータを設定
    mesh.userData = {
      elementType: "Brace",
      elementId: brace.id,
      sectionId: brace.id_section,
      startNodeId: brace.id_node_start,
      endNodeId: brace.id_node_end,
      length: length,
      steelGrade: brace.strength_concrete || "N/A",
    };

    meshes.push(mesh);
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
  
  const outerGeometry = new THREE.CylinderGeometry(outerRadius, outerRadius, length, 16);
  const innerGeometry = new THREE.CylinderGeometry(innerRadius, innerRadius, length + 1, 16);
  
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
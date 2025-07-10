/**
 * @fileoverview 柱形状生成モジュール
 *
 * このファイルは、STBデータに基づいて柱の3D形状を生成します:
 * - 鉄骨柱の形状生成（H形鋼、角形鋼管、円形鋼管など）
 * - RC柱の形状生成（矩形、円形）
 * - SRC柱の形状生成
 * - 断面情報に基づく正確な形状表現
 * - メッシュの位置・回転の調整
 *
 * STBの断面データから適切な3D形状を生成し、
 * 建築モデルの柱要素を視覚的に表現します。
 */

import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";
import { materials } from "../rendering/materials.js";
import { ShapeFactory } from "./ShapeFactory.js";
import { MeshPositioner } from "./MeshPositioner.js";

/**
 * 柱要素データに基づいて柱のメッシュを作成する
 * @param {Array} columnElements - 柱要素データの配列
 * @param {Map<string, THREE.Vector3>} nodes - 節点データのマップ (mm単位)
 * @param {Map<string, Object>} columnSections - 柱断面データのマップ
 * @param {Map<string, Object>} steelSections - 鋼材形状データのマップ (寸法はmm単位)
 * @returns {Array<THREE.Mesh>} 作成された柱メッシュの配列
 */
export function createColumnMeshes(
  columnElements,
  nodes,
  columnSections,
  steelSections
) {
  const meshes = [];

  for (const col of columnElements) {
    const bottomNode = nodes.get(col.id_node_bottom);
    const topNode = nodes.get(col.id_node_top);
    const sectionData = columnSections.get(col.id_section);

    if (col.id === 71 || col.id_section === 1 || col.id_section === "1") {
      console.log(
        `Column ${col.id}, Section ID ${col.id_section}: Retrieved sectionData:`,
        JSON.stringify(sectionData)
      );
    }

    if (!bottomNode || !topNode || !sectionData) {
      console.warn(`Skipping column ${col.id}: Missing node or section data.`);
      continue;
    }

    let geometry = null;
    const length = bottomNode.distanceTo(topNode);

    // 断面情報に基づいてジオメトリを作成
    if (sectionData.shapeName && steelSections.has(sectionData.shapeName)) {
      console.log(
        `Column ${col.id}: Trying Steel Section logic for shapeName: ${sectionData.shapeName}`
      );
      const steelShape = steelSections.get(sectionData.shapeName);
      console.log(
        `Column ${col.id}: Steel Shape Data:`,
        JSON.stringify(steelShape)
      );

      // ShapeFactoryを使用して鋼材形状を生成
      geometry = ShapeFactory.createSteelShape(steelShape, length, 'center');
      
      if (geometry) {
        console.log(`Column ${col.id}: Successfully created steel shape using ShapeFactory`);
      } else {
        console.warn(`Column ${col.id}: Failed to create steel shape, using default`);
        geometry = ShapeFactory.createDefaultShape(length, 'center');
      }
    } else if (sectionData.concreteShapeData) {
      console.log(`Column ${col.id}: Trying Concrete Section logic.`);
      const concreteShape = sectionData.concreteShapeData;
      console.log(
        `Column ${col.id}: Concrete Shape Data:`,
        JSON.stringify(concreteShape)
      );

      // ShapeFactoryを使用してコンクリート形状を生成
      geometry = ShapeFactory.createConcreteShape(concreteShape, length, 'center');
      
      if (geometry) {
        console.log(`Column ${col.id}: Successfully created concrete shape using ShapeFactory`);
      } else {
        console.warn(`Column ${col.id}: Failed to create concrete shape, using default`);
        geometry = ShapeFactory.createDefaultShape(length, 'center');
      }
    } else {
      console.log(
        `Column ${col.id}, Section ID ${col.id_section}: sectionData lacks both shapeName and concreteShapeData.`
      );
    }

    // デフォルトジオメトリ (もし上記で作成されなかった場合)
    if (!geometry) {
      geometry = ShapeFactory.createDefaultShape(length, 'center');
      console.warn(
        `Column ${col.id}: Using default geometry for section ${col.id_section}.`
      );
    }

    // メッシュ作成と配置
    const material = materials.matchedMesh;
    const mesh = new THREE.Mesh(geometry, material);

    // 統一された配置ロジックを使用
    MeshPositioner.positionLinearElement(mesh, bottomNode, topNode, geometry, {
      elementType: 'column',
      coordinateSystem: 'architectural'
    });

    // ユーザーデータを追加 (クリック時の情報表示用)
    mesh.userData = {
      elementType: "Column",
      elementId: col.id,
      modelSource: "A",
      stbElementId: col.id,
    };

    meshes.push(mesh);
  }

  return meshes;
}
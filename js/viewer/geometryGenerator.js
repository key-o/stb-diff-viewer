import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";
import { materials } from "./rendering/materials.js";
import { ShapeFactory } from "./geometry/ShapeFactory.js";
import { createBraceMeshes } from "./geometry/braceGenerator.js";

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
    const direction = new THREE.Vector3()
      .subVectors(topNode, bottomNode)
      .normalize();

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

    // メッシュの位置と向きを調整（統一された配置ロジック）
    mesh.position.copy(bottomNode).lerp(topNode, 0.5); // 線分の中点に配置
    
    if (geometry instanceof THREE.CylinderGeometry) {
      // CylinderGeometryはデフォルトでY軸に沿って伸びる
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    } else if (geometry instanceof THREE.ExtrudeGeometry) {
      // ExtrudeGeometryはZ軸に沿って伸びるが、H形鋼をZ軸方向にI型にするため追加回転が必要
      // まずZ軸を部材軸に合わせる
      const quaternion1 = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1), 
        direction
      );
      // 次にX軸回りに90度回転してH形をZ軸方向にI型にする
      const quaternion2 = new THREE.Quaternion().setFromAxisAngle(
        direction, 
        Math.PI / 2
      );
      mesh.quaternion.multiplyQuaternions(quaternion2, quaternion1);
    } else {
      // BoxGeometryはZ軸に沿って伸びる
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    }

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

// Re-export createBraceMeshes for easy access
export { createBraceMeshes };
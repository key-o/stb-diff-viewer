/**
 * @fileoverview 梁形状生成モジュール
 *
 * このファイルは、STBデータに基づいて梁の3D形状を生成します:
 * - 鉄骨梁の形状生成（H形鋼、溝形鋼、T形鋼など）
 * - RC梁の形状生成
 * - 断面情報に基づく正確な形状表現
 * - 大梁・小梁の形状生成
 * - メッシュの位置・回転の調整
 *
 * STBの断面データから適切な3D形状を生成し、
 * 建築モデルの梁要素を視覚的に表現します。
 */

import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";
import { materials } from "../rendering/materials.js";
import { ShapeFactory } from "./ShapeFactory.js";
import { MeshPositioner } from "./MeshPositioner.js";

/**
 * 梁要素データに基づいて梁のメッシュを作成する
 * @param {Array} beamElements - 大梁または小梁の要素配列
 * @param {Map<string, THREE.Vector3>} nodes - 節点データのマップ
 * @param {Map<string, Object>} beamSections - 梁断面データのマップ
 * @param {Map<string, Object>} steelSections - 鋼材形状データのマップ
 * @param {string} elementType - "Girder"または"Beam"
 * @returns {Array<THREE.Mesh>} 作成された梁メッシュの配列
 */
export function createBeamMeshes(
  beamElements,
  nodes,
  beamSections,
  steelSections,
  elementType
) {
  const meshes = [];

  for (const bm of beamElements) {
    const start = nodes.get(bm.id_node_start);
    const end = nodes.get(bm.id_node_end);
    const sectionData = beamSections.get(bm.id_section);

    if (!start || !end || !sectionData) {
      console.warn(
        `Skipping ${elementType} ${bm.id}: Missing node or section data.`
      );
      continue;
    }

    const length = start.distanceTo(end);
    let geometry = null;

    // 鋼材断面の処理
    if (sectionData.shapeName && steelSections.has(sectionData.shapeName)) {
      const steelShape = steelSections.get(sectionData.shapeName);

      console.log(
        `${elementType} ${bm.id}: shapeName='${sectionData.shapeName}', steelShape data:`,
        steelShape
      );

      // ShapeFactoryを使用して鋼材形状を生成（梁は上端中心基準）
      geometry = ShapeFactory.createSteelShape(
        steelShape,
        length,
        "top-center"
      );

      if (geometry) {
        console.log(
          `${elementType} ${bm.id}: Successfully created steel shape using ShapeFactory`
        );
      } else {
        console.warn(
          `${elementType} ${bm.id}: Failed to create steel shape, using default`
        );
        geometry = ShapeFactory.createDefaultShape(length, "top-center");
      }
    }
    // RC断面の処理
    else if (
      sectionData.sectionType === "StbSecBeam_RC" &&
      sectionData.concreteShapeData &&
      sectionData.concreteShapeData.type === "StbSecBeam_RC_Straight"
    ) {
      console.log(`${elementType} ${bm.id}: Trying RC beam section`);

      // ShapeFactoryを使用してRC梁形状を生成
      geometry = ShapeFactory.createConcreteShape(
        sectionData.concreteShapeData,
        length,
        "top-center"
      );

      if (geometry) {
        console.log(
          `${elementType} ${bm.id}: Successfully created RC shape using ShapeFactory`
        );
      } else {
        console.warn(
          `${elementType} ${bm.id}: Failed to create RC shape, using default`
        );
        geometry = ShapeFactory.createDefaultShape(length, "top-center");
      }
    }
    // その他の断面タイプ
    else {
      console.log(
        `${elementType} ${bm.id}, Section ID ${bm.id_section}: Unsupported section type or missing data. sectionData:`,
        sectionData
      );
    }

    // デフォルトジオメトリ
    if (!geometry) {
      geometry = ShapeFactory.createDefaultShape(length, "top-center");
      console.warn(
        `${elementType} ${bm.id}: Using default geometry for section ${bm.id_section}.`
      );
    }

    // メッシュ生成と配置
    const mesh = new THREE.Mesh(geometry, materials.matchedMesh);

    // オフセット情報を取得
    const offsets = {
      start_X: bm.offset_start_X,
      start_Y: bm.offset_start_Y,
      start_Z: bm.offset_start_Z,
      end_X: bm.offset_end_X,
      end_Y: bm.offset_end_Y,
      end_Z: bm.offset_end_Z,
    };

    // 断面寸法情報を取得（梁高さ調整用）
    let sectionDimensions = { height: 0, width: 0 };

    // 鋼材断面の場合は steelSections から寸法を取得
    if (sectionData.shapeName && steelSections.has(sectionData.shapeName)) {
      const steelShape = steelSections.get(sectionData.shapeName);
      sectionDimensions = {
        height: parseFloat(steelShape.A) || parseFloat(steelShape.H) || 0, // H型鋼：A, リップ溝型：H
        width: parseFloat(steelShape.B) || 0,
      };

      // デバッグ用ログ
      console.log(
        `${elementType} ${bm.id}: Steel section dimensions - height=${sectionDimensions.height}mm, width=${sectionDimensions.width}mm`
      );
    }
    // RC断面の場合
    else if (sectionData.H || sectionData.height) {
      sectionDimensions = {
        height:
          parseFloat(sectionData.H) || parseFloat(sectionData.height) || 0,
        width: parseFloat(sectionData.B) || parseFloat(sectionData.width) || 0,
      };
    }

    // 統一された配置ロジックを使用
    MeshPositioner.positionLinearElement(mesh, start, end, geometry, {
      elementType: "beam",
      coordinateSystem: "architectural",
      offsets: offsets,
      sectionDimensions: sectionDimensions,
    });

    mesh.userData = {
      elementType: elementType,
      elementId: bm.id,
      modelSource: "A",
      stbElementId: bm.id,
    };

    meshes.push(mesh);
  }

  return meshes;
}

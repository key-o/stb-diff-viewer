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
import { ProfileBasedColumnGenerator } from "./ProfileBasedColumnGenerator.js";

/**
 * 柱要素データに基づいて柱のメッシュを作成する
 * @param {Array} columnElements - 柱要素データの配列
 * @param {Map<string, THREE.Vector3>|Object} nodes - 節点データのマップまたはJSON形式オブジェクト (mm単位)
 * @param {Map<string, Object>|Object} columnSections - 柱断面データのマップまたはJSON形式
 * @param {Map<string, Object>|Object} steelSections - 鋼材形状データのマップまたはJSON形式 (寸法はmm単位)
 * @param {string} [elementType="Column"] - 要素タイプ識別子
 * @param {boolean} [isJsonInput=false] - JSON統合形式かどうか
 * @returns {Array<THREE.Mesh>} 作成された柱メッシュの配列
 */
export function createColumnMeshes(
  columnElements,
  nodes,
  columnSections,
  steelSections,
  elementType = "Column",
  isJsonInput = false
) {
  console.log(`columnGenerator: Creating ${columnElements.length} column meshes (Profile-based enhanced)`);
  
  // ProfileBased実装を直接使用
  return ProfileBasedColumnGenerator.createColumnMeshes(
    columnElements,
    nodes,
    columnSections,
    steelSections,
    elementType,
    isJsonInput
  );

}


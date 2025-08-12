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
import { ProfileBasedBeamGenerator } from "./ProfileBasedBeamGenerator.js";

/**
 * 梁要素データに基づいて梁のメッシュを作成する
 * @param {Array} beamElements - 大梁または小梁の要素配列
 * @param {Map<string, THREE.Vector3>|Object} nodes - 節点データのマップまたはJSON形式オブジェクト
 * @param {Map<string, Object>|Object} beamSections - 梁断面データのマップまたはJSON形式
 * @param {Map<string, Object>|Object} steelSections - 鋼材形状データのマップまたはJSON形式
 * @param {string} elementType - "Girder"または"Beam"または"梁"
 * @param {boolean} [isJsonInput=false] - JSON統合形式かどうか
 * @returns {Array<THREE.Mesh>} 作成された梁メッシュの配列
 */
export function createBeamMeshes(
  beamElements,
  nodes,
  beamSections,
  steelSections,
  elementType,
  isJsonInput = false
) {
  console.log(`beamGenerator: Creating ${beamElements.length} beam meshes (Profile-based enhanced)`);
  
  // ProfileBased実装を直接使用
  return ProfileBasedBeamGenerator.createBeamMeshes(
    beamElements,
    nodes,
    beamSections,
    steelSections,
    elementType,
    isJsonInput
  );

}



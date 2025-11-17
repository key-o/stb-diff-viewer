/**
 * @fileoverview Three.js変換ユーティリティ
 *
 * Pure JavaScriptのプロファイルデータをThree.jsの形状に変換します。
 * ProfileCalculatorとGeometryCalculatorの計算結果を、
 * THREE.Shape、THREE.ExtrudeGeometry、THREE.Meshに変換する責務を持ちます。
 *
 * @module ThreeJSConverter
 */

import * as THREE from "three";

/**
 * プロファイルデータをTHREE.Shapeに変換
 *
 * @param {Object} profileData - ProfileCalculatorが生成したプロファイルデータ
 * @param {Array<{x: number, y: number}>} profileData.vertices - 外形頂点座標
 * @param {Array<Array<{x: number, y: number}>>} profileData.holes - 穴の頂点座標
 * @param {Object} profileData._meta - メタデータ（オプション）
 * @returns {THREE.Shape} Three.jsのShape
 */
export function convertProfileToThreeShape(profileData) {
  if (!profileData || !profileData.vertices || profileData.vertices.length < 3) {
    throw new Error("Invalid profile data: vertices must have at least 3 points");
  }

  // 円形プロファイルの場合は特別処理
  if (profileData._meta && profileData._meta.type === "circular") {
    return createCircularShape(profileData);
  }

  // 通常のプロファイル変換
  const shape = new THREE.Shape();

  // 外形を描画
  const vertices = profileData.vertices;
  shape.moveTo(vertices[0].x, vertices[0].y);

  for (let i = 1; i < vertices.length; i++) {
    shape.lineTo(vertices[i].x, vertices[i].y);
  }

  shape.closePath();

  // 穴を追加
  if (profileData.holes && profileData.holes.length > 0) {
    for (const holeVertices of profileData.holes) {
      if (holeVertices.length < 3) continue;

      const hole = new THREE.Path();
      hole.moveTo(holeVertices[0].x, holeVertices[0].y);

      for (let i = 1; i < holeVertices.length; i++) {
        hole.lineTo(holeVertices[i].x, holeVertices[i].y);
      }

      hole.closePath();
      shape.holes.push(hole);
    }
  }

  return shape;
}

/**
 * 円形プロファイルをTHREE.Shapeに変換（absarcを使用）
 *
 * @param {Object} profileData - 円形プロファイルデータ
 * @returns {THREE.Shape} Three.jsのShape
 * @private
 */
function createCircularShape(profileData) {
  const shape = new THREE.Shape();
  const meta = profileData._meta;

  if (meta.outerRadius) {
    // PIPE形（中空円）
    shape.absarc(0, 0, meta.outerRadius, 0, Math.PI * 2, false);

    if (meta.innerRadius > 0) {
      const hole = new THREE.Path();
      hole.absarc(0, 0, meta.innerRadius, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
  } else if (meta.radius) {
    // 円形（中実円）
    shape.absarc(0, 0, meta.radius, 0, Math.PI * 2, false);
  }

  return shape;
}

/**
 * THREE.Shapeから押し出しジオメトリを作成
 *
 * @param {THREE.Shape} shape - プロファイル形状
 * @param {number} length - 押し出し長さ
 * @param {Object} options - オプション
 * @param {boolean} options.centerZ - Z軸中心に配置するか（デフォルト: true）
 * @returns {THREE.ExtrudeGeometry} 押し出しジオメトリ
 */
export function createExtrudeGeometry(shape, length, { centerZ = true } = {}) {
  const extrudeSettings = {
    depth: length,
    bevelEnabled: false,
    steps: 1,
    UVGenerator: THREE.ExtrudeGeometry.WorldUVGenerator,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

  // Z軸中心に配置
  if (centerZ) {
    geometry.translate(0, 0, -length / 2);
  }

  return geometry;
}

/**
 * Plain ObjectのVector3をTHREE.Vector3に変換
 *
 * @param {Object} vector - Plain Objectのベクトル {x, y, z}
 * @returns {THREE.Vector3} Three.jsのVector3
 */
export function convertToThreeVector3(vector) {
  return new THREE.Vector3(vector.x, vector.y, vector.z);
}

/**
 * Plain ObjectのQuaternionをTHREE.Quaternionに変換
 *
 * @param {Object} quaternion - Plain Objectの四元数 {x, y, z, w}
 * @returns {THREE.Quaternion} Three.jsのQuaternion
 */
export function convertToThreeQuaternion(quaternion) {
  return new THREE.Quaternion(
    quaternion.x,
    quaternion.y,
    quaternion.z,
    quaternion.w
  );
}

/**
 * 配置情報を適用してメッシュを配置
 *
 * @param {THREE.Mesh} mesh - Three.jsのメッシュ
 * @param {Object} placement - GeometryCalculatorが生成した配置情報
 * @param {Object} placement.center - 中心座標 {x, y, z}
 * @param {Object} placement.rotation - 回転四元数 {x, y, z, w}
 */
export function applyPlacementToMesh(mesh, placement) {
  // 位置を設定
  mesh.position.copy(convertToThreeVector3(placement.center));

  // 回転を設定
  mesh.quaternion.copy(convertToThreeQuaternion(placement.rotation));
}

/**
 * プロファイルデータとジオメトリ情報からメッシュを作成
 *
 * @param {Object} profileData - プロファイルデータ
 * @param {Object} placement - 配置情報
 * @param {THREE.Material} material - マテリアル
 * @param {Object} userData - メッシュに付与するユーザーデータ
 * @returns {THREE.Mesh} 生成されたメッシュ
 */
export function createMeshFromProfile(profileData, placement, material, userData = {}) {
  // プロファイルをTHREE.Shapeに変換
  const shape = convertProfileToThreeShape(profileData);

  // 押し出しジオメトリを作成
  const geometry = createExtrudeGeometry(shape, placement.length);

  // メッシュを作成
  const mesh = new THREE.Mesh(geometry, material);

  // 配置情報を適用
  applyPlacementToMesh(mesh, placement);

  // ユーザーデータを設定
  mesh.userData = {
    ...userData,
    length: placement.length,
    profileBased: true,
  };

  return mesh;
}

/**
 * 配置基準線をメッシュに添付
 *
 * @param {THREE.Mesh} mesh - 親メッシュ
 * @param {number} length - 線の長さ
 * @param {THREE.Material} lineMaterial - 線のマテリアル
 * @param {Object} userData - 線に付与するユーザーデータ
 */
export function attachPlacementAxisLine(mesh, length, lineMaterial, userData = {}) {
  if (!length || !isFinite(length) || length <= 0) {
    return;
  }

  // メッシュのローカルZ軸に沿った線を作成
  const p0 = new THREE.Vector3(0, 0, -length / 2);
  const p1 = new THREE.Vector3(0, 0, length / 2);
  const geometry = new THREE.BufferGeometry().setFromPoints([p0, p1]);
  const line = new THREE.Line(geometry, lineMaterial);

  // ユーザーデータを設定
  line.userData = {
    isPlacementLine: true,
    ...userData,
  };

  line.matrixAutoUpdate = true;
  mesh.add(line);
}

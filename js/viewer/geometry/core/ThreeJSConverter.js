/**
 * @fileoverview Three.js変換ユーティリティ
 *
 * Pure JavaScriptのプロファイルデータをThree.jsの形状に変換します。
 * ProfileCalculatorとGeometryCalculatorの計算結果を、
 * THREE.Shape、THREE.ExtrudeGeometry、THREE.Meshに変換する責務を持ちます。
 *
 * @module ThreeJSConverter
 */

import * as THREE from 'three';

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
    throw new Error('Invalid profile data: vertices must have at least 3 points');
  }

  // 円形プロファイルの場合は特別処理
  if (profileData._meta && profileData._meta.type === 'circular') {
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
 * @param {boolean} [options.centerZ=true] - Z軸中心に配置するか
 * @param {number} [options.steps=1] - 押し出しステップ数
 * @returns {THREE.ExtrudeGeometry} 押し出しジオメトリ
 */
export function createExtrudeGeometry(shape, length, { centerZ = true, steps = 1 } = {}) {
  const extrudeSettings = {
    depth: length,
    bevelEnabled: false,
    steps: steps,
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
function convertToThreeVector3(vector) {
  return new THREE.Vector3(vector.x, vector.y, vector.z);
}

/**
 * Plain ObjectのQuaternionをTHREE.Quaternionに変換
 *
 * @param {Object} quaternion - Plain Objectの四元数 {x, y, z, w}
 * @returns {THREE.Quaternion} Three.jsのQuaternion
 */
function convertToThreeQuaternion(quaternion) {
  return new THREE.Quaternion(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
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
 * プロファイルデータから輪郭線ジオメトリを作成
 *
 * @param {Object} profileData - ProfileCalculatorが生成したプロファイルデータ
 * @param {number} length - 部材長さ
 * @param {Object} [options={}] - オプション
 * @param {boolean} [options.includeEndCaps=true] - 端面の輪郭を含めるか
 * @returns {THREE.BufferGeometry} 輪郭線ジオメトリ
 */
function createProfileOutlineGeometry(profileData, length, { includeEndCaps = true } = {}) {
  const points = [];
  const halfLength = length / 2;

  // 円形プロファイルの場合
  if (profileData._meta && profileData._meta.type === 'circular') {
    const radius = profileData._meta.outerRadius || profileData._meta.radius;
    const segments = 32;

    // 前面の円
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      points.push(
        new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, -halfLength),
      );
    }

    // 後面の円
    if (includeEndCaps) {
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        points.push(
          new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, halfLength),
        );
      }

      // 軸方向の線（4本）
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;
        points.push(
          new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, -halfLength),
        );
        points.push(
          new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, halfLength),
        );
      }
    }
  } else {
    // ポリゴンプロファイルの場合
    const vertices = profileData.vertices;

    // 前面の輪郭
    for (let i = 0; i <= vertices.length; i++) {
      const v = vertices[i % vertices.length];
      points.push(new THREE.Vector3(v.x, v.y, -halfLength));
    }

    if (includeEndCaps) {
      // 後面の輪郭
      for (let i = 0; i <= vertices.length; i++) {
        const v = vertices[i % vertices.length];
        points.push(new THREE.Vector3(v.x, v.y, halfLength));
      }

      // 軸方向の線（各頂点）
      for (const v of vertices) {
        points.push(new THREE.Vector3(v.x, v.y, -halfLength));
        points.push(new THREE.Vector3(v.x, v.y, halfLength));
      }
    }
  }

  return new THREE.BufferGeometry().setFromPoints(points);
}


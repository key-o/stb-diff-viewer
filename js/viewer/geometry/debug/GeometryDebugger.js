/**
 * @fileoverview ジオメトリデバッグユーティリティ
 *
 * ブラウザのコンソールから多断面ジオメトリの検証を行うための機能
 */

/**
 * メッシュのジオメトリ情報を詳細にダンプ
 * @param {THREE.Mesh} mesh - 対象メッシュ
 */
export function dumpGeometryInfo(mesh) {
  if (!mesh || !mesh.geometry) {
    console.error('Invalid mesh or missing geometry');
    return null;
  }

  const geometry = mesh.geometry;
  const position = geometry.attributes.position;

  if (!position) {
    console.error('No position attribute found');
    return null;
  }

  const info = {
    vertexCount: position.count,
    triangleCount: geometry.index ? geometry.index.count / 3 : 0,
    boundingBox: null,
    vertices: [],
  };

  // バウンディングボックスを計算
  geometry.computeBoundingBox();
  info.boundingBox = {
    min: {
      x: geometry.boundingBox.min.x,
      y: geometry.boundingBox.min.y,
      z: geometry.boundingBox.min.z,
    },
    max: {
      x: geometry.boundingBox.max.x,
      y: geometry.boundingBox.max.y,
      z: geometry.boundingBox.max.z,
    },
    size: {
      x: geometry.boundingBox.max.x - geometry.boundingBox.min.x,
      y: geometry.boundingBox.max.y - geometry.boundingBox.min.y,
      z: geometry.boundingBox.max.z - geometry.boundingBox.min.z,
    },
  };

  // 最初と最後の10頂点を記録
  const limit = Math.min(10, position.count);
  for (let i = 0; i < limit; i++) {
    info.vertices.push({
      index: i,
      x: position.getX(i),
      y: position.getY(i),
      z: position.getZ(i),
    });
  }

  if (position.count > 20) {
    for (let i = position.count - limit; i < position.count; i++) {
      info.vertices.push({
        index: i,
        x: position.getX(i),
        y: position.getY(i),
        z: position.getZ(i),
      });
    }
  }

  return info;
}

/**
 * シーン内の多断面要素を検索
 * @param {THREE.Scene} scene - Three.jsシーン
 * @returns {Array} 多断面メッシュの配列
 */
export function findMultiSectionMeshes(scene) {
  const multiSectionMeshes = [];

  scene.traverse((object) => {
    if (object.isMesh && object.userData) {
      const meta = object.userData.profileMeta;
      if (meta && meta.profileSource === 'multi-section') {
        multiSectionMeshes.push({
          id: object.userData.id,
          elementType: object.userData.elementType,
          mesh: object,
          meta: meta,
        });
      }
    }
  });

  return multiSectionMeshes;
}

/**
 * 断面の高さ（Y方向の範囲）を計算
 * @param {THREE.BufferGeometry} geometry - ジオメトリ
 * @param {number} zPosition - 調査するZ位置（-length/2 ～ length/2）
 * @param {number} tolerance - Z位置の許容誤差
 */
export function getSectionHeightAtZ(geometry, zPosition, tolerance = 1) {
  const position = geometry.attributes.position;
  if (!position) return null;

  let minY = Infinity;
  let maxY = -Infinity;
  let count = 0;

  for (let i = 0; i < position.count; i++) {
    const z = position.getZ(i);
    if (Math.abs(z - zPosition) <= tolerance) {
      const y = position.getY(i);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      count++;
    }
  }

  if (count === 0) {
    console.warn(`No vertices found at z=${zPosition} ± ${tolerance}`);
    return null;
  }

  const height = maxY - minY;

  return { minY, maxY, height, vertexCount: count };
}

/**
 * 多断面梁の天端配置を検証
 * @param {THREE.Mesh} mesh - 梁メッシュ
 * @param {number} length - 梁の長さ（mm）
 */
export function verifyTopEdgePlacement(mesh, length) {
  if (!mesh || !mesh.geometry) {
    console.error('Invalid mesh');
    return;
  }

  // 始端、中央、終端での断面高さを調査
  const positions = [
    { name: '始端', z: -length / 2 },
    { name: '中央', z: 0 },
    { name: '終端', z: length / 2 },
  ];

  const results = [];
  for (const pos of positions) {
    const section = getSectionHeightAtZ(mesh.geometry, pos.z, 10);
    if (section) {
      results.push({
        name: pos.name,
        z: pos.z,
        ...section,
        topEdgeY: section.maxY,
      });
    }
  }

  // 天端が揃っているか確認
  if (results.length >= 2) {
    const topEdges = results.map((r) => r.topEdgeY);
    const minTop = Math.min(...topEdges);
    const maxTop = Math.max(...topEdges);
    const deviation = maxTop - minTop;

    if (deviation >= 0.1) {
      console.warn(`⚠️ 天端がずれています（許容値: 0.1mm）`);
    }
  }

  return results;
}

// グローバルに公開（デバッグ用）
if (typeof window !== 'undefined') {
  window.GeometryDebugger = {
    dumpGeometryInfo,
    findMultiSectionMeshes,
    getSectionHeightAtZ,
    verifyTopEdgePlacement,
  };
}

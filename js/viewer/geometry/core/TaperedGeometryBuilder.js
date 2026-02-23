/**
 * @fileoverview テーパージオメトリ生成モジュール
 *
 * 複数の断面プロファイルから、テーパー形状のBufferGeometryを生成します。
 * ハンチ長さに基づくセグメント分割にも対応します。
 *
 * @module TaperedGeometryBuilder
 */

import * as THREE from 'three';

/**
 * プロファイルデータ型定義
 * @typedef {Object} ProfileData
 * @property {Array<{x: number, y: number}>} vertices - 外形頂点座標配列
 * @property {Array<Array<{x: number, y: number}>>} [holes] - 穴の頂点座標配列（オプション）
 */

/**
 * セグメント境界データ型定義
 * @typedef {Object} SegmentBoundary
 * @property {number} position - 境界位置（mm）
 * @property {ProfileData} profile - その位置でのプロファイル
 */

/**
 * 断面セクションデータ型定義
 * @typedef {Object} SectionData
 * @property {string} pos - 断面位置（'START', 'CENTER', 'END'など）
 * @property {ProfileData} profile - 断面プロファイル
 */

/**
 * 2断面テーパージオメトリを生成
 *
 * 中空断面（BOX/PIPE）の穴も含めてソリッドメッシュを生成します。
 * 端面はTHREE.ShapeUtils.triangulateShapeで正確に三角分割します（凹型・穴あり対応）。
 *
 * @param {ProfileData} startProfile - 始点断面データ
 * @param {ProfileData} endProfile - 終点断面データ
 * @param {number} length - 要素長さ（mm）
 * @param {Object} [options={}] - オプション設定
 * @param {number} [options.segments=1] - 長さ方向の分割数
 * @returns {THREE.BufferGeometry} テーパージオメトリ
 */
export function createTaperedGeometry(startProfile, endProfile, length, options = {}) {
  const { segments = 1 } = options;

  // バリデーション
  validateProfiles(startProfile, endProfile);

  if (length <= 0) {
    throw new Error(`TaperedGeometryBuilder: Invalid length: ${length}`);
  }

  const vertexCount = startProfile.vertices.length;
  const positions = [];
  const indices = [];
  const uvs = [];

  // === 外側輪郭の側面 ===
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const z = -length / 2 + t * length;

    for (let j = 0; j < vertexCount; j++) {
      const startVertex = startProfile.vertices[j];
      const endVertex = endProfile.vertices[j];

      const x = startVertex.x + t * (endVertex.x - startVertex.x);
      const y = startVertex.y + t * (endVertex.y - startVertex.y);

      positions.push(x, y, z);
      uvs.push(j / vertexCount, t);
    }
  }

  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < vertexCount; j++) {
      const current = i * vertexCount + j;
      const next = i * vertexCount + ((j + 1) % vertexCount);
      const currentNext = (i + 1) * vertexCount + j;
      const nextNext = (i + 1) * vertexCount + ((j + 1) % vertexCount);

      indices.push(current, next, currentNext);
      indices.push(next, nextNext, currentNext);
    }
  }

  // === 穴の内側側面（BOX/PIPE等の中空断面） ===
  const startHoles = startProfile.holes || [];
  const endHoles = endProfile.holes || [];

  for (let hIdx = 0; hIdx < startHoles.length; hIdx++) {
    const startHole = startHoles[hIdx];
    const endHole = endHoles[hIdx] || startHole;
    const holeVertexCount = startHole.length;
    const holeBaseOffset = positions.length / 3;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const z = -length / 2 + t * length;

      for (let j = 0; j < holeVertexCount; j++) {
        const sv = startHole[j];
        const ev = endHole[j];

        const x = sv.x + t * (ev.x - sv.x);
        const y = sv.y + t * (ev.y - sv.y);

        positions.push(x, y, z);
        uvs.push(j / holeVertexCount, t);
      }
    }

    // 内側側面の三角形（巻き順を逆にして内向き法線）
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < holeVertexCount; j++) {
        const c = holeBaseOffset + i * holeVertexCount + j;
        const n = holeBaseOffset + i * holeVertexCount + ((j + 1) % holeVertexCount);
        const cn = holeBaseOffset + (i + 1) * holeVertexCount + j;
        const nn = holeBaseOffset + (i + 1) * holeVertexCount + ((j + 1) % holeVertexCount);

        indices.push(c, cn, n);
        indices.push(n, cn, nn);
      }
    }
  }

  // === 端面キャップ（ShapeUtils使用：凹型・穴あり対応） ===
  buildEndCapWithHoles(startProfile, -length / 2, positions, indices, uvs, false);
  buildEndCapWithHoles(endProfile, length / 2, positions, indices, uvs, true);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

  geometry.computeVertexNormals();

  return geometry;
}

/**
 * 3断面以上のテーパージオメトリを生成（ハンチ対応）
 *
 * 中空断面（BOX/PIPE）の穴も含めてソリッドメッシュを生成します。
 * 端面はTHREE.ShapeUtils.triangulateShapeで正確に三角分割します（凹型・穴あり対応）。
 *
 * @param {Array<SectionData>} sections - 断面配列
 * @param {number} length - 要素長さ（mm）
 * @param {Object} [haunchLengths={}] - ハンチ長さ
 * @param {number} [haunchLengths.start=0] - 始端ハンチ長さ（mm）
 * @param {number} [haunchLengths.end=0] - 終端ハンチ長さ（mm）
 * @returns {THREE.BufferGeometry} テーパージオメトリ
 */
export function createMultiSectionGeometry(sections, length, haunchLengths = {}) {
  const {
    start: haunchStart = 0,
    end: haunchEnd = 0,
    kindStart = 'SLOPE',
    kindEnd = 'SLOPE',
  } = haunchLengths;

  const boundaries = calculateSegmentBoundaries(
    sections,
    length,
    haunchStart,
    haunchEnd,
    kindStart,
    kindEnd,
  );

  const positions = [];
  const indices = [];
  const uvs = [];
  let outerVertexOffset = 0;

  // セグメントごとに外側輪郭・内側穴の側面を生成
  for (let segIdx = 0; segIdx < boundaries.length - 1; segIdx++) {
    const segStart = boundaries[segIdx];
    const segEnd = boundaries[segIdx + 1];
    const segLength = segEnd.position - segStart.position;

    if (segLength <= 0) continue;

    const startProfile = segStart.profile;
    const endProfile = segEnd.profile;
    const vertexCount = startProfile.vertices.length;
    const segSegments = 1;

    // === 外側輪郭の側面 ===
    for (let i = 0; i <= segSegments; i++) {
      const t = i / segSegments;
      const z = -length / 2 + segStart.position + t * segLength;

      for (let j = 0; j < vertexCount; j++) {
        const sv = startProfile.vertices[j];
        const ev = endProfile.vertices[j];

        const x = sv.x + t * (ev.x - sv.x);
        const y = sv.y + t * (ev.y - sv.y);

        positions.push(x, y, z);

        const u = j / vertexCount;
        const v = (segStart.position + t * segLength) / length;
        uvs.push(u, v);
      }
    }

    for (let i = 0; i < segSegments; i++) {
      for (let j = 0; j < vertexCount; j++) {
        const current = outerVertexOffset + i * vertexCount + j;
        const next = outerVertexOffset + i * vertexCount + ((j + 1) % vertexCount);
        const currentNext = outerVertexOffset + (i + 1) * vertexCount + j;
        const nextNext = outerVertexOffset + (i + 1) * vertexCount + ((j + 1) % vertexCount);

        indices.push(current, next, currentNext);
        indices.push(next, nextNext, currentNext);
      }
    }

    outerVertexOffset += (segSegments + 1) * vertexCount;

    // === 穴の内側側面（BOX/PIPE等の中空断面） ===
    const startHoles = startProfile.holes || [];
    const endHoles = endProfile.holes || [];

    for (let hIdx = 0; hIdx < startHoles.length; hIdx++) {
      const startHole = startHoles[hIdx];
      const endHole = endHoles[hIdx] || startHole;
      const holeVertexCount = startHole.length;
      const holeBaseOffset = positions.length / 3;

      for (let i = 0; i <= segSegments; i++) {
        const t = i / segSegments;
        const z = -length / 2 + segStart.position + t * segLength;

        for (let j = 0; j < holeVertexCount; j++) {
          const sv = startHole[j];
          const ev = endHole[j];

          const x = sv.x + t * (ev.x - sv.x);
          const y = sv.y + t * (ev.y - sv.y);

          positions.push(x, y, z);

          const u = j / holeVertexCount;
          const v = (segStart.position + t * segLength) / length;
          uvs.push(u, v);
        }
      }

      // 内側側面の三角形（巻き順を逆にして内向き法線）
      for (let i = 0; i < segSegments; i++) {
        for (let j = 0; j < holeVertexCount; j++) {
          const c = holeBaseOffset + i * holeVertexCount + j;
          const n = holeBaseOffset + i * holeVertexCount + ((j + 1) % holeVertexCount);
          const cn = holeBaseOffset + (i + 1) * holeVertexCount + j;
          const nn = holeBaseOffset + (i + 1) * holeVertexCount + ((j + 1) % holeVertexCount);

          indices.push(c, cn, n);
          indices.push(n, cn, nn);
        }
      }
    }
  }

  // === 端面キャップ（ShapeUtils使用：凹型・穴あり対応） ===
  const firstProfile = boundaries[0].profile;
  const lastProfile = boundaries[boundaries.length - 1].profile;
  const startZ = -length / 2 + boundaries[0].position;
  const endZ = -length / 2 + boundaries[boundaries.length - 1].position;

  buildEndCapWithHoles(firstProfile, startZ, positions, indices, uvs, false);
  buildEndCapWithHoles(lastProfile, endZ, positions, indices, uvs, true);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * 端面キャップをソリッドメッシュとして生成
 *
 * THREE.ShapeUtils.triangulateShapeを使用して凹型輪郭・穴あり断面に正確に対応します。
 * - H形鋼などの凹型輪郭 → Fan Triangulationでは誤りになるが、ShapeUtilsは正確に処理
 * - BOX/PIPE等の穴あり断面 → 穴の頂点も含めて環状端面を生成
 *
 * @param {ProfileData} profile - プロファイルデータ（vertices + holes）
 * @param {number} z - キャップのZ座標
 * @param {number[]} positions - 頂点座標配列（追記される）
 * @param {number[]} indices - インデックス配列（追記される）
 * @param {number[]} uvs - UV座標配列（追記される）
 * @param {boolean} reverse - 法線を反転するか（天面=true、底面=false）
 */
function buildEndCapWithHoles(profile, z, positions, indices, uvs, reverse) {
  const baseIndex = positions.length / 3;
  const contour = profile.vertices;
  const holes = profile.holes || [];
  // three.js r182 以降の triangulateShape は Vector2 の equals() を前提とする
  const contour2D = contour.map((v) => new THREE.Vector2(v.x, v.y));
  const holes2D = holes.map((hole) => hole.map((v) => new THREE.Vector2(v.x, v.y)));

  // 外形頂点を追加
  for (const v of contour) {
    positions.push(v.x, v.y, z);
    uvs.push(0, 0);
  }

  // 穴の頂点を追加（ShapeUtils返却インデックスと対応させるため、外形の直後に連結）
  for (const hole of holes) {
    for (const v of hole) {
      positions.push(v.x, v.y, z);
      uvs.push(0, 0);
    }
  }

  // ShapeUtilsで三角分割（凹型多角形・穴あり断面に対応）
  // 返却インデックス: 0..contour.length-1 → 外形, 以降 → 穴（連結順）
  const triangles = THREE.ShapeUtils.triangulateShape(contour2D, holes2D);

  for (const [a, b, c] of triangles) {
    if (reverse) {
      indices.push(baseIndex + a, baseIndex + c, baseIndex + b);
    } else {
      indices.push(baseIndex + a, baseIndex + b, baseIndex + c);
    }
  }
}

/**
 * セグメント境界位置を計算
 *
 * Joint/Haunch梁の場合、各断面は「領域」を表すため、
 * 均一区間と急激な断面変化を正しく表現するように境界を生成します。
 *
 * ハンチ種別による遷移の違い:
 * - SLOPE: ハンチ区間内でスムーズにテーパー遷移（接続面が同断面）
 * - DROP: ハンチ境界で急激に断面変化（接続面が別断面）
 *
 * @param {Array<SectionData>} sections - 断面配列
 * @param {number} length - 全体長さ（mm）
 * @param {number} haunchStart - 始端ハンチ/ジョイント長さ（mm）
 * @param {number} haunchEnd - 終端ハンチ/ジョイント長さ（mm）
 * @param {string} kindStart - 始端ハンチ種別（'SLOPE' or 'DROP'）
 * @param {string} kindEnd - 終端ハンチ種別（'SLOPE' or 'DROP'）
 * @returns {Array<SegmentBoundary>} 境界位置配列
 */
function calculateSegmentBoundaries(
  sections,
  length,
  haunchStart,
  haunchEnd,
  kindStart = 'SLOPE',
  kindEnd = 'SLOPE',
) {
  const boundaries = [];

  // 断面位置の分析
  const posMap = {};
  for (const section of sections) {
    posMap[section.pos.toUpperCase()] = section.profile;
  }

  const hasStart = 'START' in posMap;
  const hasCenter = 'CENTER' in posMap;
  const hasEnd = 'END' in posMap;

  // 急激な断面変化を表現するための最小オフセット（mm）
  const EPSILON = 0.1;

  // === 3断面パターン (START/CENTER/END) - 両側ハンチ/ジョイント ===
  if (hasStart && hasCenter && hasEnd && haunchStart > 0 && haunchEnd > 0) {
    // 始端ハンチ区間
    boundaries.push({ position: 0, profile: posMap['START'] });
    if (kindStart === 'DROP') {
      // DROP: 始端区間は均一 → 境界で急変
      boundaries.push({ position: haunchStart - EPSILON, profile: posMap['START'] });
      boundaries.push({ position: haunchStart, profile: posMap['CENTER'] });
    } else {
      // SLOPE: 始端からCENTERへスムーズにテーパー
      boundaries.push({ position: haunchStart, profile: posMap['CENTER'] });
    }

    // CENTER区間（均一）
    boundaries.push({ position: length - haunchEnd, profile: posMap['CENTER'] });

    // 終端ハンチ区間
    if (kindEnd === 'DROP') {
      // DROP: 境界で急変 → 終端区間は均一
      boundaries.push({ position: length - haunchEnd + EPSILON, profile: posMap['END'] });
    }
    boundaries.push({ position: length, profile: posMap['END'] });
  }
  // === 3断面パターン (START/CENTER/END) - 片側のみハンチ/ジョイント ===
  else if (hasStart && hasCenter && hasEnd && (haunchStart > 0 || haunchEnd > 0)) {
    boundaries.push({ position: 0, profile: posMap['START'] });
    if (haunchStart > 0) {
      if (kindStart === 'DROP') {
        boundaries.push({ position: haunchStart - EPSILON, profile: posMap['START'] });
        boundaries.push({ position: haunchStart, profile: posMap['CENTER'] });
      } else {
        // SLOPE: スムーズテーパー
        boundaries.push({ position: haunchStart, profile: posMap['CENTER'] });
      }
    }
    // CENTERの中間点（始端ハンチなしの場合）
    if (haunchStart === 0 && haunchEnd > 0) {
      const centerMid = (length - haunchEnd) / 2;
      boundaries.push({ position: centerMid, profile: posMap['CENTER'] });
    }
    if (haunchEnd > 0) {
      boundaries.push({ position: length - haunchEnd, profile: posMap['CENTER'] });
      if (kindEnd === 'DROP') {
        boundaries.push({ position: length - haunchEnd + EPSILON, profile: posMap['END'] });
      }
    }
    boundaries.push({ position: length, profile: posMap['END'] });
  }
  // === 2断面パターン (START/CENTER) - 始端ジョイント/ハンチ ===
  else if (hasStart && hasCenter && !hasEnd) {
    const transitionPos = haunchStart > 0 ? haunchStart : length * 0.2;
    boundaries.push({ position: 0, profile: posMap['START'] });
    if (kindStart === 'DROP') {
      boundaries.push({ position: transitionPos - EPSILON, profile: posMap['START'] });
      boundaries.push({ position: transitionPos, profile: posMap['CENTER'] });
    } else {
      // SLOPE: スムーズテーパー
      boundaries.push({ position: transitionPos, profile: posMap['CENTER'] });
    }
    boundaries.push({ position: length, profile: posMap['CENTER'] });
  }
  // === 2断面パターン (CENTER/END) - 終端ジョイント/ハンチ ===
  else if (!hasStart && hasCenter && hasEnd) {
    const transitionPos = haunchEnd > 0 ? length - haunchEnd : length * 0.8;
    boundaries.push({ position: 0, profile: posMap['CENTER'] });
    boundaries.push({ position: transitionPos, profile: posMap['CENTER'] });
    if (kindEnd === 'DROP') {
      boundaries.push({ position: transitionPos + EPSILON, profile: posMap['END'] });
    }
    boundaries.push({ position: length, profile: posMap['END'] });
  }
  // === 2断面パターン (START/END) - 両端テーパー ===
  else if (hasStart && !hasCenter && hasEnd) {
    // 始点から終点まで線形にテーパー
    boundaries.push({ position: 0, profile: posMap['START'] });
    boundaries.push({ position: length, profile: posMap['END'] });
  }
  // === その他のパターン（従来ロジック） ===
  else {
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const pos = section.pos.toUpperCase();
      let position = 0;

      if (pos === 'START' || pos === 'BOTTOM') {
        position = 0;
      } else if (pos === 'HAUNCH_S') {
        position = haunchStart;
      } else if (pos === 'CENTER') {
        position = length / 2;
      } else if (pos === 'HAUNCH_E') {
        position = length - haunchEnd;
      } else if (pos === 'END' || pos === 'TOP') {
        position = length;
      } else {
        position = (length * i) / Math.max(1, sections.length - 1);
      }

      boundaries.push({ position, profile: section.profile });
    }
  }

  // 位置でソート
  boundaries.sort((a, b) => a.position - b.position);

  return boundaries;
}

/**
 * プロファイルのバリデーション
 *
 * @param {ProfileData} startProfile - 始点プロファイル
 * @param {ProfileData} endProfile - 終点プロファイル
 * @throws {Error} プロファイルが無効な場合
 */
function validateProfiles(startProfile, endProfile) {
  if (!startProfile || !endProfile) {
    throw new Error('TaperedGeometryBuilder: startProfile and endProfile are required');
  }

  if (!startProfile.vertices || !endProfile.vertices) {
    throw new Error('TaperedGeometryBuilder: Profile vertices are required');
  }

  if (startProfile.vertices.length !== endProfile.vertices.length) {
    throw new Error(
      `TaperedGeometryBuilder: Vertex count mismatch ` +
        `(start: ${startProfile.vertices.length}, end: ${endProfile.vertices.length})`,
    );
  }

  if (startProfile.vertices.length < 3) {
    throw new Error(
      `TaperedGeometryBuilder: Profile must have at least 3 vertices ` +
        `(got ${startProfile.vertices.length})`,
    );
  }
}

/**
 * 線形補間されたプロファイルを取得
 *
 * @param {ProfileData} startProfile - 始点プロファイル
 * @param {ProfileData} endProfile - 終点プロファイル
 * @param {number} t - 補間パラメータ（0.0 ～ 1.0）
 * @returns {ProfileData} 補間されたプロファイル
 */
export function interpolateProfiles(startProfile, endProfile, t) {
  validateProfiles(startProfile, endProfile);

  const vertices = startProfile.vertices.map((sv, i) => {
    const ev = endProfile.vertices[i];
    return {
      x: sv.x + t * (ev.x - sv.x),
      y: sv.y + t * (ev.y - sv.y),
    };
  });

  return {
    vertices,
    holes: [], // 穴の補間は現在未対応
  };
}

/**
 * 2点間の中間プロファイルを生成
 *
 * @param {ProfileData} startProfile - 始点プロファイル
 * @param {ProfileData} endProfile - 終点プロファイル
 * @param {number} divisions - 分割数
 * @returns {Array<ProfileData>} 中間プロファイル配列（始点・終点含む）
 */
export function generateIntermediateProfiles(startProfile, endProfile, divisions) {
  const profiles = [];

  for (let i = 0; i <= divisions; i++) {
    const t = i / divisions;
    profiles.push(interpolateProfiles(startProfile, endProfile, t));
  }

  return profiles;
}

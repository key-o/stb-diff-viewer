/**
 * @fileoverview テーパージオメトリ生成モジュール
 *
 * 複数の断面プロファイルから、テーパー形状のBufferGeometryを生成します。
 * ハンチ長さに基づくセグメント分割にも対応します。
 *
 * @module TaperedGeometryBuilder
 */

import * as THREE from "three";
import { createLogger } from "../../../utils/logger.js";

const log = createLogger("viewer:geometry:tapered");

/**
 * プロファイルデータ型定義
 * @typedef {Object} ProfileData
 * @property {Array<{x: number, y: number}>} vertices - 外形頂点座標配列
 * @property {Array<Array<{x: number, y: number}>>} holes - 穴の頂点座標配列（オプション）
 */

/**
 * 2断面テーパージオメトリを生成
 *
 * @param {ProfileData} startProfile - 始点断面データ
 * @param {ProfileData} endProfile - 終点断面データ
 * @param {number} length - 要素長さ（mm）
 * @param {Object} options - オプション設定
 * @param {number} options.segments - 長さ方向の分割数（デフォルト: 1）
 * @returns {THREE.BufferGeometry} テーパージオメトリ
 */
export function createTaperedGeometry(startProfile, endProfile, length, options = {}) {
  const { segments = 1 } = options;

  // バリデーション
  validateProfiles(startProfile, endProfile);

  if (length <= 0) {
    throw new Error(`TaperedGeometryBuilder: Invalid length: ${length}`);
  }

  log.debug(
    `Creating tapered geometry: ${startProfile.vertices.length} vertices, ` +
    `length=${length.toFixed(1)}mm, segments=${segments}`
  );

  const vertexCount = startProfile.vertices.length;
  const positions = [];
  const indices = [];
  const uvs = [];

  // 断面を長さ方向に補間して配置
  for (let i = 0; i <= segments; i++) {
    const t = i / segments; // 補間パラメータ（0.0 ～ 1.0）
    const z = -length / 2 + t * length; // Z座標（中心を原点とする）

    // 断面の頂点を補間
    for (let j = 0; j < vertexCount; j++) {
      const startVertex = startProfile.vertices[j];
      const endVertex = endProfile.vertices[j];

      // 線形補間
      const x = startVertex.x + t * (endVertex.x - startVertex.x);
      const y = startVertex.y + t * (endVertex.y - startVertex.y);

      positions.push(x, y, z);

      // UV座標（仮実装：簡易的な展開）
      uvs.push(j / vertexCount, t);
    }
  }

  // 側面の三角形を生成
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < vertexCount; j++) {
      const current = i * vertexCount + j;
      const next = i * vertexCount + ((j + 1) % vertexCount);
      const currentNext = (i + 1) * vertexCount + j;
      const nextNext = (i + 1) * vertexCount + ((j + 1) % vertexCount);

      // 2つの三角形で四角形を構成
      indices.push(current, next, currentNext);
      indices.push(next, nextNext, currentNext);
    }
  }

  // 始点断面のキャップ（底面）
  const startCap = triangulateProfile(startProfile.vertices, 0, false);
  indices.push(...startCap);

  // 終点断面のキャップ（天面）
  const endCap = triangulateProfile(endProfile.vertices, segments * vertexCount, true);
  indices.push(...endCap);

  // BufferGeometryを作成
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

  // 法線を自動計算
  geometry.computeVertexNormals();

  log.debug(
    `Tapered geometry created: ${positions.length / 3} vertices, ${indices.length / 3} triangles`
  );

  return geometry;
}

/**
 * 3断面以上のテーパージオメトリを生成（ハンチ対応）
 *
 * @param {Array<{pos: string, profile: ProfileData}>} sections - 断面配列
 * @param {number} length - 要素長さ（mm）
 * @param {Object} haunchLengths - ハンチ長さ {start: number, end: number}
 * @returns {THREE.BufferGeometry} テーパージオメトリ
 */
export function createMultiSectionGeometry(sections, length, haunchLengths = {}) {
  const { start: haunchStart = 0, end: haunchEnd = 0 } = haunchLengths;

  // セグメントの境界位置を計算
  const boundaries = calculateSegmentBoundaries(sections, length, haunchStart, haunchEnd);

  log.debug(
    `Creating multi-section geometry: ${sections.length} sections, ` +
    `length=${length.toFixed(1)}mm, haunch(start=${haunchStart}, end=${haunchEnd})`
  );

  const positions = [];
  const indices = [];
  const uvs = [];
  let vertexOffset = 0;

  // セグメントごとにジオメトリを生成
  for (let segIdx = 0; segIdx < boundaries.length - 1; segIdx++) {
    const segStart = boundaries[segIdx];
    const segEnd = boundaries[segIdx + 1];
    const segLength = segEnd.position - segStart.position;

    if (segLength <= 0) continue;

    const startProfile = segStart.profile;
    const endProfile = segEnd.profile;

    // このセグメントの頂点数
    const vertexCount = startProfile.vertices.length;

    // セグメント内を分割（簡易実装: 1分割）
    const segSegments = 1;

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

    // このセグメントの側面三角形
    for (let i = 0; i < segSegments; i++) {
      for (let j = 0; j < vertexCount; j++) {
        const current = vertexOffset + i * vertexCount + j;
        const next = vertexOffset + i * vertexCount + ((j + 1) % vertexCount);
        const currentNext = vertexOffset + (i + 1) * vertexCount + j;
        const nextNext = vertexOffset + (i + 1) * vertexCount + ((j + 1) % vertexCount);

        indices.push(current, next, currentNext);
        indices.push(next, nextNext, currentNext);
      }
    }

    vertexOffset += (segSegments + 1) * vertexCount;
  }

  // 始点・終点のキャップ
  const firstProfile = boundaries[0].profile;
  const lastProfile = boundaries[boundaries.length - 1].profile;

  const startCap = triangulateProfile(firstProfile.vertices, 0, false);
  indices.push(...startCap);

  const endCap = triangulateProfile(
    lastProfile.vertices,
    positions.length / 3 - lastProfile.vertices.length,
    true
  );
  indices.push(...endCap);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();

  log.debug(
    `Multi-section geometry created: ${positions.length / 3} vertices, ${indices.length / 3} triangles`
  );

  return geometry;
}

/**
 * セグメント境界位置を計算
 *
 * @param {Array<{pos: string, profile: ProfileData}>} sections - 断面配列
 * @param {number} length - 全体長さ（mm）
 * @param {number} haunchStart - 始端ハンチ長さ（mm）
 * @param {number} haunchEnd - 終端ハンチ長さ（mm）
 * @returns {Array<{position: number, profile: ProfileData}>} 境界位置配列
 */
function calculateSegmentBoundaries(sections, length, haunchStart, haunchEnd) {
  const boundaries = [];

  // 位置指定から境界位置を決定
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const pos = section.pos.toUpperCase();

    let position = 0;

    // 位置ごとの配置ロジック
    if (pos === 'START') {
      position = 0;
    } else if (pos === 'HAUNCH_S') {
      position = haunchStart;
    } else if (pos === 'CENTER') {
      // 2断面: START/CENTERの場合、CENTERはhaunchStart位置
      // 3断面: START/CENTER/ENDの場合、CENTERは中央
      const hasStart = sections.some(s => s.pos.toUpperCase() === 'START');
      const hasEnd = sections.some(s => s.pos.toUpperCase() === 'END');

      if (hasStart && hasEnd) {
        // 3断面以上: 真ん中
        position = length / 2;
      } else if (hasStart) {
        // START/CENTER: CENTERはハンチ終了位置
        position = haunchStart;
      } else if (hasEnd) {
        // CENTER/END: CENTERはハンチ開始位置
        position = length - haunchEnd;
      } else {
        // CENTERのみ: 中央
        position = length / 2;
      }
    } else if (pos === 'HAUNCH_E') {
      position = length - haunchEnd;
    } else if (pos === 'END') {
      position = length;
    } else if (pos === 'TOP') {
      // 柱のTOP（上端）
      position = length;
    } else if (pos === 'BOTTOM') {
      // 柱のBOTTOM（下端）
      position = 0;
    } else {
      // デフォルト: 均等分割
      position = (length * i) / (sections.length - 1);
    }

    boundaries.push({
      position,
      profile: section.profile
    });
  }

  // 位置でソート
  boundaries.sort((a, b) => a.position - b.position);

  return boundaries;
}

/**
 * プロファイルの三角形分割（Ear Clipping法の簡易実装）
 *
 * @param {Array<{x: number, y: number}>} vertices - 頂点配列
 * @param {number} baseIndex - ベースインデックス
 * @param {boolean} reverse - 法線方向を反転（天面用）
 * @returns {Array<number>} インデックス配列
 */
function triangulateProfile(vertices, baseIndex, reverse) {
  const indices = [];
  const n = vertices.length;

  if (n < 3) {
    log.warn("triangulateProfile: Not enough vertices for triangulation");
    return indices;
  }

  // 簡易実装: Fan Triangulation（凸多角形を仮定）
  for (let i = 1; i < n - 1; i++) {
    if (reverse) {
      indices.push(baseIndex, baseIndex + i + 1, baseIndex + i);
    } else {
      indices.push(baseIndex, baseIndex + i, baseIndex + i + 1);
    }
  }

  return indices;
}

/**
 * プロファイルのバリデーション
 *
 * @param {ProfileData} startProfile - 始点プロファイル
 * @param {ProfileData} endProfile - 終点プロファイル
 */
function validateProfiles(startProfile, endProfile) {
  if (!startProfile || !endProfile) {
    throw new Error("TaperedGeometryBuilder: startProfile and endProfile are required");
  }

  if (!startProfile.vertices || !endProfile.vertices) {
    throw new Error("TaperedGeometryBuilder: Profile vertices are required");
  }

  if (startProfile.vertices.length !== endProfile.vertices.length) {
    throw new Error(
      `TaperedGeometryBuilder: Vertex count mismatch ` +
      `(start: ${startProfile.vertices.length}, end: ${endProfile.vertices.length})`
    );
  }

  if (startProfile.vertices.length < 3) {
    throw new Error(
      `TaperedGeometryBuilder: Profile must have at least 3 vertices ` +
      `(got ${startProfile.vertices.length})`
    );
  }
}

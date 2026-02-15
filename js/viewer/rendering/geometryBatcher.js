/**
 * @fileoverview ジオメトリバッチ処理ユーティリティ
 *
 * 複数の要素ジオメトリを結合し、ドローコールを削減します。
 * 同じマテリアルを共有する要素を単一のメッシュにまとめることで、
 * 大規模モデルのレンダリング性能を大幅に向上させます。
 */

import * as THREE from 'three';
import { globalGeometryCache } from './geometryCache.js';

/**
 * ライン要素のバッチ処理クラス
 *
 * 複数のラインセグメントを単一のLineSegmentsオブジェクトに結合します。
 *
 * @example
 * const batcher = new LineBatcher();
 * elements.forEach(el => batcher.addLine(el.start, el.end, { elementId: el.id }));
 * const mesh = batcher.build(material);
 * scene.add(mesh);
 */
export class LineBatcher {
  constructor() {
    /** @type {number[]} 頂点座標配列 [x1,y1,z1, x2,y2,z2, ...] */
    this.positions = [];

    /** @type {number[]} 頂点カラー配列 [r1,g1,b1, r2,g2,b2, ...] */
    this.colors = [];

    /** @type {Array<{startIndex: number, endIndex: number, userData: Object}>} セグメント情報 */
    this.segments = [];

    /** @type {boolean} 頂点カラーを使用するか */
    this.useVertexColors = false;
  }

  /**
   * ラインセグメントを追加
   *
   * @param {THREE.Vector3} start - 始点
   * @param {THREE.Vector3} end - 終点
   * @param {Object} [userData={}] - 要素に関連付けるユーザーデータ
   * @param {THREE.Color} [color=null] - 頂点カラー（指定時は頂点カラーモードを有効化）
   */
  addLine(start, end, userData = {}, color = null) {
    const startIndex = this.positions.length / 3;

    this.positions.push(start.x, start.y, start.z);
    this.positions.push(end.x, end.y, end.z);

    if (color) {
      this.useVertexColors = true;
      this.colors.push(color.r, color.g, color.b);
      this.colors.push(color.r, color.g, color.b);
    }

    this.segments.push({
      startIndex,
      endIndex: startIndex + 1,
      userData,
    });
  }

  /**
   * バッチ処理されたLineSegmentsを構築
   *
   * @param {THREE.Material} material - 適用するマテリアル
   * @returns {THREE.LineSegments} 結合されたラインセグメント
   */
  build(material) {
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));

    if (this.useVertexColors && this.colors.length > 0) {
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
      material.vertexColors = true;
    }

    const lineSegments = new THREE.LineSegments(geometry, material);

    // セグメント情報をメタデータとして保持（レイキャスト用）
    lineSegments.userData = {
      isBatched: true,
      segmentCount: this.segments.length,
      segments: this.segments,
    };

    return lineSegments;
  }

  /**
   * バッチデータをクリア
   */
  clear() {
    this.positions = [];
    this.colors = [];
    this.segments = [];
    this.useVertexColors = false;
  }

  /**
   * 現在のセグメント数を取得
   * @returns {number}
   */
  get count() {
    return this.segments.length;
  }
}

/**
 * バッチ処理されたオブジェクトからヒットした要素を特定
 *
 * レイキャストでバッチオブジェクトがヒットした場合に、
 * 実際にヒットした個別要素のユーザーデータを取得します。
 *
 * @param {THREE.Intersection} intersection - レイキャスト結果
 * @returns {Object|null} ヒットした要素のユーザーデータ
 */
export function getHitElementFromBatch(intersection) {
  const object = intersection.object;

  if (!object.userData?.isBatched) {
    return object.userData;
  }

  // LineSegmentsの場合
  if (object.userData.segments && intersection.index !== undefined) {
    const segmentIndex = Math.floor(intersection.index / 2);
    const segment = object.userData.segments[segmentIndex];
    return segment?.userData || null;
  }

  // Meshの場合（faceIndex使用）
  if (object.userData.meshDataList && intersection.faceIndex !== undefined) {
    // 簡易実装: 最初のメッシュデータを返す
    // より正確な実装には、各メッシュの頂点数を追跡する必要がある
    return object.userData.meshDataList[0] || null;
  }

  return null;
}

// キャッシュユーティリティの再エクスポート
export {
  globalGeometryCache,
  GeometryKeyGenerator,
  logGeometryCacheStats,
} from './geometryCache.js';

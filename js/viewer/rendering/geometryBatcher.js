/**
 * @fileoverview ジオメトリバッチ処理ユーティリティ
 *
 * 複数の要素ジオメトリを結合し、ドローコールを削減します。
 * 同じマテリアルを共有する要素を単一のメッシュにまとめることで、
 * 大規模モデルのレンダリング性能を大幅に向上させます。
 */

import * as THREE from 'three';

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
      userData
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

    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(this.positions, 3)
    );

    if (this.useVertexColors && this.colors.length > 0) {
      geometry.setAttribute(
        'color',
        new THREE.Float32BufferAttribute(this.colors, 3)
      );
      material.vertexColors = true;
    }

    const lineSegments = new THREE.LineSegments(geometry, material);

    // セグメント情報をメタデータとして保持（レイキャスト用）
    lineSegments.userData = {
      isBatched: true,
      segmentCount: this.segments.length,
      segments: this.segments
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
 * メッシュ要素のバッチ処理クラス
 *
 * 複数のメッシュジオメトリを単一のメッシュに結合します。
 * InstancedMeshまたはマージされたBufferGeometryを生成できます。
 */
export class MeshBatcher {
  constructor() {
    /** @type {THREE.BufferGeometry[]} マージ対象のジオメトリ */
    this.geometries = [];

    /** @type {Object[]} 各ジオメトリのユーザーデータ */
    this.userDataList = [];

    /** @type {THREE.Matrix4[]} 各ジオメトリの変換行列 */
    this.matrices = [];
  }

  /**
   * ジオメトリを追加
   *
   * @param {THREE.BufferGeometry} geometry - 追加するジオメトリ
   * @param {THREE.Matrix4} [matrix=null] - 変換行列（nullの場合は単位行列）
   * @param {Object} [userData={}] - 関連付けるユーザーデータ
   */
  addGeometry(geometry, matrix = null, userData = {}) {
    const clonedGeometry = geometry.clone();

    if (matrix) {
      clonedGeometry.applyMatrix4(matrix);
    }

    this.geometries.push(clonedGeometry);
    this.matrices.push(matrix || new THREE.Matrix4());
    this.userDataList.push(userData);
  }

  /**
   * メッシュを位置指定で追加
   *
   * @param {THREE.BufferGeometry} geometry - 追加するジオメトリ
   * @param {THREE.Vector3} position - 配置位置
   * @param {THREE.Quaternion} [rotation=null] - 回転
   * @param {THREE.Vector3} [scale=null] - スケール
   * @param {Object} [userData={}] - 関連付けるユーザーデータ
   */
  addMesh(geometry, position, rotation = null, scale = null, userData = {}) {
    const matrix = new THREE.Matrix4();

    matrix.compose(
      position,
      rotation || new THREE.Quaternion(),
      scale || new THREE.Vector3(1, 1, 1)
    );

    this.addGeometry(geometry, matrix, userData);
  }

  /**
   * 結合されたメッシュを構築
   *
   * @param {THREE.Material} material - 適用するマテリアル
   * @returns {THREE.Mesh} 結合されたメッシュ
   */
  build(material) {
    if (this.geometries.length === 0) {
      return null;
    }

    // BufferGeometryUtils.mergeGeometriesの代替実装
    const mergedGeometry = this.mergeGeometries(this.geometries);

    const mesh = new THREE.Mesh(mergedGeometry, material);

    mesh.userData = {
      isBatched: true,
      meshCount: this.geometries.length,
      meshDataList: this.userDataList
    };

    return mesh;
  }

  /**
   * 同一ジオメトリの複数インスタンス用にInstancedMeshを構築
   *
   * @param {THREE.BufferGeometry} geometry - 基本ジオメトリ
   * @param {THREE.Material} material - 適用するマテリアル
   * @param {Array<{matrix: THREE.Matrix4, userData: Object}>} instances - インスタンス情報配列
   * @returns {THREE.InstancedMesh}
   */
  static buildInstanced(geometry, material, instances) {
    const instancedMesh = new THREE.InstancedMesh(
      geometry,
      material,
      instances.length
    );

    instances.forEach((instance, i) => {
      instancedMesh.setMatrixAt(i, instance.matrix);
    });

    instancedMesh.instanceMatrix.needsUpdate = true;

    instancedMesh.userData = {
      isBatched: true,
      isInstanced: true,
      instanceCount: instances.length,
      instances: instances.map((inst) => inst.userData)
    };

    return instancedMesh;
  }

  /**
   * ジオメトリをマージ（BufferGeometryUtils.mergeGeometriesの簡易実装）
   *
   * @private
   * @param {THREE.BufferGeometry[]} geometries
   * @returns {THREE.BufferGeometry}
   */
  mergeGeometries(geometries) {
    const mergedPositions = [];
    const mergedNormals = [];
    const mergedIndices = [];
    let indexOffset = 0;

    for (const geometry of geometries) {
      const positions = geometry.getAttribute('position');
      const normals = geometry.getAttribute('normal');
      const indices = geometry.getIndex();

      // 頂点位置をコピー
      for (let i = 0; i < positions.count; i++) {
        mergedPositions.push(
          positions.getX(i),
          positions.getY(i),
          positions.getZ(i)
        );
      }

      // 法線をコピー（存在する場合）
      if (normals) {
        for (let i = 0; i < normals.count; i++) {
          mergedNormals.push(normals.getX(i), normals.getY(i), normals.getZ(i));
        }
      }

      // インデックスをコピー（オフセット付き）
      if (indices) {
        for (let i = 0; i < indices.count; i++) {
          mergedIndices.push(indices.getX(i) + indexOffset);
        }
      }

      indexOffset += positions.count;
    }

    const mergedGeometry = new THREE.BufferGeometry();

    mergedGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(mergedPositions, 3)
    );

    if (mergedNormals.length > 0) {
      mergedGeometry.setAttribute(
        'normal',
        new THREE.Float32BufferAttribute(mergedNormals, 3)
      );
    }

    if (mergedIndices.length > 0) {
      mergedGeometry.setIndex(mergedIndices);
    }

    return mergedGeometry;
  }

  /**
   * バッチデータをクリア
   */
  clear() {
    this.geometries.forEach((g) => g.dispose());
    this.geometries = [];
    this.userDataList = [];
    this.matrices = [];
  }

  /**
   * 現在のジオメトリ数を取得
   * @returns {number}
   */
  get count() {
    return this.geometries.length;
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

/**
 * マテリアルタイプごとにバッチャーを管理するユーティリティ
 */
export class BatcherManager {
  constructor() {
    /** @type {Map<string, LineBatcher>} */
    this.lineBatchers = new Map();

    /** @type {Map<string, MeshBatcher>} */
    this.meshBatchers = new Map();
  }

  /**
   * 指定キーのLineBatcherを取得（なければ作成）
   *
   * @param {string} key - マテリアルタイプ等の識別キー
   * @returns {LineBatcher}
   */
  getLineBatcher(key) {
    if (!this.lineBatchers.has(key)) {
      this.lineBatchers.set(key, new LineBatcher());
    }
    return this.lineBatchers.get(key);
  }

  /**
   * 指定キーのMeshBatcherを取得（なければ作成）
   *
   * @param {string} key - マテリアルタイプ等の識別キー
   * @returns {MeshBatcher}
   */
  getMeshBatcher(key) {
    if (!this.meshBatchers.has(key)) {
      this.meshBatchers.set(key, new MeshBatcher());
    }
    return this.meshBatchers.get(key);
  }

  /**
   * 全バッチャーのデータをクリア
   */
  clear() {
    this.lineBatchers.forEach((b) => b.clear());
    this.meshBatchers.forEach((b) => b.clear());
    this.lineBatchers.clear();
    this.meshBatchers.clear();
  }
}

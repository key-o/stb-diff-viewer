/**
 * @fileoverview 床要素のIFCエクスポーター
 * IFCExporterBaseを継承し、床（Slab）の出力機能を提供
 * 傾斜スラブにも対応
 */

import { IFCExporterBase, generateIfcGuid } from './IFCExporterBase.js';

/**
 * 床要素をIFCファイルとしてエクスポートするクラス
 */
export class IFCSlabExporter extends IFCExporterBase {
  constructor() {
    super();
  }

  /**
   * 頂点群から平面の法線ベクトルを計算（Newell's method）
   * @param {Array<{x: number, y: number, z: number}>} vertices - 頂点配列
   * @returns {{x: number, y: number, z: number}} 正規化された法線ベクトル
   * @private
   */
  _calculatePlaneNormal(vertices) {
    if (vertices.length < 3) {
      return { x: 0, y: 0, z: 1 };
    }

    if (vertices.length === 3) {
      // 3点の場合は単純に外積で計算
      const v1 = {
        x: vertices[1].x - vertices[0].x,
        y: vertices[1].y - vertices[0].y,
        z: vertices[1].z - vertices[0].z
      };
      const v2 = {
        x: vertices[2].x - vertices[0].x,
        y: vertices[2].y - vertices[0].y,
        z: vertices[2].z - vertices[0].z
      };
      const normal = {
        x: v1.y * v2.z - v1.z * v2.y,
        y: v1.z * v2.x - v1.x * v2.z,
        z: v1.x * v2.y - v1.y * v2.x
      };
      const len = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
      if (len < 1e-10) {
        return { x: 0, y: 0, z: 1 };
      }
      return { x: normal.x / len, y: normal.y / len, z: normal.z / len };
    }

    // 4点以上の場合：Newell's method で平均法線を計算
    const normal = { x: 0, y: 0, z: 0 };
    const n = vertices.length;

    for (let i = 0; i < n; i++) {
      const current = vertices[i];
      const next = vertices[(i + 1) % n];

      normal.x += (current.y - next.y) * (current.z + next.z);
      normal.y += (current.z - next.z) * (current.x + next.x);
      normal.z += (current.x - next.x) * (current.y + next.y);
    }

    const len = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
    if (len < 1e-10) {
      return { x: 0, y: 0, z: 1 };
    }
    return { x: normal.x / len, y: normal.y / len, z: normal.z / len };
  }

  /**
   * スラブが傾斜しているかどうかを判定
   * @param {{x: number, y: number, z: number}} normal - 法線ベクトル
   * @returns {boolean} 傾斜している場合true
   * @private
   */
  _isInclinedSlab(normal) {
    // 法線がほぼ垂直（Z軸に平行）なら水平スラブ
    return Math.abs(normal.z) < 0.9999;
  }

  /**
   * 床を追加（傾斜スラブ対応）
   * @param {Object} slabData - 床データ
   * @param {string} slabData.name - 床名
   * @param {Array<{x: number, y: number, z: number}>} slabData.vertices - 頂点座標配列 (mm)
   * @param {number} slabData.thickness - 床厚 (mm)
   * @param {string} [slabData.predefinedType='FLOOR'] - 床タイプ (FLOOR, ROOF, LANDING, BASESLAB)
   * @returns {number|null} 床エンティティID（失敗時はnull）
   */
  addSlab(slabData) {
    this._ensureInitialized();
    const w = this.writer;
    const {
      name = 'Slab',
      vertices,
      thickness = 150,
      predefinedType = 'FLOOR'
    } = slabData;

    // 必須パラメータチェック
    if (!vertices || vertices.length < 3) {
      console.warn(`[IFC Export] 床 "${name}" をスキップ: 頂点が3点未満です`);
      return null;
    }

    // 厚さチェック
    if (thickness <= 0) {
      console.warn(`[IFC Export] 床 "${name}" をスキップ: 厚さが0以下です`);
      return null;
    }

    // 1. 頂点の中心を計算
    const center = { x: 0, y: 0, z: 0 };
    for (const v of vertices) {
      center.x += v.x;
      center.y += v.y;
      center.z += v.z;
    }
    center.x /= vertices.length;
    center.y /= vertices.length;
    center.z /= vertices.length;

    // 2. 法線ベクトルを計算
    let normal = this._calculatePlaneNormal(vertices);

    // 法線が下向きの場合は反転（スラブ上面の法線は上向き）
    if (normal.z < 0) {
      normal = { x: -normal.x, y: -normal.y, z: -normal.z };
    }

    const isInclined = this._isInclinedSlab(normal);

    // 3. ローカル座標系の基底ベクトルを計算
    let axisX, axisY;
    if (isInclined) {
      // 傾斜スラブ：法線に垂直な軸を計算
      // axisX = globalX と normal の外積を正規化（水平方向に近い軸）
      const globalX = { x: 1, y: 0, z: 0 };

      // normal × globalX でY軸を計算
      let crossY = {
        x: normal.y * globalX.z - normal.z * globalX.y,
        y: normal.z * globalX.x - normal.x * globalX.z,
        z: normal.x * globalX.y - normal.y * globalX.x
      };
      let crossYLen = Math.sqrt(crossY.x * crossY.x + crossY.y * crossY.y + crossY.z * crossY.z);

      if (crossYLen < 1e-6) {
        // normal が X軸に平行な場合、Y軸を使う
        const globalY = { x: 0, y: 1, z: 0 };
        crossY = {
          x: normal.y * globalY.z - normal.z * globalY.y,
          y: normal.z * globalY.x - normal.x * globalY.z,
          z: normal.x * globalY.y - normal.y * globalY.x
        };
        crossYLen = Math.sqrt(crossY.x * crossY.x + crossY.y * crossY.y + crossY.z * crossY.z);
      }

      axisY = { x: crossY.x / crossYLen, y: crossY.y / crossYLen, z: crossY.z / crossYLen };

      // axisX = axisY × normal
      axisX = {
        x: axisY.y * normal.z - axisY.z * normal.y,
        y: axisY.z * normal.x - axisY.x * normal.z,
        z: axisY.x * normal.y - axisY.y * normal.x
      };
    } else {
      // 水平スラブ：標準の軸
      axisX = { x: 1, y: 0, z: 0 };
      axisY = { x: 0, y: 1, z: 0 };
    }

    // 4. 頂点をローカル座標系に投影
    const localVertices = [];
    for (const v of vertices) {
      const rel = { x: v.x - center.x, y: v.y - center.y, z: v.z - center.z };
      // ローカル座標 = (rel・axisX, rel・axisY)
      const localX = rel.x * axisX.x + rel.y * axisX.y + rel.z * axisX.z;
      const localY = rel.x * axisY.x + rel.y * axisY.y + rel.z * axisY.z;
      localVertices.push({ x: localX, y: localY });
    }

    // 5. ポリライン頂点を作成
    const polylinePoints = [];
    for (const lv of localVertices) {
      const pointId = w.createEntity('IFCCARTESIANPOINT', [[lv.x, lv.y]]);
      polylinePoints.push(`#${pointId}`);
    }
    // 閉じるために最初の点を追加
    const firstPointId = w.createEntity('IFCCARTESIANPOINT', [[localVertices[0].x, localVertices[0].y]]);
    polylinePoints.push(`#${firstPointId}`);

    // 6. ポリラインを作成
    const polylineId = w.createEntity('IFCPOLYLINE', [polylinePoints]);

    // 7. 任意形状プロファイルを作成
    const profileId = w.createEntity('IFCARBITRARYCLOSEDPROFILEDEF', [
      '.AREA.',
      'SlabProfile',
      `#${polylineId}`
    ]);

    // 8. 押出方向（法線の反対方向＝下向き）
    const extrudeDir = { x: -normal.x, y: -normal.y, z: -normal.z };
    const extrudeDirId = w.createEntity('IFCDIRECTION', [[extrudeDir.x, extrudeDir.y, extrudeDir.z]]);

    // 9. 押出形状を作成
    const solidId = w.createEntity('IFCEXTRUDEDAREASOLID', [
      `#${profileId}`,
      null,
      `#${extrudeDirId}`,
      thickness
    ]);

    // 10. 床の配置点（中心）
    const slabOrigin = w.createEntity('IFCCARTESIANPOINT', [[center.x, center.y, center.z]]);

    // 11. 配置座標系を作成
    let slabPlacement3D;
    if (isInclined) {
      // 傾斜スラブ：法線とX軸を指定
      const axisId = w.createEntity('IFCDIRECTION', [[normal.x, normal.y, normal.z]]);
      const refDirId = w.createEntity('IFCDIRECTION', [[axisX.x, axisX.y, axisX.z]]);
      slabPlacement3D = w.createEntity('IFCAXIS2PLACEMENT3D', [
        `#${slabOrigin}`,
        `#${axisId}`,
        `#${refDirId}`
      ]);
    } else {
      // 水平スラブ：デフォルトの座標系
      slabPlacement3D = w.createEntity('IFCAXIS2PLACEMENT3D', [
        `#${slabOrigin}`,
        null,
        null
      ]);
    }

    // 12. ローカル配置
    const slabLocalPlacement = w.createEntity('IFCLOCALPLACEMENT', [
      null,
      `#${slabPlacement3D}`
    ]);

    // 13. 形状表現
    const shapeRep = w.createEntity('IFCSHAPEREPRESENTATION', [
      `#${this._refs.bodyContext}`,
      'Body',
      'SweptSolid',
      [`#${solidId}`]
    ]);

    // 製品定義形状
    const productShape = w.createEntity('IFCPRODUCTDEFINITIONSHAPE', [
      null,
      null,
      [`#${shapeRep}`]
    ]);

    // 14. 床エンティティ
    const slabId = w.createEntity('IFCSLAB', [
      generateIfcGuid(),
      null,
      name,
      null,
      null,
      `#${slabLocalPlacement}`,
      `#${productShape}`,
      null,
      `.${predefinedType}.`
    ]);

    // 床を階に所属させる（最小Z座標で適切な階を決定）
    const slabZ = vertices.reduce((min, v) => Math.min(min, v.z), vertices[0].z);
    this._addToStorey(slabId, slabZ);

    return slabId;
  }

  /**
   * STB形式の床要素を追加
   * @param {Object} slabElement - STB床要素
   * @param {Map<string, {x: number, y: number, z: number}>} nodes - ノードマップ
   * @param {Map<string, Object>} slabSections - 床断面マップ
   * @returns {number|null} 床エンティティID
   */
  addSlabFromSTB(slabElement, nodes, slabSections) {
    const nodeIds = slabElement.node_ids;
    if (!nodeIds || nodeIds.length < 3) {
      console.warn(`[IFC Export] 床 "${slabElement.id}" をスキップ: ノードが不足しています`);
      return null;
    }

    // 頂点座標を取得（オフセット適用）
    const vertices = [];
    const offsets = slabElement.offsets || new Map();

    for (const nodeId of nodeIds) {
      const node = nodes.get(nodeId);
      if (!node) {
        console.warn(`[IFC Export] 床 "${slabElement.id}" をスキップ: ノード ${nodeId} が見つかりません`);
        return null;
      }

      const offset = offsets.get ? offsets.get(nodeId) : offsets[nodeId];
      const offsetX = offset?.offset_X || 0;
      const offsetY = offset?.offset_Y || 0;
      const offsetZ = offset?.offset_Z || 0;

      vertices.push({
        x: node.x + offsetX,
        y: node.y + offsetY,
        z: node.z + offsetZ
      });
    }

    // 断面データから厚さを取得
    let thickness = 150; // デフォルト
    if (slabSections) {
      const sectionData = slabSections.get(slabElement.id_section);
      if (sectionData) {
        thickness = sectionData.depth ||
                    sectionData.dimensions?.depth ||
                    sectionData.t ||
                    sectionData.thickness ||
                    150;
      }
    }

    // 床タイプを決定
    let predefinedType = 'FLOOR';
    if (slabElement.isFoundation) {
      predefinedType = 'BASESLAB';
    } else if (slabElement.kind_slab === 'ROOF') {
      predefinedType = 'ROOF';
    }

    return this.addSlab({
      name: slabElement.name || `Slab_${slabElement.id}`,
      vertices,
      thickness,
      predefinedType
    });
  }

  /**
   * IFCファイルを生成（床用デフォルトオプション）
   * @param {Object} options - オプション
   * @returns {string} IFCファイル内容
   */
  generate(options = {}) {
    return super.generate({
      fileName: options.fileName || 'slab_export.ifc',
      description: options.description || 'Slab IFC Export',
      ...options
    });
  }
}

/**
 * 簡易エクスポート関数
 * @param {Object} slabData - 床データ
 * @returns {string} IFCファイル内容
 */
export function exportSingleSlabToIFC(slabData) {
  const exporter = new IFCSlabExporter();
  exporter.addSlab(slabData);
  return exporter.generate();
}

export { generateIfcGuid } from './IFCExporterBase.js';

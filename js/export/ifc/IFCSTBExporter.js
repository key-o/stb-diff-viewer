/**
 * @fileoverview STB構造要素の統合IFCエクスポーター
 * 梁、柱、ブレース、床、壁を一つのIFCファイルにエクスポート
 */

import { IFCBeamExporter } from './IFCBeamExporter.js';
import { generateIfcGuid } from './IFCExporterBase.js';

/**
 * STB構造要素の統合エクスポーター
 * IFCBeamExporterを拡張して床・壁機能を追加
 */
export class IFCSTBExporter extends IFCBeamExporter {
  constructor() {
    super();
  }

  /**
   * 床を追加
   * @param {Object} slabData - 床データ
   * @param {string} slabData.name - 床名
   * @param {Array<{x: number, y: number, z: number}>} slabData.vertices - 頂点座標配列 (mm)
   * @param {number} slabData.thickness - 床厚 (mm)
   * @param {string} [slabData.predefinedType='FLOOR'] - 床タイプ
   * @returns {number|null} 床エンティティID
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

    if (!vertices || vertices.length < 3) {
      console.warn(`[IFC Export] 床 "${name}" をスキップ: 頂点が3点未満`);
      return null;
    }

    if (thickness <= 0) {
      console.warn(`[IFC Export] 床 "${name}" をスキップ: 厚さが不正`);
      return null;
    }

    // 頂点の中心を計算
    const center = { x: 0, y: 0, z: 0 };
    for (const v of vertices) {
      center.x += v.x;
      center.y += v.y;
      center.z += v.z;
    }
    center.x /= vertices.length;
    center.y /= vertices.length;
    center.z /= vertices.length;

    const topZ = center.z;

    // ポリライン頂点を作成
    const polylinePoints = [];
    for (const v of vertices) {
      const pointId = w.createEntity('IFCCARTESIANPOINT', [
        [v.x - center.x, v.y - center.y]
      ]);
      polylinePoints.push(`#${pointId}`);
    }
    // 閉じる
    const firstPointId = w.createEntity('IFCCARTESIANPOINT', [
      [vertices[0].x - center.x, vertices[0].y - center.y]
    ]);
    polylinePoints.push(`#${firstPointId}`);

    const polylineId = w.createEntity('IFCPOLYLINE', [polylinePoints]);

    const profileId = w.createEntity('IFCARBITRARYCLOSEDPROFILEDEF', [
      '.AREA.',
      'SlabProfile',
      `#${polylineId}`
    ]);

    const extrudeDirId = w.createEntity('IFCDIRECTION', [[0.0, 0.0, -1.0]]);

    const solidId = w.createEntity('IFCEXTRUDEDAREASOLID', [
      `#${profileId}`,
      null,
      `#${extrudeDirId}`,
      thickness
    ]);

    const slabOrigin = w.createEntity('IFCCARTESIANPOINT', [
      [center.x, center.y, topZ]
    ]);

    const slabPlacement3D = w.createEntity('IFCAXIS2PLACEMENT3D', [
      `#${slabOrigin}`,
      null,
      null
    ]);

    const slabLocalPlacement = w.createEntity('IFCLOCALPLACEMENT', [
      null,
      `#${slabPlacement3D}`
    ]);

    const shapeRep = w.createEntity('IFCSHAPEREPRESENTATION', [
      `#${this._refs.bodyContext}`,
      'Body',
      'SweptSolid',
      [`#${solidId}`]
    ]);

    const productShape = w.createEntity('IFCPRODUCTDEFINITIONSHAPE', [
      null,
      null,
      [`#${shapeRep}`]
    ]);

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

    // 床を階に所属させる（Z座標で適切な階を決定）
    const slabZ = Math.min(...vertices.map(v => v.z));
    this._addToStorey(slabId, slabZ);
    return slabId;
  }

  /**
   * 壁を追加
   * @param {Object} wallData - 壁データ
   * @param {string} wallData.name - 壁名
   * @param {Object} wallData.startPoint - 始点 {x, y, z} (mm)
   * @param {Object} wallData.endPoint - 終点 {x, y, z} (mm)
   * @param {number} wallData.height - 高さ (mm)
   * @param {number} wallData.thickness - 厚さ (mm)
   * @param {string} [wallData.predefinedType='STANDARD'] - 壁タイプ
   * @param {Array<Object>} [wallData.openings] - 開口情報配列
   * @returns {number|null} 壁エンティティID
   */
  addWall(wallData) {
    this._ensureInitialized();
    const w = this.writer;
    const {
      name = 'Wall',
      startPoint,
      endPoint,
      height = 3000,
      thickness = 200,
      predefinedType = 'STANDARD',
      openings = []
    } = wallData;

    if (!startPoint || !endPoint) {
      console.warn(`[IFC Export] 壁 "${name}" をスキップ: 始点・終点が不足`);
      return null;
    }

    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const wallLength = Math.sqrt(dx * dx + dy * dy);

    if (wallLength < 1 || height <= 0 || thickness <= 0) {
      console.warn(`[IFC Export] 壁 "${name}" をスキップ: 寸法が不正`);
      return null;
    }

    // 壁の方向ベクトル（正規化）
    const dirX = dx / wallLength;
    const dirY = dy / wallLength;

    // 矩形プロファイル（長さ x 厚さ）- XY平面上で壁の平面形状
    // X方向 = 壁の長さ、Y方向 = 壁の厚さ
    const profileId = w.createEntity('IFCRECTANGLEPROFILEDEF', [
      '.AREA.',
      'WallProfile',
      null,
      wallLength,   // XDim: 壁の長さ
      thickness     // YDim: 壁の厚さ
    ]);

    // 押出方向: Z軸（上向き）
    const extrudeDirId = w.createEntity('IFCDIRECTION', [[0.0, 0.0, 1.0]]);

    // 押出形状（Position = null でデフォルト原点から）
    const solidId = w.createEntity('IFCEXTRUDEDAREASOLID', [
      `#${profileId}`,
      null,               // Position: デフォルト
      `#${extrudeDirId}`,
      height              // Depth: 壁の高さ
    ]);

    // 壁の中心点を計算（始点と終点の中間）
    const centerX = (startPoint.x + endPoint.x) / 2;
    const centerY = (startPoint.y + endPoint.y) / 2;

    // 壁の配置原点
    const wallOrigin = w.createEntity('IFCCARTESIANPOINT', [
      [centerX, centerY, startPoint.z]
    ]);

    // 壁の向き: Z軸はデフォルト（上向き）、X軸は壁の長さ方向
    const wallRefDir = w.createEntity('IFCDIRECTION', [[dirX, dirY, 0.0]]);

    const wallPlacement3D = w.createEntity('IFCAXIS2PLACEMENT3D', [
      `#${wallOrigin}`,
      null,               // Axis: デフォルト（Z方向）
      `#${wallRefDir}`    // RefDirection: 壁の長さ方向
    ]);

    const wallLocalPlacement = w.createEntity('IFCLOCALPLACEMENT', [
      null,
      `#${wallPlacement3D}`
    ]);

    const shapeRep = w.createEntity('IFCSHAPEREPRESENTATION', [
      `#${this._refs.bodyContext}`,
      'Body',
      'SweptSolid',
      [`#${solidId}`]
    ]);

    const productShape = w.createEntity('IFCPRODUCTDEFINITIONSHAPE', [
      null,
      null,
      [`#${shapeRep}`]
    ]);

    const wallId = w.createEntity('IFCWALL', [
      generateIfcGuid(),
      null,
      name,
      null,
      null,
      `#${wallLocalPlacement}`,
      `#${productShape}`,
      null,
      `.${predefinedType}.`
    ]);

    // 壁を階に所属させる（Z座標で適切な階を決定）
    this._addToStorey(wallId, startPoint.z);

    // 開口を追加
    if (openings && openings.length > 0) {
      this._addOpeningsToWall(wallId, openings, {
        wallLength,
        height,
        thickness,
        wallLocalPlacement
      });
    }

    return wallId;
  }

  /**
   * 壁に開口を追加
   * @param {number} wallId - 壁エンティティID
   * @param {Array<Object>} openings - 開口情報配列
   * @param {Object} wallContext - 壁のコンテキスト情報
   */
  _addOpeningsToWall(wallId, openings, wallContext) {
    const w = this.writer;
    const { wallLength, height, thickness, wallLocalPlacement } = wallContext;

    for (const opening of openings) {
      const openingWidth = opening.width;
      const openingHeight = opening.height;

      // 開口サイズが有効か確認
      if (!openingWidth || openingWidth <= 0 || !openingHeight || openingHeight <= 0) {
        console.warn(`[IFC Export] 開口 "${opening.id}" をスキップ: サイズが不正です`);
        continue;
      }

      // 開口の名前
      const openingName = opening.name || `Opening_${opening.id}`;

      // 開口の矩形プロファイル（XY平面上）
      const openingProfileId = w.createEntity('IFCRECTANGLEPROFILEDEF', [
        '.AREA.',
        'OpeningProfile',
        null,
        openingWidth,     // 開口幅
        thickness + 100   // 厚さ方向に少し大きくして完全に貫通させる
      ]);

      // 押出方向（Z軸）
      const extrudeDirId = w.createEntity('IFCDIRECTION', [[0.0, 0.0, 1.0]]);

      // 開口の押出形状
      const openingSolidId = w.createEntity('IFCEXTRUDEDAREASOLID', [
        `#${openingProfileId}`,
        null,
        `#${extrudeDirId}`,
        openingHeight
      ]);

      // 開口の位置計算（壁ローカル座標系での位置）
      // positionX は壁の左端からの距離、positionY は下端からの高さ
      // 壁の中心が原点なので、オフセットを計算
      const openingCenterX = opening.positionX + openingWidth / 2 - wallLength / 2;
      const openingCenterY = 0; // 壁厚方向は中央
      const openingCenterZ = opening.positionY; // 壁下端からの高さ

      // 開口の配置（壁ローカル座標系内）
      const openingOrigin = w.createEntity('IFCCARTESIANPOINT', [
        [openingCenterX, openingCenterY - thickness / 2 - 50, openingCenterZ]
      ]);

      const openingPlacement3D = w.createEntity('IFCAXIS2PLACEMENT3D', [
        `#${openingOrigin}`,
        null,
        null
      ]);

      const openingLocalPlacement = w.createEntity('IFCLOCALPLACEMENT', [
        `#${wallLocalPlacement}`, // 壁を親とする
        `#${openingPlacement3D}`
      ]);

      // 形状表現
      const openingShapeRep = w.createEntity('IFCSHAPEREPRESENTATION', [
        `#${this._refs.bodyContext}`,
        'Body',
        'SweptSolid',
        [`#${openingSolidId}`]
      ]);

      const openingProductShape = w.createEntity('IFCPRODUCTDEFINITIONSHAPE', [
        null,
        null,
        [`#${openingShapeRep}`]
      ]);

      // IfcOpeningElementを作成
      const openingId = w.createEntity('IFCOPENINGELEMENT', [
        generateIfcGuid(),
        null,
        openingName,
        null,
        null,
        `#${openingLocalPlacement}`,
        `#${openingProductShape}`,
        null,
        '.OPENING.' // PredefinedType
      ]);

      // IfcRelVoidsElementで壁と開口を関連付け
      w.createEntity('IFCRELVOIDSELEMENT', [
        generateIfcGuid(),
        null,
        null,
        null,
        `#${wallId}`,      // RelatingBuildingElement (壁)
        `#${openingId}`    // RelatedOpeningElement (開口)
      ]);

      console.log(`[IFC Export] 開口 "${openingName}" を壁に追加しました`);
    }
  }

  /**
   * IFCファイルを生成
   * @param {Object} options - オプション
   * @returns {string} IFCファイル内容
   */
  generate(options = {}) {
    return super.generate({
      fileName: options.fileName || 'stb_export.ifc',
      description: options.description || 'STB Structure IFC Export',
      ...options
    });
  }
}

export { generateIfcGuid };

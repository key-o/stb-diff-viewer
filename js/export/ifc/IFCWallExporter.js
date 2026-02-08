/**
 * @fileoverview 壁要素のIFCエクスポーター
 * IFCExporterBaseを継承し、壁（Wall）の出力機能を提供
 * 開口（IfcOpeningElement）にも対応
 */

import { createLogger } from '../../utils/logger.js';
import { IFCExporterBase, generateIfcGuid } from './IFCExporterBase.js';

const log = createLogger('export:ifc-wall');

/**
 * 壁要素をIFCファイルとしてエクスポートするクラス
 */
export class IFCWallExporter extends IFCExporterBase {
  constructor() {
    super();
    // 開口の関連付け情報を保持
    this._wallOpenings = new Map(); // wallId -> [openingInfo, ...]
  }

  /**
   * 壁を追加
   * @param {Object} wallData - 壁データ
   * @param {string} wallData.name - 壁名
   * @param {Object} wallData.startPoint - 壁の始点（下端）{x, y, z} (mm)
   * @param {Object} wallData.endPoint - 壁の終点（下端）{x, y, z} (mm)
   * @param {number} wallData.height - 壁高さ (mm)
   * @param {number} wallData.thickness - 壁厚 (mm)
   * @param {string} [wallData.predefinedType='STANDARD'] - 壁タイプ
   * @param {Array<Object>} [wallData.openings] - 開口情報配列
   * @returns {number|null} 壁エンティティID（失敗時はnull）
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
      openings = [],
    } = wallData;

    // 必須パラメータチェック
    if (!startPoint || !endPoint) {
      log.warn(`壁 "${name}" をスキップ: 始点・終点が不足しています`);
      return null;
    }

    // 壁の長さを計算
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const wallLength = Math.sqrt(dx * dx + dy * dy);

    if (wallLength < 1) {
      log.warn(`壁 "${name}" をスキップ: 長さが不足しています`);
      return null;
    }

    if (height <= 0 || thickness <= 0) {
      log.warn(`壁 "${name}" をスキップ: 高さまたは厚さが不正です`);
      return null;
    }

    // 壁の方向ベクトル（正規化）
    const dirX = dx / wallLength;
    const dirY = dy / wallLength;

    // 1. 矩形プロファイル（長さ x 厚さ）- XY平面上で壁の平面形状
    // X方向 = 壁の長さ、Y方向 = 壁の厚さ
    const profileId = w.createEntity('IFCRECTANGLEPROFILEDEF', [
      '.AREA.', // ProfileType
      'WallProfile', // ProfileName
      null, // Position: デフォルト
      wallLength, // XDim: 壁の長さ (mm)
      thickness, // YDim: 壁の厚さ (mm)
    ]);

    // 2. 押出方向: Z軸（上向き）
    const extrudeDirId = w.createEntity('IFCDIRECTION', [[0.0, 0.0, 1.0]]);

    // 3. 押出形状（Position = null でデフォルト原点から）
    const solidId = w.createEntity('IFCEXTRUDEDAREASOLID', [
      `#${profileId}`, // SweptArea
      null, // Position: デフォルト
      `#${extrudeDirId}`, // ExtrudedDirection
      height, // Depth: 壁の高さ (mm)
    ]);

    // 4. 壁の中心点を計算（始点と終点の中間）
    const centerX = (startPoint.x + endPoint.x) / 2;
    const centerY = (startPoint.y + endPoint.y) / 2;

    // 壁の配置原点
    const wallOrigin = w.createEntity('IFCCARTESIANPOINT', [[centerX, centerY, startPoint.z]]);

    // 壁の向き: Z軸はデフォルト（上向き）、X軸は壁の長さ方向
    const wallRefDir = w.createEntity('IFCDIRECTION', [[dirX, dirY, 0.0]]);

    // 配置座標系
    const wallPlacement3D = w.createEntity('IFCAXIS2PLACEMENT3D', [
      `#${wallOrigin}`,
      null, // Axis: デフォルト（Z方向）
      `#${wallRefDir}`, // RefDirection: 壁の長さ方向
    ]);

    // ローカル配置
    const wallLocalPlacement = w.createEntity('IFCLOCALPLACEMENT', [
      null, // PlacementRelTo: グローバル配置
      `#${wallPlacement3D}`,
    ]);

    // 5. 形状表現
    const shapeRep = w.createEntity('IFCSHAPEREPRESENTATION', [
      `#${this._refs.bodyContext}`,
      'Body',
      'SweptSolid',
      [`#${solidId}`],
    ]);

    // 製品定義形状
    const productShape = w.createEntity('IFCPRODUCTDEFINITIONSHAPE', [
      null,
      null,
      [`#${shapeRep}`],
    ]);

    // 6. 壁エンティティ
    const wallId = w.createEntity('IFCWALL', [
      generateIfcGuid(), // GlobalId
      null, // OwnerHistory
      name, // Name
      null, // Description
      null, // ObjectType
      `#${wallLocalPlacement}`, // ObjectPlacement
      `#${productShape}`, // Representation
      null, // Tag
      `.${predefinedType}.`, // PredefinedType
    ]);

    // 壁を階に所属させる（Z座標で適切な階を決定）
    this._addToStorey(wallId, startPoint.z);

    // 7. 開口を追加
    if (openings && openings.length > 0) {
      this._addOpeningsToWall(wallId, openings, {
        wallLength,
        height,
        thickness,
        startPoint,
        dirX,
        dirY,
        wallLocalPlacement,
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
    const { wallLength, thickness, wallLocalPlacement } = wallContext;

    for (const opening of openings) {
      const openingWidth = opening.width;
      const openingHeight = opening.height;

      // 開口サイズが有効か確認
      if (openingWidth <= 0 || openingHeight <= 0) {
        log.warn(`開口 "${opening.id}" をスキップ: サイズが不正です`);
        continue;
      }

      // 開口の名前
      const openingName = opening.name || `Opening_${opening.id}`;

      // 開口の矩形プロファイル（XY平面上）
      const openingProfileId = w.createEntity('IFCRECTANGLEPROFILEDEF', [
        '.AREA.',
        'OpeningProfile',
        null,
        openingWidth, // 開口幅
        thickness + 100, // 厚さ方向に少し大きくして完全に貫通させる
      ]);

      // 押出方向（Z軸）
      const extrudeDirId = w.createEntity('IFCDIRECTION', [[0.0, 0.0, 1.0]]);

      // 開口の押出形状
      const openingSolidId = w.createEntity('IFCEXTRUDEDAREASOLID', [
        `#${openingProfileId}`,
        null,
        `#${extrudeDirId}`,
        openingHeight,
      ]);

      // 開口の位置計算（壁ローカル座標系での位置）
      // STBでは position_X は壁の左端からの距離、position_Y は下端からの高さ
      // 壁の中心が原点なので、オフセットを計算
      const openingCenterX = opening.positionX + openingWidth / 2 - wallLength / 2;
      // const openingCenterY = 0; // 壁厚方向は中央
      const openingCenterZ = opening.positionY; // 壁下端からの高さ

      // 開口の配置（壁ローカル座標系内）
      // 開口プロファイルは原点を中心とするため、Y=0で壁の中心に配置
      // プロファイルのYDimは thickness+100 なので、壁を完全に貫通する
      const openingOrigin = w.createEntity('IFCCARTESIANPOINT', [
        [openingCenterX, 0, openingCenterZ],
      ]);

      const openingPlacement3D = w.createEntity('IFCAXIS2PLACEMENT3D', [
        `#${openingOrigin}`,
        null,
        null,
      ]);

      const openingLocalPlacement = w.createEntity('IFCLOCALPLACEMENT', [
        `#${wallLocalPlacement}`, // 壁を親とする
        `#${openingPlacement3D}`,
      ]);

      // 形状表現
      const openingShapeRep = w.createEntity('IFCSHAPEREPRESENTATION', [
        `#${this._refs.bodyContext}`,
        'Body',
        'SweptSolid',
        [`#${openingSolidId}`],
      ]);

      const openingProductShape = w.createEntity('IFCPRODUCTDEFINITIONSHAPE', [
        null,
        null,
        [`#${openingShapeRep}`],
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
        '.OPENING.', // PredefinedType
      ]);

      // IfcRelVoidsElementで壁と開口を関連付け
      w.createEntity('IFCRELVOIDSELEMENT', [
        generateIfcGuid(),
        null,
        null,
        null,
        `#${wallId}`, // RelatingBuildingElement (壁)
        `#${openingId}`, // RelatedOpeningElement (開口)
      ]);
    }
  }

  /**
   * STB形式の壁要素を追加
   * @param {Object} wallElement - STB壁要素
   * @param {Map<string, {x: number, y: number, z: number}>} nodes - ノードマップ
   * @param {Map<string, Object>} wallSections - 壁断面マップ
   * @param {Map<string, Object>} openingElements - 開口情報マップ（オプション）
   * @returns {number|null} 壁エンティティID
   */
  addWallFromSTB(wallElement, nodes, wallSections, openingElements = null) {
    const nodeIds = wallElement.node_ids;
    if (!nodeIds || nodeIds.length < 4) {
      log.warn(`壁 "${wallElement.id}" をスキップ: ノードが4点未満です`);
      return null;
    }

    // 頂点座標を取得（オフセット適用）
    const vertices = [];
    const offsets = wallElement.offsets || new Map();

    for (const nodeId of nodeIds) {
      const node = nodes.get(nodeId);
      if (!node) {
        log.warn(`壁 "${wallElement.id}" をスキップ: ノード ${nodeId} が見つかりません`);
        return null;
      }

      const offset = offsets.get ? offsets.get(nodeId) : offsets[nodeId];
      const offsetX = offset?.offset_X || 0;
      const offsetY = offset?.offset_Y || 0;
      const offsetZ = offset?.offset_Z || 0;

      vertices.push({
        x: node.x + offsetX,
        y: node.y + offsetY,
        z: node.z + offsetZ,
      });
    }

    // 4点から壁の始点・終点・高さを計算
    // STBの壁は通常: 下面2点 (0, 1) → 上面2点 (2, 3)
    const p0 = vertices[0];
    const p1 = vertices[1];
    const p2 = vertices[2];
    const p3 = vertices[3];

    // 始点・終点（下面）
    const startPoint = { x: p0.x, y: p0.y, z: Math.min(p0.z, p1.z) };
    const endPoint = { x: p1.x, y: p1.y, z: Math.min(p0.z, p1.z) };

    // 高さ（Z座標の差）
    const bottomZ = Math.min(p0.z, p1.z);
    const topZ = Math.max(p2.z, p3.z);
    const height = topZ - bottomZ;

    if (height <= 0) {
      log.warn(`壁 "${wallElement.id}" をスキップ: 高さが0以下です`);
      return null;
    }

    // 断面データから厚さを取得
    let thickness = 200; // デフォルト
    if (wallSections) {
      const sectionData = wallSections.get(wallElement.id_section);
      if (sectionData) {
        thickness =
          sectionData.t ||
          sectionData.thickness ||
          sectionData.dimensions?.t ||
          sectionData.dimensions?.thickness ||
          200;
      }
    }

    // 壁タイプを決定
    let predefinedType = 'STANDARD';
    if (wallElement.kind_wall === 'WALL_SHEAR') {
      predefinedType = 'SHEAR';
    } else if (wallElement.kind_wall === 'WALL_PARTITION') {
      predefinedType = 'PARTITIONING';
    }

    // 開口情報を取得
    const openings = this._getOpeningsForWall(wallElement, openingElements);

    return this.addWall({
      name: wallElement.name || `Wall_${wallElement.id}`,
      startPoint,
      endPoint,
      height,
      thickness,
      predefinedType,
      openings,
    });
  }

  /**
   * 壁に関連付けられた開口情報を取得
   * @param {Object} wallElement - 壁要素
   * @param {Map<string, Object>} openingElements - 開口情報マップ
   * @returns {Array<Object>} 開口情報配列
   */
  _getOpeningsForWall(wallElement, openingElements) {
    const openings = [];

    if (!openingElements || openingElements.size === 0) {
      return openings;
    }

    // STB 2.0.2の場合: 壁のopen_idsを使用
    if (wallElement.open_ids && wallElement.open_ids.length > 0) {
      for (const openId of wallElement.open_ids) {
        const opening = openingElements.get(openId);
        if (opening) {
          openings.push({
            id: opening.id,
            name: opening.name,
            // 壁ローカル座標系での位置
            positionX: opening.position_X,
            positionY: opening.position_Y,
            // 開口の寸法
            width: opening.length_X,
            height: opening.length_Y,
            rotate: opening.rotate,
          });
        } else {
          log.warn(`壁 "${wallElement.id}": 開口 ${openId} が見つかりません`);
        }
      }
    } else {
      // STB 2.1.0の場合: id_memberを使用して壁と開口を関連付け
      for (const [_openId, opening] of openingElements) {
        if (
          opening.kind_member === 'WALL' &&
          String(opening.id_member) === String(wallElement.id)
        ) {
          openings.push({
            id: opening.id,
            name: opening.name,
            // 壁ローカル座標系での位置
            positionX: opening.position_X,
            positionY: opening.position_Y,
            // 開口の寸法
            width: opening.length_X,
            height: opening.length_Y,
            rotate: opening.rotate,
          });
        }
      }
    }

    return openings;
  }

  /**
   * IFCファイルを生成（壁用デフォルトオプション）
   * @param {Object} options - オプション
   * @returns {string} IFCファイル内容
   */
  generate(options = {}) {
    return super.generate({
      fileName: options.fileName || 'wall_export.ifc',
      description: options.description || 'Wall IFC Export',
      ...options,
    });
  }
}

/**
 * 簡易エクスポート関数
 * @param {Object} wallData - 壁データ
 * @returns {string} IFCファイル内容
 */
export function exportSingleWallToIFC(wallData) {
  const exporter = new IFCWallExporter();
  exporter.addWall(wallData);
  return exporter.generate();
}

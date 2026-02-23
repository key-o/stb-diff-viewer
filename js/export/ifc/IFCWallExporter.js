/**
 * @fileoverview 壁要素のIFCエクスポーター
 * IFCExporterBaseを継承し、壁（Wall）の出力機能を提供
 * 開口（IfcOpeningElement）にも対応
 */

import { createLogger } from '../../utils/logger.js';
import { IFCExporterBase } from './IFCExporterBase.js';

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

  // addWall() と _addOpeningsToWall() は IFCExporterBase に定義（共通実装）

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

/**
 * @fileoverview 壁形状生成モジュール
 *
 * BaseElementGeneratorを継承した統一アーキテクチャ:
 * - 4ノード（StbNodeIdOrder）による矩形形状
 * - 各ノードへのオフセット対応（StbWallOffset）
 * - 厚さ（t）による押し出し形状
 * - 開口部（StbOpen）対応
 * - STB形式とJSON形式の両対応
 *
 * 作成: 2025-12
 */

import * as THREE from 'three';
import { materials } from '../rendering/materials.js';
import { BaseElementGenerator } from './core/BaseElementGenerator.js';

/**
 * 壁形状生成クラス
 */
export class WallGenerator extends BaseElementGenerator {
  /**
   * ジェネレーター設定
   */
  static getConfig() {
    return {
      elementName: 'Wall',
      loggerName: 'viewer:geometry:wall',
      defaultElementType: 'Wall'
    };
  }

  /**
   * 壁要素からメッシュを作成
   * @param {Array} wallElements - 壁要素配列
   * @param {Map<string, THREE.Vector3>} nodes - ノードマップ
   * @param {Map<string, Object>} wallSections - 壁断面マップ
   * @param {Map<string, Object>} steelSections - 鋼材形状マップ（未使用だがインターフェース統一のため）
   * @param {string} elementType - 要素タイプ（デフォルト: "Wall"）
   * @param {boolean} isJsonInput - JSON入力かどうか
   * @param {Map<string, Object>} openingElements - 開口情報マップ（オプション）
   * @returns {Array<THREE.Mesh>} 生成されたメッシュ配列
   */
  static createWallMeshes(
    wallElements,
    nodes,
    wallSections,
    steelSections,
    elementType = 'Wall',
    isJsonInput = false,
    openingElements = null
  ) {
    // 開口情報をコンテキストに追加するためにcreateMeshesをオーバーライド
    const config = this.getConfig();
    const log = this._getLogger();

    if (!wallElements || wallElements.length === 0) {
      log.warn(`No ${config.elementName} elements provided.`);
      return [];
    }

    const meshes = [];
    let processed = 0;
    let skipped = 0;

    for (const element of wallElements) {
      const context = {
        nodes,
        sections: wallSections,
        steelSections,
        elementType,
        isJsonInput,
        log,
        openingElements // 開口情報を追加
      };

      try {
        const mesh = this._createSingleMesh(element, context);
        if (mesh) {
          meshes.push(mesh);
          processed++;
        } else {
          skipped++;
        }
      } catch (error) {
        log.warn(`Error creating ${config.elementName} ${element.id}:`, error.message);
        skipped++;
      }
    }

    log.info(`${config.elementName}: Created ${processed}, Skipped ${skipped}`);
    return meshes;
  }

  /**
   * 単一壁メッシュを作成（BaseElementGeneratorの抽象メソッドを実装）
   * @param {Object} wall - 壁要素
   * @param {Object} context - コンテキスト
   * @returns {THREE.Mesh|null} メッシュまたはnull
   */
  static _createSingleMesh(wall, context) {
    const { nodes, sections, elementType, isJsonInput, log, openingElements } = context;

    // 1. ノードIDリストの取得（壁は通常4点）
    const nodeIds = wall.node_ids;
    if (!nodeIds || nodeIds.length < 3) {
      log.warn(`Skipping wall ${wall.id}: Insufficient nodes (need at least 3, got ${nodeIds?.length || 0})`);
      return null;
    }

    // 2. 各ノードの座標を取得（オフセット適用）
    const vertices = [];
    const offsets = wall.offsets || new Map();

    for (const nodeId of nodeIds) {
      const node = nodes.get(nodeId);
      if (!node) {
        log.warn(`Skipping wall ${wall.id}: Node ${nodeId} not found`);
        return null;
      }

      // オフセットを適用
      const offset = offsets.get ? offsets.get(nodeId) : offsets[nodeId];
      const offsetX = offset?.offset_X || 0;
      const offsetY = offset?.offset_Y || 0;
      const offsetZ = offset?.offset_Z || 0;

      vertices.push(new THREE.Vector3(
        node.x + offsetX,
        node.y + offsetY,
        node.z + offsetZ
      ));
    }

    // 3. 断面データの取得（厚さ）
    let thickness = 200; // デフォルト厚さ (mm)

    if (sections) {
      const sectionId = isJsonInput ? wall.id_section : wall.id_section;
      const sectionData = sections.get(sectionId);
      if (sectionData) {
        // t属性を取得（様々なパターンに対応）
        thickness = sectionData.t ||
                    sectionData.thickness ||
                    sectionData.dimensions?.t ||
                    sectionData.dimensions?.thickness ||
                    200;
      }
    }

    log.debug(`Creating wall ${wall.id}: ${vertices.length} vertices, thickness=${thickness}mm`);

    // 4. 壁の形状を分析
    // STBの壁は通常、4つの頂点で矩形を定義
    // 頂点順序: 下面2点 → 上面2点 または 時計回り/反時計回りの矩形

    // 頂点の中心を計算
    const center = new THREE.Vector3();
    for (const v of vertices) {
      center.add(v);
    }
    center.divideScalar(vertices.length);

    // 5. 壁の方向を分析（下面の2点から水平方向を決定）
    // 4点の場合: 0-1が下辺、2-3が上辺と仮定
    let wallWidth, wallHeight;
    const wallDirection = new THREE.Vector3();
    const wallUp = new THREE.Vector3(0, 0, 1);
    const wallNormal = new THREE.Vector3();

    if (vertices.length === 4) {
      // STBの壁は4点で定義: ノード順序は 下1 下2 上2 上1 または 下1 下2 上1 上2
      // Z座標でソートして下辺と上辺を判定
      const sortedByZ = [...vertices].sort((a, b) => a.z - b.z);

      // 下辺の2点（Z座標が小さい方）
      const bottomPoints = [sortedByZ[0], sortedByZ[1]];
      // 上辺の2点（Z座標が大きい方）
      const topPoints = [sortedByZ[2], sortedByZ[3]];

      // 壁の高さ
      const bottomZ = (bottomPoints[0].z + bottomPoints[1].z) / 2;
      const topZ = (topPoints[0].z + topPoints[1].z) / 2;
      wallHeight = topZ - bottomZ;

      // 下辺の水平方向ベクトル
      // 元のノード順序（0→1）を尊重して方向を決定
      const p0 = vertices[0];
      const p1 = vertices[1];
      wallDirection.subVectors(p1, p0);
      wallDirection.z = 0; // 水平成分のみ
      wallDirection.normalize();

      // 壁の幅（下辺の水平距離）
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      wallWidth = Math.sqrt(dx * dx + dy * dy);

      // 壁の法線（水平方向と上方向の外積）
      wallNormal.crossVectors(wallDirection, wallUp).normalize();

      // 壁の中心を再計算（下辺中点から高さの半分上）
      const bottomCenter = new THREE.Vector3(
        (p0.x + p1.x) / 2,
        (p0.y + p1.y) / 2,
        bottomZ
      );
      center.set(
        bottomCenter.x,
        bottomCenter.y,
        bottomZ + wallHeight / 2
      );
    } else {
      // 3点以上の多角形の場合
      // 簡易的に最初の2点を下辺として使用
      const p0 = vertices[0];
      const p1 = vertices[1];

      wallDirection.subVectors(p1, p0).normalize();
      wallWidth = p0.distanceTo(p1);

      // 高さはZ座標の範囲から計算
      const zCoords = vertices.map(v => v.z);
      const minZ = Math.min(...zCoords);
      const maxZ = Math.max(...zCoords);
      wallHeight = maxZ - minZ || 1000; // デフォルト1000mm

      wallNormal.crossVectors(wallDirection, wallUp).normalize();
    }

    // 壁の寸法が不正な場合はスキップ
    if (wallWidth < 1 || wallHeight < 1) {
      log.warn(`Skipping wall ${wall.id}: Invalid dimensions (width=${wallWidth}, height=${wallHeight})`);
      return null;
    }

    log.debug(`Wall ${wall.id}: width=${wallWidth.toFixed(0)}, height=${wallHeight.toFixed(0)}, thickness=${thickness}`);

    // 6. 開口情報を取得
    const openings = this._getOpeningsForWall(wall, openingElements, log);

    // 7. ジオメトリを作成（開口がある場合はExtrudeGeometry、ない場合はBoxGeometry）
    let geometry;
    if (openings.length > 0) {
      geometry = this._createWallWithOpenings(wallWidth, wallHeight, thickness, openings, log);
      log.debug(`Wall ${wall.id}: Created geometry with ${openings.length} opening(s)`);
    } else {
      // 開口がない場合は従来のBoxGeometry
      geometry = new THREE.BoxGeometry(wallWidth, thickness, wallHeight);
    }

    if (!this._validateGeometry(geometry, wall, context)) {
      return null;
    }

    // 8. メッシュ作成
    const mesh = new THREE.Mesh(geometry, materials.matchedMesh);

    // 9. 配置と回転
    mesh.position.copy(center);

    // 壁の向きを設定（水平方向に合わせる）
    const angle = Math.atan2(wallDirection.y, wallDirection.x);
    mesh.rotation.z = angle;

    // 10. メタデータ設定
    mesh.userData = {
      id: wall.id,
      elementId: wall.id, // プロパティ表示用に追加
      name: wall.name || `Wall_${wall.id}`,
      elementType: elementType,
      stbElementId: wall.id,
      isSTB: !isJsonInput,
      sectionId: wall.id_section,
      wallData: {
        nodeIds: nodeIds,
        thickness: thickness,
        width: wallWidth,
        height: wallHeight,
        center: { x: center.x, y: center.y, z: center.z },
        direction: { x: wallDirection.x, y: wallDirection.y, z: wallDirection.z },
        normal: { x: wallNormal.x, y: wallNormal.y, z: wallNormal.z },
        kind_structure: wall.kind_structure,
        kind_layout: wall.kind_layout,
        kind_wall: wall.kind_wall,
        openIds: wall.open_ids,
        openings: openings // 解決された開口データ
      }
    };

    log.debug(
      `Wall ${wall.id}: center=(${center.x.toFixed(0)}, ${center.y.toFixed(0)}, ${center.z.toFixed(0)}), ` +
      `angle=${(angle * 180 / Math.PI).toFixed(1)}deg`
    );

    return mesh;
  }

  /**
   * 壁に関連付けられた開口情報を取得
   * @param {Object} wall - 壁要素
   * @param {Map<string, Object>} openingElements - 開口情報マップ
   * @param {Object} log - ロガー
   * @returns {Array<Object>} 開口情報配列
   */
  static _getOpeningsForWall(wall, openingElements, log) {
    const openings = [];

    if (!openingElements || !wall.open_ids || wall.open_ids.length === 0) {
      return openings;
    }

    for (const openId of wall.open_ids) {
      const opening = openingElements.get(openId);
      if (opening) {
        openings.push({
          id: opening.id,
          name: opening.name,
          // 壁ローカル座標系での位置（壁左下から）
          positionX: opening.position_X,
          positionY: opening.position_Y,
          // 開口の寸法
          width: opening.length_X,
          height: opening.length_Y,
          rotate: opening.rotate
        });
        log.debug(`Wall ${wall.id}: Found opening ${openId} (${opening.length_X}x${opening.length_Y} at ${opening.position_X},${opening.position_Y})`);
      } else {
        log.warn(`Wall ${wall.id}: Opening ${openId} not found in opening elements`);
      }
    }

    return openings;
  }

  /**
   * 開口付きの壁ジオメトリを作成（ExtrudeGeometry使用）
   * @param {number} wallWidth - 壁幅
   * @param {number} wallHeight - 壁高さ
   * @param {number} thickness - 壁厚さ
   * @param {Array<Object>} openings - 開口情報配列
   * @param {Object} log - ロガー
   * @returns {THREE.BufferGeometry} 生成されたジオメトリ
   */
  static _createWallWithOpenings(wallWidth, wallHeight, thickness, openings, log) {
    // 壁の外形（ローカル座標系: 中心が原点）
    const wallShape = new THREE.Shape();
    const halfWidth = wallWidth / 2;
    const halfHeight = wallHeight / 2;

    // 壁の外形を定義（反時計回り - THREE.jsのShapeの標準）
    // Shape座標: X=壁の幅方向, Y=壁の高さ方向
    // 後でrotateX(-90deg)で、Y→Zに変換される
    wallShape.moveTo(-halfWidth, -halfHeight);
    wallShape.lineTo(-halfWidth, halfHeight);
    wallShape.lineTo(halfWidth, halfHeight);
    wallShape.lineTo(halfWidth, -halfHeight);
    wallShape.lineTo(-halfWidth, -halfHeight);

    // 開口を穴として追加
    for (const opening of openings) {
      // STBの開口位置は壁の左下端（position_X=0が壁左端）からの距離
      // position_Yは壁下端からの高さ
      const openingLeft = opening.positionX - halfWidth;
      const openingBottom = opening.positionY - halfHeight;
      const openingRight = openingLeft + opening.width;
      const openingTop = openingBottom + opening.height;

      // 開口が壁の範囲内にあることを確認
      if (openingRight > halfWidth || openingTop > halfHeight ||
          openingLeft < -halfWidth || openingBottom < -halfHeight) {
        log.warn(`Opening ${opening.id} extends beyond wall bounds, clamping`);
      }

      // クランプ処理
      const clampedLeft = Math.max(openingLeft, -halfWidth + 1);
      const clampedRight = Math.min(openingRight, halfWidth - 1);
      const clampedBottom = Math.max(openingBottom, -halfHeight + 1);
      const clampedTop = Math.min(openingTop, halfHeight - 1);

      // 有効な開口サイズか確認
      if (clampedRight - clampedLeft < 10 || clampedTop - clampedBottom < 10) {
        log.warn(`Opening ${opening.id} too small after clamping, skipping`);
        continue;
      }

      // 穴を追加（時計回り - THREE.jsのShapeでは外形が反時計回り、穴は時計回り）
      const hole = new THREE.Path();
      hole.moveTo(clampedLeft, clampedBottom);
      hole.lineTo(clampedRight, clampedBottom);
      hole.lineTo(clampedRight, clampedTop);
      hole.lineTo(clampedLeft, clampedTop);
      hole.lineTo(clampedLeft, clampedBottom);
      wallShape.holes.push(hole);
    }

    // 押し出し設定（Y方向に押し出し）
    const extrudeSettings = {
      depth: thickness,
      bevelEnabled: false
    };

    const geometry = new THREE.ExtrudeGeometry(wallShape, extrudeSettings);

    // BoxGeometryと同じ座標系にするため回転と位置調整
    // ExtrudeGeometryはXY平面上にShapeを作成しZ方向に押し出す
    // しかし壁はXZ平面上にあるべきなので、-90度回転
    geometry.rotateX(-Math.PI / 2);

    // 押し出しはプラスY方向に行われるが、中心配置したいので移動
    geometry.translate(0, -thickness / 2, 0);

    return geometry;
  }
}

// デバッグ・開発支援
if (typeof window !== 'undefined') {
  window.WallGenerator = WallGenerator;
}

export default WallGenerator;

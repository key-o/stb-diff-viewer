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
import { colorManager } from '../rendering/colorManager.js';
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
      defaultElementType: 'Wall',
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
    openingElements = null,
  ) {
    // 開口情報をコンテキストに追加するためにcreateMeshesをオーバーライド
    const config = this.getConfig();
    const log = this._getLogger();

    if (!wallElements || wallElements.length === 0) {
      // 要素がない場合はdebugレベルで出力（頻繁に呼ばれるため）
      log.debug(`No ${config.elementName} elements provided.`);
      return [];
    }

    // 開口の逆引きインデックスを事前構築（STB 2.1.0形式対応: O(n²) → O(n)）
    const openingsByWallId = this._buildOpeningIndex(openingElements);

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
        openingElements, // 開口情報を追加
        openingsByWallId, // 逆引きインデックス
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
   * 開口要素の壁ID逆引きインデックスを構築
   * STB 2.1.0形式で id_member を使用する際の O(n²) ループを回避
   * @param {Map<string, Object>|null} openingElements - 開口情報マップ
   * @returns {Map<string, Array<[string, Object]>>} 壁ID → [openId, opening][] のマップ
   */
  static _buildOpeningIndex(openingElements) {
    const index = new Map();
    if (!openingElements) return index;

    for (const [openId, opening] of openingElements) {
      if (opening.kind_member === 'WALL' && opening.id_member != null) {
        const wallId = String(opening.id_member);
        if (!index.has(wallId)) {
          index.set(wallId, []);
        }
        index.get(wallId).push([openId, opening]);
      }
    }
    return index;
  }

  /**
   * 単一壁メッシュを作成（BaseElementGeneratorの抽象メソッドを実装）
   * @param {Object} wall - 壁要素
   * @param {Object} context - コンテキスト
   * @returns {THREE.Mesh|null} メッシュまたはnull
   */
  static _createSingleMesh(wall, context) {
    const { nodes, sections, elementType, isJsonInput, log, openingElements, openingsByWallId } =
      context;

    // 1. ノードIDリストの取得（壁は通常4点）
    const nodeIds = wall.node_ids;
    if (!nodeIds || nodeIds.length < 3) {
      log.warn(
        `Skipping wall ${wall.id}: Insufficient nodes (need at least 3, got ${nodeIds?.length || 0})`,
      );
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

      vertices.push(new THREE.Vector3(node.x + offsetX, node.y + offsetY, node.z + offsetZ));
    }

    // 3. 断面データの取得（厚さ）
    let thickness = 200; // デフォルト厚さ (mm)

    if (sections) {
      // 型統一: sectionExtractorは数値IDを整数として保存するため変換
      const rawId = wall.id_section;
      const parsedId = parseInt(rawId, 10);
      const sectionId = isNaN(parsedId) ? rawId : parsedId;
      const sectionData = sections.get(sectionId);
      if (sectionData) {
        // t属性を取得（様々なパターンに対応）
        thickness =
          sectionData.t ||
          sectionData.thickness ||
          sectionData.dimensions?.t ||
          sectionData.dimensions?.thickness ||
          200;
      }
    }

    log.debug(`Creating wall ${wall.id}: ${vertices.length} vertices, thickness=${thickness}mm`);

    // 4. 壁の形状を分析（オフセット適用後の座標を使用）
    // バウンディングボックス方式で計算するため、
    // ここでの単純な重心計算は削除し、後述のステップ5で正確な中心を計算する

    /* 削除: 重心計算
    // 頂点の中心を計算
    const center = new THREE.Vector3();
    for (const v of vertices) {
      center.add(v);
    }
    center.divideScalar(vertices.length);
    */

    // 5. 壁の方向と寸法を再計算（バウンディングボックス方式）
    // 配列コピーやソートを避け、min/maxスキャンで計算（GC負荷削減）

    // Z方向の範囲（高さ）をスキャンで取得
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const v of vertices) {
      if (v.z < minZ) minZ = v.z;
      if (v.z > maxZ) maxZ = v.z;
    }
    let wallHeight = maxZ - minZ;
    if (wallHeight < 1) wallHeight = 1000; // デフォルト高さ(異常値対応)

    // 壁の基準方向（Wall Direction）を決定
    // 下端付近の点（minZから許容誤差内）から最も離れた2点を探す
    const tolerance = 10; // 10mm
    let pStart = vertices[0];
    let pEnd = vertices[0];
    let maxDistSq = 0;

    // 下端点を集めつつ、最遠点ペアを同時に探す（配列コピー不要）
    let hasMultipleBottom = false;
    for (let i = 0; i < vertices.length; i++) {
      if (Math.abs(vertices[i].z - minZ) >= tolerance) continue;
      for (let j = i + 1; j < vertices.length; j++) {
        if (Math.abs(vertices[j].z - minZ) >= tolerance) continue;
        hasMultipleBottom = true;
        const dSq = vertices[i].distanceToSquared(vertices[j]);
        if (dSq > maxDistSq) {
          maxDistSq = dSq;
          pStart = vertices[i];
          pEnd = vertices[j];
        }
      }
    }

    if (!hasMultipleBottom && vertices.length >= 2) {
      // 下端点が1つしかない場合、全点から最遠点を探す（水平成分のみで）
      for (let i = 0; i < vertices.length; i++) {
        for (let j = i + 1; j < vertices.length; j++) {
          const dx = vertices[i].x - vertices[j].x;
          const dy = vertices[i].y - vertices[j].y;
          const dSq = dx * dx + dy * dy;
          if (dSq > maxDistSq) {
            maxDistSq = dSq;
            pStart = vertices[i];
            pEnd = vertices[j];
          }
        }
      }
    }

    // 壁の基準ベクトル（水平）- 一時Vector3を再利用
    const wallDirection = new THREE.Vector3(pEnd.x - pStart.x, pEnd.y - pStart.y, 0);
    if (wallDirection.lengthSq() > 0.0001) {
      wallDirection.normalize();
    } else {
      wallDirection.set(1, 0, 0); // デフォルトX軸
    }

    const wallNormal = new THREE.Vector3(-wallDirection.y, wallDirection.x, 0); // crossVectors(dir, (0,0,1)) の結果を直接計算

    // 全頂点をローカル座標軸に投影してバウンディングボックスを計算
    // dotを直接計算（Vector3アロケーション不要）
    let minL = Infinity,
      maxL = -Infinity;
    let minT = Infinity,
      maxT = -Infinity;

    for (const v of vertices) {
      // pStartからの相対ベクトルのdotを直接計算
      const relX = v.x - pStart.x;
      const relY = v.y - pStart.y;
      const relZ = v.z - pStart.z;

      const distL = relX * wallDirection.x + relY * wallDirection.y + relZ * wallDirection.z;
      const distT = relX * wallNormal.x + relY * wallNormal.y + relZ * wallNormal.z;

      if (distL < minL) minL = distL;
      if (distL > maxL) maxL = distL;
      if (distT < minT) minT = distT;
      if (distT > maxT) maxT = distT;
    }

    // 壁の幅を決定
    let wallWidth = maxL - minL;

    // 中心位置を決定（グローバル座標）
    // ローカルでの中心 = (minL + maxL)/2, (minT + maxT)/2, (minZ + maxZ relative)/2
    // これをグローバルに戻す

    // Length方向の中心オフセット（pStart基準）
    const centerL = (minL + maxL) / 2;
    // Thickness方向の中心オフセット（pStart基準）
    const centerT = (minT + maxT) / 2;
    // PStartのZ + 高さの半分
    const centerZ = minZ + wallHeight / 2;

    const center = new THREE.Vector3()
      .copy(pStart)
      .addScaledVector(wallDirection, centerL)
      .addScaledVector(wallNormal, centerT);
    center.z = centerZ;

    // もし幅が極端に小さい場合はデフォルト処理（柱のようなケース？）
    if (wallWidth < 1) wallWidth = 100;

    // 壁の寸法が不正な場合はスキップ
    if (wallWidth < 1 || wallHeight < 1) {
      log.warn(
        `Skipping wall ${wall.id}: Invalid dimensions (width=${wallWidth}, height=${wallHeight})`,
      );
      return null;
    }

    log.debug(
      `Wall ${wall.id}: width=${wallWidth.toFixed(0)}, height=${wallHeight.toFixed(0)}, thickness=${thickness}`,
    );

    // 6. 開口情報を取得
    const openings = this._getOpeningsForWall(wall, openingElements, log, openingsByWallId);

    // 7. ジオメトリを作成（開口がある場合はExtrudeGeometry、ない場合はBoxGeometry）
    let geometry;
    if (openings.length > 0) {
      geometry = this._createWallWithOpenings(wallWidth, wallHeight, thickness, openings, log);
      log.debug(`Wall ${wall.id}: Created geometry with ${openings.length} opening(s)`);
    } else {
      geometry = new THREE.BoxGeometry(wallWidth, thickness, wallHeight);
    }

    if (!this._validateGeometry(geometry, wall, context)) {
      return null;
    }

    // 8. メッシュ作成
    const mesh = new THREE.Mesh(
      geometry,
      colorManager.getMaterial('diff', { comparisonState: 'matched' }),
    );

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
        openings: openings, // 解決された開口データ
      },
    };

    log.debug(
      `Wall ${wall.id}: center=(${center.x.toFixed(0)}, ${center.y.toFixed(0)}, ${center.z.toFixed(0)}), ` +
        `angle=${((angle * 180) / Math.PI).toFixed(1)}deg`,
    );

    return mesh;
  }

  /**
   * 壁に関連付けられた開口情報を取得
   * @param {Object} wall - 壁要素
   * @param {Map<string, Object>} openingElements - 開口情報マップ
   * @param {Object} log - ロガー
   * @param {Map<string, Array>} [openingsByWallId] - 事前構築済み壁ID逆引きインデックス
   * @returns {Array<Object>} 開口情報配列
   */
  static _getOpeningsForWall(wall, openingElements, log, openingsByWallId = null) {
    const openings = [];

    if (!openingElements) {
      return openings;
    }

    /**
     * 開口データからpositionX/Yを取得（STB 2.0.2/2.1.0両対応）
     * STB 2.0.2では position_X/Y または offset_X/Y
     * STB 2.1.0では position_X/Y
     */
    const getOpeningPosition = (opening) => ({
      positionX: opening.position_X ?? opening.offset_X ?? 0,
      positionY: opening.position_Y ?? opening.offset_Y ?? 0,
    });

    /**
     * 開口をリストに追加するヘルパー
     */
    const addOpening = (openId, opening) => {
      const pos = getOpeningPosition(opening);
      openings.push({
        id: opening.id,
        name: opening.name,
        positionX: pos.positionX,
        positionY: pos.positionY,
        width: opening.length_X,
        height: opening.length_Y,
        rotate: opening.rotate,
      });
      log.debug(
        `Wall ${wall.id}: Found opening ${openId} (${opening.length_X}x${opening.length_Y} at ${pos.positionX},${pos.positionY})`,
      );
    };

    // STB 2.0.2形式: wall.open_ids から開口を取得（O(1) per opening via Map.get）
    if (wall.open_ids && wall.open_ids.length > 0) {
      for (const openId of wall.open_ids) {
        const opening = openingElements.get(openId);
        if (opening) {
          addOpening(openId, opening);
        } else {
          log.warn(`Wall ${wall.id}: Opening ${openId} not found in opening elements`);
        }
      }
    } else if (openingsByWallId) {
      // STB 2.1.0形式: 事前構築済みインデックスから O(1) で取得
      const wallOpenings = openingsByWallId.get(String(wall.id));
      if (wallOpenings) {
        for (const [openId, opening] of wallOpenings) {
          addOpening(openId, opening);
        }
      }
    } else {
      // フォールバック: 逆引きインデックスがない場合は線形探索
      for (const [openId, opening] of openingElements) {
        if (opening.kind_member === 'WALL' && String(opening.id_member) === String(wall.id)) {
          addOpening(openId, opening);
        }
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
      if (
        openingRight > halfWidth ||
        openingTop > halfHeight ||
        openingLeft < -halfWidth ||
        openingBottom < -halfHeight
      ) {
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
      bevelEnabled: false,
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

/**
 * @fileoverview 壁要素関連の再描画処理
 * 壁開口の座標計算・輪郭描画を担当
 */

import * as THREE from 'three';
import { getMaterialForElementWithMode } from '../../viewer/index.js';

// 壁・開口の最小寸法（mm）
const MIN_ELEMENT_SIZE_MM = 1;

// 開口Mapの壁ID逆引きインデックスキャッシュ（Map汚染を回避）
const _wallIndexCache = new WeakMap();

/**
 * 壁要素配列からID検索用Mapを生成
 * @param {Array<Object>} walls - 壁要素配列
 * @returns {Map<string, Object>} 壁IDをキーとしたマップ
 */
export function createWallLookup(walls) {
  const map = new Map();
  if (!walls || !Array.isArray(walls)) return map;
  for (const wall of walls) {
    if (wall?.id != null) {
      map.set(String(wall.id), wall);
    }
  }
  return map;
}

/**
 * 壁ローカル座標系を計算
 * WallGenerator と同等の考え方で、幅方向・法線・高さを推定する
 * @param {Array<Object>} vertexCoordsList - 壁頂点座標配列
 * @returns {Object|null} 壁ローカル座標系
 */
export function computeWallFrame(vertexCoordsList) {
  if (!Array.isArray(vertexCoordsList) || vertexCoordsList.length < 3) return null;

  const vertices = [];
  for (const p of vertexCoordsList) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
      return null;
    }
    vertices.push(new THREE.Vector3(p.x, p.y, p.z));
  }

  const sortedByZ = [...vertices].sort((a, b) => a.z - b.z);
  const minZ = sortedByZ[0].z;
  const maxZ = sortedByZ[sortedByZ.length - 1].z;
  const wallHeight = Math.max(maxZ - minZ, MIN_ELEMENT_SIZE_MM);

  const tolerance = 10;
  const bottomPoints = sortedByZ.filter((v) => Math.abs(v.z - minZ) < tolerance);

  let pStart = bottomPoints[0] || vertices[0];
  let pEnd = bottomPoints[0] || vertices[0];
  let maxDistSq = 0;

  if (bottomPoints.length >= 2) {
    for (let i = 0; i < bottomPoints.length; i++) {
      for (let j = i + 1; j < bottomPoints.length; j++) {
        const dSq = bottomPoints[i].distanceToSquared(bottomPoints[j]);
        if (dSq > maxDistSq) {
          maxDistSq = dSq;
          pStart = bottomPoints[i];
          pEnd = bottomPoints[j];
        }
      }
    }
  } else {
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

  const wallDirection = new THREE.Vector3().subVectors(pEnd, pStart);
  wallDirection.z = 0;
  if (wallDirection.lengthSq() > 0.0001) {
    wallDirection.normalize();
  } else {
    wallDirection.set(1, 0, 0);
  }

  const wallUp = new THREE.Vector3(0, 0, 1);
  const wallNormal = new THREE.Vector3().crossVectors(wallDirection, wallUp).normalize();

  let minL = Infinity;
  let maxL = -Infinity;
  let minT = Infinity;
  let maxT = -Infinity;

  for (const v of vertices) {
    const vec = new THREE.Vector3().subVectors(v, pStart);
    const distL = vec.dot(wallDirection);
    const distT = vec.dot(wallNormal);
    if (distL < minL) minL = distL;
    if (distL > maxL) maxL = distL;
    if (distT < minT) minT = distT;
    if (distT > maxT) maxT = distT;
  }

  const wallWidth = Math.max(maxL - minL, MIN_ELEMENT_SIZE_MM);
  const centerL = (minL + maxL) / 2;
  const centerT = (minT + maxT) / 2;
  const centerZ = minZ + wallHeight / 2;

  const center = new THREE.Vector3()
    .copy(pStart)
    .addScaledVector(wallDirection, centerL)
    .addScaledVector(wallNormal, centerT);
  center.z = centerZ;

  return { center, wallDirection, wallNormal, wallUp, wallWidth, wallHeight };
}

/**
 * 壁に紐づく開口情報を取得（STB 2.0.2/2.1.0両対応）
 * @param {Object} wall - 壁要素
 * @param {Map<string, Object>|null} openingElements - 開口情報マップ
 * @returns {Array<Object>} 開口配列
 */
export function resolveOpeningsForWall(wall, openingElements, rawWallElement = null) {
  const openings = [];
  if (!wall || !openingElements) return openings;

  const getOpeningPosition = (opening) => ({
    positionX: opening.position_X ?? opening.offset_X ?? 0,
    positionY: opening.position_Y ?? opening.offset_Y ?? 0,
  });

  const openIds = [];
  if (Array.isArray(wall.open_ids) && wall.open_ids.length > 0) {
    openIds.push(...wall.open_ids);
  }

  // フォールバック: 比較時の生XML要素から開口IDを直接抽出
  if (openIds.length === 0 && rawWallElement) {
    const addOpenId = (id) => {
      if (!id) return;
      const normalized = String(id).trim();
      if (!normalized) return;
      if (!openIds.includes(normalized)) {
        openIds.push(normalized);
      }
    };

    if (typeof rawWallElement.getElementsByTagNameNS === 'function') {
      const nsNodes = rawWallElement.getElementsByTagNameNS('*', 'StbOpenId');
      for (const node of nsNodes) {
        addOpenId(node.getAttribute?.('id'));
      }
    }
    if (typeof rawWallElement.getElementsByTagName === 'function') {
      const nodes = rawWallElement.getElementsByTagName('StbOpenId');
      for (const node of nodes) {
        addOpenId(node.getAttribute?.('id'));
      }
    }
  }

  if (openIds.length > 0) {
    for (const openId of openIds) {
      const opening = openingElements.get(openId);
      if (!opening) continue;
      const pos = getOpeningPosition(opening);
      openings.push({
        id: opening.id,
        width: opening.length_X,
        height: opening.length_Y,
        positionX: pos.positionX,
        positionY: pos.positionY,
      });
    }
  } else {
    // 逆引きインデックスがあれば使用（O(1)）、なければ線形探索にフォールバック
    const wallIdStr = String(wall.id);
    const wallIndex = _wallIndexCache.get(openingElements);
    if (wallIndex) {
      const indexed = wallIndex.get(wallIdStr);
      if (indexed) {
        for (const opening of indexed) {
          const pos = getOpeningPosition(opening);
          openings.push({
            id: opening.id,
            width: opening.length_X,
            height: opening.length_Y,
            positionX: pos.positionX,
            positionY: pos.positionY,
          });
        }
      }
    } else {
      for (const opening of openingElements.values()) {
        if (opening.kind_member === 'WALL' && String(opening.id_member) === wallIdStr) {
          const pos = getOpeningPosition(opening);
          openings.push({
            id: opening.id,
            width: opening.length_X,
            height: opening.length_Y,
            positionX: pos.positionX,
            positionY: pos.positionY,
          });
        }
      }
    }
  }

  return openings;
}

/**
 * 開口要素の壁ID逆引きインデックスを構築
 * @param {Map<string, Object>|null} openingElements - 開口情報マップ
 * @returns {Map<string, Array<Object>>} 壁ID → opening[] のマップ
 */
export function buildOpeningWallIndex(openingElements) {
  const index = new Map();
  if (!openingElements) return index;

  for (const opening of openingElements.values()) {
    if (opening.kind_member === 'WALL' && opening.id_member != null) {
      const wallId = String(opening.id_member);
      if (!index.has(wallId)) {
        index.set(wallId, []);
      }
      index.get(wallId).push(opening);
    }
  }
  return index;
}

/**
 * 開口輪郭をWallグループへ追加描画する（非ソリッド表示向け）
 * @param {Object} comparisonResult - 正規化済み比較結果
 * @param {THREE.Group} group - 壁グループ
 * @param {THREE.Box3} modelBounds - モデルバウンディング
 * @param {Map<string, Object>} wallMapA - モデルAの壁マップ
 * @param {Map<string, Object>} wallMapB - モデルBの壁マップ
 * @param {Map<string, Object>|null} openingMapA - モデルAの開口マップ
 * @param {Map<string, Object>|null} openingMapB - モデルBの開口マップ
 */
export function drawWallOpeningOutlines(
  comparisonResult,
  group,
  modelBounds,
  wallMapA,
  wallMapB,
  openingMapA,
  openingMapB,
  elementType = 'Wall',
) {
  if (!comparisonResult || !group) return;

  // 開口の壁ID逆引きインデックスを事前構築（O(n²)→O(n)最適化）
  if (openingMapA && !_wallIndexCache.has(openingMapA)) {
    _wallIndexCache.set(openingMapA, buildOpeningWallIndex(openingMapA));
  }
  if (openingMapB && !_wallIndexCache.has(openingMapB)) {
    _wallIndexCache.set(openingMapB, buildOpeningWallIndex(openingMapB));
  }

  const matchedItems = Array.isArray(comparisonResult.matched) ? comparisonResult.matched : [];
  const onlyAItems = Array.isArray(comparisonResult.onlyA) ? comparisonResult.onlyA : [];
  const onlyBItems = Array.isArray(comparisonResult.onlyB) ? comparisonResult.onlyB : [];

  const outlineOffset = 1;
  const minOpeningSize = 10;

  const drawForItem = (item, modelSource) => {
    const sourceData = modelSource === 'B' ? item : item?.dataA;
    const wallId = sourceData?.id;
    const vertexCoordsList = sourceData?.vertexCoordsList;
    if (!wallId || !Array.isArray(vertexCoordsList)) return;

    const wallMap = modelSource === 'B' ? wallMapB : wallMapA;
    const openingMap = modelSource === 'B' ? openingMapB : openingMapA;
    const wall = wallMap.get(String(wallId));
    if (!wall) return;

    const openings = resolveOpeningsForWall(wall, openingMap, sourceData?.rawElement || null);
    if (openings.length === 0) return;

    const frame = computeWallFrame(vertexCoordsList);
    if (!frame) return;

    const category = modelSource === 'A' ? 'onlyA' : modelSource === 'B' ? 'onlyB' : 'matched';
    const matchType = item?.matchType;
    const baseLineMaterial = getMaterialForElementWithMode(
      elementType,
      category,
      true,
      false,
      String(wallId),
      matchType,
    );
    const lineMaterial = baseLineMaterial.clone();
    lineMaterial.depthTest = false;
    lineMaterial.depthWrite = false;
    lineMaterial.transparent = true;
    lineMaterial.opacity = 0.95;

    const halfWidth = frame.wallWidth / 2;
    const halfHeight = frame.wallHeight / 2;

    for (const opening of openings) {
      const width = Number(opening.width) || 0;
      const height = Number(opening.height) || 0;
      if (width <= 0 || height <= 0) continue;

      const openingLeft = (Number(opening.positionX) || 0) - halfWidth;
      const openingBottom = (Number(opening.positionY) || 0) - halfHeight;
      const openingRight = openingLeft + width;
      const openingTop = openingBottom + height;

      const clampedLeft = Math.max(openingLeft, -halfWidth + MIN_ELEMENT_SIZE_MM);
      const clampedRight = Math.min(openingRight, halfWidth - MIN_ELEMENT_SIZE_MM);
      const clampedBottom = Math.max(openingBottom, -halfHeight + MIN_ELEMENT_SIZE_MM);
      const clampedTop = Math.min(openingTop, halfHeight - MIN_ELEMENT_SIZE_MM);

      if (
        clampedRight - clampedLeft < minOpeningSize ||
        clampedTop - clampedBottom < minOpeningSize
      ) {
        continue;
      }

      const toWorld = (localX, localY) =>
        frame.center
          .clone()
          .addScaledVector(frame.wallDirection, localX)
          .addScaledVector(frame.wallUp, localY)
          .addScaledVector(frame.wallNormal, outlineOffset);

      const p1 = toWorld(clampedLeft, clampedBottom);
      const p2 = toWorld(clampedRight, clampedBottom);
      const p3 = toWorld(clampedRight, clampedTop);
      const p4 = toWorld(clampedLeft, clampedTop);
      const points = [p1, p2, p3, p4, p1];
      points.forEach((p) => modelBounds.expandByPoint(p));

      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const openingLine = new THREE.Line(geometry, lineMaterial);
      openingLine.renderOrder = 20;
      openingLine.userData = {
        elementType,
        openingId: opening.id,
        hostElementId: String(wallId),
        modelSource,
        isOpeningOutline: true,
        isLine: true,
      };
      group.add(openingLine);
    }
  };

  for (const item of matchedItems) drawForItem(item, 'matched');
  for (const item of onlyAItems) drawForItem(item, 'A');
  for (const item of onlyBItems) drawForItem(item, 'B');
}

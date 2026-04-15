/**
 * @fileoverview DXF基本エンティティレンダラー
 *
 * 線分、ポリライン、円、円弧、点の描画を担当します。
 */

import * as THREE from 'three';
import { transformCoordinates } from './dxfCoordinates.js';

/**
 * 線分を描画
 * @param {Array} lines - 線分エンティティの配列
 * @param {THREE.Group} group - 追加先グループ
 * @param {Object} transformOptions - 座標変換オプション
 * @param {Array|null} visibleLayers - 表示レイヤーリスト
 */
export function renderLines(lines, group, transformOptions, visibleLayers) {
  for (const line of lines) {
    if (visibleLayers && !visibleLayers.includes(line.layer)) continue;

    const start = transformCoordinates(
      line.start.x,
      line.start.y,
      line.start.z || 0,
      transformOptions,
    );
    const end = transformCoordinates(line.end.x, line.end.y, line.end.z || 0, transformOptions);

    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([start.x, start.y, start.z, end.x, end.y, end.z]);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

    const material = new THREE.LineBasicMaterial({
      color: line.color,
      linewidth: 1,
    });

    const lineObj = new THREE.Line(geometry, material);
    lineObj.userData = {
      type: 'DXF_LINE',
      layer: line.layer,
      sourceType: 'dxf',
    };
    group.add(lineObj);
  }
}

/**
 * ポリラインを描画
 * @param {Array} polylines - ポリラインエンティティの配列
 * @param {THREE.Group} group - 追加先グループ
 * @param {Object} transformOptions - 座標変換オプション
 * @param {Array|null} visibleLayers - 表示レイヤーリスト
 */
export function renderPolylines(polylines, group, transformOptions, visibleLayers) {
  for (const pl of polylines) {
    if (visibleLayers && !visibleLayers.includes(pl.layer)) continue;

    const points = [];
    for (let i = 0; i < pl.points.length; i++) {
      const pt = pl.points[i];
      const transformed = transformCoordinates(pt.x, pt.y, pt.z || 0, transformOptions);
      points.push(new THREE.Vector3(transformed.x, transformed.y, transformed.z));

      // バルジ（円弧）の処理
      if (pt.bulge && Math.abs(pt.bulge) > 0.001 && i < pl.points.length - 1) {
        const nextPt = pl.points[i + 1];
        const arcPoints = calculateBulgeArc(pt, nextPt, pt.bulge, transformOptions);
        points.push(...arcPoints);
      }
    }

    // 閉じたポリラインの場合
    if (pl.closed && pl.points.length > 0) {
      const lastPt = pl.points[pl.points.length - 1];
      const firstPt = pl.points[0];

      if (lastPt.bulge && Math.abs(lastPt.bulge) > 0.001) {
        const arcPoints = calculateBulgeArc(lastPt, firstPt, lastPt.bulge, transformOptions);
        points.push(...arcPoints);
      }

      const firstTransformed = transformCoordinates(
        firstPt.x,
        firstPt.y,
        firstPt.z || 0,
        transformOptions,
      );
      points.push(new THREE.Vector3(firstTransformed.x, firstTransformed.y, firstTransformed.z));
    }

    if (points.length < 2) continue;

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: pl.color,
      linewidth: 1,
    });

    const lineObj = new THREE.Line(geometry, material);
    lineObj.userData = {
      type: 'DXF_POLYLINE',
      layer: pl.layer,
      closed: pl.closed,
      sourceType: 'dxf',
    };
    group.add(lineObj);
  }
}

/**
 * バルジ（円弧セグメント）を計算
 * @param {Object} startPt - 開始点
 * @param {Object} endPt - 終了点
 * @param {number} bulge - バルジ値
 * @param {Object} transformOptions - 座標変換オプション
 * @returns {THREE.Vector3[]} 円弧上の点の配列
 */
export function calculateBulgeArc(startPt, endPt, bulge, transformOptions) {
  const points = [];
  const segments = 16;

  const dx = endPt.x - startPt.x;
  const dy = endPt.y - startPt.y;
  const chord = Math.sqrt(dx * dx + dy * dy);

  if (chord < 0.0001) return points;

  const sagitta = (Math.abs(bulge) * chord) / 2;
  const radius = ((chord * chord) / 4 + sagitta * sagitta) / (2 * sagitta);

  const midX = (startPt.x + endPt.x) / 2;
  const midY = (startPt.y + endPt.y) / 2;

  const perpX = -dy / chord;
  const perpY = dx / chord;

  const direction = bulge > 0 ? 1 : -1;
  const centerOffset = direction * (radius - sagitta);

  const centerX = midX + perpX * centerOffset;
  const centerY = midY + perpY * centerOffset;

  const startAngle = Math.atan2(startPt.y - centerY, startPt.x - centerX);
  const endAngle = Math.atan2(endPt.y - centerY, endPt.x - centerX);

  let angleDiff = endAngle - startAngle;
  if (bulge > 0 && angleDiff < 0) angleDiff += 2 * Math.PI;
  if (bulge < 0 && angleDiff > 0) angleDiff -= 2 * Math.PI;

  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const angle = startAngle + angleDiff * t;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);

    const transformed = transformCoordinates(x, y, startPt.z || 0, transformOptions);
    points.push(new THREE.Vector3(transformed.x, transformed.y, transformed.z));
  }

  return points;
}

/**
 * 円を描画
 * @param {Array} circles - 円エンティティの配列
 * @param {THREE.Group} group - 追加先グループ
 * @param {Object} transformOptions - 座標変換オプション
 * @param {Array|null} visibleLayers - 表示レイヤーリスト
 */
export function renderCircles(circles, group, transformOptions, visibleLayers) {
  const segments = 64;

  for (const circle of circles) {
    if (visibleLayers && !visibleLayers.includes(circle.layer)) continue;

    const points = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = circle.center.x + Math.cos(angle) * circle.radius;
      const y = circle.center.y + Math.sin(angle) * circle.radius;
      const transformed = transformCoordinates(x, y, circle.center.z || 0, transformOptions);
      points.push(new THREE.Vector3(transformed.x, transformed.y, transformed.z));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: circle.color,
      linewidth: 1,
    });

    const circleObj = new THREE.Line(geometry, material);
    circleObj.userData = {
      type: 'DXF_CIRCLE',
      layer: circle.layer,
      radius: circle.radius,
      sourceType: 'dxf',
    };
    group.add(circleObj);
  }
}

/**
 * 円弧を描画
 * @param {Array} arcs - 円弧エンティティの配列
 * @param {THREE.Group} group - 追加先グループ
 * @param {Object} transformOptions - 座標変換オプション
 * @param {Array|null} visibleLayers - 表示レイヤーリスト
 */
export function renderArcs(arcs, group, transformOptions, visibleLayers) {
  const segments = 32;

  for (const arc of arcs) {
    if (visibleLayers && !visibleLayers.includes(arc.layer)) continue;

    const startAngle = (arc.startAngle * Math.PI) / 180;
    let endAngle = (arc.endAngle * Math.PI) / 180;

    // 角度の正規化
    if (endAngle < startAngle) {
      endAngle += Math.PI * 2;
    }

    const angleDiff = endAngle - startAngle;
    const points = [];

    for (let i = 0; i <= segments; i++) {
      const angle = startAngle + (i / segments) * angleDiff;
      const x = arc.center.x + Math.cos(angle) * arc.radius;
      const y = arc.center.y + Math.sin(angle) * arc.radius;
      const transformed = transformCoordinates(x, y, arc.center.z || 0, transformOptions);
      points.push(new THREE.Vector3(transformed.x, transformed.y, transformed.z));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: arc.color,
      linewidth: 1,
    });

    const arcObj = new THREE.Line(geometry, material);
    arcObj.userData = {
      type: 'DXF_ARC',
      layer: arc.layer,
      radius: arc.radius,
      sourceType: 'dxf',
    };
    group.add(arcObj);
  }
}

/**
 * 点を描画
 * @param {Array} points - 点エンティティの配列
 * @param {THREE.Group} group - 追加先グループ
 * @param {Object} transformOptions - 座標変換オプション
 * @param {Array|null} visibleLayers - 表示レイヤーリスト
 */
export function renderPoints(points, group, transformOptions, visibleLayers) {
  const { plane = 'xy' } = transformOptions;

  for (const point of points) {
    if (visibleLayers && !visibleLayers.includes(point.layer)) continue;

    // 点を小さな十字で表現
    const size = 50;

    // 配置面に応じて十字の方向を決定
    let h1, h2, v1, v2;
    if (plane === 'xy') {
      // XY平面: Xに水平、Yに垂直
      h1 = transformCoordinates(point.position.x - size / 2, point.position.y, 0, transformOptions);
      h2 = transformCoordinates(point.position.x + size / 2, point.position.y, 0, transformOptions);
      v1 = transformCoordinates(point.position.x, point.position.y - size / 2, 0, transformOptions);
      v2 = transformCoordinates(point.position.x, point.position.y + size / 2, 0, transformOptions);
    } else if (plane === 'xz') {
      // XZ平面: Xに水平、Zに垂直
      h1 = transformCoordinates(point.position.x - size / 2, point.position.y, 0, transformOptions);
      h2 = transformCoordinates(point.position.x + size / 2, point.position.y, 0, transformOptions);
      v1 = transformCoordinates(point.position.x, point.position.y - size / 2, 0, transformOptions);
      v2 = transformCoordinates(point.position.x, point.position.y + size / 2, 0, transformOptions);
    } else {
      // YZ平面: Yに水平、Zに垂直
      h1 = transformCoordinates(point.position.x - size / 2, point.position.y, 0, transformOptions);
      h2 = transformCoordinates(point.position.x + size / 2, point.position.y, 0, transformOptions);
      v1 = transformCoordinates(point.position.x, point.position.y - size / 2, 0, transformOptions);
      v2 = transformCoordinates(point.position.x, point.position.y + size / 2, 0, transformOptions);
    }

    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      // 水平線
      h1.x,
      h1.y,
      h1.z,
      h2.x,
      h2.y,
      h2.z,
      // 垂直線
      v1.x,
      v1.y,
      v1.z,
      v2.x,
      v2.y,
      v2.z,
    ]);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

    const material = new THREE.LineBasicMaterial({
      color: point.color,
      linewidth: 1,
    });

    const pointObj = new THREE.LineSegments(geometry, material);
    pointObj.userData = {
      type: 'DXF_POINT',
      layer: point.layer,
      sourceType: 'dxf',
    };
    group.add(pointObj);
  }
}

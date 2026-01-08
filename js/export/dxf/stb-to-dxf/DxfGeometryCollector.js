/**
 * @fileoverview DXFジオメトリ収集モジュール
 *
 * 3Dシーンからエッジ、ラベル、通り芯、レベル線を収集し、
 * 2D座標に投影する機能を提供します。
 */

import * as THREE from 'three';
import { createLogger } from '../../../utils/logger.js';
import {
  getElementGroupsInternal,
  getCurrentStoriesInternal,
  getCurrentAxesDataInternal,
} from './DxfProviders.js';

const log = createLogger('DxfGeometryCollector');

/**
 * カメラの向き（ビュー方向）を検出
 * @param {THREE.Camera} camera - カメラ
 * @returns {string} ビュー方向 ('top', 'front', 'back', 'left', 'right', 'other')
 */
export function detectViewDirection(camera) {
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);

  const absX = Math.abs(direction.x);
  const absY = Math.abs(direction.y);
  const absZ = Math.abs(direction.z);

  // 最も支配的な方向を判定
  if (absZ > absX && absZ > absY) {
    return direction.z > 0 ? 'top' : 'bottom';
  } else if (absY > absX && absY > absZ) {
    return direction.y > 0 ? 'front' : 'back';
  } else if (absX > absY && absX > absZ) {
    return direction.x > 0 ? 'right' : 'left';
  }

  return 'other';
}

/**
 * 3D点を2Dに投影（カメラのビュー方向に基づく）
 * @param {THREE.Vector3} point3D - 3D座標
 * @param {THREE.Camera} camera - カメラ
 * @param {string} viewDirection - ビュー方向
 * @returns {{x: number, y: number}} 2D座標
 */
export function projectPointTo2D(point3D, camera, viewDirection) {
  // ビュー方向に応じた投影
  switch (viewDirection) {
    case 'top':
    case 'bottom':
      // 平面図: XY平面に投影
      return { x: point3D.x, y: point3D.y };
    case 'front':
    case 'back':
      // 正面/背面図: XZ平面に投影
      return { x: point3D.x, y: point3D.z };
    case 'left':
    case 'right':
      // 側面図: YZ平面に投影
      return { x: point3D.y, y: point3D.z };
    default:
      // その他: カメラ座標系で投影
      const projected = point3D.clone().project(camera);
      // NDC (-1 to 1) をミリメートルにスケール（仮のスケール）
      return { x: projected.x * 10000, y: projected.y * 10000 };
  }
}

/**
 * 点がクリッピング範囲内かどうかを判定
 * @param {THREE.Vector3} point - 3D座標
 * @param {Object} clippingState - クリッピング状態
 * @returns {boolean} 範囲内かどうか
 */
export function isPointWithinClippingBounds(point, clippingState) {
  if (!clippingState || !clippingState.type || !clippingState.bounds) {
    return true; // クリッピングなしの場合は常にtrue
  }

  const { type, bounds } = clippingState;

  switch (type) {
    case 'story':
      // 階クリッピング: Z座標で判定
      return point.z >= bounds.lowerBound && point.z <= bounds.upperBound;
    case 'xAxis':
      // X軸クリッピング: X座標で判定
      return point.x >= bounds.lowerBound && point.x <= bounds.upperBound;
    case 'yAxis':
      // Y軸クリッピング: Y座標で判定
      return point.y >= bounds.lowerBound && point.y <= bounds.upperBound;
    default:
      return true;
  }
}

/**
 * メッシュからエッジを抽出
 * @param {THREE.Mesh} mesh - メッシュオブジェクト
 * @param {Object} clippingState - クリッピング状態（オプション）
 * @returns {Array} エッジの配列 [{start: Vector3, end: Vector3}, ...]
 */
export function extractEdgesFromMesh(mesh, clippingState = null) {
  const edges = [];

  if (!mesh.geometry) {
    return edges;
  }

  // EdgesGeometryを使用してエッジを抽出
  const edgesGeometry = new THREE.EdgesGeometry(mesh.geometry, 30); // 30度以上の角度でエッジ検出
  const positions = edgesGeometry.attributes.position;

  if (!positions) {
    return edges;
  }

  // ワールド座標に変換するための行列
  mesh.updateWorldMatrix(true, false);
  const worldMatrix = mesh.matrixWorld;

  for (let i = 0; i < positions.count; i += 2) {
    const start = new THREE.Vector3(
      positions.getX(i),
      positions.getY(i),
      positions.getZ(i),
    ).applyMatrix4(worldMatrix);

    const end = new THREE.Vector3(
      positions.getX(i + 1),
      positions.getY(i + 1),
      positions.getZ(i + 1),
    ).applyMatrix4(worldMatrix);

    // クリッピング範囲チェック（両端点のいずれかが範囲内であれば含める）
    if (clippingState && clippingState.type) {
      const startInBounds = isPointWithinClippingBounds(start, clippingState);
      const endInBounds = isPointWithinClippingBounds(end, clippingState);
      if (!startInBounds && !endInBounds) {
        continue; // 両端点とも範囲外はスキップ
      }
    }

    edges.push({ start, end });
  }

  edgesGeometry.dispose();
  return edges;
}

/**
 * ラベル（スプライト）を収集
 * @param {Array<string>} elementTypes - 対象の要素タイプ
 * @param {THREE.Camera} camera - カメラ（フラスタムチェック用）
 * @param {Object} clippingState - クリッピング状態（オプション）
 * @returns {Array} ラベル情報の配列 [{position: Vector3, text: string, elementType: string}, ...]
 */
export function collectLabelSprites(elementTypes, camera, clippingState = null) {
  const labels = [];
  const elementGroups = getElementGroupsInternal();

  // フラスタム（視錐台）を計算
  const frustum = new THREE.Frustum();
  const projScreenMatrix = new THREE.Matrix4();
  camera.updateMatrixWorld();
  projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projScreenMatrix);

  let totalChecked = 0;
  let inFrustumCount = 0;

  for (const elementType of elementTypes) {
    const group = elementGroups[elementType];
    if (!group) continue;

    group.traverse((child) => {
      // スプライト（ラベル）を収集
      if (child.isSprite && child.visible && child.userData.elementType === elementType) {
        totalChecked++;

        // ワールド座標を取得
        child.updateWorldMatrix(true, false);
        const worldPosition = new THREE.Vector3();
        child.getWorldPosition(worldPosition);

        // フラスタムチェック
        if (!frustum.containsPoint(worldPosition)) {
          return; // 表示範囲外はスキップ
        }

        // クリッピング範囲チェック
        if (clippingState && clippingState.type) {
          if (!isPointWithinClippingBounds(worldPosition, clippingState)) {
            return; // クリッピング範囲外はスキップ
          }
        }

        inFrustumCount++;

        labels.push({
          position: worldPosition.clone(),
          text: child.userData.labelText || child.userData.elementId || '',
          elementType: elementType,
        });
      }
    });
  }

  log.info(`収集したラベル: ${labels.length}個 (表示範囲内: ${inFrustumCount}/${totalChecked})`);
  return labels;
}

/**
 * 通り芯（Axis）の線分を収集（表示範囲内のみ）
 * @param {THREE.Camera} camera - カメラ（フラスタムチェック用）
 * @param {Object} clippingState - クリッピング状態（オプション）
 * @returns {Array} 線分情報の配列
 */
export function collectAxisLines(camera, clippingState = null) {
  const axisLines = [];
  const elementGroups = getElementGroupsInternal();
  const group = elementGroups['Axis'];

  if (!group) {
    log.warn('Axis group not found');
    return axisLines;
  }

  // フラスタム（視錐台）を計算
  const frustum = new THREE.Frustum();
  const projScreenMatrix = new THREE.Matrix4();
  camera.updateMatrixWorld();
  projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projScreenMatrix);

  let totalChecked = 0;
  let inFrustumCount = 0;

  group.traverse((child) => {
    // THREE.Line オブジェクトを収集
    if (child.isLine && child.visible && child.userData.elementType === 'Axis') {
      const geometry = child.geometry;
      const positions = geometry.attributes.position;

      if (positions && positions.count >= 2) {
        // ワールド座標に変換
        child.updateWorldMatrix(true, false);
        const worldMatrix = child.matrixWorld;

        const start = new THREE.Vector3(
          positions.getX(0),
          positions.getY(0),
          positions.getZ(0),
        ).applyMatrix4(worldMatrix);

        const end = new THREE.Vector3(
          positions.getX(1),
          positions.getY(1),
          positions.getZ(1),
        ).applyMatrix4(worldMatrix);

        totalChecked++;

        // フラスタムチェック
        const startInFrustum = frustum.containsPoint(start);
        const endInFrustum = frustum.containsPoint(end);

        if (!startInFrustum && !endInFrustum) {
          return;
        }

        // クリッピング範囲チェック
        if (clippingState && clippingState.type) {
          const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
          if (!isPointWithinClippingBounds(midpoint, clippingState)) {
            return;
          }
        }

        inFrustumCount++;

        axisLines.push({
          start: start.clone(),
          end: end.clone(),
          name: child.userData.elementId || 'Axis',
          axisType: child.userData.axisType || 'X',
          storyName: child.userData.storyName,
        });
      }
    }
  });

  log.info(`収集した通り芯: ${axisLines.length}本 (表示範囲内: ${inFrustumCount}/${totalChecked})`);
  return axisLines;
}

/**
 * 通り芯を指定した高さで生成する（階クリッピング時用）
 * @param {THREE.Camera} camera - カメラ
 * @param {Object} clippingState - クリッピング状態
 * @returns {Array} 線分情報の配列
 */
export function generateAxisLinesAtClippingHeight(camera, clippingState) {
  const axisLines = [];
  const axesData = getCurrentAxesDataInternal();
  const elementGroups = getElementGroupsInternal();

  if (!axesData || (!axesData.xAxes.length && !axesData.yAxes.length)) {
    log.info('通り芯データがありません');
    return axisLines;
  }

  // クリッピング状態から描画高さを決定
  let drawHeight = 0;
  let storyInfo = null;

  if (clippingState && clippingState.type === 'story' && clippingState.bounds) {
    const stories = getCurrentStoriesInternal();
    if (stories && clippingState.id) {
      storyInfo = stories.find((s) => s.id === clippingState.id);
      if (storyInfo) {
        drawHeight = storyInfo.height;
      } else {
        drawHeight = (clippingState.bounds.lowerBound + clippingState.bounds.upperBound) / 2;
      }
    }
  }

  // フラスタムを計算
  const frustum = new THREE.Frustum();
  const projScreenMatrix = new THREE.Matrix4();
  camera.updateMatrixWorld();
  projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projScreenMatrix);

  // モデルバウンドを取得
  const modelBounds = new THREE.Box3();
  for (const group of Object.values(elementGroups)) {
    if (group && group.children.length > 0) {
      const groupBox = new THREE.Box3().setFromObject(group);
      if (!groupBox.isEmpty()) {
        modelBounds.union(groupBox);
      }
    }
  }

  if (modelBounds.isEmpty()) {
    log.warn('モデルバウンドが空です');
    return axisLines;
  }

  const min = modelBounds.min;
  const max = modelBounds.max;
  const size = modelBounds.getSize(new THREE.Vector3());
  const extend = Math.max(size.x, size.y) * 0.15 + 500;
  const labelMargin = 0;

  // X軸通り芯（Y方向の線）を生成
  axesData.xAxes.forEach((axis) => {
    const x = axis.distance;
    const yStart = min.y - extend;
    const yEnd = max.y + extend;

    const start = new THREE.Vector3(x, yStart, drawHeight);
    const end = new THREE.Vector3(x, yEnd, drawHeight);
    const labelPos = new THREE.Vector3(x, yStart - labelMargin, drawHeight);

    // フラスタムチェック
    if (frustum.containsPoint(start) || frustum.containsPoint(end)) {
      axisLines.push({
        start: start.clone(),
        end: end.clone(),
        name: axis.name,
        axisType: 'X',
        storyName: storyInfo ? storyInfo.name : null,
        labelPosition: labelPos.clone(),
      });
    }
  });

  // Y軸通り芯（X方向の線）を生成
  axesData.yAxes.forEach((axis) => {
    const y = axis.distance;
    const xStart = min.x - extend;
    const xEnd = max.x + extend;

    const start = new THREE.Vector3(xStart, y, drawHeight);
    const end = new THREE.Vector3(xEnd, y, drawHeight);
    const labelPos = new THREE.Vector3(xStart - labelMargin, y, drawHeight);

    // フラスタムチェック
    if (frustum.containsPoint(start) || frustum.containsPoint(end)) {
      axisLines.push({
        start: start.clone(),
        end: end.clone(),
        name: axis.name,
        axisType: 'Y',
        storyName: storyInfo ? storyInfo.name : null,
        labelPosition: labelPos.clone(),
      });
    }
  });

  log.info(`生成した通り芯（高さ ${drawHeight}mm）: ${axisLines.length}本`);
  return axisLines;
}

/**
 * レベル線（階の高さを示す水平線）を収集する
 * @param {THREE.Camera} camera - カメラ
 * @param {Object} clippingState - クリッピング状態（オプション）
 * @returns {Array} レベル線情報の配列
 */
export function collectLevelLines(camera, clippingState = null) {
  const levelLines = [];
  const stories = getCurrentStoriesInternal();
  const elementGroups = getElementGroupsInternal();

  if (!stories || stories.length === 0) {
    log.info('階データがありません');
    return levelLines;
  }

  // フラスタムを計算
  const frustum = new THREE.Frustum();
  const projScreenMatrix = new THREE.Matrix4();
  camera.updateMatrixWorld();
  projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projScreenMatrix);

  // モデルバウンドを取得
  const modelBounds = new THREE.Box3();
  for (const group of Object.values(elementGroups)) {
    if (group && group.children.length > 0) {
      const groupBox = new THREE.Box3().setFromObject(group);
      if (!groupBox.isEmpty()) {
        modelBounds.union(groupBox);
      }
    }
  }

  if (modelBounds.isEmpty()) {
    log.warn('モデルバウンドが空です');
    return levelLines;
  }

  const min = modelBounds.min;
  const max = modelBounds.max;
  const size = modelBounds.getSize(new THREE.Vector3());
  const extend = Math.max(size.x, size.y) * 0.15 + 500;
  const labelMargin = 0;

  const viewDirection = detectViewDirection(camera);

  // 各階のレベル線を生成
  stories.forEach((story) => {
    const z = story.height;

    // クリッピング範囲チェック
    if (clippingState && clippingState.type === 'story' && clippingState.bounds) {
      const tolerance = 100;
      if (
        z < clippingState.bounds.lowerBound - tolerance ||
        z > clippingState.bounds.upperBound + tolerance
      ) {
        return;
      }
    }

    let start, end, labelPos;

    if (viewDirection === 'front' || viewDirection === 'back') {
      start = new THREE.Vector3(min.x - extend, (min.y + max.y) / 2, z);
      end = new THREE.Vector3(max.x + extend, (min.y + max.y) / 2, z);
      labelPos = new THREE.Vector3(min.x - extend - labelMargin, (min.y + max.y) / 2, z);

      if (clippingState && clippingState.type === 'yAxis' && clippingState.bounds) {
        const clippingY = (clippingState.bounds.lowerBound + clippingState.bounds.upperBound) / 2;
        start.y = clippingY;
        end.y = clippingY;
        labelPos.y = clippingY;
      }
    } else if (viewDirection === 'left' || viewDirection === 'right') {
      start = new THREE.Vector3((min.x + max.x) / 2, min.y - extend, z);
      end = new THREE.Vector3((min.x + max.x) / 2, max.y + extend, z);
      labelPos = new THREE.Vector3((min.x + max.x) / 2, min.y - extend - labelMargin, z);

      if (clippingState && clippingState.type === 'xAxis' && clippingState.bounds) {
        const clippingX = (clippingState.bounds.lowerBound + clippingState.bounds.upperBound) / 2;
        start.x = clippingX;
        end.x = clippingX;
        labelPos.x = clippingX;
      }
    } else {
      start = new THREE.Vector3(min.x - extend, min.y - extend, z);
      end = new THREE.Vector3(max.x + extend, min.y - extend, z);
      labelPos = new THREE.Vector3(min.x - extend - labelMargin, min.y - extend, z);
    }

    // フラスタムチェック
    if (frustum.containsPoint(start) || frustum.containsPoint(end)) {
      levelLines.push({
        start: start.clone(),
        end: end.clone(),
        name: story.name,
        height: z,
        labelPosition: labelPos.clone(),
      });
    }
  });

  log.info(`収集したレベル線: ${levelLines.length}本`);
  return levelLines;
}

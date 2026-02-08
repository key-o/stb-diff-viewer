/**
 * @fileoverview バッチ処理対応構造要素描画モジュール
 *
 * 複数の要素ジオメトリを結合してドローコールを削減し、
 * 大規模モデルのレンダリング性能を向上させます。
 *
 * 既存のelements.jsと共存し、要素数に応じて自動的に切り替えます。
 */

import * as THREE from 'three';
import { createLogger } from '../../utils/logger.js';
import { getMaterialForElementWithMode } from './materials.js';
import { LineBatcher, getHitElementFromBatch } from './geometryBatcher.js';
import { getState } from '../../app/globalState.js';

const log = createLogger('viewer:batchedElements');

// ============================================
// ラベル処理プロバイダー（依存性注入）
// ============================================

/**
 * @typedef {Object} LabelProvider
 * @property {function(Object, string): string} generateLabelText - ラベルテキスト生成
 * @property {function(THREE.Sprite, Object): void} attachElementDataToLabel - 要素データをラベルに付与
 * @property {function(string, THREE.Vector3, THREE.Group, string, Object=): THREE.Sprite|null} createLabelSprite - ラベルスプライト作成
 */

/** @type {LabelProvider|null} */
let labelProvider = null;

/**
 * ラベルプロバイダーを設定（依存性注入）
 * @param {LabelProvider} provider - ラベルプロバイダー
 */
export function setLabelProvider(provider) {
  labelProvider = provider;
}

/**
 * ラベルスプライトを作成（プロバイダー経由）
 * @param {string} text - ラベルテキスト
 * @param {THREE.Vector3} position - 位置
 * @param {THREE.Group} group - グループ
 * @param {string} elementType - 要素タイプ
 * @param {Object} [meta] - メタ情報
 * @returns {THREE.Sprite|null} ラベルスプライト
 */
function createLabelSpriteInternal(text, position, group, elementType, meta) {
  if (labelProvider && labelProvider.createLabelSprite) {
    return labelProvider.createLabelSprite(text, position, group, elementType, meta);
  }
  // プロバイダー未設定時はnull（初期化タイミングによる正常な状態）
  return null;
}

/**
 * ラベルテキストを生成（プロバイダー経由）
 * @param {Object} element - 要素データ
 * @param {string} elementType - 要素タイプ
 * @returns {string} ラベルテキスト
 */
function generateLabelTextInternal(element, elementType) {
  if (labelProvider && labelProvider.generateLabelText) {
    return labelProvider.generateLabelText(element, elementType);
  }
  // フォールバック: 要素名またはID
  return element.name || element.id || '';
}

/**
 * 要素データをラベルに付与（プロバイダー経由）
 * @param {THREE.Sprite} sprite - ラベルスプライト
 * @param {Object} element - 要素データ
 */
function attachElementDataToLabelInternal(sprite, element) {
  if (labelProvider && labelProvider.attachElementDataToLabel) {
    labelProvider.attachElementDataToLabel(sprite, element);
  }
}

/**
 * バッチ処理を使用する要素数の閾値
 * この数を超える場合にバッチ処理を使用
 */
const BATCH_THRESHOLD = 100;

/**
 * バッチ処理を使用するかどうかを判定
 *
 * @param {Object} comparisonResult - 比較結果
 * @returns {boolean} バッチ処理を使用すべきかどうか
 */
export function shouldUseBatchRendering(comparisonResult) {
  const totalElements =
    (comparisonResult.matched?.length || 0) +
    (comparisonResult.onlyA?.length || 0) +
    (comparisonResult.onlyB?.length || 0);

  return totalElements >= BATCH_THRESHOLD;
}

/**
 * バッチ処理で線要素を描画
 *
 * @param {Object} comparisonResult - 比較結果
 * @param {Object} materials - マテリアル
 * @param {THREE.Group} group - 描画グループ
 * @param {string} elementType - 要素タイプ
 * @param {boolean} labelToggle - ラベル表示の有無
 * @param {THREE.Box3} modelBounds - モデル境界
 * @returns {Array<THREE.Sprite>} 作成されたラベル
 */
export function drawLineElementsBatched(
  comparisonResult,
  materials,
  group,
  elementType,
  labelToggle,
  modelBounds,
) {
  group.clear();
  const createdLabels = [];

  log.info(`Drawing batched line elements for ${elementType}:`, {
    matched: comparisonResult.matched.length,
    onlyA: comparisonResult.onlyA.length,
    onlyB: comparisonResult.onlyB.length,
  });

  // カテゴリごとにバッチャーを作成
  const matchedBatcher = new LineBatcher();
  const onlyABatcher = new LineBatcher();
  const onlyBBatcher = new LineBatcher();

  // Matched要素を処理
  comparisonResult.matched.forEach((item) => {
    const { dataA, dataB, importance, matchType } = item;
    const startCoords = dataA.startCoords;
    const endCoords = dataA.endCoords;

    if (!isValidCoords(startCoords) || !isValidCoords(endCoords)) {
      return;
    }

    const startVec = new THREE.Vector3(startCoords.x, startCoords.y, startCoords.z);
    const endVec = new THREE.Vector3(endCoords.x, endCoords.y, endCoords.z);

    matchedBatcher.addLine(startVec, endVec, {
      elementType,
      elementIdA: dataA.id,
      elementIdB: dataB.id,
      modelSource: 'matched',
      originalId: dataA.id,
      id: dataA.id,
      importance,
      toleranceState: matchType,
      isLine: true,
    });

    modelBounds.expandByPoint(startVec);
    modelBounds.expandByPoint(endVec);

    // ラベル作成（バッチ処理でも個別に作成）
    if (labelToggle && (dataA.id || dataB.id)) {
      const label = createBatchedLabel(
        startVec,
        endVec,
        dataA,
        dataB,
        'matched',
        elementType,
        group,
      );
      if (label) createdLabels.push(label);
    }
  });

  // OnlyA要素を処理
  comparisonResult.onlyA.forEach((item) => {
    const { startCoords, endCoords, id, element, importance } = item;

    if (!isValidCoords(startCoords) || !isValidCoords(endCoords)) {
      return;
    }

    const startVec = new THREE.Vector3(startCoords.x, startCoords.y, startCoords.z);
    const endVec = new THREE.Vector3(endCoords.x, endCoords.y, endCoords.z);

    onlyABatcher.addLine(startVec, endVec, {
      elementType,
      elementId: id,
      modelSource: 'A',
      importance,
      isLine: true,
    });

    modelBounds.expandByPoint(startVec);
    modelBounds.expandByPoint(endVec);

    if (labelToggle && id) {
      const label = createSingleModelLabel(
        startVec,
        endVec,
        id,
        element,
        'A',
        elementType,
        group,
        150,
      );
      if (label) createdLabels.push(label);
    }
  });

  // OnlyB要素を処理
  comparisonResult.onlyB.forEach((item) => {
    const { startCoords, endCoords, id, element, importance } = item;

    if (!isValidCoords(startCoords) || !isValidCoords(endCoords)) {
      return;
    }

    const startVec = new THREE.Vector3(startCoords.x, startCoords.y, startCoords.z);
    const endVec = new THREE.Vector3(endCoords.x, endCoords.y, endCoords.z);

    onlyBBatcher.addLine(startVec, endVec, {
      elementType,
      elementId: id,
      modelSource: 'B',
      importance,
      isLine: true,
    });

    modelBounds.expandByPoint(startVec);
    modelBounds.expandByPoint(endVec);

    if (labelToggle && id) {
      const label = createSingleModelLabel(
        startVec,
        endVec,
        id,
        element,
        'B',
        elementType,
        group,
        -150,
      );
      if (label) createdLabels.push(label);
    }
  });

  // バッチをビルドしてグループに追加
  if (matchedBatcher.count > 0) {
    const material = getMaterialForElementWithMode(elementType, 'matched', true, false, null);
    const batchedLines = matchedBatcher.build(material);
    batchedLines.userData.batchType = 'matched';
    group.add(batchedLines);
  }

  if (onlyABatcher.count > 0) {
    const material = getMaterialForElementWithMode(elementType, 'onlyA', true, false, null);
    const batchedLines = onlyABatcher.build(material);
    batchedLines.userData.batchType = 'onlyA';
    group.add(batchedLines);
  }

  if (onlyBBatcher.count > 0) {
    const material = getMaterialForElementWithMode(elementType, 'onlyB', true, false, null);
    const batchedLines = onlyBBatcher.build(material);
    batchedLines.userData.batchType = 'onlyB';
    group.add(batchedLines);
  }

  log.info(`Batched ${elementType} rendering summary:`, {
    matchedSegments: matchedBatcher.count,
    onlyASegments: onlyABatcher.count,
    onlyBSegments: onlyBBatcher.count,
    totalDrawCalls: 3, // matched, onlyA, onlyB
    labelsCreated: createdLabels.length,
  });

  return createdLabels;
}

/**
 * 座標が有効かどうかを確認
 *
 * @param {Object} coords - 座標オブジェクト
 * @returns {boolean}
 */
function isValidCoords(coords) {
  return (
    coords && Number.isFinite(coords.x) && Number.isFinite(coords.y) && Number.isFinite(coords.z)
  );
}

/**
 * バッチ処理用のラベルを作成（matched要素用）
 *
 * @param {THREE.Vector3} startVec - 始点
 * @param {THREE.Vector3} endVec - 終点
 * @param {Object} dataA - モデルAのデータ
 * @param {Object} dataB - モデルBのデータ
 * @param {string} modelSource - モデルソース
 * @param {string} elementType - 要素タイプ
 * @param {THREE.Group} group - 描画グループ
 * @returns {THREE.Sprite|null}
 */
function createBatchedLabel(startVec, endVec, dataA, dataB, modelSource, elementType, group) {
  const midPoint = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);

  const contentType = getState('ui.labelContentType') || 'id';
  let labelText;

  if (contentType === 'id') {
    labelText = `${dataA.id || '?'} / ${dataB.id || '?'}`;
  } else {
    const nameA = dataA.element?.name || dataA.id;
    const nameB = dataB.element?.name || dataB.id;
    labelText = `${nameA || '?'} / ${nameB || '?'}`;
  }

  const sprite = createLabelSpriteInternal(labelText, midPoint, group, elementType);
  if (sprite) {
    sprite.userData.elementIdA = dataA.id;
    sprite.userData.elementIdB = dataB.id;
    sprite.userData.modelSource = modelSource;

    if (dataA.element) {
      attachElementDataToLabelInternal(sprite, dataA.element);
    }
  }

  return sprite;
}

/**
 * 単一モデル要素用のラベルを作成
 *
 * @param {THREE.Vector3} startVec - 始点
 * @param {THREE.Vector3} endVec - 終点
 * @param {string} id - 要素ID
 * @param {Object} element - 要素データ
 * @param {string} modelSource - モデルソース（'A' or 'B'）
 * @param {string} elementType - 要素タイプ
 * @param {THREE.Group} group - 描画グループ
 * @param {number} offsetAmount - ラベルオフセット量
 * @returns {THREE.Sprite|null}
 */
function createSingleModelLabel(
  startVec,
  endVec,
  id,
  element,
  modelSource,
  elementType,
  group,
  offsetAmount,
) {
  const midPoint = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);

  const direction = endVec.clone().sub(startVec).normalize();
  let offsetDir = new THREE.Vector3(-direction.y, direction.x, 0).normalize();
  if (offsetDir.lengthSq() < 0.1) offsetDir = new THREE.Vector3(1, 0, 0);

  const labelPosition = midPoint.clone().add(offsetDir.multiplyScalar(offsetAmount));

  const contentType = getState('ui.labelContentType') || 'id';
  let displayText = id;

  if (contentType === 'name' && element?.name) {
    displayText = element.name;
  } else if (contentType === 'section') {
    displayText = generateLabelTextInternal(element, elementType);
  }

  const labelText = `${modelSource}: ${displayText}`;
  const sprite = createLabelSpriteInternal(labelText, labelPosition, group, elementType);

  if (sprite) {
    sprite.userData.elementId = id;
    sprite.userData.modelSource = modelSource;

    if (element) {
      attachElementDataToLabelInternal(sprite, element);
    }
  }

  return sprite;
}

/**
 * バッチ処理されたオブジェクトのレイキャスト結果から要素情報を取得
 *
 * @param {THREE.Intersection} intersection - レイキャスト結果
 * @returns {Object|null} 要素情報
 */
export function getElementFromBatchedIntersection(intersection) {
  return getHitElementFromBatch(intersection);
}

/**
 * バッチレンダリングの統計情報を取得
 *
 * @param {THREE.Group} group - 描画グループ
 * @returns {Object} 統計情報
 */
export function getBatchRenderingStats(group) {
  let totalSegments = 0;
  let batchCount = 0;
  let regularMeshCount = 0;

  group.traverse((child) => {
    if (child.userData?.isBatched) {
      batchCount++;
      totalSegments += child.userData.segmentCount || 0;
    } else if (child instanceof THREE.Line || child instanceof THREE.Mesh) {
      regularMeshCount++;
    }
  });

  return {
    batchCount,
    totalSegments,
    regularMeshCount,
    estimatedDrawCallReduction:
      totalSegments > 0 ? Math.round((1 - batchCount / totalSegments) * 100) : 0,
  };
}

/**
 * 共有球体ジオメトリ（全節点で再利用）
 * @type {THREE.SphereGeometry|null}
 */
let sharedSphereGeometry = null;

/**
 * 共有球体ジオメトリを取得（遅延初期化）
 * @returns {THREE.SphereGeometry}
 */
function getSharedSphereGeometry() {
  if (!sharedSphereGeometry) {
    sharedSphereGeometry = new THREE.SphereGeometry(50, 12, 8);
  }
  return sharedSphereGeometry;
}

/**
 * InstancedMesh を使用して節点をバッチ描画
 *
 * 従来の drawNodes では各節点ごとに個別の Mesh を作成していましたが、
 * この関数では InstancedMesh を使用することで、ドローコールを大幅に削減します。
 *
 * @param {Object} comparisonResult - 比較結果 (matched, onlyA, onlyB)
 * @param {Object} materials - マテリアル（未使用、互換性のため）
 * @param {THREE.Group} group - 描画グループ
 * @param {boolean} labelToggle - ラベル表示の有無
 * @param {THREE.Box3} modelBounds - モデル境界
 * @returns {Array<THREE.Sprite>} 作成されたラベル
 */
export function drawNodesBatched(comparisonResult, materials, group, labelToggle, modelBounds) {
  group.clear();
  const createdLabels = [];

  const matchedNodes = [];
  const onlyANodes = [];
  const onlyBNodes = [];

  // matchType ごとにグループ分け（マテリアルが異なる可能性があるため）
  const matchedByType = new Map();

  // Matched要素を処理
  comparisonResult.matched.forEach((item) => {
    const { dataA, dataB, importance, matchType } = item;
    const coords = dataA.coords;
    const idA = dataA.id;
    const idB = dataB.id;

    if (!isValidCoords(coords)) {
      log.warn(`Skipping matched node due to invalid coords: A=${idA}, B=${idB}`);
      return;
    }

    const pos = new THREE.Vector3(coords.x, coords.y, coords.z);
    modelBounds.expandByPoint(pos);

    // matchType ごとにグループ化
    const typeKey = matchType || 'exact';
    if (!matchedByType.has(typeKey)) {
      matchedByType.set(typeKey, []);
    }
    matchedByType.get(typeKey).push({
      position: pos,
      idA,
      idB,
      importance,
      matchType,
    });

    if (labelToggle) {
      const labelText = `${idA} / ${idB}`;
      const sprite = createLabelSpriteInternal(labelText, pos, group, 'Node');
      if (sprite) {
        sprite.userData.elementIdA = idA;
        sprite.userData.elementIdB = idB;
        sprite.userData.modelSource = 'matched';
        createdLabels.push(sprite);
      }
    }
  });

  // OnlyA要素を処理
  comparisonResult.onlyA.forEach((item) => {
    const { coords, id, importance } = item;

    if (!isValidCoords(coords)) {
      log.warn(`Skipping onlyA node due to invalid coords: ID=${id}`);
      return;
    }

    const pos = new THREE.Vector3(coords.x, coords.y, coords.z);
    modelBounds.expandByPoint(pos);

    onlyANodes.push({
      position: pos,
      id,
      importance,
    });

    if (labelToggle) {
      const labelText = `A: ${id}`;
      const sprite = createLabelSpriteInternal(labelText, pos, group, 'Node');
      if (sprite) {
        sprite.userData.elementId = id;
        sprite.userData.modelSource = 'A';
        createdLabels.push(sprite);
      }
    }
  });

  // OnlyB要素を処理
  comparisonResult.onlyB.forEach((item) => {
    const { coords, id, importance } = item;

    if (!isValidCoords(coords)) {
      log.warn(`Skipping onlyB node due to invalid coords: ID=${id}`);
      return;
    }

    const pos = new THREE.Vector3(coords.x, coords.y, coords.z);
    modelBounds.expandByPoint(pos);

    onlyBNodes.push({
      position: pos,
      id,
      importance,
    });

    if (labelToggle) {
      const labelText = `B: ${id}`;
      const sprite = createLabelSpriteInternal(labelText, pos, group, 'Node');
      if (sprite) {
        sprite.userData.elementId = id;
        sprite.userData.modelSource = 'B';
        createdLabels.push(sprite);
      }
    }
  });

  // 共有ジオメトリを取得
  const sphereGeometry = getSharedSphereGeometry();

  // Matched ノードの InstancedMesh を作成（matchType ごと）
  matchedByType.forEach((nodes, matchType) => {
    if (nodes.length === 0) return;

    const material = getMaterialForElementWithMode(
      'Node',
      'matched',
      false,
      false,
      null,
      matchType,
    );

    const instancedMesh = new THREE.InstancedMesh(sphereGeometry, material, nodes.length);

    const matrix = new THREE.Matrix4();
    const instanceUserData = [];

    nodes.forEach((node, i) => {
      matrix.setPosition(node.position);
      instancedMesh.setMatrixAt(i, matrix);
      instanceUserData.push({
        elementType: 'Node',
        elementIdA: node.idA,
        elementIdB: node.idB,
        modelSource: 'matched',
        toleranceState: node.matchType,
      });
    });

    instancedMesh.instanceMatrix.needsUpdate = true;
    instancedMesh.userData = {
      isBatched: true,
      isInstanced: true,
      elementType: 'Node',
      batchType: 'matched',
      instanceCount: nodes.length,
      instances: instanceUserData,
    };

    group.add(instancedMesh);
  });

  // OnlyA ノードの InstancedMesh を作成
  if (onlyANodes.length > 0) {
    const material = getMaterialForElementWithMode('Node', 'onlyA', false, false, null);

    const instancedMesh = new THREE.InstancedMesh(sphereGeometry, material, onlyANodes.length);

    const matrix = new THREE.Matrix4();
    const instanceUserData = [];

    onlyANodes.forEach((node, i) => {
      matrix.setPosition(node.position);
      instancedMesh.setMatrixAt(i, matrix);
      instanceUserData.push({
        elementType: 'Node',
        elementId: node.id,
        modelSource: 'A',
      });
    });

    instancedMesh.instanceMatrix.needsUpdate = true;
    instancedMesh.userData = {
      isBatched: true,
      isInstanced: true,
      elementType: 'Node',
      batchType: 'onlyA',
      instanceCount: onlyANodes.length,
      instances: instanceUserData,
    };

    group.add(instancedMesh);
  }

  // OnlyB ノードの InstancedMesh を作成
  if (onlyBNodes.length > 0) {
    const material = getMaterialForElementWithMode('Node', 'onlyB', false, false, null);

    const instancedMesh = new THREE.InstancedMesh(sphereGeometry, material, onlyBNodes.length);

    const matrix = new THREE.Matrix4();
    const instanceUserData = [];

    onlyBNodes.forEach((node, i) => {
      matrix.setPosition(node.position);
      instancedMesh.setMatrixAt(i, matrix);
      instanceUserData.push({
        elementType: 'Node',
        elementId: node.id,
        modelSource: 'B',
      });
    });

    instancedMesh.instanceMatrix.needsUpdate = true;
    instancedMesh.userData = {
      isBatched: true,
      isInstanced: true,
      elementType: 'Node',
      batchType: 'onlyB',
      instanceCount: onlyBNodes.length,
      instances: instanceUserData,
    };

    group.add(instancedMesh);
  }

  const totalNodes =
    comparisonResult.matched.length + comparisonResult.onlyA.length + comparisonResult.onlyB.length;

  log.info(`Batched Node rendering summary:`, {
    totalNodes,
    matchedNodes: comparisonResult.matched.length,
    onlyANodes: onlyANodes.length,
    onlyBNodes: onlyBNodes.length,
    drawCalls:
      matchedByType.size + (onlyANodes.length > 0 ? 1 : 0) + (onlyBNodes.length > 0 ? 1 : 0),
    labelsCreated: createdLabels.length,
  });

  return createdLabels;
}

/**
 * 共有ジオメトリをクリア（メモリ解放用）
 */
export function clearSharedNodeGeometry() {
  if (sharedSphereGeometry) {
    sharedSphereGeometry.dispose();
    sharedSphereGeometry = null;
  }
}

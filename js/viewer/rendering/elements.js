/**
 * @fileoverview 構造要素描画モジュール
 *
 * このファイルは、構造要素の3D表現を生成する機能を提供します：
 * - 線要素（柱、梁など）の描画
 * - ポリゴン要素（スラブ、壁など）の描画
 * - 節点要素の描画
 * - 要素のラベル生成
 * - モデル比較結果の視覚化
 *
 * このモジュールは、比較結果に基づいて色分けされた要素を生成し、
 * 3Dシーンに追加するための中核的な描画機能を担当します。
 */

import * as THREE from 'three';
import { createLogger } from '../../utils/logger.js';
import { getMaterialForElementWithMode } from './materials.js';
import { IMPORTANCE_LEVELS } from '../../constants/importanceLevels.js';
import { getState } from '../../app/globalState.js';

const log = createLogger('viewer:elements');

// ============================================
// 共有ジオメトリ（パフォーマンス最適化）
// ============================================

/** @type {THREE.SphereGeometry|null} */
let sharedNodeSphereGeometry = null;

/**
 * ノード用の共有SphereGeometryを取得
 * @returns {THREE.SphereGeometry}
 */
function getSharedNodeSphereGeometry() {
  if (!sharedNodeSphereGeometry) {
    sharedNodeSphereGeometry = new THREE.SphereGeometry(50, 12, 8);
  }
  return sharedNodeSphereGeometry;
}


/**
 * グループ内の子要素のジオメトリを適切に破棄してからクリア
 * @param {THREE.Group} group - クリアするグループ
 */
function disposeAndClearGroup(group) {
  // 子要素を逆順で処理（削除時のインデックス変更を避ける）
  while (group.children.length > 0) {
    const child = group.children[group.children.length - 1];

    // ジオメトリの破棄（共有ジオメトリは除く）
    if (child.geometry && child.geometry !== sharedNodeSphereGeometry) {
      child.geometry.dispose();
    }

    // 親から削除
    group.remove(child);
  }
}

// ============================================
// ラベル処理プロバイダー（依存性注入）
// ============================================

/**
 * @typedef {Object} ElementsLabelProvider
 * @property {function(Object, string): string} generateLabelText - ラベルテキスト生成
 * @property {function(THREE.Sprite, Object): void} attachElementDataToLabel - 要素データをラベルに付与
 * @property {function(string, THREE.Vector3, THREE.Group, string, Object=): THREE.Sprite|null} createLabelSprite - ラベルスプライト作成
 */

/** @type {ElementsLabelProvider|null} */
let elementsLabelProvider = null;

/**
 * ラベルプロバイダーを設定（依存性注入）
 * @param {ElementsLabelProvider} provider - ラベルプロバイダー
 */
export function setElementsLabelProvider(provider) {
  elementsLabelProvider = provider;
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
  if (elementsLabelProvider && elementsLabelProvider.createLabelSprite) {
    return elementsLabelProvider.createLabelSprite(text, position, group, elementType, meta);
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
  if (elementsLabelProvider && elementsLabelProvider.generateLabelText) {
    return elementsLabelProvider.generateLabelText(element, elementType);
  }
  // フォールバック: 要素名またはID
  return element?.name || element?.id || '';
}

/**
 * 要素データをラベルに付与（プロバイダー経由）
 * @param {THREE.Sprite} sprite - ラベルスプライト
 * @param {Object} element - 要素データ
 */
function attachElementDataToLabelInternal(sprite, element) {
  if (elementsLabelProvider && elementsLabelProvider.attachElementDataToLabel) {
    elementsLabelProvider.attachElementDataToLabel(sprite, element);
  }
}

/**
 * 座標がすべて有限数かバリデートする
 * @param {Object} startCoords - 始点座標 {x, y, z}
 * @param {Object} endCoords - 終点座標 {x, y, z}
 * @returns {boolean} 有効な場合true
 */
function isValidLineCoords(startCoords, endCoords) {
  return (
    startCoords &&
    endCoords &&
    Number.isFinite(startCoords.x) &&
    Number.isFinite(startCoords.y) &&
    Number.isFinite(startCoords.z) &&
    Number.isFinite(endCoords.x) &&
    Number.isFinite(endCoords.y) &&
    Number.isFinite(endCoords.z)
  );
}

/**
 * onlyA / onlyB 要素のライン描画を行う共通関数
 * @param {Array} items - onlyA/onlyB 要素配列
 * @param {string} elementType - 要素タイプ名
 * @param {string} materialCategory - マテリアルカテゴリ ('onlyA' | 'onlyB')
 * @param {string} modelSource - モデルソース ('A' | 'B')
 * @param {string} labelPrefix - ラベルプレフィックス ('A' | 'B')
 * @param {THREE.Group} group - 描画対象グループ
 * @param {boolean} labelToggle - ラベル表示の有無
 * @param {number} labelOffsetAmount - ラベルオフセット量
 * @param {number} labelOffsetSign - ラベルオフセット方向 (1: add, -1: sub)
 * @param {THREE.Box3} modelBounds - バウンディングボックス
 * @param {Array<THREE.Sprite>} createdLabels - ラベル収集配列
 */
function drawOnlyLineElements(
  items,
  elementType,
  materialCategory,
  modelSource,
  labelPrefix,
  group,
  labelToggle,
  labelOffsetAmount,
  labelOffsetSign,
  modelBounds,
  createdLabels,
) {
  let debugCount = 0;
  items.forEach((item) => {
    if (!item) {
      log.warn(`Skipping undefined item in ${materialCategory} for ${elementType}`);
      return;
    }
    const { startCoords, endCoords, id, element, importance } = item;
    if (!isValidLineCoords(startCoords, endCoords)) {
      log.warn(`Skipping ${materialCategory} line due to invalid coords: ID=${id}`);
      return;
    }

    const startVec = new THREE.Vector3(startCoords.x, startCoords.y, startCoords.z);
    const endVec = new THREE.Vector3(endCoords.x, endCoords.y, endCoords.z);

    if (debugCount < 2) {
      log.debug(
        `${elementType} ${materialCategory} element ${debugCount}: Start=(${startCoords.x.toFixed(
          0,
        )}, ${startCoords.y.toFixed(0)}, ${startCoords.z.toFixed(
          0,
        )})mm, End=(${endCoords.x.toFixed(0)}, ${endCoords.y.toFixed(
          0,
        )}, ${endCoords.z.toFixed(0)})mm`,
      );
    }
    debugCount++;

    const geometry = new THREE.BufferGeometry().setFromPoints([startVec, endVec]);
    const line = new THREE.Line(
      geometry,
      getMaterialForElementWithMode(elementType, materialCategory, true, false, id),
    );
    line.userData = {
      elementType: elementType,
      elementId: id,
      modelSource: modelSource,
      importance: importance,
      isLine: true,
    };

    applyImportanceVisuals(line, importance);

    group.add(line);
    modelBounds.expandByPoint(startVec);
    modelBounds.expandByPoint(endVec);

    if (labelToggle && id) {
      const midPoint = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
      const direction = endVec.clone().sub(startVec).normalize();
      let offsetDir = new THREE.Vector3(-direction.y, direction.x, 0).normalize();
      if (offsetDir.lengthSq() < 0.1) offsetDir = new THREE.Vector3(1, 0, 0);
      const labelPosition = midPoint
        .clone()
        .add(offsetDir.multiplyScalar(labelOffsetSign * labelOffsetAmount));

      const contentType = getState('ui.labelContentType') || 'id';
      let displayText = id;

      if (contentType === 'name' && element && element.name) {
        displayText = element.name;
      } else if (contentType === 'section') {
        displayText = generateLabelTextInternal(element, elementType);
      }

      const labelText = `${labelPrefix}: ${displayText}`;
      const sprite = createLabelSpriteInternal(labelText, labelPosition, group, elementType);
      if (sprite) {
        sprite.userData.elementId = id;
        sprite.userData.modelSource = modelSource;

        if (element) {
          attachElementDataToLabelInternal(sprite, element);
        }

        createdLabels.push(sprite);
      }
    }
  });
}

/**
 * 重要度に基づいて要素の視覚的調整を適用する
 * @param {THREE.Object3D} object - 調整対象の3Dオブジェクト
 * @param {string} importance - 重要度レベル
 */
function applyImportanceVisuals(object, importance) {
  if (!importance) return;

  // 重要度に応じた透明度設定
  const opacityLevels = {
    [IMPORTANCE_LEVELS.REQUIRED]: 1.0,
    [IMPORTANCE_LEVELS.OPTIONAL]: 0.8,
    [IMPORTANCE_LEVELS.UNNECESSARY]: 0.4,
    [IMPORTANCE_LEVELS.NOT_APPLICABLE]: 0.1,
  };

  const targetOpacity = opacityLevels[importance] || 1.0;

  if (object.material) {
    if (Array.isArray(object.material)) {
      // マテリアル配列の場合
      object.material.forEach((mat) => {
        mat.opacity = targetOpacity;
        mat.transparent = targetOpacity < 1.0;
      });
    } else {
      // 単一マテリアルの場合
      object.material.opacity = targetOpacity;
      object.material.transparent = targetOpacity < 1.0;
    }
  }

  // userDataに重要度情報を記録
  object.userData.importance = importance;
}

/**
 * 線要素（柱、梁など）の比較結果を描画する
 * @param {object} comparisonResult - compareElementsの比較結果
 * @param {object} materials - マテリアルオブジェクト
 * @param {THREE.Group} group - 描画対象の要素グループ
 * @param {string} elementType - 描画する要素タイプ名 (例: 'Column')
 * @param {boolean} labelToggle - ラベル表示の有無
 * @param {THREE.Box3} modelBounds - 更新するモデル全体のバウンディングボックス
 * @returns {Array<THREE.Sprite>} 作成されたラベルスプライトの配列
 */
export function drawLineElements(
  comparisonResult,
  materials,
  group,
  elementType,
  labelToggle,
  modelBounds,
) {
  disposeAndClearGroup(group);
  const createdLabels = [];
  const labelOffsetAmount = 150;

  log.info(`Drawing line elements for ${elementType}:`, {
    matched: comparisonResult.matched.length,
    onlyA: comparisonResult.onlyA.length,
    onlyB: comparisonResult.onlyB.length,
  });

  let processedCount = 0;
  let skippedCount = 0;
  let addedToGroupCount = 0;

  comparisonResult.matched.forEach((item, index) => {
    if (!item) {
      log.warn(`Skipping undefined item in matched for ${elementType}`);
      return;
    }
    const { dataA, dataB, importance, matchType } = item;

    // dataAまたはdataBがundefinedの場合はスキップ
    if (!dataA || !dataB) {
      log.warn(`Skipping item with undefined dataA or dataB in matched for ${elementType}`);
      return;
    }

    if (index < 3) {
      // 最初の3つの要素について詳細ログを出力
      log.debug(`Processing matched item ${index}:`, {
        dataA,
        dataB,
        importance,
        matchType,
      });
      log.trace('dataA.startCoords:', dataA.startCoords);
      log.trace('dataA.endCoords:', dataA.endCoords);
    }

    processedCount++;

    const startCoords = dataA.startCoords;
    const endCoords = dataA.endCoords;
    const idA = dataA.id;
    const idB = dataB.id;

    if (!isValidLineCoords(startCoords, endCoords)) {
      skippedCount++;
      log.warn(`Skipping matched line due to invalid coords: A=${idA}, B=${idB}`);
      return;
    }

    const startVec = new THREE.Vector3(startCoords.x, startCoords.y, startCoords.z);
    const endVec = new THREE.Vector3(endCoords.x, endCoords.y, endCoords.z);

    if (index < 3) {
      log.debug(
        `${elementType} matched element ${index}: Start=(${startCoords.x.toFixed(
          0,
        )}, ${startCoords.y.toFixed(0)}, ${startCoords.z.toFixed(
          0,
        )})mm, End=(${endCoords.x.toFixed(0)}, ${endCoords.y.toFixed(
          0,
        )}, ${endCoords.z.toFixed(0)})mm`,
      );
    }

    const geometry = new THREE.BufferGeometry().setFromPoints([startVec, endVec]);
    const material = getMaterialForElementWithMode(
      elementType,
      'matched',
      true,
      false,
      idA,
      matchType,
    );
    if (index < 3) {
      log.trace(`Material for matched item ${index}:`, material);
    }

    const line = new THREE.Line(geometry, material);

    // 重要度データを取得（重要度管理システムから、比較結果の値を上書き）
    let resolvedImportance = importance;
    const importanceManager = getState('importanceManager');
    if (importanceManager && dataA.element) {
      resolvedImportance =
        importanceManager.getElementImportance?.(dataA.element) ||
        (dataB.element ? importanceManager.getElementImportance?.(dataB.element) : null) ||
        importance;
    }

    line.userData = {
      elementType: elementType,
      elementId: idA,
      elementIdA: idA,
      elementIdB: idB,
      modelSource: 'matched',
      originalId: idA,
      id: idA,
      importance: resolvedImportance,
      toleranceState: matchType,
      isLine: true,
    };

    if (index < 3) {
      log.trace(`Created line object ${index}:`, line);
      log.trace(`Line importance:`, resolvedImportance);
      log.trace(`Line geometry points:`, geometry.attributes.position.array);
    }

    applyImportanceVisuals(line, resolvedImportance);

    group.add(line);
    addedToGroupCount++;

    if (index < 3) {
      log.debug(`Added line ${index} to group. Group children count:`, group.children.length);
    }

    modelBounds.expandByPoint(startVec);
    modelBounds.expandByPoint(endVec);

    if (labelToggle && (idA || idB)) {
      const midPoint = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);

      const contentType = getState('ui.labelContentType') || 'id';
      let labelText;

      if (contentType === 'id') {
        labelText = `${idA || '?'} / ${idB || '?'}`;
      } else {
        const nameA = dataA.element && dataA.element.name ? dataA.element.name : idA;
        const nameB = dataB.element && dataB.element.name ? dataB.element.name : idB;
        labelText = `${nameA || '?'} / ${nameB || '?'}`;
      }

      const sprite = createLabelSpriteInternal(labelText, midPoint, group, elementType);
      if (sprite) {
        sprite.userData.elementIdA = idA;
        sprite.userData.elementIdB = idB;
        sprite.userData.modelSource = 'matched';

        if (dataA.element) {
          attachElementDataToLabelInternal(sprite, dataA.element);
        }

        createdLabels.push(sprite);
      }
    }
  });

  // onlyA 要素の描画
  drawOnlyLineElements(
    comparisonResult.onlyA,
    elementType,
    'onlyA',
    'A',
    'A',
    group,
    labelToggle,
    labelOffsetAmount,
    1,
    modelBounds,
    createdLabels,
  );

  // onlyB 要素の描画
  drawOnlyLineElements(
    comparisonResult.onlyB,
    elementType,
    'onlyB',
    'B',
    'B',
    group,
    labelToggle,
    labelOffsetAmount,
    -1,
    modelBounds,
    createdLabels,
  );

  log.info(`${elementType} line rendering summary:`, {
    processedCount,
    skippedCount,
    addedToGroupCount,
    groupChildrenCount: group.children.length,
    groupVisible: group.visible,
  });

  return createdLabels;
}

/**
 * ポリゴン要素（スラブ、壁など）の比較結果を描画する
 * @param {object} comparisonResult - compareElementsの比較結果
 * @param {object} materials - マテリアルオブジェクト
 * @param {THREE.Group} group - 描画対象の要素グループ
 * @param {boolean} labelToggle - ラベル表示の有無
 * @param {THREE.Box3} modelBounds - 更新するモデル全体のバウンディングボックス
 * @returns {Array<THREE.Sprite>} 作成されたラベルスプライトの配列
 */
export function drawPolyElements(comparisonResult, materials, group, labelToggle, modelBounds) {
  disposeAndClearGroup(group);
  const createdLabels = [];

  const elementType = group.userData.elementType;
  if (!elementType) {
    log.error('elementType is missing in group userData or name for drawPolyElements:', group);
  }

  // labelToggle を createMeshes に渡す
  const createMeshes = (dataList, material, modelSource, labelToggle) => {
    dataList.forEach((item) => {
      const { vertexCoordsList, id, importance, idB, matchType } = item;
      const points = [];
      let validPoints = true;
      for (const p of vertexCoordsList) {
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) {
          points.push(new THREE.Vector3(p.x, p.y, p.z));
        } else {
          log.warn('Skipping polygon due to invalid vertex coord:', p);
          validPoints = false;
          break;
        }
      }
      if (!validPoints || points.length < 3) return;
      points.forEach((p) => modelBounds.expandByPoint(p));
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const indices = [];
      for (let i = 1; i < points.length - 1; i++) {
        indices.push(0, i, i + 1);
      }
      geometry.setIndex(indices);
      geometry.computeVertexNormals();

      // 重要度データを取得
      let actualImportance = importance; // パラメータから取得
      if (!actualImportance) {
        const importanceManager = getState('importanceManager');
        if (importanceManager && id) {
          // 要素IDから重要度を取得
          actualImportance = importanceManager.getElementImportanceById?.(id);
        }
      }

      let meshMaterial = material;
      if (modelSource === 'matched' && matchType) {
        meshMaterial = getMaterialForElementWithMode(
          elementType,
          'matched',
          false,
          true,
          id,
          matchType,
        );
      }

      const mesh = new THREE.Mesh(geometry, meshMaterial);
      mesh.userData = {
        elementType: elementType,
        elementId: id,
        modelSource: modelSource,
        originalId: id, // applyImportanceColorMode で使用
        id: id,
        importance: actualImportance, // 重要度データを設定
        toleranceState: matchType,
        isPoly: true,
      };

      // matched要素の場合、A/B両方のIDを設定
      if (modelSource === 'matched' && idB) {
        mesh.userData.elementIdA = id;
        mesh.userData.elementIdB = idB;
      }

      // 重要度による視覚調整を適用
      applyImportanceVisuals(mesh, actualImportance);

      group.add(mesh);

      // ラベル作成ロジックを追加
      if (labelToggle && id) {
        // ポリゴンの中心点を計算
        const centerPoint = new THREE.Vector3();
        points.forEach((p) => centerPoint.add(p));
        centerPoint.divideScalar(points.length);

        let labelText = '';
        if (modelSource === 'A') {
          labelText = `A: ${id}`;
        } else if (modelSource === 'B') {
          labelText = `B: ${id}`;
        } else if (modelSource === 'matched') {
          // matched の場合、A/B両方のIDを表示
          labelText = idB ? `${id} / ${idB}` : `${id}`;
        }

        if (labelText) {
          const sprite = createLabelSpriteInternal(
            labelText,
            centerPoint,
            group, // ラベルも同じグループに追加
            elementType,
          );
          if (sprite) {
            sprite.userData.elementId = id; // スプライトにIDを設定
            sprite.userData.modelSource = modelSource; // スプライトにもソースを設定
            // matched の場合、A/B両方のIDを設定
            if (modelSource === 'matched' && idB) {
              sprite.userData.elementIdA = id;
              sprite.userData.elementIdB = idB;
            }
            createdLabels.push(sprite);
          }
        }
      }
    });
  };

  // createMeshes 呼び出し時に labelToggle を渡す
  createMeshes(
    comparisonResult.matched.map((item) => ({
      vertexCoordsList: item.dataA.vertexCoordsList,
      id: item.dataA.id,
      idB: item.dataB.id, // B側のIDを追加
      importance: item.importance,
      matchType: item.matchType,
    })),
    getMaterialForElementWithMode(
      elementType,
      'matched',
      false,
      true,
      comparisonResult.matched[0]?.dataA?.id,
    ),
    'matched',
    labelToggle,
  );
  createMeshes(
    comparisonResult.onlyA,
    getMaterialForElementWithMode(elementType, 'onlyA', false, true, comparisonResult.onlyA[0]?.id),
    'A',
    labelToggle,
  );
  createMeshes(
    comparisonResult.onlyB,
    getMaterialForElementWithMode(elementType, 'onlyB', false, true, comparisonResult.onlyB[0]?.id),
    'B',
    labelToggle,
  );

  return createdLabels;
}

/**
 * 節点要素の比較結果を描画する
 * @param {object} comparisonResult - compareElementsの比較結果
 * @param {object} materials - マテリアルオブジェクト
 * @param {THREE.Group} group - 描画対象の要素グループ（節点メッシュ用）
 * @param {boolean} labelToggle - ラベル表示の有無
 * @param {THREE.Box3} modelBounds - 更新するモデル全体のバウンディングボックス
 * @returns {Array<THREE.Sprite>} 作成されたラベルスプライトの配列
 */
export function drawNodes(comparisonResult, materials, group, labelToggle, modelBounds) {
  disposeAndClearGroup(group);
  const createdLabels = [];

  comparisonResult.matched.forEach((item) => {
    if (!item) {
      log.warn('Skipping undefined item in matched for Node');
      return;
    }
    const { dataA, dataB, importance, matchType } = item;
    const coords = dataA.coords;
    const idA = dataA.id;
    const idB = dataB.id;
    if (
      coords &&
      Number.isFinite(coords.x) &&
      Number.isFinite(coords.y) &&
      Number.isFinite(coords.z)
    ) {
      const pos = new THREE.Vector3(coords.x, coords.y, coords.z);
      const sphere = new THREE.Mesh(
        getSharedNodeSphereGeometry(),
        getMaterialForElementWithMode('Node', 'matched', false, false, idA, matchType),
      );
      sphere.position.copy(pos);
      sphere.userData = {
        elementType: 'Node',
        elementId: idA, // 統一されたID参照用
        elementIdA: idA,
        elementIdB: idB,
        modelSource: 'matched',
        toleranceState: matchType,
      };

      // 重要度による視覚調整を適用
      applyImportanceVisuals(sphere, importance);

      group.add(sphere);
      modelBounds.expandByPoint(pos);
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
    } else {
      log.warn(`Skipping matched node due to invalid coords: A=${idA}, B=${idB}`);
    }
  });

  comparisonResult.onlyA.forEach((item) => {
    if (!item) {
      log.warn('Skipping undefined item in onlyA for Node');
      return;
    }
    const { coords, id, importance } = item;
    if (
      coords &&
      Number.isFinite(coords.x) &&
      Number.isFinite(coords.y) &&
      Number.isFinite(coords.z)
    ) {
      const pos = new THREE.Vector3(coords.x, coords.y, coords.z);
      const sphere = new THREE.Mesh(
        getSharedNodeSphereGeometry(),
        getMaterialForElementWithMode('Node', 'onlyA', false, false, id),
      );
      sphere.position.copy(pos);
      sphere.userData = {
        elementType: 'Node',
        elementId: id,
        modelSource: 'A',
      };

      // 重要度による視覚調整を適用
      applyImportanceVisuals(sphere, importance);

      group.add(sphere);
      modelBounds.expandByPoint(pos);
      if (labelToggle) {
        const labelText = `A: ${id}`;
        const sprite = createLabelSpriteInternal(labelText, pos, group, 'Node');
        if (sprite) {
          sprite.userData.elementId = id;
          sprite.userData.modelSource = 'A';
          createdLabels.push(sprite);
        }
      }
    } else {
      log.warn(`Skipping onlyA node due to invalid coords: ID=${id}`);
    }
  });

  comparisonResult.onlyB.forEach((item) => {
    if (!item) {
      log.warn('Skipping undefined item in onlyB for Node');
      return;
    }
    const { coords, id, importance } = item;
    if (
      coords &&
      Number.isFinite(coords.x) &&
      Number.isFinite(coords.y) &&
      Number.isFinite(coords.z)
    ) {
      const pos = new THREE.Vector3(coords.x, coords.y, coords.z);
      const sphere = new THREE.Mesh(
        getSharedNodeSphereGeometry(),
        getMaterialForElementWithMode('Node', 'onlyB', false, false, id),
      );
      sphere.position.copy(pos);
      sphere.userData = {
        elementType: 'Node',
        elementId: id,
        modelSource: 'B',
      };

      // 重要度による視覚調整を適用
      applyImportanceVisuals(sphere, importance);

      group.add(sphere);
      modelBounds.expandByPoint(pos);
      if (labelToggle) {
        const labelText = `B: ${id}`;
        const sprite = createLabelSpriteInternal(labelText, pos, group, 'Node');
        if (sprite) {
          sprite.userData.elementId = id;
          sprite.userData.modelSource = 'B';
          createdLabels.push(sprite);
        }
      }
    } else {
      log.warn(`Skipping onlyB node due to invalid coords: ID=${id}`);
    }
  });
  return createdLabels;
}

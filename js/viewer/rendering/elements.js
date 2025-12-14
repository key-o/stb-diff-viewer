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
import { createLabelSprite } from '../ui/labels.js';
import { generateLabelText } from '../../ui/unifiedLabelManager.js';
import { attachElementDataToLabel } from '../../ui/labelRegeneration.js';
import { getMaterialForElementWithMode } from './materials.js';
import { IMPORTANCE_LEVELS } from '../../core/importanceManager.js';

const log = createLogger('viewer:elements');

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
    [IMPORTANCE_LEVELS.NOT_APPLICABLE]: 0.1
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
  modelBounds
) {
  group.clear();
  const createdLabels = [];
  const labelOffsetAmount = 150;

  log.info(`Drawing line elements for ${elementType}:`, {
    matched: comparisonResult.matched.length,
    onlyA: comparisonResult.onlyA.length,
    onlyB: comparisonResult.onlyB.length
  });

  let processedCount = 0;
  let skippedCount = 0;
  let addedToGroupCount = 0;

  comparisonResult.matched.forEach((item, index) => {
    const { dataA, dataB, importance, matchType } = item;

    if (index < 3) {
      // 最初の3つの要素について詳細ログを出力
      log.debug(`Processing matched item ${index}:`, {
        dataA,
        dataB,
        importance,
        matchType
      });
      log.trace('dataA.startCoords:', dataA.startCoords);
      log.trace('dataA.endCoords:', dataA.endCoords);
    }

    processedCount++;

    const startCoords = dataA.startCoords;
    const endCoords = dataA.endCoords;
    const idA = dataA.id;
    const idB = dataB.id;

    if (
      startCoords &&
      endCoords &&
      Number.isFinite(startCoords.x) &&
      Number.isFinite(startCoords.y) &&
      Number.isFinite(startCoords.z) &&
      Number.isFinite(endCoords.x) &&
      Number.isFinite(endCoords.y) &&
      Number.isFinite(endCoords.z)
    ) {
      const startVec = new THREE.Vector3(
        startCoords.x,
        startCoords.y,
        startCoords.z
      );
      const endVec = new THREE.Vector3(endCoords.x, endCoords.y, endCoords.z);

      // デバッグ出力（最初の3個の一致要素のみ）
      if (index < 3) {
        log.debug(
          `${elementType} matched element ${index}: Start=(${startCoords.x.toFixed(
            0
          )}, ${startCoords.y.toFixed(0)}, ${startCoords.z.toFixed(
            0
          )})mm, End=(${endCoords.x.toFixed(0)}, ${endCoords.y.toFixed(
            0
          )}, ${endCoords.z.toFixed(0)})mm`
        );
      }

      const geometry = new THREE.BufferGeometry().setFromPoints([
        startVec,
        endVec
      ]);
      const material = getMaterialForElementWithMode(
        elementType,
        'matched',
        true,
        false,
        idA,
        matchType
      );
      if (index < 3) {
        log.trace(`Material for matched item ${index}:`, material);
      }

      const line = new THREE.Line(geometry, material);

      // 重要度データを取得（重要度管理システムから）
      let importance = null;
      if (window.globalState && window.globalState.get) {
        const importanceManager = window.globalState.get('importanceManager');
        if (importanceManager && dataA.element) {
          // 要素の重要度を取得（まずAから、なければBから）
          importance =
            importanceManager.getElementImportance?.(dataA.element) ||
            (dataB.element
              ? importanceManager.getElementImportance?.(dataB.element)
              : null);
        }
      }

      line.userData = {
        elementType: elementType,
        elementIdA: idA,
        elementIdB: idB,
        modelSource: 'matched',
        originalId: idA, // applyImportanceColorMode で使用
        id: idA,
        importance: importance, // 重要度データを設定
        toleranceState: matchType,
        isLine: true
      };

      if (index < 3) {
        log.trace(`Created line object ${index}:`, line);
        log.trace(`Line importance:`, importance);
        log.trace(`Line geometry points:`, geometry.attributes.position.array);
      }

      // 重要度による視覚調整を適用
      applyImportanceVisuals(line, importance);

      group.add(line);
      addedToGroupCount++;

      if (index < 3) {
        log.debug(
          `Added line ${index} to group. Group children count:`,
          group.children.length
        );
      }

      modelBounds.expandByPoint(startVec);
      modelBounds.expandByPoint(endVec);

      if (labelToggle && (idA || idB)) {
        const midPoint = new THREE.Vector3()
          .addVectors(startVec, endVec)
          .multiplyScalar(0.5);

        // マッチした要素の場合、設定に応じてラベルテキストを生成
        const contentType =
          window.globalState?.get('ui.labelContentType') || 'id';
        let labelText;

        if (contentType === 'id') {
          labelText = `${idA || '?'} / ${idB || '?'}`;
        } else {
          // 名前また断面名を使用する場合
          const nameA =
            dataA.element && dataA.element.name ? dataA.element.name : idA;
          const nameB =
            dataB.element && dataB.element.name ? dataB.element.name : idB;
          labelText = `${nameA || '?'} / ${nameB || '?'}`;
        }

        const sprite = createLabelSprite(
          labelText,
          midPoint,
          group,
          elementType
        );
        if (sprite) {
          sprite.userData.elementIdA = idA;
          sprite.userData.elementIdB = idB;
          sprite.userData.modelSource = 'matched';

          // 要素データを保存（両方のモデルの要素データを保存）
          if (dataA.element) {
            attachElementDataToLabel(sprite, dataA.element);
          }

          createdLabels.push(sprite);
        }
      }
    } else {
      skippedCount++;
      log.warn(
        `Skipping matched line due to invalid coords: A=${idA}, B=${idB}`
      );
    }
  });

  let onlyACount = 0;
  comparisonResult.onlyA.forEach((item) => {
    const { startCoords, endCoords, id, element, importance } = item;
    if (
      startCoords &&
      endCoords &&
      Number.isFinite(startCoords.x) &&
      Number.isFinite(startCoords.y) &&
      Number.isFinite(startCoords.z) &&
      Number.isFinite(endCoords.x) &&
      Number.isFinite(endCoords.y) &&
      Number.isFinite(endCoords.z)
    ) {
      const startVec = new THREE.Vector3(
        startCoords.x,
        startCoords.y,
        startCoords.z
      );
      const endVec = new THREE.Vector3(endCoords.x, endCoords.y, endCoords.z);

      // デバッグ出力（最初の2個のOnlyA要素のみ）
      if (onlyACount < 2) {
        log.debug(
          `${elementType} onlyA element ${onlyACount}: Start=(${startCoords.x.toFixed(
            0
          )}, ${startCoords.y.toFixed(0)}, ${startCoords.z.toFixed(
            0
          )})mm, End=(${endCoords.x.toFixed(0)}, ${endCoords.y.toFixed(
            0
          )}, ${endCoords.z.toFixed(0)})mm`
        );
      }
      onlyACount++;
      const geometry = new THREE.BufferGeometry().setFromPoints([
        startVec,
        endVec
      ]);
      const line = new THREE.Line(
        geometry,
        getMaterialForElementWithMode(elementType, 'onlyA', true, false, id)
      );
      line.userData = {
        elementType: elementType,
        elementId: id,
        modelSource: 'A'
      };

      // 重要度による視覚調整を適用
      applyImportanceVisuals(line, importance);

      group.add(line);
      modelBounds.expandByPoint(startVec);
      modelBounds.expandByPoint(endVec);

      if (labelToggle && id) {
        const midPoint = new THREE.Vector3()
          .addVectors(startVec, endVec)
          .multiplyScalar(0.5);
        const direction = endVec.clone().sub(startVec).normalize();
        let offsetDir = new THREE.Vector3(
          -direction.y,
          direction.x,
          0
        ).normalize();
        if (offsetDir.lengthSq() < 0.1) offsetDir = new THREE.Vector3(1, 0, 0);
        const labelPosition = midPoint
          .clone()
          .add(offsetDir.multiplyScalar(labelOffsetAmount));

        // 設定に応じてラベルテキストを生成
        const contentType =
          window.globalState?.get('ui.labelContentType') || 'id';
        let displayText = id;

        if (contentType === 'name' && element && element.name) {
          displayText = element.name;
        } else if (contentType === 'section') {
          // 断面名表示の場合、統合ラベル管理システムを使用
          displayText = generateLabelText(element, elementType);
        }

        const labelText = `A: ${displayText}`;
        const sprite = createLabelSprite(
          labelText,
          labelPosition,
          group,
          elementType
        );
        if (sprite) {
          sprite.userData.elementId = id;
          sprite.userData.modelSource = 'A';

          // 要素データを保存
          if (element) {
            attachElementDataToLabel(sprite, element);
          }

          createdLabels.push(sprite);
        }
      }
    } else {
      log.warn(`Skipping onlyA line due to invalid coords: ID=${id}`);
    }
  });

  comparisonResult.onlyB.forEach((item) => {
    const { startCoords, endCoords, id, element, importance } = item;
    if (
      startCoords &&
      endCoords &&
      Number.isFinite(startCoords.x) &&
      Number.isFinite(startCoords.y) &&
      Number.isFinite(startCoords.z) &&
      Number.isFinite(endCoords.x) &&
      Number.isFinite(endCoords.y) &&
      Number.isFinite(endCoords.z)
    ) {
      const startVec = new THREE.Vector3(
        startCoords.x,
        startCoords.y,
        startCoords.z
      );
      const endVec = new THREE.Vector3(endCoords.x, endCoords.y, endCoords.z);
      const geometry = new THREE.BufferGeometry().setFromPoints([
        startVec,
        endVec
      ]);
      const line = new THREE.Line(
        geometry,
        getMaterialForElementWithMode(elementType, 'onlyB', true, false, id)
      );
      line.userData = {
        elementType: elementType,
        elementId: id,
        modelSource: 'B'
      };

      // 重要度による視覚調整を適用
      applyImportanceVisuals(line, importance);

      group.add(line);
      modelBounds.expandByPoint(startVec);
      modelBounds.expandByPoint(endVec);

      if (labelToggle && id) {
        const midPoint = new THREE.Vector3()
          .addVectors(startVec, endVec)
          .multiplyScalar(0.5);
        const direction = endVec.clone().sub(startVec).normalize();
        let offsetDir = new THREE.Vector3(
          -direction.y,
          direction.x,
          0
        ).normalize();
        if (offsetDir.lengthSq() < 0.1) offsetDir = new THREE.Vector3(1, 0, 0);
        const labelPosition = midPoint
          .clone()
          .sub(offsetDir.multiplyScalar(labelOffsetAmount));

        // 設定に応じてラベルテキストを生成
        const contentType =
          window.globalState?.get('ui.labelContentType') || 'id';
        let displayText = id;

        if (contentType === 'name' && element && element.name) {
          displayText = element.name;
        } else if (contentType === 'section') {
          // 断面名表示の場合、統合ラベル管理システムを使用
          displayText = generateLabelText(element, elementType);
        }

        const labelText = `B: ${displayText}`;
        const sprite = createLabelSprite(
          labelText,
          labelPosition,
          group,
          elementType
        );
        if (sprite) {
          sprite.userData.elementId = id;
          sprite.userData.modelSource = 'B';

          // 要素データを保存
          if (element) {
            attachElementDataToLabel(sprite, element);
          }

          createdLabels.push(sprite);
        }
      }
    } else {
      log.warn(`Skipping onlyB line due to invalid coords: ID=${id}`);
    }
  });

  log.info(`${elementType} line rendering summary:`, {
    processedCount,
    skippedCount,
    addedToGroupCount,
    groupChildrenCount: group.children.length,
    groupVisible: group.visible
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
export function drawPolyElements(
  comparisonResult,
  materials,
  group,
  labelToggle,
  modelBounds
) {
  group.clear();
  const createdLabels = [];

  const elementType = group.userData.elementType;
  if (!elementType) {
    log.error(
      'elementType is missing in group userData or name for drawPolyElements:',
      group
    );
  }

  // labelToggle を createMeshes に渡す
  const createMeshes = (dataList, material, modelSource, labelToggle) => {
    dataList.forEach((item) => {
      const { vertexCoordsList, id, importance, idB, matchType } = item;
      const points = [];
      let validPoints = true;
      for (const p of vertexCoordsList) {
        if (
          p &&
          Number.isFinite(p.x) &&
          Number.isFinite(p.y) &&
          Number.isFinite(p.z)
        ) {
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
      if (!actualImportance && window.globalState && window.globalState.get) {
        const importanceManager = window.globalState.get('importanceManager');
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
          matchType
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
        isPoly: true
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
          const sprite = createLabelSprite(
            labelText,
            centerPoint,
            group, // ラベルも同じグループに追加
            elementType
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
      matchType: item.matchType
    })),
    getMaterialForElementWithMode(
      elementType,
      'matched',
      false,
      true,
      comparisonResult.matched[0]?.dataA?.id
    ),
    'matched',
    labelToggle
  );
  createMeshes(
    comparisonResult.onlyA,
    getMaterialForElementWithMode(
      elementType,
      'onlyA',
      false,
      true,
      comparisonResult.onlyA[0]?.id
    ),
    'A',
    labelToggle
  );
  createMeshes(
    comparisonResult.onlyB,
    getMaterialForElementWithMode(
      elementType,
      'onlyB',
      false,
      true,
      comparisonResult.onlyB[0]?.id
    ),
    'B',
    labelToggle
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
export function drawNodes(
  comparisonResult,
  materials,
  group,
  labelToggle,
  modelBounds
) {
  group.clear();
  const createdLabels = [];

  comparisonResult.matched.forEach((item) => {
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
      const sphereGeo = new THREE.SphereGeometry(50, 12, 8);
      const sphere = new THREE.Mesh(
        sphereGeo,
        getMaterialForElementWithMode(
          'Node',
          'matched',
          false,
          false,
          idA,
          matchType
        )
      );
      sphere.position.copy(pos);
      sphere.userData = {
        elementType: 'Node',
        elementIdA: idA,
        elementIdB: idB,
        modelSource: 'matched',
        toleranceState: matchType
      };

      // 重要度による視覚調整を適用
      applyImportanceVisuals(sphere, importance);

      group.add(sphere);
      modelBounds.expandByPoint(pos);
      if (labelToggle) {
        const labelText = `${idA} / ${idB}`;
        const sprite = createLabelSprite(labelText, pos, group, 'Node');
        if (sprite) {
          sprite.userData.elementIdA = idA;
          sprite.userData.elementIdB = idB;
          sprite.userData.modelSource = 'matched';
          createdLabels.push(sprite);
        }
      }
    } else {
      log.warn(
        `Skipping matched node due to invalid coords: A=${idA}, B=${idB}`
      );
    }
  });

  comparisonResult.onlyA.forEach((item) => {
    const { coords, id, importance } = item;
    if (
      coords &&
      Number.isFinite(coords.x) &&
      Number.isFinite(coords.y) &&
      Number.isFinite(coords.z)
    ) {
      const pos = new THREE.Vector3(coords.x, coords.y, coords.z);
      const sphereGeo = new THREE.SphereGeometry(50, 12, 8);
      const sphere = new THREE.Mesh(
        sphereGeo,
        getMaterialForElementWithMode('Node', 'onlyA', false, false, id)
      );
      sphere.position.copy(pos);
      sphere.userData = {
        elementType: 'Node',
        elementId: id,
        modelSource: 'A'
      };

      // 重要度による視覚調整を適用
      applyImportanceVisuals(sphere, importance);

      group.add(sphere);
      modelBounds.expandByPoint(pos);
      if (labelToggle) {
        const labelText = `A: ${id}`;
        const sprite = createLabelSprite(labelText, pos, group, 'Node');
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
    const { coords, id, importance } = item;
    if (
      coords &&
      Number.isFinite(coords.x) &&
      Number.isFinite(coords.y) &&
      Number.isFinite(coords.z)
    ) {
      const pos = new THREE.Vector3(coords.x, coords.y, coords.z);
      const sphereGeo = new THREE.SphereGeometry(50, 12, 8);
      const sphere = new THREE.Mesh(
        sphereGeo,
        getMaterialForElementWithMode('Node', 'onlyB', false, false, id)
      );
      sphere.position.copy(pos);
      sphere.userData = {
        elementType: 'Node',
        elementId: id,
        modelSource: 'B'
      };

      // 重要度による視覚調整を適用
      applyImportanceVisuals(sphere, importance);

      group.add(sphere);
      modelBounds.expandByPoint(pos);
      if (labelToggle) {
        const labelText = `B: ${id}`;
        const sprite = createLabelSprite(labelText, pos, group, 'Node');
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

/**
 * @fileoverview 構造要素描画モジュール
 *
 * このファイルは、構造要素の3D表現を生成する機能を提供します:
 * - 線分要素（柱、梁）の描画
 * - ポリゴン要素（スラブ、壁）の描画
 * - 節点要素の描画
 * - 要素のラベル生成
 * - モデル比較結果の視覚化
 *
 * このモジュールは、比較結果に基づいて色分けされた要素を生成し、
 * 3Dシーンに追加するための中核的な描画機能を担当します。
 */

import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";
import { createLabelSprite } from "../ui/labels.js";

/**
 * 線分要素（柱、梁など）の比較結果を描画する。
 * @param {object} comparisonResult - compareElementsの比較結果。
 * @param {object} materials - マテリアルオブジェクト。
 * @param {THREE.Group} group - 描画対象の要素グループ。
 * @param {string} elementType - 描画する要素タイプ名 (例: 'Column')。
 * @param {boolean} labelToggle - ラベル表示の有無。
 * @param {THREE.Box3} modelBounds - 更新するモデル全体のバウンディングボックス。
 * @returns {Array<THREE.Sprite>} 作成されたラベルスプライトの配列。
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

  comparisonResult.matched.forEach(({ dataA, dataB }) => {
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
      const geometry = new THREE.BufferGeometry().setFromPoints([
        startVec,
        endVec,
      ]);
      const line = new THREE.Line(geometry, materials.lineMatched);
      line.userData = {
        elementType: elementType,
        elementIdA: idA,
        elementIdB: idB,
        modelSource: "matched",
      };
      group.add(line);
      modelBounds.expandByPoint(startVec);
      modelBounds.expandByPoint(endVec);

      if (labelToggle && (idA || idB)) {
        const midPoint = new THREE.Vector3()
          .addVectors(startVec, endVec)
          .multiplyScalar(0.5);
        const labelText = `${idA || "?"} / ${idB || "?"}`;
        const sprite = createLabelSprite(
          labelText,
          midPoint,
          group,
          elementType
        );
        if (sprite) {
          sprite.userData.elementIdA = idA;
          sprite.userData.elementIdB = idB;
          sprite.userData.modelSource = "matched";
          createdLabels.push(sprite);
        }
      }
    } else {
      console.warn(
        `Skipping matched line due to invalid coords: A=${idA}, B=${idB}`
      );
    }
  });

  comparisonResult.onlyA.forEach(({ startCoords, endCoords, id }) => {
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
        endVec,
      ]);
      const line = new THREE.Line(geometry, materials.lineOnlyA);
      line.userData = {
        elementType: elementType,
        elementId: id,
        modelSource: "A",
      };
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
        const labelText = `A: ${id}`;
        const sprite = createLabelSprite(
          labelText,
          labelPosition,
          group,
          elementType
        );
        if (sprite) {
          sprite.userData.elementId = id;
          sprite.userData.modelSource = "A";
          createdLabels.push(sprite);
        }
      }
    } else {
      console.warn(`Skipping onlyA line due to invalid coords: ID=${id}`);
    }
  });

  comparisonResult.onlyB.forEach(({ startCoords, endCoords, id }) => {
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
        endVec,
      ]);
      const line = new THREE.Line(geometry, materials.lineOnlyB);
      line.userData = {
        elementType: elementType,
        elementId: id,
        modelSource: "B",
      };
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
        const labelText = `B: ${id}`;
        const sprite = createLabelSprite(
          labelText,
          labelPosition,
          group,
          elementType
        );
        if (sprite) {
          sprite.userData.elementId = id;
          sprite.userData.modelSource = "B";
          createdLabels.push(sprite);
        }
      }
    } else {
      console.warn(`Skipping onlyB line due to invalid coords: ID=${id}`);
    }
  });
  return createdLabels;
}

/**
 * ポリゴン要素（スラブ、壁など）の比較結果を描画する。
 * @param {object} comparisonResult - compareElementsの比較結果。
 * @param {object} materials - マテリアルオブジェクト。
 * @param {THREE.Group} group - 描画対象の要素グループ。
 * @param {boolean} labelToggle - ラベル表示の有無。 // ★★★ 追加 ★★★
 * @param {THREE.Box3} modelBounds - 更新するモデル全体のバウンディングボックス。
 * @returns {Array<THREE.Sprite>} 作成されたラベルスプライトの配列。 // ★★★ 追加 ★★★
 */
export function drawPolyElements(
  comparisonResult,
  materials,
  group,
  labelToggle, // ★★★ 追加 ★★★
  modelBounds
) {
  group.clear();
  const createdLabels = []; // ★★★ 追加 ★★★

  const elementType = group.userData.elementType;
  if (!elementType) {
    console.error(
      "elementType is missing in group userData or name for drawPolyElements:",
      group
    );
  }

  // ★★★ labelToggle を createMeshes に渡す ★★★
  const createMeshes = (dataList, material, modelSource, labelToggle) => {
    dataList.forEach(({ vertexCoordsList, id }) => {
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
          console.warn("Skipping polygon due to invalid vertex coord:", p);
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
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData = {
        elementType: elementType,
        elementId: id,
        modelSource: modelSource,
      };
      group.add(mesh);

      // ★★★ ラベル作成ロジックを追加 ★★★
      if (labelToggle && id) {
        // ポリゴンの中心を計算
        const centerPoint = new THREE.Vector3();
        points.forEach((p) => centerPoint.add(p));
        centerPoint.divideScalar(points.length);

        let labelText = "";
        if (modelSource === "A") {
          labelText = `A: ${id}`;
        } else if (modelSource === "B") {
          labelText = `B: ${id}`;
        } else if (modelSource === "matched") {
          // matched の場合、dataA の ID を使う (createMeshes 呼び出し側で設定済み)
          labelText = `${id}`; // matched の場合はシンプルにIDのみ表示 (必要なら変更)
        }

        if (labelText) {
          const sprite = createLabelSprite(
            labelText,
            centerPoint,
            group, // ラベルも同じグループに追加
            elementType
          );
          if (sprite) {
            sprite.userData.elementId = id; // スプライトにもIDを設定
            sprite.userData.modelSource = modelSource; // スプライトにもソースを設定
            // matched の場合、必要なら elementIdA/B も設定
            if (modelSource === "matched") {
              // comparisonResult から対応する B の ID を探すのは少し手間がかかる
              // ここでは A の ID のみ elementId として設定
              // 必要であれば matched の dataList に B の ID も含めるように修正が必要
            }
            createdLabels.push(sprite);
          }
        }
      }
    });
  };

  // ★★★ createMeshes 呼び出し時に labelToggle を渡す ★★★
  createMeshes(
    comparisonResult.matched.map((item) => ({
      vertexCoordsList: item.dataA.vertexCoordsList,
      id: item.dataA.id,
      // idB: item.dataB.id, // 必要ならBのIDも渡す
    })),
    materials.polyMatched,
    "matched",
    labelToggle // ★★★ 追加 ★★★
  );
  createMeshes(comparisonResult.onlyA, materials.polyOnlyA, "A", labelToggle); // ★★★ 追加 ★★★
  createMeshes(comparisonResult.onlyB, materials.polyOnlyB, "B", labelToggle); // ★★★ 追加 ★★★

  return createdLabels; // ★★★ 追加 ★★★
}

/**
 * 節点要素の比較結果を描画する。
 * @param {object} comparisonResult - compareElementsの比較結果。
 * @param {object} materials - マテリアルオブジェクト。
 * @param {THREE.Group} group - 描画対象の要素グループ (節点メッシュ用)。
 * @param {boolean} labelToggle - ラベル表示の有無。
 * @param {THREE.Box3} modelBounds - 更新するモデル全体のバウンディングボックス。
 * @returns {Array<THREE.Sprite>} 作成されたラベルスプライトの配列。
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

  comparisonResult.matched.forEach(({ dataA, dataB }) => {
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
      const sphere = new THREE.Mesh(sphereGeo, materials.matched);
      sphere.position.copy(pos);
      sphere.userData = {
        elementType: "Node",
        elementIdA: idA,
        elementIdB: idB,
        modelSource: "matched",
      };
      group.add(sphere);
      modelBounds.expandByPoint(pos);
      if (labelToggle) {
        const labelText = `${idA} / ${idB}`;
        const sprite = createLabelSprite(labelText, pos, group, "Node");
        if (sprite) {
          sprite.userData.elementIdA = idA;
          sprite.userData.elementIdB = idB;
          sprite.userData.modelSource = "matched";
          createdLabels.push(sprite);
        }
      }
    } else {
      console.warn(
        `Skipping matched node due to invalid coords: A=${idA}, B=${idB}`
      );
    }
  });

  comparisonResult.onlyA.forEach(({ coords, id }) => {
    if (
      coords &&
      Number.isFinite(coords.x) &&
      Number.isFinite(coords.y) &&
      Number.isFinite(coords.z)
    ) {
      const pos = new THREE.Vector3(coords.x, coords.y, coords.z);
      const sphereGeo = new THREE.SphereGeometry(50, 12, 8);
      const sphere = new THREE.Mesh(sphereGeo, materials.onlyA);
      sphere.position.copy(pos);
      sphere.userData = {
        elementType: "Node",
        elementId: id,
        modelSource: "A",
      };
      group.add(sphere);
      modelBounds.expandByPoint(pos);
      if (labelToggle) {
        const labelText = `A: ${id}`;
        const sprite = createLabelSprite(labelText, pos, group, "Node");
        if (sprite) {
          sprite.userData.elementId = id;
          sprite.userData.modelSource = "A";
          createdLabels.push(sprite);
        }
      }
    } else {
      console.warn(`Skipping onlyA node due to invalid coords: ID=${id}`);
    }
  });

  comparisonResult.onlyB.forEach(({ coords, id }) => {
    if (
      coords &&
      Number.isFinite(coords.x) &&
      Number.isFinite(coords.y) &&
      Number.isFinite(coords.z)
    ) {
      const pos = new THREE.Vector3(coords.x, coords.y, coords.z);
      const sphereGeo = new THREE.SphereGeometry(50, 12, 8);
      const sphere = new THREE.Mesh(sphereGeo, materials.onlyB);
      sphere.position.copy(pos);
      sphere.userData = {
        elementType: "Node",
        elementId: id,
        modelSource: "B",
      };
      group.add(sphere);
      modelBounds.expandByPoint(pos);
      if (labelToggle) {
        const labelText = `B: ${id}`;
        const sprite = createLabelSprite(labelText, pos, group, "Node");
        if (sprite) {
          sprite.userData.elementId = id;
          sprite.userData.modelSource = "B";
          createdLabels.push(sprite);
        }
      }
    } else {
      console.warn(`Skipping onlyB node due to invalid coords: ID=${id}`);
    }
  });
  return createdLabels;
}

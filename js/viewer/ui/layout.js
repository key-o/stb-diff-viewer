/**
 * @fileoverview 建築レイアウト要素描画モジュール
 *
 * このファイルは、建築モデルの補助的なレイアウト要素の描画機能を提供します:
 * - 通り芯（X軸・Y軸）の平面表示
 * - 階（ストーリー）の平面表示
 * - レイアウト要素へのラベル付与
 * - 建築モデルの基準面表示
 *
 * これらのレイアウト要素は、モデルを理解するための空間的な参照を提供し、
 * クリッピング機能と連携することで特定の通り芯や階での断面表示を可能にします。
 */

import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";
import { createLabelSprite } from "./labels.js";
import { materials } from "../rendering/materials.js";

/**
 * 通り芯（軸）を面として描画する。
 * @param {object} axesData - parseAxesから返される軸データ ({ xAxes: [], yAxes: [] })。
 * @param {THREE.Group} group - 描画対象の要素グループ (Axis)。
 * @param {THREE.Box3} modelBounds - モデル全体のバウンディングボックス。
 * @param {boolean} labelToggle - ラベル表示の有無。
 * @returns {Array<THREE.Sprite>} 作成されたラベルスプライトの配列。
 */
export function drawAxes(axesData, group, modelBounds, labelToggle) {
  group.clear();
  const createdLabels = [];
  const axisMaterial = materials.axisPlane;
  const labelOffset = 150; // ★★★ オフセット値を少し増やす ★★★

  console.log(
    "Drawing Axes (Planes). Bounds Min:",
    modelBounds.min,
    "Max:",
    modelBounds.max,
    "Is Empty:",
    modelBounds.isEmpty()
  );

  // デバッグ用：モデルバウンドの詳細を出力
  if (!modelBounds.isEmpty()) {
    const min = modelBounds.min;
    const max = modelBounds.max;
    const size = modelBounds.getSize(new THREE.Vector3());
    const center = modelBounds.getCenter(new THREE.Vector3());
    console.log(
      `Model bounds detail - Min: (${min.x.toFixed(0)}, ${min.y.toFixed(
        0
      )}, ${min.z.toFixed(0)})mm, Max: (${max.x.toFixed(0)}, ${max.y.toFixed(
        0
      )}, ${max.z.toFixed(0)})mm`
    );
    console.log(
      `Model size: (${size.x.toFixed(0)}, ${size.y.toFixed(
        0
      )}, ${size.z.toFixed(0)})mm, Center: (${center.x.toFixed(
        0
      )}, ${center.y.toFixed(0)}, ${center.z.toFixed(0)})mm`
    );
  }

  if (modelBounds.isEmpty()) {
    console.warn(
      "Cannot draw axes accurately without model bounds. Skipping axis drawing."
    );
    return createdLabels;
  }

  const min = modelBounds.min;
  const max = modelBounds.max;
  const size = modelBounds.getSize(new THREE.Vector3());
  // 通り芯の平面サイズをモデルサイズに基づいて設定
  // 他の3D要素と同じようにズームに連動するように、シンプルな比例関係にする
  const center = modelBounds.getCenter(new THREE.Vector3());

  console.log(
    `Axes Plane Draw Params: ModelSize=(${size.x.toFixed(0)}, ${size.y.toFixed(
      0
    )}, ${size.z.toFixed(0)}), Center=(${center.x.toFixed(
      0
    )}, ${center.y.toFixed(0)}, ${center.z.toFixed(0)})`
  );

  // 面のサイズをモデル範囲より少し広げる
  const extendXY = Math.max(size.x, size.y, 1000) * 0.5 + 1000;
  const extendZ = Math.max(size.z, 500) * 0.5 + 500; // Z方向にも少し広げる

  // X軸 (YZ平面)
  axesData.xAxes.forEach((axis) => {
    const x = axis.distance;
    // YZ平面を作成
    const planeHeight = size.y + 2 * extendXY; // Y方向のサイズ
    const planeDepth = size.z + 2 * extendZ; // Z方向のサイズ
    const geometry = new THREE.PlaneGeometry(planeHeight, planeDepth);
    const plane = new THREE.Mesh(geometry, axisMaterial);
    // ★★★ 平面メッシュに userData を追加 ★★★
    plane.userData = {
      elementType: "Axis",
      elementId: axis.name,
      axisType: "X",
      distance: axis.distance,
    };

    // ★★★ Render Order を負の値に変更 ★★★
    plane.renderOrder = -1;

    // 位置と向きを設定
    plane.position.set(x, center.y, center.z);
    plane.rotation.y = Math.PI / 2; // Y軸周りに90度回転してYZ平面にする

    console.log(
      `  X-Axis Plane '${axis.name}': Position=(${plane.position.x.toFixed(
        1
      )}, ${plane.position.y.toFixed(1)}, ${plane.position.z.toFixed(
        1
      )}), Size=(${planeHeight.toFixed(1)}, ${planeDepth.toFixed(1)})`
    );

    if (
      !Number.isFinite(plane.position.x) ||
      !Number.isFinite(plane.position.y) ||
      !Number.isFinite(plane.position.z)
    ) {
      console.error(
        `Invalid position calculated for X-Axis Plane '${axis.name}'. Skipping.`
      );
      return;
    }

    group.add(plane);

    if (labelToggle) {
      // ★★★ ラベルを面のY最小、Z最小側のエッジ中央付近に配置 ★★★
      const labelPos = new THREE.Vector3(
        x,
        min.y - labelOffset, // Yは最小値より少し外
        center.z // Zは中心
      );
      const sprite = createLabelSprite(axis.name, labelPos, group, "Axis");
      if (sprite) createdLabels.push(sprite);
    }
  });

  // Y軸 (XZ平面)
  axesData.yAxes.forEach((axis) => {
    const y = axis.distance;
    // XZ平面を作成
    const planeWidth = size.x + 2 * extendXY; // X方向のサイズ
    const planeDepth = size.z + 2 * extendZ; // Z方向のサイズ
    const geometry = new THREE.PlaneGeometry(planeWidth, planeDepth);
    const plane = new THREE.Mesh(geometry, axisMaterial);
    // ★★★ 平面メッシュに userData を追加 ★★★
    plane.userData = {
      elementType: "Axis",
      elementId: axis.name,
      axisType: "Y",
      distance: axis.distance,
    };

    // ★★★ Render Order を負の値に変更 ★★★
    plane.renderOrder = -1;

    // 位置と向きを設定
    plane.position.set(center.x, y, center.z);
    plane.rotation.x = -Math.PI / 2; // X軸周りに-90度回転してXZ平面にする

    console.log(
      `  Y-Axis Plane '${axis.name}': Position=(${plane.position.x.toFixed(
        1
      )}, ${plane.position.y.toFixed(1)}, ${plane.position.z.toFixed(
        1
      )}), Size=(${planeWidth.toFixed(1)}, ${planeDepth.toFixed(1)})`
    );

    if (
      !Number.isFinite(plane.position.x) ||
      !Number.isFinite(plane.position.y) ||
      !Number.isFinite(plane.position.z)
    ) {
      console.error(
        `Invalid position calculated for Y-Axis Plane '${axis.name}'. Skipping.`
      );
      return;
    }

    group.add(plane);

    if (labelToggle) {
      // ★★★ ラベルを面のX最小、Z最小側のエッジ中央付近に配置 ★★★
      const labelPos = new THREE.Vector3(
        min.x - labelOffset, // Xは最小値より少し外
        y,
        center.z // Zは中心
      );
      const sprite = createLabelSprite(axis.name, labelPos, group, "Axis");
      if (sprite) createdLabels.push(sprite);
    }
  });

  return createdLabels;
}

/**
 * 階（ストーリー）を面として描画する。
 * @param {Array<object>} storiesData - parseStoriesから返される階データ。
 * @param {THREE.Group} group - 描画対象の要素グループ (Story)。
 * @param {THREE.Box3} modelBounds - モデル全体のバウンディングボックス。
 * @param {boolean} labelToggle - ラベル表示の有無。
 * @returns {Array<THREE.Sprite>} 作成されたラベルスプライトの配列。
 */
export function drawStories(storiesData, group, modelBounds, labelToggle) {
  group.clear();
  const createdLabels = [];
  const storyMaterial = materials.storyPlane;
  const labelOffset = 150; // ★★★ オフセット値を少し増やす ★★★

  console.log(
    "Drawing Stories (Planes). Bounds Min:",
    modelBounds.min,
    "Max:",
    modelBounds.max,
    "Is Empty:",
    modelBounds.isEmpty()
  );

  // デバッグ用：モデルバウンドの詳細を出力
  if (!modelBounds.isEmpty()) {
    const min = modelBounds.min;
    const max = modelBounds.max;
    const size = modelBounds.getSize(new THREE.Vector3());
    const center = modelBounds.getCenter(new THREE.Vector3());
    console.log(
      `Story model bounds detail - Min: (${min.x.toFixed(0)}, ${min.y.toFixed(
        0
      )}, ${min.z.toFixed(0)})mm, Max: (${max.x.toFixed(0)}, ${max.y.toFixed(
        0
      )}, ${max.z.toFixed(0)})mm`
    );
    console.log(
      `Story model size: (${size.x.toFixed(0)}, ${size.y.toFixed(
        0
      )}, ${size.z.toFixed(0)})mm, Center: (${center.x.toFixed(
        0
      )}, ${center.y.toFixed(0)}, ${center.z.toFixed(0)})mm`
    );
  }

  if (modelBounds.isEmpty()) {
    console.warn("Cannot draw stories accurately without model bounds.");
    return createdLabels;
  }

  const min = modelBounds.min;
  const max = modelBounds.max;
  const size = modelBounds.getSize(new THREE.Vector3());
  // 面のサイズをモデル範囲より少し広げる
  const extend = Math.max(size.x, size.y, 1000) * 0.5 + 1000;
  const center = modelBounds.getCenter(new THREE.Vector3());

  storiesData.forEach((story) => {
    const z = story.height;
    // XY平面を作成
    const planeWidth = size.x + 2 * extend; // X方向のサイズ
    const planeHeight = size.y + 2 * extend; // Y方向のサイズ
    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
    const plane = new THREE.Mesh(geometry, storyMaterial);
    // ★★★ 平面メッシュに userData を追加 ★★★
    plane.userData = {
      elementType: "Story",
      elementId: story.id,
      name: story.name,
      height: story.height,
    };
    // 位置を設定 (向きはデフォルトでXY平面)
    plane.position.set(center.x, center.y, z);

    // ★★★ Render Order を負の値に変更 ★★★
    plane.renderOrder = -1;

    console.log(
      `  Story Plane '${story.name}': Position=(${plane.position.x.toFixed(
        1
      )}, ${plane.position.y.toFixed(1)}, ${plane.position.z.toFixed(
        1
      )}), Size=(${planeWidth.toFixed(1)}, ${planeHeight.toFixed(1)})`
    );

    if (
      !Number.isFinite(plane.position.x) ||
      !Number.isFinite(plane.position.y) ||
      !Number.isFinite(plane.position.z)
    ) {
      console.error(
        `Invalid position calculated for Story Plane '${story.name}'. Skipping.`
      );
      return;
    }

    group.add(plane);

    if (labelToggle) {
      const labelText = `${story.name} (Z=${z.toFixed(0)})`;
      // ★★★ ラベルを面のX最小、Y最小側のエッジ中央付近に配置 ★★★
      const labelPos = new THREE.Vector3(
        min.x - labelOffset, // Xは最小値より少し外
        center.y, // Yは中心
        z
      );
      const sprite = createLabelSprite(labelText, labelPos, group, "Story");
      if (sprite) createdLabels.push(sprite);
    }
  });

  return createdLabels;
}

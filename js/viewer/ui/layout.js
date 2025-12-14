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

import * as THREE from 'three';
import { createLabelSprite } from './labels.js';
import { materials } from '../rendering/materials.js';

/**
 * 通り芯（軸）を指定された階高さに沿った線（Line）として描画する。
 * @param {object} axesData - parseAxesから返される軸データ ({ xAxes: [], yAxes: [] })。
 * @param {Array<object>} storiesData - parseStoriesから返される階データ。
 * @param {THREE.Group} group - 描画対象の要素グループ (Axis)。
 * @param {THREE.Box3} modelBounds - モデル全体のバウンディングボックス。
 * @param {boolean} labelToggle - ラベル表示の有無。
 * @param {THREE.Camera} camera - カメラ（未使用、互換性のため）。
 * @param {Object} options - オプション。
 * @param {string} [options.targetStoryId] - 通り芯を描画する階のID。指定しない場合は最下階。
 * @param {boolean} [options.is2DMode=false] - 2Dモードかどうか。2Dモードでは延長を制限。
 * @returns {Array<THREE.Sprite>} 作成されたラベルスプライトの配列。
 */
export function drawAxes(
  axesData,
  storiesData,
  group,
  modelBounds,
  labelToggle,
  camera,
  options = {}
) {
  group.clear();
  const createdLabels = [];

  if (!modelBounds || modelBounds.isEmpty()) return createdLabels;
  const min = modelBounds.min;
  const max = modelBounds.max;
  const size = modelBounds.getSize(new THREE.Vector3());
  const center = modelBounds.getCenter(new THREE.Vector3());
  // 3Dモード時は階の平面と同じ延長、2Dモード時は階の枠程度に制限
  const fullExtend = Math.max(size.x, size.y, 1000) * 0.5 + 1000;
  const extendXY = options.is2DMode ? 500 : fullExtend;
  const labelMargin = 0; // ラベルを通り芯の端に配置

  // バッチ処理: すべての通り芯セグメントを1つのジオメトリにまとめる
  const allVertices = [];
  const axisMetadata = []; // 各セグメントのメタデータを保存

  // 一点鎖線パターンの定数
  const dashLength = 800;   // 長い実線部分 (mm)
  const dotLength = 100;    // 点部分 (mm)
  const gapLength = 200;    // 隙間 (mm)

  // 通り芯を描画する階を決定
  // options.targetStoryId が指定されていればその階、なければ最下階
  let targetStory = null;
  if (storiesData && storiesData.length > 0) {
    if (options.targetStoryId && options.targetStoryId !== 'all') {
      // 指定された階を検索
      targetStory = storiesData.find(story => story.id === options.targetStoryId);
    }
    // 見つからない場合は最下階を使用
    if (!targetStory) {
      targetStory = storiesData.reduce((lowest, story) => {
        if (!lowest || story.height < lowest.height) {
          return story;
        }
        return lowest;
      }, null);
    }
  }

  /**
   * 一点鎖線のセグメントを生成してバッチ配列に追加
   * @param {THREE.Vector3} p1 - 始点
   * @param {THREE.Vector3} p2 - 終点
   * @param {Object} userData - セグメントのメタデータ
   */
  function addLineToBatch(p1, p2, userData) {
    const direction = new THREE.Vector3().subVectors(p2, p1);
    const totalLength = direction.length();
    direction.normalize();

    let currentPos = 0;
    const segmentStartIndex = allVertices.length / 3 / 2; // セグメント開始インデックス

    while (currentPos < totalLength) {
      // 長い実線部分
      const dashStart = currentPos;
      const dashEnd = Math.min(currentPos + dashLength, totalLength);
      if (dashEnd > dashStart) {
        const startPoint = p1.clone().add(direction.clone().multiplyScalar(dashStart));
        const endPoint = p1.clone().add(direction.clone().multiplyScalar(dashEnd));
        allVertices.push(startPoint.x, startPoint.y, startPoint.z);
        allVertices.push(endPoint.x, endPoint.y, endPoint.z);
      }
      currentPos += dashLength + gapLength;

      if (currentPos >= totalLength) break;

      // 点部分
      const dotStart = currentPos;
      const dotEnd = Math.min(currentPos + dotLength, totalLength);
      if (dotEnd > dotStart) {
        const startPoint = p1.clone().add(direction.clone().multiplyScalar(dotStart));
        const endPoint = p1.clone().add(direction.clone().multiplyScalar(dotEnd));
        allVertices.push(startPoint.x, startPoint.y, startPoint.z);
        allVertices.push(endPoint.x, endPoint.y, endPoint.z);
      }
      currentPos += dotLength + gapLength;
    }

    const segmentEndIndex = allVertices.length / 3 / 2; // セグメント終了インデックス
    // このラインに属するセグメント範囲を記録
    axisMetadata.push({
      startSegment: segmentStartIndex,
      endSegment: segmentEndIndex,
      userData
    });
  }

  // X axes: lines parallel to Y at a given X（最下階のみ描画）
  axesData.xAxes.forEach((axis) => {
    const x = axis.distance;
    const yStart = min.y - extendXY;
    const yEnd = max.y + extendXY;

    if (targetStory) {
      // 最下階の高さに描画
      const z = targetStory.height;
      addLineToBatch(new THREE.Vector3(x, yStart, z), new THREE.Vector3(x, yEnd, z), {
        elementType: 'Axis',
        elementId: axis.name,
        axisType: 'X',
        distance: axis.distance,
        storyId: targetStory.id,
        storyName: targetStory.name,
        storyHeight: z
      });
      if (labelToggle) {
        const meta = {
          axisType: 'X',
          distance: axis.distance,
          storyId: targetStory.id,
          storyName: targetStory.name,
          storyHeight: z,
          modelBounds: {
            min: min.clone(),
            max: max.clone(),
            center: center.clone()
          }
        };
        const labelPos = new THREE.Vector3(x, yStart - labelMargin, z);
        const sprite = createLabelSprite(axis.name, labelPos, group, 'Axis', meta);
        if (sprite) createdLabels.push(sprite);
      }
    } else {
      // 階データがない場合はモデル中心に描画
      addLineToBatch(new THREE.Vector3(x, yStart, center.z), new THREE.Vector3(x, yEnd, center.z), {
        elementType: 'Axis',
        elementId: axis.name,
        axisType: 'X',
        distance: axis.distance
      });
      if (labelToggle) {
        const meta = {
          axisType: 'X',
          distance: axis.distance,
          modelBounds: {
            min: min.clone(),
            max: max.clone(),
            center: center.clone()
          }
        };
        const labelPos = new THREE.Vector3(x, yStart - labelMargin, center.z);
        const sprite = createLabelSprite(axis.name, labelPos, group, 'Axis', meta);
        if (sprite) createdLabels.push(sprite);
      }
    }
  });

  // Y axes: lines parallel to X at a given Y（最下階のみ描画）
  axesData.yAxes.forEach((axis) => {
    const y = axis.distance;
    const xStart = min.x - extendXY;
    const xEnd = max.x + extendXY;

    if (targetStory) {
      // 最下階の高さに描画
      const z = targetStory.height;
      addLineToBatch(new THREE.Vector3(xStart, y, z), new THREE.Vector3(xEnd, y, z), {
        elementType: 'Axis',
        elementId: axis.name,
        axisType: 'Y',
        distance: axis.distance,
        storyId: targetStory.id,
        storyName: targetStory.name,
        storyHeight: z
      });
      if (labelToggle) {
        const meta = {
          axisType: 'Y',
          distance: axis.distance,
          storyId: targetStory.id,
          storyName: targetStory.name,
          storyHeight: z,
          modelBounds: {
            min: min.clone(),
            max: max.clone(),
            center: center.clone()
          }
        };
        const labelPos = new THREE.Vector3(xStart - labelMargin, y, z);
        const sprite = createLabelSprite(axis.name, labelPos, group, 'Axis', meta);
        if (sprite) createdLabels.push(sprite);
      }
    } else {
      // 階データがない場合はモデル中心に描画
      addLineToBatch(new THREE.Vector3(xStart, y, center.z), new THREE.Vector3(xEnd, y, center.z), {
        elementType: 'Axis',
        elementId: axis.name,
        axisType: 'Y',
        distance: axis.distance
      });
      if (labelToggle) {
        const meta = {
          axisType: 'Y',
          distance: axis.distance,
          modelBounds: {
            min: min.clone(),
            max: max.clone(),
            center: center.clone()
          }
        };
        const labelPos = new THREE.Vector3(xStart - labelMargin, y, center.z);
        const sprite = createLabelSprite(axis.name, labelPos, group, 'Axis', meta);
        if (sprite) createdLabels.push(sprite);
      }
    }
  });

  // すべての通り芯を1つのLineSegmentsにまとめて追加
  if (allVertices.length > 0) {
    const positions = new Float32Array(allVertices);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const batchedLines = new THREE.LineSegments(geometry, materials.axisLine);
    batchedLines.renderOrder = -1;
    batchedLines.userData = {
      elementType: 'Axis',
      isBatched: true,
      axisMetadata // レイキャスト時に個別の通り芯を特定するためのメタデータ
    };
    group.add(batchedLines);
  }

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
  const labelMargin = 0; // 通り芯ラベルと同じマージン

  console.log(
    'Drawing Stories (Planes). Bounds Min:',
    modelBounds.min,
    'Max:',
    modelBounds.max,
    'Is Empty:',
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
    console.warn('Cannot draw stories accurately without model bounds.');
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
      elementType: 'Story',
      elementId: story.id,
      name: story.name,
      height: story.height
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
      const labelText = story.name;

      // 左下コーナー（通り芯ラベルと同じ位置）にラベルを配置
      const labelPosMin = new THREE.Vector3(
        min.x - extend - labelMargin,
        min.y - extend - labelMargin,
        z
      );
      const spriteMin = createLabelSprite(labelText, labelPosMin, group, 'Story');
      if (spriteMin) createdLabels.push(spriteMin);

      // 右上コーナー（対角）にもラベルを配置
      const labelPosMax = new THREE.Vector3(
        max.x + extend + labelMargin,
        max.y + extend + labelMargin,
        z
      );
      const spriteMax = createLabelSprite(labelText, labelPosMax, group, 'Story');
      if (spriteMax) createdLabels.push(spriteMax);
    }
  });

  return createdLabels;
}

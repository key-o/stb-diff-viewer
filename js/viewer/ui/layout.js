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
import { AXIS_LINE_PATTERN } from '../../config/renderingConstants.js';

/**
 * レイアウト要素（通り芯・レベル面）の共通延長量を計算
 * @param {THREE.Box3} modelBounds - モデルのバウンディングボックス
 * @returns {number} 延長量（mm）
 */
function getLayoutExtend(modelBounds) {
  if (!modelBounds || modelBounds.isEmpty()) {
    return 500; // デフォルト値
  }
  const size = modelBounds.getSize(new THREE.Vector3());
  return Math.max(size.x, size.y) * 0.15 + 500;
}

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
  options = {},
) {
  group.clear();

  const createdLabels = [];

  if (!modelBounds || modelBounds.isEmpty()) return createdLabels;
  const min = modelBounds.min;
  const max = modelBounds.max;
  const center = modelBounds.getCenter(new THREE.Vector3());
  // 通り芯の延長量（共通関数を使用してレベル面と確実に一致させる）
  const extendXY = getLayoutExtend(modelBounds);
  const labelMargin = 0; // ラベルを通り芯の端（レベル線上）に配置

  // 通り芯を描画する階を決定
  // options.targetStoryId が指定されていればその階、なければ最下階
  let targetStory = null;
  if (storiesData && storiesData.length > 0) {
    if (options.targetStoryId && options.targetStoryId !== 'all') {
      // 指定された階を検索
      targetStory = storiesData.find((story) => story.id === options.targetStoryId);
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
   * 点パターン（短い実線）を追加する
   * @param {THREE.Vector3} start - 通り芯の始点
   * @param {THREE.Vector3} direction - 正規化された方向ベクトル
   * @param {number} totalLength - 通り芯の全長
   * @param {number} cycleLength - 1サイクルの長さ (DASH + GAP + DOT + GAP)
   * @param {number} dashLength - ダッシュ（長い実線）の長さ
   * @param {number} gapLength - 隙間の長さ
   * @param {number} dotLength - 点（短い実線）の長さ
   * @param {Object} userData - セグメントのメタデータ
   */
  function addDotPattern(start, direction, totalLength, cycleLength, dashLength, gapLength, dotLength, userData) {
    // 点の開始位置: 各サイクルの DASH_LENGTH + GAP_LENGTH の位置から開始
    const dotStartOffset = dashLength + gapLength;

    for (let dist = dotStartOffset; dist < totalLength; dist += cycleLength) {
      const dotStart = new THREE.Vector3().copy(start).addScaledVector(direction, dist);
      const dotEndDist = Math.min(dist + dotLength, totalLength);
      const dotEnd = new THREE.Vector3().copy(start).addScaledVector(direction, dotEndDist);

      const dotVertices = new Float32Array([
        dotStart.x, dotStart.y, dotStart.z,
        dotEnd.x, dotEnd.y, dotEnd.z
      ]);
      const dotGeometry = new THREE.BufferGeometry();
      dotGeometry.setAttribute('position', new THREE.BufferAttribute(dotVertices, 3));

      const dotMaterial = new THREE.LineBasicMaterial({
        color: 0x888888,
        linewidth: 1
      });

      const dotLine = new THREE.Line(dotGeometry, dotMaterial);
      dotLine.frustumCulled = false;
      dotLine.userData = { ...userData, isDot: true };
      group.add(dotLine);
    }
  }

  /**
   * 直線セグメントを一点鎖線パターンで生成してグループに追加
   * @param {THREE.Vector3} p1 - 始点
   * @param {THREE.Vector3} p2 - 終点
   * @param {Object} userData - セグメントのメタデータ
   */
  function addLineToGroup(p1, p2, userData) {
    // 座標の妥当性チェック
    if (
      !Number.isFinite(p1.x) ||
      !Number.isFinite(p1.y) ||
      !Number.isFinite(p1.z) ||
      !Number.isFinite(p2.x) ||
      !Number.isFinite(p2.y) ||
      !Number.isFinite(p2.z)
    ) {
      console.warn('Invalid axis line points:', p1, p2);
      return;
    }

    // 長さが極端に短い場合はスキップ
    const direction = new THREE.Vector3().subVectors(p2, p1);
    const totalLength = direction.length();
    if (totalLength < 1e-6) return;
    direction.normalize();

    // 一点鎖線パターンの定数を取得
    const { DASH_LENGTH, DOT_LENGTH, GAP_LENGTH } = AXIS_LINE_PATTERN;
    const cycleLength = DASH_LENGTH + GAP_LENGTH + DOT_LENGTH + GAP_LENGTH;

    // 1. ダッシュライン（長い実線部分）をLineDashedMaterialで描画
    const vertices = new Float32Array([
      p1.x, p1.y, p1.z,
      p2.x, p2.y, p2.z
    ]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

    const dashMaterial = new THREE.LineDashedMaterial({
      color: 0x888888,
      dashSize: DASH_LENGTH,
      gapSize: GAP_LENGTH + DOT_LENGTH + GAP_LENGTH, // 点を含む隙間
      linewidth: 1
    });

    const line = new THREE.Line(geometry, dashMaterial);
    line.computeLineDistances(); // LineDashedMaterialに必須
    line.frustumCulled = false;
    line.userData = userData;

    group.add(line);

    // 2. 点パターン（短い実線として追加）
    addDotPattern(p1, direction, totalLength, cycleLength, DASH_LENGTH, GAP_LENGTH, DOT_LENGTH, userData);
  }

  // X axes: lines parallel to Y at a given X（最下階のみ描画）
  axesData.xAxes.forEach((axis) => {
    const x = axis.distance;
    const yStart = min.y - extendXY;
    const yEnd = max.y + extendXY;

    if (targetStory) {
      // 最下階の高さに描画
      const z = targetStory.height;
      const userData = {
        elementType: 'Axis',
        elementId: axis.name,
        axisType: 'X',
        distance: axis.distance,
        storyId: targetStory.id,
        storyName: targetStory.name,
        storyHeight: z,
      };
      addLineToGroup(new THREE.Vector3(x, yStart, z), new THREE.Vector3(x, yEnd, z), userData);
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
            center: center.clone(),
          },
        };
        const labelPos = new THREE.Vector3(x, yStart - labelMargin, z);
        const sprite = createLabelSprite(axis.name, labelPos, group, 'Axis', meta);
        if (sprite) createdLabels.push(sprite);
      }
    } else {
      // 階データがない場合はモデル中心に描画
      const userData = {
        elementType: 'Axis',
        elementId: axis.name,
        axisType: 'X',
        distance: axis.distance,
      };
      addLineToGroup(
        new THREE.Vector3(x, yStart, center.z),
        new THREE.Vector3(x, yEnd, center.z),
        userData,
      );
      if (labelToggle) {
        const meta = {
          axisType: 'X',
          distance: axis.distance,
          modelBounds: {
            min: min.clone(),
            max: max.clone(),
            center: center.clone(),
          },
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
      const userData = {
        elementType: 'Axis',
        elementId: axis.name,
        axisType: 'Y',
        distance: axis.distance,
        storyId: targetStory.id,
        storyName: targetStory.name,
        storyHeight: z,
      };
      addLineToGroup(new THREE.Vector3(xStart, y, z), new THREE.Vector3(xEnd, y, z), userData);
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
            center: center.clone(),
          },
        };
        const labelPos = new THREE.Vector3(xStart - labelMargin, y, z);
        const sprite = createLabelSprite(axis.name, labelPos, group, 'Axis', meta);
        if (sprite) createdLabels.push(sprite);
      }
    } else {
      // 階データがない場合はモデル中心に描画
      const userData = {
        elementType: 'Axis',
        elementId: axis.name,
        axisType: 'Y',
        distance: axis.distance,
      };
      addLineToGroup(
        new THREE.Vector3(xStart, y, center.z),
        new THREE.Vector3(xEnd, y, center.z),
        userData,
      );
      if (labelToggle) {
        const meta = {
          axisType: 'Y',
          distance: axis.distance,
          modelBounds: {
            min: min.clone(),
            max: max.clone(),
            center: center.clone(),
          },
        };
        const labelPos = new THREE.Vector3(xStart - labelMargin, y, center.z);
        const sprite = createLabelSprite(axis.name, labelPos, group, 'Axis', meta);
        if (sprite) createdLabels.push(sprite);
      }
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

  if (modelBounds.isEmpty()) {
    console.warn('Cannot draw stories accurately without model bounds.');
    return createdLabels;
  }

  const min = modelBounds.min;
  const max = modelBounds.max;
  const size = modelBounds.getSize(new THREE.Vector3());
  // 面のサイズをモデル範囲より少し広げる（共通関数を使用して通り芯と確実に一致させる）
  const extend = getLayoutExtend(modelBounds);
  const labelMargin = 0; // ラベルをレベル面の端（通り芯と同じ位置）に配置
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
      height: story.height,
    };
    // 位置を設定 (向きはデフォルトでXY平面)
    plane.position.set(center.x, center.y, z);

    // ★★★ Render Order を負の値に変更 ★★★
    plane.renderOrder = -1;

    if (
      !Number.isFinite(plane.position.x) ||
      !Number.isFinite(plane.position.y) ||
      !Number.isFinite(plane.position.z)
    ) {
      console.error(`Invalid position calculated for Story Plane '${story.name}'. Skipping.`);
      return;
    }

    group.add(plane);

    if (labelToggle) {
      const labelText = story.name;

      // 左下コーナー（通り芯ラベルと同じ位置）にラベルを配置
      const labelPosMin = new THREE.Vector3(
        min.x - extend - labelMargin,
        min.y - extend - labelMargin,
        z,
      );
      const spriteMin = createLabelSprite(labelText, labelPosMin, group, 'Story');
      if (spriteMin) createdLabels.push(spriteMin);

      // 右上コーナー（対角）にもラベルを配置
      const labelPosMax = new THREE.Vector3(
        max.x + extend + labelMargin,
        max.y + extend + labelMargin,
        z,
      );
      const spriteMax = createLabelSprite(labelText, labelPosMax, group, 'Story');
      if (spriteMax) createdLabels.push(spriteMax);
    }
  });

  return createdLabels;
}

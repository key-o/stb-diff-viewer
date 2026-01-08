/**
 * @fileoverview STB→DXFエクスポーター メインモジュール
 *
 * STBモデルをDXF形式にエクスポートするメイン機能を提供します。
 * 2D投影、エッジ抽出、ラベル・通り芯・レベル線の出力を統合します。
 */

import { createLogger } from '../../../utils/logger.js';
import {
  EXPORTABLE_ELEMENT_TYPES,
  getActiveCameraInternal,
  getOrthographicCameraInternal,
  getElementGroupsInternal,
  getCurrentClippingStateInternal,
} from './DxfProviders.js';
import {
  detectViewDirection,
  projectPointTo2D,
  extractEdgesFromMesh,
  collectLabelSprites,
  collectAxisLines,
  generateAxisLinesAtClippingHeight,
  collectLevelLines,
} from './DxfGeometryCollector.js';
import { generateDxfContent, downloadDxf } from './DxfFormatWriter.js';
import { showError, showWarning } from '../../../ui/toast.js';

const log = createLogger('StbToDxfExporter');

/**
 * エクスポート可能かどうかを判定
 * @returns {{canExport: boolean, reason: string}} エクスポート可否と理由
 */
export function canExportStbToDxf() {
  const elementGroups = getElementGroupsInternal();

  log.info('canExportStbToDxf: elementGroups keys:', Object.keys(elementGroups));

  if (!elementGroups || Object.keys(elementGroups).length === 0) {
    return { canExport: false, reason: 'モデルが読み込まれていません' };
  }

  const orthographicCamera = getOrthographicCameraInternal();
  if (!orthographicCamera) {
    return { canExport: false, reason: 'カメラが初期化されていません' };
  }

  // 表示可能なオブジェクト（Mesh、Line、InstancedMesh等）があるか確認
  let hasExportableObject = false;
  const solidElementTypes = [];
  for (const [type, group] of Object.entries(elementGroups)) {
    if (EXPORTABLE_ELEMENT_TYPES.includes(type)) {
      let objectCount = 0;
      let visibleObjectCount = 0;
      group.traverse((child) => {
        // Mesh、Line、LineSegments、InstancedMeshを全てチェック
        const isExportable =
          child.isMesh || child.isLine || child.isLineSegments || child.isInstancedMesh;
        if (isExportable) {
          objectCount++;
          if (child.visible) {
            visibleObjectCount++;
            hasExportableObject = true;
          }
        }
      });
      log.info(
        `canExportStbToDxf: ${type} - total objects: ${objectCount}, visible: ${visibleObjectCount}`,
      );
      if (visibleObjectCount > 0) {
        solidElementTypes.push(type);
      }
    }
  }

  if (!hasExportableObject) {
    return { canExport: false, reason: '表示可能なメッシュがありません', solidElementTypes: [] };
  }

  return { canExport: true, reason: '', solidElementTypes };
}

/**
 * STBモデルをDXFにエクスポート
 * @param {Array<string>} selectedElementTypes - エクスポートする要素タイプの配列
 * @param {string} filename - ファイル名（拡張子なし）
 * @param {Object} options - エクスポートオプション
 * @param {boolean} options.includeLabels - ラベルを含めるかどうか（デフォルト: true）
 * @param {boolean} options.includeAxes - 通り芯を含めるかどうか（デフォルト: true）
 * @param {boolean} options.includeLevels - レベル線を含めるかどうか（デフォルト: true）
 * @param {number} options.labelHeight - ラベルの高さ（mm、デフォルト: 200）
 * @returns {Promise<boolean>} エクスポート成功フラグ
 */
export async function exportStbToDxf(selectedElementTypes, filename = 'stb_export', options = {}) {
  const includeLabels = options.includeLabels !== undefined ? options.includeLabels : true;
  const includeAxes = options.includeAxes !== undefined ? options.includeAxes : true;
  const includeLevels = options.includeLevels !== undefined ? options.includeLevels : true;
  const labelHeight = options.labelHeight || 200;
  const directoryHandle = options.directoryHandle || null;
  // 強制ビュー方向: 'top'（平面図）, 'front', 'side', または null（自動検出）
  const forceViewDirection = options.forceViewDirection || null;

  try {
    log.info('STB→DXFエクスポート開始:', {
      selectedElementTypes,
      includeLabels,
      includeAxes,
      includeLevels,
      forceViewDirection,
    });

    // エクスポート可能か確認
    const { canExport, reason } = canExportStbToDxf();
    if (!canExport) {
      showWarning(`エクスポートできません: ${reason}`);
      return false;
    }

    // カメラを取得
    const camera = getActiveCameraInternal() || getOrthographicCameraInternal();
    if (!camera) {
      throw new Error('カメラが初期化されていません');
    }

    // ビュー方向を決定（強制指定があればそれを使用、なければカメラから自動検出）
    const viewDirection = forceViewDirection || detectViewDirection(camera);
    log.info('ビュー方向:', viewDirection);

    // クリッピング状態を取得
    const clippingState = getCurrentClippingStateInternal();
    if (clippingState && clippingState.type) {
      log.info('クリッピング状態:', clippingState);
    }

    // 要素グループを取得
    const elementGroups = getElementGroupsInternal();

    // 2D線分とテキストを収集
    const lines2D = [];
    const texts2D = [];
    const bounds = {
      min: { x: Infinity, y: Infinity },
      max: { x: -Infinity, y: -Infinity },
    };

    // 選択された要素タイプのメッシュ・ラインからエッジを抽出
    for (const elementType of selectedElementTypes) {
      const group = elementGroups[elementType];
      if (!group) continue;

      group.traverse((child) => {
        if (!child.visible) return;

        // Meshからエッジを抽出
        if (child.isMesh) {
          const edges = extractEdgesFromMesh(child, clippingState);

          for (const edge of edges) {
            // 3D→2D投影
            const start2D = projectPointTo2D(edge.start, camera, viewDirection);
            const end2D = projectPointTo2D(edge.end, camera, viewDirection);

            // 重複エッジを除外（微小な線分）
            const length = Math.sqrt(
              Math.pow(end2D.x - start2D.x, 2) + Math.pow(end2D.y - start2D.y, 2),
            );
            if (length < 1) continue; // 1mm未満は除外

            lines2D.push({
              start: start2D,
              end: end2D,
              layer: elementType,
            });

            // バウンド更新
            updateBounds(bounds, start2D, end2D);
          }
        }

        // Lineオブジェクトから線分を抽出
        if (child.isLine || child.isLineSegments) {
          const geometry = child.geometry;
          if (!geometry) return;

          const positions = geometry.getAttribute('position');
          if (!positions) return;

          // ワールド座標に変換するための行列
          child.updateWorldMatrix(true, false);
          const worldMatrix = child.matrixWorld;

          // Line: 連続した頂点を線分として処理
          // LineSegments: 2点ずつペアで線分として処理
          const step = child.isLineSegments ? 2 : 1;
          const count = child.isLineSegments ? positions.count : positions.count - 1;

          for (let i = 0; i < count; i += step) {
            const idx1 = i;
            const idx2 = child.isLineSegments ? i + 1 : i + 1;

            if (idx2 >= positions.count) continue;

            // ローカル座標を取得
            const p1 = {
              x: positions.getX(idx1),
              y: positions.getY(idx1),
              z: positions.getZ(idx1),
            };
            const p2 = {
              x: positions.getX(idx2),
              y: positions.getY(idx2),
              z: positions.getZ(idx2),
            };

            // ワールド座標に変換
            const v1 = { x: p1.x, y: p1.y, z: p1.z };
            const v2 = { x: p2.x, y: p2.y, z: p2.z };

            // THREE.Vector3のapplyMatrix4相当の変換
            const transformPoint = (p, m) => {
              const e = m.elements;
              const x = p.x,
                y = p.y,
                z = p.z;
              const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
              return {
                x: (e[0] * x + e[4] * y + e[8] * z + e[12]) * w,
                y: (e[1] * x + e[5] * y + e[9] * z + e[13]) * w,
                z: (e[2] * x + e[6] * y + e[10] * z + e[14]) * w,
              };
            };

            const world1 = transformPoint(v1, worldMatrix);
            const world2 = transformPoint(v2, worldMatrix);

            // 2D投影
            const start2D = projectPointTo2D(world1, camera, viewDirection);
            const end2D = projectPointTo2D(world2, camera, viewDirection);

            const length = Math.sqrt(
              Math.pow(end2D.x - start2D.x, 2) + Math.pow(end2D.y - start2D.y, 2),
            );
            if (length < 1) continue;

            lines2D.push({
              start: start2D,
              end: end2D,
              layer: elementType,
            });

            updateBounds(bounds, start2D, end2D);
          }
        }
      });
    }

    if (lines2D.length === 0) {
      showWarning('エクスポートする線分がありません');
      return false;
    }

    log.info(`抽出した線分: ${lines2D.length}本`);

    // ラベルを収集・投影
    if (includeLabels) {
      const labels = collectLabelSprites(selectedElementTypes, camera, clippingState);

      for (const label of labels) {
        const pos2D = projectPointTo2D(label.position, camera, viewDirection);

        texts2D.push({
          position: pos2D,
          text: label.text,
          layer: label.elementType,
          height: labelHeight,
        });

        updateBounds(bounds, pos2D);
      }

      log.info(`抽出したラベル: ${texts2D.length}個`);
    }

    // 通り芯を収集・投影
    let axisLayerAdded = false;
    if (includeAxes) {
      let axisLines;
      if (clippingState && clippingState.type === 'story') {
        axisLines = generateAxisLinesAtClippingHeight(camera, clippingState);
      } else {
        axisLines = collectAxisLines(camera, clippingState);
      }

      for (const axisLine of axisLines) {
        const start2D = projectPointTo2D(axisLine.start, camera, viewDirection);
        const end2D = projectPointTo2D(axisLine.end, camera, viewDirection);

        const length = Math.sqrt(
          Math.pow(end2D.x - start2D.x, 2) + Math.pow(end2D.y - start2D.y, 2),
        );
        if (length < 1) continue;

        lines2D.push({
          start: start2D,
          end: end2D,
          layer: 'Axis',
        });
        axisLayerAdded = true;

        updateBounds(bounds, start2D, end2D);
      }

      log.info(`抽出した通り芯: ${axisLines.length}本`);

      // 通り芯のラベルを出力
      if (includeLabels && axisLines.length > 0) {
        for (const axisLine of axisLines) {
          const labelSource = axisLine.labelPosition || axisLine.start;
          const pos2D = projectPointTo2D(labelSource, camera, viewDirection);

          texts2D.push({
            position: pos2D,
            text: axisLine.name,
            layer: 'Axis',
            height: labelHeight,
          });

          updateBounds(bounds, pos2D);
        }
        log.info(`生成した通り芯ラベル: ${axisLines.length}個`);
      }
    }

    // レベル線を収集・投影
    let levelLayerAdded = false;
    if (includeLevels) {
      const levelLines = collectLevelLines(camera, clippingState);

      for (const levelLine of levelLines) {
        const start2D = projectPointTo2D(levelLine.start, camera, viewDirection);
        const end2D = projectPointTo2D(levelLine.end, camera, viewDirection);

        const length = Math.sqrt(
          Math.pow(end2D.x - start2D.x, 2) + Math.pow(end2D.y - start2D.y, 2),
        );
        if (length < 1) continue;

        lines2D.push({
          start: start2D,
          end: end2D,
          layer: 'Level',
        });
        levelLayerAdded = true;

        updateBounds(bounds, start2D, end2D);
      }

      log.info(`抽出したレベル線: ${levelLines.length}本`);

      // レベルラベルを出力
      if (includeLabels && levelLines.length > 0) {
        for (const levelLine of levelLines) {
          const labelSource = levelLine.labelPosition || levelLine.start;
          const pos2D = projectPointTo2D(labelSource, camera, viewDirection);
          const heightM = (levelLine.height / 1000).toFixed(2);
          const labelText = `${levelLine.name} (FL+${heightM}m)`;

          texts2D.push({
            position: pos2D,
            text: labelText,
            layer: 'Level',
            height: labelHeight,
          });

          updateBounds(bounds, pos2D);
        }
        log.info(`生成したレベルラベル: ${levelLines.length}個`);
      }
    }

    // デフォルトバウンド
    if (bounds.min.x === Infinity) {
      bounds.min = { x: 0, y: 0 };
      bounds.max = { x: 1000, y: 1000 };
    }

    // レイヤー一覧を作成
    const allLayers = [...selectedElementTypes];
    if (axisLayerAdded) {
      allLayers.push('Axis');
    }
    if (levelLayerAdded) {
      allLayers.push('Level');
    }

    // DXFコンテンツを生成
    const dxfContent = generateDxfContent(bounds, allLayers, lines2D, texts2D);

    // ファイルをダウンロード
    await downloadDxf(dxfContent, filename, directoryHandle);

    log.info('STB→DXFエクスポート完了');
    return true;
  } catch (error) {
    log.error('STB→DXFエクスポートエラー:', error);
    showError(`STB→DXFエクスポートに失敗しました: ${error.message}`);
    return false;
  }
}

/**
 * バウンドを更新
 * @param {Object} bounds - バウンドオブジェクト
 * @param {Object} point1 - 点1
 * @param {Object} [point2] - 点2（オプション）
 */
function updateBounds(bounds, point1, point2 = null) {
  bounds.min.x = Math.min(bounds.min.x, point1.x);
  bounds.min.y = Math.min(bounds.min.y, point1.y);
  bounds.max.x = Math.max(bounds.max.x, point1.x);
  bounds.max.y = Math.max(bounds.max.y, point1.y);

  if (point2) {
    bounds.min.x = Math.min(bounds.min.x, point2.x);
    bounds.min.y = Math.min(bounds.min.y, point2.y);
    bounds.max.x = Math.max(bounds.max.x, point2.x);
    bounds.max.y = Math.max(bounds.max.y, point2.y);
  }
}

/**
 * エクスポート統計を取得
 * @param {Array<string>} selectedElementTypes - 選択された要素タイプ
 * @returns {Object} 統計情報
 */
export function getStbExportStats(selectedElementTypes) {
  const elementGroups = getElementGroupsInternal();
  const stats = {
    totalMeshes: 0,
    totalLabels: 0,
    byElementType: {},
    labelsByElementType: {},
  };

  for (const elementType of selectedElementTypes) {
    const group = elementGroups[elementType];
    if (!group) continue;

    let meshCount = 0;
    let labelCount = 0;

    group.traverse((child) => {
      if (child.isMesh && child.visible) {
        meshCount++;
      }
      if (child.isSprite && child.visible && child.userData.elementType === elementType) {
        labelCount++;
      }
    });

    stats.byElementType[elementType] = meshCount;
    stats.labelsByElementType[elementType] = labelCount;
    stats.totalMeshes += meshCount;
    stats.totalLabels += labelCount;
  }

  return stats;
}

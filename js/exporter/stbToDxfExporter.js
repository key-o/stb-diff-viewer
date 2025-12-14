/**
 * @fileoverview STBモデルからDXFエクスポーターモジュール
 *
 * 立体表示されているSTB要素を2D CADデータ（DXF形式）としてエクスポートします。
 * 2Dモード（平行投影）時のみ使用可能で、現在のカメラ方向に投影します。
 */

import * as THREE from 'three';
import { createLogger } from '../utils/logger.js';
import { elementGroups, SUPPORTED_ELEMENTS } from '../viewer/index.js';
import displayModeManager from '../viewer/rendering/displayModeManager.js';
import { getCameraMode, CAMERA_MODES } from '../viewer/camera/cameraManager.js';
import { getActiveCamera, orthographicCamera } from '../viewer/core/core.js';
import labelDisplayManager from '../viewer/rendering/labelDisplayManager.js';
import { generateLabelText, LABEL_CONTENT_TYPES } from '../ui/unifiedLabelManager.js';
import { getState } from '../core/globalState.js';
import { getCurrentClippingState } from '../ui/clipping.js';

const log = createLogger('STBToDxfExporter');

/**
 * 立体表示でエクスポート可能な要素タイプ
 */
const EXPORTABLE_ELEMENT_TYPES = [
  'Column', 'Post', 'Girder', 'Beam', 'Brace',
  'Pile', 'Footing', 'FoundationColumn'
];

/**
 * 要素タイプごとのAutoCAD Color Index
 */
const ELEMENT_TYPE_COLORS = {
  Column: 1,            // Red
  Post: 6,              // Magenta
  Girder: 2,            // Yellow
  Beam: 3,              // Green
  Brace: 4,             // Cyan
  Pile: 5,              // Blue
  Footing: 8,           // Dark Gray
  FoundationColumn: 9,  // Light Gray
  Axis: 7               // White (通り芯)
};

/**
 * RGB色値をAutoCAD Color Index (ACI) に変換
 * @param {number} rgb - RGB色値
 * @returns {number} ACI値
 */
function rgbToAci(rgb) {
  const aciColors = {
    0x000000: 0,
    0xff0000: 1,
    0xffff00: 2,
    0x00ff00: 3,
    0x00ffff: 4,
    0x0000ff: 5,
    0xff00ff: 6,
    0xffffff: 7,
    0x808080: 8,
    0xc0c0c0: 9
  };
  return aciColors[rgb] !== undefined ? aciColors[rgb] : 7;
}

/**
 * STBエクスポートが可能かどうかを確認
 * @returns {Object} { canExport: boolean, reason: string, solidElementTypes: string[] }
 */
export function canExportStbToDxf() {
  // カメラモードを確認
  const cameraMode = getCameraMode();
  if (cameraMode !== CAMERA_MODES.ORTHOGRAPHIC) {
    return {
      canExport: false,
      reason: '2Dモード（平行投影）に切り替えてください',
      solidElementTypes: []
    };
  }

  // 立体表示がオンの要素タイプを取得
  const solidElementTypes = EXPORTABLE_ELEMENT_TYPES.filter(type =>
    displayModeManager.isSolidMode(type)
  );

  if (solidElementTypes.length === 0) {
    return {
      canExport: false,
      reason: '立体表示がオンの要素がありません',
      solidElementTypes: []
    };
  }

  // 実際にメッシュが存在するかチェック
  const typesWithMeshes = solidElementTypes.filter(type => {
    const group = elementGroups[type];
    return group && group.children.length > 0;
  });

  if (typesWithMeshes.length === 0) {
    return {
      canExport: false,
      reason: 'エクスポート可能な3Dメッシュがありません',
      solidElementTypes: []
    };
  }

  return {
    canExport: true,
    reason: '',
    solidElementTypes: typesWithMeshes
  };
}

/**
 * 3Dポイントを2Dに投影
 * @param {THREE.Vector3} point - 3D座標
 * @param {THREE.Camera} camera - カメラ
 * @param {string} viewDirection - ビュー方向（'top', 'front', 'right', 'left'）
 * @returns {Object} { x, y } 2D座標
 */
function projectPointTo2D(point, camera, viewDirection) {
  // カメラの向きに基づいて投影
  // OrthographicCameraの場合、カメラの向きに垂直な平面に投影

  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);

  // カメラの上方向
  const camUp = camera.up.clone().normalize();

  // カメラの右方向
  const camRight = new THREE.Vector3().crossVectors(camDir, camUp).normalize();

  // ポイントをカメラ座標系に変換
  const relativePoint = point.clone().sub(camera.position);

  // 2D座標を計算（カメラの右方向がX、上方向がY）
  const x = relativePoint.dot(camRight);
  const y = relativePoint.dot(camUp);

  return { x, y };
}

/**
 * ポイントがクリッピング範囲内にあるかチェック
 * @param {THREE.Vector3} point - チェックするポイント
 * @param {Object} clippingState - クリッピング状態
 * @returns {boolean} 範囲内ならtrue
 */
function isPointWithinClippingBounds(point, clippingState) {
  if (!clippingState || !clippingState.type || !clippingState.bounds) {
    return true; // クリッピングなしの場合は常にtrue
  }

  const bounds = clippingState.bounds;

  switch (clippingState.type) {
    case 'story':
      // 階クリッピング: Z座標でフィルタ
      return point.z >= bounds.lowerBound && point.z <= bounds.upperBound;

    case 'xAxis':
      // X軸クリッピング: X座標でフィルタ
      return point.x >= bounds.lowerBound && point.x <= bounds.upperBound;

    case 'yAxis':
      // Y軸クリッピング: Y座標でフィルタ
      return point.y >= bounds.lowerBound && point.y <= bounds.upperBound;

    default:
      return true;
  }
}

/**
 * エッジがクリッピング範囲内にあるかチェック
 * @param {THREE.Vector3} start - 始点
 * @param {THREE.Vector3} end - 終点
 * @param {Object} clippingState - クリッピング状態
 * @returns {boolean} 範囲内ならtrue
 */
function isEdgeWithinClippingBounds(start, end, clippingState) {
  if (!clippingState || !clippingState.type || !clippingState.bounds) {
    return true; // クリッピングなしの場合は常にtrue
  }

  // 両端点がクリッピング範囲内にある場合のみtrue
  return isPointWithinClippingBounds(start, clippingState) &&
         isPointWithinClippingBounds(end, clippingState);
}

/**
 * メッシュからエッジを抽出
 * @param {THREE.Mesh} mesh - Three.jsメッシュ
 * @param {Object} clippingState - クリッピング状態（オプション）
 * @returns {Array} エッジの配列 [{ start: Vector3, end: Vector3 }, ...]
 */
function extractEdgesFromMesh(mesh, clippingState = null) {
  const edges = [];

  if (!mesh.geometry) return edges;

  // EdgesGeometryを使用してエッジを抽出
  const edgesGeometry = new THREE.EdgesGeometry(mesh.geometry, 30); // 30度以上の角度でエッジ検出
  const positions = edgesGeometry.attributes.position;

  if (!positions) return edges;

  // ワールド行列を取得
  mesh.updateWorldMatrix(true, false);
  const worldMatrix = mesh.matrixWorld;

  // エッジを抽出
  for (let i = 0; i < positions.count; i += 2) {
    const start = new THREE.Vector3(
      positions.getX(i),
      positions.getY(i),
      positions.getZ(i)
    ).applyMatrix4(worldMatrix);

    const end = new THREE.Vector3(
      positions.getX(i + 1),
      positions.getY(i + 1),
      positions.getZ(i + 1)
    ).applyMatrix4(worldMatrix);

    // クリッピング範囲チェック
    if (clippingState && !isEdgeWithinClippingBounds(start, end, clippingState)) {
      continue; // クリッピング範囲外はスキップ
    }

    edges.push({ start, end });
  }

  edgesGeometry.dispose();
  return edges;
}

/**
 * メッシュから輪郭線（シルエットエッジ）を抽出
 * @param {THREE.Mesh} mesh - Three.jsメッシュ
 * @param {THREE.Camera} camera - カメラ
 * @returns {Array} 輪郭線の配列
 */
function extractSilhouetteEdges(mesh, camera) {
  // 簡易的な実装：通常のエッジを使用
  // より高度なシルエット検出は将来の拡張として
  return extractEdgesFromMesh(mesh);
}

/**
 * 現在のビュー方向を取得
 * @param {THREE.Camera} camera - カメラ
 * @returns {string} ビュー方向（'top', 'front', 'right', 'left', 'other'）
 */
function detectViewDirection(camera) {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);

  const threshold = 0.9;

  // 上から見下ろし（平面図）
  if (dir.z < -threshold) return 'top';
  // 下から見上げ
  if (dir.z > threshold) return 'bottom';
  // 正面から
  if (Math.abs(dir.y) > threshold) return dir.y > 0 ? 'front' : 'back';
  // 側面から
  if (Math.abs(dir.x) > threshold) return dir.x > 0 ? 'right' : 'left';

  return 'other';
}

/**
 * DXFヘッダーセクションを生成
 * @param {Object} bounds - バウンディングボックス
 * @returns {string} DXFヘッダー文字列
 */
function generateHeader(bounds) {
  const lines = [
    '0', 'SECTION',
    '2', 'HEADER',
    '9', '$ACADVER',
    '1', 'AC1009', // DXF R12 - 最も互換性が高い
    '9', '$EXTMIN',
    '10', bounds.min.x.toFixed(6),
    '20', bounds.min.y.toFixed(6),
    '30', '0.000000',
    '9', '$EXTMAX',
    '10', bounds.max.x.toFixed(6),
    '20', bounds.max.y.toFixed(6),
    '30', '0.000000',
    '9', '$INSUNITS',
    '70', '4',
    '0', 'ENDSEC'
  ];
  return lines.join('\n');
}

/**
 * DXFテーブルセクションを生成
 * @param {Array} layerNames - レイヤー名の配列
 * @param {boolean} includeLabels - ラベルレイヤーを含めるかどうか
 * @returns {string} DXFテーブル文字列
 */
function generateTables(layerNames, includeLabels = false) {
  // ラベルレイヤーを追加
  const allLayers = [...layerNames];
  if (includeLabels) {
    for (const name of layerNames) {
      allLayers.push(name + '_Label');
    }
  }

  const lines = [
    '0', 'SECTION',
    '2', 'TABLES',
    // VPORTテーブル（ビューポート）- 多くのCADで必要
    '0', 'TABLE',
    '2', 'VPORT',
    '70', '1',
    '0', 'VPORT',
    '2', '*ACTIVE',
    '70', '0',
    '10', '0.0',
    '20', '0.0',
    '11', '1.0',
    '21', '1.0',
    '12', '0.0',
    '22', '0.0',
    '13', '0.0',
    '23', '0.0',
    '14', '10.0',
    '24', '10.0',
    '15', '10.0',
    '25', '10.0',
    '16', '0.0',
    '26', '0.0',
    '36', '1.0',
    '17', '0.0',
    '27', '0.0',
    '37', '0.0',
    '40', '1.0',
    '41', '1.0',
    '42', '50.0',
    '43', '0.0',
    '44', '0.0',
    '50', '0.0',
    '51', '0.0',
    '71', '0',
    '72', '100',
    '73', '1',
    '74', '3',
    '75', '0',
    '76', '0',
    '77', '0',
    '78', '0',
    '0', 'ENDTAB',
    // ラインタイプテーブル（LTYPE）- CONTINUOUSを定義
    '0', 'TABLE',
    '2', 'LTYPE',
    '70', '1',
    '0', 'LTYPE',
    '2', 'CONTINUOUS',
    '70', '0',
    '3', 'Solid line',
    '72', '65',
    '73', '0',
    '40', '0.0',
    '0', 'ENDTAB',
    // レイヤーテーブル
    '0', 'TABLE',
    '2', 'LAYER',
    '70', (allLayers.length + 1).toString() // 0レイヤーを含む
  ];

  // デフォルトの0レイヤーを追加
  lines.push(
    '0', 'LAYER',
    '2', '0',
    '70', '0',
    '62', '7',
    '6', 'CONTINUOUS'
  );

  for (const name of allLayers) {
    // _Label サフィックスがある場合は元の要素タイプの色を使用
    const baseName = name.replace('_Label', '');
    const color = ELEMENT_TYPE_COLORS[baseName] || 7;
    lines.push(
      '0', 'LAYER',
      '2', name,
      '70', '0',
      '62', color.toString(),
      '6', 'CONTINUOUS'
    );
  }

  lines.push('0', 'ENDTAB');

  // STYLEテーブル（テキストスタイル）
  lines.push(
    '0', 'TABLE',
    '2', 'STYLE',
    '70', '1',
    '0', 'STYLE',
    '2', 'STANDARD',
    '70', '0',
    '40', '0.0',
    '41', '1.0',
    '50', '0.0',
    '71', '0',
    '42', '2.5',
    '3', 'txt',
    '4', '',
    '0', 'ENDTAB'
  );

  lines.push('0', 'ENDSEC');

  return lines.join('\n');
}

/**
 * DXF BLOCKSセクションを生成
 * @returns {string} DXF BLOCKSセクション文字列
 */
function generateBlocks() {
  const lines = [
    '0', 'SECTION',
    '2', 'BLOCKS',
    // *MODEL_SPACE ブロック定義
    '0', 'BLOCK',
    '8', '0',
    '2', '*MODEL_SPACE',
    '70', '0',
    '10', '0.0',
    '20', '0.0',
    '30', '0.0',
    '3', '*MODEL_SPACE',
    '0', 'ENDBLK',
    '8', '0',
    // *PAPER_SPACE ブロック定義
    '0', 'BLOCK',
    '8', '0',
    '2', '*PAPER_SPACE',
    '70', '0',
    '10', '0.0',
    '20', '0.0',
    '30', '0.0',
    '3', '*PAPER_SPACE',
    '0', 'ENDBLK',
    '8', '0',
    '0', 'ENDSEC'
  ];
  return lines.join('\n');
}

/**
 * LINE エンティティを生成
 * @param {Object} line2D - 2D線分 { start: {x,y}, end: {x,y}, layer: string }
 * @returns {string} DXF LINE文字列
 */
function generateLine(line2D) {
  const color = ELEMENT_TYPE_COLORS[line2D.layer] || 7;
  const lines = [
    '0', 'LINE',
    '8', line2D.layer,
    '62', color.toString(),
    '10', line2D.start.x.toFixed(6),
    '20', line2D.start.y.toFixed(6),
    '30', '0.000000',
    '11', line2D.end.x.toFixed(6),
    '21', line2D.end.y.toFixed(6),
    '31', '0.000000'
  ];
  return lines.join('\n');
}

/**
 * TEXT エンティティを生成
 * @param {Object} text2D - 2Dテキスト { position: {x,y}, text: string, layer: string, height: number }
 * @returns {string} DXF TEXT文字列
 */
function generateText(text2D) {
  const color = ELEMENT_TYPE_COLORS[text2D.layer] || 7;
  const height = text2D.height || 200; // デフォルトテキスト高さ 200mm
  const lines = [
    '0', 'TEXT',
    '8', text2D.layer + '_Label', // ラベル用レイヤー
    '62', color.toString(),
    '10', text2D.position.x.toFixed(6),
    '20', text2D.position.y.toFixed(6),
    '30', '0.000000',
    '40', height.toFixed(6), // テキスト高さ
    '1', text2D.text,
    '50', '0.0', // 回転角度
    '72', '1', // 水平方向の位置揃え（1=中央）
    '11', text2D.position.x.toFixed(6), // 位置揃え点X
    '21', text2D.position.y.toFixed(6), // 位置揃え点Y
    '31', '0.000000',
    '73', '2' // 垂直方向の位置揃え（2=中央）
  ];
  return lines.join('\n');
}

/**
 * 指定された要素タイプのラベルスプライトを収集（表示範囲内のみ）
 * @param {Array<string>} elementTypes - 収集対象の要素タイプ
 * @param {THREE.Camera} camera - カメラ（フラスタムチェック用）
 * @param {Object} clippingState - クリッピング状態（オプション）
 * @returns {Array} ラベル情報の配列 [{ position: Vector3, text: string, elementType: string }, ...]
 */
function collectLabelSprites(elementTypes, camera, clippingState = null) {
  const labels = [];

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

    // ラベル表示がONかどうか確認
    const isLabelVisible = labelDisplayManager.isLabelVisible(elementType);
    if (!isLabelVisible) continue;

    group.traverse((child) => {
      // Spriteかつラベル関連のuserDataを持つオブジェクトを収集
      if (child.isSprite && child.visible) {
        // ラベルスプライトの判定
        // - userData.elementType が設定されている
        // - userData.originalPosition または position がある
        // - material.map（テクスチャ）がある = テキストラベル
        if (child.userData.elementType === elementType && child.material && child.material.map) {
          const position = child.userData.originalPosition || child.position.clone();
          totalChecked++;

          // フラスタムチェック: 表示範囲内かどうか確認
          if (!frustum.containsPoint(position)) {
            return; // 表示範囲外はスキップ
          }

          // クリッピング範囲チェック
          if (clippingState && !isPointWithinClippingBounds(position, clippingState)) {
            return; // クリッピング範囲外はスキップ
          }

          inFrustumCount++;

          // ラベルテキストを取得（現在のラベル内容設定を反映）
          let labelText = '';
          const contentType = getState('ui.labelContentType') || LABEL_CONTENT_TYPES.ID;

          // 元の要素データがある場合は、現在の設定に基づいてテキストを生成
          if (child.userData.originalElement) {
            labelText = generateLabelText(child.userData.originalElement, elementType);
          }
          // matched要素（両方のIDがある）の場合
          else if (child.userData.elementIdA || child.userData.elementIdB) {
            // matched要素でも元の要素データがあればそれを使用
            if (child.userData.originalElementA && child.userData.originalElementB) {
              const textA = generateLabelText(child.userData.originalElementA, elementType);
              const textB = generateLabelText(child.userData.originalElementB, elementType);
              labelText = `${textA}/${textB}`;
            } else {
              // 元のデータがない場合はIDを使用
              const idA = child.userData.elementIdA || '?';
              const idB = child.userData.elementIdB || '?';
              labelText = `${idA}/${idB}`;
            }
          }
          // userData.originalText がある場合（フォールバック）
          else if (child.userData.originalText) {
            labelText = child.userData.originalText;
          }
          // elementId がある場合（フォールバック）
          else if (child.userData.elementId) {
            labelText = child.userData.elementId;
          }

          if (labelText) {
            labels.push({
              position: position.clone(),
              text: labelText,
              elementType: elementType
            });
          }
        }
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
 * @returns {Array} 線分情報の配列 [{ start: Vector3, end: Vector3, name: string, axisType: string }, ...]
 */
function collectAxisLines(camera, clippingState = null) {
  const axisLines = [];
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
          positions.getZ(0)
        ).applyMatrix4(worldMatrix);

        const end = new THREE.Vector3(
          positions.getX(1),
          positions.getY(1),
          positions.getZ(1)
        ).applyMatrix4(worldMatrix);

        totalChecked++;

        // フラスタムチェック: 少なくとも一方の端点が表示範囲内かどうか確認
        const startInFrustum = frustum.containsPoint(start);
        const endInFrustum = frustum.containsPoint(end);

        if (!startInFrustum && !endInFrustum) {
          return; // 両端点とも表示範囲外はスキップ
        }

        // クリッピング範囲チェック（通り芯の場合はエッジの中点で判定）
        if (clippingState && clippingState.type) {
          const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
          if (!isPointWithinClippingBounds(midpoint, clippingState)) {
            return; // クリッピング範囲外はスキップ
          }
        }

        inFrustumCount++;

        axisLines.push({
          start: start.clone(),
          end: end.clone(),
          name: child.userData.elementId || 'Axis',
          axisType: child.userData.axisType || 'X',
          storyName: child.userData.storyName
        });
      }
    }
  });

  log.info(`収集した通り芯: ${axisLines.length}本 (表示範囲内: ${inFrustumCount}/${totalChecked})`);
  return axisLines;
}

/**
 * DXFエンティティセクションを生成
 * @param {Array} lines2D - 2D線分の配列
 * @param {Array} texts2D - 2Dテキストの配列（オプション）
 * @returns {string} DXFエンティティ文字列
 */
function generateEntities(lines2D, texts2D = []) {
  const entityStrings = ['0', 'SECTION', '2', 'ENTITIES'];

  // 線分を出力
  for (const line of lines2D) {
    entityStrings.push(generateLine(line));
  }

  // テキスト（ラベル）を出力
  for (const text of texts2D) {
    entityStrings.push(generateText(text));
  }

  entityStrings.push('0', 'ENDSEC');
  return entityStrings.join('\n');
}

/**
 * STBモデルをDXFにエクスポート
 * @param {Array<string>} selectedElementTypes - エクスポートする要素タイプの配列
 * @param {string} filename - ファイル名（拡張子なし）
 * @param {Object} options - エクスポートオプション
 * @param {boolean} options.includeLabels - ラベルを含めるかどうか（デフォルト: true）
 * @param {boolean} options.includeAxes - 通り芯を含めるかどうか（デフォルト: true）
 * @param {number} options.labelHeight - ラベルの高さ（mm、デフォルト: 200）
 * @returns {boolean} エクスポート成功フラグ
 */
export function exportStbToDxf(selectedElementTypes, filename = 'stb_export', options = {}) {
  // オプションのデフォルト値
  const includeLabels = options.includeLabels !== undefined ? options.includeLabels : true;
  const includeAxes = options.includeAxes !== undefined ? options.includeAxes : true;
  const labelHeight = options.labelHeight || 200;

  try {
    log.info('STB→DXFエクスポート開始:', { selectedElementTypes, includeLabels, includeAxes });

    // エクスポート可能か確認
    const { canExport, reason } = canExportStbToDxf();
    if (!canExport) {
      alert(`エクスポートできません: ${reason}`);
      return false;
    }

    // カメラを取得
    const camera = getActiveCamera() || orthographicCamera;
    if (!camera) {
      throw new Error('カメラが初期化されていません');
    }

    const viewDirection = detectViewDirection(camera);
    log.info('ビュー方向:', viewDirection);

    // クリッピング状態を取得
    const clippingState = getCurrentClippingState();
    if (clippingState && clippingState.type) {
      log.info('クリッピング状態:', clippingState);
    }

    // 2D線分を収集
    const lines2D = [];
    const texts2D = [];
    const bounds = {
      min: { x: Infinity, y: Infinity },
      max: { x: -Infinity, y: -Infinity }
    };

    // 選択された要素タイプのメッシュからエッジを抽出
    for (const elementType of selectedElementTypes) {
      const group = elementGroups[elementType];
      if (!group) continue;

      group.traverse((child) => {
        if (child.isMesh && child.visible) {
          const edges = extractEdgesFromMesh(child, clippingState);

          for (const edge of edges) {
            // 3D→2D投影
            const start2D = projectPointTo2D(edge.start, camera, viewDirection);
            const end2D = projectPointTo2D(edge.end, camera, viewDirection);

            // 重複エッジを除外（微小な線分）
            const length = Math.sqrt(
              Math.pow(end2D.x - start2D.x, 2) + Math.pow(end2D.y - start2D.y, 2)
            );
            if (length < 1) continue; // 1mm未満は除外

            lines2D.push({
              start: start2D,
              end: end2D,
              layer: elementType
            });

            // バウンド更新
            bounds.min.x = Math.min(bounds.min.x, start2D.x, end2D.x);
            bounds.min.y = Math.min(bounds.min.y, start2D.y, end2D.y);
            bounds.max.x = Math.max(bounds.max.x, start2D.x, end2D.x);
            bounds.max.y = Math.max(bounds.max.y, start2D.y, end2D.y);
          }
        }
      });
    }

    if (lines2D.length === 0) {
      alert('エクスポートする線分がありません');
      return false;
    }

    log.info(`抽出した線分: ${lines2D.length}本`);

    // ラベルを収集・投影
    if (includeLabels) {
      const labels = collectLabelSprites(selectedElementTypes, camera, clippingState);

      for (const label of labels) {
        // 3D→2D投影
        const pos2D = projectPointTo2D(label.position, camera, viewDirection);

        texts2D.push({
          position: pos2D,
          text: label.text,
          layer: label.elementType,
          height: labelHeight
        });

        // バウンド更新（ラベル位置も考慮）
        bounds.min.x = Math.min(bounds.min.x, pos2D.x);
        bounds.min.y = Math.min(bounds.min.y, pos2D.y);
        bounds.max.x = Math.max(bounds.max.x, pos2D.x);
        bounds.max.y = Math.max(bounds.max.y, pos2D.y);
      }

      log.info(`抽出したラベル: ${texts2D.length}個`);
    }

    // 通り芯を収集・投影
    let axisLayerAdded = false;
    if (includeAxes) {
      const axisLines = collectAxisLines(camera, clippingState);

      for (const axisLine of axisLines) {
        // 3D→2D投影
        const start2D = projectPointTo2D(axisLine.start, camera, viewDirection);
        const end2D = projectPointTo2D(axisLine.end, camera, viewDirection);

        // 重複エッジを除外（微小な線分）
        const length = Math.sqrt(
          Math.pow(end2D.x - start2D.x, 2) + Math.pow(end2D.y - start2D.y, 2)
        );
        if (length < 1) continue; // 1mm未満は除外

        lines2D.push({
          start: start2D,
          end: end2D,
          layer: 'Axis'
        });
        axisLayerAdded = true;

        // バウンド更新
        bounds.min.x = Math.min(bounds.min.x, start2D.x, end2D.x);
        bounds.min.y = Math.min(bounds.min.y, start2D.y, end2D.y);
        bounds.max.x = Math.max(bounds.max.x, start2D.x, end2D.x);
        bounds.max.y = Math.max(bounds.max.y, start2D.y, end2D.y);
      }

      log.info(`抽出した通り芯: ${axisLines.length}本`);

      // 通り芯のラベルも収集（Axis表示がONの場合）
      if (includeLabels) {
        const axisLabels = collectLabelSprites(['Axis'], camera, clippingState);
        for (const label of axisLabels) {
          const pos2D = projectPointTo2D(label.position, camera, viewDirection);
          texts2D.push({
            position: pos2D,
            text: label.text,
            layer: 'Axis',
            height: labelHeight
          });

          bounds.min.x = Math.min(bounds.min.x, pos2D.x);
          bounds.min.y = Math.min(bounds.min.y, pos2D.y);
          bounds.max.x = Math.max(bounds.max.x, pos2D.x);
          bounds.max.y = Math.max(bounds.max.y, pos2D.y);
        }
        log.info(`抽出した通り芯ラベル: ${axisLabels.length}個`);
      }
    }

    // デフォルトバウンド
    if (bounds.min.x === Infinity) {
      bounds.min = { x: 0, y: 0 };
      bounds.max = { x: 1000, y: 1000 };
    }

    // レイヤー一覧を作成（通り芯を含める）
    const allLayers = [...selectedElementTypes];
    if (axisLayerAdded) {
      allLayers.push('Axis');
    }

    // DXFコンテンツを生成
    const dxfContent = [
      generateHeader(bounds),
      generateTables(allLayers, includeLabels && texts2D.length > 0),
      generateBlocks(),
      generateEntities(lines2D, texts2D),
      '0',
      'EOF'
    ].join('\n');

    // ファイルをダウンロード
    downloadDxf(dxfContent, filename);

    log.info('STB→DXFエクスポート完了');
    return true;
  } catch (error) {
    log.error('STB→DXFエクスポートエラー:', error);
    alert(`STB→DXFエクスポートに失敗しました: ${error.message}`);
    return false;
  }
}

/**
 * DXFファイルをダウンロード
 * @param {string} content - DXFファイル内容
 * @param {string} filename - ファイル名（拡張子なし）
 */
function downloadDxf(content, filename) {
  const blob = new Blob([content], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.dxf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

/**
 * エクスポート統計を取得
 * @param {Array<string>} selectedElementTypes - 選択された要素タイプ
 * @returns {Object} 統計情報
 */
export function getStbExportStats(selectedElementTypes) {
  const stats = {
    totalMeshes: 0,
    totalLabels: 0,
    byElementType: {},
    labelsByElementType: {}
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
      // ラベル（スプライト）をカウント
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

// グローバルにエクスポート
window.canExportStbToDxf = canExportStbToDxf;
window.exportStbToDxf = exportStbToDxf;
window.getStbExportStats = getStbExportStats;

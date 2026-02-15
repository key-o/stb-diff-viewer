/**
 * @fileoverview 要素再描画処理
 *
 * 各要素タイプの再描画処理を担当します:
 * - ソリッド表示とライン表示の切り替え
 * - ラベル作成と管理
 * - 継手（Joint）とUndefined要素の再描画
 */

import * as THREE from 'three';
import { createLogger } from '../../utils/logger.js';
import { getModelContext } from './displayModeController.js';
import { parseElements } from '../../common-stb/parser/stbXmlParser.js';
import {
  drawLineElements,
  drawPolyElements,
  elementGroups,
  materials,
  createLabelSprite,
  displayModeManager,
  labelDisplayManager,
  GeometryGeneratorFactory,
  geometryGeneratorFactory,
  parseStbFile,
} from '../../viewer/index.js';
import {
  updateLabelVisibility,
  removeLabelsForElementType,
  addLabelsToGlobalState,
} from '../../ui/index.js';
import { generateLabelText } from '../../ui/viewer3d/unifiedLabelManager.js';
import { attachElementDataToLabel } from '../../ui/viewer3d/labelRegeneration.js';
import { getElementRedrawConfig } from '../../config/elementRedrawConfig.js';
import { UI_TIMING } from '../../config/uiTimingConfig.js';
import {
  compareElements,
  lineElementKeyExtractor,
  polyElementKeyExtractor,
  createAttributeComparator,
} from '../../common-stb/comparison/index.js';
import { COMPARISON_KEY_TYPE } from '../../config/comparisonKeyConfig.js';
import comparisonKeyManager from '../comparisonKeyManager.js';

// ロガー
const log = createLogger('elementRedrawer');

/**
 * 共通: 要素の再描画処理
 * @param {Object} config - 設定オブジェクト（STBメタデータ）
 * @param {string} config.elementType - 要素タイプ（"Column", "Beam"等）
 * @param {string} config.stbTagName - STBタグ名（"StbColumn", "StbGirder"等）
 * @param {string} config.nodeStartAttr - 始点ノード属性名
 * @param {string} config.nodeEndAttr - 終点ノード属性名
 * @param {string} config.elementsKey - stbDataのキー名（"columnElements"等）
 * @param {string} config.sectionsKey - stbDataのキー名（"columnSections"等）
 * @param {Function} scheduleRender - 再描画要求関数
 * @param {boolean} updateLabelsAfter - 再描画後にラベル更新を実行するか（デフォルト: true）
 * @private
 */
function redrawElementForViewMode(config, scheduleRender, updateLabelsAfter = true) {
  const { elementType, stbTagName, nodeStartAttr, nodeEndAttr, elementsKey, sectionsKey } = config;

  // ジェネレータをviewer層から動的解決（クラスの静的メソッドを使用）
  const geometryGeneratorFactory = new GeometryGeneratorFactory();
  const generatorInfo = geometryGeneratorFactory.getGeneratorInfo(elementType);

  if (!generatorInfo) {
    log.warn(`Cannot create meshes for ${elementType}: generator not found`);
    if (scheduleRender) scheduleRender();
    return;
  }

  const generator = generatorInfo.class;
  const generatorMethod = generatorInfo.method;

  // モデルコンテキストを取得
  const { modelBounds, modelADocument, modelBDocument, nodeMapA, nodeMapB } = getModelContext();

  // 必要なデータが揃っているかチェック
  if (!modelADocument && !modelBDocument) return;

  const group = elementGroups[elementType];

  // 既存のラベルを削除
  removeLabelsForElementType(elementType);
  group.clear();

  const viewMode = displayModeManager.getDisplayMode(elementType);
  log.debug(`[redraw${elementType}ForViewMode] mode: ${viewMode}`);

  if (viewMode === 'solid') {
    // 立体表示（ProfileBased方式）- 差分表示対応
    // saveToGlobalState: true でパース結果をglobalStateに保存し、IFC変換で再利用
    const stbDataA = modelADocument
      ? parseStbFile(modelADocument, { modelKey: 'A', saveToGlobalState: true })
      : null;
    const stbDataB = modelBDocument
      ? parseStbFile(modelBDocument, { modelKey: 'B', saveToGlobalState: true })
      : null;

    // 両方のモデルがある場合は比較を実行
    if (stbDataA && stbDataB) {
      // 統一比較エンジンを使用して差分を検出
      const comparisonKeyType = comparisonKeyManager.getKeyType();

      // 要素タイプに応じたキー抽出関数を選択し、元のJSオブジェクトを保持するラッパーで包む
      let baseExtractor;
      if (elementType === 'Slab' || elementType === 'Wall') {
        baseExtractor = (el, nm) =>
          polyElementKeyExtractor(el, nm, 'StbNodeIdOrder', comparisonKeyType);
      } else {
        baseExtractor = (el, nm) =>
          lineElementKeyExtractor(el, nm, nodeStartAttr, nodeEndAttr, comparisonKeyType);
      }

      // 元のJSオブジェクトをdata.elementに保持するラッパー
      const keyExtractor = (element, nodeMap) => {
        const result = baseExtractor(element, nodeMap);
        if (result.key !== null && result.data !== null) {
          result.data.element = element;
        }
        return result;
      };

      // 属性比較コールバックを作成（4カテゴリ分類: matched/mismatch/onlyA/onlyB）
      const attributeComparator = createAttributeComparator((data) => data.element || data);
      const comparisonOptions = {
        attributeComparator,
        classifyNullKeysAsOnly: comparisonKeyType === COMPARISON_KEY_TYPE.GUID_BASED,
      };

      const comparisonResult = compareElements(
        stbDataA[elementsKey] || [],
        stbDataB[elementsKey] || [],
        stbDataA.nodes,
        stbDataB.nodes,
        keyExtractor,
        comparisonOptions,
      );

      log.debug(
        `[redraw${elementType}ForViewMode] solid mode comparison: ` +
          `matched=${comparisonResult.matched.length}, ` +
          `mismatch=${comparisonResult.mismatch.length}, ` +
          `onlyA=${comparisonResult.onlyA.length}, ` +
          `onlyB=${comparisonResult.onlyB.length}`,
      );

      // マッチした要素（属性も一致）のメッシュを生成（モデルAのデータを使用）
      if (comparisonResult.matched.length > 0) {
        const matchedElements = comparisonResult.matched.map((m) => m.dataA.element);
        const matchedMeshes = generator[generatorMethod](
          matchedElements,
          stbDataA.nodes,
          stbDataA[sectionsKey],
          stbDataA.steelSections,
          elementType,
          false, // isJsonInput
          elementType === 'Wall' ? stbDataA.openingElements : null, // 壁の場合のみ開口情報を渡す
        );

        // matched要素のペア情報をマップに変換
        const matchedPairs = new Map();
        comparisonResult.matched.forEach((pair) => {
          matchedPairs.set(pair.dataA.element.id, pair.dataB.element.id);
        });

        matchedMeshes.forEach((mesh) => {
          mesh.userData.modelSource = 'matched';
          // matched要素のA/BのIDを設定（プロパティ表示用）
          const elementIdA = mesh.userData.elementId;
          const elementIdB = matchedPairs.get(elementIdA);
          if (elementIdB) {
            mesh.userData.elementIdA = elementIdA;
            mesh.userData.elementIdB = elementIdB;
          }
          group.add(mesh);
        });
      }

      // 不一致要素（位置は一致、属性が異なる）のメッシュを生成（モデルAのデータを使用）
      if (comparisonResult.mismatch.length > 0) {
        const mismatchElements = comparisonResult.mismatch.map((m) => m.dataA.element);
        const mismatchMeshes = generator[generatorMethod](
          mismatchElements,
          stbDataA.nodes,
          stbDataA[sectionsKey],
          stbDataA.steelSections,
          elementType,
          false, // isJsonInput
          elementType === 'Wall' ? stbDataA.openingElements : null, // 壁の場合のみ開口情報を渡す
        );

        // mismatch要素のペア情報をマップに変換
        const mismatchPairs = new Map();
        comparisonResult.mismatch.forEach((pair) => {
          mismatchPairs.set(pair.dataA.element.id, pair.dataB.element.id);
        });

        mismatchMeshes.forEach((mesh) => {
          mesh.userData.modelSource = 'mismatch';
          // mismatch要素のA/BのIDを設定（プロパティ表示用）
          const elementIdA = mesh.userData.elementId;
          const elementIdB = mismatchPairs.get(elementIdA);
          if (elementIdB) {
            mesh.userData.elementIdA = elementIdA;
            mesh.userData.elementIdB = elementIdB;
          }
          group.add(mesh);
        });
      }

      // モデルAのみの要素のメッシュを生成
      if (comparisonResult.onlyA.length > 0) {
        const onlyAElements = comparisonResult.onlyA.map((d) => d.element);
        const onlyAMeshes = generator[generatorMethod](
          onlyAElements,
          stbDataA.nodes,
          stbDataA[sectionsKey],
          stbDataA.steelSections,
          elementType,
          false, // isJsonInput
          elementType === 'Wall' ? stbDataA.openingElements : null, // 壁の場合のみ開口情報を渡す
        );
        onlyAMeshes.forEach((mesh) => {
          mesh.userData.modelSource = 'A';
          group.add(mesh);
        });
      }

      // モデルBのみの要素のメッシュを生成
      if (comparisonResult.onlyB.length > 0) {
        const onlyBElements = comparisonResult.onlyB.map((d) => d.element);
        const onlyBMeshes = generator[generatorMethod](
          onlyBElements,
          stbDataB.nodes,
          stbDataB[sectionsKey],
          stbDataB.steelSections,
          elementType,
          false, // isJsonInput
          elementType === 'Wall' ? stbDataB.openingElements : null, // 壁の場合のみ開口情報を渡す
        );
        onlyBMeshes.forEach((mesh) => {
          mesh.userData.modelSource = 'B';
          group.add(mesh);
        });
      }

      // ラベル作成（すべての要素に対して）
      labelDisplayManager.syncWithCheckbox(elementType);
      const createLabelsFlag = labelDisplayManager.isLabelVisible(elementType);
      log.debug(`[redraw${elementType}ForViewMode] solid mode - createLabels: ${createLabelsFlag}`);

      if (createLabelsFlag) {
        // マッチした要素のラベル
        const matchedLabels = createLabelsForSolidElementsWithSource(
          comparisonResult.matched.map((m) => m.dataA.element),
          stbDataA.nodes,
          elementType,
          'matched',
        );
        // 不一致要素のラベル
        const mismatchLabels = createLabelsForSolidElementsWithSource(
          comparisonResult.mismatch.map((m) => m.dataA.element),
          stbDataA.nodes,
          elementType,
          'mismatch',
        );
        // モデルAのみの要素のラベル
        const onlyALabels = createLabelsForSolidElementsWithSource(
          comparisonResult.onlyA.map((d) => d.element),
          stbDataA.nodes,
          elementType,
          'A',
        );
        // モデルBのみの要素のラベル
        const onlyBLabels = createLabelsForSolidElementsWithSource(
          comparisonResult.onlyB.map((d) => d.element),
          stbDataB.nodes,
          elementType,
          'B',
        );

        const allLabels = [...matchedLabels, ...mismatchLabels, ...onlyALabels, ...onlyBLabels];
        log.debug(
          `[redraw${elementType}ForViewMode] solid mode - created ${allLabels.length} labels`,
        );
        allLabels.forEach((label) => group.add(label));
        addLabelsToGlobalState(allLabels);
      }
    } else {
      // 片方のモデルのみの場合（従来の処理）
      const stbData = stbDataA || stbDataB;
      const modelSource = stbDataA ? 'A' : 'B';

      if (stbData) {
        const meshes = generator[generatorMethod](
          stbData[elementsKey],
          stbData.nodes,
          stbData[sectionsKey],
          stbData.steelSections,
          elementType,
          false, // isJsonInput
          elementType === 'Wall' ? stbData.openingElements : null, // 壁の場合のみ開口情報を渡す
        );
        meshes.forEach((mesh) => {
          mesh.userData.modelSource = modelSource;
          group.add(mesh);
        });

        // ラベル作成
        labelDisplayManager.syncWithCheckbox(elementType);
        const createLabelsFlag = labelDisplayManager.isLabelVisible(elementType);
        log.debug(
          `[redraw${elementType}ForViewMode] solid mode - createLabels: ${createLabelsFlag}`,
        );

        if (createLabelsFlag) {
          const labels = createLabelsForSolidElementsWithSource(
            stbData[elementsKey],
            stbData.nodes,
            elementType,
            modelSource,
          );
          log.debug(
            `[redraw${elementType}ForViewMode] solid mode - created ${labels.length} labels`,
          );
          labels.forEach((label) => group.add(label));
          addLabelsToGlobalState(labels);
        }
      }
    }

    // 生成されたメッシュに現在のカラーモードを適用（動的インポート）
    import('../../colorModes/index.js')
      .then(({ updateElementsForColorMode }) => {
        updateElementsForColorMode();
      })
      .catch((err) => {
        console.error('Failed to update colors for solid mode:', err);
      });
  } else {
    // 線表示 / パネル表示

    // ポリゴン要素（Wall, Slab）の場合はdrawPolyElementsを使用
    if (elementType === 'Wall' || elementType === 'Slab') {
      const elementsA = parseElements(modelADocument, stbTagName);
      const elementsB = parseElements(modelBDocument, stbTagName);

      const comparisonKeyType = comparisonKeyManager.getKeyType();
      const comparisonOptions = {
        classifyNullKeysAsOnly: comparisonKeyType === COMPARISON_KEY_TYPE.GUID_BASED,
      };
      const comparisonResult = compareElements(
        elementsA,
        elementsB,
        nodeMapA,
        nodeMapB,
        (el, nm) => polyElementKeyExtractor(el, nm, 'StbNodeIdOrder', comparisonKeyType),
        comparisonOptions,
      );

      labelDisplayManager.syncWithCheckbox(elementType);
      const createLabels = labelDisplayManager.isLabelVisible(elementType);
      log.debug(`[redraw${elementType}ForViewMode] poly mode - createLabels: ${createLabels}`);

      const createdLabels = drawPolyElements(
        comparisonResult,
        materials,
        group,
        createLabels,
        modelBounds,
      );

      if (createdLabels && createdLabels.length > 0) {
        log.debug(
          `[redraw${elementType}ForViewMode] poly mode - created ${createdLabels.length} labels`,
        );
        addLabelsToGlobalState(createdLabels);
      } else {
        log.debug(`[redraw${elementType}ForViewMode] poly mode - no labels created`);
      }
    } else if (nodeEndAttr === null) {
      // 1ノード要素（基礎など）は線表示をサポートしない
      log.debug(
        `[redraw${elementType}ForViewMode] line mode not supported for single-node elements`,
      );
      if (scheduleRender) scheduleRender();
      return;
    } else {
      // 2ノード要素の線表示（既存コード）
      const elementsA = parseElements(modelADocument, stbTagName);
      const elementsB = parseElements(modelBDocument, stbTagName);
      const comparisonKeyType = comparisonKeyManager.getKeyType();
      const comparisonOptions = {
        classifyNullKeysAsOnly: comparisonKeyType === COMPARISON_KEY_TYPE.GUID_BASED,
      };
      const comparisonResult = compareElements(
        elementsA,
        elementsB,
        nodeMapA,
        nodeMapB,
        (el, nm) => lineElementKeyExtractor(el, nm, nodeStartAttr, nodeEndAttr, comparisonKeyType),
        comparisonOptions,
      );

      labelDisplayManager.syncWithCheckbox(elementType);
      const createLabels = labelDisplayManager.isLabelVisible(elementType);
      log.debug(`[redraw${elementType}ForViewMode] line mode - createLabels: ${createLabels}`);

      const createdLabels = drawLineElements(
        comparisonResult,
        materials,
        group,
        elementType,
        createLabels,
        modelBounds,
      );

      if (createdLabels && createdLabels.length > 0) {
        log.debug(
          `[redraw${elementType}ForViewMode] line mode - created ${createdLabels.length} labels`,
        );
        addLabelsToGlobalState(createdLabels);
      } else {
        log.debug(`[redraw${elementType}ForViewMode] line mode - no labels created`);
      }
    }
  }

  // ラベルの表示/非表示を更新
  if (updateLabelsAfter) {
    setTimeout(() => {
      updateLabelVisibility();
      if (scheduleRender) scheduleRender();
    }, UI_TIMING.VIEW_MODE_UPDATE_DELAY_MS);
  }
}

// ============================================================================
// ファクトリーパターンによる要素再描画関数の統一
// ============================================================================

/**
 * 要素タイプに基づいて再描画を実行する汎用関数
 * @param {string} elementType - 要素タイプ名
 * @param {Function} scheduleRender - 再描画要求関数
 * @param {boolean} [updateLabelsAfter=true] - ラベル更新を行うか
 */
export function redrawElementByType(elementType, scheduleRender, updateLabelsAfter = true) {
  const config = getElementRedrawConfig(elementType);
  if (!config) {
    log.warn(`Unknown element type: ${elementType}`);
    return;
  }
  redrawElementForViewMode(config, scheduleRender, updateLabelsAfter);
}

/**
 * ファクトリー関数: 要素タイプに対応する再描画関数を生成
 * @param {string} elementType - 要素タイプ名
 * @returns {Function} 再描画関数
 */
function createRedrawFunction(elementType) {
  return function (scheduleRender) {
    redrawElementByType(elementType, scheduleRender);
  };
}

// 後方互換性のためのエクスポート（設定ベースで生成）
export const redrawColumnsForViewMode = createRedrawFunction('Column');
export const redrawPostsForViewMode = createRedrawFunction('Post');
export const redrawBracesForViewMode = createRedrawFunction('Brace');
export const redrawPilesForViewMode = createRedrawFunction('Pile');
export const redrawFootingsForViewMode = createRedrawFunction('Footing');
export const redrawFoundationColumnsForViewMode = createRedrawFunction('FoundationColumn');
export const redrawSlabsForViewMode = createRedrawFunction('Slab');
export const redrawWallsForViewMode = createRedrawFunction('Wall');
export const redrawParapetsForViewMode = createRedrawFunction('Parapet');
export const redrawStripFootingsForViewMode = createRedrawFunction('StripFooting');

/**
 * 梁の再描画処理（大梁と小梁の両方を処理 - 特殊ケース）
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function redrawBeamsForViewMode(scheduleRender) {
  // 大梁（Girder）を処理（ラベル更新はスキップ）
  redrawElementByType('Girder', scheduleRender, false);
  // 小梁（Beam）を処理（ラベル更新を実行）
  redrawElementByType('Beam', scheduleRender, true);
}

/**
 * 立体表示要素用のラベルを作成する（modelSource付き）
 * @param {Array} elements - 要素配列
 * @param {Map} nodes - 節点マップ
 * @param {string} elementType - 要素タイプ
 * @param {string} modelSource - モデルソース（'matched', 'A', 'B'）
 * @returns {Array} 作成されたラベルスプライトの配列
 */
function createLabelsForSolidElementsWithSource(elements, nodes, elementType, modelSource) {
  const labels = [];

  for (const element of elements) {
    let startNode, endNode, labelText, centerPosition;

    // 要素タイプに応じて座標とラベルテキストを取得
    if (elementType === 'Column' || elementType === 'Post' || elementType === 'FoundationColumn') {
      startNode = nodes.get(element.id_node_bottom);
      endNode = nodes.get(element.id_node_top);
      labelText = generateLabelText(element, elementType);
      if (startNode && endNode) {
        centerPosition = new THREE.Vector3().addVectors(startNode, endNode).multiplyScalar(0.5);
      }
    } else if (elementType === 'Girder' || elementType === 'Beam') {
      startNode = nodes.get(element.id_node_start);
      endNode = nodes.get(element.id_node_end);
      labelText = generateLabelText(element, elementType);
      if (startNode && endNode) {
        centerPosition = new THREE.Vector3().addVectors(startNode, endNode).multiplyScalar(0.5);
      }
    } else if (elementType === 'Brace' || elementType === 'Pile') {
      startNode = nodes.get(element.id_node_start || element.id_node_bottom);
      endNode = nodes.get(element.id_node_end || element.id_node_top);
      labelText = generateLabelText(element, elementType);
      if (startNode && endNode) {
        centerPosition = new THREE.Vector3().addVectors(startNode, endNode).multiplyScalar(0.5);
      }
    } else if (elementType === 'Footing') {
      // 基礎は1ノード要素 - ノード位置をそのまま使用
      const node = nodes.get(element.id_node);
      labelText = generateLabelText(element, elementType);
      if (node) {
        // level_bottom を考慮してラベル位置を調整
        const levelBottom = element.level_bottom || 0;
        centerPosition = new THREE.Vector3(node.x, node.y, levelBottom);
      }
    } else if (elementType === 'Slab' || elementType === 'Wall') {
      // 床・壁は複数ノード要素 - ノード位置の中心を使用
      const nodeIds = element.node_ids || [];
      if (nodeIds.length > 0) {
        centerPosition = new THREE.Vector3();
        let validNodeCount = 0;
        for (const nodeId of nodeIds) {
          const node = nodes.get(nodeId);
          if (node) {
            centerPosition.add(node);
            validNodeCount++;
          }
        }
        if (validNodeCount > 0) {
          centerPosition.divideScalar(validNodeCount);
          labelText = generateLabelText(element, elementType);
        } else {
          continue;
        }
      } else {
        continue;
      }
    } else {
      continue;
    }

    if (!centerPosition) continue;

    // ラベルスプライトを作成（グループは後で追加するため、nullを渡す）
    const sprite = createLabelSprite(labelText, centerPosition, null, elementType);
    if (sprite) {
      sprite.userData.elementId = element.id;
      sprite.userData.modelSource = modelSource; // 差分表示用のモデルソースを設定
      sprite.userData.elementType = elementType;

      // 要素データを保存して再生成時に使用
      attachElementDataToLabel(sprite, element);
      labels.push(sprite);
    }
  }

  return labels;
}

/**
 * 継手要素の表示モードを再描画
 * 継手は梁・柱の端部に配置される接合プレート
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function redrawJointsForViewMode(scheduleRender) {
  console.log('[DEBUG] redrawJointsForViewMode called');
  // 継手は特殊な要素で、梁・柱に関連付けられている
  // solid表示モードの場合のみ継手プレートを描画

  // モデルコンテキストを取得
  const { modelADocument, modelBDocument } = getModelContext();

  if (!modelADocument && !modelBDocument) {
    console.log('[DEBUG] redrawJointsForViewMode: No model documents');
    return;
  }

  const group = elementGroups['Joint'];
  if (!group) {
    console.log('[DEBUG] redrawJointsForViewMode: Joint group not found');
    return;
  }

  // 既存のラベルを削除
  removeLabelsForElementType('Joint');
  group.clear();

  // グループを可視状態に設定（初期レンダリング時にfalseになっている可能性があるため）
  group.visible = true;

  const viewMode = displayModeManager.getDisplayMode('Joint');
  console.log('[DEBUG] redrawJointsForViewMode: viewMode =', viewMode);
  log.debug(`[redrawJointsForViewMode] mode: ${viewMode}`);

  if (viewMode !== 'solid') {
    // 線表示モードでは継手は非表示
    group.visible = false;
    if (scheduleRender) scheduleRender();
    return;
  }

  // 立体表示モード: 梁・柱から継手情報を取得して描画
  // 継手IDはパース時に適用されるため、キャッシュが古い場合は強制再パース
  const stbDataA = modelADocument
    ? parseStbFile(modelADocument, { modelKey: 'A', saveToGlobalState: true, forceReparse: true })
    : null;
  const stbDataB = modelBDocument
    ? parseStbFile(modelBDocument, { modelKey: 'B', saveToGlobalState: true, forceReparse: true })
    : null;

  // 継手を持つ梁要素を収集（GirderとBeam）
  const jointedElementsA = [];
  const jointedElementsB = [];

  if (stbDataA) {
    console.log('[DEBUG] stbDataA:', {
      girders: stbDataA.girderElements?.length || 0,
      beams: stbDataA.beamElements?.length || 0,
      jointElements: stbDataA.jointElements?.size || 0,
    });
    // 最初の大梁要素の中身を確認
    if (stbDataA.girderElements?.length > 0) {
      const firstGirder = stbDataA.girderElements[0];
      console.log('[DEBUG] First girder element:', {
        id: firstGirder.id,
        joint_id_start: firstGirder.joint_id_start,
        joint_id_end: firstGirder.joint_id_end,
        keys: Object.keys(firstGirder).join(', '),
      });
    }
    // jointElements の中身を確認
    if (stbDataA.jointElements) {
      console.log('[DEBUG] jointElements keys:', Array.from(stbDataA.jointElements.keys()));
    }
    log.debug(
      `[redrawJointsForViewMode] stbDataA: girders=${stbDataA.girderElements?.length || 0}, beams=${stbDataA.beamElements?.length || 0}, jointElements=${stbDataA.jointElements?.size || 0}`,
    );

    // Girder要素から継手情報を持つものを抽出
    for (const girder of stbDataA.girderElements || []) {
      if (girder.joint_id_start || girder.joint_id_end) {
        console.log(
          '[DEBUG] Found jointed girder:',
          girder.id,
          girder.joint_id_start,
          girder.joint_id_end,
        );
        log.debug(
          `[redrawJointsForViewMode] Found jointed girder: id=${girder.id}, joint_id_start=${girder.joint_id_start}, joint_id_end=${girder.joint_id_end}`,
        );
        jointedElementsA.push({ ...girder, elementType: 'Girder' });
      }
    }
    // Beam要素から継手情報を持つものを抽出
    for (const beam of stbDataA.beamElements || []) {
      if (beam.joint_id_start || beam.joint_id_end) {
        console.log('[DEBUG] Found jointed beam:', beam.id, beam.joint_id_start, beam.joint_id_end);
        log.debug(
          `[redrawJointsForViewMode] Found jointed beam: id=${beam.id}, joint_id_start=${beam.joint_id_start}, joint_id_end=${beam.joint_id_end}`,
        );
        jointedElementsA.push({ ...beam, elementType: 'Beam' });
      }
    }
    console.log('[DEBUG] Total jointed elements A:', jointedElementsA.length);
    log.debug(`[redrawJointsForViewMode] Total jointed elements A: ${jointedElementsA.length}`);
  }

  if (stbDataB) {
    for (const girder of stbDataB.girderElements || []) {
      if (girder.joint_id_start || girder.joint_id_end) {
        jointedElementsB.push({ ...girder, elementType: 'Girder' });
      }
    }
    for (const beam of stbDataB.beamElements || []) {
      if (beam.joint_id_start || beam.joint_id_end) {
        jointedElementsB.push({ ...beam, elementType: 'Beam' });
      }
    }
  }

  // Jointジェネレータを動的解決（クラスの静的メソッドを使用）
  const jointInfo = geometryGeneratorFactory.getGeneratorInfo('Joint');

  if (!jointInfo) {
    log.warn('Joint generator not found');
    if (scheduleRender) scheduleRender();
    return;
  }

  const jointGenerator = jointInfo.class;
  const jointMethod = jointInfo.method;

  // 継手メッシュを生成
  console.log('[DEBUG] Creating joint meshes, jointedElementsA:', jointedElementsA.length);
  if (stbDataA && jointedElementsA.length > 0) {
    console.log('[DEBUG] Calling JointGenerator.createJointMeshes with:', {
      jointedElements: jointedElementsA.length,
      nodes: stbDataA.nodes?.size || 0,
      jointElements: stbDataA.jointElements?.size || 0,
    });
    const meshes = jointGenerator[jointMethod](
      jointedElementsA,
      stbDataA.nodes,
      stbDataA.jointElements,
      stbDataA.steelSections,
      'Joint',
      false,
      {
        girderSections: stbDataA.girderSections,
        beamSections: stbDataA.beamSections,
      },
    );
    console.log('[DEBUG] Created meshes:', meshes.length);
    meshes.forEach((mesh, index) => {
      mesh.userData.modelSource = 'A';
      group.add(mesh);
      if (index === 0) {
        console.log('[DEBUG] First mesh position:', mesh.position);
        console.log('[DEBUG] First mesh geometry bounding box:', mesh.geometry.boundingBox);
        mesh.geometry.computeBoundingBox();
        console.log('[DEBUG] First mesh computed bounding box:', mesh.geometry.boundingBox);
      }
    });
    console.log('[DEBUG] Group children count after adding:', group.children.length);
    console.log('[DEBUG] Group visible:', group.visible);
    console.log('[DEBUG] Group position:', group.position);
    log.debug(`[redrawJointsForViewMode] Created ${meshes.length} joint meshes from model A`);
  }

  if (stbDataB && jointedElementsB.length > 0) {
    const meshes = jointGenerator[jointMethod](
      jointedElementsB,
      stbDataB.nodes,
      stbDataB.jointElements,
      stbDataB.steelSections,
      'Joint',
      false,
      {
        girderSections: stbDataB.girderSections,
        beamSections: stbDataB.beamSections,
      },
    );
    meshes.forEach((mesh) => {
      mesh.userData.modelSource = 'B';
      group.add(mesh);
    });
    log.debug(`[redrawJointsForViewMode] Created ${meshes.length} joint meshes from model B`);
  }

  // カラーモード適用（動的インポート）
  import('../../colorModes/index.js')
    .then(({ updateElementsForColorMode }) => {
      updateElementsForColorMode();
    })
    .catch((err) => {
      console.error('Failed to update colors for joint mode:', err);
    });

  if (scheduleRender) scheduleRender();
}

/**
 * Undefined断面を参照する要素の再描画
 * StbSecUndefinedを参照する要素は断面寸法が不明なため、常にラインのみで表示
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function redrawUndefinedElementsForViewMode(scheduleRender) {
  // モデルコンテキストを取得
  const { modelBounds, modelADocument, modelBDocument } = getModelContext();

  if (!modelADocument && !modelBDocument) return;

  const group = elementGroups['Undefined'];
  if (!group) {
    log.warn('[redrawUndefinedElementsForViewMode] Undefined group not found');
    return;
  }

  // 既存のラベルを削除してグループをクリア
  removeLabelsForElementType('Undefined');
  group.clear();

  // Undefined要素は表示モードに関係なく常にラインで表示
  log.debug('[redrawUndefinedElementsForViewMode] Drawing undefined elements as lines');

  // モデルデータを取得
  const stbDataA = modelADocument
    ? parseStbFile(modelADocument, { modelKey: 'A', saveToGlobalState: true })
    : null;
  const stbDataB = modelBDocument
    ? parseStbFile(modelBDocument, { modelKey: 'B', saveToGlobalState: true })
    : null;

  const undefinedElementsA = stbDataA?.undefinedElements || [];
  const undefinedElementsB = stbDataB?.undefinedElements || [];

  log.debug(
    `[redrawUndefinedElementsForViewMode] Found ${undefinedElementsA.length} elements in A, ${undefinedElementsB.length} in B`,
  );

  // ノードマップを取得
  const nodeMapA = stbDataA?.nodes || new Map();
  const nodeMapB = stbDataB?.nodes || new Map();

  log.debug(
    `[redrawUndefinedElementsForViewMode] NodeMap sizes: A=${nodeMapA.size}, B=${nodeMapB.size}`,
  );

  // デバッグ: 最初のundefined要素の属性を確認
  if (undefinedElementsA.length > 0) {
    const firstEl = undefinedElementsA[0];
    log.debug(
      `[redrawUndefinedElementsForViewMode] First element A: id=${firstEl.id}, ` +
        `originalType=${firstEl.originalType}, ` +
        `nodeStartAttr=${firstEl.nodeStartAttr}, nodeEndAttr=${firstEl.nodeEndAttr}, ` +
        `startValue=${firstEl[firstEl.nodeStartAttr]}, endValue=${firstEl[firstEl.nodeEndAttr]}`,
    );
  }

  // 比較用にデータを変換
  const convertToComparisonFormat = (elements, nodeMap) => {
    return elements
      .map((el) => {
        // nodeStartAttr/nodeEndAttrは属性名（例: 'id_node_start'）
        const startAttr = el.nodeStartAttr;
        const endAttr = el.nodeEndAttr;
        const startNodeId = el[startAttr];
        const endNodeId = el[endAttr];

        if (!startNodeId || !endNodeId) {
          log.warn(
            `[redrawUndefinedElementsForViewMode] Missing node attr for element ${el.id}: ` +
              `startAttr=${startAttr}, endAttr=${endAttr}, ` +
              `startId=${startNodeId}, endId=${endNodeId}`,
          );
          return null;
        }

        // ノードマップからノードを取得（キーは文字列）
        const startNode = nodeMap.get(String(startNodeId));
        const endNode = nodeMap.get(String(endNodeId));

        if (!startNode || !endNode) {
          log.debug(
            `[redrawUndefinedElementsForViewMode] Node not found for element ${el.id}: ` +
              `startId=${startNodeId} (found=${!!startNode}), endId=${endNodeId} (found=${!!endNode})`,
          );
          return null;
        }

        return {
          id: el.id,
          startCoords: { x: startNode.x, y: startNode.y, z: startNode.z },
          endCoords: { x: endNode.x, y: endNode.y, z: endNode.z },
          originalType: el.originalType,
          name: el.name,
        };
      })
      .filter((el) => el !== null);
  };

  const dataA = convertToComparisonFormat(undefinedElementsA, nodeMapA);
  const dataB = convertToComparisonFormat(undefinedElementsB, nodeMapB);

  // 要素の比較を実行
  const comparisonResult = compareElements(dataA, dataB, nodeMapA, nodeMapB, (el) => {
    // 位置ベースのキー生成（start-end座標で比較）
    const start = el.startCoords;
    const end = el.endCoords;
    return `${start.x.toFixed(0)},${start.y.toFixed(0)},${start.z.toFixed(0)}-${end.x.toFixed(0)},${end.y.toFixed(0)},${end.z.toFixed(0)}`;
  });

  // ラベル表示設定を取得
  labelDisplayManager.syncWithCheckbox('Undefined');
  const createLabels = labelDisplayManager.isLabelVisible('Undefined');
  log.debug(`[redrawUndefinedElementsForViewMode] createLabels: ${createLabels}`);

  // 線要素を描画
  const createdLabels = drawLineElements(
    comparisonResult,
    materials,
    group,
    'Undefined',
    createLabels,
    modelBounds,
  );

  if (createdLabels && createdLabels.length > 0) {
    log.debug(`[redrawUndefinedElementsForViewMode] Created ${createdLabels.length} labels`);
    addLabelsToGlobalState(createdLabels);
  }

  // カラーモード適用（動的インポート）
  import('../../colorModes/index.js')
    .then(({ updateElementsForColorMode }) => {
      updateElementsForColorMode();
    })
    .catch((err) => {
      console.error('Failed to update colors for undefined elements:', err);
    });

  if (scheduleRender) scheduleRender();
}

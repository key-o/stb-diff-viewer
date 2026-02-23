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
import { parseElements } from '../../common-stb/import/parser/stbXmlParser.js';
import {
  drawLineElements,
  drawPolyElements,
  elementGroups,
  createLabelSprite,
  displayModeManager,
  labelDisplayManager,
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
import {
  normalizeComparisonResult,
  getCategoryCounts,
} from '../../data/normalizeComparisonResult.js';
import { COMPARISON_CATEGORY } from '../../constants/comparisonCategories.js';
import { getMaterialForElementWithMode } from '../../viewer/rendering/materials.js';

// ロガー
const log = createLogger('elementRedrawer');

// ============================================================================
// ソリッドモード ヘルパー関数
// ============================================================================

/**
 * ソリッドモードの比較結果を元にメッシュを生成しグループに追加する
 * @param {Object} comparisonResult - 正規化済み比較結果
 * @param {Object} stbDataA - モデルAのパース済みデータ
 * @param {Object} stbDataB - モデルBのパース済みデータ
 * @param {THREE.Group} group - 追加先のグループ
 * @param {Object} generatorInfo - ジェネレータ情報 { class, method }
 * @param {string} elementType - 要素タイプ
 * @param {string} elementsKey - stbDataのキー名
 * @param {string} sectionsKey - stbDataのキー名
 * @private
 */
function createSolidModeMeshes(
  comparisonResult,
  stbDataA,
  stbDataB,
  group,
  generatorInfo,
  elementType,
  elementsKey,
  sectionsKey,
) {
  const generator = generatorInfo.class;
  const generatorMethod = generatorInfo.method;
  const openingElementsA = elementType === 'Wall' ? stbDataA.openingElements : null;
  const openingElementsB = elementType === 'Wall' ? stbDataB.openingElements : null;

  // EXACT要素（位置完全一致 + 属性一致）のメッシュを生成
  const exactItems = comparisonResult[COMPARISON_CATEGORY.EXACT] || [];
  if (exactItems.length > 0) {
    const exactElements = exactItems.map((m) => m.dataA.element);
    const exactMeshes = generator[generatorMethod](
      exactElements,
      stbDataA.nodes,
      stbDataA[sectionsKey],
      stbDataA.steelSections,
      elementType,
      false,
      openingElementsA,
    );

    const exactPairs = new Map();
    exactItems.forEach((pair) => {
      exactPairs.set(pair.dataA.element.id, pair.dataB.element.id);
    });

    exactMeshes.forEach((mesh) => {
      mesh.userData.modelSource = 'matched';
      mesh.userData.category = COMPARISON_CATEGORY.EXACT;
      mesh.userData.positionState = 'exact';
      mesh.userData.attributeState = 'matched';
      const elementIdA = mesh.userData.elementId;
      const elementIdB = exactPairs.get(elementIdA);
      if (elementIdB) {
        mesh.userData.elementIdA = elementIdA;
        mesh.userData.elementIdB = elementIdB;
      }
      group.add(mesh);
    });
  }

  // ATTRIBUTE_MISMATCH要素（位置一致、属性が異なる）のメッシュを生成
  const mismatchItems = comparisonResult[COMPARISON_CATEGORY.ATTRIBUTE_MISMATCH] || [];
  if (mismatchItems.length > 0) {
    const mismatchElements = mismatchItems.map((m) => m.dataA.element);
    const mismatchMeshes = generator[generatorMethod](
      mismatchElements,
      stbDataA.nodes,
      stbDataA[sectionsKey],
      stbDataA.steelSections,
      elementType,
      false,
      openingElementsA,
    );

    const mismatchPairs = new Map();
    mismatchItems.forEach((pair) => {
      mismatchPairs.set(pair.dataA.element.id, pair.dataB.element.id);
    });

    mismatchMeshes.forEach((mesh) => {
      mesh.userData.modelSource = 'matched';
      mesh.userData.category = COMPARISON_CATEGORY.ATTRIBUTE_MISMATCH;
      mesh.userData.positionState = 'exact';
      mesh.userData.attributeState = 'mismatch';
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
      false,
      openingElementsA,
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
      false,
      openingElementsB,
    );
    onlyBMeshes.forEach((mesh) => {
      mesh.userData.modelSource = 'B';
      group.add(mesh);
    });
  }
}

/**
 * ソリッドモードの比較結果を元にラベルを作成しグループに追加する
 * @param {Object} comparisonResult - 正規化済み比較結果
 * @param {Object} stbDataA - モデルAのパース済みデータ
 * @param {Object} stbDataB - モデルBのパース済みデータ
 * @param {THREE.Group} group - 追加先のグループ
 * @param {string} elementType - 要素タイプ
 * @private
 */
function createSolidModeLabels(comparisonResult, stbDataA, stbDataB, group, elementType) {
  labelDisplayManager.syncWithCheckbox(elementType);
  const createLabelsFlag = labelDisplayManager.isLabelVisible(elementType);
  log.debug(`[redraw${elementType}ForViewMode] solid mode - createLabels: ${createLabelsFlag}`);

  if (!createLabelsFlag) return;

  const exactItems = comparisonResult[COMPARISON_CATEGORY.EXACT] || [];
  const mismatchItems = comparisonResult[COMPARISON_CATEGORY.ATTRIBUTE_MISMATCH] || [];

  // EXACT要素のラベル
  const exactLabels = createLabelsForSolidElementsWithSource(
    exactItems.map((m) => m.dataA.element),
    stbDataA.nodes,
    elementType,
    'matched',
  );
  // ATTRIBUTE_MISMATCH要素のラベル
  const mismatchLabels = createLabelsForSolidElementsWithSource(
    mismatchItems.map((m) => m.dataA.element),
    stbDataA.nodes,
    elementType,
    'matched',
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

  const allLabels = [...exactLabels, ...mismatchLabels, ...onlyALabels, ...onlyBLabels];
  log.debug(`[redraw${elementType}ForViewMode] solid mode - created ${allLabels.length} labels`);
  allLabels.forEach((label) => group.add(label));
  addLabelsToGlobalState(allLabels);
}

/**
 * 片方のモデルのみの場合のソリッドモード描画
 * @param {Object} stbData - パース済みデータ
 * @param {string} modelSource - モデルソース ('A' or 'B')
 * @param {THREE.Group} group - 追加先のグループ
 * @param {Object} generatorInfo - ジェネレータ情報 { class, method }
 * @param {string} elementType - 要素タイプ
 * @param {string} elementsKey - stbDataのキー名
 * @param {string} sectionsKey - stbDataのキー名
 * @private
 */
function createSolidModeMeshesForSingleModel(
  stbData,
  modelSource,
  group,
  generatorInfo,
  elementType,
  elementsKey,
  sectionsKey,
) {
  const generator = generatorInfo.class;
  const generatorMethod = generatorInfo.method;

  const meshes = generator[generatorMethod](
    stbData[elementsKey],
    stbData.nodes,
    stbData[sectionsKey],
    stbData.steelSections,
    elementType,
    false,
    elementType === 'Wall' ? stbData.openingElements : null,
  );
  meshes.forEach((mesh) => {
    mesh.userData.modelSource = modelSource;
    group.add(mesh);
  });

  // ラベル作成
  labelDisplayManager.syncWithCheckbox(elementType);
  const createLabelsFlag = labelDisplayManager.isLabelVisible(elementType);
  log.debug(`[redraw${elementType}ForViewMode] solid mode - createLabels: ${createLabelsFlag}`);

  if (createLabelsFlag) {
    const labels = createLabelsForSolidElementsWithSource(
      stbData[elementsKey],
      stbData.nodes,
      elementType,
      modelSource,
    );
    log.debug(`[redraw${elementType}ForViewMode] solid mode - created ${labels.length} labels`);
    labels.forEach((label) => group.add(label));
    addLabelsToGlobalState(labels);
  }
}

/**
 * カラーモードをソリッドメッシュに適用する（動的インポート）
 * @private
 */
function applyColorModeToSolidMeshes() {
  import('../../colorModes/index.js')
    .then(({ updateElementsForColorMode }) => {
      updateElementsForColorMode();
    })
    .catch((err) => {
      console.error('Failed to update colors for solid mode:', err);
    });
}

// ============================================================================
// ラインモード ヘルパー関数
// ============================================================================

/**
 * ポリゴン要素（Wall, Slab）の線/パネル表示を描画する
 * @param {Object} config - 要素設定
 * @param {Object} modelContext - モデルコンテキスト
 * @param {THREE.Group} group - 追加先のグループ
 * @private
 */
function drawPolyModeElements(config, modelContext, group) {
  const { elementType, stbTagName } = config;
  const { modelBounds, modelADocument, modelBDocument, nodeMapA, nodeMapB } = modelContext;

  const elementsA = parseElements(modelADocument, stbTagName);
  const elementsB = parseElements(modelBDocument, stbTagName);

  const comparisonKeyType = comparisonKeyManager.getKeyType();
  const comparisonOptions = {
    classifyNullKeysAsOnly: comparisonKeyType === COMPARISON_KEY_TYPE.GUID_BASED,
  };
  const rawPolyResult = compareElements(
    elementsA,
    elementsB,
    nodeMapA,
    nodeMapB,
    (el, nm) => polyElementKeyExtractor(el, nm, 'StbNodeIdOrder', comparisonKeyType),
    comparisonOptions,
  );

  const comparisonResult = normalizeComparisonResult(rawPolyResult);

  labelDisplayManager.syncWithCheckbox(elementType);
  const createLabels = labelDisplayManager.isLabelVisible(elementType);
  log.debug(`[redraw${elementType}ForViewMode] poly mode - createLabels: ${createLabels}`);

  const createdLabels = drawPolyElements(comparisonResult, group, createLabels, modelBounds);

  // Wallの非ソリッド表示時にも開口輪郭を描画
  if (elementType === 'Wall') {
    const stbDataA = modelADocument
      ? parseStbFile(modelADocument, { modelKey: 'A', saveToGlobalState: true })
      : null;
    const stbDataB = modelBDocument
      ? parseStbFile(modelBDocument, { modelKey: 'B', saveToGlobalState: true })
      : null;
    drawWallOpeningOutlines(
      comparisonResult,
      group,
      modelBounds,
      createWallLookup(stbDataA?.wallElements),
      createWallLookup(stbDataB?.wallElements),
      stbDataA?.openingElements || null,
      stbDataB?.openingElements || null,
    );
  }

  if (createdLabels && createdLabels.length > 0) {
    log.debug(
      `[redraw${elementType}ForViewMode] poly mode - created ${createdLabels.length} labels`,
    );
    addLabelsToGlobalState(createdLabels);
  } else {
    log.debug(`[redraw${elementType}ForViewMode] poly mode - no labels created`);
  }
}

/**
 * 2ノード要素の線表示を描画する
 * @param {Object} config - 要素設定
 * @param {Object} modelContext - モデルコンテキスト
 * @param {THREE.Group} group - 追加先のグループ
 * @private
 */
function drawLineModeElements(config, modelContext, group) {
  const { elementType, stbTagName, nodeStartAttr, nodeEndAttr } = config;
  const { modelBounds, modelADocument, modelBDocument, nodeMapA, nodeMapB } = modelContext;

  const elementsA = parseElements(modelADocument, stbTagName);
  const elementsB = parseElements(modelBDocument, stbTagName);
  const comparisonKeyType = comparisonKeyManager.getKeyType();
  const comparisonOptions = {
    classifyNullKeysAsOnly: comparisonKeyType === COMPARISON_KEY_TYPE.GUID_BASED,
  };
  const rawLineResult = compareElements(
    elementsA,
    elementsB,
    nodeMapA,
    nodeMapB,
    (el, nm) => lineElementKeyExtractor(el, nm, nodeStartAttr, nodeEndAttr, comparisonKeyType),
    comparisonOptions,
  );

  const comparisonResult = normalizeComparisonResult(rawLineResult);

  labelDisplayManager.syncWithCheckbox(elementType);
  const createLabels = labelDisplayManager.isLabelVisible(elementType);
  log.debug(`[redraw${elementType}ForViewMode] line mode - createLabels: ${createLabels}`);

  const createdLabels = drawLineElements(
    comparisonResult,
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

/**
 * ソリッドモードでの比較を実行し、正規化された比較結果を返す
 * @param {Object} config - 要素設定
 * @param {Object} stbDataA - モデルAのパース済みデータ
 * @param {Object} stbDataB - モデルBのパース済みデータ
 * @param {string} elementType - 要素タイプ
 * @param {string} elementsKey - stbDataのキー名
 * @returns {Object} 正規化済み比較結果
 * @private
 */
function runSolidModeComparison(config, stbDataA, stbDataB, elementType, elementsKey) {
  const { nodeStartAttr, nodeEndAttr } = config;
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

  const rawComparisonResult = compareElements(
    stbDataA[elementsKey] || [],
    stbDataB[elementsKey] || [],
    stbDataA.nodes,
    stbDataB.nodes,
    keyExtractor,
    comparisonOptions,
  );

  // Normalize to canonical 5-category format
  const comparisonResult = normalizeComparisonResult(rawComparisonResult);

  const counts = getCategoryCounts(comparisonResult);
  log.debug(
    `[redraw${elementType}ForViewMode] solid mode comparison: ` +
      `matched=${counts.matched}, ` +
      `attributeMismatch=${counts.attributeMismatch}, ` +
      `onlyA=${counts.onlyA}, ` +
      `onlyB=${counts.onlyB}`,
  );

  return comparisonResult;
}

// ============================================================================
// メイン再描画オーケストレーター
// ============================================================================

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
  const { elementType, elementsKey, sectionsKey, nodeEndAttr } = config;

  // ジェネレータをviewer層から動的解決（クラスの静的メソッドを使用）
  const generatorInfo = geometryGeneratorFactory.getGeneratorInfo(elementType);

  if (!generatorInfo) {
    log.warn(`Cannot create meshes for ${elementType}: generator not found`);
    if (scheduleRender) scheduleRender();
    return;
  }

  // モデルコンテキストを取得
  const modelContext = getModelContext();
  const { modelADocument, modelBDocument } = modelContext;

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

    if (stbDataA && stbDataB) {
      // 両方のモデルがある場合: 比較を実行し、カテゴリ別にメッシュ・ラベルを生成
      const comparisonResult = runSolidModeComparison(
        config,
        stbDataA,
        stbDataB,
        elementType,
        elementsKey,
      );
      createSolidModeMeshes(
        comparisonResult,
        stbDataA,
        stbDataB,
        group,
        generatorInfo,
        elementType,
        elementsKey,
        sectionsKey,
      );
      createSolidModeLabels(comparisonResult, stbDataA, stbDataB, group, elementType);
    } else {
      // 片方のモデルのみの場合（従来の処理）
      const stbData = stbDataA || stbDataB;
      const modelSource = stbDataA ? 'A' : 'B';
      if (stbData) {
        createSolidModeMeshesForSingleModel(
          stbData,
          modelSource,
          group,
          generatorInfo,
          elementType,
          elementsKey,
          sectionsKey,
        );
      }
    }

    applyColorModeToSolidMeshes();
  } else {
    // 線表示 / パネル表示
    if (elementType === 'Wall' || elementType === 'Slab') {
      drawPolyModeElements(config, modelContext, group);
    } else if (nodeEndAttr === null) {
      // 1ノード要素（基礎など）は線表示をサポートしない
      log.debug(
        `[redraw${elementType}ForViewMode] line mode not supported for single-node elements`,
      );
      if (scheduleRender) scheduleRender();
      return;
    } else {
      drawLineModeElements(config, modelContext, group);
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
 * 壁要素配列からID検索用Mapを生成
 * @param {Array<Object>} walls - 壁要素配列
 * @returns {Map<string, Object>} 壁IDをキーとしたマップ
 */
function createWallLookup(walls) {
  const map = new Map();
  if (!walls || !Array.isArray(walls)) return map;
  for (const wall of walls) {
    if (wall?.id != null) {
      map.set(String(wall.id), wall);
    }
  }
  return map;
}

/**
 * 壁ローカル座標系を計算
 * WallGenerator と同等の考え方で、幅方向・法線・高さを推定する
 * @param {Array<Object>} vertexCoordsList - 壁頂点座標配列
 * @returns {Object|null} 壁ローカル座標系
 */
function computeWallFrame(vertexCoordsList) {
  if (!Array.isArray(vertexCoordsList) || vertexCoordsList.length < 3) return null;

  const vertices = [];
  for (const p of vertexCoordsList) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
      return null;
    }
    vertices.push(new THREE.Vector3(p.x, p.y, p.z));
  }

  const sortedByZ = [...vertices].sort((a, b) => a.z - b.z);
  const minZ = sortedByZ[0].z;
  const maxZ = sortedByZ[sortedByZ.length - 1].z;
  const wallHeight = Math.max(maxZ - minZ, 1);

  const tolerance = 10;
  const bottomPoints = sortedByZ.filter((v) => Math.abs(v.z - minZ) < tolerance);

  let pStart = bottomPoints[0] || vertices[0];
  let pEnd = bottomPoints[0] || vertices[0];
  let maxDistSq = 0;

  if (bottomPoints.length >= 2) {
    for (let i = 0; i < bottomPoints.length; i++) {
      for (let j = i + 1; j < bottomPoints.length; j++) {
        const dSq = bottomPoints[i].distanceToSquared(bottomPoints[j]);
        if (dSq > maxDistSq) {
          maxDistSq = dSq;
          pStart = bottomPoints[i];
          pEnd = bottomPoints[j];
        }
      }
    }
  } else {
    for (let i = 0; i < vertices.length; i++) {
      for (let j = i + 1; j < vertices.length; j++) {
        const dx = vertices[i].x - vertices[j].x;
        const dy = vertices[i].y - vertices[j].y;
        const dSq = dx * dx + dy * dy;
        if (dSq > maxDistSq) {
          maxDistSq = dSq;
          pStart = vertices[i];
          pEnd = vertices[j];
        }
      }
    }
  }

  const wallDirection = new THREE.Vector3().subVectors(pEnd, pStart);
  wallDirection.z = 0;
  if (wallDirection.lengthSq() > 0.0001) {
    wallDirection.normalize();
  } else {
    wallDirection.set(1, 0, 0);
  }

  const wallUp = new THREE.Vector3(0, 0, 1);
  const wallNormal = new THREE.Vector3().crossVectors(wallDirection, wallUp).normalize();

  let minL = Infinity;
  let maxL = -Infinity;
  let minT = Infinity;
  let maxT = -Infinity;

  for (const v of vertices) {
    const vec = new THREE.Vector3().subVectors(v, pStart);
    const distL = vec.dot(wallDirection);
    const distT = vec.dot(wallNormal);
    if (distL < minL) minL = distL;
    if (distL > maxL) maxL = distL;
    if (distT < minT) minT = distT;
    if (distT > maxT) maxT = distT;
  }

  const wallWidth = Math.max(maxL - minL, 1);
  const centerL = (minL + maxL) / 2;
  const centerT = (minT + maxT) / 2;
  const centerZ = minZ + wallHeight / 2;

  const center = new THREE.Vector3()
    .copy(pStart)
    .addScaledVector(wallDirection, centerL)
    .addScaledVector(wallNormal, centerT);
  center.z = centerZ;

  return { center, wallDirection, wallNormal, wallUp, wallWidth, wallHeight };
}

/**
 * 壁に紐づく開口情報を取得（STB 2.0.2/2.1.0両対応）
 * @param {Object} wall - 壁要素
 * @param {Map<string, Object>|null} openingElements - 開口情報マップ
 * @returns {Array<Object>} 開口配列
 */
function resolveOpeningsForWall(wall, openingElements, rawWallElement = null) {
  const openings = [];
  if (!wall || !openingElements) return openings;

  const getOpeningPosition = (opening) => ({
    positionX: opening.position_X ?? opening.offset_X ?? 0,
    positionY: opening.position_Y ?? opening.offset_Y ?? 0,
  });

  const openIds = [];
  if (Array.isArray(wall.open_ids) && wall.open_ids.length > 0) {
    openIds.push(...wall.open_ids);
  }

  // フォールバック: 比較時の生XML要素から開口IDを直接抽出
  if (openIds.length === 0 && rawWallElement) {
    const addOpenId = (id) => {
      if (!id) return;
      const normalized = String(id).trim();
      if (!normalized) return;
      if (!openIds.includes(normalized)) {
        openIds.push(normalized);
      }
    };

    if (typeof rawWallElement.getElementsByTagNameNS === 'function') {
      const nsNodes = rawWallElement.getElementsByTagNameNS('*', 'StbOpenId');
      for (const node of nsNodes) {
        addOpenId(node.getAttribute?.('id'));
      }
    }
    if (typeof rawWallElement.getElementsByTagName === 'function') {
      const nodes = rawWallElement.getElementsByTagName('StbOpenId');
      for (const node of nodes) {
        addOpenId(node.getAttribute?.('id'));
      }
    }
  }

  if (openIds.length > 0) {
    for (const openId of openIds) {
      const opening = openingElements.get(openId);
      if (!opening) continue;
      const pos = getOpeningPosition(opening);
      openings.push({
        id: opening.id,
        width: opening.length_X,
        height: opening.length_Y,
        positionX: pos.positionX,
        positionY: pos.positionY,
      });
    }
  } else {
    for (const opening of openingElements.values()) {
      if (opening.kind_member === 'WALL' && String(opening.id_member) === String(wall.id)) {
        const pos = getOpeningPosition(opening);
        openings.push({
          id: opening.id,
          width: opening.length_X,
          height: opening.length_Y,
          positionX: pos.positionX,
          positionY: pos.positionY,
        });
      }
    }
  }

  return openings;
}

/**
 * 開口輪郭をWallグループへ追加描画する（非ソリッド表示向け）
 * @param {Object} comparisonResult - 正規化済み比較結果
 * @param {THREE.Group} group - 壁グループ
 * @param {THREE.Box3} modelBounds - モデルバウンディング
 * @param {Map<string, Object>} wallMapA - モデルAの壁マップ
 * @param {Map<string, Object>} wallMapB - モデルBの壁マップ
 * @param {Map<string, Object>|null} openingMapA - モデルAの開口マップ
 * @param {Map<string, Object>|null} openingMapB - モデルBの開口マップ
 */
function drawWallOpeningOutlines(
  comparisonResult,
  group,
  modelBounds,
  wallMapA,
  wallMapB,
  openingMapA,
  openingMapB,
) {
  if (!comparisonResult || !group) return;

  const matchedItems = Array.isArray(comparisonResult.matched) ? comparisonResult.matched : [];
  const onlyAItems = Array.isArray(comparisonResult.onlyA) ? comparisonResult.onlyA : [];
  const onlyBItems = Array.isArray(comparisonResult.onlyB) ? comparisonResult.onlyB : [];

  const outlineOffset = 1;
  const minOpeningSize = 10;

  const drawForItem = (item, modelSource) => {
    const sourceData = modelSource === 'B' ? item : item?.dataA;
    const wallId = sourceData?.id;
    const vertexCoordsList = sourceData?.vertexCoordsList;
    if (!wallId || !Array.isArray(vertexCoordsList)) return;

    const wallMap = modelSource === 'B' ? wallMapB : wallMapA;
    const openingMap = modelSource === 'B' ? openingMapB : openingMapA;
    const wall = wallMap.get(String(wallId));
    if (!wall) return;

    const openings = resolveOpeningsForWall(wall, openingMap, sourceData?.rawElement || null);
    if (openings.length === 0) return;

    const frame = computeWallFrame(vertexCoordsList);
    if (!frame) return;

    const category = modelSource === 'A' ? 'onlyA' : modelSource === 'B' ? 'onlyB' : 'matched';
    const matchType = item?.matchType;
    const baseLineMaterial = getMaterialForElementWithMode(
      'Wall',
      category,
      true,
      false,
      String(wallId),
      matchType,
    );
    const lineMaterial = baseLineMaterial.clone();
    lineMaterial.depthTest = false;
    lineMaterial.depthWrite = false;
    lineMaterial.transparent = true;
    lineMaterial.opacity = 0.95;

    const halfWidth = frame.wallWidth / 2;
    const halfHeight = frame.wallHeight / 2;

    for (const opening of openings) {
      const width = Number(opening.width) || 0;
      const height = Number(opening.height) || 0;
      if (width <= 0 || height <= 0) continue;

      const openingLeft = (Number(opening.positionX) || 0) - halfWidth;
      const openingBottom = (Number(opening.positionY) || 0) - halfHeight;
      const openingRight = openingLeft + width;
      const openingTop = openingBottom + height;

      const clampedLeft = Math.max(openingLeft, -halfWidth + 1);
      const clampedRight = Math.min(openingRight, halfWidth - 1);
      const clampedBottom = Math.max(openingBottom, -halfHeight + 1);
      const clampedTop = Math.min(openingTop, halfHeight - 1);

      if (
        clampedRight - clampedLeft < minOpeningSize ||
        clampedTop - clampedBottom < minOpeningSize
      ) {
        continue;
      }

      const toWorld = (localX, localY) =>
        frame.center
          .clone()
          .addScaledVector(frame.wallDirection, localX)
          .addScaledVector(frame.wallUp, localY)
          .addScaledVector(frame.wallNormal, outlineOffset);

      const p1 = toWorld(clampedLeft, clampedBottom);
      const p2 = toWorld(clampedRight, clampedBottom);
      const p3 = toWorld(clampedRight, clampedTop);
      const p4 = toWorld(clampedLeft, clampedTop);
      const points = [p1, p2, p3, p4, p1];
      points.forEach((p) => modelBounds.expandByPoint(p));

      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const openingLine = new THREE.Line(geometry, lineMaterial);
      openingLine.renderOrder = 20;
      openingLine.userData = {
        elementType: 'Wall',
        openingId: opening.id,
        hostElementId: String(wallId),
        modelSource,
        isOpeningOutline: true,
        isLine: true,
      };
      group.add(openingLine);
    }
  };

  for (const item of matchedItems) drawForItem(item, 'matched');
  for (const item of onlyAItems) drawForItem(item, 'A');
  for (const item of onlyBItems) drawForItem(item, 'B');
}

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
  // 継手は特殊な要素で、梁・柱に関連付けられている
  // solid表示モードの場合のみ継手プレートを描画

  // モデルコンテキストを取得
  const { modelADocument, modelBDocument } = getModelContext();

  if (!modelADocument && !modelBDocument) {
    return;
  }

  const group = elementGroups['Joint'];
  if (!group) {
    return;
  }

  // 既存のラベルを削除
  removeLabelsForElementType('Joint');
  group.clear();

  // グループを可視状態に設定（初期レンダリング時にfalseになっている可能性があるため）
  group.visible = true;

  const viewMode = displayModeManager.getDisplayMode('Joint');
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
    log.debug(
      `[redrawJointsForViewMode] stbDataA: girders=${stbDataA.girderElements?.length || 0}, beams=${stbDataA.beamElements?.length || 0}, jointElements=${stbDataA.jointElements?.size || 0}`,
    );

    // Girder要素から継手情報を持つものを抽出
    for (const girder of stbDataA.girderElements || []) {
      if (girder.joint_id_start || girder.joint_id_end) {
        log.debug(
          `[redrawJointsForViewMode] Found jointed girder: id=${girder.id}, joint_id_start=${girder.joint_id_start}, joint_id_end=${girder.joint_id_end}`,
        );
        jointedElementsA.push({ ...girder, elementType: 'Girder' });
      }
    }
    // Beam要素から継手情報を持つものを抽出
    for (const beam of stbDataA.beamElements || []) {
      if (beam.joint_id_start || beam.joint_id_end) {
        log.debug(
          `[redrawJointsForViewMode] Found jointed beam: id=${beam.id}, joint_id_start=${beam.joint_id_start}, joint_id_end=${beam.joint_id_end}`,
        );
        jointedElementsA.push({ ...beam, elementType: 'Beam' });
      }
    }
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
  if (stbDataA && jointedElementsA.length > 0) {
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
    meshes.forEach((mesh) => {
      mesh.userData.modelSource = 'A';
      group.add(mesh);
    });
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

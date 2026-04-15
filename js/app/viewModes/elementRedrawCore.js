/**
 * @fileoverview 要素再描画コア処理
 *
 * ソリッドモード・ラインモードの共通ヘルパー関数と
 * メイン再描画オーケストレーターを提供します。
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
  generateLabelText,
} from '../../viewer/index.js';
import { eventBus, LabelEvents } from '../../data/events/index.js';
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
import { createWallLookup, drawWallOpeningOutlines } from './elementRedrawWalls.js';

// ロガー
const log = createLogger('elementRedrawer');

function isWallElementType(elementType) {
  return elementType === 'Wall' || elementType === 'ShearWall';
}

function applyElementFilter(config, elements) {
  if (!Array.isArray(elements)) {
    return [];
  }
  if (typeof config?.elementFilter === 'function') {
    return config.elementFilter(elements);
  }
  return elements;
}

function getOpeningElementsForType(elementType, stbData) {
  return isWallElementType(elementType) ? stbData?.openingElements || null : null;
}

function getFilteredStbElements(stbData, config) {
  return applyElementFilter(config, stbData?.[config.elementsKey] || []);
}

// ============================================================================
// ソリッドモード ヘルパー関数
// ============================================================================

/*
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
  sectionsKey,
) {
  const generator = generatorInfo.class;
  const generatorMethod = generatorInfo.method;
  const openingElementsA = getOpeningElementsForType(elementType, stbDataA);
  const openingElementsB = getOpeningElementsForType(elementType, stbDataB);

  /**
   * 指定カテゴリのマッチ済みアイテムからメッシュを生成してグループに追加する
   * @param {string} category - COMPARISON_CATEGORY の値
   * @param {string} attributeState - 'matched' または 'mismatch'
   */
  function addMatchedMeshes(category, attributeState) {
    const items = comparisonResult[category] || [];
    if (items.length === 0) return;
    const elements = items.map((m) => m.dataA.element);
    const meshes = generator[generatorMethod](
      elements,
      stbDataA.nodes,
      stbDataA[sectionsKey],
      stbDataA.steelSections,
      elementType,
      false,
      openingElementsA,
    );
    const pairs = new Map(items.map((pair) => [pair.dataA.element.id, pair.dataB.element.id]));
    meshes.forEach((mesh) => {
      mesh.userData.modelSource = 'matched';
      mesh.userData.category = category;
      mesh.userData.positionState = 'exact';
      mesh.userData.attributeState = attributeState;
      const elementIdA = mesh.userData.elementId;
      const elementIdB = pairs.get(elementIdA);
      if (elementIdB) {
        mesh.userData.elementIdA = elementIdA;
        mesh.userData.elementIdB = elementIdB;
      }
      group.add(mesh);
    });
  }

  /**
   * 片方モデルのみの要素からメッシュを生成してグループに追加する
   * @param {'A'|'B'} modelSource - モデルの識別子
   * @param {Object} stbData - 対応するモデルのパース済みデータ
   * @param {Array|null} openingElements - 開口要素（Wall用）
   */
  function addOnlyModelMeshes(modelSource, stbData, openingElements) {
    const onlyItems = comparisonResult[`only${modelSource}`];
    if (!onlyItems || onlyItems.length === 0) return;
    const elements = onlyItems.map((d) => d.element);
    const meshes = generator[generatorMethod](
      elements,
      stbData.nodes,
      stbData[sectionsKey],
      stbData.steelSections,
      elementType,
      false,
      openingElements,
    );
    meshes.forEach((mesh) => {
      mesh.userData.modelSource = modelSource;
      group.add(mesh);
    });
  }

  // EXACT要素（位置完全一致 + 属性一致）のメッシュを生成
  addMatchedMeshes(COMPARISON_CATEGORY.EXACT, 'matched');

  // ATTRIBUTE_MISMATCH要素（位置一致、属性が異なる）のメッシュを生成
  addMatchedMeshes(COMPARISON_CATEGORY.ATTRIBUTE_MISMATCH, 'mismatch');

  // モデルAのみ / モデルBのみの要素のメッシュを生成
  addOnlyModelMeshes('A', stbDataA, openingElementsA);
  addOnlyModelMeshes('B', stbDataB, openingElementsB);
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
  eventBus.emit(LabelEvents.ADD_LABELS, allLabels);
}

/*
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
  config,
  elementType,
  sectionsKey,
) {
  const generator = generatorInfo.class;
  const generatorMethod = generatorInfo.method;
  const filteredElements = getFilteredStbElements(stbData, config);

  const meshes = generator[generatorMethod](
    filteredElements,
    stbData.nodes,
    stbData[sectionsKey],
    stbData.steelSections,
    elementType,
    false,
    getOpeningElementsForType(elementType, stbData),
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
      filteredElements,
      stbData.nodes,
      elementType,
      modelSource,
    );
    log.debug(`[redraw${elementType}ForViewMode] solid mode - created ${labels.length} labels`);
    labels.forEach((label) => group.add(label));
    eventBus.emit(LabelEvents.ADD_LABELS, labels);
  }
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

  const elementsA = applyElementFilter(config, parseElements(modelADocument, stbTagName));
  const elementsB = applyElementFilter(config, parseElements(modelBDocument, stbTagName));

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
  if (isWallElementType(elementType)) {
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
      createWallLookup(applyElementFilter(config, stbDataA?.wallElements || [])),
      createWallLookup(applyElementFilter(config, stbDataB?.wallElements || [])),
      stbDataA?.openingElements || null,
      stbDataB?.openingElements || null,
      elementType,
    );
  }

  if (createdLabels && createdLabels.length > 0) {
    log.debug(
      `[redraw${elementType}ForViewMode] poly mode - created ${createdLabels.length} labels`,
    );
    eventBus.emit(LabelEvents.ADD_LABELS, createdLabels);
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

  const elementsA = applyElementFilter(config, parseElements(modelADocument, stbTagName));
  const elementsB = applyElementFilter(config, parseElements(modelBDocument, stbTagName));
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
    eventBus.emit(LabelEvents.ADD_LABELS, createdLabels);
  } else {
    log.debug(`[redraw${elementType}ForViewMode] line mode - no labels created`);
  }
}

/*
 * ソリッドモードでの比較を実行し、正規化された比較結果を返す
 * @param {Object} config - 要素設定
 * @param {Object} stbDataA - モデルAのパース済みデータ
 * @param {Object} stbDataB - モデルBのパース済みデータ
 * @param {string} elementType - 要素タイプ
 * @param {string} elementsKey - stbDataのキー名
 * @returns {Object} 正規化済み比較結果
 * @private
 */
function runSolidModeComparison(config, stbDataA, stbDataB, elementType) {
  const { nodeStartAttr, nodeEndAttr } = config;
  const comparisonKeyType = comparisonKeyManager.getKeyType();
  const elementsA = getFilteredStbElements(stbDataA, config);
  const elementsB = getFilteredStbElements(stbDataB, config);

  // 要素タイプに応じたキー抽出関数を選択し、元のJSオブジェクトを保持するラッパーで包む
  let baseExtractor;
  if (
    elementType === 'Slab' ||
    isWallElementType(elementType) ||
    elementType === 'FrameDampingDevice'
  ) {
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
    elementsA,
    elementsB,
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
 * @param {boolean} applyColorMode - ソリッド描画後にカラーモードを適用するか（デフォルト: true）
 * @private
 */
export function redrawElementForViewMode(
  config,
  scheduleRender,
  updateLabelsAfter = true,
  applyColorMode = true,
) {
  const { elementType, sectionsKey, nodeEndAttr } = config;

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
  eventBus.emit(LabelEvents.REMOVE_BY_TYPE, elementType);
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
      const comparisonResult = runSolidModeComparison(config, stbDataA, stbDataB, elementType);
      createSolidModeMeshes(
        comparisonResult,
        stbDataA,
        stbDataB,
        group,
        generatorInfo,
        elementType,
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
          config,
          elementType,
          sectionsKey,
        );
      }
    }

    if (applyColorMode) {
      import('../../colorModes/index.js')
        .then(({ updateElementsForColorMode }) => {
          updateElementsForColorMode();
        })
        .catch((err) => {
          log.error('Failed to update colors for solid mode:', err);
        });
    }
  } else {
    // 線表示 / パネル表示
    if (isWallElementType(elementType) || elementType === 'Slab') {
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
      eventBus.emit(LabelEvents.UPDATE_VISIBILITY);
      if (scheduleRender) scheduleRender();
    }, UI_TIMING.VIEW_MODE_UPDATE_DELAY_MS);
  }
}

// ============================================================================
// ラベル作成ヘルパー
// ============================================================================

/**
 * 立体表示要素用のラベルを作成する（modelSource付き）
 * @param {Array} elements - 要素配列
 * @param {Map} nodes - 節点マップ
 * @param {string} elementType - 要素タイプ
 * @param {string} modelSource - モデルソース（'matched', 'A', 'B'）
 * @returns {Array} 作成されたラベルスプライトの配列
 */
export function createLabelsForSolidElementsWithSource(elements, nodes, elementType, modelSource) {
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
    } else if (
      elementType === 'Brace' ||
      elementType === 'Pile' ||
      elementType === 'IsolatingDevice' ||
      elementType === 'DampingDevice'
    ) {
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
        // level_bottom はノードZからの相対オフセット
        const levelBottom = element.level_bottom || 0;
        centerPosition = new THREE.Vector3(node.x, node.y, node.z + levelBottom);
      }
    } else if (
      elementType === 'Slab' ||
      isWallElementType(elementType) ||
      elementType === 'FrameDampingDevice'
    ) {
      // 面要素は複数ノード要素 - ノード位置の中心を使用
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
      sprite.userData.originalElement = element;
      labels.push(sprite);
    }
  }

  return labels;
}

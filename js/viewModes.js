/**
 * @fileoverview 表示モード管理モジュール
 *
 * このファイルは、モデル表示に関する様々なモードと状態を管理します:
 * - 要素(柱、梁など)の表示形式(ライン/ソリッド)の切り替え
 * - モデルA/Bの表示/非表示の制御
 * - 表示モードに応じた要素の再描画処理
 * - モデル表示状態の更新と管理
 * - UI要素との連携によるモード切り替え
 *
 * 本モジュールは、STBモデルの視覚的表現方法を動的に変更するための
 * 状態管理とレンダリング制御を行います。
 */

import * as THREE from 'three';
import { createLogger } from './utils/logger.js';
import { materials, elementGroups, SUPPORTED_ELEMENTS } from './viewer/index.js';
// ジオメトリジェネレータファクトリー（統一インターフェース）
import {
  geometryGeneratorFactory,
  JointGenerator,
} from './viewer/geometry/GeometryGeneratorFactory.js';
import { parseElements } from './common-stb/parser/stbXmlParser.js';
import {
  parseStbFile,
  setStateProvider,
  clearParseCache,
} from './viewer/geometry/stbStructureReader.js';
import { setState, getState } from './app/globalState.js';
import { compareElements, lineElementKeyExtractor, polyElementKeyExtractor } from './comparator.js';
import { drawLineElements, drawPolyElements } from './viewer/index.js';
import { updateLabelVisibility } from './ui/unifiedLabelManager.js';
import { removeLabelsForElementType, addLabelsToGlobalState } from './ui.js';
import { createLabelSprite } from './viewer/ui/labels.js';
import { generateLabelText } from './ui/unifiedLabelManager.js';
import { attachElementDataToLabel } from './ui/labelRegeneration.js';
// 表示モード管理
import displayModeManager from './viewer/rendering/displayModeManager.js';
import labelDisplayManager from './viewer/rendering/labelDisplayManager.js';
import modelVisibilityManager from './viewer/rendering/modelVisibilityManager.js';
// カメラ管理（静的インポート）
import { setCameraMode } from './viewer/camera/cameraManagerImpl.js';
import { CAMERA_MODES } from './constants/displayModes.js';
import { setView } from './viewer/camera/viewManagerImpl.js';
// 2Dクリッピング管理
import { updateDepth2DClippingVisibility } from './ui/clipping2DImpl.js';
import { setStbExportPanelVisibility, updateStbExportStatus } from './dxfLoader.js';
// 設定ファイル
import { VIEW_MODE_CHECKBOX_IDS } from './config/uiElementConfig.js';
import { COORDINATE_PRECISION } from './config/geometryConfig.js';
import { UI_TIMING } from './config/uiTimingConfig.js';
import { getElementRedrawConfig } from './config/elementRedrawConfig.js';
// イベント処理
import { redrawAxesAtStory } from './ui/events/index.js';
// 色付けモード管理（静的インポート - 表示モード変更時の色適用同期化のため）
import { updateElementsForColorMode } from './colorModes/index.js';

// ロガー
const log = createLogger('viewModes');

// stbStructureReaderに状態プロバイダーを設定（依存性注入）
setStateProvider({ setState });

// モデル情報の参照
let modelBounds = null;
let modelADocument = null;
let modelBDocument = null;
let nodeMapA = null;
let nodeMapB = null;

/**
 * 状態管理モジュールを初期化
 * @param {Object} modelData - モデルデータ参照
 */
export function initViewModes(modelData) {
  // 新しいモデルが設定される前にパースキャッシュをクリア
  clearParseCache();

  modelBounds = modelData.modelBounds;
  modelADocument = modelData.modelADocument;
  modelBDocument = modelData.modelBDocument;
  nodeMapA = modelData.nodeMapA;
  nodeMapB = modelData.nodeMapB;

  // UIのチェックボックスの状態を読み取り、displayModeManagerに反映
  syncDisplayModeFromUI();

  // 立体表示モードの要素を再描画（初期ロード時は線分表示で描画されるため）
  applyInitialDisplayModes();
}

/**
 * UIのチェックボックスの状態をdisplayModeManagerに同期
 * @private
 */
function syncDisplayModeFromUI() {
  // 設定ファイルから要素タイプとチェックボックスIDのマッピングを使用
  Object.entries(VIEW_MODE_CHECKBOX_IDS).forEach(([type, id]) => {
    const checkbox = document.getElementById(id);
    if (checkbox) {
      // チェックされていれば'solid'、そうでなければ'line'
      const mode = checkbox.checked ? 'solid' : 'line';
      displayModeManager.setDisplayMode(type, mode);
      log.debug(`Synced ${type} display mode from UI: ${mode}`);
    }
  });
}

/**
 * 初期ロード時の表示モードを適用
 * 立体表示モードの要素を再描画する（初期ロードは線分表示で描画されるため）
 * @private
 */
function applyInitialDisplayModes() {
  console.log('[DEBUG] applyInitialDisplayModes called');
  log.debug('[applyInitialDisplayModes] Applying initial display modes');

  // 各要素タイプの立体表示状態を確認
  // Slab/Wallは常に再描画（renderingOrchestratorでスキップされるため）
  // Slab/Wallは常に再描画（renderingOrchestratorでスキップされるため）
  const needsRedraw = {
    Column: displayModeManager.getDisplayMode('Column') === 'solid',
    Post: displayModeManager.getDisplayMode('Post') === 'solid',
    Beam:
      displayModeManager.getDisplayMode('Beam') === 'solid' ||
      displayModeManager.getDisplayMode('Girder') === 'solid',
    Brace: displayModeManager.getDisplayMode('Brace') === 'solid',
    Pile: displayModeManager.getDisplayMode('Pile') === 'solid',
    Footing: displayModeManager.getDisplayMode('Footing') === 'solid',
    FoundationColumn: displayModeManager.getDisplayMode('FoundationColumn') === 'solid',
    Slab: true, // 常に再描画（renderingOrchestratorでスキップされる）
    Wall: true, // 常に再描画（renderingOrchestratorでスキップされる）
    Parapet: displayModeManager.getDisplayMode('Parapet') === 'solid',
    Joint: displayModeManager.getDisplayMode('Joint') === 'solid', // 継手（初期状態で空）
  };

  // 再描画が必要な要素をカウント
  const redrawCount = Object.values(needsRedraw).filter(Boolean).length;

  if (redrawCount === 0) {
    log.debug('[applyInitialDisplayModes] No elements need redrawing (all in line mode)');
    return;
  }

  log.info(`[applyInitialDisplayModes] Redrawing ${redrawCount} element type(s) in solid mode`);

  // 立体表示の要素を再描画（scheduleRenderはnullでOK、後でまとめてレンダリングされる）
  if (needsRedraw.Column) {
    log.debug('[applyInitialDisplayModes] Redrawing Column in solid mode');
    redrawColumnsForViewMode(null);
  }
  if (needsRedraw.Post) {
    log.debug('[applyInitialDisplayModes] Redrawing Post in solid mode');
    redrawPostsForViewMode(null);
  }
  if (needsRedraw.Beam) {
    log.debug('[applyInitialDisplayModes] Redrawing Beam/Girder in solid mode');
    redrawBeamsForViewMode(null);
  }
  if (needsRedraw.Brace) {
    log.debug('[applyInitialDisplayModes] Redrawing Brace in solid mode');
    redrawBracesForViewMode(null);
  }
  if (needsRedraw.Pile) {
    log.debug('[applyInitialDisplayModes] Redrawing Pile in solid mode');
    redrawPilesForViewMode(null);
  }
  if (needsRedraw.Footing) {
    log.debug('[applyInitialDisplayModes] Redrawing Footing in solid mode');
    redrawFootingsForViewMode(null);
  }
  if (needsRedraw.FoundationColumn) {
    log.debug('[applyInitialDisplayModes] Redrawing FoundationColumn in solid mode');
    redrawFoundationColumnsForViewMode(null);
  }
  if (needsRedraw.Slab) {
    log.debug('[applyInitialDisplayModes] Redrawing Slab in solid mode');
    redrawSlabsForViewMode(null);
  }
  if (needsRedraw.Wall) {
    log.debug('[applyInitialDisplayModes] Redrawing Wall in solid mode');
    redrawWallsForViewMode(null);
  }
  if (needsRedraw.Parapet) {
    log.debug('[applyInitialDisplayModes] Redrawing Parapet in solid mode');
    redrawParapetsForViewMode(null);
  }
  console.log('[DEBUG] needsRedraw.Joint:', needsRedraw.Joint);
  if (needsRedraw.Joint) {
    console.log('[DEBUG] Calling redrawJointsForViewMode');
    log.debug('[applyInitialDisplayModes] Redrawing Joint in solid mode');
    redrawJointsForViewMode(null);
  }

  // Undefined要素は常にライン表示（renderingOrchestratorで空で返される）
  // 初期レンダリング後にここで描画
  log.debug('[applyInitialDisplayModes] Redrawing Undefined elements (always line mode)');
  redrawUndefinedElementsForViewMode(null);
}

/**
 * 要素タイプと再描画関数のマッピング
 * @private
 */
const ELEMENT_REDRAW_FUNCTIONS = {
  Column: () => redrawColumnsForViewMode,
  Post: () => redrawPostsForViewMode,
  Girder: () => redrawBeamsForViewMode,
  Beam: () => redrawBeamsForViewMode,
  Brace: () => redrawBracesForViewMode,
  Pile: () => redrawPilesForViewMode,
  Footing: () => redrawFootingsForViewMode,
  StripFooting: () => redrawStripFootingsForViewMode,
  FoundationColumn: () => redrawFoundationColumnsForViewMode,
  Slab: () => redrawSlabsForViewMode,
  Wall: () => redrawWallsForViewMode,
  Parapet: () => redrawParapetsForViewMode,
  Joint: () => redrawJointsForViewMode,
  Undefined: () => redrawUndefinedElementsForViewMode,
};

/**
 * 汎用: 要素の表示モードを設定
 * @param {string} elementType - 要素タイプ（"Column", "Beam"等）
 * @param {string} mode - "line" または "solid"
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setElementViewMode(elementType, mode, scheduleRender) {
  if (mode !== 'line' && mode !== 'solid') return;

  // common/viewerモードの場合はアダプター経由で表示モード設定
  const useCommonViewer = getState('viewer.useCommonViewer');
  const adapter = getState('viewer.adapter');

  if (useCommonViewer && adapter) {
    adapter.setDisplayMode(elementType, mode);
    return;
  }

  // 通常モード
  displayModeManager.setDisplayMode(elementType, mode);
  const redrawFn = ELEMENT_REDRAW_FUNCTIONS[elementType];
  if (redrawFn) {
    redrawFn()(scheduleRender);
  }
}

/**
 * 柱の表示モードを設定
 * @param {string} mode - "line" または "solid"
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setColumnViewMode(mode, scheduleRender) {
  setElementViewMode('Column', mode, scheduleRender);
}

/**
 * 間柱の表示モードを設定
 * @param {string} mode - "line" または "solid"
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setPostViewMode(mode, scheduleRender) {
  setElementViewMode('Post', mode, scheduleRender);
}

/**
 * 梁の表示モードを設定
 * @param {string} mode - "line" または "solid"
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setBeamViewMode(mode, scheduleRender) {
  setElementViewMode('Beam', mode, scheduleRender);
}

/**
 * ブレースの表示モードを設定
 * @param {string} mode - "line" または "solid"
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setBraceViewMode(mode, scheduleRender) {
  setElementViewMode('Brace', mode, scheduleRender);
}

/**
 * 杭の表示モードを設定
 * @param {string} mode - "line" または "solid"
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setPileViewMode(mode, scheduleRender) {
  setElementViewMode('Pile', mode, scheduleRender);
}

/**
 * 基礎の表示モードを設定
 * @param {string} mode - "line" または "solid"
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setFootingViewMode(mode, scheduleRender) {
  setElementViewMode('Footing', mode, scheduleRender);
}

/**
 * 基礎柱の表示モードを設定
 * @param {string} mode - "line" または "solid"
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setFoundationColumnViewMode(mode, scheduleRender) {
  setElementViewMode('FoundationColumn', mode, scheduleRender);
}

/**
 * モデルの表示状態を設定
 * @param {string} model - "A" または "B"
 * @param {boolean} visible - 表示状態
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setModelVisibility(model, visible, scheduleRender) {
  // common/viewerモードの場合はアダプター経由で表示設定
  const useCommonViewer = getState('viewer.useCommonViewer');
  const adapter = getState('viewer.adapter');

  if (useCommonViewer && adapter) {
    adapter.setModelVisibility(model, visible);
    return;
  }

  // 通常モード
  const success = modelVisibilityManager.setModelVisibility(model, visible);
  if (success) {
    updateModelVisibility(scheduleRender);
  }
}

/**
 * モデルの表示状態を取得
 * @param {string} model - "A" または "B"
 * @returns {boolean} 現在の表示状態
 */
export function getModelVisibility(model) {
  return modelVisibilityManager.isModelVisible(model);
}

/**
 * 共通: 要素の再描画処理
 * @param {Object} config - 設定オブジェクト
 * @param {string} config.elementType - 要素タイプ（"Column", "Beam"等）
 * @param {string} config.stbTagName - STBタグ名（"StbColumn", "StbGirder"等）
 * @param {string} config.nodeStartAttr - 始点ノード属性名
 * @param {string} config.nodeEndAttr - 終点ノード属性名
 * @param {Object} config.generator - ProfileBased生成器
 * @param {string} config.generatorMethod - 生成器メソッド名（"createColumnMeshes"等）
 * @param {string} config.elementsKey - stbDataのキー名（"columnElements"等）
 * @param {string} config.sectionsKey - stbDataのキー名（"columnSections"等）
 * @param {Function} scheduleRender - 再描画要求関数
 * @param {boolean} updateLabelsAfter - 再描画後にラベル更新を実行するか（デフォルト: true）
 * @private
 */
function redrawElementForViewMode(config, scheduleRender, updateLabelsAfter = true) {
  const {
    elementType,
    stbTagName,
    nodeStartAttr,
    nodeEndAttr,
    generator,
    generatorMethod,
    elementsKey,
    sectionsKey,
  } = config;

  // 必要なデータが揃っているかチェック
  if (!modelADocument && !modelBDocument) return;

  // どちらか一方のモデルを使う（A優先）
  const doc = modelADocument || modelBDocument;
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
      // 要素を比較して差分を検出
      const comparisonResult = compareSolidElements(
        stbDataA[elementsKey] || [],
        stbDataB[elementsKey] || [],
        stbDataA.nodes,
        stbDataB.nodes,
        nodeStartAttr,
        nodeEndAttr,
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
        const matchedElements = comparisonResult.matched.map((m) => m.elementA);
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
          matchedPairs.set(pair.elementA.id, pair.elementB.id);
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
        const mismatchElements = comparisonResult.mismatch.map((m) => m.elementA);
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
          mismatchPairs.set(pair.elementA.id, pair.elementB.id);
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
        const onlyAMeshes = generator[generatorMethod](
          comparisonResult.onlyA,
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
        const onlyBMeshes = generator[generatorMethod](
          comparisonResult.onlyB,
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
          comparisonResult.matched.map((m) => m.elementA),
          stbDataA.nodes,
          elementType,
          'matched',
        );
        // 不一致要素のラベル
        const mismatchLabels = createLabelsForSolidElementsWithSource(
          comparisonResult.mismatch.map((m) => m.elementA),
          stbDataA.nodes,
          elementType,
          'mismatch',
        );
        // モデルAのみの要素のラベル
        const onlyALabels = createLabelsForSolidElementsWithSource(
          comparisonResult.onlyA,
          stbDataA.nodes,
          elementType,
          'A',
        );
        // モデルBのみの要素のラベル
        const onlyBLabels = createLabelsForSolidElementsWithSource(
          comparisonResult.onlyB,
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

    // 生成されたメッシュに現在のカラーモードを適用（同期的に実行）
    try {
      updateElementsForColorMode();
    } catch (err) {
      console.error('Failed to update colors for solid mode:', err);
    }
  } else {
    // 線表示 / パネル表示

    // ポリゴン要素（Wall, Slab）の場合はdrawPolyElementsを使用
    if (elementType === 'Wall' || elementType === 'Slab') {
      const elementsA = parseElements(modelADocument, stbTagName);
      const elementsB = parseElements(modelBDocument, stbTagName);

      const comparisonResult = compareElements(elementsA, elementsB, nodeMapA, nodeMapB, (el, nm) =>
        polyElementKeyExtractor(el, nm, 'StbNodeIdOrder'),
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
      const comparisonResult = compareElements(elementsA, elementsB, nodeMapA, nodeMapB, (el, nm) =>
        lineElementKeyExtractor(el, nm, nodeStartAttr, nodeEndAttr),
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
 * 立体表示要素用のラベルを作成する
 * @param {Array} elements - 要素配列
 * @param {Map} nodes - 節点マップ
 * @param {string} elementType - 要素タイプ
 * @returns {Array} 作成されたラベルスプライトの配列
 */
function createLabelsForSolidElements(elements, nodes, elementType) {
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
    } else {
      continue;
    }

    if (!centerPosition) continue;

    // ラベルスプライトを作成（グループは後で追加するため、nullを渡す）
    const sprite = createLabelSprite(labelText, centerPosition, null, elementType);
    if (sprite) {
      sprite.userData.elementId = element.id;
      sprite.userData.modelSource = 'solid'; // 立体表示由来のラベル
      sprite.userData.elementType = elementType;

      // 要素データを保存して再生成時に使用
      attachElementDataToLabel(sprite, element);
      labels.push(sprite);
    }
  }

  return labels;
}

/**
 * 立体表示用の要素比較関数
 * 2つのモデルの要素をノード位置ベースで比較し、matched/mismatch/onlyA/onlyBに分類する
 *
 * @param {Array} elementsA - モデルAの要素配列
 * @param {Array} elementsB - モデルBの要素配列
 * @param {Map} nodesA - モデルAのノードマップ
 * @param {Map} nodesB - モデルBのノードマップ
 * @param {string} nodeStartAttr - 始点ノード属性名
 * @param {string} nodeEndAttr - 終点ノード属性名（1ノード要素の場合はnull）
 * @returns {{matched: Array<{elementA, elementB}>, mismatch: Array<{elementA, elementB}>, onlyA: Array, onlyB: Array}}
 */
function compareSolidElements(elementsA, elementsB, nodesA, nodesB, nodeStartAttr, nodeEndAttr) {
  // 座標比較時の精度（共有定数を使用）
  const PRECISION = COORDINATE_PRECISION;

  /**
   * 座標からキー文字列を生成
   * @param {THREE.Vector3|{x,y,z}} coords - 座標
   * @returns {string|null}
   */
  function getCoordKey(coords) {
    if (!coords) return null;
    const x = typeof coords.x === 'number' ? coords.x : coords.x;
    const y = typeof coords.y === 'number' ? coords.y : coords.y;
    const z = typeof coords.z === 'number' ? coords.z : coords.z;
    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
      return null;
    }
    return `${x.toFixed(PRECISION)},${y.toFixed(PRECISION)},${z.toFixed(PRECISION)}`;
  }

  /**
   * 要素からキーを生成
   * @param {Object} element - 要素
   * @param {Map} nodes - ノードマップ
   * @returns {string|null}
   */
  function getElementKey(element, nodes) {
    // 多角形要素（複数ノード要素: Slab, Wall）のチェック
    if (element.node_ids && Array.isArray(element.node_ids) && element.node_ids.length >= 3) {
      const nodeCoords = [];
      for (const nodeId of element.node_ids) {
        const node = nodes.get(nodeId);
        const coordKey = getCoordKey(node);
        if (!coordKey) return null;
        nodeCoords.push(coordKey);
      }
      // 順序に依存しないキー（ソート済み）
      return `poly:${nodeCoords.sort().join('|')}`;
    }

    if (nodeEndAttr === null) {
      // 1ノード要素（基礎など）
      const nodeId = element.id_node;
      const node = nodes.get(nodeId);
      return getCoordKey(node);
    }

    // 2ノード要素
    const startNodeId = element[nodeStartAttr];
    const endNodeId = element[nodeEndAttr];

    // 杭の1ノード形式の場合（id_node + level_top）
    if (!startNodeId && !endNodeId && element.id_node && element.level_top !== undefined) {
      const nodeId = element.id_node;
      const node = nodes.get(nodeId);
      if (node) {
        // 1ノード形式の杭はノード位置と深度でキーを生成
        const levelTop = element.level_top;
        return `pile:${getCoordKey(node)}|depth:${levelTop.toFixed(PRECISION)}`;
      }
      return null;
    }

    const startNode = nodes.get(startNodeId);
    const endNode = nodes.get(endNodeId);

    const startKey = getCoordKey(startNode);
    const endKey = getCoordKey(endNode);

    if (!startKey || !endKey) return null;

    // 順序に依存しないキー（ソート済み）
    return [startKey, endKey].sort().join('|');
  }

  /**
   * 2つの要素の属性を比較する
   * @param {Object} elementA - モデルAの要素
   * @param {Object} elementB - モデルBの要素
   * @returns {boolean} 属性が一致すればtrue
   */
  function compareElementAttributes(elementA, elementB) {
    // 比較対象の主要属性（断面、材質、回転、オフセットなど）
    const attributesToCompare = [
      'id_sec', // 断面ID
      'kind', // 材質種別
      'rotate', // 回転角
      'offset_X', // X方向オフセット
      'offset_Y', // Y方向オフセット
      'offset_Z', // Z方向オフセット
      'level_top', // 上端レベル
      'level_bottom', // 下端レベル
      'condition_bottom', // 下端条件
      'condition_top', // 上端条件
      'joint_bottom', // 下端接合部
      'joint_top', // 上端接合部
      'haunch_H', // ハンチ高さ
      'haunch_start', // ハンチ開始
      'haunch_end', // ハンチ終了
    ];

    for (const attr of attributesToCompare) {
      const valueA = elementA[attr];
      const valueB = elementB[attr];

      // 両方とも未定義なら一致とみなす
      if (valueA === undefined && valueB === undefined) {
        continue;
      }

      // 片方だけ定義されている場合は不一致
      if (valueA === undefined || valueB === undefined) {
        return false;
      }

      // 数値の場合は小数点以下の精度で比較
      if (typeof valueA === 'number' && typeof valueB === 'number') {
        if (Math.abs(valueA - valueB) > 0.001) {
          return false;
        }
      } else {
        // その他の型は厳密比較
        if (valueA !== valueB) {
          return false;
        }
      }
    }

    return true;
  }

  const keysA = new Map();
  const keysB = new Map();
  const result = {
    matched: [],
    mismatch: [],
    onlyA: [],
    onlyB: [],
  };

  // モデルAの要素をキーでマッピング
  for (const element of elementsA) {
    const key = getElementKey(element, nodesA);
    if (key) {
      keysA.set(key, element);
    }
  }

  // モデルBの要素をキーでマッピング
  for (const element of elementsB) {
    const key = getElementKey(element, nodesB);
    if (key) {
      keysB.set(key, element);
    }
  }

  // マッチングを実行
  for (const [key, elementA] of keysA.entries()) {
    if (keysB.has(key)) {
      const elementB = keysB.get(key);

      // 属性を比較して、一致/不一致を判定
      if (compareElementAttributes(elementA, elementB)) {
        result.matched.push({
          elementA: elementA,
          elementB: elementB,
        });
      } else {
        result.mismatch.push({
          elementA: elementA,
          elementB: elementB,
        });
      }
      keysB.delete(key);
    } else {
      result.onlyA.push(elementA);
    }
  }

  // モデルBのみの要素
  for (const elementB of keysB.values()) {
    result.onlyB.push(elementB);
  }

  return result;
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
        console.log('[DEBUG] Found jointed girder:', girder.id, girder.joint_id_start, girder.joint_id_end);
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

  // 継手メッシュを生成
  console.log('[DEBUG] Creating joint meshes, jointedElementsA:', jointedElementsA.length);
  if (stbDataA && jointedElementsA.length > 0) {
    console.log('[DEBUG] Calling JointGenerator.createJointMeshes with:', {
      jointedElements: jointedElementsA.length,
      nodes: stbDataA.nodes?.size || 0,
      jointElements: stbDataA.jointElements?.size || 0,
    });
    const meshes = JointGenerator.createJointMeshes(
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
    const meshes = JointGenerator.createJointMeshes(
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

  // カラーモード適用
  import('./colorModes/index.js')
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

  // カラーモード適用
  import('./colorModes/index.js')
    .then(({ updateElementsForColorMode }) => {
      updateElementsForColorMode();
    })
    .catch((err) => {
      console.error('Failed to update colors for undefined elements:', err);
    });

  if (scheduleRender) scheduleRender();
}

/**
 * モデル表示状態に基づいてオブジェクトの表示/非表示を更新
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function updateModelVisibility(scheduleRender) {
  log.debug(
    `Updating model visibility: A=${modelVisibilityManager.isModelVisible(
      'A',
    )}, B=${modelVisibilityManager.isModelVisible('B')}`,
  );

  SUPPORTED_ELEMENTS.forEach((elementType) => {
    const group = elementGroups[elementType];
    if (group) {
      group.children.forEach((child) => {
        if (child.userData && child.userData.modelSource) {
          const source = child.userData.modelSource;
          let shouldBeVisible = false;
          if (source === 'A' && modelVisibilityManager.isModelVisible('A')) {
            shouldBeVisible = true;
          } else if (source === 'B' && modelVisibilityManager.isModelVisible('B')) {
            shouldBeVisible = true;
          } else if (
            source === 'matched' &&
            (modelVisibilityManager.isModelVisible('A') ||
              modelVisibilityManager.isModelVisible('B'))
          ) {
            // matched はどちらかのモデルが表示されていれば表示
            shouldBeVisible = true;
          } else if (
            source === 'mismatch' &&
            (modelVisibilityManager.isModelVisible('A') ||
              modelVisibilityManager.isModelVisible('B'))
          ) {
            // mismatch はどちらかのモデルが表示されていれば表示
            shouldBeVisible = true;
          }
          // 要素タイプ自体の表示状態も考慮する
          const elementCheckbox = document.querySelector(
            `#elementSelector input[name="elements"][value="${elementType}"]`,
          );
          const isElementTypeVisible = elementCheckbox ? elementCheckbox.checked : false;

          child.visible = shouldBeVisible && isElementTypeVisible;
        } else if (elementType === 'Axis' || elementType === 'Story') {
          // 軸と階はモデルA/Bに依存しないが、要素タイプのチェックボックスには従う
          const elementCheckbox = document.querySelector(
            `#elementSelector input[name="elements"][value="${elementType}"]`,
          );
          const isElementTypeVisible = elementCheckbox ? elementCheckbox.checked : false;
          child.visible = isElementTypeVisible;
        }
      });
    }
  });

  // ラベルの表示状態も更新
  updateLabelVisibility();

  // 再描画を要求
  if (scheduleRender) scheduleRender();
}

/**
 * 表示モード関連のイベントリスナーを設定
 * ファクトリーパターンを使用して、要素タイプ別のリスナーを統一
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setupViewModeListeners(scheduleRender) {
  // ==========================================================================
  // 立体/線表示モード切替リスナー（VIEW_MODE_CHECKBOX_IDSを使用した統一ループ）
  // ==========================================================================
  Object.entries(VIEW_MODE_CHECKBOX_IDS).forEach(([elementType, checkboxId]) => {
    const checkbox = document.getElementById(checkboxId);
    if (!checkbox) return;

    checkbox.addEventListener('change', function () {
      const mode = this.checked ? 'solid' : 'line';
      displayModeManager.setDisplayMode(elementType, mode);

      // Beam/Girderは特殊ケース（redrawBeamsForViewModeで両方処理）
      if (elementType === 'Beam' || elementType === 'Girder') {
        redrawBeamsForViewMode(scheduleRender);
      } else if (elementType === 'Joint') {
        redrawJointsForViewMode(scheduleRender);
      } else {
        // ファクトリーパターンを使用した汎用再描画
        redrawElementByType(elementType, scheduleRender);
      }

      updateStbExportStatus();
      log.info(`${elementType}表示モード:`, mode);
    });
  });

  // ==========================================================================
  // 節点表示切替リスナー
  const toggleNodeViewCheckbox = document.getElementById('toggleNodeView');
  if (toggleNodeViewCheckbox) {
    toggleNodeViewCheckbox.addEventListener('change', function () {
      const nodeGroup = elementGroups['Node'];
      if (nodeGroup) {
        nodeGroup.visible = this.checked;
        log.debug('節点表示:', this.checked);
        if (scheduleRender) scheduleRender();
      }
    });
  }

  // 柱カテゴリ表示切替リスナー（立体表示チェックボックスと連動）
  const columnElementCheckbox = document.querySelector('input[name="elements"][value="Column"]');
  if (columnElementCheckbox) {
    columnElementCheckbox.addEventListener('change', function () {
      const elementGroup = elementGroups['Column'];
      const solidViewCheckbox = document.getElementById('toggleColumnView');

      if (elementGroup) {
        elementGroup.visible = this.checked;
        log.debug('柱カテゴリ表示:', this.checked);

        // カテゴリがオフの場合、立体表示チェックボックスを無効化
        if (solidViewCheckbox) {
          solidViewCheckbox.disabled = !this.checked;
        }

        if (scheduleRender) scheduleRender();
      }
    });
  }

  // 大梁カテゴリ表示切替リスナー（立体表示チェックボックスと連動）
  const girderElementCheckbox = document.querySelector('input[name="elements"][value="Girder"]');
  if (girderElementCheckbox) {
    girderElementCheckbox.addEventListener('change', function () {
      const elementGroup = elementGroups['Girder'];
      const solidViewCheckbox = document.getElementById('toggleGirderView');

      if (elementGroup) {
        elementGroup.visible = this.checked;
        log.debug('大梁カテゴリ表示:', this.checked);

        // カテゴリがオフの場合、立体表示チェックボックスを無効化
        if (solidViewCheckbox) {
          solidViewCheckbox.disabled = !this.checked;
        }

        if (scheduleRender) scheduleRender();
      }
    });
  }

  // 小梁カテゴリ表示切替リスナー（立体表示チェックボックスと連動）
  const beamElementCheckbox = document.querySelector('input[name="elements"][value="Beam"]');
  if (beamElementCheckbox) {
    beamElementCheckbox.addEventListener('change', function () {
      const elementGroup = elementGroups['Beam'];
      const solidViewCheckbox = document.getElementById('toggleBeam3DView');

      if (elementGroup) {
        elementGroup.visible = this.checked;
        log.debug('小梁カテゴリ表示:', this.checked);

        // カテゴリがオフの場合、立体表示チェックボックスを無効化
        if (solidViewCheckbox) {
          solidViewCheckbox.disabled = !this.checked;
        }

        if (scheduleRender) scheduleRender();
      }
    });
  }

  // 間柱カテゴリ表示切替リスナー（立体表示チェックボックスと連動）
  const postElementCheckbox = document.querySelector('input[name="elements"][value="Post"]');
  if (postElementCheckbox) {
    postElementCheckbox.addEventListener('change', function () {
      const elementGroup = elementGroups['Post'];
      const solidViewCheckbox = document.getElementById('togglePost3DView');

      if (elementGroup) {
        elementGroup.visible = this.checked;
        log.debug('間柱カテゴリ表示:', this.checked);

        // カテゴリがオフの場合、立体表示チェックボックスを無効化
        if (solidViewCheckbox) {
          solidViewCheckbox.disabled = !this.checked;
        }

        if (scheduleRender) scheduleRender();
      }
    });
  }

  // その他の要素タイプの表示切替リスナー（立体表示チェックボックスと連動）
  const elementToggleIds = [
    { id: 'toggleBraceView', type: 'Brace', name: 'ブレース', solidViewId: 'toggleBrace3DView' },
    { id: 'togglePileView', type: 'Pile', name: '杭', solidViewId: 'togglePile3DView' },
    { id: 'toggleFootingView', type: 'Footing', name: '基礎', solidViewId: 'toggleFooting3DView' },
    {
      id: 'toggleFoundationColumnView',
      type: 'FoundationColumn',
      name: '基礎柱',
      solidViewId: 'toggleFoundationColumn3DView',
    },
    { id: 'toggleSlabView', type: 'Slab', name: 'スラブ', solidViewId: 'toggleSlab3DView' },
    { id: 'toggleWallView', type: 'Wall', name: '壁', solidViewId: 'toggleWall3DView' },
    {
      id: 'toggleParapetView',
      type: 'Parapet',
      name: 'パラペット',
      solidViewId: 'toggleParapet3DView',
    },
    { id: 'toggleAxisView', type: 'Axis', name: '通り芯' },
    { id: 'toggleStoryView', type: 'Story', name: '階' },
  ];

  elementToggleIds.forEach(({ id, type, name, solidViewId }) => {
    const checkbox = document.getElementById(id);
    if (checkbox) {
      checkbox.addEventListener('change', function () {
        const elementGroup = elementGroups[type];
        const solidViewCheckbox = solidViewId ? document.getElementById(solidViewId) : null;

        if (elementGroup) {
          elementGroup.visible = this.checked;
          log.debug(`${name}表示:`, this.checked);

          // カテゴリがオフの場合、立体表示チェックボックスを無効化
          if (solidViewCheckbox) {
            solidViewCheckbox.disabled = !this.checked;
          }

          if (scheduleRender) scheduleRender();
        }
      });
    }
  });

  // モデル表示切り替えチェックボックスのリスナー
  const toggleModelACheckbox = document.getElementById('toggleModelA');
  if (toggleModelACheckbox) {
    toggleModelACheckbox.addEventListener('change', function () {
      modelVisibilityManager.setModelVisibility('A', this.checked);
      log.info('Model A visibility changed:', this.checked);
      updateModelVisibility(scheduleRender);
    });
  }

  const toggleModelBCheckbox = document.getElementById('toggleModelB');
  if (toggleModelBCheckbox) {
    toggleModelBCheckbox.addEventListener('change', function () {
      modelVisibilityManager.setModelVisibility('B', this.checked);
      log.info('Model B visibility changed:', this.checked);
      updateModelVisibility(scheduleRender);
    });
  }

  // ラベル表示切り替えは events.js で一元管理されるため、ここでは設定しない
  // 立体表示モードでのラベル更新は、該当する再描画関数内で処理される
}

/**
 * カメラモード関連のイベントリスナーを設定
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setupCameraModeListeners(scheduleRender) {
  log.debug('[setupCameraModeListeners] Initializing camera mode listeners');

  // カメラモード切り替え
  const cameraPerspective = document.getElementById('cameraPerspective');
  const cameraOrthographic = document.getElementById('cameraOrthographic');
  const viewDirectionPanel = document.getElementById('viewDirectionPanel');

  // ボタン形式のカメラモード切り替え（フローティングウィンドウ内）
  const cameraPerspectiveBtn = document.getElementById('cameraPerspectiveBtn');
  const cameraOrthographicBtn = document.getElementById('cameraOrthographicBtn');

  // パネル上部の常時表示ボタン
  const viewModePerspectiveBtn = document.getElementById('viewModePerspectiveBtn');
  const viewModeOrthographicBtn = document.getElementById('viewModeOrthographicBtn');
  const viewDirectionButtons = document.getElementById('viewDirectionButtons');

  // 少なくとも1組のボタンが必要
  const hasRadioButtons = cameraPerspective && cameraOrthographic;
  const hasFloatingButtons = cameraPerspectiveBtn && cameraOrthographicBtn;
  const hasPanelButtons = viewModePerspectiveBtn && viewModeOrthographicBtn;

  if (!hasRadioButtons && !hasFloatingButtons && !hasPanelButtons) {
    log.warn('[setupCameraModeListeners] No camera mode buttons found in DOM');
    return;
  }

  /**
   * すべての表示モードボタンのアクティブ状態を同期
   * @param {string} mode - 'perspective' または 'orthographic'
   */
  function syncViewModeButtons(mode) {
    const isPerspective = mode === 'perspective';

    // フローティングウィンドウ内のボタン
    if (cameraPerspectiveBtn) {
      cameraPerspectiveBtn.classList.toggle('active', isPerspective);
    }
    if (cameraOrthographicBtn) {
      cameraOrthographicBtn.classList.toggle('active', !isPerspective);
    }

    // パネル上部の常時表示ボタン
    if (viewModePerspectiveBtn) {
      viewModePerspectiveBtn.classList.toggle('active', isPerspective);
    }
    if (viewModeOrthographicBtn) {
      viewModeOrthographicBtn.classList.toggle('active', !isPerspective);
    }

    // ビュー方向ボタンの表示/非表示
    if (viewDirectionButtons) {
      viewDirectionButtons.classList.toggle('hidden', isPerspective);
    }
    if (viewDirectionPanel) {
      viewDirectionPanel.classList.toggle('hidden', isPerspective);
    }
  }

  /**
   * 3D（立体表示）モードに切り替え
   */
  function switchToPerspective() {
    log.info('カメラモード切り替え: 3D（立体表示）');
    syncViewModeButtons('perspective');
    setCameraMode(CAMERA_MODES.PERSPECTIVE);
    setOrthographicView(ORTHOGRAPHIC_VIEWS.ISOMETRIC);
    scheduleRender();
  }

  /**
   * 2D（図面表示）モードに切り替え
   */
  function switchToOrthographic() {
    log.info('カメラモード切り替え: 2D（図面表示）');
    syncViewModeButtons('orthographic');
    setCameraMode(CAMERA_MODES.ORTHOGRAPHIC);
    setOrthographicView(ORTHOGRAPHIC_VIEWS.PLAN);
    scheduleRender();
  }

  // フローティングウィンドウ内のボタン
  if (hasFloatingButtons) {
    // 3Dボタンクリック
    cameraPerspectiveBtn.addEventListener('click', () => {
      switchToPerspective();
      // ラジオボタンがある場合は同期
      if (cameraPerspective) {
        cameraPerspective.checked = true;
      }
    });

    // 2Dボタンクリック
    cameraOrthographicBtn.addEventListener('click', () => {
      switchToOrthographic();
      // ラジオボタンがある場合は同期
      if (cameraOrthographic) {
        cameraOrthographic.checked = true;
      }
    });
  }

  // パネル上部の常時表示ボタン
  if (hasPanelButtons) {
    // 立体表示ボタンクリック
    viewModePerspectiveBtn.addEventListener('click', () => {
      switchToPerspective();
      // ラジオボタンがある場合は同期
      if (cameraPerspective) {
        cameraPerspective.checked = true;
      }
    });

    // 図面表示ボタンクリック
    viewModeOrthographicBtn.addEventListener('click', () => {
      switchToOrthographic();
      // ラジオボタンがある場合は同期
      if (cameraOrthographic) {
        cameraOrthographic.checked = true;
      }
    });
  }

  /**
   * すべてのビュー方向ボタンのアクティブ状態を同期
   * @param {string} viewType - ビュータイプ（'top', 'front', 'right', 'left', 'iso'）
   */
  function syncViewDirectionButtons(viewType) {
    // パネル上部のビュー方向ボタン
    const panelBtns = viewDirectionButtons?.querySelectorAll('.view-dir-btn');
    if (panelBtns) {
      panelBtns.forEach((b) => b.classList.remove('active'));
      const activeBtn = viewDirectionButtons?.querySelector(
        `.view-dir-btn[data-view="${viewType}"]`,
      );
      if (activeBtn) activeBtn.classList.add('active');
    }

    // フローティングウィンドウ内のビュー方向ボタン
    const floatBtns = document.querySelectorAll('#viewDirectionPanel button[data-view]');
    floatBtns.forEach((b) => b.classList.remove('active'));
    const floatActiveBtn = document.querySelector(
      `#viewDirectionPanel button[data-view="${viewType}"]`,
    );
    if (floatActiveBtn) floatActiveBtn.classList.add('active');
  }

  // フローティングウィンドウ内のビュー方向ボタン
  const viewButtons = document.querySelectorAll('#viewDirectionPanel button[data-view]');
  log.debug(
    `[setupCameraModeListeners] Found ${viewButtons.length} view direction buttons in floating window`,
  );

  viewButtons.forEach((btn) => {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      const viewType = this.dataset.view;
      log.info('ビュー方向切り替え（フローティング）:', viewType);
      syncViewDirectionButtons(viewType);
      try {
        setView(viewType, modelBounds);
        if (scheduleRender) scheduleRender();
      } catch (error) {
        log.error('ビュー方向の設定に失敗:', error);
      }
    });
  });

  // パネル上部のビュー方向ボタン
  const viewDirBtns = viewDirectionButtons?.querySelectorAll('.view-dir-btn');
  if (viewDirBtns) {
    log.debug(
      `[setupCameraModeListeners] Found ${viewDirBtns.length} view direction buttons in panel`,
    );
    viewDirBtns.forEach((btn) => {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        const viewType = this.dataset.view;
        log.info('ビュー方向切り替え（パネル上部）:', viewType);
        syncViewDirectionButtons(viewType);
        try {
          setView(viewType, modelBounds);
          if (scheduleRender) scheduleRender();
        } catch (error) {
          log.error('ビュー方向の設定に失敗:', error);
        }
      });
    });
  }

  // ラジオボタンがある場合のみリスナーを設定
  if (!hasRadioButtons) {
    log.info('[setupCameraModeListeners] Camera mode listeners initialized (panel buttons only)');
    return;
  }

  cameraPerspective.addEventListener('change', function () {
    if (this.checked) {
      log.info('カメラモード切り替え: 3D（立体表示）');
      syncViewModeButtons('perspective');
      setCameraMode(CAMERA_MODES.PERSPECTIVE);
      // デフォルトで等角投影ビューを設定（初期位置にリセット）
      try {
        setView('iso', modelBounds);
        log.info('デフォルトビュー: 等角投影');
      } catch (error) {
        log.warn('デフォルトビューの設定に失敗:', error);
      }
      // 2Dクリッピングコントロールを非表示
      updateDepth2DClippingVisibility(CAMERA_MODES.PERSPECTIVE);
      // STBエクスポートパネルを非表示（3Dモードでは使用不可）
      setStbExportPanelVisibility(false);
      // 通り芯を3Dモード用に再描画（延長を階と同じに）
      redrawAxesAtStory('all');
      if (scheduleRender) scheduleRender();
    }
  });

  cameraOrthographic.addEventListener('change', function () {
    if (this.checked) {
      log.info('カメラモード切り替え: 2D（図面表示）');
      syncViewModeButtons('orthographic');
      setCameraMode(CAMERA_MODES.ORTHOGRAPHIC);
      // デフォルトで平面図ビューを設定
      try {
        setView('top', modelBounds);
        // 平面図ボタンをアクティブに（両方の場所）
        syncViewDirectionButtons('top');
        log.info('デフォルトビュー: 平面図');
      } catch (error) {
        log.warn('デフォルトビューの設定に失敗:', error);
      }
      // 2Dクリッピングコントロールを表示
      updateDepth2DClippingVisibility(CAMERA_MODES.ORTHOGRAPHIC);
      // STBエクスポートパネルを表示（2Dモードで使用可能）
      setStbExportPanelVisibility(true);
      // 通り芯を2Dモード用に再描画（延長を短く）
      redrawAxesAtStory('all');
      if (scheduleRender) scheduleRender();
    }
  });

  log.info('[setupCameraModeListeners] Camera mode listeners initialized successfully');
}

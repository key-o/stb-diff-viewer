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

import * as THREE from "three";
import { createLogger } from "./utils/logger.js";
import {
  materials,
  elementGroups,
  SUPPORTED_ELEMENTS,
} from "./viewer/index.js";
// プロファイルベース実装に移行
import { ProfileBasedBraceGenerator } from "./viewer/geometry/ProfileBasedBraceGenerator.js";
import { ProfileBasedColumnGenerator } from "./viewer/geometry/ProfileBasedColumnGenerator.js";
import { ProfileBasedPostGenerator } from "./viewer/geometry/ProfileBasedPostGenerator.js";
import { ProfileBasedBeamGenerator } from "./viewer/geometry/ProfileBasedBeamGenerator.js";
import { PileGenerator } from "./viewer/geometry/PileGenerator.js";
import { FootingGenerator } from "./viewer/geometry/FootingGenerator.js";
import { parseElements } from "./parser/stbXmlParser.js";
import { parseStbFile } from "./viewer/geometry/stbStructureReader.js";
import { compareElements, lineElementKeyExtractor } from "./comparator.js";
import { drawLineElements } from "./viewer/index.js";
import { updateLabelVisibility } from "./ui/unifiedLabelManager.js";
import { removeLabelsForElementType, addLabelsToGlobalState } from "./ui.js";
import { createLabelSprite } from "./viewer/ui/labels.js";
import { generateLabelText } from "./ui/unifiedLabelManager.js";
import { attachElementDataToLabel } from "./ui/labelRegeneration.js";
// 表示モード管理
import displayModeManager from "./viewer/rendering/displayModeManager.js";
import labelDisplayManager from "./viewer/rendering/labelDisplayManager.js";
import modelVisibilityManager from "./viewer/rendering/modelVisibilityManager.js";
// カメラ管理（静的インポート）
import { setCameraMode, CAMERA_MODES } from "./viewer/camera/cameraManager.js";
import { setView } from "./viewer/camera/viewManager.js";
// 2Dクリッピング管理
import {
  updateDepth2DClippingVisibility,
  initDepth2DClippingUI,
  adjustDepth2DClippingRangeFromModel,
} from "./ui/clipping2D.js";

// ロガー
const log = createLogger("viewModes");

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
  modelBounds = modelData.modelBounds;
  modelADocument = modelData.modelADocument;
  modelBDocument = modelData.modelBDocument;
  nodeMapA = modelData.nodeMapA;
  nodeMapB = modelData.nodeMapB;
}

/**
 * 柱の表示モードを設定
 * @param {string} mode - "line" または "solid"
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setColumnViewMode(mode, scheduleRender) {
  if (mode !== "line" && mode !== "solid") return;
  displayModeManager.setDisplayMode("Column", mode);
  redrawColumnsForViewMode(scheduleRender);
}

/**
 * 間柱の表示モードを設定
 * @param {string} mode - "line" または "solid"
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setPostViewMode(mode, scheduleRender) {
  if (mode !== "line" && mode !== "solid") return;
  displayModeManager.setDisplayMode("Post", mode);
  redrawPostsForViewMode(scheduleRender);
}

/**
 * 梁の表示モードを設定
 * @param {string} mode - "line" または "solid"
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setBeamViewMode(mode, scheduleRender) {
  if (mode !== "line" && mode !== "solid") return;
  displayModeManager.setDisplayMode("Beam", mode);
  redrawBeamsForViewMode(scheduleRender);
}

/**
 * ブレースの表示モードを設定
 * @param {string} mode - "line" または "solid"
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setBraceViewMode(mode, scheduleRender) {
  if (mode !== "line" && mode !== "solid") return;
  displayModeManager.setDisplayMode("Brace", mode);
  redrawBracesForViewMode(scheduleRender);
}

/**
 * 杭の表示モードを設定
 * @param {string} mode - "line" または "solid"
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setPileViewMode(mode, scheduleRender) {
  if (mode !== "line" && mode !== "solid") return;
  displayModeManager.setDisplayMode("Pile", mode);
  redrawPilesForViewMode(scheduleRender);
}

/**
 * 基礎の表示モードを設定
 * @param {string} mode - "line" または "solid"
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setFootingViewMode(mode, scheduleRender) {
  if (mode !== "line" && mode !== "solid") return;
  displayModeManager.setDisplayMode("Footing", mode);
  redrawFootingsForViewMode(scheduleRender);
}

/**
 * 基礎柱の表示モードを設定
 * @param {string} mode - "line" または "solid"
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setFoundationColumnViewMode(mode, scheduleRender) {
  if (mode !== "line" && mode !== "solid") return;
  displayModeManager.setDisplayMode("FoundationColumn", mode);
  redrawFoundationColumnsForViewMode(scheduleRender);
}

/**
 * モデルの表示状態を設定
 * @param {string} model - "A" または "B"
 * @param {boolean} visible - 表示状態
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setModelVisibility(model, visible, scheduleRender) {
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
function redrawElementForViewMode(
  config,
  scheduleRender,
  updateLabelsAfter = true
) {
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

  if (viewMode === "solid") {
    // 立体表示（ProfileBased方式）
    const stbData = parseStbFile(doc);

    const meshes = generator[generatorMethod](
      stbData[elementsKey],
      stbData.nodes,
      stbData[sectionsKey],
      stbData.steelSections,
      elementType
    );
    meshes.forEach((mesh) => group.add(mesh));

    // ラベル作成
    labelDisplayManager.syncWithCheckbox(elementType);
    const createLabels = labelDisplayManager.isLabelVisible(elementType);
    log.debug(
      `[redraw${elementType}ForViewMode] solid mode - createLabels: ${createLabels}`
    );

    if (createLabels) {
      const labels = createLabelsForSolidElements(
        stbData[elementsKey],
        stbData.nodes,
        elementType
      );
      log.debug(
        `[redraw${elementType}ForViewMode] solid mode - created ${labels.length} labels`
      );
      labels.forEach((label) => group.add(label));
      addLabelsToGlobalState(labels);
    }
  } else {
    // 線表示 - 1ノード要素（基礎など）は線表示をサポートしない
    if (nodeEndAttr === null) {
      log.debug(
        `[redraw${elementType}ForViewMode] line mode not supported for single-node elements`
      );
      if (scheduleRender) scheduleRender();
      return;
    }

    const elementsA = parseElements(modelADocument, stbTagName);
    const elementsB = parseElements(modelBDocument, stbTagName);
    const comparisonResult = compareElements(
      elementsA,
      elementsB,
      nodeMapA,
      nodeMapB,
      (el, nm) => lineElementKeyExtractor(el, nm, nodeStartAttr, nodeEndAttr)
    );

    labelDisplayManager.syncWithCheckbox(elementType);
    const createLabels = labelDisplayManager.isLabelVisible(elementType);
    log.debug(
      `[redraw${elementType}ForViewMode] line mode - createLabels: ${createLabels}`
    );

    const createdLabels = drawLineElements(
      comparisonResult,
      materials,
      group,
      elementType,
      createLabels,
      modelBounds
    );

    if (createdLabels && createdLabels.length > 0) {
      log.debug(
        `[redraw${elementType}ForViewMode] line mode - created ${createdLabels.length} labels`
      );
      addLabelsToGlobalState(createdLabels);
    } else {
      log.debug(
        `[redraw${elementType}ForViewMode] line mode - no labels created`
      );
    }
  }

  // ラベルの表示/非表示を更新
  if (updateLabelsAfter) {
    setTimeout(() => {
      updateLabelVisibility();
      if (scheduleRender) scheduleRender();
    }, 10);
  }
}

/**
 * 柱の再描画処理
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function redrawColumnsForViewMode(scheduleRender) {
  redrawElementForViewMode(
    {
      elementType: "Column",
      stbTagName: "StbColumn",
      nodeStartAttr: "id_node_bottom",
      nodeEndAttr: "id_node_top",
      generator: ProfileBasedColumnGenerator,
      generatorMethod: "createColumnMeshes",
      elementsKey: "columnElements",
      sectionsKey: "columnSections",
    },
    scheduleRender
  );
}

/**
 * 間柱の再描画処理（Postは柱と同じ構造を持つため、同様の処理）
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function redrawPostsForViewMode(scheduleRender) {
  redrawElementForViewMode(
    {
      elementType: "Post",
      stbTagName: "StbPost",
      nodeStartAttr: "id_node_bottom",
      nodeEndAttr: "id_node_top",
      generator: ProfileBasedPostGenerator,
      generatorMethod: "createPostMeshes",
      elementsKey: "postElements",
      sectionsKey: "postSections",
    },
    scheduleRender
  );
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
    if (
      elementType === "Column" ||
      elementType === "Post" ||
      elementType === "FoundationColumn"
    ) {
      startNode = nodes.get(element.id_node_bottom);
      endNode = nodes.get(element.id_node_top);
      labelText = generateLabelText(element, elementType);
      if (startNode && endNode) {
        centerPosition = new THREE.Vector3()
          .addVectors(startNode, endNode)
          .multiplyScalar(0.5);
      }
    } else if (elementType === "Girder" || elementType === "Beam") {
      startNode = nodes.get(element.id_node_start);
      endNode = nodes.get(element.id_node_end);
      labelText = generateLabelText(element, elementType);
      if (startNode && endNode) {
        centerPosition = new THREE.Vector3()
          .addVectors(startNode, endNode)
          .multiplyScalar(0.5);
      }
    } else if (elementType === "Brace" || elementType === "Pile") {
      startNode = nodes.get(element.id_node_start || element.id_node_bottom);
      endNode = nodes.get(element.id_node_end || element.id_node_top);
      labelText = generateLabelText(element, elementType);
      if (startNode && endNode) {
        centerPosition = new THREE.Vector3()
          .addVectors(startNode, endNode)
          .multiplyScalar(0.5);
      }
    } else if (elementType === "Footing") {
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
    const sprite = createLabelSprite(
      labelText,
      centerPosition,
      null,
      elementType
    );
    if (sprite) {
      sprite.userData.elementId = element.id;
      sprite.userData.modelSource = "solid"; // 立体表示由来のラベル
      sprite.userData.elementType = elementType;

      // 要素データを保存して再生成時に使用
      attachElementDataToLabel(sprite, element);
      labels.push(sprite);
    }
  }

  return labels;
}

/**
 * 梁の再描画処理（大梁と小梁の両方を処理）
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function redrawBeamsForViewMode(scheduleRender) {
  // 大梁（Girder）を処理（ラベル更新はスキップ）
  redrawElementForViewMode(
    {
      elementType: "Girder",
      stbTagName: "StbGirder",
      nodeStartAttr: "id_node_start",
      nodeEndAttr: "id_node_end",
      generator: ProfileBasedBeamGenerator,
      generatorMethod: "createBeamMeshes",
      elementsKey: "girderElements",
      sectionsKey: "beamSections",
    },
    scheduleRender,
    false
  );

  // 小梁（Beam）を処理（ラベル更新を実行）
  redrawElementForViewMode(
    {
      elementType: "Beam",
      stbTagName: "StbBeam",
      nodeStartAttr: "id_node_start",
      nodeEndAttr: "id_node_end",
      generator: ProfileBasedBeamGenerator,
      generatorMethod: "createBeamMeshes",
      elementsKey: "beamElements",
      sectionsKey: "beamSections",
    },
    scheduleRender,
    true
  );
}

/**
 * ブレースの再描画処理
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function redrawBracesForViewMode(scheduleRender) {
  redrawElementForViewMode(
    {
      elementType: "Brace",
      stbTagName: "StbBrace",
      nodeStartAttr: "id_node_start",
      nodeEndAttr: "id_node_end",
      generator: ProfileBasedBraceGenerator,
      generatorMethod: "createBraceMeshes",
      elementsKey: "braceElements",
      sectionsKey: "braceSections",
    },
    scheduleRender
  );
}

/**
 * 杭の再描画処理
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function redrawPilesForViewMode(scheduleRender) {
  redrawElementForViewMode(
    {
      elementType: "Pile",
      stbTagName: "StbPile",
      nodeStartAttr: "id_node_bottom",
      nodeEndAttr: "id_node_top",
      generator: PileGenerator,
      generatorMethod: "createPileMeshes",
      elementsKey: "pileElements",
      sectionsKey: "pileSections",
    },
    scheduleRender
  );
}

/**
 * 基礎の再描画処理
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function redrawFootingsForViewMode(scheduleRender) {
  redrawElementForViewMode(
    {
      elementType: "Footing",
      stbTagName: "StbFooting",
      nodeStartAttr: "id_node",
      nodeEndAttr: null, // 基礎は1ノード要素
      generator: FootingGenerator,
      generatorMethod: "createFootingMeshes",
      elementsKey: "footingElements",
      sectionsKey: "footingSections",
    },
    scheduleRender
  );
}

/**
 * 基礎柱の再描画処理
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function redrawFoundationColumnsForViewMode(scheduleRender) {
  redrawElementForViewMode(
    {
      elementType: "FoundationColumn",
      stbTagName: "StbFoundationColumn",
      nodeStartAttr: "id_node_bottom",
      nodeEndAttr: "id_node_top",
      generator: ProfileBasedColumnGenerator,
      generatorMethod: "createColumnMeshes",
      elementsKey: "foundationColumnElements",
      sectionsKey: "foundationcolumnSections", // 注意: 小文字 - sectionExtractorのtoLowerCase()による
    },
    scheduleRender
  );
}

/**
 * モデル表示状態に基づいてオブジェクトの表示/非表示を更新
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function updateModelVisibility(scheduleRender) {
  log.debug(
    `Updating model visibility: A=${modelVisibilityManager.isModelVisible(
      "A"
    )}, B=${modelVisibilityManager.isModelVisible("B")}`
  );

  SUPPORTED_ELEMENTS.forEach((elementType) => {
    const group = elementGroups[elementType];
    if (group) {
      group.children.forEach((child) => {
        if (child.userData && child.userData.modelSource) {
          const source = child.userData.modelSource;
          let shouldBeVisible = false;
          if (source === "A" && modelVisibilityManager.isModelVisible("A")) {
            shouldBeVisible = true;
          } else if (
            source === "B" &&
            modelVisibilityManager.isModelVisible("B")
          ) {
            shouldBeVisible = true;
          } else if (
            source === "matched" &&
            (modelVisibilityManager.isModelVisible("A") ||
              modelVisibilityManager.isModelVisible("B"))
          ) {
            // matched はどちらかのモデルが表示されていれば表示
            shouldBeVisible = true;
          }
          // 要素タイプ自体の表示状態も考慮する
          const elementCheckbox = document.querySelector(
            `#elementSelector input[name="elements"][value="${elementType}"]`
          );
          const isElementTypeVisible = elementCheckbox
            ? elementCheckbox.checked
            : false;

          child.visible = shouldBeVisible && isElementTypeVisible;
        } else if (elementType === "Axis" || elementType === "Story") {
          // 軸と階はモデルA/Bに依存しないが、要素タイプのチェックボックスには従う
          const elementCheckbox = document.querySelector(
            `#elementSelector input[name="elements"][value="${elementType}"]`
          );
          const isElementTypeVisible = elementCheckbox
            ? elementCheckbox.checked
            : false;
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
 * @param {Function} scheduleRender - 再描画要求関数
 */
export function setupViewModeListeners(scheduleRender) {
  // 柱表示モード切替リスナー
  const toggleColumnViewCheckbox = document.getElementById("toggleColumnView");
  if (toggleColumnViewCheckbox) {
    toggleColumnViewCheckbox.addEventListener("change", function () {
      // チェックが入っている場合は立体表示、そうでなければ線表示
      const mode = this.checked ? "solid" : "line";
      displayModeManager.setDisplayMode("Column", mode);
      redrawColumnsForViewMode(scheduleRender);
      log.info("柱表示モード:", mode);
    });
  }

  // 大梁表示モード切替リスナー
  const toggleGirderViewCheckbox = document.getElementById("toggleGirderView");
  if (toggleGirderViewCheckbox) {
    toggleGirderViewCheckbox.addEventListener("change", function () {
      // チェックが入っている場合は立体表示、そうでなければ線表示
      const mode = this.checked ? "solid" : "line";
      displayModeManager.setDisplayMode("Girder", mode);
      redrawBeamsForViewMode(scheduleRender);
      log.info("大梁表示モード:", mode);
    });
  }

  // ブレース表示モード切替リスナー
  const toggleBrace3DViewCheckbox =
    document.getElementById("toggleBrace3DView");
  if (toggleBrace3DViewCheckbox) {
    toggleBrace3DViewCheckbox.addEventListener("change", function () {
      // チェックが入っている場合は立体表示、そうでなければ線表示
      const mode = this.checked ? "solid" : "line";
      displayModeManager.setDisplayMode("Brace", mode);
      redrawBracesForViewMode(scheduleRender);
      log.info("ブレース表示モード:", mode);
    });
  }

  // 支保工表示モード切替リスナー
  const togglePost3DViewCheckbox = document.getElementById("togglePost3DView");
  if (togglePost3DViewCheckbox) {
    togglePost3DViewCheckbox.addEventListener("change", function () {
      // チェックが入っている場合は立体表示、そうでなければ線表示
      const mode = this.checked ? "solid" : "line";
      displayModeManager.setDisplayMode("Post", mode);
      redrawPostsForViewMode(scheduleRender);
      log.info("支保工表示モード:", mode);
    });
  }

  // 小梁3D表示モード切替リスナー
  const toggleBeam3DViewCheckbox = document.getElementById("toggleBeam3DView");
  if (toggleBeam3DViewCheckbox) {
    toggleBeam3DViewCheckbox.addEventListener("change", function () {
      // チェックが入っている場合は立体表示、そうでなければ線表示
      const mode = this.checked ? "solid" : "line";
      displayModeManager.setDisplayMode("Beam", mode);
      redrawBeamsForViewMode(scheduleRender);
      log.info("小梁表示モード:", mode);
    });
  }

  // 杭3D表示モード切替リスナー
  const togglePile3DViewCheckbox = document.getElementById("togglePile3DView");
  if (togglePile3DViewCheckbox) {
    togglePile3DViewCheckbox.addEventListener("change", function () {
      const mode = this.checked ? "solid" : "line";
      displayModeManager.setDisplayMode("Pile", mode);
      redrawPilesForViewMode(scheduleRender);
      log.info("杭表示モード:", mode);
    });
  }

  // 基礎3D表示モード切替リスナー
  const toggleFooting3DViewCheckbox = document.getElementById(
    "toggleFooting3DView"
  );
  if (toggleFooting3DViewCheckbox) {
    toggleFooting3DViewCheckbox.addEventListener("change", function () {
      const mode = this.checked ? "solid" : "line";
      displayModeManager.setDisplayMode("Footing", mode);
      redrawFootingsForViewMode(scheduleRender);
      log.info("基礎表示モード:", mode);
    });
  }

  // 基礎柱3D表示モード切替リスナー
  const toggleFoundationColumn3DViewCheckbox = document.getElementById(
    "toggleFoundationColumn3DView"
  );
  if (toggleFoundationColumn3DViewCheckbox) {
    toggleFoundationColumn3DViewCheckbox.addEventListener(
      "change",
      function () {
        const mode = this.checked ? "solid" : "line";
        displayModeManager.setDisplayMode("FoundationColumn", mode);
        redrawFoundationColumnsForViewMode(scheduleRender);
        log.info("基礎柱表示モード:", mode);
      }
    );
  }

  // 節点表示切替リスナー
  const toggleNodeViewCheckbox = document.getElementById("toggleNodeView");
  if (toggleNodeViewCheckbox) {
    toggleNodeViewCheckbox.addEventListener("change", function () {
      const nodeGroup = elementGroups["Node"];
      if (nodeGroup) {
        nodeGroup.visible = this.checked;
        log.debug("節点表示:", this.checked);
        if (scheduleRender) scheduleRender();
      }
    });
  }

  // その他の要素タイプの表示切替リスナー
  const elementToggleIds = [
    { id: "toggleBraceView", type: "Brace", name: "ブレース" },
    { id: "togglePileView", type: "Pile", name: "杭" },
    { id: "toggleFootingView", type: "Footing", name: "基礎" },
    {
      id: "toggleFoundationColumnView",
      type: "FoundationColumn",
      name: "基礎柱",
    },
    { id: "toggleSlabView", type: "Slab", name: "スラブ" },
    { id: "toggleWallView", type: "Wall", name: "壁" },
    { id: "toggleAxisView", type: "Axis", name: "通り芯" },
    { id: "toggleStoryView", type: "Story", name: "階" },
  ];

  elementToggleIds.forEach(({ id, type, name }) => {
    const checkbox = document.getElementById(id);
    if (checkbox) {
      checkbox.addEventListener("change", function () {
        const elementGroup = elementGroups[type];
        if (elementGroup) {
          elementGroup.visible = this.checked;
          log.debug(`${name}表示:`, this.checked);
          if (scheduleRender) scheduleRender();
        }
      });
    }
  });

  // モデル表示切り替えチェックボックスのリスナー
  const toggleModelACheckbox = document.getElementById("toggleModelA");
  if (toggleModelACheckbox) {
    toggleModelACheckbox.addEventListener("change", function () {
      modelVisibilityManager.setModelVisibility("A", this.checked);
      log.info("Model A visibility changed:", this.checked);
      updateModelVisibility(scheduleRender);
    });
  }

  const toggleModelBCheckbox = document.getElementById("toggleModelB");
  if (toggleModelBCheckbox) {
    toggleModelBCheckbox.addEventListener("change", function () {
      modelVisibilityManager.setModelVisibility("B", this.checked);
      log.info("Model B visibility changed:", this.checked);
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
  log.debug("[setupCameraModeListeners] Initializing camera mode listeners");

  // カメラモード切り替え
  const cameraPerspective = document.getElementById("cameraPerspective");
  const cameraOrthographic = document.getElementById("cameraOrthographic");
  const viewDirectionPanel = document.getElementById("viewDirectionPanel");

  if (!cameraPerspective || !cameraOrthographic) {
    log.warn(
      "[setupCameraModeListeners] Camera mode radio buttons not found in DOM"
    );
    return;
  }

  // ボタン形式のカメラモード切り替え
  const cameraPerspectiveBtn = document.getElementById("cameraPerspectiveBtn");
  const cameraOrthographicBtn = document.getElementById("cameraOrthographicBtn");

  if (cameraPerspectiveBtn && cameraOrthographicBtn) {
    // 3Dボタンクリック
    cameraPerspectiveBtn.addEventListener("click", function () {
      // ボタンのアクティブ状態を切り替え
      cameraPerspectiveBtn.classList.add("active");
      cameraOrthographicBtn.classList.remove("active");
      // ラジオボタンをチェックしてchangeイベントを発火
      cameraPerspective.checked = true;
      cameraPerspective.dispatchEvent(new Event("change"));
    });

    // 2Dボタンクリック
    cameraOrthographicBtn.addEventListener("click", function () {
      // ボタンのアクティブ状態を切り替え
      cameraOrthographicBtn.classList.add("active");
      cameraPerspectiveBtn.classList.remove("active");
      // ラジオボタンをチェックしてchangeイベントを発火
      cameraOrthographic.checked = true;
      cameraOrthographic.dispatchEvent(new Event("change"));
    });
  }

  cameraPerspective.addEventListener("change", function () {
    if (this.checked) {
      log.info("カメラモード切り替え: 3D（透視投影）");
      setCameraMode(CAMERA_MODES.PERSPECTIVE);
      if (viewDirectionPanel) {
        viewDirectionPanel.style.display = "none";
      }
      // 2Dクリッピングコントロールを非表示
      updateDepth2DClippingVisibility(CAMERA_MODES.PERSPECTIVE);
      if (scheduleRender) scheduleRender();
    }
  });

  cameraOrthographic.addEventListener("change", function () {
    if (this.checked) {
      log.info("カメラモード切り替え: 2D（平行投影）");
      setCameraMode(CAMERA_MODES.ORTHOGRAPHIC);
      if (viewDirectionPanel) {
        viewDirectionPanel.style.display = "block";
      }
      // 2Dクリッピングコントロールを表示
      updateDepth2DClippingVisibility(CAMERA_MODES.ORTHOGRAPHIC);
      if (scheduleRender) scheduleRender();
    }
  });

  // ビュー方向ボタン
  const viewButtons = document.querySelectorAll("button[data-view]");
  log.debug(
    `[setupCameraModeListeners] Found ${viewButtons.length} view direction buttons`
  );

  viewButtons.forEach((btn) => {
    btn.addEventListener("click", function (e) {
      e.preventDefault(); // フォーム送信を防ぐ
      const viewType = this.dataset.view;
      log.info("ビュー方向切り替え:", viewType);

      try {
        setView(viewType, modelBounds);
        if (scheduleRender) scheduleRender();
      } catch (error) {
        log.error("ビュー方向の設定に失敗:", error);
      }
    });
  });

  log.info(
    "[setupCameraModeListeners] Camera mode listeners initialized successfully"
  );
}

/**
 * @fileoverview 構造モデルビューワーのメインモジュール
 *
 * このファイルは、アプリケーションのエントリーポイントとして機能し、以下の役割を持ちます：
 * - Three.jsビューワーの初期化と設定
 * - モジュール間の連携とイベント処理
 * - グローバル関数の公開と初期化
 * - UIイベントリスナーの設定
 * - モデルローディングと表示モード管理
 * - 再描画機能の提供
 *
 * このモジュールは他のモジュール (modelLoader, interaction, viewModes) を
 * 連携させるオーケストレーターとして機能します。
 */
import * as THREE from "three";
import { createLogger, Logger as AppLogger } from "./utils/logger.js";
import {
  scene,
  camera,
  controls,
  renderer,
  elementGroups,
  SUPPORTED_ELEMENTS,
  initRenderer,
  animate,
  setupViewportResizeHandler,
  updateMaterialClippingPlanes,
  createOrUpdateGridHelper,
  clearClippingPlanes,
  getActiveCamera,
} from "./viewer/index.js";
import { compareModels } from "./modelLoader.js";
import { setupInteractionListeners, getSelectedCenter, selectElement3D } from "./interaction.js";
import {
  setupViewModeListeners,
  setupCameraModeListeners,
} from "./viewModes.js";
import { setupColorModeListeners } from "./colorModes.js";
import { updateLabelVisibility } from "./ui/unifiedLabelManager.js";
import { getCameraMode } from "./viewer/camera/cameraManager.js";
import {
  setupUIEventListeners,
  toggleLegend,
  applyStoryClip,
  applyAxisClip,
} from "./ui.js";
import {
  initDepth2DClippingUI,
  adjustDepth2DClippingRangeFromModel,
} from "./ui/clipping2D.js";
import { displayElementInfo } from "./viewer/ui/elementInfoDisplay.js";
import { regenerateAllLabels } from "./ui/labelRegeneration.js";
import {
  setState,
  getState,
  registerGlobalFunction,
  enableStateDebug,
} from "./core/globalState.js";
import { initializeSettingsManager } from "./core/settingsManager.js";
import { initializeGlobalMessenger } from "./core/moduleMessaging.js";
import { IFCConverter, IFCConverterUI } from "./api/ifcConverter.js";
import { initializeImportanceManager } from "./core/importanceManager.js";
import {
  initializeImportancePanel,
  getImportancePanel,
} from "./ui/importancePanel.js";
import { initializeImportanceFilterSystem } from "./ui/importanceFilter.js";
import { initializeImportanceStatistics } from "./ui/statistics.js";
import { initializeBulkImportanceOperations } from "./ui/bulkImportanceOperations.js";
import { initializeOutlineSystem } from "./viewer/rendering/outlines.js";
import {
  setupDiffSummaryEventListeners,
  clearDiffSummary,
} from "./ui/diffSummary.js";
import displayModeManager from "./viewer/rendering/displayModeManager.js";
import labelDisplayManager from "./viewer/rendering/labelDisplayManager.js";
import { initializeComparisonKeySelector } from "./ui/comparisonKeySelector.js";
import { initializeFloatingWindow } from "./ui/floatingWindow.js";
import { initializeTreeView, buildTree } from "./ui/elementTreeView.js";
import * as GeometryDebugger from "./viewer/geometry/debug/GeometryDebugger.js";
import {
  initializeSectionTreeView,
  buildSectionTree,
  setGroupingMode,
} from "./ui/sectionTreeView.js";

// --- 初期化フラグ ---
let rendererInitialized = false;
const log = createLogger("app");

// 2Dズーム感度と制限値（CameraControls に委譲する前提で使用）
const ORTHOGRAPHIC_ZOOM_FACTOR = 0.001;
const ORTHOGRAPHIC_MIN_ZOOM = 0.01;
const ORTHOGRAPHIC_MAX_ZOOM = 50;

// --- 再描画をリクエストする関数 ---
function scheduleRender() {
  if (rendererInitialized) {
    // console.log("手動レンダリングが要求されました");
    const activeCamera = getActiveCamera();
    if (renderer && scene && activeCamera) {
      // controls.update() は animate ループで呼ばれるので、ここでは不要
      renderer.render(scene, activeCamera);
    }
  } else {
    log.warn(
      "レンダリングをリクエストできません: レンダラーが初期化されていません"
    );
  }
}

// --- グローバル状態管理とレガシー互換性 ---
// 新しい状態管理システムに登録
registerGlobalFunction("scheduleRender", scheduleRender);
registerGlobalFunction("requestRender", scheduleRender);
setState("rendering.scheduleRender", scheduleRender);
setState("rendering.requestRender", scheduleRender);

// レガシー互換性のため
window.requestRender = scheduleRender;

// --- 重要度パネル表示切り替え関数 ---
function toggleImportancePanel() {
  const panel = getImportancePanel();
  panel.toggle();
}
window.toggleImportancePanel = toggleImportancePanel;

// --- マネージャーをグローバルに公開（デバッグ用） ---
window.displayModeManager = displayModeManager;
window.labelDisplayManager = labelDisplayManager;

/**
 * comparisonResultsをツリー表示用のデータ構造に変換
 * @param {Map} comparisonResults - 要素タイプごとの比較結果Map
 * @returns {Object} ツリー表示用のデータ構造
 */
function convertComparisonResultsForTree(comparisonResults) {
  const matched = [];
  const onlyA = [];
  const onlyB = [];

  // comparisonResultsがMapかどうかチェック
  if (!comparisonResults) {
    log.warn("comparisonResults is null or undefined");
    return { matched, onlyA, onlyB };
  }

  // Mapまたはオブジェクトの各要素を処理
  const entries = comparisonResults instanceof Map
    ? comparisonResults.entries()
    : Object.entries(comparisonResults);

  for (const [elementType, result] of entries) {
    if (!result) continue;

    // matched要素を変換
    if (result.matched && Array.isArray(result.matched)) {
      result.matched.forEach(item => {
        matched.push({
          elementType: elementType,
          elementA: item.dataA,
          elementB: item.dataB,
          id: item.dataA?.id,
        });
      });
    }

    // onlyA要素を変換
    if (result.onlyA && Array.isArray(result.onlyA)) {
      result.onlyA.forEach(item => {
        onlyA.push({
          elementType: elementType,
          ...item,
        });
      });
    }

    // onlyB要素を変換
    if (result.onlyB && Array.isArray(result.onlyB)) {
      result.onlyB.forEach(item => {
        onlyB.push({
          elementType: elementType,
          ...item,
        });
      });
    }
  }

  log.info(`ツリー用データ変換完了: matched=${matched.length}, onlyA=${onlyA.length}, onlyB=${onlyB.length}`);
  return { matched, onlyA, onlyB };
}

// --- compareModelsをHTMLから呼び出せるようにグローバルに設定 ---
window.compareModels = async function () {
  // レンダラーが初期化されていない場合は処理中断
  if (!rendererInitialized) {
    alert("ビューアが初期化されていません。");
    return;
  }

  // モデルの読み込みと比較処理
  await compareModels(scheduleRender, { camera, controls });

  // 比較結果を取得してツリーを構築
  const comparisonResults = getState("comparisonResults");
  if (comparisonResults) {
    log.info("要素ツリーを構築しています...");
    // comparisonResultsをツリー表示用に変換
    const treeData = convertComparisonResultsForTree(comparisonResults);
    buildTree(treeData);

    // 断面ツリーも構築
    const sectionsData = getState("sectionsData");
    if (sectionsData) {
      log.info("断面ツリーを構築しています...");
      buildSectionTree(treeData, sectionsData);
    }
  }

  // 少し待ってからラベル表示状態をチェックボックスに基づいて更新
  // （ラベル作成処理の完了を待つ）
  log.info("チェックボックスの状態に基づいてラベル表示を初期化しています...");
  setTimeout(() => {
    updateLabelVisibility();
    // 再描画
    if (typeof window.requestRender === "function") window.requestRender();
  }, 100);
};

// --- アプリケーション開始関数 ---
function startApp() {
  // グローバル関数を状態管理システムに登録
  registerGlobalFunction("toggleLegend", toggleLegend);
  registerGlobalFunction("applyStoryClip", applyStoryClip);
  registerGlobalFunction("applyAxisClip", applyAxisClip);
  registerGlobalFunction("displayElementInfo", displayElementInfo);
  registerGlobalFunction("clearClippingPlanes", clearClippingPlanes);
  registerGlobalFunction("regenerateAllLabels", regenerateAllLabels);
  registerGlobalFunction("toggleImportancePanel", toggleImportancePanel);

  // レガシー互換性のためwindowにも登録
  window.toggleLegend = toggleLegend;
  window.applyStoryClip = applyStoryClip;
  window.applyAxisClip = applyAxisClip;
  window.displayElementInfo = displayElementInfo;
  window.clearClippingPlanes = clearClippingPlanes;

  // IFC変換機能の初期化
  const ifcConverter = new IFCConverter();
  const ifcConverterUI = new IFCConverterUI(ifcConverter);
  window.ifcConverter = ifcConverter; // グローバルアクセス用

  // 状態管理システムの初期化
  setState("rendering.rendererInitialized", rendererInitialized);
  // 要素グループをグローバル状態に登録（重要度モードで使用）
  setState("elementGroups", elementGroups);
  enableStateDebug(true); // 開発時はデバッグ有効

  // 高度な機能の初期化
  initializeSettingsManager();
  initializeGlobalMessenger();

  // 重要度管理システムの初期化
  initializeImportanceManager()
    .then(() => {
      log.info("重要度マネージャーが初期化されました");
    })
    .catch((error) => {
      log.error("重要度マネージャーの初期化に失敗しました:", error);
    });

  // 初期化処理
  setupUIEventListeners();
  setupViewportResizeHandler(camera);
  setupInteractionListeners(scheduleRender);
  setupViewModeListeners(scheduleRender);
  setupCameraModeListeners(scheduleRender); // カメラモード切り替えの初期化
  initDepth2DClippingUI(); // 2D奥行きクリッピングUIの初期化
  setupColorModeListeners(); // 色付けモードの初期化
  setupDiffSummaryEventListeners(); // 差分サマリー機能の初期化

  // 初期回転中心の強制設定は行わない（CameraControls は setOrbitPoint で都度切替）

  // アクティブカメラは cameraManager で切り替わるため、固定のカメラ参照は渡さない
  // （3D/2Dのモード変更時に renderer が最新のカメラを使用できるようにする）
  animate(controls, scene);
  createOrUpdateGridHelper(new THREE.Box3());

  // ===== ズームを選択部材へ向ける（dollyToCursor + pointer同期） =====
  try {
    // CameraControls 透過設定 - カメラモード切り替え時に cameraManager で設定されるためここでは設定しない
    // controls.dollyToCursor = true;
    // controls.infinityDolly = false;

    const el = renderer?.domElement || document.getElementById("three-canvas");
    if (el) {
      // 重複してイベントリスナーが設定されないようにチェック
      if (!el.hasWheelListener) {
        el.hasWheelListener = true;

        const projectWorldToClient = (world, cam, element) => {
          const ndc = world.clone().project(cam);
          const rect = element.getBoundingClientRect();
          const x = (ndc.x * 0.5 + 0.5) * rect.width + rect.left;
          const y = (-ndc.y * 0.5 + 0.5) * rect.height + rect.top;
          return { x, y };
        };

        el.addEventListener(
          "wheel",
          (event) => {
            console.log("[DEBUG] Wheel event fired!", {
              deltaY: event.deltaY,
              activeCamera: getActiveCamera(),
              isOrthographic: getActiveCamera()?.isOrthographicCamera,
            });

            const activeCamera = getActiveCamera();
            const isOrthographic =
              activeCamera && activeCamera.isOrthographicCamera;

            // OrthographicCameraの場合はCameraControlsにズーム処理を委譲
            if (isOrthographic && activeCamera) {
              event.preventDefault();
              event.stopPropagation(); // CameraControlsの処理を止める

              const deltaZoom = -event.deltaY * ORTHOGRAPHIC_ZOOM_FACTOR;
              if (!controls?._cc) {
                console.warn(
                  "[WARN] CameraControls instance not ready; skipping orthographic zoom."
                );
                return;
              }

              const minZoom = controls._cc.minZoom ?? ORTHOGRAPHIC_MIN_ZOOM;
              const maxZoom = controls._cc.maxZoom ?? ORTHOGRAPHIC_MAX_ZOOM;
              const targetZoom = THREE.MathUtils.clamp(
                activeCamera.zoom + deltaZoom,
                minZoom,
                maxZoom
              );
              controls._cc.zoomTo(targetZoom, false);
              controls._cc.update(0);
              console.log("[DEBUG] Orthographic zoom via controls:", {
                minZoom,
                maxZoom,
                targetZoom,
              });
              return;
            }

            // 選択要素がある場合は選択要素中心へのズームを優先
            const center = getSelectedCenter?.();
            if (center) {
              const pt = projectWorldToClient(center, activeCamera, el);
              const move = new PointerEvent("pointermove", {
                clientX: pt.x,
                clientY: pt.y,
                pointerId: 1,
                pointerType: "mouse",
                bubbles: true,
              });
              el.dispatchEvent(move);
            }
            // PerspectiveCameraの場合はCameraControlsに任せる
          },
          { capture: true, passive: false } // captureフェーズでCameraControlsより先に処理
        );
      }
    }
  } catch (e) {
    log.warn("選択範囲へのズーム動作の設定に失敗しました:", e);
  }
}

/**
 * デバッグ用グローバルオブジェクトのセットアップ
 * @private
 */
function setupDebugGlobals() {
  // ==== 診断/デバッグ用に Three.js リソースをグローバルへ公開 ====
  if (!window.viewer) window.viewer = {};
  window.viewer.scene = scene;
  window.viewer.camera = camera;
  window.viewer.renderer = renderer;
  window.viewer.controls = controls;
  window.scene = scene; // シンプルアクセス用

  // ジオメトリデバッガー
  window.GeometryDebugger = GeometryDebugger;
  console.log('[Debug] GeometryDebugger available at window.GeometryDebugger');

  // 断面比較一括実行ショートカット
  window.runSectionComparison = (opts = {}) => {
    try {
      if (!window.GeometryDiagnostics) {
        console.warn("GeometryDiagnosticsモジュールがまだ読み込まれていません");
        return;
      }
      return window.GeometryDiagnostics.logDefaultSceneComparisons(
        null,
        opts.limit || 300,
        {
          tolerance: opts.tolerance ?? 0.02,
          level: opts.level || "info",
        }
      );
    } catch (e) {
      console.error("断面比較の実行に失敗しました", e);
    }
  };
}

/**
 * 必要なモジュールの初期化（ラベル管理、XSDスキーマ）
 * @private
 */
async function initializeRequiredModules() {
  // 統合ラベル管理システムを初期化
  import("./ui/unifiedLabelManager.js").then(({ initializeLabelManager }) => {
    initializeLabelManager();
    log.info("統合ラベル管理システムが初期化されました");
  });

  // XSDスキーマを初期化
  import("./parser/xsdSchemaParser.js")
    .then(({ loadXsdSchema }) => {
      const xsdPath = "./schemas/ST-Bridge202.xsd";
      loadXsdSchema(xsdPath).then((success) => {
        if (success) {
          log.info("起動時にXSDスキーマが初期化されました");
        } else {
          log.warn("起動時のXSDスキーマ初期化に失敗しました");
        }
      });
    })
    .catch((error) => {
      log.warn("XSDスキーマモジュールの読み込みに失敗しました:", error);
    });
}

/**
 * UIコンポーネントの初期化
 * @private
 */
function initializeUIComponents() {
  // フローティングウィンドウを初期化
  initializeFloatingWindow();

  // 要素ツリー表示を初期化
  initializeTreeView("element-tree-container", (selectedElement) => {
    try {
      log.info("ツリーから要素が選択されました:", selectedElement);

      // 入力の検証
      if (!selectedElement) {
        log.error("選択された要素情報がnullまたはundefinedです");
        return;
      }

      // 3Dビューアーで要素を探して選択
      const { elementType, elementId, modelSource } = selectedElement;

      if (!elementType) {
        log.error("要素タイプが指定されていません");
        return;
      }

      if (!elementId) {
        log.error("要素IDが指定されていません");
        return;
      }

      // elementGroupsから該当する要素を検索
      const elementGroup = elementGroups[elementType];
      if (!elementGroup) {
        log.warn(`要素グループが見つかりません: ${elementType}`);
        log.warn("利用可能な要素グループ:", Object.keys(elementGroups));
        return;
      }

      log.info(`要素を検索中: タイプ=${elementType}, ID=${elementId} (型: ${typeof elementId}), ソース=${modelSource}`);

      let found = false;
      let searchedCount = 0;
      let candidateMatches = []; // デバッグ用

      elementGroup.traverse((obj) => {
        if (found) return; // 既に見つかっている場合はスキップ

        if (obj.userData && obj.userData.elementType === elementType) {
          searchedCount++;

          // デバッグ用: 最初の5個の候補を記録
          if (candidateMatches.length < 5) {
            const objId = obj.userData.elementIdA || obj.userData.elementIdB || obj.userData.elementId;
            candidateMatches.push({
              objId: objId,
              objIdType: typeof objId,
              modelSource: obj.userData.modelSource,
            });
          }
        }

        if (
          obj.userData &&
          obj.userData.elementType === elementType
        ) {
          const objId =
            obj.userData.elementIdA || obj.userData.elementIdB || obj.userData.elementId;

          // 型を統一して比較（文字列と数値の両方に対応）
          const objIdStr = String(objId);
          const elementIdStr = String(elementId);

          // modelSourceの柔軟な比較
          const modelSourceMatches =
            obj.userData.modelSource === modelSource ||
            (modelSource === 'onlyA' && obj.userData.modelSource === 'A') ||
            (modelSource === 'onlyB' && obj.userData.modelSource === 'B') ||
            (modelSource === 'matched' && obj.userData.modelSource === 'matched');

          if (objIdStr === elementIdStr && modelSourceMatches) {
            found = true;
            log.info(`要素が見つかりました: ${elementType} ${elementId}`);

            // 要素情報を表示（正しい引数で呼び出す）
            let idA = null;
            let idB = null;
            if (modelSource === 'matched') {
              idA = obj.userData.elementIdA || obj.userData.elementId;
              idB = obj.userData.elementIdB;
            } else if (modelSource === 'onlyA' || modelSource === 'A') {
              idA = obj.userData.elementId;
            } else if (modelSource === 'onlyB' || modelSource === 'B') {
              idB = obj.userData.elementId;
            }

            log.info(`要素情報を表示: idA=${idA}, idB=${idB}, type=${elementType}, source=${modelSource}`);

            try {
              // displayElementInfo は async だが、await しない（パフォーマンス重視）
              displayElementInfo(idA, idB, elementType, modelSource)
                .catch(err => {
                  log.error("displayElementInfo でエラーが発生:", err);
                });
            } catch (err) {
              log.error("displayElementInfo の呼び出しでエラーが発生:", err);
            }

            try {
              // 要素をハイライト表示（3D選択機能を使用）
              selectElement3D(obj, scheduleRender);
              log.info("3D要素の選択が完了しました");
            } catch (err) {
              log.error("selectElement3D でエラーが発生:", err);
            }
          }
        }
      });

      if (!found) {
        log.warn(`3Dビューアーで要素が見つかりませんでした: ${elementType} ${elementId} (${modelSource})`);
        log.warn(`検索した要素数: ${searchedCount}`);
        if (candidateMatches.length > 0) {
          log.warn(`最初の候補オブジェクト (デバッグ用):`, candidateMatches);
        }
      }
    } catch (err) {
      log.error("ツリー要素選択処理でエラーが発生:", err);
      console.error("詳細なエラー情報:", err);
    }
  });

  // 断面ツリー表示を初期化
  initializeSectionTreeView("section-tree-container", (selectedElement) => {
    // 要素ツリーと同じ選択処理を使用
    try {
      log.info("断面ツリーから要素が選択されました:", selectedElement);

      if (!selectedElement) {
        log.error("選択された要素情報がnullまたはundefinedです");
        return;
      }

      const { elementType, elementId, modelSource } = selectedElement;

      if (!elementType || !elementId) {
        log.error("要素タイプまたはIDが指定されていません");
        return;
      }

      const elementGroup = elementGroups[elementType];
      if (!elementGroup) {
        log.warn(`要素グループが見つかりません: ${elementType}`);
        return;
      }

      log.info(`要素を検索中: タイプ=${elementType}, ID=${elementId}, ソース=${modelSource}`);

      let found = false;

      elementGroup.traverse((obj) => {
        if (found) return;

        if (obj.userData && obj.userData.elementType === elementType) {
          const objId = obj.userData.elementIdA || obj.userData.elementIdB || obj.userData.elementId;
          const objIdStr = String(objId);
          const elementIdStr = String(elementId);

          const modelSourceMatches =
            obj.userData.modelSource === modelSource ||
            (modelSource === 'onlyA' && obj.userData.modelSource === 'A') ||
            (modelSource === 'onlyB' && obj.userData.modelSource === 'B') ||
            (modelSource === 'matched' && obj.userData.modelSource === 'matched');

          if (objIdStr === elementIdStr && modelSourceMatches) {
            found = true;
            log.info(`要素が見つかりました: ${elementType} ${elementId}`);

            let idA = null, idB = null;
            if (modelSource === 'matched') {
              idA = obj.userData.elementIdA || obj.userData.elementId;
              idB = obj.userData.elementIdB;
            } else if (modelSource === 'onlyA' || modelSource === 'A') {
              idA = obj.userData.elementId;
            } else if (modelSource === 'onlyB' || modelSource === 'B') {
              idB = obj.userData.elementId;
            }

            try {
              displayElementInfo(idA, idB, elementType, modelSource)
                .catch(err => log.error("displayElementInfo エラー:", err));
            } catch (err) {
              log.error("displayElementInfo 呼び出しエラー:", err);
            }

            try {
              selectElement3D(obj, scheduleRender);
              log.info("3D要素の選択が完了しました");
            } catch (err) {
              log.error("selectElement3D エラー:", err);
            }
          }
        }
      });

      if (!found) {
        log.warn(`3Dビューアーで要素が見つかりませんでした: ${elementType} ${elementId} (${modelSource})`);
      }
    } catch (err) {
      log.error("断面ツリー要素選択処理でエラーが発生:", err);
      console.error("詳細なエラー情報:", err);
    }
  });

  // グループ化モードの変更イベントリスナー
  const groupingModeSelect = document.getElementById("section-grouping-mode");
  if (groupingModeSelect) {
    groupingModeSelect.addEventListener("change", (e) => {
      const newMode = e.target.value;
      log.info(`断面ツリーのグループ化モードを変更: ${newMode}`);
      setGroupingMode(newMode);

      // 現在の比較結果と断面データで再構築
      const comparisonResult = getState("comparisonResults");
      const sectionsData = getState("sectionsData");
      if (comparisonResult && sectionsData) {
        const treeData = convertComparisonResultsForTree(comparisonResult);
        buildSectionTree(treeData, sectionsData);
      }
    });
  }

  // 比較キー選択UIを初期化
  initializeComparisonKeySelector(
    "#comparison-key-selector-container",
    async (newKeyType) => {
      log.info(`比較キータイプが変更されました: ${newKeyType}`);

      const fileAInput = document.getElementById("fileA");
      const fileBInput = document.getElementById("fileB");
      const hasFiles = fileAInput?.files[0] || fileBInput?.files[0];

      if (hasFiles) {
        log.info("再比較を実行します...");
        await window.compareModels();
        log.info("再比較が完了しました");
      } else {
        log.warn("再比較をスキップしました: モデルが読み込まれていません");
      }
    }
  );
  log.info("比較キー選択UIが初期化されました");
}

/**
 * ボタンイベントリスナーのセットアップ
 * @private
 */
function setupButtonEventListeners() {
  // 比較ボタン
  const compareBtn = document.getElementById("compareButton");
  if (compareBtn) {
    compareBtn.addEventListener("click", window.compareModels);
  } else {
    log.error("比較ボタンが見つかりません。");
  }

  // 重要度設定ボタン
  const importanceBtn = document.getElementById("toggleImportanceBtn");
  if (importanceBtn) {
    importanceBtn.addEventListener("click", toggleImportancePanel);
  } else {
    log.error("重要度ボタンが見つかりません。");
  }

  // 配置基準線表示切り替え
  const placementLinesToggle = document.getElementById("togglePlacementLines");
  if (placementLinesToggle) {
    placementLinesToggle.addEventListener("change", (event) => {
      const isVisible = event.target.checked;
      togglePlacementLinesVisibility(isVisible);
      log.info(`配置基準線の表示状態を設定しました: ${isVisible}`);
    });
  } else {
    log.warn("配置基準線切り替えボタンが見つかりません。");
  }
}

/**
 * 統合システムの初期化（重要度、アウトライン）
 * @private
 */
function initializeIntegratedSystems() {
  // 重要度統合機能の初期化
  initializeImportancePanel(document.body);

  // 重要度関連システムの初期化
  const { filter, indicator } = initializeImportanceFilterSystem(document.body);
  const statistics = initializeImportanceStatistics(document.body);
  const bulkOperations = initializeBulkImportanceOperations(document.body);

  // アウトラインシステム初期化
  initializeOutlineSystem();

  // グローバル状態に登録
  setState("importanceSystem.filter", filter);
  setState("importanceSystem.statistics", statistics);
  setState("importanceSystem.bulkOperations", bulkOperations);
  setState("importanceSystem.filterIndicator", indicator);

  log.info("重要度統合システムが初期化されました");

  // テスト用グローバル関数
  window.toggleImportanceStatistics = () => statistics.toggle();
  window.toggleBulkOperations = () => bulkOperations.toggle();
  window.toggleImportanceFilter = () => filter.setEnabled(!filter.isEnabled);
}

/**
 * 開発/テストツールのセットアップ
 * @private
 */
function setupDevelopmentTools() {
  // パフォーマンス統計表示関数とリセット関数を追加
  import("./colorModes.js").then(
    ({
      showImportancePerformanceStats,
      resetImportanceColors,
      resetElementColors,
      resetSchemaColors,
    }) => {
      window.showImportancePerformanceStats = showImportancePerformanceStats;
      window.resetImportanceColors = resetImportanceColors;
      window.resetElementColors = resetElementColors;
      window.resetSchemaColors = resetSchemaColors;
    }
  );

  // テストページからのメッセージ受信処理
  window.addEventListener("message", (event) => {
    if (event.data && event.data.action === "testPlacementLinesToggle") {
      const placementLinesToggle = document.getElementById(
        "togglePlacementLines"
      );
      if (placementLinesToggle) {
        placementLinesToggle.checked = !placementLinesToggle.checked;
        placementLinesToggle.dispatchEvent(new Event("change"));
        console.log(
          `テスト経由で配置基準線を切り替えました: ${placementLinesToggle.checked}`
        );
      }
    }

    if (event.data && event.data.action === "loadSample") {
      try {
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = ".stb";
        fileInput.style.display = "none";
        document.body.appendChild(fileInput);

        fileInput.addEventListener("change", (e) => {
          if (e.target.files.length > 0) {
            const file = e.target.files[0];
            if (window.compareModels) {
              window.compareModels([file]);
            }
          }
          document.body.removeChild(fileInput);
        });

        fileInput.click();
      } catch (error) {
        console.error("ファイル選択の実行エラー:", error);
      }
    }
  });
}

// --- DOMContentLoaded イベントリスナー ---
document.addEventListener("DOMContentLoaded", async () => {
  if (await initRenderer()) {
    rendererInitialized = true;
    setState("rendering.rendererInitialized", true);
    updateMaterialClippingPlanes();
    log.info("DOMContentLoadedイベントでレンダラーが正常に初期化されました。");

    // 診断/デバッグ用グローバルをセットアップ
    setupDebugGlobals();

    // 必要なモジュールを初期化
    await initializeRequiredModules();

    // アプリケーションを起動
    startApp();

    // UIコンポーネントを初期化
    initializeUIComponents();
  } else {
    log.error(
      "レンダラーの初期化に失敗しました。アプリケーションを開始できません。"
    );
    alert("3Dビューアの初期化に失敗しました。");
  }

  // ボタンイベントリスナーをセットアップ
  setupButtonEventListeners();

  // 統合システムを初期化
  initializeIntegratedSystems();

  // 開発/テストツールをセットアップ
  setupDevelopmentTools();
});

/**
 * 配置基準線の表示切り替え
 * @param {boolean} isVisible - 表示するかどうか
 */
function togglePlacementLinesVisibility(isVisible) {
  try {
    if (!scene) {
      log.warn("配置基準線切り替えのためのシーンが利用できません");
      return;
    }

    // すべてのメッシュオブジェクトを探索して配置基準線を切り替え
    scene.traverse((object) => {
      if (object.userData && object.userData.isPlacementLine) {
        object.visible = isVisible;
      }
    });

    log.info(`配置基準線の表示状態を切り替えました: ${isVisible}`);
  } catch (error) {
    log.error("配置基準線の表示切り替えでエラーが発生しました:", error);
  }
}

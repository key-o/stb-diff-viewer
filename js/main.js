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
import * as THREE from 'three';
import { createLogger, Logger as AppLogger } from './utils/logger.js';
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
  getActiveCamera
} from './viewer/index.js';
import { compareModels } from './modelLoader.js';
import {
  setupInteractionListeners,
  getSelectedCenter,
  selectElement3D,
  selectMultipleElements3D
} from './interaction.js';
import {
  setupViewModeListeners,
  setupCameraModeListeners
} from './viewModes.js';
import { setupColorModeListeners } from './colorModes.js';
import { updateLabelVisibility } from './ui/unifiedLabelManager.js';
import { getCameraMode } from './viewer/camera/cameraManager.js';
import {
  setupUIEventListeners,
  toggleLegend,
  applyStoryClip,
  applyAxisClip
} from './ui.js';
import {
  initDepth2DClippingUI,
  adjustDepth2DClippingRangeFromModel
} from './ui/clipping2D.js';
import { displayElementInfo } from './viewer/ui/elementInfoDisplay.js';
import { regenerateAllLabels } from './ui/labelRegeneration.js';
import {
  setState,
  getState,
  registerGlobalFunction,
  enableStateDebug
} from './core/globalState.js';
import { initializeSettingsManager } from './core/settingsManager.js';
import { initializeGlobalMessenger } from './core/moduleMessaging.js';
import { IFCConverter, IFCConverterUI } from './api/ifcConverter.js';
import { initializeImportanceManager } from './core/importanceManager.js';
import {
  initializeImportancePanel,
  getImportancePanel
} from './ui/importancePanel.js';
import { initializeImportanceFilterSystem } from './ui/importanceFilter.js';
import { initializeImportanceStatistics } from './ui/statistics.js';
import { initializeBulkImportanceOperations } from './ui/bulkImportanceOperations.js';
import { initializeOutlineSystem } from './viewer/rendering/outlines.js';
import {
  setupDiffSummaryEventListeners,
  clearDiffSummary
} from './ui/diffSummary.js';
import displayModeManager from './viewer/rendering/displayModeManager.js';
import labelDisplayManager from './viewer/rendering/labelDisplayManager.js';
import { initializeComparisonKeySelector } from './ui/comparisonKeySelector.js';
import { initializeFloatingWindow } from './ui/floatingWindow.js';
import { initializeTreeView, buildTree } from './ui/elementTreeView.js';
import * as GeometryDebugger from './viewer/geometry/debug/GeometryDebugger.js';
import {
  initializeSectionTreeView,
  buildSectionTree,
  setGroupingMode
} from './ui/sectionTreeView.js';
import { initializeToleranceSettings } from './ui/toleranceSettings.js';
import { initDxfLoaderUI } from './dxfLoader.js';
import { initializeDiffListPanel, getDiffListPanel } from './ui/diffList.js';
import { UI_TIMING } from './config/uiTimingConfig.js';
import { initializeTheme, setThemeSetting, getThemeSetting } from './ui/theme.js';
import { initializeToast, showSuccess, showError, showWarning, showInfo } from './ui/toast.js';

// --- 初期化フラグ ---
let rendererInitialized = false;
const log = createLogger('app');

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
      'レンダリングをリクエストできません: レンダラーが初期化されていません'
    );
  }
}

// --- グローバル状態管理とレガシー互換性 ---
// 新しい状態管理システムに登録
registerGlobalFunction('scheduleRender', scheduleRender);
registerGlobalFunction('requestRender', scheduleRender);
setState('rendering.scheduleRender', scheduleRender);
setState('rendering.requestRender', scheduleRender);

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
    log.warn('comparisonResults is null or undefined');
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
          id: item.dataA?.id
        });
      });
    }

    // onlyA要素を変換
    if (result.onlyA && Array.isArray(result.onlyA)) {
      result.onlyA.forEach(item => {
        onlyA.push({
          elementType: elementType,
          ...item
        });
      });
    }

    // onlyB要素を変換
    if (result.onlyB && Array.isArray(result.onlyB)) {
      result.onlyB.forEach(item => {
        onlyB.push({
          elementType: elementType,
          ...item
        });
      });
    }
  }

  log.info(`ツリー用データ変換完了: matched=${matched.length}, onlyA=${onlyA.length}, onlyB=${onlyB.length}`);
  return { matched, onlyA, onlyB };
}

// --- モデル比較ボタンのクリックハンドラをグローバルに設定 ---
window.handleCompareModelsClick = async function () {
  // レンダラーが初期化されていない場合は処理中断
  if (!rendererInitialized) {
    alert('ビューアが初期化されていません。');
    return;
  }

  // モデルの読み込みと比較処理
  await compareModels(scheduleRender, { camera, controls });

  // 比較結果を取得してツリーを構築
  const comparisonResults = getState('comparisonResults');
  if (comparisonResults) {
    log.info('要素ツリーを構築しています...');
    // comparisonResultsをツリー表示用に変換
    const treeData = convertComparisonResultsForTree(comparisonResults);
    buildTree(treeData);

    // 断面ツリーも構築
    const sectionsData = getState('sectionsData');
    if (sectionsData) {
      log.info('断面ツリーを構築しています...');
      buildSectionTree(treeData, sectionsData);
    }
  }

  // 少し待ってからラベル表示状態をチェックボックスに基づいて更新
  // （ラベル作成処理の完了を待つ）
  log.info('チェックボックスの状態に基づいてラベル表示を初期化しています...');
  setTimeout(() => {
    updateLabelVisibility();
    // 再描画
    if (typeof window.requestRender === 'function') window.requestRender();
  }, UI_TIMING.LABEL_UPDATE_DELAY_MS);
};

// --- アプリケーション開始関数 ---
function startApp() {
  // グローバル関数を状態管理システムに登録
  registerGlobalFunction('toggleLegend', toggleLegend);
  registerGlobalFunction('applyStoryClip', applyStoryClip);
  registerGlobalFunction('applyAxisClip', applyAxisClip);
  registerGlobalFunction('displayElementInfo', displayElementInfo);
  registerGlobalFunction('clearClippingPlanes', clearClippingPlanes);
  registerGlobalFunction('regenerateAllLabels', regenerateAllLabels);
  registerGlobalFunction('toggleImportancePanel', toggleImportancePanel);

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
  setState('rendering.rendererInitialized', rendererInitialized);
  // 要素グループをグローバル状態に登録（重要度モードで使用）
  setState('elementGroups', elementGroups);
  enableStateDebug(true); // 開発時はデバッグ有効

  // 高度な機能の初期化
  initializeSettingsManager();
  initializeGlobalMessenger();

  // 重要度管理システムの初期化
  initializeImportanceManager()
    .then(() => {
      log.info('重要度マネージャーが初期化されました');
    })
    .catch((error) => {
      log.error('重要度マネージャーの初期化に失敗しました:', error);
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

    const el = renderer?.domElement || document.getElementById('three-canvas');
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
          'wheel',
          (event) => {
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
                  '[WARN] CameraControls instance not ready; skipping orthographic zoom.'
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
              return;
            }

            // 選択要素がある場合は選択要素中心へのズームを優先
            const center = getSelectedCenter?.();
            if (center) {
              const pt = projectWorldToClient(center, activeCamera, el);
              const move = new PointerEvent('pointermove', {
                clientX: pt.x,
                clientY: pt.y,
                pointerId: 1,
                pointerType: 'mouse',
                bubbles: true
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
    log.warn('選択範囲へのズーム動作の設定に失敗しました:', e);
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

  // 断面比較一括実行ショートカット
  window.runSectionComparison = (opts = {}) => {
    try {
      if (!window.GeometryDiagnostics) {
        console.warn('GeometryDiagnosticsモジュールがまだ読み込まれていません');
        return;
      }
      return window.GeometryDiagnostics.logDefaultSceneComparisons(
        null,
        opts.limit || 300,
        {
          tolerance: opts.tolerance ?? 0.02,
          level: opts.level || 'info'
        }
      );
    } catch (e) {
      console.error('断面比較の実行に失敗しました', e);
    }
  };
}

/**
 * 必要なモジュールの初期化（ラベル管理、XSDスキーマ）
 * @private
 */
async function initializeRequiredModules() {
  // 統合ラベル管理システムを初期化
  import('./ui/unifiedLabelManager.js').then(({ initializeLabelManager }) => {
    initializeLabelManager();
    log.info('統合ラベル管理システムが初期化されました');
  });

  // XSDスキーマを初期化
  import('./parser/xsdSchemaParser.js')
    .then(({ loadXsdSchema }) => {
      const xsdPath = './schemas/ST-Bridge202.xsd';
      loadXsdSchema(xsdPath).then((success) => {
        if (success) {
          log.info('起動時にXSDスキーマが初期化されました');
        } else {
          log.warn('起動時のXSDスキーマ初期化に失敗しました');
        }
      });
    })
    .catch((error) => {
      log.warn('XSDスキーマモジュールの読み込みに失敗しました:', error);
    });
}

/**
 * ツリービューで選択された要素を3Dビューで検索・選択する共通ハンドラ
 * @param {Object} selectedElement - 選択された要素情報
 * @param {string} selectedElement.elementType - 要素タイプ
 * @param {string|number} selectedElement.elementId - 要素ID
 * @param {string} selectedElement.modelSource - モデルソース ('matched', 'onlyA', 'onlyB')
 * @param {string} sourceName - ソース名（ログ出力用）
 * @param {boolean} [enableDebugInfo=false] - デバッグ情報を収集するか
 */
/**
 * 3Dシーンから要素を検索するヘルパー関数
 * @param {string} elementType - 要素タイプ
 * @param {string} elementId - 要素ID
 * @param {string} modelSource - モデルソース
 * @returns {THREE.Object3D|null}
 */
function find3DObjectByElement(elementType, elementId, modelSource) {
  const elementGroup = elementGroups[elementType];
  if (!elementGroup) return null;

  let foundObj = null;
  elementGroup.traverse((obj) => {
    if (foundObj) return;

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
        foundObj = obj;
      }
    }
  });

  return foundObj;
}

function handleTreeElementSelection(selectedElement, sourceName, enableDebugInfo = false) {
  if (!selectedElement) {
    log.error(`${sourceName}: 選択された要素情報がnullまたはundefinedです`);
    return;
  }

  // 複数選択の場合
  if (selectedElement.multiSelect && selectedElement.selectedElements) {
    log.info(`${sourceName}: 複数選択 (${selectedElement.selectedElements.length}要素)`);

    const objectsToSelect = [];
    for (const elem of selectedElement.selectedElements) {
      const obj = find3DObjectByElement(elem.elementType, elem.elementId, elem.modelSource);
      if (obj) {
        objectsToSelect.push(obj);
      }
    }

    if (objectsToSelect.length > 0) {
      selectMultipleElements3D(objectsToSelect, scheduleRender);
      log.info(`${sourceName}: ${objectsToSelect.length}個の3D要素を選択しました`);
    } else {
      log.warn(`${sourceName}: 3Dビューアーで要素が見つかりませんでした`);
    }
    return;
  }

  // 単一選択の場合（従来の処理）
  const { elementType, elementId, modelSource } = selectedElement;

  if (!elementType || !elementId) {
    log.error(`${sourceName}: 要素タイプまたはIDが指定されていません`);
    return;
  }

  const elementGroup = elementGroups[elementType];
  if (!elementGroup) {
    log.warn(`${sourceName}: 要素グループが見つかりません: ${elementType}`);
    if (enableDebugInfo) {
      log.warn('利用可能な要素グループ:', Object.keys(elementGroups));
    }
    return;
  }

  log.info(`${sourceName}: 要素を検索中: タイプ=${elementType}, ID=${elementId}, ソース=${modelSource}`);

  let found = false;
  let searchedCount = 0;
  const candidateMatches = enableDebugInfo ? [] : null;

  elementGroup.traverse((obj) => {
    if (found) return;

    if (obj.userData && obj.userData.elementType === elementType) {
      searchedCount++;

      // デバッグ用: 最初の5個の候補を記録
      if (candidateMatches && candidateMatches.length < 5) {
        const objId = obj.userData.elementIdA || obj.userData.elementIdB || obj.userData.elementId;
        candidateMatches.push({
          objId: objId,
          objIdType: typeof objId,
          modelSource: obj.userData.modelSource
        });
      }

      const objId = obj.userData.elementIdA || obj.userData.elementIdB || obj.userData.elementId;
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
        log.info(`${sourceName}: 要素が見つかりました: ${elementType} ${elementId}`);

        // 要素情報を表示用のIDを決定
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

        // 要素情報を表示
        displayElementInfo(idA, idB, elementType, modelSource)
          .catch(err => log.error(`${sourceName}: displayElementInfo エラー:`, err));

        // 3D選択
        try {
          selectElement3D(obj, scheduleRender);
          log.info(`${sourceName}: 3D要素の選択が完了しました`);
        } catch (err) {
          log.error(`${sourceName}: selectElement3D エラー:`, err);
        }
      }
    }
  });

  if (!found) {
    log.warn(`${sourceName}: 3Dビューアーで要素が見つかりませんでした: ${elementType} ${elementId} (${modelSource})`);
    if (enableDebugInfo) {
      log.warn(`検索した要素数: ${searchedCount}`);
      if (candidateMatches && candidateMatches.length > 0) {
        log.warn('最初の候補オブジェクト (デバッグ用):', candidateMatches);
      }
    }
  }
}

/**
 * テーマボタンのイベントリスナーをセットアップ
 * @private
 */
function setupThemeButtonListeners() {
  const buttonGroup = document.getElementById('theme-button-group');
  if (!buttonGroup) return;

  const buttons = buttonGroup.querySelectorAll('button[data-theme]');
  buttons.forEach(button => {
    button.addEventListener('click', () => {
      const theme = button.dataset.theme;
      setThemeSetting(theme);

      // アクティブ状態を更新
      buttons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
    });
  });

  // 初期状態を設定
  const currentSetting = getThemeSetting();
  buttons.forEach(btn => {
    if (btn.dataset.theme === currentSetting) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

/**
 * UIコンポーネントの初期化
 * @private
 */
function initializeUIComponents() {
  // テーマシステムを初期化
  initializeTheme({
    onThemeChange: (theme, setting) => {
      log.info(`テーマが変更されました: ${theme} (設定: ${setting})`);
    }
  });
  setupThemeButtonListeners();
  log.info('テーマシステムが初期化されました');

  // トースト通知システムを初期化
  initializeToast({
    position: 'bottom-right',
    duration: 4000,
    maxToasts: 5
  });
  log.info('トースト通知システムが初期化されました');

  // グローバルにトースト関数を公開
  window.showToast = { showSuccess, showError, showWarning, showInfo };

  // フローティングウィンドウを初期化
  initializeFloatingWindow();

  // 要素ツリー表示を初期化
  initializeTreeView('element-tree-container', (selectedElement) => {
    try {
      log.info('要素ツリーから要素が選択されました:', selectedElement);
      handleTreeElementSelection(selectedElement, '要素ツリー', true);
    } catch (err) {
      log.error('要素ツリー選択処理でエラーが発生:', err);
      console.error('詳細なエラー情報:', err);
    }
  });

  // 断面ツリー表示を初期化（要素ツリーと同じハンドラを使用）
  initializeSectionTreeView('section-tree-container', (selectedElement) => {
    try {
      log.info('断面ツリーから要素が選択されました:', selectedElement);
      handleTreeElementSelection(selectedElement, '断面ツリー', false);
    } catch (err) {
      log.error('断面ツリー選択処理でエラーが発生:', err);
      console.error('詳細なエラー情報:', err);
    }
  });

  // グループ化モードの変更イベントリスナー
  const groupingModeSelect = document.getElementById('section-grouping-mode');
  if (groupingModeSelect) {
    groupingModeSelect.addEventListener('change', (e) => {
      const newMode = e.target.value;
      log.info(`断面ツリーのグループ化モードを変更: ${newMode}`);
      setGroupingMode(newMode);

      // 現在の比較結果と断面データで再構築
      const comparisonResult = getState('comparisonResults');
      const sectionsData = getState('sectionsData');
      if (comparisonResult && sectionsData) {
        const treeData = convertComparisonResultsForTree(comparisonResult);
        buildSectionTree(treeData, sectionsData);
      }
    });
  }

  // 比較キー選択UIを初期化
  initializeComparisonKeySelector(
    '#comparison-key-selector-container',
    async (newKeyType) => {
      log.info(`比較キータイプが変更されました: ${newKeyType}`);

      const fileAInput = document.getElementById('fileA');
      const fileBInput = document.getElementById('fileB');
      const hasFiles = fileAInput?.files[0] || fileBInput?.files[0];

      if (hasFiles) {
        log.info('再比較を実行します...');
        await window.handleCompareModelsClick();
        log.info('再比較が完了しました');
      } else {
        log.warn('再比較をスキップしました: モデルが読み込まれていません');
      }
    }
  );
  log.info('比較キー選択UIが初期化されました');

  // 許容差設定パネルを初期化
  const toleranceContainer = document.getElementById('tolerance-settings-container');
  if (toleranceContainer) {
    initializeToleranceSettings(toleranceContainer);
    log.info('許容差設定パネルを初期化しました');
  } else {
    log.warn('許容差設定コンテナー #tolerance-settings-container が見つかりません');
  }

  // DXFローダーUIを初期化
  initDxfLoaderUI();
  log.info('DXFローダーUIを初期化しました');
}

/**
 * ボタンイベントリスナーのセットアップ
 * @private
 */
function setupButtonEventListeners() {
  // 比較ボタン
  const compareBtn = document.getElementById('compareButton');
  if (compareBtn) {
    compareBtn.addEventListener('click', window.handleCompareModelsClick);
  } else {
    log.error('比較ボタンが見つかりません。');
  }

  // 重要度設定ボタン
  const importanceBtn = document.getElementById('toggleImportanceBtn');
  if (importanceBtn) {
    importanceBtn.addEventListener('click', toggleImportancePanel);
  } else {
    log.error('重要度ボタンが見つかりません。');
  }

  // 配置基準線表示切り替え
  const placementLinesToggle = document.getElementById('togglePlacementLines');
  if (placementLinesToggle) {
    placementLinesToggle.addEventListener('change', (event) => {
      const isVisible = event.target.checked;
      togglePlacementLinesVisibility(isVisible);
      log.info(`配置基準線の表示状態を設定しました: ${isVisible}`);
    });
  } else {
    log.warn('配置基準線切り替えボタンが見つかりません。');
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

  // 差分一覧パネルの初期化
  const diffListPanel = initializeDiffListPanel(document.body);

  // グローバル状態に登録
  setState('importanceSystem.filter', filter);
  setState('importanceSystem.statistics', statistics);
  setState('importanceSystem.bulkOperations', bulkOperations);
  setState('importanceSystem.filterIndicator', indicator);
  setState('diffListPanel', diffListPanel);

  log.info('重要度統合システムが初期化されました');

  // テスト用グローバル関数
  window.toggleImportanceStatistics = () => statistics.toggle();
  window.toggleBulkOperations = () => bulkOperations.toggle();
  window.toggleImportanceFilter = () => filter.setEnabled(!filter.isEnabled);
  window.toggleDiffList = () => diffListPanel.toggle();
}

/**
 * 開発/テストツールのセットアップ
 * @private
 */
function setupDevelopmentTools() {
  // パフォーマンス統計表示関数とリセット関数を追加
  import('./colorModes.js').then(
    ({
      showImportancePerformanceStats,
      resetImportanceColors,
      resetElementColors,
      resetSchemaColors
    }) => {
      window.showImportancePerformanceStats = showImportancePerformanceStats;
      window.resetImportanceColors = resetImportanceColors;
      window.resetElementColors = resetElementColors;
      window.resetSchemaColors = resetSchemaColors;
    }
  );

  // テストページからのメッセージ受信処理
  window.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'testPlacementLinesToggle') {
      const placementLinesToggle = document.getElementById(
        'togglePlacementLines'
      );
      if (placementLinesToggle) {
        placementLinesToggle.checked = !placementLinesToggle.checked;
        placementLinesToggle.dispatchEvent(new Event('change'));
      }
    }

    if (event.data && event.data.action === 'loadSample') {
      try {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.stb';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        fileInput.addEventListener('change', (e) => {
          if (e.target.files.length > 0) {
            const file = e.target.files[0];
            if (window.handleCompareModelsClick) {
              window.handleCompareModelsClick([file]);
            }
          }
          document.body.removeChild(fileInput);
        });

        fileInput.click();
      } catch (error) {
        console.error('ファイル選択の実行エラー:', error);
      }
    }
  });
}

// --- DOMContentLoaded イベントリスナー ---
document.addEventListener('DOMContentLoaded', async () => {
  if (await initRenderer()) {
    rendererInitialized = true;
    setState('rendering.rendererInitialized', true);
    updateMaterialClippingPlanes();
    log.info('DOMContentLoadedイベントでレンダラーが正常に初期化されました。');

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
      'レンダラーの初期化に失敗しました。アプリケーションを開始できません。'
    );
    alert('3Dビューアの初期化に失敗しました。');
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
      log.warn('配置基準線切り替えのためのシーンが利用できません');
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
    log.error('配置基準線の表示切り替えでエラーが発生しました:', error);
  }
}

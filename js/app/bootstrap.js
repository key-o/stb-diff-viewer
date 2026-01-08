/**
 * @fileoverview アプリケーションブートストラップ
 *
 * アプリケーションの起動シーケンスを管理します:
 * - レンダラーの初期化
 * - 各種リスナーのセットアップ
 * - UIコンポーネントの初期化
 */

import * as THREE from 'three';
import { createLogger } from '../utils/logger.js';
import { setState, registerGlobalFunction } from './globalState.js';
import {
  scene,
  camera,
  controls,
  renderer,
  elementGroups,
  initRenderer,
  animate,
  setupViewportResizeHandler,
  updateMaterialClippingPlanes,
  createOrUpdateGridHelper,
  clearClippingPlanes,
  getActiveCamera,
} from '../viewer/index.js';
import { setupInteractionListeners, getSelectedCenter } from '../interaction.js';
import { setupViewModeListeners, setupCameraModeListeners } from '../viewModes.js';
import { setupColorModeListeners } from '../colorModes/index.js';
import { setupUIEventListeners, toggleLegend, applyStoryClip, applyAxisClip } from '../ui.js';
import { initDepth2DClippingUI } from '../ui/clipping2DImpl.js';
import { displayElementInfo } from '../viewer/ui/element-info/index.js';
import { regenerateAllLabels } from '../ui/labelRegeneration.js';
import { IFCConverter, IFCConverterUI } from '../export/api/ifcConverter.js';
import displayModeManager from '../viewer/rendering/displayModeManager.js';
import labelDisplayManager from '../viewer/rendering/labelDisplayManager.js';
import {
  initLoadDisplayManager,
  getLoadDisplayManager,
} from '../viewer/rendering/loadDisplayManager.js';
import { initKeyboardShortcuts } from '../viewer/interaction/keyboard-shortcuts.js';
import { appInitializer } from './AppInitializer.js';
import { showError } from '../ui/toast.js';

const log = createLogger('bootstrap');

// --- 初期化フラグ ---
let rendererInitialized = false;

// 2Dズーム感度と制限値
const ORTHOGRAPHIC_ZOOM_FACTOR = 0.001;
const ORTHOGRAPHIC_MIN_ZOOM = 0.01;
const ORTHOGRAPHIC_MAX_ZOOM = 50;

/**
 * 再描画をリクエストする関数
 */
export function scheduleRender() {
  if (rendererInitialized) {
    const activeCamera = getActiveCamera();
    if (renderer && scene && activeCamera) {
      renderer.render(scene, activeCamera);
    }
  } else {
    log.warn('レンダリングをリクエストできません: レンダラーが初期化されていません');
  }
}

/**
 * レンダラー初期化状態を取得
 * @returns {boolean}
 */
export function isRendererInitialized() {
  return rendererInitialized;
}

/**
 * グローバル関数の登録
 */
function registerGlobalFunctions() {
  registerGlobalFunction('scheduleRender', scheduleRender);
  registerGlobalFunction('requestRender', scheduleRender);
  setState('rendering.scheduleRender', scheduleRender);
  setState('rendering.requestRender', scheduleRender);

  // レガシー互換性
  window.requestRender = scheduleRender;
  window.displayModeManager = displayModeManager;
  window.labelDisplayManager = labelDisplayManager;
  window.getLoadDisplayManager = getLoadDisplayManager;
}

/**
 * アプリケーション起動処理
 */
function startApp() {
  // グローバル関数を状態管理システムに登録
  registerGlobalFunction('toggleLegend', toggleLegend);
  registerGlobalFunction('applyStoryClip', applyStoryClip);
  registerGlobalFunction('applyAxisClip', applyAxisClip);
  registerGlobalFunction('displayElementInfo', displayElementInfo);
  registerGlobalFunction('clearClippingPlanes', clearClippingPlanes);
  registerGlobalFunction('regenerateAllLabels', regenerateAllLabels);

  // レガシー互換性
  window.toggleLegend = toggleLegend;
  window.applyStoryClip = applyStoryClip;
  window.applyAxisClip = applyAxisClip;
  window.displayElementInfo = displayElementInfo;
  window.clearClippingPlanes = clearClippingPlanes;

  // IFC変換機能の初期化
  const ifcConverter = new IFCConverter();
  new IFCConverterUI(ifcConverter);
  window.ifcConverter = ifcConverter;

  // 状態管理システムの初期化
  setState('rendering.rendererInitialized', rendererInitialized);
  setState('elementGroups', elementGroups);

  // コアシステムの初期化
  appInitializer.initializeCoreSystem();

  // イベントリスナーの設定
  setupUIEventListeners();
  setupViewportResizeHandler(camera);
  setupInteractionListeners(scheduleRender);
  setupViewModeListeners(scheduleRender);
  setupCameraModeListeners(scheduleRender);
  initDepth2DClippingUI();
  setupColorModeListeners();
  initKeyboardShortcuts();

  import('../ui/diffSummary.js').then(({ setupDiffSummaryEventListeners }) => {
    setupDiffSummaryEventListeners();
  });

  // アニメーションループ開始
  animate(controls, scene);
  createOrUpdateGridHelper(new THREE.Box3());

  // ズーム設定
  setupZoomBehavior();
}

/**
 * ズーム動作のセットアップ
 */
function setupZoomBehavior() {
  try {
    const el = renderer?.domElement || document.getElementById('three-canvas');
    if (el && !el.hasWheelListener) {
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
          const isOrthographic = activeCamera && activeCamera.isOrthographicCamera;

          if (isOrthographic && activeCamera) {
            event.preventDefault();
            event.stopPropagation();

            const deltaZoom = -event.deltaY * ORTHOGRAPHIC_ZOOM_FACTOR;
            if (!controls?._cc) {
              console.warn('[WARN] CameraControls instance not ready');
              return;
            }

            const minZoom = controls._cc.minZoom ?? ORTHOGRAPHIC_MIN_ZOOM;
            const maxZoom = controls._cc.maxZoom ?? ORTHOGRAPHIC_MAX_ZOOM;
            const targetZoom = THREE.MathUtils.clamp(
              activeCamera.zoom + deltaZoom,
              minZoom,
              maxZoom,
            );
            controls._cc.zoomTo(targetZoom, false);
            controls._cc.update(0);
            return;
          }

          const center = getSelectedCenter?.();
          if (center) {
            const pt = projectWorldToClient(center, activeCamera, el);
            // eslint-disable-next-line no-undef
            const move = new PointerEvent('pointermove', {
              clientX: pt.x,
              clientY: pt.y,
              pointerId: 1,
              pointerType: 'mouse',
              bubbles: true,
            });
            el.dispatchEvent(move);
          }
        },
        { capture: true, passive: false },
      );
    }
  } catch (e) {
    log.warn('選択範囲へのズーム動作の設定に失敗しました:', e);
  }
}

/**
 * ブートストラップ処理（DOMContentLoaded時に呼び出し）
 */
export async function bootstrap() {
  // グローバル関数を登録
  registerGlobalFunctions();

  // レンダラーを初期化
  if (await initRenderer()) {
    rendererInitialized = true;
    setState('rendering.rendererInitialized', true);
    updateMaterialClippingPlanes();
    log.info('レンダラーが正常に初期化されました');

    // デバッグ用グローバルをセットアップ
    await appInitializer.setupDebugGlobals();

    // LoadDisplayManagerを初期化
    initLoadDisplayManager(scene);
    log.info('LoadDisplayManagerが初期化されました');

    // 必要なモジュールを初期化
    await appInitializer.initializeRequiredModules();

    // アプリケーションを起動
    startApp();

    // 開発ツールをセットアップ
    await appInitializer.setupDevelopmentTools();

    return true;
  } else {
    log.error('レンダラーの初期化に失敗しました');
    showError('3Dビューアの初期化に失敗しました。');
    return false;
  }
}

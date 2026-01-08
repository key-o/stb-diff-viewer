/**
 * @fileoverview アプリケーションコアの初期化
 */

import * as THREE from 'three';
import { createLogger } from '../../utils/logger.js';
import {
  scene,
  camera,
  controls,
  renderer,
  elementGroups,
  animate,
  setupViewportResizeHandler,
  createOrUpdateGridHelper,
  getActiveCamera,
} from '../../viewer/index.js';
import { setupInteractionListeners, getSelectedCenter } from '../../interaction.js';
import { setupViewModeListeners, setupCameraModeListeners } from '../../viewModes.js';
import { setupColorModeListeners } from '../../colorModes/index.js';
import { setupUIEventListeners, toggleLegend, applyStoryClip, applyAxisClip } from '../../ui.js';
import { initDepth2DClippingUI } from '../../ui/clipping2DImpl.js';
import { displayElementInfo } from '../../viewer/ui/element-info/index.js';
import { regenerateAllLabels } from '../../ui/labelRegeneration.js';
import { clearClippingPlanes } from '../../viewer/index.js';
import { setState, registerGlobalFunction } from '../globalState.js';
import { viewerEventBridge } from '../../viewer/services/viewerEventBridge.js';
import { initializeSettingsManager } from '../settingsManager.js';
import { initializeGlobalMessenger } from '../moduleMessaging.js';
import { IFCConverter, IFCConverterUI } from '../../export/api/ifcConverter.js';
import { initializeImportanceManager } from '../importanceManager.js';
import { setupDiffSummaryEventListeners } from '../../ui/diffSummary.js';
import { initKeyboardShortcuts } from '../../viewer/interaction/keyboard-shortcuts.js';
import { initializeViewCube } from '../../viewer/ui/viewCube/ViewCube.js';
import { CAMERA_ORTHOGRAPHIC } from '../../config/renderingConstants.js';

const log = createLogger('appInitializer');

// 2Dズーム感度と制限値（CameraControls に委譲する前提で使用）
const ORTHOGRAPHIC_ZOOM_FACTOR = CAMERA_ORTHOGRAPHIC.ZOOM_FACTOR;
const ORTHOGRAPHIC_MIN_ZOOM = CAMERA_ORTHOGRAPHIC.MIN_ZOOM;
const ORTHOGRAPHIC_MAX_ZOOM = CAMERA_ORTHOGRAPHIC.MAX_ZOOM;

/**
 * グローバル関数を状態管理システムに登録
 * @param {Function} scheduleRender - 再描画関数
 */
function registerGlobalFunctions(scheduleRender) {
  registerGlobalFunction('toggleLegend', toggleLegend);
  registerGlobalFunction('applyStoryClip', applyStoryClip);
  registerGlobalFunction('applyAxisClip', applyAxisClip);
  registerGlobalFunction('displayElementInfo', displayElementInfo);
  registerGlobalFunction('clearClippingPlanes', clearClippingPlanes);
  registerGlobalFunction('regenerateAllLabels', regenerateAllLabels);
  registerGlobalFunction('scheduleRender', scheduleRender);
  registerGlobalFunction('requestRender', scheduleRender);

  // レガシー互換性のためwindowにも登録
  window.toggleLegend = toggleLegend;
  window.applyStoryClip = applyStoryClip;
  window.applyAxisClip = applyAxisClip;
  window.displayElementInfo = displayElementInfo;
  window.clearClippingPlanes = clearClippingPlanes;
  window.requestRender = scheduleRender;

  setState('rendering.scheduleRender', scheduleRender);
  setState('rendering.requestRender', scheduleRender);

  log.info('グローバル関数を登録しました');
}

/**
 * IFC変換機能を初期化
 */
function initializeIFCConverter() {
  const ifcConverter = new IFCConverter();
  new IFCConverterUI(ifcConverter); // UI initialization - result not used directly
  window.ifcConverter = ifcConverter; // グローバルアクセス用
  log.info('IFC変換機能を初期化しました');
}

/**
 * 選択範囲へのズーム動作を設定
 */
function setupZoomToCursor() {
  try {
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
            const isOrthographic = activeCamera && activeCamera.isOrthographicCamera;

            // OrthographicCameraの場合はCameraControlsにズーム処理を委譲
            if (isOrthographic && activeCamera) {
              event.preventDefault();
              event.stopPropagation(); // CameraControlsの処理を止める

              const deltaZoom = -event.deltaY * ORTHOGRAPHIC_ZOOM_FACTOR;
              if (!controls?._cc) {
                log.warn(
                  '[WARN] CameraControls instance not ready; skipping orthographic zoom.',
                );
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

            // 選択要素がある場合は選択要素中心へのズームを優先
            const center = getSelectedCenter?.();
            if (center) {
              const pt = projectWorldToClient(center, activeCamera, el);
              const move = new PointerEvent('pointermove', {
                clientX: pt.x,
                clientY: pt.y,
                pointerId: 1,
                pointerType: 'mouse',
                bubbles: true,
              });
              el.dispatchEvent(move);
            }
            // PerspectiveCameraの場合はCameraControlsに任せる
          },
          { capture: true, passive: false }, // captureフェーズでCameraControlsより先に処理
        );

        log.info('選択範囲へのズーム動作を設定しました');
      }
    }
  } catch (e) {
    log.warn('選択範囲へのズーム動作の設定に失敗しました:', e);
  }
}

/**
 * アプリケーションコアを初期化
 * @param {Function} scheduleRender - 再描画関数
 * @param {boolean} rendererInitialized - レンダラー初期化フラグ
 */
export function initializeApp(scheduleRender, rendererInitialized) {
  // グローバル関数を状態管理システムに登録
  registerGlobalFunctions(scheduleRender);

  // IFC変換機能の初期化
  initializeIFCConverter();

  // 状態管理システムの初期化
  setState('rendering.rendererInitialized', rendererInitialized);
  setState('rendering.scene', scene);
  // 要素グループをグローバル状態に登録（重要度モードで使用）
  setState('elementGroups', elementGroups);

  // 高度な機能の初期化
  initializeSettingsManager();
  initializeGlobalMessenger();

  // ViewerEventBridgeの初期化（UI層とViewer層の通信ブリッジ）
  viewerEventBridge.initialize();
  log.info('ViewerEventBridgeを初期化しました');

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
  initKeyboardShortcuts(); // キーボードショートカットの初期化

  // アニメーションループを開始
  animate(controls, scene);
  createOrUpdateGridHelper(new THREE.Box3());

  // ViewCubeナビゲーションUIを初期化
  initializeViewCube();
  log.info('ViewCubeが初期化されました');

  // 選択範囲へのズーム動作を設定
  setupZoomToCursor();

  log.info('アプリケーションコアの初期化が完了しました');
}

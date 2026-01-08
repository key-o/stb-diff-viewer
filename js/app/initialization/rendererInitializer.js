/**
 * @fileoverview 3Dレンダラーと関連システムの初期化
 */

import * as THREE from 'three';
import { createLogger } from '../../utils/logger.js';
import {
  scene,
  camera,
  renderer,
  controls,
  initRenderer,
  updateMaterialClippingPlanes,
} from '../../viewer/index.js';
import { initLoadDisplayManager, getLoadDisplayManager } from '../../viewer/rendering/loadDisplayManager.js';
import * as GeometryDebugger from '../../viewer/geometry/debug/GeometryDebugger.js';

const log = createLogger('rendererInitializer');

/**
 * デバッグ用グローバルオブジェクトのセットアップ
 */
export function setupDebugGlobals() {
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
        log.warn('GeometryDiagnosticsモジュールがまだ読み込まれていません');
        return;
      }
      return window.GeometryDiagnostics.logDefaultSceneComparisons(null, opts.limit || 300, {
        tolerance: opts.tolerance ?? 0.02,
        level: opts.level || 'info',
      });
    } catch (e) {
      log.error('断面比較の実行に失敗しました', e);
    }
  };

  log.info('デバッグ用グローバルオブジェクトをセットアップしました');
}

/**
 * レンダラーと関連システムを初期化
 * @returns {Promise<boolean>} 初期化成功フラグ
 */
export async function initializeRenderer() {
  if (await initRenderer()) {
    updateMaterialClippingPlanes();
    log.info('レンダラーが正常に初期化されました');

    // 診断/デバッグ用グローバルをセットアップ
    setupDebugGlobals();

    // LoadDisplayManagerを初期化
    initLoadDisplayManager(scene);
    log.info('LoadDisplayManagerが初期化されました');

    return true;
  } else {
    log.error('レンダラーの初期化に失敗しました');
    return false;
  }
}

/**
 * マネージャーをグローバルに公開（デバッグ用）
 * @param {Object} managers - 公開するマネージャー
 */
export function exposeManagers(managers) {
  window.displayModeManager = managers.displayModeManager;
  window.labelDisplayManager = managers.labelDisplayManager;
  window.getLoadDisplayManager = getLoadDisplayManager;
  log.info('マネージャーをグローバルに公開しました');
}

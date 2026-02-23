/**
 * @fileoverview WebXR ARセッション管理モジュール
 *
 * ARモードの開始・終了、ヒットテスト、DOM Overlay設定を管理します。
 * 既存のレンダリングパイプラインへの影響を最小限に抑える設計です。
 */

import * as THREE from 'three';
import { createLogger } from '../../utils/logger.js';
import {
  renderer,
  controls,
  scene,
  getActiveCamera,
  elementGroups,
  gridHelper,
  axesHelper,
  setXRSessionActive,
  setXRFrameHandler,
} from '../core/core.js';
import { ArPlacement } from './arPlacement.js';

const log = createLogger('viewer/ar/arSessionManager');

/** mm→m スケール変換係数 */
const MM_TO_M = 0.001;
/** AR初期配置時の最低距離（m） */
const DEFAULT_INITIAL_PLACEMENT_DISTANCE_M = 10;

/**
 * ARセッションマネージャ
 * WebXR immersive-ar セッションのライフサイクルを管理
 */
export class ArSessionManager {
  constructor() {
    /** @type {XRSession|null} */
    this._session = null;
    /** @type {XRReferenceSpace|null} */
    this._refSpace = null;
    /** @type {XRHitTestSource|null} */
    this._hitTestSource = null;
    /** @type {ArPlacement} */
    this._placement = new ArPlacement(scene);
    /** @type {boolean} */
    this._isSupported = false;
    /** @type {THREE.Group} AR空間用のルートグループ（スケール変換用） */
    this._arRoot = null;
    /** @type {Map<THREE.Object3D, THREE.Object3D>} 元の親を記憶 */
    this._originalParents = new Map();
    /** @type {Function|null} セッション終了コールバック */
    this._onSessionEnd = null;
    /** @type {boolean|undefined} */
    this._gridWasVisible = undefined;
    /** @type {boolean|undefined} */
    this._axesWasVisible = undefined;
    /** @type {THREE.Color|THREE.Texture|null|undefined} AR開始前の背景 */
    this._originalBackground = undefined;
    /** @type {boolean|undefined} AR開始前のコントロール有効状態 */
    this._controlsWasEnabled = undefined;
  }

  /**
   * WebXR AR対応を確認
   * @returns {Promise<boolean>}
   */
  async checkSupport() {
    if (!navigator.xr) {
      log.info('WebXR APIが利用できません');
      this._isSupported = false;
      return false;
    }
    try {
      this._isSupported = await navigator.xr.isSessionSupported('immersive-ar');
      log.info(`WebXR AR対応: ${this._isSupported}`);
      return this._isSupported;
    } catch (e) {
      log.warn('WebXR ARサポートチェックに失敗:', e);
      this._isSupported = false;
      return false;
    }
  }

  /**
   * AR対応かどうか
   * @returns {boolean}
   */
  get isSupported() {
    return this._isSupported;
  }

  /**
   * ARセッションがアクティブかどうか
   * @returns {boolean}
   */
  get isActive() {
    return this._session !== null;
  }

  /**
   * ARセッションを開始
   * @param {Object} options
   * @param {HTMLElement} [options.domOverlayRoot] - DOM Overlay用のルート要素
   * @param {Function} [options.onSessionEnd] - セッション終了時のコールバック
   * @returns {Promise<boolean>} 開始成功
   */
  async startSession({ domOverlayRoot, onSessionEnd } = {}) {
    if (this._session) {
      log.warn('ARセッションは既にアクティブです');
      return false;
    }
    if (!renderer) {
      log.error('レンダラーが初期化されていません');
      return false;
    }

    try {
      // セッションオプション構築
      const sessionInit = {
        requiredFeatures: ['hit-test', 'local-floor'],
        optionalFeatures: ['dom-overlay'],
      };
      if (domOverlayRoot) {
        sessionInit.domOverlay = { root: domOverlayRoot };
      }

      const session = await navigator.xr.requestSession('immersive-ar', sessionInit);
      this._session = session;
      this._onSessionEnd = onSessionEnd || null;

      // レンダラーにセッションを設定
      await renderer.xr.setSession(session);

      // 参照空間の取得
      this._refSpace = await session.requestReferenceSpace('local-floor');

      // ヒットテストソースの初期化
      const viewerSpace = await session.requestReferenceSpace('viewer');
      this._hitTestSource = await session.requestHitTestSource({ space: viewerSpace });

      // ARルートグループ作成（mm→m変換）
      this._arRoot = new THREE.Group();
      this._arRoot.scale.setScalar(MM_TO_M);
      this._arRoot.visible = false; // 配置前は非表示
      scene.add(this._arRoot);
      this._reparentModelGroupsToArRoot();
      this._hideSceneHelpersForAr();

      // シーン背景を透明に（カメラパススルー用）
      this._originalBackground = scene.background;
      scene.background = null;

      // コントロールを無効化（AR中はデバイス姿勢で制御）
      if (controls) {
        this._controlsWasEnabled = controls.enabled;
        controls.enabled = false;
      }

      // XRセッション状態を通知
      setXRSessionActive(true);
      setXRFrameHandler((frame) => this.processFrame(frame));

      // 配置マネージャを初期化
      this._placement.init(this._arRoot);

      // セッション終了イベント
      session.addEventListener('end', () => this._handleSessionEnd());

      log.info('ARセッションを開始しました');
      return true;
    } catch (e) {
      log.error('ARセッションの開始に失敗:', e);
      if (this._session) {
        try {
          await this._session.end();
        } catch (endError) {
          log.warn('失敗したARセッションの終了処理でエラーが発生しました:', endError);
        }
      }
      if (this._arRoot) {
        this._placement.dispose();
        scene.remove(this._arRoot);
        this._arRoot = null;
      }
      this._restoreModelGroupsFromArRoot();
      this._restoreSceneHelpersAfterAr();
      if (this._originalBackground !== undefined) {
        scene.background = this._originalBackground;
      }
      if (controls && this._controlsWasEnabled !== undefined) {
        controls.enabled = this._controlsWasEnabled;
      }
      setXRSessionActive(false);
      setXRFrameHandler(null);
      if (this._hitTestSource) {
        this._hitTestSource.cancel();
        this._hitTestSource = null;
      }
      this._session = null;
      this._refSpace = null;
      this._onSessionEnd = null;
      this._originalBackground = undefined;
      this._controlsWasEnabled = undefined;
      return false;
    }
  }

  /**
   * ARセッションを終了
   */
  async endSession() {
    if (this._session) {
      await this._session.end();
      // _handleSessionEnd がイベントで呼ばれる
    }
  }

  /**
   * フレームごとのヒットテスト処理
   * setAnimationLoop のコールバック内から呼ばれる想定
   * @param {XRFrame} frame
   */
  processFrame(frame) {
    if (!this._session || !this._hitTestSource || !this._refSpace) return;

    const hitTestResults = frame.getHitTestResults(this._hitTestSource);
    if (hitTestResults.length > 0) {
      const hit = hitTestResults[0];
      const pose = hit.getPose(this._refSpace);
      if (pose) {
        this._placement.updateReticle(pose.transform);
      }
      return;
    }
    this._placement.clearReticle();
  }

  /**
   * AR空間にモデルを配置（タップ時に呼ばれる）
   */
  placeModel() {
    if (!this._placement) return false;
    return this._placement.confirmPlacement({
      renderer,
      baseCamera: getActiveCamera(),
      startDistanceMeters: DEFAULT_INITIAL_PLACEMENT_DISTANCE_M,
    });
  }

  /**
   * ARモデルのスケールを調整
   * @param {number} scaleFactor - 追加のスケール係数（1.0 = 実寸）
   */
  setModelScale(scaleFactor) {
    if (this._arRoot) {
      this._arRoot.scale.setScalar(MM_TO_M * scaleFactor);
    }
  }

  /**
   * セッション終了時の内部処理
   * @private
   */
  _handleSessionEnd() {
    log.info('ARセッションが終了しました');

    // シーン背景を復元
    if (this._originalBackground !== undefined) {
      scene.background = this._originalBackground;
    }

    // コントロールを復元
    if (controls && this._controlsWasEnabled !== undefined) {
      controls.enabled = this._controlsWasEnabled;
    }

    this._restoreModelGroupsFromArRoot();
    this._restoreSceneHelpersAfterAr();

    // ARルートをクリーンアップ
    if (this._arRoot) {
      this._placement.dispose();
      scene.remove(this._arRoot);
      this._arRoot = null;
    }

    // XRセッション状態を通知
    setXRSessionActive(false);
    setXRFrameHandler(null);

    // ヒットテストソースを解放
    if (this._hitTestSource) {
      this._hitTestSource.cancel();
      this._hitTestSource = null;
    }

    const onSessionEnd = this._onSessionEnd;

    this._session = null;
    this._refSpace = null;
    this._onSessionEnd = null;
    this._originalBackground = undefined;
    this._controlsWasEnabled = undefined;

    // コールバック呼び出し
    if (onSessionEnd) {
      onSessionEnd();
    }
  }

  /**
   * モデルグループをARルートへ移動（mm座標をm換算して表示するため）
   * @private
   */
  _reparentModelGroupsToArRoot() {
    if (!this._arRoot) return;
    this._originalParents.clear();
    Object.values(elementGroups).forEach((group) => {
      if (!group || group === this._arRoot) return;
      if (group.parent) {
        this._originalParents.set(group, group.parent);
      }
      this._arRoot.add(group);
    });
  }

  /**
   * ARルートへ移動したモデルグループを元の親へ復元
   * @private
   */
  _restoreModelGroupsFromArRoot() {
    if (!this._originalParents || this._originalParents.size === 0) return;
    this._originalParents.forEach((parent, obj) => {
      if (!parent || !obj) return;
      parent.add(obj);
    });
    this._originalParents.clear();
  }

  /**
   * AR中は補助表示を非表示化
   * @private
   */
  _hideSceneHelpersForAr() {
    this._gridWasVisible = gridHelper?.visible;
    this._axesWasVisible = axesHelper?.visible;
    if (gridHelper) gridHelper.visible = false;
    if (axesHelper) axesHelper.visible = false;
  }

  /**
   * AR終了時に補助表示を復元
   * @private
   */
  _restoreSceneHelpersAfterAr() {
    if (gridHelper && this._gridWasVisible !== undefined) {
      gridHelper.visible = this._gridWasVisible;
    }
    if (axesHelper && this._axesWasVisible !== undefined) {
      axesHelper.visible = this._axesWasVisible;
    }
    this._gridWasVisible = undefined;
    this._axesWasVisible = undefined;
  }
}

/** シングルトンインスタンス */
export const arSessionManager = new ArSessionManager();

/**
 * @fileoverview ViewCube - 3Dナビゲーションキューブ
 *
 * カメラの向きを表示し、クリックでビュー方向を変更できるUIコンポーネント。
 * CSS 3D Transformを使用してキューブを表示し、Three.jsカメラと同期します。
 */

import * as THREE from 'three';
import { createViewCubeDOM, getCubeElement } from './ViewCubeRenderer.js';
import {
  setView,
  VIEW_DIRECTIONS,
  getActiveCamera,
  getModelBounds,
} from '../../../viewer/index.js';

/**
 * ViewCube クラス
 * 3Dナビゲーションキューブを管理
 */
export class ViewCube {
  constructor() {
    /** @type {HTMLElement|null} コンテナ要素 */
    this.container = null;

    /** @type {HTMLElement|null} キューブ要素 */
    this.cubeElement = null;

    /** @type {boolean} アニメーション中フラグ */
    this.isAnimating = false;

    /** @type {number|null} requestAnimationFrame ID */
    this._rafId = null;

    /** @type {THREE.Quaternion} 前フレームのquaternion（最適化用） */
    this._lastQuaternion = new THREE.Quaternion();
  }

  /**
   * ViewCubeを初期化してDOMにマウント
   */
  initialize() {
    // DOM構造を作成
    this.container = createViewCubeDOM();
    this.cubeElement = getCubeElement(this.container);

    // bodyにマウント
    document.body.appendChild(this.container);

    // イベントリスナーを設定
    this._setupClickListeners();
    this._setupKeyboardListeners();

    // カメラ同期を開始
    this._startCameraSync();
  }

  /**
   * クリックイベントリスナーを設定
   * @private
   */
  _setupClickListeners() {
    this.container.addEventListener('click', (event) => {
      // 面、辺、角のいずれかを取得
      const element = event.target.closest('.view-cube-face, .view-cube-edge, .view-cube-corner');
      if (!element) return;

      const viewId = element.dataset.view;
      this._handleViewClick(viewId);
    });
  }

  /**
   * キーボードイベントリスナーを設定（アクセシビリティ）
   * @private
   */
  _setupKeyboardListeners() {
    this.container.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        // 面、辺、角のいずれかを取得
        const element = event.target.closest('.view-cube-face, .view-cube-edge, .view-cube-corner');
        if (element) {
          event.preventDefault();
          const viewId = element.dataset.view;
          this._handleViewClick(viewId);
        }
      }
    });
  }

  /**
   * ビュー要素クリック時の処理
   * @param {string} viewId - ビューID（top, front, top-front, top-front-right, etc.）
   * @private
   */
  _handleViewClick(viewId) {
    if (this.isAnimating) return;

    // ビューIDをVIEW_DIRECTIONSにマッピング
    // CSS座標系: Front(Z+)=手前, Back(Z-)=奥
    // World座標系: Front(Y-)=前/南, Back(Y+)=後/北
    const viewMap = {
      // 面 (6個)
      top: VIEW_DIRECTIONS.TOP,
      bottom: VIEW_DIRECTIONS.BOTTOM,
      front: VIEW_DIRECTIONS.FRONT,
      back: VIEW_DIRECTIONS.BACK,
      right: VIEW_DIRECTIONS.RIGHT,
      left: VIEW_DIRECTIONS.LEFT,

      // 辺 (12個) - CSS 3D傾斜により上下が反転するため入れ替え
      'top-front': VIEW_DIRECTIONS.BOTTOM_FRONT,
      'top-back': VIEW_DIRECTIONS.BOTTOM_BACK,
      'top-right': VIEW_DIRECTIONS.BOTTOM_RIGHT,
      'top-left': VIEW_DIRECTIONS.BOTTOM_LEFT,
      'bottom-front': VIEW_DIRECTIONS.TOP_FRONT,
      'bottom-back': VIEW_DIRECTIONS.TOP_BACK,
      'bottom-right': VIEW_DIRECTIONS.TOP_RIGHT,
      'bottom-left': VIEW_DIRECTIONS.TOP_LEFT,
      'front-right': VIEW_DIRECTIONS.FRONT_RIGHT,
      'front-left': VIEW_DIRECTIONS.FRONT_LEFT,
      'back-right': VIEW_DIRECTIONS.BACK_RIGHT,
      'back-left': VIEW_DIRECTIONS.BACK_LEFT,

      // 角 (8個) - CSS 3D傾斜により上下が反転するため入れ替え
      'top-front-right': VIEW_DIRECTIONS.BOTTOM_FRONT_RIGHT,
      'top-front-left': VIEW_DIRECTIONS.BOTTOM_FRONT_LEFT,
      'top-back-right': VIEW_DIRECTIONS.BOTTOM_BACK_RIGHT,
      'top-back-left': VIEW_DIRECTIONS.BOTTOM_BACK_LEFT,
      'bottom-front-right': VIEW_DIRECTIONS.TOP_FRONT_RIGHT,
      'bottom-front-left': VIEW_DIRECTIONS.TOP_FRONT_LEFT,
      'bottom-back-right': VIEW_DIRECTIONS.TOP_BACK_RIGHT,
      'bottom-back-left': VIEW_DIRECTIONS.TOP_BACK_LEFT,
    };

    const viewDirection = viewMap[viewId];
    if (!viewDirection) {
      console.warn('[ViewCube] Unknown view:', viewId);
      return;
    }

    // モデル境界を取得
    const modelBounds = getModelBounds();

    // アニメーション付きでビューを変更
    this._animateCameraTransition(viewDirection, modelBounds);
  }

  /**
   * カメラトランジションを実行
   * @param {string} viewDirection - ビュー方向
   * @param {THREE.Box3|null} modelBounds - モデル境界
   * @private
   */
  _animateCameraTransition(viewDirection, modelBounds) {
    this.isAnimating = true;

    // setViewをトランジション有効で呼び出し
    setView(viewDirection, modelBounds, true);

    // アニメーション完了後にフラグをリセット
    // CameraControlsのデフォルトトランジション時間は約0.5秒
    setTimeout(() => {
      this.isAnimating = false;
    }, 600);
  }

  /**
   * カメラ同期を開始
   * @private
   */
  _startCameraSync() {
    const sync = () => {
      const camera = getActiveCamera();
      if (camera && this.cubeElement) {
        this._syncCubeWithCamera(camera);
      }
      this._rafId = requestAnimationFrame(sync);
    };
    sync();
  }

  /**
   * カメラ同期を停止
   * @private
   */
  _stopCameraSync() {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /**
   * キューブの回転をカメラに同期
   * @param {THREE.Camera} camera - アクティブカメラ
   * @private
   */
  _syncCubeWithCamera(camera) {
    // カメラのワールドquaternionを取得
    const quaternion = new THREE.Quaternion();
    camera.getWorldQuaternion(quaternion);

    // 変化がない場合はスキップ（パフォーマンス最適化）
    if (quaternion.equals(this._lastQuaternion)) {
      return;
    }
    this._lastQuaternion.copy(quaternion);

    // CSS transformに変換して適用
    const transform = this._cameraToCSS3DTransform(quaternion);
    this.cubeElement.style.transform = transform;
  }

  /**
   * カメラquaternionをCSS 3D transformに変換
   *
   * 座標系の違い:
   * - Three.js (このプロジェクト): X→右, Y→奥, Z→上（建築標準 Z-up）
   * - CSS 3D: X→右, Y→下, Z→手前（Y-up、ただしY軸は下向き）
   *
   * 変換手順:
   * 1. 座標系変換quaternion m を作成（X軸周りに+90度）
   * 2. 共役変換で座標系を変換: q_css = m * q * m^(-1)
   * 3. カメラから見た向きなので反転: q_cube = q_css^(-1)
   *
   * @param {THREE.Quaternion} quaternion - カメラのワールドquaternion
   * @returns {string} CSS transform値
   * @private
   */
  _cameraToCSS3DTransform(quaternion) {
    // ViewCubeはカメラの視線方向を示す
    // Top view（上から見る）→ ViewCubeのTop面が見える
    // Front view（正面から見る）→ ViewCubeのFront面が見える
    //
    // 座標系変換（rotateX(-90deg)を組み込み済み）:
    // Three.js (Z-up): X(右), Y(奥/北), Z(上)
    // CSS 3D: X(右), Y(下), Z(手前)
    //
    // 最終変換行列 M (Three.js -> CSS, rotateX(-90deg)含む):
    // X_css =  X_three
    // Y_css = -Y_three
    // Z_css = -Z_three
    //
    // | 1  0  0 |
    // | 0 -1  0 |
    // | 0  0 -1 |

    // カメラのquaternionを反転（カメラから見た世界 → 世界から見たカメラ）
    const invQuaternion = quaternion.clone().invert();
    const R_three = new THREE.Matrix4().makeRotationFromQuaternion(invQuaternion);
    const r = R_three.elements;

    // Three.js回転行列の要素 (列優先):
    // r[0] r[4] r[8]    Xx Yx Zx
    // r[1] r[5] r[9]  = Xy Yy Zy
    // r[2] r[6] r[10]   Xz Yz Zz
    //
    // 座標系変換:
    // Three.js (Z-up): X→右, Y→奥, Z→上
    // CSS 3D:          X→右, Y→下, Z→手前
    //
    // 変換行列 T (Y↔Z入れ替え、符号反転):
    // T = | 1  0  0 |
    //     | 0  0 -1 |
    //     | 0 -1  0 |
    //
    // 基本オフセット: TOPビュー時にtop面を表示するためrotateX(-90°)が必要
    // T' = rotateX(-90°) * T = diag(1, -1, 1)
    //
    // 最終変換: R_cube = T' * R_camera^T * T
    //
    // 結果の行列要素を直接計算:
    const e = [
      r[0],
      -r[1],
      r[2],
      0, // 1列目
      -r[8],
      r[9],
      -r[10],
      0, // 2列目
      -r[4],
      r[5],
      -r[6],
      0, // 3列目
      0,
      0,
      0,
      1, // 4列目
    ];

    // CSS matrix3d形式に変換（translateZを含める）
    // CSS matrix3dは列優先順序
    return `translateZ(-30px) matrix3d(${e[0]},${e[1]},${e[2]},${e[3]},${e[4]},${e[5]},${e[6]},${e[7]},${e[8]},${e[9]},${e[10]},${e[11]},${e[12]},${e[13]},${e[14]},${e[15]})`;
  }

  /**
   * ViewCubeを破棄
   */
  destroy() {
    this._stopCameraSync();

    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }

    this.container = null;
    this.cubeElement = null;
  }

  /**
   * 表示/非表示を切り替え
   * @param {boolean} visible - 表示するか
   */
  setVisible(visible) {
    if (this.container) {
      this.container.style.display = visible ? 'block' : 'none';
    }
  }

  /**
   * 表示状態を取得
   * @returns {boolean} 表示中かどうか
   */
  isVisible() {
    return this.container?.style.display !== 'none';
  }
}

// シングルトンインスタンス
let viewCubeInstance = null;

/**
 * ViewCubeを初期化（シングルトン）
 * @returns {ViewCube} ViewCubeインスタンス
 */
export function initializeViewCube() {
  if (!viewCubeInstance) {
    viewCubeInstance = new ViewCube();
    viewCubeInstance.initialize();
  }
  return viewCubeInstance;
}

/**
 * ViewCubeインスタンスを取得
 * @returns {ViewCube|null} ViewCubeインスタンス
 */
export function getViewCube() {
  return viewCubeInstance;
}

/**
 * ViewCubeを破棄
 */
export function destroyViewCube() {
  if (viewCubeInstance) {
    viewCubeInstance.destroy();
    viewCubeInstance = null;
  }
}

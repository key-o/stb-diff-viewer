/**
 * @fileoverview AR中のタッチジェスチャー制御
 *
 * 配置済みモデルに対する操作を提供します:
 * - 1本指 水平ドラッグ: 鉛直軸まわりの回転
 * - 2本指 ピンチ: 縮尺変更
 * - 1本指 タップ（スロップ内で離す）: 要素ピック（FR-6.1）
 *
 * DOMに依存しない状態機械として実装し、タッチ座標のリストを受け取ります。
 */

/** 回転感度（rad/px） */
export const ROTATE_RADIANS_PER_PIXEL = 0.01;

/** タップ判定の許容移動量（px）。これ未満で指を離すとタップ、超えるとドラッグ回転 */
export const TAP_SLOP_PX = 12;

/**
 * @typedef {Object} GesturePoint
 * @property {number} x
 * @property {number} y
 */

/**
 * ARジェスチャーコントローラ
 */
export class ArGestureController {
  /**
   * @param {Object} callbacks
   * @param {(deltaRadians: number) => void} callbacks.rotateBy - 回転を適用
   * @param {(factor: number) => void} callbacks.setScale - 縮尺を適用（クランプは適用側）
   * @param {() => number} callbacks.getScale - 現在の縮尺を取得
   * @param {() => boolean} callbacks.isPlaced - モデルが配置済みか
   * @param {(point: GesturePoint) => void} [callbacks.onTap]
   *   タップ確定時のコールバック（配置済みのみ。座標はタッチ開始点）
   */
  constructor({ rotateBy, setScale, getScale, isPlaced, onTap }) {
    this._rotateBy = rotateBy;
    this._setScale = setScale;
    this._getScale = getScale;
    this._isPlaced = isPlaced;
    this._onTap = onTap || null;

    /** @type {'none'|'rotate'|'pinch'} */
    this._mode = 'none';
    /** @type {number} 回転ジェスチャーの直前X座標 */
    this._lastX = 0;
    /** @type {number} ピンチ開始時の指間距離 */
    this._pinchStartDistance = 0;
    /** @type {number} ピンチ開始時の縮尺 */
    this._pinchStartScale = 1;
    /** @type {boolean} タップ候補（1本指でスロップ内に収まっている間 true） */
    this._tapCandidate = false;
    /** @type {number} タッチ開始X座標（タップ判定用） */
    this._startX = 0;
    /** @type {number} タッチ開始Y座標（タップ判定用） */
    this._startY = 0;
  }

  /**
   * 現在のジェスチャーモード
   * @returns {'none'|'rotate'|'pinch'}
   */
  get mode() {
    return this._mode;
  }

  /**
   * タッチ開始
   * @param {GesturePoint[]} points - 現在の全タッチ座標
   */
  handleTouchStart(points) {
    if (!this._isPlaced()) {
      this._mode = 'none';
      this._tapCandidate = false;
      return;
    }
    this._tapCandidate = points.length === 1;
    if (this._tapCandidate) {
      this._startX = points[0].x;
      this._startY = points[0].y;
    }
    this._beginGestureForPoints(points);
  }

  /**
   * タッチ移動
   * @param {GesturePoint[]} points - 現在の全タッチ座標
   */
  handleTouchMove(points) {
    if (!this._isPlaced()) return;

    if (this._mode === 'rotate' && points.length === 1) {
      // タップ候補の間はスロップ内の微小移動で回転させない（タップとの競合防止）
      if (this._tapCandidate) {
        const totalDx = points[0].x - this._startX;
        const totalDy = points[0].y - this._startY;
        if (Math.hypot(totalDx, totalDy) < TAP_SLOP_PX) return;
        this._tapCandidate = false;
        this._lastX = this._startX;
      }
      const dx = points[0].x - this._lastX;
      this._lastX = points[0].x;
      if (dx !== 0) {
        this._rotateBy(dx * ROTATE_RADIANS_PER_PIXEL);
      }
      return;
    }

    if (this._mode === 'pinch' && points.length >= 2) {
      const distance = this._distance(points[0], points[1]);
      if (this._pinchStartDistance > 0 && distance > 0) {
        this._setScale(this._pinchStartScale * (distance / this._pinchStartDistance));
      }
      return;
    }

    // タッチ本数とモードが食い違った場合は仕切り直し
    this._beginGestureForPoints(points);
  }

  /**
   * タッチ終了（残ったタッチでジェスチャーを再開始）
   * @param {GesturePoint[]} points - 残っているタッチ座標
   */
  handleTouchEnd(points) {
    if (this._isPlaced() && this._tapCandidate && points.length === 0) {
      // スロップ内で全指が離れた → タップ確定
      this._tapCandidate = false;
      this._mode = 'none';
      if (this._onTap) {
        this._onTap({ x: this._startX, y: this._startY });
      }
      return;
    }
    if (points.length === 0) {
      this._tapCandidate = false;
    }
    if (!this._isPlaced() || points.length === 0) {
      this._mode = 'none';
      return;
    }
    this._beginGestureForPoints(points);
  }

  /**
   * タッチ本数に応じてジェスチャーを開始
   * @private
   * @param {GesturePoint[]} points
   */
  _beginGestureForPoints(points) {
    if (points.length >= 2) {
      this._mode = 'pinch';
      this._tapCandidate = false;
      this._pinchStartDistance = this._distance(points[0], points[1]);
      this._pinchStartScale = this._getScale();
    } else if (points.length === 1) {
      this._mode = 'rotate';
      this._lastX = points[0].x;
    } else {
      this._mode = 'none';
    }
  }

  /**
   * 2点間距離
   * @private
   * @param {GesturePoint} a
   * @param {GesturePoint} b
   * @returns {number}
   */
  _distance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }
}

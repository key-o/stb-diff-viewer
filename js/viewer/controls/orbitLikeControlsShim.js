/**
 * @fileoverview OrbitControls互換のCameraControlsラッパー
 *
 * CameraControlsを使用しながらOrbitControlsと同じAPIを提供するシムです。
 * 既存コードとの互換性を維持しながらCameraControlsの機能を活用できます。
 */

import * as THREE from 'three';

/**
 * CameraControlsのtargetプロパティ用プロキシ
 * Vector3を継承し、setやcopy時にCameraControlsのsetTargetを呼び出す
 */
class TargetProxy extends THREE.Vector3 {
  constructor(shim) {
    super();
    this._shim = shim;
  }
  set(x, y, z) {
    super.set(x, y, z);
    this._shim._cc.setTarget(this.x, this.y, this.z, false);
    return this;
  }
  copy(v) {
    super.copy(v);
    this._shim._cc.setTarget(this.x, this.y, this.z, false);
    return this;
  }
  lerpVectors(v1, v2, alpha) {
    super.lerpVectors(v1, v2, alpha);
    this._shim._cc.setTarget(this.x, this.y, this.z, false);
    return this;
  }
}

/**
 * OrbitLikeControlsShim - OrbitControls互換APIを提供するCameraControlsラッパー
 *
 * OrbitControlsと同じプロパティ・メソッドを提供しながら、
 * 内部ではCameraControlsを使用します。
 */
export class OrbitLikeControlsShim {
  /**
   * @param {THREE.Camera} camera - 制御するカメラ
   * @param {HTMLElement} domElement - イベントを受け取るDOM要素
   * @param {Object} CameraControls - CameraControlsクラス
   */
  constructor(camera, domElement, CameraControls) {
    this._cc = new CameraControls(camera, domElement);
    this._camera = camera;
    this._dom = domElement;
    this._CameraControls = CameraControls;

    // target 互換
    this.target = new TargetProxy(this);
    this._cc.getTarget(this.target);

    // 既定の制御フラグ
    this._enableRotate = true;
    this._enableZoom = true;
    this._enablePan = true;
    this._screenSpacePanning = true; // ダミー（CameraControls は画面空間トラック）

    // 既定のマウスボタン割り当て（OrbitControls 互換表現）
    this._mouseButtonsOrbit = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    this._applyMouseButtons();

    // ポーラー角制限（CameraControls は同名プロパティあり）
    this.minPolarAngle = 0;
    this.maxPolarAngle = Math.PI;

    // 方位角制限（無制限に設定）
    this.minAzimuthAngle = -Infinity;
    this.maxAzimuthAngle = Infinity;

    // 距離制限
    this.minDistance = 0;
    this.maxDistance = Infinity;

    // ダンピング相当（smoothTime）
    this._enableDamping = true;
    this.dampingFactor = 0.05;
    this._applyDamping();

    // イベント変換
    this._listeners = new Map(); // key: type, value: Set of wrapped listeners
  }

  // --- 互換プロパティ ---
  get enabled() {
    return this._cc.enabled;
  }
  set enabled(v) {
    this._cc.enabled = !!v;
  }

  get enableRotate() {
    return this._enableRotate;
  }
  set enableRotate(v) {
    this._enableRotate = !!v;
    this._applyMouseButtons();
  }
  get enableZoom() {
    return this._enableZoom;
  }
  set enableZoom(v) {
    this._enableZoom = !!v;
    this._applyMouseButtons();
  }
  get enablePan() {
    return this._enablePan;
  }
  set enablePan(v) {
    this._enablePan = !!v;
    this._applyMouseButtons();
  }

  get screenSpacePanning() {
    return this._screenSpacePanning;
  }
  set screenSpacePanning(v) {
    // CameraControls は画面空間トラックが基本のため、値は保持のみ
    this._screenSpacePanning = !!v;
  }

  get mouseButtons() {
    return { ...this._mouseButtonsOrbit };
  }
  set mouseButtons(mapping) {
    if (mapping && typeof mapping === 'object') {
      this._mouseButtonsOrbit = { ...this._mouseButtonsOrbit, ...mapping };
      this._applyMouseButtons();
    }
  }

  _applyMouseButtons() {
    const A = this._CameraControls.ACTION;
    const mapOne = (btn) => {
      const v = this._mouseButtonsOrbit[btn];
      if (v === THREE.MOUSE.ROTATE) return this._enableRotate ? A.ROTATE : A.NONE;
      if (v === THREE.MOUSE.DOLLY) return this._enableZoom ? A.DOLLY : A.NONE;
      if (v === THREE.MOUSE.PAN) return this._enablePan ? A.TRUCK : A.NONE;
      return A.NONE;
    };
    this._cc.mouseButtons.left = mapOne('LEFT');
    this._cc.mouseButtons.middle = mapOne('MIDDLE');
    this._cc.mouseButtons.right = mapOne('RIGHT');
  }

  _applyDamping() {
    // OrbitControls の enableDamping/dampingFactor を smoothTime に対応付け
    this._cc.smoothTime = this._enableDamping ? Math.max(0, this.dampingFactor) : 0;
  }

  get enableDamping() {
    return this._enableDamping;
  }
  set enableDamping(v) {
    this._enableDamping = !!v;
    this._applyDamping();
  }

  // 距離・角度制限は CameraControls に直結
  set minPolarAngle(v) {
    this._cc.minPolarAngle = v;
  }
  get minPolarAngle() {
    return this._cc.minPolarAngle;
  }
  set maxPolarAngle(v) {
    this._cc.maxPolarAngle = v;
  }
  get maxPolarAngle() {
    return this._cc.maxPolarAngle;
  }
  set minDistance(v) {
    this._cc.minDistance = v;
  }
  get minDistance() {
    return this._cc.minDistance;
  }
  set maxDistance(v) {
    this._cc.maxDistance = v;
  }
  get maxDistance() {
    return this._cc.maxDistance;
  }

  // 方位角の透過
  set minAzimuthAngle(v) {
    this._cc.minAzimuthAngle = v;
  }
  get minAzimuthAngle() {
    return this._cc.minAzimuthAngle;
  }
  set maxAzimuthAngle(v) {
    this._cc.maxAzimuthAngle = v;
  }
  get maxAzimuthAngle() {
    return this._cc.maxAzimuthAngle;
  }

  // --- 互換メソッド ---
  update(dt) {
    const delta = typeof dt === 'number' ? dt : 0;
    return this._cc.update(delta);
  }

  // ズーム挙動関連の透過プロパティ
  get dollyToCursor() {
    return this._cc.dollyToCursor;
  }
  set dollyToCursor(v) {
    this._cc.dollyToCursor = !!v;
  }
  get infinityDolly() {
    return this._cc.infinityDolly;
  }
  set infinityDolly(v) {
    this._cc.infinityDolly = !!v;
  }

  // 既存コードからの直接呼び出し用（CameraControls の API を露出）
  setOrbitPoint(x, y, z) {
    this._cc.setOrbitPoint(x, y, z);
    // target プロキシも同期
    this.target.set(x, y, z);
  }
  setTarget(x, y, z, smooth = false) {
    this._cc.setTarget(x, y, z, smooth);
    this.target.set(x, y, z);
  }
  stop() {
    this._cc.stop();
  }

  // イベント（start/end/change の互換レイヤ）
  addEventListener(type, listener) {
    const wrap = (e) => listener(e);
    let ccType = type;
    if (type === 'start') ccType = 'controlstart';
    else if (type === 'end') ccType = 'controlend';
    else if (type === 'change') ccType = 'update';
    this._cc.addEventListener(ccType, wrap);
    if (!this._listeners.has(type)) this._listeners.set(type, new Map());
    this._listeners.get(type).set(listener, wrap);
  }
  removeEventListener(type, listener) {
    const map = this._listeners.get(type);
    if (!map) return;
    const wrap = map.get(listener);
    if (!wrap) return;
    let ccType = type;
    if (type === 'start') ccType = 'controlstart';
    else if (type === 'end') ccType = 'controlend';
    else if (type === 'change') ccType = 'update';
    this._cc.removeEventListener(ccType, wrap);
    map.delete(listener);
  }
}

/**
 * CameraControlsが利用できない場合のフォールバック用最小コントロール
 */
export class MinimalControls {
  constructor(cameraArg, domElement) {
    this.camera = cameraArg;
    this.domElement = domElement || document;
    this.target = new THREE.Vector3();
    this.enableDamping = false;
    this.dampingFactor = 0.0;
    this.screenSpacePanning = false;
    this.minDistance = 0;
    this.maxDistance = Infinity;
    this.maxPolarAngle = Math.PI;
    this.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
  }
  // 既存コードは controls.update(dt) を呼ぶだけなので noop 実装で良い
  update(_dt) {}
  stop() {}
  addEventListener() {}
  removeEventListener() {}
}

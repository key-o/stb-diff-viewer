/**
 * @fileoverview 3D建築モデルビューワーのコアモジュール
 *
 * このファイルは、Three.jsを使用した3D建築モデルビューワーの中心となる機能を提供します:
 * - 3Dシーン、カメラ、レンダラー、コントロールの初期化と設定
 * - 建築要素（柱、梁、床など）の3D表示のためのグループ管理
 * - mmスケールでの3D表示（建築モデル用に最適化）
 * - 軸表示、グリッド表示などの補助機能
 * - ライト設定と視覚効果の管理
 * - アニメーションループとレンダリング処理
 * - ウィンドウリサイズへの対応
 *
 * このモジュールは、Three.jsをベースとした3D表示の基盤となり、
 * 他のモジュールがこの上に構築される形で機能します。
 */

import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";
// CameraControls を使用（OrbitControls から移行）
import CameraControls from "https://unpkg.com/camera-controls@3.1.0/dist/camera-controls.module.js";
CameraControls.install({ THREE });

// --- 定数 ---
export const SUPPORTED_ELEMENTS = [
  "Node",
  "Column",
  "Girder",
  "Beam",
  "Brace",
  "Slab",
  "Wall",
  "Axis",
  "Story",
];

// --- Three.js シーン設定 ---
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0);

// --- カメラ設定 ---
export const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  // ★★★ near/far を mm スケールに調整 ★★★
  10, // near: 10mm
  50000000 // far: 50km (巨大なモデルも考慮)
);
// ★★★ 初期位置も mm スケールに ★★★
camera.position.set(10000, 10000, 10000); // 10m, 10m, 10m
camera.up.set(0, 0, 1); // Z軸を上に設定

// --- レンダラー設定 (初期化は後で行う) ---
export let renderer = null;

// --- コントロール設定 ---
// ★★★ 初期化を initRenderer に移動するため、null で宣言 ★★★
export let controls = null;

// --- OrbitControls 互換の薄いラッパー（既存コードとの互換維持用） ---
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

class OrbitLikeControlsShim {
  constructor(camera, domElement) {
    this._cc = new CameraControls(camera, domElement);
    this._camera = camera;
    this._dom = domElement;

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
    if (mapping && typeof mapping === "object") {
      this._mouseButtonsOrbit = { ...this._mouseButtonsOrbit, ...mapping };
      this._applyMouseButtons();
    }
  }

  _applyMouseButtons() {
    const A = CameraControls.ACTION;
    const mapOne = (btn) => {
      const v = this._mouseButtonsOrbit[btn];
      if (v === THREE.MOUSE.ROTATE)
        return this._enableRotate ? A.ROTATE : A.NONE;
      if (v === THREE.MOUSE.DOLLY) return this._enableZoom ? A.DOLLY : A.NONE;
      if (v === THREE.MOUSE.PAN) return this._enablePan ? A.TRUCK : A.NONE;
      return A.NONE;
    };
    this._cc.mouseButtons.left = mapOne("LEFT");
    this._cc.mouseButtons.middle = mapOne("MIDDLE");
    this._cc.mouseButtons.right = mapOne("RIGHT");
  }

  _applyDamping() {
    // OrbitControls の enableDamping/dampingFactor を smoothTime に対応付け
    this._cc.smoothTime = this._enableDamping
      ? Math.max(0, this.dampingFactor)
      : 0;
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
    const delta = typeof dt === "number" ? dt : 0;
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
    if (type === "start") ccType = "controlstart";
    else if (type === "end") ccType = "controlend";
    else if (type === "change") ccType = "update";
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
    if (type === "start") ccType = "controlstart";
    else if (type === "end") ccType = "controlend";
    else if (type === "change") ccType = "update";
    this._cc.removeEventListener(ccType, wrap);
    map.delete(listener);
  }
}

// --- ライト設定 ---
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(1, 1, 1).normalize();
scene.add(light);
const ambientLight = new THREE.AmbientLight(0xcccccc, 0.5);
scene.add(ambientLight);

// --- ヘルパー設定 ---
// ★★★ AxesHelper のサイズを mm スケールに調整 ★★★
export const axesHelper = new THREE.AxesHelper(5000); // 5m
scene.add(axesHelper);
// ★★★ GridHelper の初期サイズと分割数を mm スケールに調整 ★★★
export const gridHelper = new THREE.GridHelper(100000, 100); // 100m grid, 1m divisions
scene.add(gridHelper);

// --- 要素グループの初期化 ---
export const elementGroups = {};
SUPPORTED_ELEMENTS.forEach((type) => {
  const group = new THREE.Group();
  // ★★★ userData に elementType を設定 ★★★
  group.userData = { elementType: type };
  elementGroups[type] = group;
  scene.add(elementGroups[type]);
});

// --- レンダラー初期化 ---
/**
 * レンダラーを初期化し、DOMに追加する
 * @returns {boolean} 初期化が成功したかどうか
 */
export function initRenderer() {
  try {
    const canvas = document.getElementById("three-canvas");
    if (!canvas) {
      console.error("Canvas element with id 'three-canvas' not found.");
      return false;
    }
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.localClippingEnabled = true;

    // ★★★ CameraControls ベースの互換ラッパーをインスタンス化 ★★★
    controls = new OrbitLikeControlsShim(camera, renderer.domElement);

    // グローバルアクセス用にwindowオブジェクトに設定
    window.controls = controls;

    // ★★★ コントロールの設定（以前の値を踏襲） ★★★
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;
    controls.minDistance = 100; // 100mm (10cm)
    controls.maxDistance = 50000000; // 50km 相当（大規模モデルでも十分）
    controls.maxPolarAngle = Math.PI;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };

    console.log("Renderer initialized.");
    return true;
  } catch (error) {
    console.error("Failed to initialize renderer:", error);
    controls = null; // エラー時は controls も null に戻す
    return false;
  }
}

// 回転中心変更中のフラグ（interaction.jsから制御される）
let skipControlsUpdate = false;
export function setSkipControlsUpdate(skip) {
  skipControlsUpdate = skip;
}

// --- アニメーションループ ---
export function animate(controls, scene, camera) {
  // delta を渡して CameraControls を更新
  const _animate = () => {
    requestAnimationFrame(_animate);
    if (!renderer) return;
    if (!skipControlsUpdate) {
      // 時間差分（秒）
      const dt = _clock.getDelta();
      controls.update(dt);
    }
    renderer.render(scene, camera);
  };
  // アニメーション開始（多重開始防止のため、1回目の呼び出しでループセット）
  if (!_animating) {
    _animating = true;
    _clock = new THREE.Clock();
    _animate();
  }
}

// ループ状態
let _animating = false;
let _clock = new THREE.Clock();

// --- ウィンドウリサイズ処理 ---
export function setupViewportResizeHandler(camera) {
  window.addEventListener(
    "resize",
    () => {
      if (!renderer) return;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    },
    false
  );
}

// --- Lights ---
// export const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // 必要なら追加
// scene.add(ambientLight);
// ★★★ directionalLight を作成し、エクスポート ★★★
export const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(1, 1, 1).normalize();
scene.add(directionalLight); // シーンに追加

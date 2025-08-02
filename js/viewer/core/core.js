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
import { OrbitControls } from "https://cdn.skypack.dev/three@0.128.0/examples/jsm/controls/OrbitControls.js";

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

    // ★★★ OrbitControls をここでインスタンス化 ★★★
    controls = new OrbitControls(camera, renderer.domElement);

    // グローバルアクセス用にwindowオブジェクトに設定
    window.controls = controls;

    // ★★★ コントロールの設定をインスタンス化後に行う ★★★
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    // ★★★ minDistance/maxDistance を mm スケールに調整 ★★★
    controls.minDistance = 100; // 100mm (10cm)
    controls.maxDistance = 100000; // 100m (必要ならさらに大きく)
    controls.maxPolarAngle = Math.PI;

    // マウス操作の割り当てを変更
    // デフォルト: 左クリック=回転, 右クリック=パン, ホイール=ズーム
    // 変更後: パン操作でマウス前後移動を上下移動にマッピング
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE, // 左クリック: 回転
      MIDDLE: THREE.MOUSE.DOLLY, // 中クリック: ズーム
      RIGHT: THREE.MOUSE.PAN, // 右クリック: パン（上下左右移動）
    };

    console.log("Renderer initialized.");
    return true;
  } catch (error) {
    console.error("Failed to initialize renderer:", error);
    controls = null; // エラー時は controls も null に戻す
    return false;
  }
}

// --- アニメーションループ ---
export function animate(controls, scene, camera) {
  requestAnimationFrame(() => animate(controls, scene, camera));
  if (!renderer) return;
  controls.update();
  renderer.render(scene, camera);
}

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

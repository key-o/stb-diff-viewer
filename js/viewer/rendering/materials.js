/**
 * @fileoverview マテリアル定義・管理モジュール
 *
 * このファイルは、3Dビューワーの描画に使用するマテリアルを定義・管理します:
 * - モデル比較用カラーマテリアル（一致、モデルAのみ、モデルBのみ）
 * - 線要素用マテリアル
 * - メッシュ要素用マテリアル
 * - 通り芯・階表示用マテリアル
 * - ハイライト表示用マテリアル
 * - クリッピング平面との連携
 *
 * マテリアルの定義を一元管理することで、アプリケーション全体での
 * 一貫した視覚的表現と効率的な更新を実現します。
 */

import * as THREE from 'three';
import { renderer } from '../core/core.js';
import { getCurrentColorMode, COLOR_MODES } from '../../colorModes/index.js';
import { IMPORTANCE_LEVELS } from '../../constants/importanceLevels.js';
import { colorManager } from './colorManager.js';
import elementColorManager from './elementColorManager.js';
import { scheduleRender } from '../../utils/renderScheduler.js';

// --- パフォーマンス最適化: 片面/両面マテリアル設定 ---
// 閉じたジオメトリ（柱、梁、ブレース等）は片面レンダリングで描画ポリゴン数を削減
// 薄いジオメトリ（壁、スラブ、パラペット等）は両面レンダリングが必要

/**
 * 要素タイプに応じたマテリアルのside設定
 * @type {Object<string, number>}
 */
export const ELEMENT_MATERIAL_SIDE = {
  // 閉じたジオメトリ - 片面レンダリング（約50%の描画削減）
  Column: THREE.FrontSide,
  Post: THREE.FrontSide,
  Girder: THREE.FrontSide,
  Beam: THREE.FrontSide,
  Brace: THREE.FrontSide,
  Pile: THREE.FrontSide,
  Footing: THREE.FrontSide,
  FoundationColumn: THREE.FrontSide,
  StripFooting: THREE.FrontSide,
  Joint: THREE.FrontSide,

  // 薄いジオメトリ - 両面レンダリング（裏面が見える可能性がある）
  Slab: THREE.DoubleSide,
  Wall: THREE.DoubleSide,
  Parapet: THREE.DoubleSide,

  // その他/デフォルト - 両面レンダリング（安全側）
  Node: THREE.DoubleSide,
  Axis: THREE.DoubleSide,
  Story: THREE.DoubleSide,
};

/**
 * 要素タイプに応じたマテリアルのsideを取得
 * @param {string} elementType - 要素タイプ
 * @returns {number} THREE.FrontSide または THREE.DoubleSide
 */
export function getMaterialSideForElement(elementType) {
  return ELEMENT_MATERIAL_SIDE[elementType] ?? THREE.DoubleSide;
}

/**
 * 片面マテリアル最適化が有効かどうか
 */
let singleSidedOptimizationEnabled = true;

/**
 * 片面マテリアル最適化の有効/無効を設定
 * @param {boolean} enabled
 */
export function setSingleSidedOptimizationEnabled(enabled) {
  singleSidedOptimizationEnabled = enabled;
}

/**
 * 片面マテリアル最適化が有効かどうかを取得
 * @returns {boolean}
 */
export function isSingleSidedOptimizationEnabled() {
  return singleSidedOptimizationEnabled;
}

/**
 * 要素タイプに応じた最適なマテリアルを作成
 * @param {Object} baseOptions - 基本マテリアルオプション
 * @param {string} elementType - 要素タイプ
 * @returns {THREE.Material}
 */
export function createOptimizedMaterial(baseOptions, elementType) {
  const side = singleSidedOptimizationEnabled
    ? getMaterialSideForElement(elementType)
    : THREE.DoubleSide;

  return new THREE.MeshStandardMaterial({
    ...baseOptions,
    side,
  });
}

// --- 重要度別視覚的スタイル定義 ---
export const IMPORTANCE_VISUAL_STYLES = {
  [IMPORTANCE_LEVELS.REQUIRED]: {
    opacity: 1.0,
    outlineWidth: 2.0,
    saturation: 1.0,
    highlightColor: '#FF0000',
  },
  [IMPORTANCE_LEVELS.OPTIONAL]: {
    opacity: 0.8,
    outlineWidth: 1.0,
    saturation: 0.7,
    highlightColor: '#FFA500',
  },
  [IMPORTANCE_LEVELS.UNNECESSARY]: {
    opacity: 0.4,
    outlineWidth: 0.5,
    saturation: 0.3,
    highlightColor: '#808080',
  },
  [IMPORTANCE_LEVELS.NOT_APPLICABLE]: {
    opacity: 0.1,
    outlineWidth: 0.0,
    saturation: 0.1,
    highlightColor: '#404040',
  },
};

// --- マテリアル定義 (clippingPlanesは後で設定) ---
// 注意: これらの固定マテリアルは、主に以下の用途で使用されます：
// 1. ProfileBased*Generatorでメッシュ作成時の一時的なデフォルトマテリアル
// 2. 特殊な要素（Axis、Story等）の表示用マテリアル
// 通常の要素の色付けには、ColorManagerを使用することを推奨します。
// マテリアルデザイン色に統一: matched=マテリアルグリーン（onlyAと統一）、onlyB=マテリアルレッド
export const materials = {
  matched: new THREE.MeshStandardMaterial({
    color: 0x4caf50, // マテリアルグリーン（一致した要素）- onlyAと統一
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.DoubleSide,
  }),
  onlyA: new THREE.MeshStandardMaterial({
    color: 0x4caf50, // マテリアルグリーン（モデルAのみ）
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.DoubleSide,
  }),
  onlyB: new THREE.MeshStandardMaterial({
    color: 0xf44336, // マテリアルレッド（モデルBのみ）
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.DoubleSide,
  }),
  mismatch: new THREE.MeshStandardMaterial({
    color: 0xff9800, // マテリアルオレンジ（位置一致・属性不一致）
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.DoubleSide,
  }),
  // 立体表示（ProfileBased 生成）用の不透明メッシュマテリアル
  // 既存の matched/onlyA/onlyB と同等だが、用途を明示するため別名を用意
  // ProfileBased*Generatorで作成されたメッシュは、後でColorManagerにより適切なマテリアルに差し替えられます
  matchedMesh: new THREE.MeshStandardMaterial({
    color: 0x4caf50, // マテリアルグリーン（一致した要素）- onlyAと統一
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.DoubleSide,
    transparent: false,
    opacity: 1.0,
  }),
  onlyAMesh: new THREE.MeshStandardMaterial({
    color: 0x4caf50, // マテリアルグリーン（モデルAのみ）
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.DoubleSide,
    transparent: false,
    opacity: 1.0,
  }),
  onlyBMesh: new THREE.MeshStandardMaterial({
    color: 0xf44336, // マテリアルレッド（モデルBのみ）
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.DoubleSide,
    transparent: false,
    opacity: 1.0,
  }),
  mismatchMesh: new THREE.MeshStandardMaterial({
    color: 0xff9800, // マテリアルオレンジ（位置一致・属性不一致）
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.DoubleSide,
    transparent: false,
    opacity: 1.0,
  }),
  // stb-diff-viewer造のRC（コンクリート）部分用半透明マテリアル
  // S造（鉄骨）部分が見えるように半透明で表示
  matchedMeshTransparent: new THREE.MeshStandardMaterial({
    color: 0xa5d6a7, // 薄いマテリアルグリーン（コンクリート部分）- onlyAと統一
    roughness: 0.7,
    metalness: 0.0,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.4,
    depthWrite: false, // 透明度を正しく表示するため
  }),
  onlyAMeshTransparent: new THREE.MeshStandardMaterial({
    color: 0xa5d6a7, // 薄いマテリアルグリーン（コンクリート部分）
    roughness: 0.7,
    metalness: 0.0,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  }),
  onlyBMeshTransparent: new THREE.MeshStandardMaterial({
    color: 0xef9a9a, // 薄いマテリアルレッド（コンクリート部分）
    roughness: 0.7,
    metalness: 0.0,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  }),
  lineMatched: new THREE.LineBasicMaterial({ color: 0x4caf50 }), // マテリアルグリーン - onlyAと統一
  lineOnlyA: new THREE.LineBasicMaterial({ color: 0x4caf50 }), // マテリアルグリーン
  lineOnlyB: new THREE.LineBasicMaterial({ color: 0xf44336 }), // マテリアルレッド
  lineMismatch: new THREE.LineBasicMaterial({ color: 0xff9800 }), // マテリアルオレンジ（位置一致・属性不一致）
  polyMatched: new THREE.MeshStandardMaterial({
    color: 0x4caf50, // マテリアルグリーン - onlyAと統一
    roughness: 0.8,
    metalness: 0.1,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7,
  }),
  polyOnlyA: new THREE.MeshStandardMaterial({
    color: 0x4caf50, // マテリアルグリーン
    roughness: 0.8,
    metalness: 0.1,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7,
  }),
  polyOnlyB: new THREE.MeshStandardMaterial({
    color: 0xf44336, // マテリアルレッド
    roughness: 0.8,
    metalness: 0.1,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7,
  }),
  polyMismatch: new THREE.MeshStandardMaterial({
    color: 0xff9800, // マテリアルオレンジ（位置一致・属性不一致）
    roughness: 0.8,
    metalness: 0.1,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7,
  }),
  axisLine: new THREE.LineBasicMaterial({ color: 0xaaaaaa, linewidth: 1 }), // 通り芯用マテリアル (一点鎖線はジオメトリで実現)
  storyLine: new THREE.LineBasicMaterial({
    color: 0xaaaaaa,
    linewidth: 1,
    transparent: true,
    opacity: 0.5,
  }), // 階表示用マテリアル (線)
  axisPlane: new THREE.MeshBasicMaterial({
    color: 0x888888,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
  }),
  storyPlane: new THREE.MeshBasicMaterial({
    color: 0xaaaaaa,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
  }),
  // ★★★ ハイライト用マテリアル（マテリアルデザインに統一）★★★
  highlightMesh: new THREE.MeshStandardMaterial({
    color: 0xffc107, // マテリアルアンバー（ハイライト用）
    roughness: 0.5,
    metalness: 0.2,
    side: THREE.DoubleSide,
    emissive: 0x554400, // エミッシブ色もアンバー系に調整
  }), // メッシュ要素（節点、スラブ、壁）用
  highlightLine: new THREE.LineBasicMaterial({ color: 0xffc107, linewidth: 5 }), // マテリアルアンバー（ハイライト用）
  // 立体表示時の配置基準線（軸）用ラインマテリアル
  placementLine: new THREE.LineBasicMaterial({
    color: 0x333333,
    linewidth: 1,
    transparent: true,
    opacity: 0.85,
    depthTest: false, // メッシュ越しでも視認できるように
  }),
};

/**
 * レンダラー初期化後にマテリアルのclippingPlanesを更新する関数
 */
export function updateMaterialClippingPlanes() {
  if (!renderer) return;
  for (const key in materials) {
    if (materials[key]) {
      // マテリアルが存在するか確認
      materials[key].clippingPlanes = renderer.clippingPlanes;
      materials[key].needsUpdate = true; // 更新を反映させる
    }
  }
}

/**
 * 要素に適用するマテリアルを取得する関数
 * 色付けモードに応じて適切なマテリアルを返す
 * @param {string} elementType 要素タイプ (Column, Girder, Beam, etc.)
 * @param {string} comparisonState 比較状態 ('matched', 'onlyA', 'onlyB')
 * @param {boolean} isLine 線要素かどうか
 * @param {boolean} isPoly ポリゴン要素かどうか
 * @returns {THREE.Material} 適用するマテリアル
 */
export function getMaterialForElementWithMode(
  elementType,
  comparisonState,
  isLine = false,
  isPoly = false,
  elementId = null,
  toleranceState = null,
) {
  const colorMode = getCurrentColorMode();

  // ColorManagerを使用してマテリアルを取得
  let materialMode;
  const materialParams = {
    elementType,
    comparisonState,
    isLine,
    isPoly,
    toleranceState,
  };

  // 色付けモードに応じてマテリアルモードを決定
  switch (colorMode) {
    case COLOR_MODES.IMPORTANCE:
      materialMode = 'importance';
      // 重要度モードでは暫定的にデフォルト重要度を設定
      // 実際の重要度は後で applyImportanceColorMode で設定される
      materialParams.importanceLevel = IMPORTANCE_LEVELS.REQUIRED;
      break;

    case COLOR_MODES.ELEMENT:
      materialMode = 'element';
      break;

    case COLOR_MODES.SCHEMA:
      materialMode = 'schema';
      // スキーマエラー情報を取得（後で実装）
      materialParams.hasError = false; // デフォルトは正常
      break;

    case COLOR_MODES.DIFF:
    default:
      materialMode = 'diff';
      break;
  }

  // ColorManagerからマテリアルを取得
  return colorManager.getMaterial(materialMode, materialParams);
}

/**
 * 重要度に応じたマテリアル作成関数
 * @param {THREE.Material} baseMaterial - ベースマテリアル
 * @param {string} importance - 重要度レベル
 * @returns {THREE.Material} 重要度調整済みマテリアル
 */
function createImportanceAwareMaterial(baseMaterial, importance) {
  if (!importance || !IMPORTANCE_VISUAL_STYLES[importance]) {
    return baseMaterial;
  }

  const style = IMPORTANCE_VISUAL_STYLES[importance];
  const material = baseMaterial.clone();

  // 透明度の調整
  material.opacity = style.opacity;
  material.transparent = style.opacity < 1.0;

  // 彩度の調整（色の鮮やかさを調整）
  if (style.saturation < 1.0) {
    adjustMaterialSaturation(material, style.saturation);
  }

  // クリッピング平面の継承
  material.clippingPlanes = baseMaterial.clippingPlanes;
  material.needsUpdate = true;

  return material;
}

/**
 * マテリアルの彩度を調整する関数
 * @param {THREE.Material} material - 調整対象のマテリアル
 * @param {number} saturation - 彩度 (0.0-1.0)
 */
function adjustMaterialSaturation(material, saturation) {
  if (!material.color) return;

  // HSLに変換して彩度を調整
  const hsl = {};
  material.color.getHSL(hsl);
  hsl.s *= saturation; // 彩度を乗算
  material.color.setHSL(hsl.h, hsl.s, hsl.l);

  // エミッシブ色も調整（存在する場合）
  if (material.emissive) {
    const emissiveHsl = {};
    material.emissive.getHSL(emissiveHsl);
    emissiveHsl.s *= saturation;
    material.emissive.setHSL(emissiveHsl.h, emissiveHsl.s, emissiveHsl.l);
  }
}

/**
 * 重要度対応のアウトライン用マテリアル作成
 * @param {string} importance - 重要度レベル
 * @returns {THREE.Material|null} アウトライン用マテリアル、またはnull
 */
export function createImportanceOutlineMaterial(importance) {
  if (!importance || !IMPORTANCE_VISUAL_STYLES[importance]) {
    return null;
  }

  const style = IMPORTANCE_VISUAL_STYLES[importance];

  // 幅が0の場合はアウトラインを作成しない
  if (style.outlineWidth <= 0) {
    return null;
  }

  const outlineMaterial = new THREE.MeshBasicMaterial({
    color: style.highlightColor,
    side: THREE.BackSide,
    transparent: true,
    opacity: Math.min(style.opacity, 0.8), // アウトラインは少し薄く
  });

  // クリッピング平面を設定
  outlineMaterial.clippingPlanes = renderer?.clippingPlanes || [];

  return outlineMaterial;
}


/**
 * 重要度に基づく材料プールの管理
 * パフォーマンス向上のためにマテリアルを再利用
 */
class ImportanceMaterialPool {
  constructor() {
    this.pool = new Map();
  }

  /**
   * プールからマテリアルを取得、存在しない場合は作成
   * @param {string} key - マテリアルキー
   * @param {Function} createFn - マテリアル作成関数
   * @returns {THREE.Material} マテリアル
   */
  get(key, createFn) {
    if (!this.pool.has(key)) {
      this.pool.set(key, createFn());
    }
    return this.pool.get(key);
  }

  /**
   * プールをクリア（メモリリーク防止）
   */
  clear() {
    for (const material of this.pool.values()) {
      if (material.dispose) {
        material.dispose();
      }
    }
    this.pool.clear();
  }

  /**
   * 使用統計を取得
   * @returns {Object} 統計情報
   */
  getStats() {
    return {
      totalMaterials: this.pool.size,
      memoryEstimate: this.pool.size * 1024, // 概算
    };
  }
}

// グローバルなマテリアルプール
const importanceMaterialPool = new ImportanceMaterialPool();

/**
 * 静的マテリアルをすべて破棄する（メモリリーク防止）
 * アプリケーション終了時またはシーンリセット時に呼び出す
 */
function disposeStaticMaterials() {
  for (const key in materials) {
    const material = materials[key];
    if (material && typeof material.dispose === 'function') {
      material.dispose();
    }
  }
}




// --- 重要度別色分け機能 ---

/**
 * 高速ハッシュキー生成
 * @param {string} prefix - プレフィックス
 * @param {...any} values - 値
 * @returns {string} ハッシュキー
 */
function generateMaterialCacheKey(prefix, ...values) {
  // FNV-1aハッシュアルゴリズム（高速でキャッシュキー生成に適している）
  let hash = 2166136261;
  for (const val of values) {
    const str = val === undefined || val === null ? '_' : String(val);
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return `${prefix}:${(hash >>> 0).toString(36)}`;
}

/**
 * 重要度マテリアルキャッシュ
 */
class ImportanceMaterialCache {
  constructor() {
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  getMaterial(importanceLevel, options = {}) {
    // ハッシュベースの高速キー生成（JSON.stringifyより約10倍高速）
    const key = generateMaterialCacheKey(
      'imp',
      importanceLevel,
      options.elementType || 'default',
      options.wireframe ? 'w' : '',
      options.transparent ? 't' : '',
      options.opacity,
    );

    if (this.cache.has(key)) {
      this.hits++;
      return this.cache.get(key);
    }

    this.misses++;
    const material = createImportanceMaterial(importanceLevel, options);
    this.cache.set(key, material);
    return material;
  }

  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * キャッシュ統計情報を取得
   * @returns {Object} 統計情報
   */
  getStats() {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? ((this.hits / total) * 100).toFixed(1) + '%' : '0%',
    };
  }
}

// グローバルキャッシュインスタンス
const importanceMaterialCache = new ImportanceMaterialCache();

/**
 * 重要度別マテリアルを生成
 * @param {string} importanceLevel - 重要度レベル
 * @param {Object} options - オプション設定
 * @returns {THREE.Material} マテリアル
 */
function createImportanceMaterial(importanceLevel, options = {}) {
  // ColorManagerを使用してマテリアルを取得
  const materialParams = {
    elementType: options.elementType,
    importanceLevel: importanceLevel,
    wireframe: options.wireframe,
    isLine: false,
    isPoly: false,
  };

  const material = colorManager.getMaterial('importance', materialParams);

  return material;
}

/**
 * オブジェクトに重要度マテリアルを適用
 * @param {THREE.Object3D} object - 対象オブジェクト
 * @param {Object} options - オプション設定
 */
export function applyImportanceColorMode(object, options = {}) {
  try {
    const importance = object.userData.importance;
    const elementType = object.userData.elementType;

    // デバッグ: スラブの処理を追跡
    if (elementType === 'Slab') {
    }

    if (object.isMesh) {
      // 重要度が設定されている場合
      if (importance) {
        // 要素タイプ情報をオプションに含める
        const materialOptions = {
          ...options,
          elementType: elementType,
        };

        const material = importanceMaterialCache.getMaterial(importance, materialOptions);
        if (material) {
          object.material = material;
          object.material.needsUpdate = true;
        }
      } else {
        // 重要度情報がない場合は明示的にデフォルト（必須）として扱う
        const materialOptions = {
          ...options,
          elementType: elementType,
        };

        const defaultMaterial = importanceMaterialCache.getMaterial(
          IMPORTANCE_LEVELS.REQUIRED,
          materialOptions,
        );
        if (defaultMaterial) {
          // デバッグ: マテリアル適用を追跡
          if (elementType === 'Slab') {
          }
          object.material = defaultMaterial;
          object.material.needsUpdate = true;
          // userDataにもデフォルト重要度を設定
          object.userData.importance = IMPORTANCE_LEVELS.REQUIRED;
        } else if (elementType === 'Slab') {
          console.warn(
            `[applyImportanceColorMode] Failed to get default material for Slab: id=${object.userData?.id}`,
          );
        }
      }
    }
  } catch (error) {
    console.warn(`Failed to apply importance color mode to object:`, error);
  }
}

/**
 * 重要度マテリアルキャッシュをクリア
 */
export function clearImportanceMaterialCache() {
  importanceMaterialCache.clear();
  // ColorManagerのキャッシュもクリア
  colorManager.clearMaterialCache();
}

/**
 * バッチ処理で複数オブジェクトに重要度マテリアルを適用
 * @param {THREE.Object3D[]} objects - 処理対象オブジェクト配列
 * @param {Object} options - オプション設定
 */
export function applyImportanceColorModeBatch(objects, options = {}) {
  const batchSize = options.batchSize || 100; // バッチサイズ
  const delay = options.delay || 10; // バッチ間の遅延（ms）

  let currentIndex = 0;

  const processBatch = () => {
    const endIndex = Math.min(currentIndex + batchSize, objects.length);

    for (let i = currentIndex; i < endIndex; i++) {
      const object = objects[i];
      if (object.isMesh) {
        applyImportanceColorMode(object, options);
      }
    }

    currentIndex = endIndex;

    if (currentIndex < objects.length) {
      // 次のバッチを遅延実行
      setTimeout(processBatch, delay);
    } else {
      // 全バッチ完了時の処理
      // 再描画をリクエスト
      scheduleRender();
    }
  };

  // 最初のバッチを実行
  processBatch();
}

/**
 * パフォーマンス統計情報を取得
 * @returns {Object} パフォーマンス統計
 */
export function getImportanceRenderingStats() {
  const stats = {
    materialCacheSize: importanceMaterialCache.cache.size,
    runtimeColorsActive: !!window.runtimeImportanceColors,
    runtimeColorCount: window.runtimeImportanceColors
      ? Object.keys(window.runtimeImportanceColors).length
      : 0,
  };

  return stats;
}

/**
 * 全てのマテリアルキャッシュをクリアする
 */
export function clearMaterialCache() {
  // 重要度マテリアルキャッシュをクリア
  clearImportanceMaterialCache();

  // ColorManagerのキャッシュもクリア
  colorManager.clearMaterialCache();
}


// --- 静的マテリアルの動的更新設定 ---
// ElementColorManagerの変更を監視して静的マテリアルを更新
elementColorManager.onColorChange((newColor, oldColor, elementType) => {
  if (elementType === 'Axis') {
    const hex = parseInt(newColor.replace('#', ''), 16);
    materials.axisLine.color.setHex(hex);
    scheduleRender();
  } else if (elementType === 'Story') {
    const hex = parseInt(newColor.replace('#', ''), 16);
    materials.storyLine.color.setHex(hex);
    materials.storyPlane.color.setHex(hex);
    scheduleRender();
  }
});

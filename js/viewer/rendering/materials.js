/**
 * @fileoverview マテリアル定義・管理モジュール
 *
 * このファイルは、3Dビューワーの描画に使用するマテリアルを定義・管理します:
 * - モデル比較用カラーマテリアル（一致、モデルA専用、モデルB専用）
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
import {
  getCurrentColorMode,
  getMaterialForElement,
  COLOR_MODES
} from '../../colorModes.js';
import { IMPORTANCE_LEVELS } from '../../core/importanceManager.js';
import { IMPORTANCE_COLORS } from '../../config/importanceConfig.js';
import { colorManager } from './colorManager.js';
import { THREE_COLORS, LAYOUT_COLORS, UI_COLORS } from '../../config/colorPalette.js';

// --- 重要度別視覚的スタイル定義 ---
export const IMPORTANCE_VISUAL_STYLES = {
  [IMPORTANCE_LEVELS.REQUIRED]: {
    opacity: 1.0,
    outlineWidth: 2.0,
    saturation: 1.0,
    highlightColor: '#FF0000'
  },
  [IMPORTANCE_LEVELS.OPTIONAL]: {
    opacity: 0.8,
    outlineWidth: 1.0,
    saturation: 0.7,
    highlightColor: '#FFA500'
  },
  [IMPORTANCE_LEVELS.UNNECESSARY]: {
    opacity: 0.4,
    outlineWidth: 0.5,
    saturation: 0.3,
    highlightColor: '#808080'
  },
  [IMPORTANCE_LEVELS.NOT_APPLICABLE]: {
    opacity: 0.1,
    outlineWidth: 0.0,
    saturation: 0.1,
    highlightColor: '#404040'
  }
};

// --- マテリアル定義 (clippingPlanesは後で設定) ---
// 注意: これらの固定マテリアルは、主に以下の用途で使用されます：
// 1. ProfileBased*Generatorでメッシュ作成時の一時的なデフォルトマテリアル
// 2. 特殊な要素（Axis、Story等）の表示用マテリアル
// 通常の要素の色付けには、ColorManagerを使用することを推奨します。
// マテリアルデザイン色に統一: matched=マテリアルグリーン（onlyAと統一）、onlyB=マテリアルレッド
export const materials = {
  matched: new THREE.MeshStandardMaterial({
    color: 0x4CAF50, // マテリアルグリーン（一致した要素）- onlyAと統一
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.DoubleSide
  }),
  onlyA: new THREE.MeshStandardMaterial({
    color: 0x4CAF50, // マテリアルグリーン（モデルA専用）
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.DoubleSide
  }),
  onlyB: new THREE.MeshStandardMaterial({
    color: 0xF44336, // マテリアルレッド（モデルB専用）
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.DoubleSide
  }),
  mismatch: new THREE.MeshStandardMaterial({
    color: 0xFF9800, // マテリアルオレンジ（位置一致・属性不一致）
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.DoubleSide
  }),
  // 立体表示（ProfileBased 生成）用の不透明メッシュマテリアル
  // 既存の matched/onlyA/onlyB と同等だが、用途を明示するため別名を用意
  // ProfileBased*Generatorで作成されたメッシュは、後でColorManagerにより適切なマテリアルに差し替えられます
  matchedMesh: new THREE.MeshStandardMaterial({
    color: 0x4CAF50, // マテリアルグリーン（一致した要素）- onlyAと統一
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.DoubleSide,
    transparent: false,
    opacity: 1.0
  }),
  onlyAMesh: new THREE.MeshStandardMaterial({
    color: 0x4CAF50, // マテリアルグリーン（モデルA専用）
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.DoubleSide,
    transparent: false,
    opacity: 1.0
  }),
  onlyBMesh: new THREE.MeshStandardMaterial({
    color: 0xF44336, // マテリアルレッド（モデルB専用）
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.DoubleSide,
    transparent: false,
    opacity: 1.0
  }),
  mismatchMesh: new THREE.MeshStandardMaterial({
    color: 0xFF9800, // マテリアルオレンジ（位置一致・属性不一致）
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.DoubleSide,
    transparent: false,
    opacity: 1.0
  }),
  // stb-diff-viewer造のRC（コンクリート）部分用半透明マテリアル
  // S造（鉄骨）部分が見えるように半透明で表示
  matchedMeshTransparent: new THREE.MeshStandardMaterial({
    color: 0xA5D6A7, // 薄いマテリアルグリーン（コンクリート部分）- onlyAと統一
    roughness: 0.7,
    metalness: 0.0,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.4,
    depthWrite: false // 透明度を正しく表示するため
  }),
  onlyAMeshTransparent: new THREE.MeshStandardMaterial({
    color: 0xA5D6A7, // 薄いマテリアルグリーン（コンクリート部分）
    roughness: 0.7,
    metalness: 0.0,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.4,
    depthWrite: false
  }),
  onlyBMeshTransparent: new THREE.MeshStandardMaterial({
    color: 0xEF9A9A, // 薄いマテリアルレッド（コンクリート部分）
    roughness: 0.7,
    metalness: 0.0,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.4,
    depthWrite: false
  }),
  lineMatched: new THREE.LineBasicMaterial({ color: 0x4CAF50 }), // マテリアルグリーン - onlyAと統一
  lineOnlyA: new THREE.LineBasicMaterial({ color: 0x4CAF50 }), // マテリアルグリーン
  lineOnlyB: new THREE.LineBasicMaterial({ color: 0xF44336 }), // マテリアルレッド
  lineMismatch: new THREE.LineBasicMaterial({ color: 0xFF9800 }), // マテリアルオレンジ（位置一致・属性不一致）
  polyMatched: new THREE.MeshStandardMaterial({
    color: 0x4CAF50, // マテリアルグリーン - onlyAと統一
    roughness: 0.8,
    metalness: 0.1,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7
  }),
  polyOnlyA: new THREE.MeshStandardMaterial({
    color: 0x4CAF50, // マテリアルグリーン
    roughness: 0.8,
    metalness: 0.1,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7
  }),
  polyOnlyB: new THREE.MeshStandardMaterial({
    color: 0xF44336, // マテリアルレッド
    roughness: 0.8,
    metalness: 0.1,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7
  }),
  polyMismatch: new THREE.MeshStandardMaterial({
    color: 0xFF9800, // マテリアルオレンジ（位置一致・属性不一致）
    roughness: 0.8,
    metalness: 0.1,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7
  }),
  axisLine: new THREE.LineBasicMaterial({ color: 0x888888, linewidth: 1 }), // 通り芯用マテリアル (一点鎖線はジオメトリで実現)
  storyLine: new THREE.LineBasicMaterial({
    color: 0xaaaaaa,
    linewidth: 1,
    transparent: true,
    opacity: 0.5
  }), // 階表示用マテリアル (線)
  axisPlane: new THREE.MeshBasicMaterial({
    color: 0x888888,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.1,
    depthWrite: false
  }),
  storyPlane: new THREE.MeshBasicMaterial({
    color: 0xaaaaaa,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.08,
    depthWrite: false
  }),
  // ★★★ ハイライト用マテリアル（マテリアルデザインに統一）★★★
  highlightMesh: new THREE.MeshStandardMaterial({
    color: 0xFFC107, // マテリアルアンバー（ハイライト用）
    roughness: 0.5,
    metalness: 0.2,
    side: THREE.DoubleSide,
    emissive: 0x554400 // エミッシブ色もアンバー系に調整
  }), // メッシュ要素（節点、スラブ、壁）用
  highlightLine: new THREE.LineBasicMaterial({ color: 0xFFC107, linewidth: 5 }), // マテリアルアンバー（ハイライト用）
  // 立体表示時の配置基準線（軸）用ラインマテリアル
  placementLine: new THREE.LineBasicMaterial({
    color: 0x333333,
    linewidth: 1,
    transparent: true,
    opacity: 0.85,
    depthTest: false // メッシュ越しでも視認できるように
  })
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
  toleranceState = null
) {
  const colorMode = getCurrentColorMode();

  // ColorManagerを使用してマテリアルを取得
  let materialMode;
  const materialParams = {
    elementType,
    comparisonState,
    isLine,
    isPoly,
    toleranceState
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
export function createImportanceAwareMaterial(baseMaterial, importance) {
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
    opacity: Math.min(style.opacity, 0.8) // アウトラインは少し薄く
  });

  // クリッピング平面を設定
  outlineMaterial.clippingPlanes = renderer?.clippingPlanes || [];

  return outlineMaterial;
}

/**
 * 要素と重要度に基づいた完全なマテリアルセット作成
 * @param {string} elementType - 要素タイプ
 * @param {string} comparisonState - 比較状態
 * @param {boolean} isLine - 線要素かどうか
 * @param {boolean} isPoly - ポリゴン要素かどうか
 * @param {string} importance - 重要度レベル
 * @param {string} elementId - 要素ID
 * @returns {Object} {material: THREE.Material, outlineMaterial: THREE.Material|null}
 */
export function createElementMaterialWithImportance(
  elementType,
  comparisonState,
  isLine = false,
  isPoly = false,
  importance = null,
  elementId = null
) {
  // ベースマテリアルを取得
  const baseMaterial = getMaterialForElementWithMode(
    elementType,
    comparisonState,
    isLine,
    isPoly,
    elementId
  );

  // 重要度調整を適用
  const adjustedMaterial = createImportanceAwareMaterial(
    baseMaterial,
    importance
  );

  // アウトライン用マテリアルを作成（必要な場合）
  const outlineMaterial = createImportanceOutlineMaterial(importance);

  return {
    material: adjustedMaterial,
    outlineMaterial
  };
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
      memoryEstimate: this.pool.size * 1024 // 概算
    };
  }
}

// グローバルなマテリアルプール
export const importanceMaterialPool = new ImportanceMaterialPool();

/**
 * 重要度フィルタリング用の要素可視性制御
 * @param {THREE.Object3D} object - 制御対象オブジェクト
 * @param {Set<string>} activeImportanceLevels - アクティブな重要度レベル
 */
export function applyImportanceVisibilityFilter(
  object,
  activeImportanceLevels
) {
  const importance = object.userData.importance;

  if (importance) {
    object.visible = activeImportanceLevels.has(importance);
  } else {
    // 重要度情報がない場合はREQUIREDとして扱う
    object.visible = activeImportanceLevels.has(IMPORTANCE_LEVELS.REQUIRED);
  }
}

/**
 * 色付けモードが変更された時にマテリアルを更新する関数
 */
export function updateMaterialsForColorMode() {
  // 既存のマテリアルのクリッピング平面を更新
  updateMaterialClippingPlanes();

  // 重要度マテリアルプールをクリア（色モード変更時は再作成）
  importanceMaterialPool.clear();
}

// --- 重要度別色分け機能 ---

/**
 * 重要度マテリアルキャッシュ
 */
class ImportanceMaterialCache {
  constructor() {
    this.cache = new Map();
  }

  getMaterial(importanceLevel, options = {}) {
    // キャッシュキーに要素タイプも含める
    const key = `${importanceLevel}_${
      options.elementType || 'default'
    }_${JSON.stringify({
      wireframe: options.wireframe,
      transparent: options.transparent,
      opacity: options.opacity
    })}`;

    if (!this.cache.has(key)) {
      this.cache.set(key, createImportanceMaterial(importanceLevel, options));
    }
    return this.cache.get(key);
  }

  clear() {
    this.cache.clear();
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
export function createImportanceMaterial(importanceLevel, options = {}) {
  // ColorManagerを使用してマテリアルを取得
  const materialParams = {
    elementType: options.elementType,
    importanceLevel: importanceLevel,
    wireframe: options.wireframe,
    isLine: false,
    isPoly: false
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
    if (object.isMesh) {
      // 重要度が設定されている場合
      if (importance) {
        // 要素タイプ情報をオプションに含める
        const materialOptions = {
          ...options,
          elementType: elementType
        };

        const material = importanceMaterialCache.getMaterial(
          importance,
          materialOptions
        );
        if (material) {
          object.material = material;
          object.material.needsUpdate = true;
        }
      } else {
        // 重要度情報がない場合は明示的にデフォルト（必須）として扱う
        const materialOptions = {
          ...options,
          elementType: elementType
        };

        const defaultMaterial = importanceMaterialCache.getMaterial(
          IMPORTANCE_LEVELS.REQUIRED,
          materialOptions
        );
        if (defaultMaterial) {
          object.material = defaultMaterial;
          object.material.needsUpdate = true;
          // userDataにもデフォルト重要度を設定
          object.userData.importance = IMPORTANCE_LEVELS.REQUIRED;
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
      const scheduleRender = getState('rendering.scheduleRender');
      if (scheduleRender) {
        scheduleRender();
      }
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
      : 0
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

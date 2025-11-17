/**
 * @fileoverview 色管理モジュール
 *
 * このファイルは、3Dビューワーの全ての色付けを一元管理します：
 * - 差分表示モードの色管理
 * - 部材別色付けモードの色管理
 * - スキーマエラー表示モードの色管理
 * - 重要度別色付けモードの色管理
 * - マテリアルのキャッシュと再利用
 *
 * 各色設定は専用のマネージャークラスで管理され、
 * ColorManagerはこれらを統合してマテリアル生成機能を提供します。
 */

import * as THREE from "three";
import { renderer } from "../core/core.js";
import elementColorManager from "./elementColorManager.js";
import diffColorManager from "./diffColorManager.js";
import schemaColorManager from "./schemaColorManager.js";
import importanceColorManager from "./importanceColorManager.js";

/**
 * 色管理クラス
 * 全ての色付けモードの色設定とマテリアル生成を一元管理
 */
class ColorManager {
  constructor() {
    // 各色管理マネージャーへの参照
    this.elementColorManager = elementColorManager;
    this.diffColorManager = diffColorManager;
    this.schemaColorManager = schemaColorManager;
    this.importanceColorManager = importanceColorManager;

    // マテリアルキャッシュ
    this.materialCache = new Map();

    // 色変更時にマテリアルキャッシュをクリアするコールバックを登録
    elementColorManager.onColorChange(() => this.clearMaterialCache());
    diffColorManager.onColorChange(() => this.clearMaterialCache());
    schemaColorManager.onColorChange(() => this.clearMaterialCache());
    importanceColorManager.onColorChange(() => this.clearMaterialCache());

    console.log("[ColorManager] Initialized with unified color managers");
  }

  /**
   * 差分表示モードの色を取得
   * @param {string} state - 比較状態 ('matched', 'onlyA', 'onlyB')
   * @returns {string} 色コード
   */
  getDiffColor(state) {
    return this.diffColorManager.getDiffColor(state);
  }

  /**
   * 差分表示モードの色を設定
   * @param {string} state - 比較状態 ('matched', 'onlyA', 'onlyB')
   * @param {string} color - 色コード
   */
  setDiffColor(state, color) {
    this.diffColorManager.setDiffColor(state, color);
    console.log(`[ColorManager] Diff color updated: ${state} = ${color}`);
  }

  /**
   * 部材別色を取得
   * @param {string} elementType - 要素タイプ
   * @returns {string} 色コード
   */
  getElementColor(elementType) {
    return this.elementColorManager.getElementColor(elementType);
  }

  /**
   * 部材別色を設定
   * @param {string} elementType - 要素タイプ
   * @param {string} color - 色コード
   */
  setElementColor(elementType, color) {
    this.elementColorManager.setElementColor(elementType, color);
    console.log(
      `[ColorManager] Element color updated: ${elementType} = ${color}`
    );
  }

  /**
   * スキーマ色を取得
   * @param {boolean} hasError - エラーがあるか
   * @returns {string} 色コード
   */
  getSchemaColor(hasError) {
    return this.schemaColorManager.getSchemaColor(hasError);
  }

  /**
   * スキーマ色を設定
   * @param {string} type - 'valid' または 'error'
   * @param {string} color - 色コード
   */
  setSchemaColor(type, color) {
    this.schemaColorManager.setSchemaColor(type, color);
    console.log(`[ColorManager] Schema color updated: ${type} = ${color}`);
  }

  /**
   * 重要度別色を取得
   * @param {string} importanceLevel - 重要度レベル
   * @returns {string} 色コード
   */
  getImportanceColor(importanceLevel) {
    return this.importanceColorManager.getImportanceColor(importanceLevel);
  }

  /**
   * 重要度別色を設定
   * @param {string} importanceLevel - 重要度レベル
   * @param {string} color - 色コード
   */
  setImportanceColor(importanceLevel, color) {
    this.importanceColorManager.setImportanceColor(importanceLevel, color);
    console.log(
      `[ColorManager] Importance color updated: ${importanceLevel} = ${color}`
    );
  }

  /**
   * 重要度別視覚スタイルを取得
   * @param {string} importanceLevel - 重要度レベル
   * @returns {Object} 視覚スタイル
   */
  getImportanceVisualStyle(importanceLevel) {
    return this.importanceColorManager.getVisualStyle(importanceLevel);
  }

  /**
   * マテリアルを取得（キャッシュから取得または新規作成）
   * @param {string} colorMode - 色付けモード
   * @param {Object} params - マテリアル生成パラメータ
   * @returns {THREE.Material} マテリアル
   */
  getMaterial(colorMode, params = {}) {
    const cacheKey = this._generateCacheKey(colorMode, params);

    if (this.materialCache.has(cacheKey)) {
      return this.materialCache.get(cacheKey);
    }

    const material = this._createMaterial(colorMode, params);
    this.materialCache.set(cacheKey, material);

    return material;
  }

  /**
   * マテリアルキャッシュキーを生成
   * @private
   */
  _generateCacheKey(colorMode, params) {
    return JSON.stringify({
      mode: colorMode,
      elementType: params.elementType,
      state: params.comparisonState,
      isLine: params.isLine,
      isPoly: params.isPoly,
      importanceLevel: params.importanceLevel,
      wireframe: params.wireframe,
      hasError: params.hasError,
    });
  }

  /**
   * マテリアルを新規作成
   * @private
   */
  _createMaterial(colorMode, params) {
    let color;
    let materialOptions = {
      side: THREE.DoubleSide,
      clippingPlanes: renderer?.clippingPlanes || [],
    };

    // 色付けモードに応じて色を決定
    switch (colorMode) {
      case "diff":
        color = this.getDiffColor(params.comparisonState || "matched");
        break;

      case "element":
        color = this.getElementColor(params.elementType);
        break;

      case "schema":
        color = this.getSchemaColor(params.hasError || false);
        break;

      case "importance":
        color = this.getImportanceColor(params.importanceLevel || "REQUIRED");
        const visualStyle = this.getImportanceVisualStyle(
          params.importanceLevel
        );
        materialOptions.opacity = visualStyle.opacity;
        materialOptions.transparent = visualStyle.opacity < 1.0;
        break;

      default:
        color = "#888888";
    }

    // ワイヤーフレーム設定
    const shouldUseWireframe =
      params.wireframe ||
      params.elementType === "Axis" ||
      params.elementType === "Story";

    if (shouldUseWireframe) {
      materialOptions.wireframe = true;
    }

    // マテリアルタイプに応じて作成
    let material;

    if (params.isLine) {
      // 線要素用マテリアル
      material = new THREE.LineBasicMaterial({
        color: new THREE.Color(color),
        clippingPlanes: materialOptions.clippingPlanes,
      });
    } else if (params.isPoly) {
      // ポリゴン要素用マテリアル（半透明）
      material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        roughness: 0.8,
        metalness: 0.1,
        transparent: true,
        opacity:
          materialOptions.opacity !== undefined ? materialOptions.opacity : 0.7,
        ...materialOptions,
      });
    } else {
      // 通常のメッシュ要素用マテリアル
      const baseOpacity =
        materialOptions.opacity !== undefined ? materialOptions.opacity : 1.0;
      material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        roughness: 0.6,
        metalness: 0.1,
        transparent: baseOpacity < 1.0,
        opacity: baseOpacity,
        ...materialOptions,
      });
    }

    // 彩度調整（重要度モードの場合）
    if (colorMode === "importance" && params.importanceLevel) {
      const visualStyle = this.getImportanceVisualStyle(params.importanceLevel);
      if (visualStyle.saturation < 1.0) {
        this._adjustMaterialSaturation(material, visualStyle.saturation);
      }
    }

    return material;
  }

  /**
   * マテリアルの彩度を調整
   * @private
   */
  _adjustMaterialSaturation(material, saturation) {
    if (!material.color) return;

    const hsl = {};
    material.color.getHSL(hsl);
    hsl.s *= saturation;
    material.color.setHSL(hsl.h, hsl.s, hsl.l);

    if (material.emissive) {
      const emissiveHsl = {};
      material.emissive.getHSL(emissiveHsl);
      emissiveHsl.s *= saturation;
      material.emissive.setHSL(emissiveHsl.h, emissiveHsl.s, emissiveHsl.l);
    }
  }

  /**
   * マテリアルキャッシュをクリア
   */
  clearMaterialCache() {
    // マテリアルを破棄
    for (const material of this.materialCache.values()) {
      if (material.dispose) {
        material.dispose();
      }
    }
    this.materialCache.clear();
    console.log("[ColorManager] Material cache cleared");
  }

  /**
   * 全ての色設定をデフォルトにリセット
   */
  resetAllColors() {
    this.diffColorManager.resetToDefault();
    this.elementColorManager.resetToDefault();
    this.schemaColorManager.resetToDefault();
    this.importanceColorManager.resetToDefault();

    this.clearMaterialCache();
    console.log("[ColorManager] All colors reset to default");
  }

  /**
   * デバッグ情報を取得
   */
  getDebugInfo() {
    return {
      diffColors: this.diffColorManager.getAllDiffColors(),
      elementColors: this.elementColorManager.getAllElementColors(),
      schemaColors: this.schemaColorManager.getAllSchemaColors(),
      importanceColors: this.importanceColorManager.getAllImportanceColors(),
      materialCacheSize: this.materialCache.size,
      managerDebugInfo: {
        diffColorManager: this.diffColorManager.getDebugInfo(),
        elementColorManager: this.elementColorManager.getDebugInfo(),
        schemaColorManager: this.schemaColorManager.getDebugInfo(),
        importanceColorManager: this.importanceColorManager.getDebugInfo(),
      },
    };
  }
}

// シングルトンインスタンスを作成してエクスポート
export const colorManager = new ColorManager();

// ヘルパー関数をエクスポート
export function getDiffColor(state) {
  return colorManager.getDiffColor(state);
}

export function setDiffColor(state, color) {
  colorManager.setDiffColor(state, color);
}

export function getElementColor(elementType) {
  return colorManager.getElementColor(elementType);
}

export function setElementColor(elementType, color) {
  colorManager.setElementColor(elementType, color);
}

export function getSchemaColor(hasError) {
  return colorManager.getSchemaColor(hasError);
}

export function setSchemaColor(type, color) {
  colorManager.setSchemaColor(type, color);
}

export function getImportanceColor(importanceLevel) {
  return colorManager.getImportanceColor(importanceLevel);
}

export function setImportanceColor(importanceLevel, color) {
  colorManager.setImportanceColor(importanceLevel, color);
}

export function getMaterial(colorMode, params) {
  return colorManager.getMaterial(colorMode, params);
}

export function clearMaterialCache() {
  colorManager.clearMaterialCache();
}

export function resetAllColors() {
  colorManager.resetAllColors();
}

export function getColorManagerDebugInfo() {
  return colorManager.getDebugInfo();
}

/**
 * @fileoverview アウトライン・強調表示システム
 *
 * このファイルは、重要度に基づく要素の強調表示機能を提供します:
 * - 高重要度要素の自動アウトライン表示
 * - 差分要素の追加強調
 * - 動的アウトライン色変更
 * - パフォーマンス最適化されたアウトライン管理
 *
 * アウトライン表示により、重要な要素や差分を視覚的に際立たせ、
 * ユーザーの注意を重要な部分に向けることができます。
 */

import * as THREE from 'three';
import { IMPORTANCE_LEVELS } from '../../constants/importanceLevels.js';
import { IMPORTANCE_VISUAL_STYLES, createImportanceOutlineMaterial } from './materials.js';

/**
 * アウトライン管理クラス
 * 重要度に基づくアウトライン表示を効率的に管理
 */
export class OutlineManager {
  constructor() {
    this.outlineObjects = new Map(); // オリジナルオブジェクト -> アウトラインオブジェクト
    this.outlineGroups = new Map(); // 要素タイプ -> アウトライングループ
    this.isEnabled = true;
    this.performanceThreshold = 1000; // アウトライン表示の最大要素数
  }

  /**
   * 要素にアウトラインを追加
   * @param {THREE.Object3D} originalObject - オリジナル要素
   * @param {string} importance - 重要度レベル
   * @param {THREE.Group} parentGroup - 親グループ
   */
  addOutline(originalObject, importance, parentGroup) {
    if (!this.isEnabled || !this.shouldCreateOutline(importance)) {
      return;
    }

    // パフォーマンス制限チェック
    if (this.outlineObjects.size > this.performanceThreshold) {
      console.warn(`Outline limit reached: ${this.performanceThreshold}`);
      return;
    }

    try {
      const outlineObject = this.createOutlineObject(originalObject, importance);
      if (outlineObject) {
        this.outlineObjects.set(originalObject, outlineObject);
        parentGroup.add(outlineObject);

        // アウトラインの位置・回転・スケールを同期
        this.syncTransform(originalObject, outlineObject);
      }
    } catch (error) {
      console.error('Failed to create outline:', error);
    }
  }

  /**
   * アウトラインを削除
   * @param {THREE.Object3D} originalObject - オリジナル要素
   */
  removeOutline(originalObject) {
    const outlineObject = this.outlineObjects.get(originalObject);
    if (outlineObject) {
      // 親から削除
      if (outlineObject.parent) {
        outlineObject.parent.remove(outlineObject);
      }

      // ジオメトリとマテリアルを解放
      this.disposeOutlineObject(outlineObject);

      this.outlineObjects.delete(originalObject);
    }
  }

  /**
   * すべてのアウトラインをクリア
   */
  clearAllOutlines() {
    for (const [originalObject, outlineObject] of this.outlineObjects.entries()) {
      if (outlineObject.parent) {
        outlineObject.parent.remove(outlineObject);
      }
      this.disposeOutlineObject(outlineObject);
    }
    this.outlineObjects.clear();
  }

  /**
   * 重要度変更時のアウトライン更新
   * @param {THREE.Object3D} originalObject - オリジナル要素
   * @param {string} newImportance - 新しい重要度レベル
   * @param {THREE.Group} parentGroup - 親グループ
   */
  updateOutlineImportance(originalObject, newImportance, parentGroup) {
    // 既存のアウトラインを削除
    this.removeOutline(originalObject);

    // 新しい重要度でアウトラインを追加
    this.addOutline(originalObject, newImportance, parentGroup);
  }

  /**
   * アウトラインオブジェクトを作成
   * @param {THREE.Object3D} originalObject - オリジナル要素
   * @param {string} importance - 重要度レベル
   * @returns {THREE.Object3D|null} アウトラインオブジェクト
   */
  createOutlineObject(originalObject, importance) {
    const style = IMPORTANCE_VISUAL_STYLES[importance];
    if (!style || style.outlineWidth <= 0) {
      return null;
    }

    let outlineObject = null;

    if (originalObject.type === 'Line') {
      // 線要素のアウトライン
      outlineObject = this.createLineOutline(originalObject, importance);
    } else if (originalObject.type === 'Mesh') {
      // メッシュ要素のアウトライン
      outlineObject = this.createMeshOutline(originalObject, importance);
    }

    if (outlineObject) {
      outlineObject.userData.isOutline = true;
      outlineObject.userData.originalObject = originalObject;
      outlineObject.userData.importance = importance;
      outlineObject.renderOrder = originalObject.renderOrder - 1; // 背面に描画
    }

    return outlineObject;
  }

  /**
   * 線要素のアウトライン作成
   * @param {THREE.Line} originalLine - オリジナル線要素
   * @param {string} importance - 重要度レベル
   * @returns {THREE.Line|null} アウトライン線要素
   */
  createLineOutline(originalLine, importance) {
    const style = IMPORTANCE_VISUAL_STYLES[importance];

    // より太い線でアウトラインを作成
    const outlineMaterial = new THREE.LineBasicMaterial({
      color: style.highlightColor,
      linewidth: Math.max(style.outlineWidth * 2, 3),
      transparent: true,
      opacity: Math.min(style.opacity * 0.8, 0.7),
    });

    const outlineGeometry = originalLine.geometry.clone();
    const outlineLine = new THREE.Line(outlineGeometry, outlineMaterial);

    return outlineLine;
  }

  /**
   * メッシュ要素のアウトライン作成
   * @param {THREE.Mesh} originalMesh - オリジナルメッシュ要素
   * @param {string} importance - 重要度レベル
   * @returns {THREE.Mesh|null} アウトラインメッシュ要素
   */
  createMeshOutline(originalMesh, importance) {
    const outlineMaterial = createImportanceOutlineMaterial(importance);
    if (!outlineMaterial) {
      return null;
    }

    const style = IMPORTANCE_VISUAL_STYLES[importance];
    const outlineGeometry = originalMesh.geometry.clone();
    const outlineMesh = new THREE.Mesh(outlineGeometry, outlineMaterial);

    // スケールを拡大してアウトライン効果を作る
    const scaleMultiplier = 1 + style.outlineWidth * 0.01;
    outlineMesh.scale.multiplyScalar(scaleMultiplier);

    return outlineMesh;
  }

  /**
   * 変形の同期
   * @param {THREE.Object3D} source - ソースオブジェクト
   * @param {THREE.Object3D} target - ターゲットオブジェクト
   */
  syncTransform(source, target) {
    target.position.copy(source.position);
    target.rotation.copy(source.rotation);
    target.scale.copy(source.scale);
  }

  /**
   * アウトラインを作成すべきかの判定
   * @param {string} importance - 重要度レベル
   * @returns {boolean} 作成すべきかどうか
   */
  shouldCreateOutline(importance) {
    if (!importance) return false;

    const style = IMPORTANCE_VISUAL_STYLES[importance];
    return style && style.outlineWidth > 0;
  }

  /**
   * アウトラインオブジェクトのリソースを解放
   * @param {THREE.Object3D} outlineObject - アウトラインオブジェクト
   */
  disposeOutlineObject(outlineObject) {
    if (outlineObject.geometry) {
      outlineObject.geometry.dispose();
    }
    if (outlineObject.material) {
      if (Array.isArray(outlineObject.material)) {
        outlineObject.material.forEach((mat) => mat.dispose());
      } else {
        outlineObject.material.dispose();
      }
    }
  }

  /**
   * アウトライン表示の有効/無効切り替え
   * @param {boolean} enabled - 有効化するかどうか
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;

    // 既存のアウトラインの可視性を制御
    for (const outlineObject of this.outlineObjects.values()) {
      outlineObject.visible = enabled;
    }
  }

  /**
   * パフォーマンス制限値の設定
   * @param {number} threshold - 最大要素数
   */
  setPerformanceThreshold(threshold) {
    this.performanceThreshold = threshold;
  }

  /**
   * 統計情報を取得
   * @returns {Object} 統計情報
   */
  getStats() {
    return {
      totalOutlines: this.outlineObjects.size,
      isEnabled: this.isEnabled,
      performanceThreshold: this.performanceThreshold,
      memoryEstimate: this.outlineObjects.size * 2048, // 概算
    };
  }

  /**
   * デバッグ情報の表示
   */
  debugInfo() {
    console.group('OutlineManager Debug Info');
    console.groupEnd();
  }
}

/**
 * グローバルアウトラインマネージャー
 */
export const globalOutlineManager = new OutlineManager();

/**
 * 要素描画時にアウトラインを自動追加するヘルパー関数
 * @param {THREE.Object3D} element - 要素オブジェクト
 * @param {string} importance - 重要度レベル
 * @param {THREE.Group} parentGroup - 親グループ
 */
export function addImportanceOutline(element, importance, parentGroup) {
  globalOutlineManager.addOutline(element, importance, parentGroup);
}

/**
 * 重要度変更時のアウトライン更新ヘルパー関数
 * @param {THREE.Object3D} element - 要素オブジェクト
 * @param {string} newImportance - 新しい重要度レベル
 * @param {THREE.Group} parentGroup - 親グループ
 */
export function updateElementOutline(element, newImportance, parentGroup) {
  globalOutlineManager.updateOutlineImportance(element, newImportance, parentGroup);
}

/**
 * アウトライン表示設定の管理
 */
export class OutlineSettings {
  constructor() {
    this.settings = {
      enabled: true,
      showOnlyHighImportance: false, // 高重要度のみ表示
      animateOutlines: false, // アニメーション効果
      performanceMode: false, // パフォーマンスモード
      customStyles: {}, // カスタムスタイル
    };
  }

  /**
   * 設定を更新
   * @param {Object} newSettings - 新しい設定
   */
  updateSettings(newSettings) {
    Object.assign(this.settings, newSettings);
    this.applySettings();
  }

  /**
   * 設定を適用
   */
  applySettings() {
    globalOutlineManager.setEnabled(this.settings.enabled);

    if (this.settings.performanceMode) {
      globalOutlineManager.setPerformanceThreshold(500);
    } else {
      globalOutlineManager.setPerformanceThreshold(1000);
    }
  }

  /**
   * 設定を取得
   * @returns {Object} 現在の設定
   */
  getSettings() {
    return { ...this.settings };
  }
}

/**
 * グローバルアウトライン設定
 */
export const globalOutlineSettings = new OutlineSettings();

/**
 * アウトライン機能の初期化
 */
export function initializeOutlineSystem() {
  // デフォルト設定を適用
  globalOutlineSettings.applySettings();

  // パフォーマンス監視の設定
  if (window.performance && window.performance.memory) {
    setInterval(() => {
      const stats = globalOutlineManager.getStats();
      if (stats.totalOutlines > stats.performanceThreshold * 0.8) {
        console.warn('Outline system approaching performance limit:', stats);
      }
    }, 30000); // 30秒ごとにチェック
  }
}

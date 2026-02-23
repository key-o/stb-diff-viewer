/**
 * @fileoverview プロファイルベース間柱形状生成モジュール（リファクタリング版）
 *
 * BaseElementGeneratorを継承した統一アーキテクチャ:
 * 1. ProfileCalculator: プロファイル頂点座標を計算（Three.js非依存）
 * 2. GeometryCalculator: 配置・回転を計算（Three.js非依存）
 * 3. ThreeJSConverter: Three.jsオブジェクトに変換
 *
 * 柱(Column)と同じ実装を使用（間柱は柱と同じ構造を持つため）。
 * createVerticalMemberMesh で共通ロジックを共有し、
 * 間柱は多断面モードを持たない点のみ異なる。
 *
 * IFCProfileFactoryとの統合準備完了。
 *
 * リファクタリング: 2025-12
 * - BaseElementGenerator基底クラスを使用
 * - 統一されたバリデーションとメタデータ構築
 * - ProfileCreationUtilsで共通ロジックを共有
 * - createVerticalMemberMeshによるColumn/Post共通化（2026-02）
 */

import { BaseElementGenerator } from './core/BaseElementGenerator.js';
import { createVerticalMemberMesh } from './core/ProfileCreationUtils.js';

/**
 * プロファイルベースの間柱形状生成（リファクタリング版）
 *
 * 間柱(Post)は柱(Column)と同じ構造を持つため、同じロジックを使用します。
 * createVerticalMemberMesh に処理を委譲し、多断面モードはサポートしません。
 */
export class ProfileBasedPostGenerator extends BaseElementGenerator {
  /**
   * ジェネレーター設定
   */
  static getConfig() {
    return {
      elementName: 'Post',
      loggerName: 'viewer:profile:post',
      defaultElementType: 'Post',
    };
  }

  /**
   * 間柱要素からメッシュを作成
   * @param {Array} postElements - 間柱要素配列
   * @param {Map<string, THREE.Vector3>} nodes - ノードマップ
   * @param {Map<string, Object>} postSections - 間柱断面マップ
   * @param {Map<string, Object>} steelSections - 鋼材形状マップ
   * @param {string} elementType - 要素タイプ
   * @param {boolean} isJsonInput - JSON入力かどうか
   * @returns {Array<THREE.Mesh>} 生成されたメッシュ配列
   */
  static createPostMeshes(
    postElements,
    nodes,
    postSections,
    steelSections,
    elementType = 'Post',
    isJsonInput = false,
  ) {
    return this.createMeshes(
      postElements,
      nodes,
      postSections,
      steelSections,
      elementType,
      isJsonInput,
    );
  }

  /**
   * 単一間柱メッシュを作成（BaseElementGeneratorの抽象メソッドを実装）
   * @param {Object} post - 間柱要素
   * @param {Object} context - コンテキスト
   * @returns {THREE.Mesh|null} メッシュまたはnull
   */
  static _createSingleMesh(post, context) {
    return createVerticalMemberMesh(post, context, this);
  }
}

// デフォルトエクスポート用のレガシーインターフェース
export function createPostMeshes(
  postElements,
  nodes,
  postSections,
  steelSections,
  elementType = 'Post',
  isJsonInput = false,
) {
  return ProfileBasedPostGenerator.createPostMeshes(
    postElements,
    nodes,
    postSections,
    steelSections,
    elementType,
    isJsonInput,
  );
}

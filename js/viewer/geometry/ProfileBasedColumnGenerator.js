/**
 * @fileoverview プロファイルベース柱形状生成モジュール（リファクタリング版）
 *
 * BaseElementGeneratorを継承した統一アーキテクチャ:
 * 1. ProfileCalculator: プロファイル頂点座標を計算（Three.js非依存）
 * 2. GeometryCalculator: 配置・回転を計算（Three.js非依存）
 * 3. ThreeJSConverter: Three.jsオブジェクトに変換
 *
 * IFCProfileFactoryとの統合準備完了。
 *
 * リファクタリング: 2025-12
 * - BaseElementGenerator基底クラスを使用
 * - 統一されたバリデーションとメタデータ構築
 * - ProfileCreationUtilsへの共通ロジック抽出（2026-02）
 * - createVerticalMemberMeshによるColumn/Post共通化（2026-02）
 */

import {
  createTaperedGeometry,
  createMultiSectionGeometry,
} from './core/TaperedGeometryBuilder.js';
import { SRC_COMPONENT_COLORS } from '../../config/colorConfig.js';
import { BaseElementGenerator } from './core/BaseElementGenerator.js';
import { MeshCreationValidator } from './core/MeshCreationValidator.js';
import { createSectionProfile, createVerticalMemberMesh } from './core/ProfileCreationUtils.js';

/**
 * プロファイルベースの柱形状生成（リファクタリング版）
 */
export class ProfileBasedColumnGenerator extends BaseElementGenerator {
  /**
   * ジェネレーター設定
   */
  static getConfig() {
    return {
      elementName: 'Column',
      loggerName: 'viewer:profile:column',
      defaultElementType: 'Column',
    };
  }

  /**
   * 柱要素からメッシュを作成
   * @param {Array} columnElements - 柱要素配列
   * @param {Map<string, THREE.Vector3>} nodes - ノードマップ
   * @param {Map<string, Object>} columnSections - 柱断面マップ
   * @param {Map<string, Object>} steelSections - 鋼材形状マップ
   * @param {string} elementType - 要素タイプ
   * @param {boolean} isJsonInput - JSON入力かどうか
   * @returns {Array<THREE.Mesh>} 生成されたメッシュ配列
   */
  static createColumnMeshes(
    columnElements,
    nodes,
    columnSections,
    steelSections,
    elementType = 'Column',
    isJsonInput = false,
  ) {
    return this.createMeshes(
      columnElements,
      nodes,
      columnSections,
      steelSections,
      elementType,
      isJsonInput,
    );
  }

  /**
   * 単一柱メッシュを作成（BaseElementGeneratorの抽象メソッドを実装）
   * @param {Object} column - 柱要素
   * @param {Object} context - コンテキスト
   * @returns {THREE.Mesh|null} メッシュまたはnull
   */
  static _createSingleMesh(column, context) {
    return createVerticalMemberMesh(column, context, this, {
      supportMultiSection: true,
      srcColors: SRC_COMPONENT_COLORS.Column,
      createMultiSectionGeometry: (sectionData, element, steelSections, length) =>
        this._createMultiSectionGeometry(sectionData, element, steelSections, length),
    });
  }

  /**
   * 多断面ジオメトリを作成
   * @private
   * @param {Object} sectionData - 断面データ（mode='double'/'multi', shapes配列を含む）
   * @param {Object} column - 柱要素データ
   * @param {Map} steelSections - 鋼材形状マップ
   * @param {number} length - 要素長さ（mm）
   * @returns {THREE.BufferGeometry} テーパージオメトリ
   */
  static _createMultiSectionGeometry(sectionData, column, steelSections, length) {
    const log = this._getLogger();

    // MeshCreationValidatorで多断面データを検証
    if (
      !MeshCreationValidator.validateMultiSectionData(sectionData, column.id, {
        elementType: 'Column',
      })
    ) {
      return null;
    }

    // 各断面のプロファイルを作成
    const sections = [];
    log.debug(`Column ${column.id}: 多断面ジオメトリ生成開始 (${sectionData.shapes.length}断面)`);

    for (const shapeInfo of sectionData.shapes) {
      const { pos, shapeName, variant } = shapeInfo;

      // 仮の断面データを作成（各断面用）
      const tempSectionData = {
        shapeName: shapeName,
        section_type: sectionData.section_type,
        profile_type: sectionData.profile_type,
      };

      // steelSectionsから寸法情報を取得
      const steelShape = steelSections?.get(shapeName);
      if (steelShape) {
        tempSectionData.steelShape = steelShape;
        tempSectionData.dimensions = steelShape.dimensions || steelShape;
      }

      // variantから追加の属性情報をコピー（strength等）
      if (variant && variant.attributes) {
        tempSectionData.variantAttributes = variant.attributes;
      }

      // 断面タイプの推定（BaseElementGeneratorのヘルパー使用）
      const sectionType = this._resolveGeometryProfileType(tempSectionData);

      log.debug(
        `  断面[${pos}]: shape=${shapeName}, type=${sectionType}, ` +
          `dims=${JSON.stringify(tempSectionData.dimensions || {}).substring(0, 100)}, ` +
          `variant=${variant ? 'あり' : 'なし'}`,
      );

      // プロファイルを作成
      const prof = createSectionProfile(tempSectionData, sectionType, column.id, log);
      if (!prof || !prof.shape || !prof.shape.extractPoints) {
        log.warn(
          `Column ${column.id}: 断面 ${shapeName}（pos=${pos}）のプロファイル作成に失敗しました`,
        );
        continue;
      }

      // extractPointsでプロファイルの頂点を取得
      const points = prof.shape.extractPoints(12); // 12分割で円弧を近似
      const vertices = points.shape;

      // 頂点を検証（MeshCreationValidator使用）
      if (
        !MeshCreationValidator.validateProfileVertices(vertices, column.id, {
          elementType: 'Column',
          shapeName: shapeName,
        })
      ) {
        continue;
      }

      log.debug(`  → プロファイル生成成功: 頂点数=${vertices.length}`);

      sections.push({
        pos: pos,
        profile: { vertices, holes: [] },
      });
    }

    if (sections.length < 2) {
      log.error(`Column ${column.id}: 有効なプロファイルが2つ未満です（${sections.length}個）`);
      return null;
    }

    // ジオメトリ生成
    try {
      if (sections.length === 2) {
        // 2断面: createTaperedGeometry
        return createTaperedGeometry(sections[0].profile, sections[1].profile, length, {
          segments: 1,
        });
      } else {
        // 3断面以上: createMultiSectionGeometry（柱はハンチ長さ無し）
        return createMultiSectionGeometry(sections, length, {});
      }
    } catch (error) {
      log.error(`Column ${column.id}: テーパージオメトリの生成に失敗しました:`, error);
      return null;
    }
  }
}

// デフォルトエクスポート用のレガシーインターフェース
export function createColumnMeshes(
  columnElements,
  nodes,
  columnSections,
  steelSections,
  elementType = 'Column',
  isJsonInput = false,
) {
  return ProfileBasedColumnGenerator.createColumnMeshes(
    columnElements,
    nodes,
    columnSections,
    steelSections,
    elementType,
    isJsonInput,
  );
}

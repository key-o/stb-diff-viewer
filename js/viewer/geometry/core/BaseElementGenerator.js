/**
 * @fileoverview 基底要素ジェネレータークラス
 *
 * 全てのプロファイルベース要素ジェネレーターの共通基底クラス。
 * コード重複を削減し、一貫したメッシュ生成パターンを提供します。
 *
 * 設計思想:
 * - テンプレートメソッドパターン: createMeshesが共通ループを提供
 * - 戦略パターン: サブクラスが要素固有の処理をオーバーライド
 * - 統一されたバリデーション: MeshCreationValidator使用
 * - 統一されたメタデータ: MeshMetadataBuilder使用
 *
 * 使用例:
 * ```javascript
 * class MyElementGenerator extends BaseElementGenerator {
 *   static getConfig() {
 *     return {
 *       elementName: 'MyElement',
 *       loggerName: 'viewer:geometry:myElement'
 *     };
 *   }
 *   static _createSingleMesh(element, context) {
 *     // 要素固有の処理
 *   }
 * }
 * ```
 */

import { MeshCreationValidator } from './MeshCreationValidator.js';
import { MeshMetadataBuilder } from './MeshMetadataBuilder.js';
import { SectionTypeNormalizer } from './SectionTypeNormalizer.js';
import { createLogger } from '../../../utils/logger.js';

/**
 * 基底要素ジェネレータークラス
 */
export class BaseElementGenerator {
  /**
   * ジェネレーター設定を取得
   * サブクラスでオーバーライドする
   * @returns {Object} 設定オブジェクト
   */
  static getConfig() {
    return {
      elementName: 'Element',
      loggerName: 'viewer:geometry:element',
      defaultElementType: 'Element',
    };
  }

  /**
   * ロガーインスタンスを取得（キャッシュ）
   * @private
   * @returns {Object} ロガー
   */
  static _getLogger() {
    const config = this.getConfig();
    if (!this._loggerInstance || this._loggerName !== config.loggerName) {
      this._loggerInstance = createLogger(config.loggerName);
      this._loggerName = config.loggerName;
    }
    return this._loggerInstance;
  }

  /**
   * 複数要素からメッシュを作成（共通ループ処理）
   *
   * @param {Array} elements - 要素配列
   * @param {Map<string, THREE.Vector3>} nodes - ノードマップ
   * @param {Map<string, Object>} sections - 断面マップ
   * @param {Map<string, Object>} steelSections - 鋼材形状マップ
   * @param {string} [elementType] - 要素タイプ（未指定時はgetConfig().defaultElementType）
   * @param {boolean} [isJsonInput=false] - JSON入力かどうか
   * @returns {Array<THREE.Mesh>} 生成されたメッシュ配列
   */
  static createMeshes(elements, nodes, sections, steelSections, elementType, isJsonInput = false) {
    const config = this.getConfig();
    const log = this._getLogger();
    const resolvedElementType = elementType || config.defaultElementType;

    log.info(`Creating ${elements.length} ${config.elementName} meshes`);
    const meshes = [];

    // コンテキストオブジェクトを作成
    const context = {
      nodes,
      sections,
      steelSections,
      elementType: resolvedElementType,
      isJsonInput,
      log,
    };

    for (const element of elements) {
      try {
        const result = this._createSingleMesh(element, context);

        if (result) {
          // 配列の場合（stb-diff-viewer造などで複数メッシュを生成した場合）は展開
          if (Array.isArray(result)) {
            for (const mesh of result) {
              if (mesh) {
                meshes.push(mesh);
              }
            }
          } else {
            meshes.push(result);
          }
        }
      } catch (error) {
        log.error(`Error creating ${config.elementName} ${element.id}:`, error);
      }
    }

    log.info(`Generated ${meshes.length} ${config.elementName} meshes`);
    return meshes;
  }

  /**
   * 単一要素からメッシュを作成
   * サブクラスでオーバーライドする必須メソッド
   *
   * @param {Object} element - 要素データ
   * @param {Object} context - コンテキスト（nodes, sections, steelSections, elementType, isJsonInput, log）
   * @returns {THREE.Mesh|null} 生成されたメッシュ、またはnull
   * @abstract
   */
  static _createSingleMesh(element, context) {
    throw new Error(`${this.name}._createSingleMesh() must be implemented by subclass`);
  }

  // ===== 共通ヘルパーメソッド =====

  /**
   * バリデーションオプションを生成
   *
   * @param {Object} element - 要素データ
   * @param {Object} context - コンテキスト
   * @param {Object} [options={}] - 追加オプション
   * @returns {Object} バリデーションオプション
   */
  static _createValidatorOptions(element, context, options = {}) {
    return {
      elementType: context.elementType,
      silent: false,
      ...options,
    };
  }

  /**
   * ノード位置をバリデート
   *
   * @param {Object} nodePositions - ノード位置オブジェクト
   * @param {Object} element - 要素データ
   * @param {Object} context - コンテキスト
   * @returns {boolean} 有効な場合true
   */
  static _validateNodePositions(nodePositions, element, context) {
    const options = this._createValidatorOptions(element, context);
    return MeshCreationValidator.validateNodePositions(nodePositions, element.id, options);
  }

  /**
   * 断面データをバリデート
   *
   * @param {Object} sectionData - 断面データ
   * @param {Object} element - 要素データ
   * @param {Object} context - コンテキスト
   * @returns {boolean} 有効な場合true
   */
  static _validateSectionData(sectionData, element, context) {
    const options = this._createValidatorOptions(element, context);
    return MeshCreationValidator.validateSectionData(sectionData, element.id, options);
  }

  /**
   * 配置情報をバリデート
   *
   * @param {Object} placement - 配置情報
   * @param {Object} element - 要素データ
   * @param {Object} context - コンテキスト
   * @returns {boolean} 有効な場合true
   */
  static _validatePlacement(placement, element, context) {
    const options = this._createValidatorOptions(element, context);
    return MeshCreationValidator.validatePlacement(placement, element.id, options);
  }

  /**
   * プロファイル結果をバリデート
   *
   * @param {Object} profileResult - プロファイル結果
   * @param {Object} element - 要素データ
   * @param {Object} context - コンテキスト
   * @returns {boolean} 有効な場合true
   */
  static _validateProfile(profileResult, element, context) {
    const options = this._createValidatorOptions(element, context);
    return MeshCreationValidator.validateProfile(profileResult, element.id, options);
  }

  /**
   * ジオメトリをバリデート
   *
   * @param {THREE.BufferGeometry} geometry - ジオメトリ
   * @param {Object} element - 要素データ
   * @param {Object} context - コンテキスト
   * @returns {boolean} 有効な場合true
   */
  static _validateGeometry(geometry, element, context) {
    const options = this._createValidatorOptions(element, context);
    return MeshCreationValidator.validateGeometry(geometry, element.id, options);
  }

  /**
   * 断面タイプを正規化
   *
   * @param {Object} sectionData - 断面データ
   * @param {Object} [options={}] - 正規化オプション
   * @returns {string} 正規化された断面タイプ
   */
  static _normalizeSectionType(sectionData, options = {}) {
    return SectionTypeNormalizer.normalize(sectionData, options);
  }

  /**
   * 回転角度を計算（isReferenceDirection考慮）
   *
   * @param {Object} sectionData - 断面データ
   * @param {number} baseRotation - 基本回転角度（度）
   * @returns {number} 最終回転角度（度）
   */
  static _calculateRotation(sectionData, baseRotation = 0) {
    return SectionTypeNormalizer.calculateRotationWithReference(sectionData, baseRotation);
  }

  /**
   * 柱/間柱用メタデータを構築
   *
   * @param {Object} params - メタデータパラメータ
   * @returns {Object} userData
   */
  static _buildColumnMetadata(params) {
    return MeshMetadataBuilder.buildForColumn(params);
  }

  /**
   * 梁用メタデータを構築
   *
   * @param {Object} params - メタデータパラメータ
   * @returns {Object} userData
   */
  static _buildBeamMetadata(params) {
    return MeshMetadataBuilder.buildForBeam(params);
  }

  /**
   * 杭用メタデータを構築
   *
   * @param {Object} params - メタデータパラメータ
   * @returns {Object} userData
   */
  static _buildPileMetadata(params) {
    return MeshMetadataBuilder.buildForPile(params);
  }

  /**
   * 基礎用メタデータを構築
   *
   * @param {Object} params - メタデータパラメータ
   * @returns {Object} userData
   */
  static _buildFootingMetadata(params) {
    return MeshMetadataBuilder.buildForFooting(params);
  }

  /**
   * 汎用メタデータを構築
   *
   * @param {Object} params - メタデータパラメータ
   * @returns {Object} userData
   */
  static _buildMetadata(params) {
    return MeshMetadataBuilder.build(params);
  }
}

export default BaseElementGenerator;

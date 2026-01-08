/**
 * @fileoverview ジオメトリジェネレータファクトリー
 *
 * 要素タイプに応じたジオメトリジェネレータを管理・提供します。
 * - ジェネレータクラスの登録と取得
 * - インスタンスのキャッシュ管理
 * - 要素タイプとジェネレータのマッピング
 */

import { createLogger } from '../../utils/logger.js';

// ジェネレータクラスのインポート
import { ProfileBasedBraceGenerator } from './ProfileBasedBraceGenerator.js';
import { ProfileBasedColumnGenerator } from './ProfileBasedColumnGenerator.js';
import { ProfileBasedPostGenerator } from './ProfileBasedPostGenerator.js';
import { ProfileBasedBeamGenerator } from './ProfileBasedBeamGenerator.js';
import { PileGenerator } from './PileGenerator.js';
import { FootingGenerator } from './FootingGenerator.js';
import { ProfileBasedFoundationColumnGenerator } from './ProfileBasedFoundationColumnGenerator.js';
import { SlabGenerator } from './SlabGenerator.js';
import { WallGenerator } from './WallGenerator.js';
import { ParapetGenerator } from './ParapetGenerator.js';
import { JointGenerator } from './JointGenerator.js';
import { StripFootingGenerator } from './StripFootingGenerator.js';

const log = createLogger('GeometryGeneratorFactory');

/**
 * ジェネレータクラスのマッピング
 * @type {Object.<string, {class: Function, method: string}>}
 */
const GENERATOR_MAP = {
  Column: {
    class: ProfileBasedColumnGenerator,
    method: 'createColumnMeshes',
  },
  Post: {
    class: ProfileBasedPostGenerator,
    method: 'createPostMeshes',
  },
  Girder: {
    class: ProfileBasedBeamGenerator,
    method: 'createBeamMeshes',
  },
  Beam: {
    class: ProfileBasedBeamGenerator,
    method: 'createBeamMeshes',
  },
  Brace: {
    class: ProfileBasedBraceGenerator,
    method: 'createBraceMeshes',
  },
  Pile: {
    class: PileGenerator,
    method: 'createPileMeshes',
  },
  Footing: {
    class: FootingGenerator,
    method: 'createFootingMeshes',
  },
  StripFooting: {
    class: StripFootingGenerator,
    method: 'createStripFootingMeshes',
  },
  FoundationColumn: {
    class: ProfileBasedFoundationColumnGenerator,
    method: 'createFoundationColumnMeshes',
  },
  Slab: {
    class: SlabGenerator,
    method: 'createSlabMeshes',
  },
  Wall: {
    class: WallGenerator,
    method: 'createWallMeshes',
  },
  Parapet: {
    class: ParapetGenerator,
    method: 'createParapetMeshes',
  },
  Joint: {
    class: JointGenerator,
    method: 'createJointMeshes',
  },
};

/**
 * ジオメトリジェネレータファクトリークラス
 */
export class GeometryGeneratorFactory {
  constructor() {
    /** @type {Map<string, Object>} ジェネレータインスタンスのキャッシュ */
    this.instanceCache = new Map();
  }

  /**
   * 要素タイプに対応するジェネレータ情報を取得
   * @param {string} elementType - 要素タイプ
   * @returns {{class: Function, method: string}|null} ジェネレータ情報
   */
  getGeneratorInfo(elementType) {
    return GENERATOR_MAP[elementType] || null;
  }

  /**
   * 要素タイプに対応するジェネレータインスタンスを取得
   * @param {string} elementType - 要素タイプ
   * @returns {Object|null} ジェネレータインスタンス
   */
  getGenerator(elementType) {
    const info = this.getGeneratorInfo(elementType);
    if (!info) {
      log.warn(`Unknown element type: ${elementType}`);
      return null;
    }

    // キャッシュから取得、なければ新規作成
    if (!this.instanceCache.has(elementType)) {
      try {
        // 静的クラスの場合はクラス自体を返す
        if (this.isStaticGenerator(info.class)) {
          this.instanceCache.set(elementType, info.class);
        } else {
          this.instanceCache.set(elementType, new info.class());
        }
        log.debug(`Created generator instance for ${elementType}`);
      } catch (error) {
        log.error(`Failed to create generator for ${elementType}:`, error);
        return null;
      }
    }

    return this.instanceCache.get(elementType);
  }

  /**
   * ジェネレータが静的クラスかどうかを判定
   * @param {Function} GeneratorClass - ジェネレータクラス
   * @returns {boolean} 静的クラスの場合true
   */
  isStaticGenerator(GeneratorClass) {
    // 静的メソッドのみを持つジェネレータクラス
    const staticGenerators = [
      JointGenerator,
      SlabGenerator,
      WallGenerator,
      ParapetGenerator,
      PileGenerator,
      FootingGenerator,
      StripFootingGenerator,
    ];
    return staticGenerators.includes(GeneratorClass);
  }

  /**
   * 要素タイプに対応するメッシュ生成メソッドを取得
   * @param {string} elementType - 要素タイプ
   * @returns {string|null} メソッド名
   */
  getGeneratorMethod(elementType) {
    const info = this.getGeneratorInfo(elementType);
    return info ? info.method : null;
  }

  /**
   * メッシュを生成
   * @param {string} elementType - 要素タイプ
   * @param {Array} elements - 要素データ配列
   * @param {Map} nodes - 節点マップ
   * @param {Object} sections - 断面データ
   * @param {Object} steelSections - 鉄骨断面データ
   * @param {boolean} [isJsonInput=false] - JSON入力フラグ
   * @param {Object} [additionalData=null] - 追加データ（開口情報など）
   * @returns {Array} 生成されたメッシュ配列
   */
  createMeshes(
    elementType,
    elements,
    nodes,
    sections,
    steelSections,
    isJsonInput = false,
    additionalData = null,
  ) {
    const generator = this.getGenerator(elementType);
    const method = this.getGeneratorMethod(elementType);

    if (!generator || !method) {
      log.warn(`Cannot create meshes for ${elementType}: generator or method not found`);
      return [];
    }

    try {
      // 静的クラスの場合はクラスメソッドを直接呼び出す
      if (this.isStaticGenerator(generator.constructor || generator)) {
        return generator[method](
          elements,
          nodes,
          sections,
          steelSections,
          elementType,
          isJsonInput,
          additionalData,
        );
      } else {
        return generator[method](
          elements,
          nodes,
          sections,
          steelSections,
          elementType,
          isJsonInput,
          additionalData,
        );
      }
    } catch (error) {
      log.error(`Failed to create meshes for ${elementType}:`, error);
      return [];
    }
  }

  /**
   * キャッシュをクリア
   */
  clearCache() {
    this.instanceCache.clear();
    log.debug('Generator instance cache cleared');
  }

  /**
   * サポートされている要素タイプの一覧を取得
   * @returns {string[]} 要素タイプの配列
   */
  getSupportedTypes() {
    return Object.keys(GENERATOR_MAP);
  }

  /**
   * 要素タイプがサポートされているかを確認
   * @param {string} elementType - 要素タイプ
   * @returns {boolean} サポートされている場合true
   */
  isSupported(elementType) {
    return elementType in GENERATOR_MAP;
  }
}

// シングルトンインスタンス
export const geometryGeneratorFactory = new GeometryGeneratorFactory();

// ジェネレータクラスの直接エクスポート（外部モジュールからの利用用）
export {
  ProfileBasedBraceGenerator,
  ProfileBasedColumnGenerator,
  ProfileBasedPostGenerator,
  ProfileBasedBeamGenerator,
  PileGenerator,
  FootingGenerator,
  ProfileBasedFoundationColumnGenerator,
  SlabGenerator,
  WallGenerator,
  ParapetGenerator,
  JointGenerator,
  StripFootingGenerator,
};

// ジェネレータマップのエクスポート（設定参照用）
export { GENERATOR_MAP };

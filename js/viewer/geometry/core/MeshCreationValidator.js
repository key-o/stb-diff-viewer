/**
 * @fileoverview メッシュ生成バリデーションヘルパー
 *
 * 構造要素メッシュ生成時の共通バリデーション処理を提供します。
 * 重複するバリデーションパターンを統一し、一貫したエラーメッセージを出力します。
 *
 * 使用例:
 * ```javascript
 * if (!MeshCreationValidator.validateNodePositions(nodePositions, element.id)) {
 *   return null;
 * }
 * if (!MeshCreationValidator.validateSectionData(sectionData, element.id)) {
 *   return null;
 * }
 * ```
 */

import { createLogger } from '../../../utils/logger.js';

const log = createLogger('viewer:geometry:validator');

/**
 * メッシュ生成バリデータークラス
 */
export class MeshCreationValidator {
  /**
   * ノード位置を検証
   *
   * @param {Object} nodePositions - ノード位置オブジェクト（getNodePositions()の戻り値）
   * @param {string} elementId - 要素ID（ログ出力用）
   * @param {Object} [options] - オプション
   * @param {string} [options.elementType] - 要素タイプ（ログ出力用）
   * @param {boolean} [options.silent] - trueの場合、警告を出力しない
   * @returns {boolean} 有効な場合true
   */
  static validateNodePositions(nodePositions, elementId, options = {}) {
    const { elementType = 'Element', silent = false } = options;

    if (!nodePositions) {
      if (!silent) {
        log.warn(`${elementType} ${elementId}: ノード位置データがnullです`);
      }
      return false;
    }

    if (!nodePositions.valid) {
      if (!silent) {
        log.warn(`${elementType} ${elementId}をスキップします: ノードデータがありません`);
      }
      return false;
    }

    return true;
  }

  /**
   * 断面データを検証
   *
   * @param {Object|null} sectionData - 断面データ
   * @param {string} elementId - 要素ID（ログ出力用）
   * @param {Object} [options] - オプション
   * @param {string} [options.elementType] - 要素タイプ（ログ出力用）
   * @param {boolean} [options.silent] - trueの場合、警告を出力しない
   * @returns {boolean} 有効な場合true
   */
  static validateSectionData(sectionData, elementId, options = {}) {
    const { elementType = 'Element', silent = false } = options;

    if (!sectionData) {
      if (!silent) {
        log.warn(`${elementType} ${elementId}をスキップします: 断面データがありません`);
      }
      return false;
    }

    return true;
  }

  /**
   * 配置情報（長さ）を検証
   *
   * @param {Object} placement - 配置情報（calculatePlacement系の戻り値）
   * @param {string} elementId - 要素ID（ログ出力用）
   * @param {Object} [options] - オプション
   * @param {string} [options.elementType] - 要素タイプ（ログ出力用）
   * @param {boolean} [options.silent] - trueの場合、警告を出力しない
   * @returns {boolean} 有効な場合true
   */
  static validatePlacement(placement, elementId, options = {}) {
    const { elementType = 'Element', silent = false } = options;

    if (!placement) {
      if (!silent) {
        log.warn(`${elementType} ${elementId}をスキップします: 配置情報がありません`);
      }
      return false;
    }

    if (placement.length === undefined || placement.length === null) {
      if (!silent) {
        log.warn(`${elementType} ${elementId}をスキップします: 長さが未定義です`);
      }
      return false;
    }

    if (placement.length <= 0) {
      if (!silent) {
        log.warn(
          `${elementType} ${elementId}をスキップします: 無効な長さ ${placement.length}`
        );
      }
      return false;
    }

    return true;
  }

  /**
   * プロファイル（断面形状）を検証
   *
   * @param {Object|null} profileResult - プロファイル生成結果
   * @param {string} elementId - 要素ID（ログ出力用）
   * @param {Object} [options] - オプション
   * @param {string} [options.elementType] - 要素タイプ（ログ出力用）
   * @param {boolean} [options.silent] - trueの場合、警告を出力しない
   * @returns {boolean} 有効な場合true
   */
  static validateProfile(profileResult, elementId, options = {}) {
    const { elementType = 'Element', silent = false } = options;

    if (!profileResult) {
      if (!silent) {
        log.warn(`${elementType} ${elementId}をスキップします: プロファイルがありません`);
      }
      return false;
    }

    if (!profileResult.shape) {
      if (!silent) {
        log.warn(
          `${elementType} ${elementId}をスキップします: プロファイルの作成に失敗しました`
        );
      }
      return false;
    }

    return true;
  }

  /**
   * ジオメトリを検証
   *
   * @param {THREE.BufferGeometry|null} geometry - ジオメトリ
   * @param {string} elementId - 要素ID（ログ出力用）
   * @param {Object} [options] - オプション
   * @param {string} [options.elementType] - 要素タイプ（ログ出力用）
   * @param {boolean} [options.silent] - trueの場合、警告を出力しない
   * @returns {boolean} 有効な場合true
   */
  static validateGeometry(geometry, elementId, options = {}) {
    const { elementType = 'Element', silent = false } = options;

    if (!geometry) {
      if (!silent) {
        log.warn(
          `${elementType} ${elementId}をスキップします: ジオメトリの作成に失敗しました`
        );
      }
      return false;
    }

    return true;
  }

  /**
   * 複数の検証を一括実行
   *
   * @param {Object} params - 検証パラメータ
   * @param {Object} [params.nodePositions] - ノード位置（省略可）
   * @param {Object} [params.sectionData] - 断面データ（省略可）
   * @param {Object} [params.placement] - 配置情報（省略可）
   * @param {Object} [params.profileResult] - プロファイル結果（省略可）
   * @param {THREE.BufferGeometry} [params.geometry] - ジオメトリ（省略可）
   * @param {string} params.elementId - 要素ID
   * @param {Object} [options] - オプション
   * @param {string} [options.elementType] - 要素タイプ（ログ出力用）
   * @param {boolean} [options.silent] - trueの場合、警告を出力しない
   * @returns {boolean} 全て有効な場合true
   */
  static validateAll(params, options = {}) {
    const { elementId } = params;

    // ノード位置の検証
    if (params.nodePositions !== undefined) {
      if (!this.validateNodePositions(params.nodePositions, elementId, options)) {
        return false;
      }
    }

    // 断面データの検証
    if (params.sectionData !== undefined) {
      if (!this.validateSectionData(params.sectionData, elementId, options)) {
        return false;
      }
    }

    // 配置情報の検証
    if (params.placement !== undefined) {
      if (!this.validatePlacement(params.placement, elementId, options)) {
        return false;
      }
    }

    // プロファイルの検証
    if (params.profileResult !== undefined) {
      if (!this.validateProfile(params.profileResult, elementId, options)) {
        return false;
      }
    }

    // ジオメトリの検証
    if (params.geometry !== undefined) {
      if (!this.validateGeometry(params.geometry, elementId, options)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 多断面データを検証
   *
   * @param {Object} sectionData - 断面データ
   * @param {string} elementId - 要素ID（ログ出力用）
   * @param {Object} [options] - オプション
   * @param {string} [options.elementType] - 要素タイプ（ログ出力用）
   * @param {number} [options.minShapes=2] - 最小shapes数
   * @param {boolean} [options.silent] - trueの場合、警告を出力しない
   * @returns {boolean} 有効な場合true
   */
  static validateMultiSectionData(sectionData, elementId, options = {}) {
    const { elementType = 'Element', minShapes = 2, silent = false } = options;

    if (!sectionData) {
      if (!silent) {
        log.warn(`${elementType} ${elementId}: 断面データがありません`);
      }
      return false;
    }

    if (!sectionData.shapes || !Array.isArray(sectionData.shapes)) {
      if (!silent) {
        log.warn(`${elementType} ${elementId}: shapes配列がありません`);
      }
      return false;
    }

    if (sectionData.shapes.length < minShapes) {
      if (!silent) {
        log.warn(
          `${elementType} ${elementId}: shapes配列には${minShapes}個以上の要素が必要です（現在: ${sectionData.shapes.length}個）`
        );
      }
      return false;
    }

    return true;
  }

  /**
   * プロファイル頂点を検証
   *
   * @param {Array} vertices - 頂点配列
   * @param {string} elementId - 要素ID（ログ出力用）
   * @param {Object} [options] - オプション
   * @param {string} [options.elementType] - 要素タイプ（ログ出力用）
   * @param {string} [options.shapeName] - 形状名（ログ出力用）
   * @param {number} [options.minVertices=3] - 最小頂点数
   * @param {boolean} [options.silent] - trueの場合、警告を出力しない
   * @returns {boolean} 有効な場合true
   */
  static validateProfileVertices(vertices, elementId, options = {}) {
    const {
      elementType = 'Element',
      shapeName = 'unknown',
      minVertices = 3,
      silent = false
    } = options;

    if (!vertices || !Array.isArray(vertices)) {
      if (!silent) {
        log.warn(
          `${elementType} ${elementId}: 断面 ${shapeName} の頂点配列がありません`
        );
      }
      return false;
    }

    if (vertices.length < minVertices) {
      if (!silent) {
        log.warn(
          `${elementType} ${elementId}: 断面 ${shapeName} の頂点が不十分です（${vertices.length} < ${minVertices}）`
        );
      }
      return false;
    }

    return true;
  }
}

export default MeshCreationValidator;

/**
 * @fileoverview 断面タイプ正規化ユーティリティ
 *
 * 断面データから断面タイプを抽出・正規化する共通処理を提供します。
 * Column、Post、Beam等のジェネレーターで重複していたロジックを統一します。
 *
 * 使用例:
 * ```javascript
 * const sectionType = SectionTypeNormalizer.normalize(sectionData);
 * // => 'H', 'BOX', 'PIPE', 'RECTANGLE', etc.
 * ```
 */

import { inferSectionTypeFromDimensions } from './GeometryCalculator.js';

/**
 * 断面タイプ正規化クラス
 */
export class SectionTypeNormalizer {
  /**
   * サポートされる断面タイプの一覧
   * @constant
   */
  static SUPPORTED_TYPES = [
    'H',
    'BOX',
    'PIPE',
    'RECTANGLE',
    'CIRCLE',
    'L',
    'T',
    'C',
    'FLAT',
    'ROUND',
  ];

  /**
   * 鉄骨断面タイプ
   * @constant
   */
  static STEEL_TYPES = new Set(['H', 'BOX', 'PIPE', 'L', 'T', 'C', 'CIRCLE']);

  /**
   * stb-diff-viewer造（複合構造）タイプ
   * @constant
   */
  static STB_DIFF_VIEWER_TYPES = new Set(['STB-DIFF-VIEWER']);

  /**
   * 断面タイプのエイリアスマップ
   * @constant
   */
  static TYPE_ALIASES = {
    RECTANGULAR: 'RECTANGLE',
    RECT: 'RECTANGLE',
    SQ: 'RECTANGLE',
    SQUARE: 'RECTANGLE',
    CIRCULAR: 'CIRCLE',
    ROUND: 'CIRCLE',
    HOLLOW: 'PIPE',
    TUBE: 'PIPE',
    CHS: 'PIPE',
    RHS: 'BOX',
    SHS: 'BOX',
    I: 'H',
    WIDE_FLANGE: 'H',
    ANGLE: 'L',
    CHANNEL: 'C',
    TEE: 'T',
  };

  /**
   * 断面データから断面タイプを正規化して取得
   *
   * @param {Object} sectionData - 断面データ
   * @param {Object} [options] - オプション
   * @param {string} [options.defaultType='RECTANGLE'] - デフォルトの断面タイプ
   * @param {boolean} [options.inferFromDimensions=true] - 寸法から推定するか
   * @returns {string} 正規化された断面タイプ（大文字）
   */
  static normalize(sectionData, options = {}) {
    const { defaultType = 'RECTANGLE', inferFromDimensions = true } = options;

    if (!sectionData) {
      return defaultType;
    }

    // 1. section_type から取得を試行
    let sectionType = this._extractTypeFromProperty(sectionData.section_type);
    if (sectionType) {
      return sectionType;
    }

    // 2. profile_type から取得を試行
    sectionType = this._extractTypeFromProperty(sectionData.profile_type);
    if (sectionType) {
      return sectionType;
    }

    // 3. steelShape.type から取得を試行
    if (sectionData.steelShape) {
      sectionType = this._extractTypeFromProperty(sectionData.steelShape.type);
      if (sectionType) {
        return sectionType;
      }
    }

    // 4. 寸法から推定
    if (inferFromDimensions) {
      const dimensions = sectionData.dimensions || sectionData;
      const inferred = inferSectionTypeFromDimensions(dimensions);
      if (inferred && inferred !== 'UNKNOWN') {
        return inferred;
      }
    }

    return defaultType;
  }

  /**
   * プロパティ値から断面タイプを抽出
   *
   * @private
   * @param {string|undefined} value - プロパティ値
   * @returns {string|null} 正規化された断面タイプ、または null
   */
  static _extractTypeFromProperty(value) {
    if (!value || typeof value !== 'string') {
      return null;
    }

    const upper = value.toUpperCase().trim();

    // 'UNKNOWN' の場合は無視
    if (upper === 'UNKNOWN' || upper === '') {
      return null;
    }

    // エイリアス変換
    if (this.TYPE_ALIASES[upper]) {
      return this.TYPE_ALIASES[upper];
    }

    // サポートされているタイプか確認
    if (this.SUPPORTED_TYPES.includes(upper)) {
      return upper;
    }

    // プレフィックスマッチ（例: 'H-400x200' -> 'H'）
    for (const type of this.SUPPORTED_TYPES) {
      if (upper.startsWith(type + '-') || upper.startsWith(type + '_')) {
        return type;
      }
    }

    // そのまま返す（未知のタイプでも大文字化して返す）
    return upper;
  }

  /**
   * 断面タイプが鉄骨タイプかどうかを判定
   *
   * @param {string} sectionType - 断面タイプ
   * @returns {boolean} 鉄骨タイプの場合true
   */
  static isSteelType(sectionType) {
    if (!sectionType) {
      return false;
    }
    return this.STEEL_TYPES.has(sectionType.toUpperCase());
  }

  /**
   * 断面タイプがRC（鉄筋コンクリート）タイプかどうかを判定
   *
   * @param {string} sectionType - 断面タイプ
   * @returns {boolean} RCタイプの場合true
   */
  static isRcType(sectionType) {
    if (!sectionType) {
      return false;
    }
    const upper = sectionType.toUpperCase();
    return upper === 'RECTANGLE' || upper === 'CIRCLE';
  }

  /**
   * 断面タイプがstb-diff-viewer（鉄骨鉄筋コンクリート）タイプかどうかを判定
   *
   * @param {string} sectionType - 断面タイプ
   * @returns {boolean} stb-diff-viewerタイプの場合true
   */
  static isStbDiffViewerType(sectionType) {
    if (!sectionType) {
      return false;
    }
    return this.STB_DIFF_VIEWER_TYPES.has(sectionType.toUpperCase());
  }

  /**
   * sectionDataがstb-diff-viewer造かどうかを判定（sectionTypeタグ名から）
   *
   * @param {Object} sectionData - 断面データ
   * @returns {boolean} stb-diff-viewer造の場合true
   */
  static isStbDiffViewerSection(sectionData) {
    if (!sectionData) {
      return false;
    }
    // sectionType（タグ名）から判定
    const tagName = sectionData.sectionType || '';
    return /_SRC$/i.test(tagName) || /stb-diff-viewer/i.test(tagName);
  }

  /**
   * 断面タイプが円形系かどうかを判定
   *
   * @param {string} sectionType - 断面タイプ
   * @returns {boolean} 円形系の場合true
   */
  static isCircular(sectionType) {
    if (!sectionType) {
      return false;
    }
    const upper = sectionType.toUpperCase();
    return upper === 'CIRCLE' || upper === 'PIPE';
  }

  /**
   * 断面タイプが中空断面かどうかを判定
   *
   * @param {string} sectionType - 断面タイプ
   * @returns {boolean} 中空断面の場合true
   */
  static isHollow(sectionType) {
    if (!sectionType) {
      return false;
    }
    const upper = sectionType.toUpperCase();
    return upper === 'PIPE' || upper === 'BOX';
  }

  /**
   * 断面データとタイプが一致するか検証
   *
   * @param {Object} sectionData - 断面データ
   * @param {string} expectedType - 期待される断面タイプ
   * @returns {boolean} 一致する場合true
   */
  static validate(sectionData, expectedType) {
    const normalizedType = this.normalize(sectionData);
    return normalizedType === expectedType.toUpperCase();
  }

  /**
   * isReferenceDirection の処理を含む回転角度を計算
   *
   * @param {Object} sectionData - 断面データ
   * @param {number} baseRotation - 基本回転角度（度）
   * @returns {number} 最終回転角度（度）
   */
  static calculateRotationWithReference(sectionData, baseRotation = 0) {
    let rotation = baseRotation;

    // isReferenceDirection が false の場合は90度追加
    if (sectionData && sectionData.isReferenceDirection === false) {
      rotation += 90;
    }

    return rotation;
  }

  /**
   * 断面タイプの表示名を取得
   *
   * @param {string} sectionType - 断面タイプ
   * @returns {string} 表示名
   */
  static getDisplayName(sectionType) {
    if (!sectionType) {
      return '不明';
    }

    const displayNames = {
      H: 'H形鋼',
      BOX: '角形鋼管',
      PIPE: '円形鋼管',
      RECTANGLE: '矩形',
      CIRCLE: '円形',
      L: '山形鋼',
      T: 'T形鋼',
      C: '溝形鋼',
      FLAT: 'フラットバー',
      ROUND: '丸鋼',
    };

    const upper = sectionType.toUpperCase();
    return displayNames[upper] || sectionType;
  }
}

export default SectionTypeNormalizer;

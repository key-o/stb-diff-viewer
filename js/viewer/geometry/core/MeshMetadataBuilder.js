/**
 * @fileoverview メッシュメタデータビルダー
 *
 * 構造要素メッシュのuserDataを統一的に構築します。
 * 重複するメタデータ設定パターンを統一し、一貫したデータ構造を保証します。
 *
 * 使用例:
 * ```javascript
 * mesh.userData = MeshMetadataBuilder.build({
 *   element: beam,
 *   elementType: 'Beam',
 *   placement: placement,
 *   sectionType: sectionType,
 *   profileResult: profileResult,
 *   sectionData: sectionData,
 *   isJsonInput: false
 * });
 * ```
 */

/**
 * メッシュメタデータビルダークラス
 */
export class MeshMetadataBuilder {
  /**
   * メッシュのuserDataを構築
   *
   * @param {Object} params - パラメータ
   * @param {Object} params.element - 要素データ
   * @param {string} params.elementType - 要素タイプ（'Beam', 'Column', 'Brace'など）
   * @param {Object} [params.placement] - 配置情報（lengthを含む）
   * @param {string} [params.sectionType] - 断面タイプ
   * @param {Object} [params.profileResult] - プロファイル生成結果（metaを含む）
   * @param {Object} [params.sectionData] - 元の断面データ
   * @param {boolean} [params.isJsonInput=false] - JSON入力かどうか
   * @param {Object} [params.extraData] - 追加のカスタムデータ
   * @returns {Object} userDataオブジェクト
   */
  static build(params) {
    const {
      element,
      elementType,
      placement,
      sectionType,
      profileResult,
      sectionData,
      isJsonInput = false,
      extraData = {},
    } = params;

    // 基本メタデータ
    const userData = {
      elementType: elementType,
      elementId: element.id,
      isJsonInput: isJsonInput,
      sectionType: sectionType || 'UNKNOWN',
      profileBased: true,
      profileMeta: profileResult?.meta || { profileSource: 'unknown' },
      sectionDataOriginal: sectionData || null,
      sectionId: !isJsonInput && element.id_section ? String(element.id_section) : undefined,
    };

    // 配置情報がある場合、長さを追加
    if (placement) {
      userData.length = placement.length;
    }

    // 要素固有データを保存（elementTypeに応じたキー名を使用）
    const dataKey = this._getElementDataKey(elementType);
    userData[dataKey] = element;

    // 追加のカスタムデータをマージ
    Object.assign(userData, extraData);

    return userData;
  }

  /**
   * 梁用のuserDataを構築（天端基準情報を含む）
   *
   * @param {Object} params - パラメータ
   * @param {Object} params.element - 梁要素データ
   * @param {string} params.elementType - 要素タイプ（通常 'Beam' または 'Girder'）
   * @param {Object} params.placement - 配置情報
   * @param {string} params.sectionType - 断面タイプ
   * @param {Object} params.profileResult - プロファイル生成結果
   * @param {Object} params.sectionData - 断面データ
   * @param {boolean} [params.isJsonInput=false] - JSON入力かどうか
   * @param {number} [params.sectionHeight] - 断面高さ（mm）
   * @param {string} [params.placementMode] - 配置モード（'center' or 'top-aligned'）
   * @returns {Object} userDataオブジェクト
   */
  static buildForBeam(params) {
    const { sectionHeight, placementMode, ...baseParams } = params;

    const userData = this.build(baseParams);

    // 梁固有のプロパティを追加
    if (sectionHeight !== undefined) {
      userData.sectionHeight = sectionHeight;
    }
    if (placementMode) {
      userData.placementMode = placementMode;
    }

    return userData;
  }

  /**
   * 柱/間柱用のuserDataを構築
   *
   * @param {Object} params - パラメータ
   * @param {Object} params.element - 柱/間柱要素データ
   * @param {string} params.elementType - 要素タイプ（'Column' または 'Post'）
   * @param {Object} params.placement - 配置情報
   * @param {string} params.sectionType - 断面タイプ
   * @param {Object} params.profileResult - プロファイル生成結果
   * @param {Object} params.sectionData - 断面データ
   * @param {boolean} [params.isJsonInput=false] - JSON入力かどうか
   * @returns {Object} userDataオブジェクト
   */
  static buildForColumn(params) {
    return this.build(params);
  }

  /**
   * 杭用のuserDataを構築
   *
   * @param {Object} params - パラメータ
   * @param {Object} params.element - 杭要素データ
   * @param {string} params.elementType - 要素タイプ（通常 'Pile'）
   * @param {Object} params.placement - 配置情報
   * @param {string} params.sectionType - 断面タイプ
   * @param {Object} params.profileResult - プロファイル生成結果
   * @param {Object} params.sectionData - 断面データ
   * @param {boolean} [params.isJsonInput=false] - JSON入力かどうか
   * @param {string} [params.pileType] - 杭タイプ（'PHC', 'SC'など）
   * @returns {Object} userDataオブジェクト
   */
  static buildForPile(params) {
    const { pileType, ...baseParams } = params;

    const userData = this.build(baseParams);

    // 杭固有のプロパティを追加
    if (pileType) {
      userData.pileType = pileType;
    }

    return userData;
  }

  /**
   * 基礎用のuserDataを構築
   *
   * @param {Object} params - パラメータ
   * @param {Object} params.element - 基礎要素データ
   * @param {string} params.elementType - 要素タイプ（通常 'Footing'）
   * @param {string} params.sectionType - 断面タイプ
   * @param {Object} params.sectionData - 断面データ
   * @param {boolean} [params.isJsonInput=false] - JSON入力かどうか
   * @param {number} [params.depth] - 基礎深さ（mm）
   * @param {number} [params.levelBottom] - 底面レベル（mm）
   * @returns {Object} userDataオブジェクト
   */
  static buildForFooting(params) {
    const { depth, levelBottom, ...baseParams } = params;

    const userData = this.build(baseParams);

    // 基礎固有のプロパティを追加
    if (depth !== undefined) {
      userData.depth = depth;
    }
    if (levelBottom !== undefined) {
      userData.levelBottom = levelBottom;
    }

    return userData;
  }

  /**
   * 多断面要素用のuserDataを構築
   *
   * @param {Object} params - パラメータ
   * @param {Object} params.element - 要素データ
   * @param {string} params.elementType - 要素タイプ
   * @param {Object} params.placement - 配置情報
   * @param {string} params.sectionType - 断面タイプ
   * @param {Object} params.sectionData - 断面データ（mode='double'/'multi'）
   * @param {boolean} [params.isJsonInput=false] - JSON入力かどうか
   * @param {string} params.mode - 断面モード（'double' or 'multi'）
   * @param {number} [params.sectionCount] - 断面数
   * @returns {Object} userDataオブジェクト
   */
  static buildForMultiSection(params) {
    const { mode, sectionCount, ...baseParams } = params;

    // 多断面の場合はprofileMeta.profileSourceを上書き
    const userData = this.build({
      ...baseParams,
      profileResult: {
        meta: { profileSource: 'multi-section' },
      },
    });

    // 多断面固有のプロパティを追加
    userData.multiSection = true;
    userData.sectionMode = mode;
    if (sectionCount !== undefined) {
      userData.sectionCount = sectionCount;
    }

    return userData;
  }

  /**
   * 要素タイプから要素データのキー名を取得
   *
   * @private
   * @param {string} elementType - 要素タイプ
   * @returns {string} キー名（例: 'beamData', 'columnData'）
   */
  static _getElementDataKey(elementType) {
    // 小文字化してData接尾辞を追加
    const lower = elementType.toLowerCase();
    return `${lower}Data`;
  }

  /**
   * 既存のuserDataに追加プロパティをマージ
   *
   * @param {Object} existingUserData - 既存のuserData
   * @param {Object} additionalData - 追加するプロパティ
   * @returns {Object} マージされたuserData
   */
  static merge(existingUserData, additionalData) {
    return {
      ...existingUserData,
      ...additionalData,
    };
  }

  /**
   * userDataからelement固有データを取得
   *
   * @param {Object} userData - メッシュのuserData
   * @returns {Object|null} 要素固有データ
   */
  static getElementData(userData) {
    if (!userData || !userData.elementType) {
      return null;
    }

    const dataKey = this._getElementDataKey(userData.elementType);
    return userData[dataKey] || null;
  }
}

export default MeshMetadataBuilder;

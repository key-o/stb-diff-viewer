/**
 * @fileoverview 要素比較キーの戦略設定
 * STB要素の対応関係を決定するためのキータイプを定義
 */

/**
 * 要素比較に使用するキーのタイプ
 * @enum {string}
 */
export const COMPARISON_KEY_TYPE = {
  /**
   * 位置情報ベース: 要素の座標（ノード位置）をキーとして使用
   * - ノード: X,Y,Z座標
   * - 線分要素（柱・梁・ブレース）: 始点・終点座標
   * - ポリゴン要素（スラブ・壁）: 頂点座標リスト
   */
  POSITION_BASED: 'position',

  /**
   * GUIDベース: 要素のGUID属性をキーとして使用
   * - GUID属性が存在する場合のみ有効
   * - GUID属性が無い要素は位置情報ベースにフォールバック
   */
  GUID_BASED: 'guid'
};

/**
 * デフォルトの比較キータイプ
 * @type {string}
 */
export const DEFAULT_COMPARISON_KEY_TYPE = COMPARISON_KEY_TYPE.POSITION_BASED;

/**
 * キータイプの表示名
 * @type {Object<string, string>}
 */
export const COMPARISON_KEY_TYPE_LABELS = {
  [COMPARISON_KEY_TYPE.POSITION_BASED]: '位置情報',
  [COMPARISON_KEY_TYPE.GUID_BASED]: 'GUID'
};

/**
 * キータイプの説明
 * @type {Object<string, string>}
 */
export const COMPARISON_KEY_TYPE_DESCRIPTIONS = {
  [COMPARISON_KEY_TYPE.POSITION_BASED]: '要素の座標位置を基準に対応関係を判定します',
  [COMPARISON_KEY_TYPE.GUID_BASED]:
    '要素のGUID属性を基準に対応関係を判定します（GUID無しの要素は位置情報で判定）'
};

/**
 * LocalStorageに保存する際のキー名
 * @type {string}
 */
export const COMPARISON_KEY_TYPE_STORAGE_KEY = 'stb-diff-viewer-comparison-key-type';

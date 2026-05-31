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
   * - GUID属性が無い要素は比較対象から除外（「Aのみ」「Bのみ」に分類）
   */
  GUID_BASED: 'guid',

  /**
   * 所属通芯・階ベース: ノードが所属する階名と通芯名をキーとして使用
   * - StbStory / StbParallelAxis の StbNodeIdList で関連付けられた情報を使用
   * - 所属情報が無いノード・要素は比較対象から除外（「Aのみ」「Bのみ」に分類）
   */
  STORY_AXIS_BASED: 'story_axis',
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
  [COMPARISON_KEY_TYPE.GUID_BASED]: 'GUID',
  [COMPARISON_KEY_TYPE.STORY_AXIS_BASED]: '所属通芯・階',
};

/**
 * キータイプの説明
 * @type {Object<string, string>}
 */
export const COMPARISON_KEY_TYPE_DESCRIPTIONS = {
  [COMPARISON_KEY_TYPE.POSITION_BASED]: '要素の座標位置を基準に対応関係を判定します',
  [COMPARISON_KEY_TYPE.GUID_BASED]:
    '要素のGUID属性を基準に対応関係を判定します（GUID無しの要素は比較対象外）',
  [COMPARISON_KEY_TYPE.STORY_AXIS_BASED]:
    'ノードの所属階と所属通芯の名前を基準に対応関係を判定します（所属情報が無い要素は比較対象外）',
};

/**
 * 配置要素比較モード: 線状要素とポリゴン要素の配置位置比較の詳細度
 * @enum {string}
 */
export const PLACEMENT_COMPARISON_MODE = {
  /**
   * ノード位置のみ: 基準ノード(id_node_start/end)の座標のみでキーを生成
   * - 最も単純な比較
   * - 後方互換性を保証
   * - スピード重視
   */
  NODE_POSITION_ONLY: 'nodePositionOnly',

  /**
   * ノード位置 + オフセット: 基準ノード座標とオフセット値を合算した座標でキーを生成
   * - offset_start_X/Y/Z, offset_end_X/Y/Z を考慮
   * - 配置要素の実際の配置位置を反映
   * - 標準的な配置位置比較
   */
  NODE_POSITION_WITH_OFFSET: 'nodePositionWithOffset',

  /**
   * ノード位置 + オフセット + 回転角: ノード、オフセット、回転角すべてを考慮
   * - offset_start_X/Y/Z, offset_end_X/Y/Z, rotate を考慮
   * - 配置位置と向きの完全な比較
   * - 精度重視
   */
  PLACEMENT_POSITION_COMPLETE: 'placementPositionComplete',
};

/**
 * デフォルトの配置要素比較モード（後方互換性のため段階1）
 * @type {string}
 */
export const DEFAULT_PLACEMENT_COMPARISON_MODE = PLACEMENT_COMPARISON_MODE.NODE_POSITION_ONLY;

/**
 * 配置要素比較モードの表示名
 * @type {Object<string, string>}
 */
export const PLACEMENT_COMPARISON_MODE_LABELS = {
  [PLACEMENT_COMPARISON_MODE.NODE_POSITION_ONLY]: 'ノード位置のみ',
  [PLACEMENT_COMPARISON_MODE.NODE_POSITION_WITH_OFFSET]: 'ノード位置 + オフセット',
  [PLACEMENT_COMPARISON_MODE.PLACEMENT_POSITION_COMPLETE]: 'ノード位置 + オフセット + 回転角',
};

/**
 * 配置要素比較モードの説明
 * @type {Object<string, string>}
 */
export const PLACEMENT_COMPARISON_MODE_DESCRIPTIONS = {
  [PLACEMENT_COMPARISON_MODE.NODE_POSITION_ONLY]:
    '基準ノードの座標のみで比較します。最も高速な比較方式です。',
  [PLACEMENT_COMPARISON_MODE.NODE_POSITION_WITH_OFFSET]:
    'ノード座標 + オフセット値を合算した位置で比較します。要素の正確な配置位置を反映します。',
  [PLACEMENT_COMPARISON_MODE.PLACEMENT_POSITION_COMPLETE]:
    'ノード座標 + オフセット値 + 回転角すべてを考慮します。配置位置と向きを完全に比較します。',
};

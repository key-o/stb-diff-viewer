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
   * 位置情報ベース（ノード位置のみ）: 基準ノード(id_node_start/end)の座標のみをキーとして使用
   * - ノード: X,Y,Z座標
   * - 線分要素（柱・梁・ブレース）: 始点・終点座標
   * - ポリゴン要素（スラブ・壁）: 頂点座標リスト
   * - 最も単純・高速な比較方式（後方互換）
   */
  POSITION_NODE_ONLY: 'position_node',

  /**
   * 位置情報ベース（+オフセット）: 基準ノード座標にオフセット値を加算した座標をキーとして使用
   * - offset_start_X/Y/Z, offset_end_X/Y/Z（線分要素）、StbSlabOffsetList/StbWallOffsetList（ポリゴン要素）を考慮
   * - 配置要素の実際の配置位置を反映する標準的な比較方式
   */
  POSITION_WITH_OFFSET: 'position_offset',

  /**
   * 位置情報ベース（+オフセット+回転角）: ノード座標・オフセット・回転角すべてを考慮した座標をキーとして使用
   * - offset_start_X/Y/Z, offset_end_X/Y/Z, rotate（線分要素）、厚さ（ポリゴン要素）を考慮
   * - 配置位置と向きを完全に比較する精度重視の方式
   */
  POSITION_WITH_ROTATE: 'position_rotate',

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

  /**
   * ジオメトリ中心・方向ベース: 部材の中心位置と方向で近似的に対応関係を判定
   * - 線分要素: 中心位置と軸方向
   * - ポリゴン要素: 中心位置と法線方向
   * - Node / Story / Axis など非ジオメトリ要素は位置情報ベースへフォールバック
   */
  GEOMETRY_CENTER_DIRECTION_BASED: 'geometry_center_direction',
};

/**
 * デフォルトの比較キータイプ
 * @type {string}
 */
export const DEFAULT_COMPARISON_KEY_TYPE = COMPARISON_KEY_TYPE.POSITION_NODE_ONLY;

/**
 * キータイプの表示名
 * @type {Object<string, string>}
 */
export const COMPARISON_KEY_TYPE_LABELS = {
  [COMPARISON_KEY_TYPE.POSITION_NODE_ONLY]: '節点位置',
  [COMPARISON_KEY_TYPE.POSITION_WITH_OFFSET]: '節点位置 + オフセット',
  [COMPARISON_KEY_TYPE.POSITION_WITH_ROTATE]: '節点位置 + オフセット + 回転',
  [COMPARISON_KEY_TYPE.GUID_BASED]: 'GUID',
  [COMPARISON_KEY_TYPE.STORY_AXIS_BASED]: '所属通芯・階',
  [COMPARISON_KEY_TYPE.GEOMETRY_CENTER_DIRECTION_BASED]: 'ジオメトリ中心・方向',
};

/**
 * キータイプの説明
 * @type {Object<string, string>}
 */
export const COMPARISON_KEY_TYPE_DESCRIPTIONS = {
  [COMPARISON_KEY_TYPE.POSITION_NODE_ONLY]: 'StbNode座標のみを基準に対応関係を判定します',
  [COMPARISON_KEY_TYPE.POSITION_WITH_OFFSET]:
    'StbNode座標にStb配置オフセット値を加算した位置を基準に対応関係を判定します',
  [COMPARISON_KEY_TYPE.POSITION_WITH_ROTATE]:
    'StbNode座標にStb配置オフセット値と回転角を加味した位置・向きを基準に対応関係を判定します',
  [COMPARISON_KEY_TYPE.GUID_BASED]:
    '要素のGUID属性を基準に対応関係を判定します（GUID無しの要素は比較対象外）',
  [COMPARISON_KEY_TYPE.STORY_AXIS_BASED]:
    'ノードの所属階と所属通芯の名前を基準に対応関係を判定します（所属情報が無い要素は比較対象外）',
  [COMPARISON_KEY_TYPE.GEOMETRY_CENTER_DIRECTION_BASED]:
    '線材は中心位置と軸方向、面材は中心位置と法線方向の近さで対応関係を判定します',
};

/**
 * 断面一致基準: 部材ペアの「断面が一致している」とみなす条件。
 * COMPARISON_KEY_TYPE（要素の配置対応）とは独立した軸で、断面の対応キー生成と
 * 等価（型差分）判定の双方を切り替える。
 *
 * 適用レイヤー: 対応キー（resolveSectionKeyPart）と内容シグネチャ（resolveSectionContentSignature）の両方。
 *
 * 拠り所により3系統に分類される:
 * - A. 配置要素に紐づく: PLACEMENT_INHERIT / PLACEMENT_FIRST_NODE_STORY
 * - B. GUIDに紐づく: GUID
 * - C. 断面要素で独立: SECTION_ID / NAME / NAME_FLOOR_CANONICAL / GEOMETRY_SHAPE / ALL_ATTRIBUTES
 *
 * 既定 PLACEMENT_INHERIT は配置対応の結果を断面同定に流用し、断面差を型差分として提示する。
 * NAME_FLOOR_CANONICAL は名称ベース比較の異ソフト間対応版で、選択時は低レイヤーの
 * crossSoftwareConfig を有効化し断面定義ツリーの階正準化・開口除外を駆動する
 * （isFloorCanonicalizingSectionCriterion 参照）。
 * @enum {string}
 */
export const SECTION_MATCH_CRITERION = {
  /**
   * 配置対応を継承: 断面をキーに入れず、配置要素の対応（上段の判定基準）が取れたペアの
   * 断面を同一とみなす。断面差は配置一致後の型差分として提示する。
   */
  PLACEMENT_INHERIT: 'placement_inherit',
  /**
   * 配置対応を継承＋第一Node所属階: 配置対応の継承に加え、配置要素の第一Node
   * （線材=始点/下端、面材=頂点列先頭、点=自身）が所属する階名を一致条件へ加える。
   * 階名の表記差ではなくStbStory所属で対応を絞りたい場合に用いる。
   */
  PLACEMENT_FIRST_NODE_STORY: 'placement_first_node_story',
  /** 断面GUID: 断面要素の guid 属性で対応付け（guid が無い断面は配置のみで対応）。 */
  GUID: 'section_guid',
  /** 断面id: id_section（断面参照ID）で対応付け。同一ソフト・同一モデル向け。 */
  SECTION_ID: 'section_id',
  /** 断面名称: 断面 name（符号）で対応付け。全要素種別に適用。 */
  NAME: 'name',
  /**
   * 名称＋階正準化（異ソフト間）: 断面 name（符号）で対応付けつつ、断面定義ツリーの
   * 階(floor)をStbStory標高で正準化し階名の表記差（1 / 1FL / Z01 等）を吸収する。
   * 別ソフトが出力した同一建物の比較向け（旧・異ソフト間比較モード）。
   */
  NAME_FLOOR_CANONICAL: 'name_floor_canonical',
  /** 同一ジオメトリ形状: 形状シグネチャ（梁/大梁=GSS、その他=構成シグネチャ）で対応付け。名称差は無視。 */
  GEOMETRY_SHAPE: 'geometry_shape',
  /** 全属性: 断面の全構成属性（構成シグネチャ）で対応付け。名称・寸法・材質・鉄筋差はすべて別断面扱い。 */
  ALL_ATTRIBUTES: 'all_attributes',
};

/**
 * 既定の断面一致基準（配置対応を継承。旧 AUTO の配置優先挙動を実質引き継ぐ）。
 * @type {string}
 */
export const DEFAULT_SECTION_MATCH_CRITERION = SECTION_MATCH_CRITERION.PLACEMENT_INHERIT;

/**
 * 断面一致基準の表示名
 * @type {Object<string, string>}
 */
export const SECTION_MATCH_CRITERION_LABELS = {
  [SECTION_MATCH_CRITERION.PLACEMENT_INHERIT]: '配置対応を継承',
  [SECTION_MATCH_CRITERION.PLACEMENT_FIRST_NODE_STORY]: '配置対応を継承＋第一Node所属階',
  [SECTION_MATCH_CRITERION.GUID]: '断面GUID',
  [SECTION_MATCH_CRITERION.SECTION_ID]: '断面id',
  [SECTION_MATCH_CRITERION.NAME]: '断面名称',
  [SECTION_MATCH_CRITERION.NAME_FLOOR_CANONICAL]: '名称＋階正準化（異ソフト間）',
  [SECTION_MATCH_CRITERION.GEOMETRY_SHAPE]: '同一ジオメトリ形状',
  [SECTION_MATCH_CRITERION.ALL_ATTRIBUTES]: '全属性',
};

/**
 * 断面一致基準の説明
 * @type {Object<string, string>}
 */
export const SECTION_MATCH_CRITERION_DESCRIPTIONS = {
  [SECTION_MATCH_CRITERION.PLACEMENT_INHERIT]:
    '配置要素の対応（上段の判定基準）が取れたペアの断面を同一とみなします（断面差は型差分として表示）',
  [SECTION_MATCH_CRITERION.PLACEMENT_FIRST_NODE_STORY]:
    '配置対応の継承に加え、配置要素の第一Nodeが所属する階名も一致条件に加えます（階名の表記差ではなくStbStory所属で対応を絞る）',
  [SECTION_MATCH_CRITERION.GUID]:
    '断面要素のGUIDを基準に対応付けます（GUIDが無い断面は配置のみで対応。異ソフト間では一致しません）',
  [SECTION_MATCH_CRITERION.SECTION_ID]:
    '断面参照ID(id_section)を基準に対応付けます（同一ソフト・同一モデルの比較向け）',
  [SECTION_MATCH_CRITERION.NAME]:
    'すべての要素種別で断面名称（符号）を基準に対応付けます（同符号・別形状は型差分として検出）',
  [SECTION_MATCH_CRITERION.NAME_FLOOR_CANONICAL]:
    '別ソフトが出力した同一建物の比較向け。断面名称（符号）で対応付けつつ、断面定義を' +
    'StbStoryの標高で正準化した階で突合し、階名の表記差（1 / 1FL / Z01 等）を吸収します',
  [SECTION_MATCH_CRITERION.GEOMETRY_SHAPE]:
    'すべての要素種別で、生成される3D立体の外形（GSS）を基準に対応付けます（名称・鉄筋・材質は無視し立体形状の一致で判定）',
  [SECTION_MATCH_CRITERION.ALL_ATTRIBUTES]:
    '断面の全構成属性（種別・寸法・材質・強度・鉄筋等）が一致する場合のみ同一断面とみなします',
};

/**
 * 断面一致基準がノード所属階ルックアップ（buildNodeStoryAxisLookup）を必要とするか。
 * PLACEMENT_FIRST_NODE_STORY は第一Nodeの所属階名をキー成分に使うため true。
 * @param {string} criterion - SECTION_MATCH_CRITERION の値
 * @returns {boolean}
 */
export function sectionCriterionNeedsStoryLookup(criterion) {
  return criterion === SECTION_MATCH_CRITERION.PLACEMENT_FIRST_NODE_STORY;
}

/**
 * 通り芯・階の対応判定基準: StbStory / StbParallelAxis 等の非描画・非ジオメトリ要素を
 * どう対応付けるか。名前（符号）ベースと幾何位置ベースを切り替える。
 *
 * 名前の表記差（"1F" vs "1FL" 等）だけで別建物/別ソフトのモデルが Aのみ/Bのみ に
 * 落ちるのを避けたい場合に GEOMETRY を選ぶ。既定 NAME は現行挙動と等価。
 * @enum {string}
 */
export const STORY_AXIS_MATCH_CRITERION = {
  /** 名前: name（符号）で対応付け（現行既定）。 */
  NAME: 'name',
  /** 幾何位置: 階=標高、通り芯=原点＋距離から算出した実座標で対応付け（名称差は無視）。 */
  GEOMETRY: 'geometry',
};

/**
 * 既定の通り芯・階の判定基準（名前ベース＝現行挙動）。
 * @type {string}
 */
export const DEFAULT_STORY_AXIS_MATCH_CRITERION = STORY_AXIS_MATCH_CRITERION.NAME;

/**
 * 通り芯・階の判定基準の表示名
 * @type {Object<string, string>}
 */
export const STORY_AXIS_MATCH_CRITERION_LABELS = {
  [STORY_AXIS_MATCH_CRITERION.NAME]: '名前（符号）',
  [STORY_AXIS_MATCH_CRITERION.GEOMETRY]: '幾何位置（原点＋距離）',
};

/**
 * 通り芯・階の判定基準の説明
 * @type {Object<string, string>}
 */
export const STORY_AXIS_MATCH_CRITERION_DESCRIPTIONS = {
  [STORY_AXIS_MATCH_CRITERION.NAME]: '階名・通り芯名（符号）を基準に対応付けます（現行既定）',
  [STORY_AXIS_MATCH_CRITERION.GEOMETRY]:
    '階は標高、通り芯は原点と距離から算出した実座標を基準に対応付けます（名称の表記差を無視。別ソフト間の同一建物比較向け）',
};

/**
 * 断面一致基準が「階正準化（異ソフト間吸収）」を行うかどうか。
 * elementComparison / stbDefinitionComparator の canonicalizeFloors 導出に用いる
 * 低レイヤー crossSoftwareConfig の同期条件（manager.syncCrossSoftwareConfig）。
 * @param {string} criterion - SECTION_MATCH_CRITERION の値
 * @returns {boolean}
 */
export function isFloorCanonicalizingSectionCriterion(criterion) {
  return criterion === SECTION_MATCH_CRITERION.NAME_FLOOR_CANONICAL;
}

/**
 * 配置要素比較モード: 線状要素とポリゴン要素の配置位置比較の詳細度
 * COMPARISON_KEY_TYPE の位置情報系3種（POSITION_NODE_ONLY/POSITION_WITH_OFFSET/POSITION_WITH_ROTATE）
 * が内部的に使用するキー生成方式。UIでは COMPARISON_KEY_TYPE として選択され、この値は
 * getPlacementModeForKeyType() を通じて導出される。
 * @enum {string}
 */
export const PLACEMENT_COMPARISON_MODE = {
  /** ノード位置のみ: 基準ノード(id_node_start/end)の座標のみでキーを生成 */
  NODE_POSITION_ONLY: 'nodePositionOnly',
  /** ノード位置 + オフセット: 基準ノード座標とオフセット値を合算した座標でキーを生成 */
  NODE_POSITION_WITH_OFFSET: 'nodePositionWithOffset',
  /** ノード位置 + オフセット + 回転角: ノード、オフセット、回転角すべてを考慮 */
  PLACEMENT_POSITION_COMPLETE: 'placementPositionComplete',
};

/**
 * 比較キータイプから、対応する配置要素比較モードを導出する。
 * 位置情報系3種以外のキータイプ（GUID / 所属通芯・階 / ジオメトリ中心・方向）は
 * ノード位置のみ相当（Mode1）を返す。
 * @param {string} keyType - COMPARISON_KEY_TYPE の値
 * @returns {string} PLACEMENT_COMPARISON_MODE の値
 */
export function getPlacementModeForKeyType(keyType) {
  switch (keyType) {
    case COMPARISON_KEY_TYPE.POSITION_WITH_OFFSET:
      return PLACEMENT_COMPARISON_MODE.NODE_POSITION_WITH_OFFSET;
    case COMPARISON_KEY_TYPE.POSITION_WITH_ROTATE:
      return PLACEMENT_COMPARISON_MODE.PLACEMENT_POSITION_COMPLETE;
    default:
      return PLACEMENT_COMPARISON_MODE.NODE_POSITION_ONLY;
  }
}

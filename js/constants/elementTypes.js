/**
 * @fileoverview 要素タイプ定義（単一の情報源 - SSOT）
 *
 * アプリケーション全体で使用する要素タイプを一元管理します。
 * このファイルはthree.jsなどの外部依存を持たず、
 * テスト環境でも安全にインポートできます。
 *
 * 新要素追加時はここに追加し、適切なカテゴリにも振り分けてください。
 */

/**
 * サポートされる全要素タイプ
 * @type {string[]}
 */
export const SUPPORTED_ELEMENTS = [
  'Node',
  'Column',
  'Post',
  'Girder',
  'Beam',
  'Brace',
  'Slab',
  'ShearWall',
  'Wall',
  'Parapet',
  'Joint',
  'Axis',
  'Story',
  'Pile',
  'Footing',
  'StripFooting',
  'FoundationColumn',
  'IsolatingDevice',
  'DampingDevice',
  'FrameDampingDevice',
  'Undefined', // StbSecUndefined断面を参照する要素（常にラインのみ表示）
];

/**
 * 表示モード（立体/線）切替対応要素
 * Node, Axis, Story は表示モード切替の対象外
 * Footing, FoundationColumn, Joint は立体表示のみ（切替不要）
 * @type {string[]}
 */
export const DISPLAY_MODE_ELEMENTS = [
  'Column',
  'Post',
  'Girder',
  'Beam',
  'Brace',
  'Slab',
  'ShearWall',
  'Wall',
  'Parapet',
  'Pile',
  'StripFooting',
  'IsolatingDevice',
  'DampingDevice',
  'FrameDampingDevice',
];

/**
 * 立体表示のみの要素（線表示に切替不可）
 * 点配置要素（1ノード要素）や接合など、線表示が意味をなさない要素
 * @type {string[]}
 */
export const SOLID_ONLY_ELEMENTS = ['Footing', 'FoundationColumn', 'Joint'];

/**
 * ラベル表示対応要素（全要素）
 * @type {string[]}
 */
export const LABEL_ELEMENTS = [...SUPPORTED_ELEMENTS];

/**
 * 色設定対応要素（Axis, Storyを除く）
 * 通り芯と階はLAYOUT_COLORSで別管理
 * @type {string[]}
 */
export const COLOR_ELEMENTS = [
  'Node',
  'Column',
  'Post',
  'Girder',
  'Beam',
  'Brace',
  'Slab',
  'ShearWall',
  'Wall',
  'Parapet',
  'Joint',
  'Pile',
  'Footing',
  'StripFooting',
  'FoundationColumn',
  'IsolatingDevice',
  'DampingDevice',
  'FrameDampingDevice',
  'Undefined',
];

/**
 * 要素カテゴリ（用途別グループ化）
 * @type {Object.<string, string[]>}
 */
export const ELEMENT_CATEGORIES = {
  STRUCTURAL: ['Column', 'Post', 'Girder', 'Beam', 'Brace', 'Joint'],
  SEISMIC: ['IsolatingDevice', 'DampingDevice', 'FrameDampingDevice'],
  SURFACE: ['Slab', 'ShearWall', 'Wall', 'Parapet'],
  FOUNDATION: ['Pile', 'Footing', 'StripFooting', 'FoundationColumn'],
  REFERENCE: ['Node', 'Axis', 'Story'],
};

/**
 * 要素タイプのセット（高速検索用）
 * @type {Set<string>}
 */
export const SUPPORTED_ELEMENTS_SET = new Set(SUPPORTED_ELEMENTS);

/**
 * 要素タイプがサポートされているか確認
 * @param {string} elementType
 * @returns {boolean}
 */
export function isSupportedElement(elementType) {
  return SUPPORTED_ELEMENTS_SET.has(elementType);
}

/**
 * STB XML タグ名定数
 *
 * ST-Bridge XML で使用される要素タグ名を一元管理します。
 * 文字列リテラルの代わりにこの定数を使用してください。
 * @type {Object.<string, string>}
 */
export const STB_TAG_NAMES = {
  // 構造要素（部材）
  NODE: 'StbNode',
  COLUMN: 'StbColumn',
  POST: 'StbPost',
  GIRDER: 'StbGirder',
  BEAM: 'StbBeam',
  BRACE: 'StbBrace',
  SLAB: 'StbSlab',
  WALL: 'StbWall',
  PARAPET: 'StbParapet',
  JOINT: 'StbJoint',
  OPEN: 'StbOpen',

  // 基礎要素
  PILE: 'StbPile',
  FOOTING: 'StbFooting',
  STRIP_FOOTING: 'StbStripFooting',
  FOUNDATION_COLUMN: 'StbFoundationColumn',

  // 免震・制振装置
  ISOLATING_DEVICE: 'StbIsolatingDevice',
  DAMPING_DEVICE: 'StbDampingDevice',
  FRAME_DAMPING_DEVICE: 'StbFrameDampingDevice',

  // 配置・参照要素
  STORY: 'StbStory',
  PARALLEL_AXIS: 'StbParallelAxis',

  // コンテナ要素（複数形）
  COLUMNS: 'StbColumns',
  POSTS: 'StbPosts',
  GIRDERS: 'StbGirders',
  BEAMS: 'StbBeams',
  BRACES: 'StbBraces',
  SLABS: 'StbSlabs',
  WALLS: 'StbWalls',
  PARAPETS: 'StbParapets',
  PILES: 'StbPiles',
  FOOTINGS: 'StbFootings',
  STRIP_FOOTINGS: 'StbStripFootings',
  FOUNDATION_COLUMNS: 'StbFoundationColumns',
  OPENS: 'StbOpens',
  NODES: 'StbNodes',
  STORIES: 'StbStories',

  // 上位コンテナ
  MODEL: 'StbModel',
  COMMON: 'StbCommon',
  MEMBERS: 'StbMembers',
  SECTIONS: 'StbSections',
  AXES: 'StbAxes',
  JOINTS: 'StbJoints',
  EXTENSION: 'StbExtension',
};

/**
 * @fileoverview STB XML タグ名定数
 *
 * ST-Bridge XML で使用される要素タグ名を一元管理します。
 * 文字列リテラルの代わりにこの定数を使用してください。
 *
 * STB読み込み共通カーネル（common-stb/import/）の一部であり、
 * アプリケーション層への依存を持ちません。
 *
 * @module common-stb/import/constants/stbTagNames
 */

/**
 * STB XML タグ名定数
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
  ARC_AXIS: 'StbArcAxis',
  RADIAL_AXIS: 'StbRadialAxis',

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

/**
 * @fileoverview 要素タイプの日本語ラベル定義（単一の情報源 - SSOT）
 *
 * アプリケーション全体で使用する要素タイプの日本語名を一元管理します。
 * 他のモジュールはここからラベル定義をインポートしてください。
 */

// ============================================================================
// 基本的な要素タイプラベル
// ============================================================================

/**
 * 要素タイプの基本表示名
 * @type {Object.<string, string>}
 */
export const ELEMENT_LABELS = {
  Node: '節点',
  Column: '柱',
  Post: '間柱',
  Girder: '大梁',
  Beam: '小梁',
  Brace: 'ブレース',
  Slab: 'スラブ',
  ShearWall: '\u8010\u9707\u58c1',
  Wall: '壁',
  Parapet: 'パラペット',
  Joint: '接合',
  Axis: '通り芯',
  Story: '階',
  Pile: '杭',
  Footing: '基礎',
  StripFooting: '布基礎',
  FoundationColumn: '基礎柱',
  Undefined: '未定義断面',
};

/**
 * 断面タイプの表示名（「〜断面」形式）
 * @type {Object.<string, string>}
 */
export const SECTION_LABELS = {
  Column: '柱断面',
  Post: '間柱断面',
  Girder: '大梁断面',
  Beam: '小梁断面',
  Brace: 'ブレース断面',
  Slab: 'スラブ断面',
  ShearWall: '\u8010\u9707\u58c1\u65ad\u9762',
  Wall: '壁断面',
  Parapet: 'パラペット断面',
  Foundation: '基礎断面',
  Pile: '杭断面',
  Footing: '基礎断面',
  StripFooting: '布基礎断面',
  FoundationColumn: '基礎柱断面',
};

// ============================================================================
// 要素タイプのアイコン
// ============================================================================

/**
 * 要素タイプのアイコンマッピング
 * @type {Object.<string, string>}
 */
export const ELEMENT_ICONS = {
  Node: '⚫',
  Column: '🏛️',
  Post: '│',
  Girder: '➖',
  Beam: '━',
  Brace: '╱',
  Slab: '▭',
  ShearWall: '▰',
  Wall: '▯',
  Parapet: '▬',
  Joint: '⊕',
  Axis: '⊞',
  Story: '⬜',
  Pile: '↓',
  Footing: '⊏',
  StripFooting: '⊐',
  FoundationColumn: '🏛️',
};

// ============================================================================
// STB形式との対応
// ============================================================================

/**
 * 内部要素タイプ名とSTB XML要素名のマッピング
 * @type {Object.<string, string>}
 */
const ELEMENT_TO_STB_NAME = {
  Node: 'StbNode',
  Column: 'StbColumn',
  Post: 'StbPost',
  Girder: 'StbGirder',
  Beam: 'StbBeam',
  Brace: 'StbBrace',
  Slab: 'StbSlab',
  ShearWall: 'StbWall',
  Wall: 'StbWall',
  Parapet: 'StbParapet',
  Joint: 'StbJoint',
  Pile: 'StbPile',
  Footing: 'StbFooting',
  StripFooting: 'StbStripFooting',
  FoundationColumn: 'StbFoundationColumn',
  Story: 'StbStory',
  Axis: 'StbParallelAxis',
};

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 要素タイプの表示名を取得
 * @param {string} elementType - 要素タイプ名
 * @returns {string} 日本語表示名（未定義の場合は元のタイプ名）
 */
function getElementLabel(elementType) {
  return ELEMENT_LABELS[elementType] || elementType;
}

// ============================================================================
// デフォルトエクスポート
// ============================================================================

export default {
  ELEMENT_LABELS,
  SECTION_LABELS,
  ELEMENT_ICONS,
  ELEMENT_TO_STB_NAME,
  getElementLabel,
};

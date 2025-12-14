/**
 * @fileoverview UI要素IDと要素タイプのマッピング設定
 */

/**
 * 要素タイプと立体表示チェックボックスIDのマッピング
 * @type {Object.<string, string>}
 */
export const VIEW_MODE_CHECKBOX_IDS = {
  Column: 'toggleColumnView',
  Post: 'togglePost3DView',
  Girder: 'toggleGirderView',
  Beam: 'toggleBeam3DView',
  Brace: 'toggleBrace3DView',
  Pile: 'togglePile3DView',
  Footing: 'toggleFooting3DView',
  FoundationColumn: 'toggleFoundationColumn3DView',
  Slab: 'toggleSlab3DView',
  Wall: 'toggleWall3DView'
};

/**
 * 再描画が必要な要素タイプのセット
 * ラベル表示切替時に再描画を実行する要素タイプ
 * @type {Set<string>}
 */
export const REDRAW_REQUIRED_ELEMENT_TYPES = new Set([
  'Column',
  'Girder',
  'Beam',
  'Brace',
  'Post',
  'Pile',
  'Footing',
  'FoundationColumn',
  'Slab',
  'Wall'
]);

/**
 * 要素タイプとカテゴリチェックボックスIDのマッピング
 * @type {Array<{id: string, type: string, name: string, solidViewId?: string}>}
 */
export const ELEMENT_TOGGLE_CONFIG = [
  { id: 'toggleBraceView', type: 'Brace', name: 'ブレース', solidViewId: 'toggleBrace3DView' },
  { id: 'togglePileView', type: 'Pile', name: '杭', solidViewId: 'togglePile3DView' },
  { id: 'toggleFootingView', type: 'Footing', name: '基礎', solidViewId: 'toggleFooting3DView' },
  { id: 'toggleFoundationColumnView', type: 'FoundationColumn', name: '基礎柱', solidViewId: 'toggleFoundationColumn3DView' },
  { id: 'toggleSlabView', type: 'Slab', name: 'スラブ', solidViewId: 'toggleSlab3DView' },
  { id: 'toggleWallView', type: 'Wall', name: '壁', solidViewId: 'toggleWall3DView' },
  { id: 'toggleAxisView', type: 'Axis', name: '通り芯' },
  { id: 'toggleStoryView', type: 'Story', name: '階' }
];

/**
 * @fileoverview UI要素IDと要素タイプのマッピング設定
 */

import { ELEMENT_LABELS } from './elementLabels.js';

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
  StripFooting: 'toggleStripFooting3DView',
  FoundationColumn: 'toggleFoundationColumn3DView',
  Slab: 'toggleSlab3DView',
  Wall: 'toggleWall3DView',
  Parapet: 'toggleParapet3DView',
  Joint: 'toggleJoint3DView',
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
  'StripFooting',
  'FoundationColumn',
  'Slab',
  'Wall',
  'Parapet',
  'Joint',
]);

/**
 * 要素タイプとカテゴリチェックボックスIDのマッピング
 * name属性はELEMENT_LABELSから動的に取得（SSOT: elementLabels.js）
 * @type {Array<{id: string, type: string, name: string, solidViewId?: string}>}
 */
const ELEMENT_TOGGLE_CONFIG_BASE = [
  { id: 'toggleBraceView', type: 'Brace', solidViewId: 'toggleBrace3DView' },
  { id: 'togglePileView', type: 'Pile', solidViewId: 'togglePile3DView' },
  { id: 'toggleFootingView', type: 'Footing', solidViewId: 'toggleFooting3DView' },
  {
    id: 'toggleFoundationColumnView',
    type: 'FoundationColumn',
    solidViewId: 'toggleFoundationColumn3DView',
  },
  { id: 'toggleSlabView', type: 'Slab', solidViewId: 'toggleSlab3DView' },
  { id: 'toggleWallView', type: 'Wall', solidViewId: 'toggleWall3DView' },
  { id: 'toggleParapetView', type: 'Parapet', solidViewId: 'toggleParapet3DView' },
  { id: 'toggleJointView', type: 'Joint', solidViewId: 'toggleJoint3DView' },
  { id: 'toggleAxisView', type: 'Axis' },
  { id: 'toggleStoryView', type: 'Story' },
];

// 日本語名をELEMENT_LABELSから取得してマージ
export const ELEMENT_TOGGLE_CONFIG = ELEMENT_TOGGLE_CONFIG_BASE.map((item) => ({
  ...item,
  name: ELEMENT_LABELS[item.type] || item.type,
}));

/**
 * @fileoverview カテゴリ階層定義
 *
 * XSDスキーマに基づくSTB要素の親子関係を定義する静的データ構造。
 * ImportancePanelのサイドバー表示に使用されます。
 */

/**
 * XSDスキーマに基づくカテゴリ階層定義
 * STB要素の親子関係をサイドバーで表現するための構造
 */
export const CATEGORY_HIERARCHY = [
  { type: 'item', id: 'StbCommon' },
  {
    type: 'group',
    label: 'StbAxes',
    children: [
      { type: 'item', id: 'StbParallelAxes' },
      { type: 'item', id: 'StbArcAxes' },
      { type: 'item', id: 'StbRadialAxes' },
      {
        type: 'group',
        label: 'StbDrawingAxes',
        children: [
          { type: 'item', id: 'StbDrawingLineAxis' },
          { type: 'item', id: 'StbDrawingArcAxis' },
        ],
      },
    ],
  },
  { type: 'group', label: 'StbNodes', items: ['StbNodes'] },
  { type: 'group', label: 'StbStories', items: ['StbStories'] },
  {
    type: 'group',
    label: 'StbMembers',
    children: [
      { type: 'item', id: 'StbColumns' },
      { type: 'item', id: 'StbPosts' },
      { type: 'item', id: 'StbGirders' },
      { type: 'item', id: 'StbBeams' },
      { type: 'item', id: 'StbBraces' },
      { type: 'item', id: 'StbSlabs' },
      { type: 'item', id: 'StbWalls' },
      { type: 'item', id: 'StbFootings' },
      { type: 'item', id: 'StbStripFootings' },
      { type: 'item', id: 'StbPiles' },
      { type: 'item', id: 'StbFoundationColumns' },
      { type: 'item', id: 'StbParapets' },
      { type: 'item', id: 'StbOpens' },
    ],
  },
  {
    type: 'group',
    label: 'StbSections',
    children: [
      { type: 'item', id: 'StbSecColumn_RC' },
      { type: 'item', id: 'StbSecColumn_S' },
      { type: 'item', id: 'StbSecColumn_SRC' },
      { type: 'item', id: 'StbSecColumn_CFT' },
      { type: 'item', id: 'StbSecBeam_RC' },
      { type: 'item', id: 'StbSecBeam_S' },
      { type: 'item', id: 'StbSecBeam_SRC' },
      { type: 'item', id: 'StbSecBrace_S' },
      { type: 'item', id: 'StbSecSlab_RC' },
      { type: 'item', id: 'StbSecSlabDeck' },
      { type: 'item', id: 'StbSecSlabPrecast' },
      { type: 'item', id: 'StbSecWall_RC' },
      { type: 'item', id: 'StbSecFoundation_RC' },
      { type: 'item', id: 'StbSecPile_RC' },
      { type: 'item', id: 'StbSecPile_S' },
      { type: 'item', id: 'StbSecPileProduct' },
      { type: 'item', id: 'StbSecParapet_RC' },
    ],
  },
  { type: 'group', label: 'StbJoints', items: ['StbJoints'] },
];

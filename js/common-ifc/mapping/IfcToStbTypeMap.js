/**
 * @fileoverview IFCエンティティタイプ → STB要素タイプのマッピング定数
 * @module IfcToStbTypeMap
 */

import * as WebIFC from 'web-ifc';

/**
 * IFCエンティティタイプコード → STB要素カテゴリ
 * 複数のSTB要素に分かれる場合（Column/Post, Girder/Beam）はデフォルトを定義し、
 * ElementClassifier で判別する。
 */
export const IFC_TO_STB_TYPE = new Map([
  [WebIFC.IFCCOLUMN, { stbCategory: 'column', default: 'StbColumn', alt: 'StbPost' }],
  [WebIFC.IFCBEAM, { stbCategory: 'beam', default: 'StbGirder', alt: 'StbBeam' }],
  [WebIFC.IFCMEMBER, { stbCategory: 'brace', default: 'StbBrace' }],
  [WebIFC.IFCSLAB, { stbCategory: 'slab', default: 'StbSlab' }],
  [WebIFC.IFCWALL, { stbCategory: 'wall', default: 'StbWall' }],
  [WebIFC.IFCWALLSTANDARDCASE, { stbCategory: 'wall', default: 'StbWall' }],
  [WebIFC.IFCPILE, { stbCategory: 'pile', default: 'StbPile' }],
  [WebIFC.IFCFOOTING, { stbCategory: 'footing', default: 'StbFooting' }],
]);

/** 構造要素として処理するIFCタイプコード一覧 */
export const STRUCTURAL_IFC_TYPES = [
  WebIFC.IFCCOLUMN,
  WebIFC.IFCBEAM,
  WebIFC.IFCMEMBER,
  WebIFC.IFCSLAB,
  WebIFC.IFCWALL,
  WebIFC.IFCWALLSTANDARDCASE,
  WebIFC.IFCPILE,
  WebIFC.IFCFOOTING,
];

/** IFCタイプコード → 名前の逆引きマップ */
export const IFC_TYPE_NAMES = new Map([
  [WebIFC.IFCCOLUMN, 'IFCCOLUMN'],
  [WebIFC.IFCBEAM, 'IFCBEAM'],
  [WebIFC.IFCMEMBER, 'IFCMEMBER'],
  [WebIFC.IFCSLAB, 'IFCSLAB'],
  [WebIFC.IFCWALL, 'IFCWALL'],
  [WebIFC.IFCWALLSTANDARDCASE, 'IFCWALLSTANDARDCASE'],
  [WebIFC.IFCPILE, 'IFCPILE'],
  [WebIFC.IFCFOOTING, 'IFCFOOTING'],
]);

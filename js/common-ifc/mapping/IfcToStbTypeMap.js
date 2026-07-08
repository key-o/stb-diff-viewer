/**
 * @fileoverview IFCエンティティタイプ → STB要素タイプのマッピング定数
 * @module IfcToStbTypeMap
 */

import * as WebIFC from 'web-ifc';
import { STB_TAG_NAMES } from '../../constants/elementTypes.js';

/**
 * IFCエンティティタイプコード → STB要素カテゴリ
 * 複数のSTB要素に分かれる場合（Column/Post, Girder/Beam）はデフォルトを定義し、
 * ElementClassifier で判別する。
 */
export const IFC_TO_STB_TYPE = new Map([
  [
    WebIFC.IFCCOLUMN,
    { stbCategory: 'column', default: STB_TAG_NAMES.COLUMN, alt: STB_TAG_NAMES.POST },
  ],
  [WebIFC.IFCBEAM, { stbCategory: 'beam', default: STB_TAG_NAMES.GIRDER, alt: STB_TAG_NAMES.BEAM }],
  [WebIFC.IFCMEMBER, { stbCategory: 'brace', default: STB_TAG_NAMES.BRACE }],
  [WebIFC.IFCSLAB, { stbCategory: 'slab', default: STB_TAG_NAMES.SLAB }],
  [WebIFC.IFCWALL, { stbCategory: 'wall', default: STB_TAG_NAMES.WALL }],
  [WebIFC.IFCWALLSTANDARDCASE, { stbCategory: 'wall', default: STB_TAG_NAMES.WALL }],
  [WebIFC.IFCPILE, { stbCategory: 'pile', default: STB_TAG_NAMES.PILE }],
  [WebIFC.IFCFOOTING, { stbCategory: 'footing', default: STB_TAG_NAMES.FOOTING }],
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

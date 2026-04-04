/**
 * @fileoverview 重要度システム用定数定義
 *
 * ImportanceManagerおよび関連モジュールで使用される定数を集約。
 * Layer 0（constants）に配置し、全レイヤーからimport可能。
 *
 * @module constants/importanceConstants
 */

/**
 * MVDモード定義
 * @enum {string}
 */
export const MVD_MODES = {
  S2: 's2',
  S4: 's4',
  COMBINED: 'mvd-combined',
};

/**
 * 重要度レベルの優先度マッピング
 * @type {Object<string, number>}
 */
export const IMPORTANCE_PRIORITY = {
  notApplicable: 0,
  unnecessary: 1,
  optional: 2,
  required: 3,
};

/**
 * STBモデルのコンテナパス一覧
 * @type {Set<string>}
 */
export const MODEL_CONTAINER_PATHS = new Set([
  '//ST_BRIDGE/StbModel/StbNodes',
  '//ST_BRIDGE/StbModel/StbAxes',
  '//ST_BRIDGE/StbModel/StbStories',
  '//ST_BRIDGE/StbModel/StbMembers',
  '//ST_BRIDGE/StbModel/StbSections',
  '//ST_BRIDGE/StbModel/StbJoints',
  '//ST_BRIDGE/StbModel/StbConnections',
  '//ST_BRIDGE/StbModel/StbWeld',
]);

/**
 * メンバーコレクション名一覧
 * @type {string[]}
 */
export const MEMBER_COLLECTION_NAMES = [
  'StbColumns',
  'StbPosts',
  'StbGirders',
  'StbBeams',
  'StbBraces',
  'StbSlabs',
  'StbWalls',
  'StbFootings',
  'StbStripFootings',
  'StbPiles',
  'StbFoundationColumns',
  'StbParapets',
  'StbOpens',
  'StbIsolatingDevices',
  'StbDampingDevices',
];

/**
 * 軸コレクション名一覧
 * @type {string[]}
 */
export const AXIS_COLLECTION_NAMES = [
  'StbParallelAxes',
  'StbArcAxes',
  'StbRadialAxes',
  'StbDrawingAxes',
];

/**
 * コレクションID属性パターン
 * @type {RegExp}
 */
export const COLLECTION_ID_ATTR_PATTERN = new RegExp(
  `^//ST_BRIDGE/StbModel/(?:StbNodes|StbAxes|StbStories|StbMembers|StbSections|StbJoints|StbConnections|StbWeld|StbMembers/(?:${MEMBER_COLLECTION_NAMES.join('|')})|StbAxes/(?:${AXIS_COLLECTION_NAMES.join('|')}))/@(?:id|guid|name)$`,
);

/**
 * モデルコンテナ属性パターン
 * @type {RegExp}
 */
export const MODEL_CONTAINER_ATTR_PATTERN = new RegExp(
  '^//ST_BRIDGE/StbModel/(?:StbNodes|StbAxes|StbStories|StbMembers|StbSections|StbJoints|StbConnections|StbWeld)/@',
);

/**
 * StbModel直下のルート名一覧
 * @type {string[]}
 */
export const MODEL_PREFIXED_ROOT_NAMES = [
  'StbNodes',
  'StbAxes',
  'StbStories',
  'StbMembers',
  'StbSections',
  'StbJoints',
  'StbConnections',
  'StbWeld',
];

/**
 * 単数形要素の親コレクションマッピング
 * @type {Object<string, string>}
 */
export const SINGULAR_ELEMENT_PARENT_MAP = {
  StbNode: 'StbNodes',
  StbStory: 'StbStories',
  StbParallelAxis: 'StbAxes/StbParallelAxes',
  StbArcAxis: 'StbAxes/StbArcAxes',
  StbRadialAxis: 'StbAxes/StbRadialAxes',
  StbColumn: 'StbMembers/StbColumns',
  StbPost: 'StbMembers/StbPosts',
  StbGirder: 'StbMembers/StbGirders',
  StbBeam: 'StbMembers/StbBeams',
  StbBrace: 'StbMembers/StbBraces',
  StbSlab: 'StbMembers/StbSlabs',
  StbWall: 'StbMembers/StbWalls',
  StbFooting: 'StbMembers/StbFootings',
  StbStripFooting: 'StbMembers/StbStripFootings',
  StbPile: 'StbMembers/StbPiles',
  StbFoundationColumn: 'StbMembers/StbFoundationColumns',
  StbParapet: 'StbMembers/StbParapets',
  StbOpen: 'StbMembers/StbOpens',
  StbIsolatingDevice: 'StbMembers/StbIsolatingDevices',
  StbDampingDevice: 'StbMembers/StbDampingDevices',
};

/**
 * タブIDから親XPathへのマッピング
 * ST-Bridgeスキーマの階層構造に基づく
 * @type {Object<string, string>}
 */
export const TAB_PARENT_PATHS = {
  StbCommon: '//ST_BRIDGE',
  StbNodes: '//ST_BRIDGE/StbModel/StbNodes',
  StbParallelAxes: '//ST_BRIDGE/StbModel/StbAxes/StbParallelAxes',
  StbArcAxes: '//ST_BRIDGE/StbModel/StbAxes/StbArcAxes',
  StbRadialAxes: '//ST_BRIDGE/StbModel/StbAxes/StbRadialAxes',
  StbDrawingLineAxis: '//ST_BRIDGE/StbModel/StbAxes/StbDrawingAxes',
  StbDrawingArcAxis: '//ST_BRIDGE/StbModel/StbAxes/StbDrawingAxes',
  StbStories: '//ST_BRIDGE/StbModel/StbStories',
  StbColumns: '//ST_BRIDGE/StbModel/StbMembers/StbColumns',
  StbPosts: '//ST_BRIDGE/StbModel/StbMembers/StbPosts',
  StbGirders: '//ST_BRIDGE/StbModel/StbMembers/StbGirders',
  StbBeams: '//ST_BRIDGE/StbModel/StbMembers/StbBeams',
  StbBraces: '//ST_BRIDGE/StbModel/StbMembers/StbBraces',
  StbSlabs: '//ST_BRIDGE/StbModel/StbMembers/StbSlabs',
  StbWalls: '//ST_BRIDGE/StbModel/StbMembers/StbWalls',
  StbFootings: '//ST_BRIDGE/StbModel/StbMembers/StbFootings',
  StbStripFootings: '//ST_BRIDGE/StbModel/StbMembers/StbStripFootings',
  StbPiles: '//ST_BRIDGE/StbModel/StbMembers/StbPiles',
  StbFoundationColumns: '//ST_BRIDGE/StbModel/StbMembers/StbFoundationColumns',
  StbParapets: '//ST_BRIDGE/StbModel/StbMembers/StbParapets',
  StbOpens: '//ST_BRIDGE/StbModel/StbMembers/StbOpens',
  StbIsolatingDevices: '//ST_BRIDGE/StbModel/StbMembers/StbIsolatingDevices',
  StbDampingDevices: '//ST_BRIDGE/StbModel/StbMembers/StbDampingDevices',
  StbSecColumn_RC: '//ST_BRIDGE/StbModel/StbSections/StbSecColumn_RC',
  StbSecColumn_S: '//ST_BRIDGE/StbModel/StbSections/StbSecColumn_S',
  StbSecColumn_SRC: '//ST_BRIDGE/StbModel/StbSections/StbSecColumn_SRC',
  StbSecColumn_CFT: '//ST_BRIDGE/StbModel/StbSections/StbSecColumn_CFT',
  StbSecBeam_RC: '//ST_BRIDGE/StbModel/StbSections/StbSecBeam_RC',
  StbSecBeam_S: '//ST_BRIDGE/StbModel/StbSections/StbSecBeam_S',
  StbSecBeam_SRC: '//ST_BRIDGE/StbModel/StbSections/StbSecBeam_SRC',
  StbSecBrace_S: '//ST_BRIDGE/StbModel/StbSections/StbSecBrace_S',
  StbSecSlab_RC: '//ST_BRIDGE/StbModel/StbSections/StbSecSlab_RC',
  StbSecSlabDeck: '//ST_BRIDGE/StbModel/StbSections/StbSecSlabDeck',
  StbSecSlabPrecast: '//ST_BRIDGE/StbModel/StbSections/StbSecSlabPrecast',
  StbSecWall_RC: '//ST_BRIDGE/StbModel/StbSections/StbSecWall_RC',
  StbSecFoundation_RC: '//ST_BRIDGE/StbModel/StbSections/StbSecFoundation_RC',
  StbSecPile_RC: '//ST_BRIDGE/StbModel/StbSections/StbSecPile_RC',
  StbSecPile_S: '//ST_BRIDGE/StbModel/StbSections/StbSecPile_S',
  StbSecPileProduct: '//ST_BRIDGE/StbModel/StbSections/StbSecPileProduct',
  StbSecParapet_RC: '//ST_BRIDGE/StbModel/StbSections/StbSecParapet_RC',
  StbSecIsolatingDevice: '//ST_BRIDGE/StbModel/StbSections/StbSecIsolatingDevice',
  StbSecDampingDevice: '//ST_BRIDGE/StbModel/StbSections/StbSecDampingDevice',
  StbJoints: '//ST_BRIDGE/StbModel/StbJoints',
};

/**
 * STB要素のタブ別グループ化定義（C#版ImportanceSetting.csと対応）
 * @type {Array<{id: string, name: string, xsdElem?: string}>}
 */
export const STB_ELEMENT_TABS = [
  { id: 'StbCommon', name: 'StbCommon', xsdElem: 'StbCommon' },
  { id: 'StbNodes', name: 'StbNodes', xsdElem: 'StbNode' },
  { id: 'StbParallelAxes', name: 'StbParallelAxes', xsdElem: 'StbParallelAxis' },
  { id: 'StbArcAxes', name: 'StbArcAxes', xsdElem: 'StbArcAxis' },
  { id: 'StbRadialAxes', name: 'StbRadialAxes', xsdElem: 'StbRadialAxis' },
  { id: 'StbDrawingLineAxis', name: 'StbDrawingLineAxis', xsdElem: 'StbDrawingLineAxis' },
  { id: 'StbDrawingArcAxis', name: 'StbDrawingArcAxis', xsdElem: 'StbDrawingArcAxis' },
  { id: 'StbStories', name: 'StbStories', xsdElem: 'StbStory' },
  { id: 'StbColumns', name: 'StbColumns', xsdElem: 'StbColumn' },
  { id: 'StbPosts', name: 'StbPosts', xsdElem: 'StbPost' },
  { id: 'StbGirders', name: 'StbGirders', xsdElem: 'StbGirder' },
  { id: 'StbBeams', name: 'StbBeams', xsdElem: 'StbBeam' },
  { id: 'StbBraces', name: 'StbBraces', xsdElem: 'StbBrace' },
  { id: 'StbSlabs', name: 'StbSlabs', xsdElem: 'StbSlab' },
  { id: 'StbWalls', name: 'StbWalls', xsdElem: 'StbWall' },
  { id: 'StbFootings', name: 'StbFootings', xsdElem: 'StbFooting' },
  { id: 'StbStripFootings', name: 'StbStripFootings', xsdElem: 'StbStripFooting' },
  { id: 'StbPiles', name: 'StbPiles', xsdElem: 'StbPile' },
  { id: 'StbFoundationColumns', name: 'StbFoundationColumns', xsdElem: 'StbFoundationColumn' },
  { id: 'StbParapets', name: 'StbParapets', xsdElem: 'StbParapet' },
  { id: 'StbOpens', name: 'StbOpens', xsdElem: 'StbOpen' },
  { id: 'StbIsolatingDevices', name: 'StbIsolatingDevices', xsdElem: 'StbIsolatingDevice' },
  { id: 'StbDampingDevices', name: 'StbDampingDevices', xsdElem: 'StbDampingDevice' },
  { id: 'StbSecColumn_RC', name: 'StbSecColumn_RC' },
  { id: 'StbSecColumn_S', name: 'StbSecColumn_S' },
  { id: 'StbSecColumn_SRC', name: 'StbSecColumn_SRC' },
  { id: 'StbSecColumn_CFT', name: 'StbSecColumn_CFT' },
  { id: 'StbSecBeam_RC', name: 'StbSecBeam_RC' },
  { id: 'StbSecBeam_S', name: 'StbSecBeam_S' },
  { id: 'StbSecBeam_SRC', name: 'StbSecBeam_SRC' },
  { id: 'StbSecBrace_S', name: 'StbSecBrace_S' },
  { id: 'StbSecSlab_RC', name: 'StbSecSlab_RC' },
  { id: 'StbSecSlabDeck', name: 'StbSecSlabDeck' },
  { id: 'StbSecSlabPrecast', name: 'StbSecSlabPrecast' },
  { id: 'StbSecWall_RC', name: 'StbSecWall_RC' },
  { id: 'StbSecFoundation_RC', name: 'StbSecFoundation_RC' },
  { id: 'StbSecPile_RC', name: 'StbSecPile_RC' },
  { id: 'StbSecPile_S', name: 'StbSecPile_S' },
  { id: 'StbSecPileProduct', name: 'StbSecPileProduct' },
  { id: 'StbSecParapet_RC', name: 'StbSecParapet_RC' },
  { id: 'StbSecIsolatingDevice', name: 'StbSecIsolatingDevice' },
  { id: 'StbSecDampingDevice', name: 'StbSecDampingDevice' },
  { id: 'StbJoints', name: 'StbJoints' },
];

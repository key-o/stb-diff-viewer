/**
 * @fileoverview 編集影響範囲リゾルバー
 *
 * 編集された要素（節点・断面・部材）から、再比較・3D再描画が必要な
 * 部材タイプ集合をXMLドキュメントの逆引きで解決します。
 * - 節点編集 → その節点を参照する全部材のタイプ
 * - 断面編集 → その断面を使用する全部材のタイプ
 *
 * @module modelLoader/editImpactResolver
 */

import { STB_TAG_NAMES } from '../constants/elementTypes.js';

/** 部材XMLタグ名 → ビューア要素タイプ */
const MEMBER_TAG_TO_ELEMENT_TYPE = {
  [STB_TAG_NAMES.COLUMN]: 'Column',
  [STB_TAG_NAMES.POST]: 'Post',
  [STB_TAG_NAMES.GIRDER]: 'Girder',
  [STB_TAG_NAMES.BEAM]: 'Beam',
  [STB_TAG_NAMES.BRACE]: 'Brace',
  [STB_TAG_NAMES.SLAB]: 'Slab',
  [STB_TAG_NAMES.WALL]: 'Wall',
  [STB_TAG_NAMES.PARAPET]: 'Parapet',
  [STB_TAG_NAMES.JOINT]: 'Joint',
  // 開口は壁の描画に反映されるため Wall を再描画する
  [STB_TAG_NAMES.OPEN]: 'Wall',
  [STB_TAG_NAMES.PILE]: 'Pile',
  [STB_TAG_NAMES.FOOTING]: 'Footing',
  [STB_TAG_NAMES.STRIP_FOOTING]: 'StripFooting',
  [STB_TAG_NAMES.FOUNDATION_COLUMN]: 'FoundationColumn',
  [STB_TAG_NAMES.ISOLATING_DEVICE]: 'IsolatingDevice',
  [STB_TAG_NAMES.DAMPING_DEVICE]: 'DampingDevice',
  [STB_TAG_NAMES.FRAME_DAMPING_DEVICE]: 'FrameDampingDevice',
};

/** 部材が節点を参照する属性名（線状・点状要素） */
const NODE_REF_ATTRIBUTES = [
  'id_node_start',
  'id_node_end',
  'id_node_bottom',
  'id_node_top',
  'id_node',
];

/** 部材が断面を参照する属性名（StripFooting は FD/WR の2断面を持つ） */
const SECTION_REF_ATTRIBUTES = ['id_section', 'id_section_FD', 'id_section_WR'];

/**
 * 属性セレクター用にIDをエスケープする（STBのidは通常数値だが防御的に処理）
 * @param {string} id
 * @returns {string}
 */
function escapeAttributeValue(id) {
  return String(id).replace(/["\\]/g, '\\$&');
}

/**
 * 要素から祖先方向に部材タグを探し、対応するビューア要素タイプを返す
 * @param {Element} element - 起点要素
 * @returns {string|null}
 */
function findAncestorMemberType(element) {
  let current = element;
  while (current) {
    const type = MEMBER_TAG_TO_ELEMENT_TYPE[current.tagName];
    if (type) return type;
    current = current.parentElement;
  }
  return null;
}

/**
 * セレクターに一致する要素（とその祖先部材）のタイプを集合へ追加する
 * @param {Document} doc
 * @param {string} selector
 * @param {Set<string>} types
 */
function collectTypesFromQuery(doc, selector, types) {
  let matches = [];
  try {
    matches = doc.querySelectorAll(selector);
  } catch {
    return;
  }
  for (const el of matches) {
    const type = findAncestorMemberType(el);
    if (type) types.add(type);
  }
}

/**
 * EditMode の elementType が断面要素か判定する（'SecColumn_RC' 等）
 * @param {string} elementType
 * @returns {boolean}
 */
export function isSectionElementType(elementType) {
  return typeof elementType === 'string' && elementType.startsWith('Sec');
}

/**
 * 指定節点を参照する全部材のビューア要素タイプ集合を逆引きする
 * @param {Document} doc - XMLドキュメント
 * @param {string} nodeId - 節点ID
 * @returns {Set<string>} 影響を受ける要素タイプ集合（'Column' 等）
 */
export function resolveAffectedTypesForNode(doc, nodeId) {
  const types = new Set();
  if (!doc || !nodeId) return types;

  const id = escapeAttributeValue(nodeId);

  // 属性参照（柱・梁・杭・基礎等の線状/点状要素）
  const selector = NODE_REF_ATTRIBUTES.map((attr) => `[${attr}="${id}"]`).join(', ');
  collectTypesFromQuery(doc, selector, types);

  // StbNodeIdOrder（床・壁・制振フレーム等の多角形要素は子要素のテキストで節点を参照）
  const rawId = String(nodeId);
  const orderElements = doc.getElementsByTagName('StbNodeIdOrder');
  for (const orderEl of orderElements) {
    const idList = (orderEl.textContent || '').trim().split(/\s+/);
    if (!idList.includes(rawId)) continue;
    const type = findAncestorMemberType(orderEl);
    if (type) types.add(type);
  }

  return types;
}

/**
 * 指定断面を使用する全部材のビューア要素タイプ集合を逆引きする
 * @param {Document} doc - XMLドキュメント
 * @param {string} sectionId - 断面ID
 * @returns {Set<string>} 影響を受ける要素タイプ集合（'Column' 等）
 */
export function resolveAffectedTypesForSection(doc, sectionId) {
  const types = new Set();
  if (!doc || !sectionId) return types;

  const id = escapeAttributeValue(sectionId);
  const selector = SECTION_REF_ATTRIBUTES.map((attr) => `[${attr}="${id}"]`).join(', ');
  collectTypesFromQuery(doc, selector, types);

  return types;
}

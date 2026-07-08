/**
 * @fileoverview ID 参照の追従更新
 *
 * 要素の id を変更（リナンバー）した際に、その id を参照している他要素を
 * 同じドキュメント内で探索・更新するためのユーティリティ。
 *
 * 参照のカテゴリは id の持ち主のタグ名から決まる:
 * - 節点（StbNode）: 部材の id_node 系属性、StbNodeId 要素、StbNodeIdOrder のトークン列
 * - 断面（StbSec*）: 部材の id_section 系属性（id_section / id_section_FD / id_section_WR 等）
 * - その他（部材など）: コア schema では id 参照が稀なため対象外
 *
 * DOM Document のみに依存し、アプリ層（globalState・イベント）には依存しない。
 *
 * @module common-stb/edit/idReferenceUpdater
 */

/** 節点IDを参照する属性（単一ID値を保持するもの）。 */
const NODE_REF_ATTRS = ['id_node', 'id_node_bottom', 'id_node_top', 'id_node_start', 'id_node_end'];

/**
 * 空白区切りのID列をトークン配列へ分解する（空要素は除去）。
 * @param {string|null|undefined} text
 * @returns {string[]}
 */
function splitTokens(text) {
  return String(text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * id の持ち主タグ名から参照カテゴリを判定する。
 * @param {string} tagName - 例: 'StbNode', 'StbSecColumn_RC', 'StbColumn'
 * @returns {'node'|'section'|'other'}
 */
export function resolveIdReferenceCategory(tagName) {
  if (tagName === 'StbNode') return 'node';
  if (typeof tagName === 'string' && tagName.startsWith('StbSec')) return 'section';
  return 'other';
}

/**
 * 指定 id（持ち主タグ名でカテゴリ判定）への参照箇所を列挙する。ドキュメントは変更しない。
 * @param {Document} doc - 対象ドキュメント
 * @param {string} tagName - id の持ち主のタグ名
 * @param {string} id - 参照を探す対象の id
 * @returns {{category: 'node'|'section'|'other',
 *   refs: Array<{kind: 'attr', element: Element, name: string} | {kind: 'text', element: Element}>}}
 */
export function collectIdReferences(doc, tagName, id) {
  const category = resolveIdReferenceCategory(tagName);
  const old = String(id ?? '');
  const refs = [];
  if (!doc || !old) return { category, refs };

  if (category === 'node') {
    for (const el of doc.querySelectorAll('*')) {
      for (const name of NODE_REF_ATTRS) {
        if (el.getAttribute(name) === old) refs.push({ kind: 'attr', element: el, name });
      }
    }
    // StbNodeIdList > StbNodeId（階・通り芯への節点紐づけ等）
    for (const el of doc.querySelectorAll('StbNodeId')) {
      if (el.getAttribute('id') === old) refs.push({ kind: 'attr', element: el, name: 'id' });
    }
    // 面材の節点列（空白区切りテキスト）
    for (const el of doc.querySelectorAll('StbNodeIdOrder')) {
      if (splitTokens(el.textContent).includes(old)) refs.push({ kind: 'text', element: el });
    }
  } else if (category === 'section') {
    for (const el of doc.querySelectorAll('*')) {
      if (!el.attributes) continue;
      for (const attr of Array.from(el.attributes)) {
        if (attr.name.startsWith('id_section') && attr.value === old) {
          refs.push({ kind: 'attr', element: el, name: attr.name });
        }
      }
    }
  }

  return { category, refs };
}

/**
 * 指定 id への参照件数を返す（変更前の警告表示用）。
 * @param {Document} doc
 * @param {string} tagName
 * @param {string} id
 * @returns {number}
 */
export function countIdReferences(doc, tagName, id) {
  return collectIdReferences(doc, tagName, id).refs.length;
}

/**
 * collectIdReferences で得た参照箇所を oldId → newId へ書き換える。
 * @param {Array<{kind: 'attr', element: Element, name: string} | {kind: 'text', element: Element}>} refs
 * @param {string} oldId
 * @param {string} newId
 */
export function applyIdReferenceUpdate(refs, oldId, newId) {
  const old = String(oldId);
  const nw = String(newId);
  for (const ref of refs) {
    if (ref.kind === 'attr') {
      ref.element.setAttribute(ref.name, nw);
    } else if (ref.kind === 'text') {
      ref.element.textContent = splitTokens(ref.element.textContent)
        .map((token) => (token === old ? nw : token))
        .join(' ');
    }
  }
}

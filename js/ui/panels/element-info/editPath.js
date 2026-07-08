/**
 * @fileoverview 編集対象要素のパスアドレッシング
 *
 * id属性を持たないXML子要素（断面フィギュア要素等）を編集対象として
 * 特定するためのパス文字列を提供します。
 *
 * パス形式: `アンカータグ:アンカーid|子タグ@同名内インデックス|...`
 * 例: `StbSecColumn_RC:5|StbSecFigureColumn_RC@0|StbSecColumn_RC_Rect@0`
 *
 * アンカーはid属性を持つ最も近い祖先要素（断面ルートまたは部材）です。
 *
 * @module ui/panels/element-info/editPath
 */

/**
 * XML要素から編集パス文字列を構築する。
 * 要素自身がidを持つ場合はアンカーのみのパスを返す。
 * @param {Element} element - 対象のXML要素
 * @returns {string|null} 編集パス（idを持つ祖先が存在しない場合は null）
 */
export function buildElementEditPath(element) {
  if (!element || element.nodeType !== 1) return null;

  const steps = [];
  let current = element;
  while (current && current.nodeType === 1) {
    const id = typeof current.getAttribute === 'function' ? current.getAttribute('id') : null;
    if (id) {
      steps.unshift(`${current.tagName}:${id}`);
      return steps.join('|');
    }
    const parent = current.parentElement;
    if (!parent) return null;
    const sameTagSiblings = Array.from(parent.children).filter(
      (el) => el.tagName === current.tagName,
    );
    steps.unshift(`${current.tagName}@${sameTagSiblings.indexOf(current)}`);
    current = parent;
  }
  return null;
}

/**
 * 編集パス文字列からXMLドキュメント内の要素を解決する
 * @param {Document} doc - XMLドキュメント
 * @param {string} path - buildElementEditPath が生成したパス
 * @returns {Element|null} 解決された要素
 */
export function resolveElementEditPath(doc, path) {
  if (!doc || !path) return null;

  const segments = path.split('|');
  const anchorSeparator = segments[0].lastIndexOf(':');
  if (anchorSeparator < 0) return null;
  const anchorTag = segments[0].slice(0, anchorSeparator);
  const anchorId = segments[0].slice(anchorSeparator + 1);

  let current = doc.querySelector(`${anchorTag}[id="${anchorId.replace(/"/g, '\\"')}"]`);
  for (let i = 1; current && i < segments.length; i++) {
    const stepSeparator = segments[i].lastIndexOf('@');
    if (stepSeparator < 0) return null;
    const tag = segments[i].slice(0, stepSeparator);
    const index = parseInt(segments[i].slice(stepSeparator + 1), 10);
    const children = Array.from(current.children).filter((el) => el.tagName === tag);
    current = children[index] || null;
  }
  return current;
}

/**
 * 編集パスのアンカー情報（タグ名とid）を取得する
 * @param {string} path - 編集パス
 * @returns {{tagName: string, id: string}|null}
 */
export function getEditPathAnchor(path) {
  if (!path) return null;
  const firstSegment = path.split('|')[0];
  const separator = firstSegment.lastIndexOf(':');
  if (separator < 0) return null;
  return {
    tagName: firstSegment.slice(0, separator),
    id: firstSegment.slice(separator + 1),
  };
}

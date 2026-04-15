/**
 * @fileoverview ノード座標レンダリング機能
 *
 * STBノード要素の座標情報を折りたたみ可能なブロックとして
 * レンダリングする機能を提供します。
 */

import { getState } from '../../../data/state/globalState.js';

/**
 * 単一ノードの折りたたみ可能な座標ブロックを生成する
 * @param {string} nodeIdA - モデルAのノードID
 * @param {string} nodeIdB - モデルBのノードID
 * @param {Object|null} coordA - モデルAの座標 {x, y, z}
 * @param {Object|null} coordB - モデルBの座標 {x, y, z}
 * @param {boolean} showSingleColumn - 単一モデル表示かどうか
 * @param {string} elementIndentStyle - 要素行のインデントスタイル
 * @param {string} attrIndentStyle - 属性行のインデントスタイル
 * @param {string} parentRowId - 親行ID
 * @returns {string} HTML文字列
 */
export function renderStbNodeBlock(
  nodeIdA,
  nodeIdB,
  coordA,
  coordB,
  showSingleColumn,
  elementIndentStyle,
  attrIndentStyle,
  parentRowId,
) {
  const nodeId = nodeIdA || nodeIdB;
  const nodeRowId = `row_StbNode_${nodeId}_${Math.random().toString(36).slice(2, 7)}`;

  // 要素行: StbNode[@id="37"]
  let html = `<tr class="element-row" data-id="${nodeRowId}" data-parent="${parentRowId}">`;
  html += `<td style="${elementIndentStyle} white-space: nowrap;">`;
  html += `<span class="toggle-btn" data-target-id="${nodeRowId}" style="margin-right:5px;display:inline-block;width:1em;text-align:center;font-weight:var(--font-weight-bold);cursor:pointer;color:#666;">-</span>`;
  html += `<span class="tag-name">StbNode[@id="${nodeId}"]</span>`;
  html += '</td>';
  if (showSingleColumn) {
    html += '<td></td>';
  } else {
    html += '<td></td><td></td>';
  }
  html += '</tr>';

  // 属性行: x, y, z
  for (const axis of ['x', 'y', 'z']) {
    if (showSingleColumn) {
      const coord = coordA || coordB;
      const val = coord ? coord[axis].toFixed(1) : '-';
      html += `<tr data-parent="${nodeRowId}">`;
      html += `<td style="${attrIndentStyle}"><span class="attr-name">${axis}</span></td>`;
      html += `<td style="color: #555;">${val}</td>`;
      html += '</tr>';
    } else {
      const valA = coordA ? coordA[axis].toFixed(1) : '<span class="no-value">-</span>';
      const valB = coordB ? coordB[axis].toFixed(1) : '<span class="no-value">-</span>';
      const differs = coordA && coordB && coordA[axis] !== coordB[axis];
      const highlightClass = differs ? ' class="differs"' : '';
      html += `<tr data-parent="${nodeRowId}">`;
      html += `<td style="${attrIndentStyle}"><span class="attr-name">${axis}</span></td>`;
      html += `<td${highlightClass} style="color: #555;">${valA}</td>`;
      html += `<td${highlightClass} style="color: #555;">${valB}</td>`;
      html += '</tr>';
    }
  }
  return html;
}

/**
 * id_node属性の後にノード座標ブロックを生成する
 * @param {string} attrName - 属性名（id_node_start, id_node_end など）
 * @param {string|undefined} valueA - モデルAのノードID
 * @param {string|undefined} valueB - モデルBのノードID
 * @param {boolean} showSingleColumn - 単一モデル表示かどうか
 * @param {string} attrIndentStyle - インデントスタイル
 * @param {string} rowId - 親行ID
 * @returns {string} 座標行のHTML（該当しない場合は空文字列）
 */
export function renderNodeCoordinateRows(
  attrName,
  valueA,
  valueB,
  showSingleColumn,
  attrIndentStyle,
  rowId,
) {
  if (!attrName.startsWith('id_node')) return '';

  const nodeMapA = getState('models.nodeMapA');
  const nodeMapB = getState('models.nodeMapB');
  if (!nodeMapA && !nodeMapB) return '';

  const coordA = valueA ? nodeMapA?.get(valueA) : null;
  const coordB = valueB ? nodeMapB?.get(valueB) : null;
  if (!coordA && !coordB) return '';

  // 要素行のインデント = 属性と同じ深さ
  const elementIndentStyle = attrIndentStyle;
  // 属性行のインデント = さらに深く
  const childAttrIndentStyle = attrIndentStyle.replace(
    /padding-left:\s*([\d.]+)em/,
    (_, val) => `padding-left: ${parseFloat(val) + 1.5}em`,
  );

  return renderStbNodeBlock(
    valueA,
    valueB,
    coordA,
    coordB,
    showSingleColumn,
    elementIndentStyle,
    childAttrIndentStyle,
    rowId,
  );
}

/**
 * StbNodeIdOrder等のテキストコンテンツに含まれるノードIDリストの座標ブロックを生成する
 * @param {string} tagName - 要素タグ名
 * @param {string|null} textA - モデルAのテキストコンテンツ
 * @param {string|null} textB - モデルBのテキストコンテンツ
 * @param {boolean} showSingleColumn - 単一モデル表示かどうか
 * @param {string} attrIndentStyle - インデントスタイル
 * @param {string} rowId - 親行ID
 * @returns {string} 座標行のHTML
 */
export function renderNodeIdListCoordinateRows(
  tagName,
  textA,
  textB,
  showSingleColumn,
  attrIndentStyle,
  rowId,
) {
  if (!tagName || !tagName.includes('NodeId')) return '';

  const nodeMapA = getState('models.nodeMapA');
  const nodeMapB = getState('models.nodeMapB');
  if (!nodeMapA && !nodeMapB) return '';

  const idsA = textA ? textA.split(/\s+/).filter(Boolean) : [];
  const idsB = textB ? textB.split(/\s+/).filter(Boolean) : [];
  if (idsA.length === 0 && idsB.length === 0) return '';

  const elementIndentStyle = attrIndentStyle;
  const childAttrIndentStyle = attrIndentStyle.replace(
    /padding-left:\s*([\d.]+)em/,
    (_, val) => `padding-left: ${parseFloat(val) + 1.5}em`,
  );

  let html = '';
  const maxLen = Math.max(idsA.length, idsB.length);

  for (let i = 0; i < maxLen; i++) {
    const idA = idsA[i];
    const idB = idsB[i];
    const coordA = idA ? nodeMapA?.get(idA) : null;
    const coordB = idB ? nodeMapB?.get(idB) : null;
    if (!coordA && !coordB) continue;

    html += renderStbNodeBlock(
      idA,
      idB,
      coordA,
      coordB,
      showSingleColumn,
      elementIndentStyle,
      childAttrIndentStyle,
      rowId,
    );
  }
  return html;
}

/**
 * @fileoverview 比較レンダリング機能
 *
 * モデルA/B間の要素比較テーブルをレンダリングする機能を提供します。
 * 属性、子要素、テキストコンテンツの再帰的比較表示を担当します。
 */

import {
  isSchemaLoaded,
  getAllAttributeNames,
  getAttributeInfo,
} from '../../../common-stb/parser/xsdSchemaParser.js';
import { getValidationStyles } from '../../../common-stb/validation/validationManager.js';
import { getImportanceCircleHtml } from './ImportanceColors.js';
import {
  findSectionNode,
  extractSectionData,
  generateEquivalenceSection,
  getAttributesMap,
} from './SectionHelpers.js';
import { evaluateSectionEquivalence } from './ElementInfoProviders.js';
import { isEditMode, getCurrentEditingElement } from './EditMode.js';
import { getState } from '../../../app/globalState.js';

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
function renderStbNodeBlock(
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
function renderNodeCoordinateRows(
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
function renderNodeIdListCoordinateRows(
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

/**
 * XMLドキュメントのStbSecSteelからshape名で鉄骨断面要素を検索する
 * @param {Document|null} doc - XMLドキュメント
 * @param {string} shapeName - 断面形状名
 * @returns {{element: Element, tagName: string}|null} 見つかった要素とタグ名
 */
function findSteelSectionElement(doc, shapeName) {
  if (!doc || !shapeName) return null;
  const steel = doc.querySelector('StbSecSteel');
  if (!steel) return null;

  const tags = [
    'StbSecRoll-H',
    'StbSecRoll-BOX',
    'StbSecRoll-L',
    'StbSecRoll-T',
    'StbSecRoll-C',
    'StbSecRoll-Pipe',
    'StbSecRoll-Bar',
    'StbSecRoll-FlatBar',
    'StbSecBuild-H',
    'StbSecBuild-BOX',
  ];
  for (const tag of tags) {
    const el = steel.querySelector(`${tag}[name="${shapeName}"]`);
    if (el) return { element: el, tagName: tag };
  }
  return null;
}

/**
 * 鉄骨断面要素の折りたたみ可能なブロックを生成する
 * @param {string} shapeA - モデルAのshape名
 * @param {string} shapeB - モデルBのshape名
 * @param {boolean} showSingleColumn - 単一モデル表示かどうか
 * @param {string} elementIndentStyle - 要素行のインデントスタイル
 * @param {string} attrIndentStyle - 属性行のインデントスタイル
 * @param {string} parentRowId - 親行ID
 * @returns {string} HTML文字列
 */
function renderSteelSectionBlock(
  shapeA,
  shapeB,
  showSingleColumn,
  elementIndentStyle,
  attrIndentStyle,
  parentRowId,
) {
  const resultA = shapeA ? findSteelSectionElement(window.docA || window.docB, shapeA) : null;
  const resultB = shapeB ? findSteelSectionElement(window.docB || window.docA, shapeB) : null;
  if (!resultA && !resultB) return '';

  const shape = shapeA || shapeB;
  const tagName = resultA?.tagName || resultB?.tagName;
  const blockRowId = `row_steel_${shape}_${Math.random().toString(36).slice(2, 7)}`;

  // 要素行: StbSecRoll-H[@name="H-700x300x13x24x18"]
  let html = `<tr class="element-row" data-id="${blockRowId}" data-parent="${parentRowId}">`;
  html += `<td style="${elementIndentStyle} white-space: nowrap;">`;
  html += `<span class="toggle-btn" data-target-id="${blockRowId}" style="margin-right:5px;display:inline-block;width:1em;text-align:center;font-weight:var(--font-weight-bold);cursor:pointer;color:#666;">-</span>`;
  html += `<span class="tag-name">${tagName}[@name="${shape}"]</span>`;
  html += '</td>';
  if (showSingleColumn) {
    html += '<td></td>';
  } else {
    html += '<td></td><td></td>';
  }
  html += '</tr>';

  // 属性行: 全属性を列挙（name以外）
  const attrsA = resultA ? getAttributesMap(resultA.element) : new Map();
  const attrsB = resultB ? getAttributesMap(resultB.element) : new Map();
  const allAttrs = new Set([...attrsA.keys(), ...attrsB.keys()]);

  for (const attr of allAttrs) {
    if (attr === 'name') continue;
    const valA = attrsA.get(attr);
    const valB = attrsB.get(attr);

    if (showSingleColumn) {
      const val = valA ?? valB ?? '-';
      html += `<tr data-parent="${blockRowId}">`;
      html += `<td style="${attrIndentStyle}"><span class="attr-name">${attr}</span></td>`;
      html += `<td style="color: #555;">${val}</td>`;
      html += '</tr>';
    } else {
      const displayA = valA ?? '<span class="no-value">-</span>';
      const displayB = valB ?? '<span class="no-value">-</span>';
      const differs = valA != null && valB != null && valA !== valB;
      const highlightClass = differs ? ' class="differs"' : '';
      html += `<tr data-parent="${blockRowId}">`;
      html += `<td style="${attrIndentStyle}"><span class="attr-name">${attr}</span></td>`;
      html += `<td${highlightClass} style="color: #555;">${displayA}</td>`;
      html += `<td${highlightClass} style="color: #555;">${displayB}</td>`;
      html += '</tr>';
    }
  }
  return html;
}

/**
 * XMLドキュメントからStbOpen要素（v2.0.2）またはStbOpenArrangement要素（v2.1.0）を検索する
 * @param {Document|null} doc - XMLドキュメント
 * @param {string} openingId - 開口ID
 * @returns {Element|null} 見つかった開口XML要素
 */
function findOpeningXmlElement(doc, openingId) {
  if (!doc || !openingId) return null;
  // v2.0.2: StbOpen[@id="..."]
  const stbOpen = doc.querySelector(`StbOpen[id="${openingId}"]`);
  if (stbOpen) return stbOpen;
  // v2.1.0: StbOpenArrangement[@id="..."]
  return doc.querySelector(`StbOpenArrangement[id="${openingId}"]`);
}

/**
 * 開口のセクション情報（StbSecOpen_RC）から寸法を取得する
 * @param {Document|null} doc - XMLドキュメント
 * @param {string} idSection - セクションID
 * @returns {{length_X: string, length_Y: string}|null} 寸法情報
 */
function findOpeningSectionDimensions(doc, idSection) {
  if (!doc || !idSection) return null;
  const secEl = doc.querySelector(`StbSecOpen_RC[id="${idSection}"]`);
  if (!secEl) return null;
  const lx = secEl.getAttribute('length_X');
  const ly = secEl.getAttribute('length_Y');
  if (!lx && !ly) return null;
  return { length_X: lx, length_Y: ly };
}

/**
 * StbOpenId要素の後に開口プロパティ（位置・サイズ・回転）を折りたたみブロックで表示する
 * @param {string|undefined} openIdA - モデルAの開口ID
 * @param {string|undefined} openIdB - モデルBの開口ID
 * @param {boolean} showSingleColumn - 単一モデル表示かどうか
 * @param {string} elementIndentStyle - 要素行のインデントスタイル
 * @param {string} attrIndentStyle - 属性行のインデントスタイル
 * @param {string} parentRowId - 親行ID
 * @returns {string} HTML文字列
 */
function renderOpeningPropertiesBlock(
  openIdA,
  openIdB,
  showSingleColumn,
  elementIndentStyle,
  attrIndentStyle,
  parentRowId,
) {
  const openElA = openIdA ? findOpeningXmlElement(window.docA, openIdA) : null;
  const openElB = openIdB ? findOpeningXmlElement(window.docB, openIdB) : null;
  if (!openElA && !openElB) return '';

  const openId = openIdA || openIdB;
  const tagName = openElA?.tagName || openElB?.tagName;
  const blockRowId = `row_open_${openId}_${Math.random().toString(36).slice(2, 7)}`;

  // 要素行: StbOpen[@id="101"]
  let html = `<tr class="element-row" data-id="${blockRowId}" data-parent="${parentRowId}">`;
  html += `<td style="${elementIndentStyle} white-space: nowrap;">`;
  html += `<span class="toggle-btn" data-target-id="${blockRowId}" style="margin-right:5px;display:inline-block;width:1em;text-align:center;font-weight:var(--font-weight-bold);cursor:pointer;color:#666;">-</span>`;
  html += `<span class="tag-name">${tagName}[@id="${openId}"]</span>`;
  html += '</td>';
  if (showSingleColumn) {
    html += '<td></td>';
  } else {
    html += '<td></td><td></td>';
  }
  html += '</tr>';

  // 属性行: 開口プロパティを列挙（id以外）
  const attrsA = openElA ? getAttributesMap(openElA) : new Map();
  const attrsB = openElB ? getAttributesMap(openElB) : new Map();

  // v2.1.0の場合、StbSecOpen_RCからlength_X/length_Yを補完
  const idSectionA = attrsA.get('id_section');
  const idSectionB = attrsB.get('id_section');
  if (idSectionA && !attrsA.has('length_X')) {
    const dims = findOpeningSectionDimensions(window.docA, idSectionA);
    if (dims) {
      if (dims.length_X) attrsA.set('length_X', dims.length_X);
      if (dims.length_Y) attrsA.set('length_Y', dims.length_Y);
    }
  }
  if (idSectionB && !attrsB.has('length_X')) {
    const dims = findOpeningSectionDimensions(window.docB, idSectionB);
    if (dims) {
      if (dims.length_X) attrsB.set('length_X', dims.length_X);
      if (dims.length_Y) attrsB.set('length_Y', dims.length_Y);
    }
  }

  const allAttrs = new Set([...attrsA.keys(), ...attrsB.keys()]);

  // 表示順を制御：重要な属性を先に
  const priorityOrder = [
    'name',
    'position_X',
    'position_Y',
    'length_X',
    'length_Y',
    'rotate',
    'id_section',
    'kind_member',
    'id_member',
    'guid',
  ];
  const sortedAttrs = Array.from(allAttrs)
    .filter((a) => a !== 'id')
    .sort((a, b) => {
      const idxA = priorityOrder.indexOf(a);
      const idxB = priorityOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

  for (const attr of sortedAttrs) {
    const valA = attrsA.get(attr);
    const valB = attrsB.get(attr);

    if (showSingleColumn) {
      const val = valA ?? valB ?? '-';
      html += `<tr data-parent="${blockRowId}">`;
      html += `<td style="${attrIndentStyle}"><span class="attr-name">${attr}</span></td>`;
      html += `<td style="color: #555;">${val}</td>`;
      html += '</tr>';
    } else {
      const displayA = valA ?? '<span class="no-value">-</span>';
      const displayB = valB ?? '<span class="no-value">-</span>';
      const differs = valA != null && valB != null && valA !== valB;
      const highlightClass = differs ? ' class="differs"' : '';
      html += `<tr data-parent="${blockRowId}">`;
      html += `<td style="${attrIndentStyle}"><span class="attr-name">${attr}</span></td>`;
      html += `<td${highlightClass} style="color: #555;">${displayA}</td>`;
      html += `<td${highlightClass} style="color: #555;">${displayB}</td>`;
      html += '</tr>';
    }
  }
  return html;
}

/**
 * 壁要素に関連する開口情報セクションを生成する（v2.1.0: StbOpenArrangement経由）
 * @param {Element|null} nodeA - モデルAの壁要素ノード
 * @param {Element|null} nodeB - モデルBの壁要素ノード
 * @param {boolean} showSingleColumn - 単一モデル表示かどうか
 * @returns {string} 開口情報セクションのHTML
 */
export function renderOpeningInfo(nodeA, nodeB, showSingleColumn) {
  const wallIdA = nodeA?.getAttribute('id');
  const wallIdB = nodeB?.getAttribute('id');

  // v2.0.2の場合はStbOpenIdListが子要素として既に表示されているのでスキップ
  const hasOpenIdListA = nodeA?.querySelector('StbOpenIdList');
  const hasOpenIdListB = nodeB?.querySelector('StbOpenIdList');
  if (hasOpenIdListA || hasOpenIdListB) return '';

  // v2.1.0: StbOpenArrangement[@id_member="wallId"][@kind_member="WALL"] を検索
  const openingsA = wallIdA
    ? Array.from(
        window.docA?.querySelectorAll(
          `StbOpenArrangement[id_member="${wallIdA}"][kind_member="WALL"]`,
        ) || [],
      )
    : [];
  const openingsB = wallIdB
    ? Array.from(
        window.docB?.querySelectorAll(
          `StbOpenArrangement[id_member="${wallIdB}"][kind_member="WALL"]`,
        ) || [],
      )
    : [];

  if (openingsA.length === 0 && openingsB.length === 0) return '';

  // 開口IDでマッチング
  const openMapA = new Map();
  const openMapB = new Map();
  for (const el of openingsA) openMapA.set(el.getAttribute('id'), el);
  for (const el of openingsB) openMapB.set(el.getAttribute('id'), el);
  const allOpenIds = new Set([...openMapA.keys(), ...openMapB.keys()]);

  // セクションヘッダー
  let content = '';
  if (showSingleColumn) {
    content += `<tr class="section-header-row"><td colspan="2">▼ 開口情報 (${allOpenIds.size}個)</td></tr>`;
  } else {
    content += `<tr class="section-header-row"><td colspan="3">▼ 開口情報 (A: ${openingsA.length}個, B: ${openingsB.length}個)</td></tr>`;
  }

  // 各開口を比較表示
  for (const openId of allOpenIds) {
    const elA = openMapA.get(openId) || null;
    const elB = openMapB.get(openId) || null;
    content += renderComparisonRecursive(elA, elB, 0, 'opening', showSingleColumn, null, null);

    // StbSecOpen_RCの寸法補完行を追加
    const idSectionA = elA?.getAttribute('id_section');
    const idSectionB = elB?.getAttribute('id_section');
    const dimsA = findOpeningSectionDimensions(window.docA, idSectionA);
    const dimsB = findOpeningSectionDimensions(window.docB, idSectionB);
    if (dimsA || dimsB) {
      const secRowId = `row_sec_open_${openId}_${Math.random().toString(36).slice(2, 7)}`;
      const indentStyle = 'padding-left: 1.5em;';
      const attrIndentStyle = 'padding-left: 3em;';

      content += `<tr class="element-row" data-id="${secRowId}" data-parent="opening">`;
      content += `<td style="${indentStyle} white-space: nowrap;">`;
      content += `<span class="toggle-btn" data-target-id="${secRowId}" style="margin-right:5px;display:inline-block;width:1em;text-align:center;font-weight:var(--font-weight-bold);cursor:pointer;color:#666;">-</span>`;
      content += '<span class="tag-name">StbSecOpen_RC (寸法)</span>';
      content += '</td>';
      if (showSingleColumn) {
        content += '<td></td>';
      } else {
        content += '<td></td><td></td>';
      }
      content += '</tr>';

      for (const dimAttr of ['length_X', 'length_Y']) {
        const valA = dimsA?.[dimAttr];
        const valB = dimsB?.[dimAttr];
        if (showSingleColumn) {
          const val = valA ?? valB ?? '-';
          content += `<tr data-parent="${secRowId}">`;
          content += `<td style="${attrIndentStyle}"><span class="attr-name">${dimAttr}</span></td>`;
          content += `<td style="color: #555;">${val}</td>`;
          content += '</tr>';
        } else {
          const displayA = valA ?? '<span class="no-value">-</span>';
          const displayB = valB ?? '<span class="no-value">-</span>';
          const differs = valA != null && valB != null && valA !== valB;
          const highlightClass = differs ? ' class="differs"' : '';
          content += `<tr data-parent="${secRowId}">`;
          content += `<td style="${attrIndentStyle}"><span class="attr-name">${dimAttr}</span></td>`;
          content += `<td${highlightClass} style="color: #555;">${displayA}</td>`;
          content += `<td${highlightClass} style="color: #555;">${displayB}</td>`;
          content += '</tr>';
        }
      }
    }
  }

  return content;
}

/**
 * pos属性でマッチングすべき要素タイプのリスト
 * これらの要素は子要素比較時にpos属性値で対応付けを行う
 */
const POS_MATCHING_ELEMENT_TYPES = new Set([
  // 柱配筋
  'StbSecBarColumnRectComplexMain',
  'StbSecBarColumnRectNotSameSimple',
  'StbSecBarColumnRectNotSameComplex',
  'StbSecBarColumnCircleNotSameSimple',
  'StbSecBarColumnCircleNotSameComplex',
  // 柱鉄骨
  'StbSecSteelColumn_S_NotSame',
  'StbSecSteelColumn_S_ThreeTypes',
  'StbSecSteelColumn_SRC_NotSame',
  'StbSecSteelColumn_SRC_ThreeTypes',
  'StbSecSteelColumn_CFT_NotSame',
  'StbSecSteelColumn_CFT_ThreeTypes',
  // 梁配筋
  'StbSecBarBeamSimpleMain',
  'StbSecBarBeamComplexMain',
  'StbSecBarBeam_RC_ThreeTypes',
  'StbSecBarBeam_RC_StartEnd',
  // 梁鉄骨
  'StbSecSteelBeamWidening',
  'StbSecSteelBeam_S_Taper',
  'StbSecSteelBeam_S_Joint',
  'StbSecSteelBeam_S_Haunch',
  'StbSecSteelBeam_S_FiveTypes',
  // ブレース鉄骨
  'StbSecSteelBrace_S_NotSame',
  'StbSecSteelBrace_S_ThreeTypes',
  // スラブ配筋
  'StbSecBarSlab_RC_ConventionalStandard',
  'StbSecBarSlab_RC_Conventional2Way',
  'StbSecBarSlab_RC_Conventional1Way1',
  'StbSecBarSlab_RC_Conventional1Way2',
  'StbSecBarSlab_RC_Open',
  'StbSecBarSlab_RC_Truss1Way',
  // 壁配筋
  'StbSecBarWall_RC_Single',
  'StbSecBarWall_RC_Zigzag',
  'StbSecBarWall_RC_DoubleNet',
  'StbSecBarWall_RC_InsideAndOutside',
  'StbSecBarWall_RC_Edge',
  'StbSecBarWall_RC_Open',
  // 基礎配筋
  'StbSecBarFoundation_RC_Rect',
  'StbSecBarFoundation_RC_Triangle',
  'StbSecBarFoundation_RC_ThreeWay',
  'StbSecBarFoundation_RC_Continuous',
  // 杭配筋
  'StbSecBarPile_RC_TopBottom',
  'StbSecBarPile_RC_TopCenterBottom',
  // パラペット配筋
  'StbSecBarParapet_RC_Single',
  'StbSecBarParapet_RC_Zigzag',
  'StbSecBarParapet_RC_DoubleNet',
  'StbSecBarParapet_RC_Tip',
  'StbSecBarParapet_RC_Edge',
  // 開口補強筋
  'StbSecBarOpen_RC_Slab',
  'StbSecBarOpen_RC_Wall',
  // 免震装置
  'StbSecIsolatingDeviceESB',
  'StbSecIsolatingDeviceRSB',
]);

/**
 * 統合比較テーブルのCSSスタイルを生成
 * @param {boolean} showSingleColumn - 単一モデル表示かどうか
 * @returns {string} CSSスタイル文字列
 */
export function generateTableStyles(showSingleColumn) {
  return `
    /* --- 統合比較テーブル --- */
    .unified-comparison-table {
        width: 100%; border-collapse: collapse; margin-bottom: 1em; font-size: var(--font-size-sm);
        table-layout: fixed;
    }
    .unified-comparison-table th, .unified-comparison-table td {
        border: 1px solid #e0e0e0; padding: 3px 5px; text-align: left; vertical-align: top;
        word-wrap: break-word;
    }
    .unified-comparison-table th { background-color: #f8f8f8; font-weight: bold; }

    /* 要素名の行 */
    .unified-comparison-table tr.element-row > td:first-child {
         background-color: #f0f8ff; /* 要素行の背景色 */
         white-space: nowrap;
         overflow: hidden;
         text-overflow: ellipsis;
         font-weight: bold; /* 要素名を太字に */
    }
    /* 属性名/ラベルの行 */
    .unified-comparison-table tr:not(.element-row) > td:first-child {
         color: #666; /* 属性名/ラベルの色 */
         white-space: nowrap;
    }
    /* 差分ハイライト */
    .unified-comparison-table td.differs {
        background-color: #fff3cd;
        font-weight: bold;
    }
    /* 断面情報ヘッダー行 */
    .unified-comparison-table tr.section-header-row > td {
        background-color: #e9ecef;
        font-weight: bold;
        text-align: center;
        padding: 5px;
        border-top: 2px solid #ccc; /* 上に区切り線 */
        margin-top: 5px; /* 少し間隔を空ける */
    }

    /* テキスト要素のスタイル */
    .unified-comparison-table .tag-name { /* .tag-name は要素名セル内で使用 */ }
    .unified-comparison-table .attr-name { /* .attr-name は属性名セル内で使用 */ }
    .unified-comparison-table .attr-value { color: #007acc; }
    .unified-comparison-table .text-label { font-style: italic; color: #555; }
    .unified-comparison-table .text-content {
        font-style: italic; color: #555;
        white-space: pre-wrap;
        word-break: break-all;
    }
    /* 値がない場合のスタイル */
    .unified-comparison-table .no-value {
         color: #999;
         font-style: italic;
    }

    /* 単一モデル表示時のパネル幅調整 */
    ${
      showSingleColumn
        ? `
    .unified-comparison-table th:first-child,
    .unified-comparison-table td:first-child {
        width: 50% !important;
    }
    .unified-comparison-table th:last-child,
    .unified-comparison-table td:last-child {
        width: 50% !important;
    }
    `
        : `
    /* 比較モード時は3カラムのままでCSSによる幅制御は最小限に */
    `
    }

    /* バリデーション情報スタイル */
    ${getValidationStyles()}
  `;
}

/**
 * 断面情報セクションのHTMLを生成
 * @param {Element|null} nodeA - モデルAの要素ノード
 * @param {Element|null} nodeB - モデルBの要素ノード
 * @param {boolean} showSingleColumn - 単一モデル表示かどうか
 * @param {string|null} modelSource - モデルソース
 * @param {string|null} elementType - 要素タイプ
 * @returns {string} セクション情報のHTML
 */
export function renderSectionInfo(nodeA, nodeB, showSingleColumn, modelSource, elementType) {
  const sectionIdA = nodeA?.getAttribute('id_section');
  const sectionIdB = nodeB?.getAttribute('id_section');
  const hasSectionInfo = sectionIdA || sectionIdB;

  if (!hasSectionInfo) {
    return '';
  }

  let content = '';

  const sectionNodeA = sectionIdA ? findSectionNode(window.docA, sectionIdA) : null;
  const sectionNodeB = sectionIdB ? findSectionNode(window.docB, sectionIdB) : null;

  // 断面等価性評価の実行（比較モードの場合のみ）
  let equivalenceResult = null;
  if (!showSingleColumn && sectionNodeA && sectionNodeB && modelSource === 'matched') {
    const sectionDataA = extractSectionData(sectionNodeA);
    const sectionDataB = extractSectionData(sectionNodeB);

    if (sectionDataA && sectionDataB) {
      equivalenceResult = evaluateSectionEquivalence(sectionDataA, sectionDataB, elementType);
    }
  }

  // 断面情報セクションのヘッダー行を追加
  if (showSingleColumn) {
    const sectionId = sectionIdA || sectionIdB;
    content += `<tr class="section-header-row"><td colspan="2">▼ 断面情報 (ID: ${sectionId})</td></tr>`;
  } else {
    content += `<tr class="section-header-row"><td colspan="3">▼ 断面情報 (A: ${
      sectionIdA ?? 'なし'
    }, B: ${sectionIdB ?? 'なし'})</td></tr>`;
  }

  // 断面等価性評価結果を表示（比較モードの場合）
  if (equivalenceResult && !showSingleColumn) {
    content += generateEquivalenceSection(equivalenceResult);
  }

  // 断面要素の比較表示 (ルート要素と同じレベルで表示)
  content += renderComparisonRecursive(
    sectionNodeA,
    sectionNodeB,
    0,
    'section',
    showSingleColumn,
    modelSource,
    elementType,
  );

  return content;
}

/**
 * 子要素がpos属性でマッチングすべきかどうかを判定する
 * @param {Array<Element>} childrenA - モデルAの子要素
 * @param {Array<Element>} childrenB - モデルBの子要素
 * @returns {boolean} pos属性マッチングが必要かどうか
 */
function shouldUsePosMatching(childrenA, childrenB) {
  const allChildren = [...childrenA, ...childrenB];
  if (allChildren.length === 0) return false;

  // 最初の子要素のタグ名を確認
  const firstChild = allChildren[0];
  const tagName = firstChild?.tagName;

  if (!tagName || !POS_MATCHING_ELEMENT_TYPES.has(tagName)) {
    return false;
  }

  // 実際にpos属性を持っているか確認
  return allChildren.some((child) => child.getAttribute?.('pos'));
}

/**
 * pos属性でマッチングした子要素ペアを生成する
 * @param {Array<Element>} childrenA - モデルAの子要素
 * @param {Array<Element>} childrenB - モデルBの子要素
 * @returns {Array<{childA: Element|null, childB: Element|null}>} マッチングされたペアの配列
 */
function matchChildrenByPos(childrenA, childrenB) {
  const posMapA = new Map();
  const posMapB = new Map();

  for (const child of childrenA) {
    const pos = child.getAttribute?.('pos');
    if (pos) posMapA.set(pos, child);
  }
  for (const child of childrenB) {
    const pos = child.getAttribute?.('pos');
    if (pos) posMapB.set(pos, child);
  }

  // 全てのユニークなpos値を収集
  const allPosValues = new Set([...posMapA.keys(), ...posMapB.keys()]);

  // pos値でソートしてペアを生成（表示順の一貫性のため）
  const sortedPosValues = Array.from(allPosValues).sort();

  return sortedPosValues.map((pos) => ({
    childA: posMapA.get(pos) ?? null,
    childB: posMapB.get(pos) ?? null,
  }));
}

/**
 * XML要素とその子孫を再帰的に比較処理し、3列比較テーブルまたは2列単一モデルテーブルの行HTMLを生成する。
 * @param {Element | null} nodeA - モデルAの要素。
 * @param {Element | null} nodeB - モデルBの要素。
 * @param {number} level - 現在の階層レベル (インデント用)。
 * @param {string} parentId - 親要素のID (折りたたみ制御用)。
 * @param {boolean} showSingleColumn - 単一モデル表示かどうか。
 * @param {string | null} modelSource - 要素のモデルソース ('A', 'B', 'matched', またはnull)
 * @param {string | null} elementType - 要素タイプ (色付け用)
 * @returns {string} テーブル行(<tr>...</tr>)のHTML文字列。子孫要素の行も含む。
 */
export function renderComparisonRecursive(
  nodeA,
  nodeB,
  level,
  parentId,
  showSingleColumn = false,
  modelSource = null,
  elementType = null,
) {
  if (!nodeA && !nodeB) return ''; // 両方なければ何も表示しない

  let rowsHtml = '';
  const indentStyle = `padding-left: ${level * 1.5}em;`;
  const attrIndentStyle = `padding-left: ${(level + 1.5) * 1.5}em;`;

  // --- 一意なID生成 ---
  const tagNameA = nodeA?.tagName;
  const tagNameB = nodeB?.tagName;
  const displayTagName = tagNameA ?? tagNameB;
  const idA = nodeA?.getAttribute?.('id') ?? '';
  const idB = nodeB?.getAttribute?.('id') ?? '';
  const rowId = `row_${displayTagName}_${idA}_${idB}_${level}_${Math.random()
    .toString(36)
    .slice(2, 7)}`;

  // --- 要素タイプの判定 ---
  // パラメータから渡されたelementTypeを優先し、なければタグ名から推定
  let currentElementType = elementType;
  if (!currentElementType && displayTagName) {
    // STBタグ名から要素タイプを抽出 (例: StbColumn -> Column, StbNode -> Node)
    if (displayTagName.startsWith('Stb')) {
      currentElementType = displayTagName.slice(3); // "Stb"を除去
      if (currentElementType === 'Node') {
        currentElementType = 'Node'; // 特別な場合
      }
    }
  }

  // --- 要素名行 ---
  rowsHtml += `<tr class="element-row" data-id="${rowId}"${
    parentId ? ` data-parent="${parentId}"` : ''
  }>`;
  let elementCell = `<td style="${indentStyle} white-space: nowrap;">`;
  elementCell += `<span class="toggle-btn" data-target-id="${rowId}" style="margin-right:5px;display:inline-block;width:1em;text-align:center;font-weight:var(--font-weight-bold);cursor:pointer;color:#666;">-</span>`;
  elementCell += `<span class="tag-name">${displayTagName}</span>`;
  if (tagNameA && tagNameB && tagNameA !== tagNameB) {
    elementCell += ` <span style="color: red; font-size: var(--font-size-sm);">(A: ${tagNameA}, B: ${tagNameB})</span>`;
  }
  elementCell += '</td>';
  rowsHtml += elementCell;

  if (showSingleColumn) {
    rowsHtml += '<td></td>';
  } else {
    rowsHtml += '<td></td><td></td>';
  }
  rowsHtml += '</tr>';

  // --- 属性行（XSDスキーマ対応版） ---
  const attrsA = nodeA ? getAttributesMap(nodeA) : new Map();
  const attrsB = nodeB ? getAttributesMap(nodeB) : new Map();

  // XSDスキーマから完全な属性リストを取得
  const allAttrNames = new Set([...attrsA.keys(), ...attrsB.keys()]);

  // XSDスキーマが利用可能な場合、スキーマ定義の属性も追加
  if (isSchemaLoaded() && displayTagName) {
    const schemaAttributes = getAllAttributeNames(displayTagName);
    schemaAttributes.forEach((attr) => allAttrNames.add(attr));
  }

  const attrRowDisplay = '';
  const editMode = isEditMode();
  const currentEditingElement = getCurrentEditingElement();

  if (allAttrNames.size > 0) {
    const sortedAttrNames = Array.from(allAttrNames).sort((a, b) => {
      const prioritized = ['id', 'guid', 'name'];
      const idxA = prioritized.indexOf(a);
      const idxB = prioritized.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    for (const attrName of sortedAttrNames) {
      const valueA = attrsA.get(attrName);
      const valueB = attrsB.get(attrName);

      // XSDスキーマから属性情報を取得
      const attrInfo = isSchemaLoaded() ? getAttributeInfo(displayTagName, attrName) : null;
      const isRequired = attrInfo?.required || false;
      const hasDefault = attrInfo?.default || attrInfo?.fixed;
      const documentation = attrInfo?.documentation;

      // 重要度インジケータ（属性名セルに丸で表示）
      const importanceCircle = getImportanceCircleHtml(currentElementType, attrName);

      // 属性ラベルの構築（XSD赤丸 + 重要度丸 + 属性名 + デフォルト値）
      let attrLabel = '';
      if (attrInfo && isRequired)
        attrLabel +=
          '<span style="color:red;font-size:var(--font-size-md);" title="XSD必須パラメータ">&#9679;</span> ';
      attrLabel += importanceCircle;
      attrLabel += attrName;
      if (attrInfo && hasDefault)
        attrLabel += ` <span style="color:blue;font-size:var(--font-size-sm);" title="デフォルト値: ${hasDefault}">(${hasDefault})</span>`;

      const titleAttr = documentation ? ` title="${documentation}"` : '';

      if (showSingleColumn) {
        // 単一モデル表示の場合
        const singleValue = valueA ?? valueB;
        let displayValue = singleValue ?? '<span class="no-value">-</span>';

        // 編集モードの場合、編集ボタンを追加
        if (editMode && currentEditingElement) {
          const { elementType: currentEditType } = currentEditingElement;
          const currentId = valueA ? idA : idB;
          displayValue += ` <button class="edit-btn" style="font-size: var(--font-size-2xs); padding: 1px 2px; background: none; border: none; opacity: 0.5; cursor: pointer;" onclick="window.editAttribute('${currentEditType}', '${currentId}', '${attrName}', '${
            singleValue || ''
          }')" title="編集">✏️</button>`;
        }

        rowsHtml += `<tr data-parent="${rowId}"${attrRowDisplay}>`;
        rowsHtml += `<td style="${attrIndentStyle}"${titleAttr}><span class="attr-name">${attrLabel}</span></td>`;
        rowsHtml += `<td>${displayValue}</td>`;
        rowsHtml += '</tr>';
      } else {
        // 比較表示の場合
        let displayValueA = valueA ?? '<span class="no-value">-</span>';
        let displayValueB = valueB ?? '<span class="no-value">-</span>';

        // 編集モードの場合、編集ボタンを追加
        if (editMode && currentEditingElement) {
          const { elementType: currentEditType } = currentEditingElement;
          if (valueA !== undefined && idA) {
            displayValueA += ` <button class="edit-btn" style="font-size: var(--font-size-2xs); padding: 1px 2px; background: none; border: none; opacity: 0.5; cursor: pointer;" onclick="window.editAttribute('${currentEditType}', '${idA}', '${attrName}', '${
              valueA || ''
            }')" title="編集">✏️</button>`;
          }
          if (valueB !== undefined && idB) {
            displayValueB += ` <button class="edit-btn" style="font-size: var(--font-size-2xs); padding: 1px 2px; background: none; border: none; opacity: 0.5; cursor: pointer;" onclick="window.editAttribute('${currentEditType}', '${idB}', '${attrName}', '${
              valueB || ''
            }')" title="編集">✏️</button>`;
          }
        }

        // 比較結果: 値が異なる場合のみ黄色ハイライト
        const differs =
          nodeA && nodeB && valueA !== valueB && valueA !== undefined && valueB !== undefined;
        const highlightClass = differs ? ' class="differs"' : '';

        rowsHtml += `<tr data-parent="${rowId}"${attrRowDisplay}>`;
        rowsHtml += `<td style="${attrIndentStyle}"${titleAttr}><span class="attr-name">${attrLabel}</span></td>`;
        rowsHtml += `<td${highlightClass}>${displayValueA}</td>`;
        rowsHtml += `<td${highlightClass}>${displayValueB}</td>`;
        rowsHtml += '</tr>';
      }

      // id_node属性の後にノード座標行を追加
      rowsHtml += renderNodeCoordinateRows(
        attrName,
        valueA,
        valueB,
        showSingleColumn,
        attrIndentStyle,
        rowId,
      );

      // shape属性の後に鉄骨断面ブロックを追加
      if (attrName === 'shape') {
        const childAttrIndent = attrIndentStyle.replace(
          /padding-left:\s*([\d.]+)em/,
          (_, val) => `padding-left: ${parseFloat(val) + 1.5}em`,
        );
        rowsHtml += renderSteelSectionBlock(
          valueA,
          valueB,
          showSingleColumn,
          attrIndentStyle,
          childAttrIndent,
          rowId,
        );
      }
    }
  }

  // --- StbOpenId要素の場合: 参照先の開口プロパティを表示 ---
  if (displayTagName === 'StbOpenId') {
    const openIdA = attrsA.get('id');
    const openIdB = attrsB.get('id');
    if (openIdA || openIdB) {
      const childAttrIndent = attrIndentStyle.replace(
        /padding-left:\s*([\d.]+)em/,
        (_, val) => `padding-left: ${parseFloat(val) + 1.5}em`,
      );
      rowsHtml += renderOpeningPropertiesBlock(
        openIdA,
        openIdB,
        showSingleColumn,
        attrIndentStyle,
        childAttrIndent,
        rowId,
      );
    }
  }

  // --- テキストコンテンツを表示する行 ---
  const textA = nodeA?.textContent?.trim();
  const textB = nodeB?.textContent?.trim();
  let hasMeaningfulTextA = false;
  let hasMeaningfulTextB = false;

  if (nodeA && nodeA.children.length === 0 && textA) {
    let attrsTextA = '';
    for (let i = 0; i < nodeA.attributes.length; i++) {
      attrsTextA += nodeA.attributes[i].value;
    }
    if (textA !== attrsTextA.trim()) hasMeaningfulTextA = true;
  }
  if (nodeB && nodeB.children.length === 0 && textB) {
    let attrsTextB = '';
    for (let i = 0; i < nodeB.attributes.length; i++) {
      attrsTextB += nodeB.attributes[i].value;
    }
    if (textB !== attrsTextB.trim()) hasMeaningfulTextB = true;
  }
  const textRowDisplay = '';
  if (hasMeaningfulTextA || hasMeaningfulTextB) {
    if (showSingleColumn) {
      // 単一モデル表示の場合
      const singleText = hasMeaningfulTextA ? textA : hasMeaningfulTextB ? textB : '';
      const displayText = singleText ? singleText : '<span class="no-value">-</span>';

      rowsHtml += `<tr data-parent="${rowId}"${textRowDisplay}>`;
      rowsHtml += `<td style="${attrIndentStyle}"><span class="text-label">(内容)</span></td>`;
      rowsHtml += `<td><span class="text-content">${displayText}</span></td>`;
      rowsHtml += '</tr>';

      // ノードIDリストの座標展開
      rowsHtml += renderNodeIdListCoordinateRows(
        displayTagName,
        hasMeaningfulTextA ? textA : null,
        hasMeaningfulTextB ? textB : null,
        showSingleColumn,
        attrIndentStyle,
        rowId,
      );
    } else {
      // 比較表示の場合（従来通り）
      const displayTextA = hasMeaningfulTextA ? textA : '<span class="no-value">-</span>';
      const displayTextB = hasMeaningfulTextB ? textB : '<span class="no-value">-</span>';
      const differs = nodeA && nodeB && hasMeaningfulTextA && hasMeaningfulTextB && textA !== textB;
      const highlightClass = differs ? ' class="differs"' : '';

      rowsHtml += `<tr data-parent="${rowId}"${textRowDisplay}>`;
      rowsHtml += `<td style="${attrIndentStyle}"><span class="text-label">(内容)</span></td>`;
      rowsHtml += `<td${highlightClass}><span class="text-content">${displayTextA}</span></td>`;
      rowsHtml += `<td${highlightClass}><span class="text-content">${displayTextB}</span></td>`;
      rowsHtml += '</tr>';

      // ノードIDリストの座標展開
      rowsHtml += renderNodeIdListCoordinateRows(
        displayTagName,
        hasMeaningfulTextA ? textA : null,
        hasMeaningfulTextB ? textB : null,
        showSingleColumn,
        attrIndentStyle,
        rowId,
      );
    }
  }

  // --- 子要素の行を再帰的に生成して追加 ---
  const childrenA = nodeA?.children ? Array.from(nodeA.children) : [];
  const childrenB = nodeB?.children ? Array.from(nodeB.children) : [];

  // pos属性によるマッチングが必要かどうかを判定
  if (shouldUsePosMatching(childrenA, childrenB)) {
    // pos属性でマッチングして比較
    const matchedPairs = matchChildrenByPos(childrenA, childrenB);

    for (const { childA, childB } of matchedPairs) {
      if (childA && childB && childA.tagName !== childB.tagName) {
        // タグ名が異なる場合は別々に表示（通常は発生しないはず）
        rowsHtml += renderComparisonRecursive(
          childA,
          null,
          level + 1,
          rowId,
          showSingleColumn,
          modelSource,
          null, // 子要素では自動判定させる
        );
        rowsHtml += renderComparisonRecursive(
          null,
          childB,
          level + 1,
          rowId,
          showSingleColumn,
          modelSource,
          null, // 子要素では自動判定させる
        );
      } else {
        rowsHtml += renderComparisonRecursive(
          childA,
          childB,
          level + 1,
          rowId,
          showSingleColumn,
          modelSource,
          null, // 子要素では自動判定させる
        );
      }
    }
  } else {
    // 従来のインデックスベースの比較
    const maxLen = Math.max(childrenA.length, childrenB.length);

    for (let i = 0; i < maxLen; i++) {
      const childA = childrenA[i] ?? null;
      const childB = childrenB[i] ?? null;
      if (childA && childB && childA.tagName !== childB.tagName) {
        rowsHtml += renderComparisonRecursive(
          childA,
          null,
          level + 1,
          rowId,
          showSingleColumn,
          modelSource,
          null, // 子要素では自動判定させる
        );
        rowsHtml += renderComparisonRecursive(
          null,
          childB,
          level + 1,
          rowId,
          showSingleColumn,
          modelSource,
          null, // 子要素では自動判定させる
        );
      } else {
        rowsHtml += renderComparisonRecursive(
          childA,
          childB,
          level + 1,
          rowId,
          showSingleColumn,
          modelSource,
          null, // 子要素では自動判定させる
        );
      }
    }
  }

  return rowsHtml;
}

/**
 * 折りたたみイベントハンドラを設定
 * @param {HTMLElement} tbody - テーブルボディ要素
 */
export function setupCollapseHandlers(tbody) {
  if (!tbody) return;

  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('.toggle-btn');
    if (!btn) return;
    const targetId = btn.dataset.targetId;
    if (!targetId) return;
    const rows = tbody.querySelectorAll(`tr[data-parent='${targetId}']`);
    const expanded = btn.textContent === '-';
    btn.textContent = expanded ? '+' : '-';
    rows.forEach((row) => {
      row.style.display = expanded ? 'none' : '';
      // 折りたたむときは子孫も再帰的に閉じる
      if (expanded) {
        const childBtn = row.querySelector('.toggle-btn');
        if (childBtn && childBtn.textContent === '-') {
          childBtn.textContent = '+';
          const childId = childBtn.dataset.targetId;
          const childRows = tbody.querySelectorAll(`tr[data-parent='${childId}']`);
          childRows.forEach((r) => (r.style.display = 'none'));
        }
      }
    });
  });
}

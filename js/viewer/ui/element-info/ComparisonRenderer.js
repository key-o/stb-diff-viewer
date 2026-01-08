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
} from '../../../parser/xsdSchemaParser.js';
import { getValidationStyles } from '../../../validation/validationIntegration.js';
import {
  getModelSourceBackgroundColor,
  getSingleValueBackgroundColor,
} from './ImportanceColors.js';
import {
  findSectionNode,
  extractSectionData,
  generateEquivalenceSection,
  getAttributesMap,
  renderShapeWithSteelInfo,
} from './SectionHelpers.js';
import { evaluateSectionEquivalence } from './ElementInfoProviders.js';
import { isEditMode, getCurrentEditingElement } from './EditMode.js';

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
        width: 100%; border-collapse: collapse; margin-bottom: 1em; font-size: 0.85em;
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
  elementCell += `<span class="toggle-btn" data-target-id="${rowId}" style="margin-right:5px;display:inline-block;width:1em;text-align:center;font-weight:bold;cursor:pointer;color:#666;">-</span>`;
  elementCell += `<span class="tag-name">${displayTagName}</span>`;
  if (tagNameA && tagNameB && tagNameA !== tagNameB) {
    elementCell += ` <span style="color: red; font-size: 0.8em;">(A: ${tagNameA}, B: ${tagNameB})</span>`;
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
      // shape属性は子要素ノードで個別に表示するためここではスキップ
      if (attrName === 'shape') continue;

      const valueA = attrsA.get(attrName);
      const valueB = attrsB.get(attrName);

      // XSDスキーマから属性情報を取得
      const attrInfo = isSchemaLoaded() ? getAttributeInfo(displayTagName, attrName) : null;
      const isRequired = attrInfo?.required || false;
      const hasDefault = attrInfo?.default || attrInfo?.fixed;
      const documentation = attrInfo?.documentation;

      if (showSingleColumn) {
        // 単一モデル表示の場合
        const singleValue = valueA || valueB;
        let displayValue = singleValue ?? '<span class="no-value">-</span>';

        // 編集モードの場合、編集ボタンを追加
        if (editMode && currentEditingElement) {
          const { elementType: currentEditType } = currentEditingElement;
          const currentId = valueA ? idA : idB;
          displayValue += ` <button class="edit-btn" style="font-size: 0.6em; padding: 1px 2px; background: none; border: none; opacity: 0.5; cursor: pointer;" onclick="window.editAttribute('${currentEditType}', '${currentId}', '${attrName}', '${
            singleValue || ''
          }')" title="編集">✏️</button>`;
        }

        // XSDスキーマからの情報を付加
        if (attrInfo) {
          let attrLabel = '';
          if (isRequired)
            attrLabel +=
              '<span style="color:red;font-size:0.9em;" title="必須パラメータ">🔴</span> ';
          attrLabel += attrName;
          if (hasDefault)
            attrLabel += ` <span style="color:blue;font-size:0.8em;" title="デフォルト値: ${hasDefault}">(${hasDefault})</span>`;

          rowsHtml += `<tr data-parent="${rowId}"${attrRowDisplay}>`;
          rowsHtml += `<td style="${attrIndentStyle}" title="${
            documentation || ''
          }"><span class="attr-name">${attrLabel}</span></td>`;
          // モデルソースに基づく背景色を適用（重要度ベース）
          const valueStyle = getSingleValueBackgroundColor(
            modelSource,
            currentElementType,
            attrName,
          );
          rowsHtml += `<td style="${valueStyle}">${displayValue}</td>`;
          rowsHtml += '</tr>';
        } else {
          rowsHtml += `<tr data-parent="${rowId}"${attrRowDisplay}>`;
          rowsHtml += `<td style="${attrIndentStyle}"><span class="attr-name">${attrName}</span></td>`;
          // モデルソースに基づく背景色を適用（重要度ベース）
          const valueStyle = getSingleValueBackgroundColor(
            modelSource,
            currentElementType,
            attrName,
          );
          rowsHtml += `<td style="${valueStyle}">${displayValue}</td>`;
          rowsHtml += '</tr>';
        }
      } else {
        // 比較表示の場合
        let displayValueA = valueA ?? '<span class="no-value">-</span>';
        let displayValueB = valueB ?? '<span class="no-value">-</span>';

        // 編集モードの場合、編集ボタンを追加
        if (editMode && currentEditingElement) {
          const { elementType: currentEditType } = currentEditingElement;
          if (valueA !== undefined && idA) {
            displayValueA += ` <button class="edit-btn" style="font-size: 0.6em; padding: 1px 2px; background: none; border: none; opacity: 0.5; cursor: pointer;" onclick="window.editAttribute('${currentEditType}', '${idA}', '${attrName}', '${
              valueA || ''
            }')" title="編集">✏️</button>`;
          }
          if (valueB !== undefined && idB) {
            displayValueB += ` <button class="edit-btn" style="font-size: 0.6em; padding: 1px 2px; background: none; border: none; opacity: 0.5; cursor: pointer;" onclick="window.editAttribute('${currentEditType}', '${idB}', '${attrName}', '${
              valueB || ''
            }')" title="編集">✏️</button>`;
          }
        }

        const differs =
          nodeA && nodeB && valueA !== valueB && valueA !== undefined && valueB !== undefined;
        const highlightClass = differs ? ' class="differs"' : '';

        // 各値の背景色を設定（比較表示用・重要度ベース）
        const valueAStyle =
          valueA !== undefined && valueA !== null
            ? modelSource === 'B'
              ? ''
              : getModelSourceBackgroundColor('A', true, false, currentElementType, attrName)
            : '';
        const valueBStyle =
          valueB !== undefined && valueB !== null
            ? modelSource === 'A'
              ? ''
              : getModelSourceBackgroundColor('B', false, true, currentElementType, attrName)
            : '';

        // XSDスキーマからの情報を付加
        if (attrInfo) {
          let attrLabel = '';
          if (isRequired)
            attrLabel +=
              '<span style="color:red;font-size:0.9em;" title="必須パラメータ">🔴</span> ';
          attrLabel += attrName;
          if (hasDefault)
            attrLabel += ` <span style="color:blue;font-size:0.8em;" title="デフォルト値: ${hasDefault}">(${hasDefault})</span>`;

          rowsHtml += `<tr data-parent="${rowId}"${attrRowDisplay}>`;
          rowsHtml += `<td style="${attrIndentStyle}" title="${
            documentation || ''
          }"><span class="attr-name">${attrLabel}</span></td>`;
          rowsHtml += `<td${highlightClass} style="${valueAStyle}">${displayValueA}</td>`;
          rowsHtml += `<td${highlightClass} style="${valueBStyle}">${displayValueB}</td>`;
          rowsHtml += '</tr>';
        } else {
          rowsHtml += `<tr data-parent="${rowId}"${attrRowDisplay}>`;
          rowsHtml += `<td style="${attrIndentStyle}"><span class="attr-name">${attrName}</span></td>`;
          rowsHtml += `<td${highlightClass} style="${valueAStyle}">${displayValueA}</td>`;
          rowsHtml += `<td${highlightClass} style="${valueBStyle}">${displayValueB}</td>`;
          rowsHtml += '</tr>';
        }
      }
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

  // --- shape属性を持つ「直接の子要素」だけ寸法付きで1行ずつ表示 ---
  if (showSingleColumn) {
    // 単一モデル表示の場合
    const children = childrenA.length > 0 ? childrenA : childrenB;
    if (children.length > 0) {
      for (const child of children) {
        if (child.hasAttribute && child.hasAttribute('shape')) {
          const shape = child.getAttribute('shape');
          rowsHtml += `<tr data-parent="${rowId}"><td style="${attrIndentStyle}"><span class="attr-name">shape</span></td><td>${renderShapeWithSteelInfo(
            shape,
          )}</td></tr>`;
        }
      }
    }
  } else {
    // 比較表示の場合（従来通り）
    if (childrenA.length > 0) {
      for (const child of childrenA) {
        if (child.hasAttribute && child.hasAttribute('shape')) {
          const shape = child.getAttribute('shape');
          rowsHtml += `<tr data-parent="${rowId}"><td style="${attrIndentStyle}"><span class="attr-name">shape</span></td><td>${renderShapeWithSteelInfo(
            shape,
          )}</td><td><span class="no-value">-</span></td></tr>`;
        }
      }
    }
    if (childrenB.length > 0) {
      for (const child of childrenB) {
        if (child.hasAttribute && child.hasAttribute('shape')) {
          const shape = child.getAttribute('shape');
          rowsHtml += `<tr data-parent="${rowId}"><td style="${attrIndentStyle}"><span class="attr-name">shape</span></td><td><span class="no-value">-</span></td><td>${renderShapeWithSteelInfo(
            shape,
          )}</td></tr>`;
        }
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

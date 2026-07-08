/**
 * @fileoverview ST-Bridge 構造要素バリデータ
 *
 * stbValidator.js から分割。柱・梁・ブレース・杭・基礎等の要素検証を担当。
 * ID重複・必須断面参照・ノード参照形式をチェックし issues 配列に push する。
 */

import { parseElements } from '../../import/parser/stbXmlParser.js';
import { STB_TAG_NAMES } from '../../../constants/elementTypes.js';
import { SEVERITY, CATEGORY } from '../validationConstants.js';

/**
 * 構造要素検証
 */
export function validateElements(xmlDoc, nodeMap, issues, statistics) {
  const elementTypes = [
    { name: STB_TAG_NAMES.COLUMN, type: 'column' },
    { name: STB_TAG_NAMES.POST, type: 'post' },
    { name: STB_TAG_NAMES.GIRDER, type: 'girder' },
    { name: STB_TAG_NAMES.BEAM, type: 'beam' },
    { name: STB_TAG_NAMES.BRACE, type: 'brace' },
    { name: STB_TAG_NAMES.PILE, type: 'pile' },
    { name: STB_TAG_NAMES.FOOTING, type: 'footing' },
    { name: STB_TAG_NAMES.FOUNDATION_COLUMN, type: 'foundationColumn' },
  ];

  for (const { name, type } of elementTypes) {
    const elements = parseElements(xmlDoc, name);
    statistics.elementCounts[name] = elements.length;
    statistics.totalElements += elements.length;

    const seenIds = new Set();

    for (const element of elements) {
      const id = element.getAttribute('id');

      // ID重複チェック
      if (seenIds.has(id)) {
        issues.push({
          severity: SEVERITY.ERROR,
          category: CATEGORY.DUPLICATE,
          message: `${name} ID "${id}" が重複しています`,
          elementType: name,
          elementId: id,
          attribute: 'id',
          repairable: false,
        });
      }
      seenIds.add(id);

      // 必須属性チェック（StbFoundationColumnは別の断面参照属性を使用）
      if (name === STB_TAG_NAMES.FOUNDATION_COLUMN) {
        // StbFoundationColumnはid_section_FDを使用
        const idSectionFD = element.getAttribute('id_section_FD');
        if (!idSectionFD) {
          issues.push({
            severity: SEVERITY.ERROR,
            category: CATEGORY.DATA,
            message: `${name} ${id} にid_section_FD属性がありません`,
            elementType: name,
            elementId: id,
            attribute: 'id_section_FD',
            repairable: true,
            repairSuggestion: '要素を削除またはデフォルト断面を割り当て',
          });
        }
      } else if (name !== STB_TAG_NAMES.FOOTING) {
        // StbFootingも特殊な断面参照を持つ可能性あり
        const idSection = element.getAttribute('id_section');
        if (!idSection) {
          issues.push({
            severity: SEVERITY.ERROR,
            category: CATEGORY.DATA,
            message: `${name} ${id} にid_section属性がありません`,
            elementType: name,
            elementId: id,
            attribute: 'id_section',
            repairable: true,
            repairSuggestion: '要素を削除またはデフォルト断面を割り当て',
          });
        }
      }

      // 要素タイプ別の検証
      if (type === 'column' || type === 'post') {
        validateTwoNodeElement(element, name, 'id_node_bottom', 'id_node_top', nodeMap, issues);
      } else if (type === 'foundationColumn' || type === 'footing') {
        validateSingleNodeElement(element, name, nodeMap, issues);
      } else if (type === 'girder' || type === 'beam' || type === 'brace') {
        validateTwoNodeElement(element, name, 'id_node_start', 'id_node_end', nodeMap, issues);
      } else if (type === 'pile') {
        validatePileElement(element, name, nodeMap, issues);
      }
    }
  }
}

/**
 * 2ノード要素（柱・梁など）の検証
 *
 * @param {Element} element - XML要素
 * @param {string} elementType - 要素タイプ名
 * @param {string} attr1 - 始点/下端ノード参照属性名
 * @param {string} attr2 - 終点/上端ノード参照属性名
 * @param {Map} nodeMap - ノードマップ
 * @param {ValidationIssue[]} issues - 問題配列
 */
function validateTwoNodeElement(element, elementType, attr1, attr2, nodeMap, issues) {
  const id = element.getAttribute('id');
  const idNode1 = element.getAttribute(attr1);
  const idNode2 = element.getAttribute(attr2);

  // ノード参照チェック
  if (!idNode1) {
    issues.push({
      severity: SEVERITY.ERROR,
      category: CATEGORY.DATA,
      message: `${elementType} ${id} に${attr1}属性がありません`,
      elementType,
      elementId: id,
      attribute: attr1,
      repairable: true,
      repairSuggestion: '要素を削除',
    });
  }

  if (!idNode2) {
    issues.push({
      severity: SEVERITY.ERROR,
      category: CATEGORY.DATA,
      message: `${elementType} ${id} に${attr2}属性がありません`,
      elementType,
      elementId: id,
      attribute: attr2,
      repairable: true,
      repairSuggestion: '要素を削除',
    });
  }

  // 同一ノードチェック
  if (idNode1 && idNode2 && idNode1 === idNode2) {
    issues.push({
      severity: SEVERITY.ERROR,
      category: CATEGORY.GEOMETRY,
      message: `${elementType} ${id} の両端が同じノード "${idNode1}" を参照しています`,
      elementType,
      elementId: id,
      value: idNode1,
      repairable: true,
      repairSuggestion: '要素を削除（長さゼロの要素）',
    });
  }
}

/**
 * 杭要素の検証
 */
function validatePileElement(element, elementType, nodeMap, issues) {
  const id = element.getAttribute('id');
  const idNodeBottom = element.getAttribute('id_node_bottom');
  const idNodeTop = element.getAttribute('id_node_top');
  const idNode = element.getAttribute('id_node');
  const levelTop = element.getAttribute('level_top');

  // 2ノード形式
  if (idNodeBottom && idNodeTop) {
    if (idNodeBottom === idNodeTop) {
      issues.push({
        severity: SEVERITY.ERROR,
        category: CATEGORY.GEOMETRY,
        message: `${elementType} ${id} の上端と下端が同じノードを参照しています`,
        elementType,
        elementId: id,
        repairable: true,
        repairSuggestion: '要素を削除',
      });
    }
  }
  // 1ノード形式
  else if (idNode) {
    if (!levelTop) {
      issues.push({
        severity: SEVERITY.ERROR,
        category: CATEGORY.DATA,
        message: `${elementType} ${id} にlevel_top属性がありません（1ノード形式）`,
        elementType,
        elementId: id,
        attribute: 'level_top',
        repairable: true,
        repairSuggestion: 'デフォルト深度を設定',
      });
    }
  } else {
    issues.push({
      severity: SEVERITY.ERROR,
      category: CATEGORY.DATA,
      message: `${elementType} ${id} のノード参照形式が不明です`,
      elementType,
      elementId: id,
      repairable: true,
      repairSuggestion: '要素を削除',
    });
  }
}

/**
 * 単一ノード要素（基礎・基礎柱など）の検証
 * id_node属性を持つ要素に使用する。
 *
 * @param {Element} element - XML要素
 * @param {string} elementType - 要素タイプ名
 * @param {Map} nodeMap - ノードマップ
 * @param {ValidationIssue[]} issues - 問題配列
 */
function validateSingleNodeElement(element, elementType, nodeMap, issues) {
  const id = element.getAttribute('id');
  const idNode = element.getAttribute('id_node');

  if (!idNode) {
    issues.push({
      severity: SEVERITY.ERROR,
      category: CATEGORY.DATA,
      message: `${elementType} ${id} にid_node属性がありません`,
      elementType,
      elementId: id,
      attribute: 'id_node',
      repairable: true,
      repairSuggestion: '要素を削除',
    });
  }
}

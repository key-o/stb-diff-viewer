/**
 * @fileoverview ST-Bridge 参照整合性・IDM整合性バリデータ
 *
 * stbValidator.js から分割。ノード参照・断面参照の整合性、
 * および kind_structure と断面タグ種別の一致（IDM制約）を検証する。
 */

import { parseElements } from '../../import/parser/stbXmlParser.js';
import { STB_TAG_NAMES } from '../../../constants/elementTypes.js';
import { SEVERITY, CATEGORY } from '../validationConstants.js';

/**
 * 参照整合性検証
 */
export function validateReferenceIntegrity(xmlDoc, nodeMap, issues, _statistics) {
  // ノード参照の整合性
  const checkNodeReference = (element, elementType, attributeName) => {
    const id = element.getAttribute('id');
    const nodeId = element.getAttribute(attributeName);

    if (nodeId && !nodeMap.has(nodeId)) {
      issues.push({
        severity: SEVERITY.ERROR,
        category: CATEGORY.REFERENCE,
        message: `${elementType} ${id} が存在しないノード "${nodeId}" を参照しています`,
        elementType,
        elementId: id,
        attribute: attributeName,
        value: nodeId,
        repairable: true,
        repairSuggestion: '要素を削除または参照を修正',
      });
    }
  };

  // 柱要素
  const columns = parseElements(xmlDoc, STB_TAG_NAMES.COLUMN);
  for (const col of columns) {
    checkNodeReference(col, STB_TAG_NAMES.COLUMN, 'id_node_bottom');
    checkNodeReference(col, STB_TAG_NAMES.COLUMN, 'id_node_top');
  }

  // 間柱要素
  const posts = parseElements(xmlDoc, STB_TAG_NAMES.POST);
  for (const post of posts) {
    checkNodeReference(post, STB_TAG_NAMES.POST, 'id_node_bottom');
    checkNodeReference(post, STB_TAG_NAMES.POST, 'id_node_top');
  }

  // 大梁要素
  const girders = parseElements(xmlDoc, STB_TAG_NAMES.GIRDER);
  for (const girder of girders) {
    checkNodeReference(girder, STB_TAG_NAMES.GIRDER, 'id_node_start');
    checkNodeReference(girder, STB_TAG_NAMES.GIRDER, 'id_node_end');
  }

  // 小梁要素
  const beams = parseElements(xmlDoc, STB_TAG_NAMES.BEAM);
  for (const beam of beams) {
    checkNodeReference(beam, STB_TAG_NAMES.BEAM, 'id_node_start');
    checkNodeReference(beam, STB_TAG_NAMES.BEAM, 'id_node_end');
  }

  // ブレース要素
  const braces = parseElements(xmlDoc, STB_TAG_NAMES.BRACE);
  for (const brace of braces) {
    checkNodeReference(brace, STB_TAG_NAMES.BRACE, 'id_node_start');
    checkNodeReference(brace, STB_TAG_NAMES.BRACE, 'id_node_end');
  }

  // 杭要素
  const piles = parseElements(xmlDoc, STB_TAG_NAMES.PILE);
  for (const pile of piles) {
    const idNodeBottom = pile.getAttribute('id_node_bottom');
    const idNode = pile.getAttribute('id_node');
    if (idNodeBottom) {
      checkNodeReference(pile, STB_TAG_NAMES.PILE, 'id_node_bottom');
      checkNodeReference(pile, STB_TAG_NAMES.PILE, 'id_node_top');
    } else if (idNode) {
      checkNodeReference(pile, STB_TAG_NAMES.PILE, 'id_node');
    }
  }

  // 基礎要素
  const footings = parseElements(xmlDoc, STB_TAG_NAMES.FOOTING);
  for (const footing of footings) {
    checkNodeReference(footing, STB_TAG_NAMES.FOOTING, 'id_node');
  }

  // 基礎柱要素（id_nodeを使用）
  const foundationColumns = parseElements(xmlDoc, STB_TAG_NAMES.FOUNDATION_COLUMN);
  for (const fc of foundationColumns) {
    checkNodeReference(fc, STB_TAG_NAMES.FOUNDATION_COLUMN, 'id_node');
  }

  // 断面参照の整合性
  validateSectionReferences(xmlDoc, issues);
}

/**
 * 断面参照の整合性検証
 */
function validateSectionReferences(xmlDoc, issues) {
  // 断面定義を収集
  const sectionIds = new Set();

  const sectionContainers = [
    'StbSecColumn_RC',
    'StbSecColumn_S',
    'StbSecColumn_SRC',
    'StbSecColumn_CFT',
    'StbSecGirder_RC',
    'StbSecGirder_S',
    'StbSecGirder_SRC',
    'StbSecBeam_RC',
    'StbSecBeam_S',
    'StbSecBeam_SRC',
    'StbSecBrace_S',
    'StbSecPile_RC',
    'StbSecPile_S',
    'StbSecPileProduct',
    'StbSecFoundation_RC',
  ];

  for (const containerName of sectionContainers) {
    const sections = parseElements(xmlDoc, containerName);
    for (const section of sections) {
      const id = section.getAttribute('id');
      if (id) sectionIds.add(id);
    }
  }

  // 要素からの参照をチェック
  const elementTypes = [
    STB_TAG_NAMES.COLUMN,
    STB_TAG_NAMES.POST,
    STB_TAG_NAMES.GIRDER,
    STB_TAG_NAMES.BEAM,
    STB_TAG_NAMES.BRACE,
    STB_TAG_NAMES.PILE,
    STB_TAG_NAMES.FOOTING,
  ];

  for (const elementType of elementTypes) {
    const elements = parseElements(xmlDoc, elementType);
    for (const element of elements) {
      const id = element.getAttribute('id');
      const idSection = element.getAttribute('id_section');

      if (idSection && !sectionIds.has(idSection)) {
        issues.push({
          severity: SEVERITY.ERROR,
          category: CATEGORY.REFERENCE,
          message: `${elementType} ${id} が存在しない断面 "${idSection}" を参照しています`,
          elementType,
          elementId: id,
          attribute: 'id_section',
          value: idSection,
          repairable: true,
          repairSuggestion: '要素を削除またはデフォルト断面を割り当て',
        });
      }
    }
  }

  // StbFoundationColumnは特殊な断面参照属性を使用
  const foundationColumns = parseElements(xmlDoc, STB_TAG_NAMES.FOUNDATION_COLUMN);
  for (const element of foundationColumns) {
    const id = element.getAttribute('id');

    // id_section_FD（基礎部分）のチェック
    const idSectionFD = element.getAttribute('id_section_FD');
    if (idSectionFD && idSectionFD !== '0' && !sectionIds.has(idSectionFD)) {
      issues.push({
        severity: SEVERITY.ERROR,
        category: CATEGORY.REFERENCE,
        message: `StbFoundationColumn ${id} が存在しない断面 "${idSectionFD}" を参照しています（id_section_FD）`,
        elementType: STB_TAG_NAMES.FOUNDATION_COLUMN,
        elementId: id,
        attribute: 'id_section_FD',
        value: idSectionFD,
        repairable: true,
        repairSuggestion: '要素を削除またはデフォルト断面を割り当て',
      });
    }

    // id_section_WR（壁部分）のチェック - 0は未設定を意味するので除外
    const idSectionWR = element.getAttribute('id_section_WR');
    if (idSectionWR && idSectionWR !== '0' && !sectionIds.has(idSectionWR)) {
      issues.push({
        severity: SEVERITY.ERROR,
        category: CATEGORY.REFERENCE,
        message: `StbFoundationColumn ${id} が存在しない断面 "${idSectionWR}" を参照しています（id_section_WR）`,
        elementType: STB_TAG_NAMES.FOUNDATION_COLUMN,
        elementId: id,
        attribute: 'id_section_WR',
        value: idSectionWR,
        repairable: true,
        repairSuggestion: '要素を削除またはデフォルト断面を割り当て',
      });
    }
  }
}

// 要素タイプ → 参照可能な断面タグ一覧（IDM制約）
const ELEMENT_ALLOWED_SECTION_TAGS = {
  StbColumn: ['StbSecColumn_RC', 'StbSecColumn_S', 'StbSecColumn_SRC', 'StbSecColumn_CFT'],
  StbPost: ['StbSecColumn_RC', 'StbSecColumn_S', 'StbSecColumn_SRC', 'StbSecColumn_CFT'],
  StbGirder: [
    'StbSecGirder_RC',
    'StbSecGirder_S',
    'StbSecGirder_SRC',
    'StbSecBeam_RC',
    'StbSecBeam_S',
    'StbSecBeam_SRC',
  ],
  StbBeam: ['StbSecBeam_RC', 'StbSecBeam_S', 'StbSecBeam_SRC'],
  StbBrace: ['StbSecBrace_S'],
  StbPile: ['StbSecPile_RC', 'StbSecPile_S', 'StbSecPileProduct'],
  StbFooting: ['StbSecFoundation_RC'],
};

// kind_structure → 断面タグのサフィックス（UNDEFINED は照合しない）
const KIND_STRUCTURE_SUFFIX = {
  RC: '_RC',
  S: '_S',
  SRC: '_SRC',
  CFT: '_CFT',
  UNDEFINED: null,
};

// 全断面タグ一覧（sectionIdToTagMap 構築用）
const ALL_SECTION_TAGS = [
  'StbSecColumn_RC',
  'StbSecColumn_S',
  'StbSecColumn_SRC',
  'StbSecColumn_CFT',
  'StbSecGirder_RC',
  'StbSecGirder_S',
  'StbSecGirder_SRC',
  'StbSecBeam_RC',
  'StbSecBeam_S',
  'StbSecBeam_SRC',
  'StbSecBrace_S',
  'StbSecPile_RC',
  'StbSecPile_S',
  'StbSecPileProduct',
  'StbSecFoundation_RC',
];

/**
 * IDM整合性検証: kind_structure と断面タグ種別の一致チェック
 *
 * チェック A: 要素タイプに許可されていない断面タグを参照していないか
 * チェック B: kind_structure 属性と断面タグのサフィックスが一致しているか
 */
export function validateStructureKindConsistency(xmlDoc, issues) {
  // 断面ID → 断面タグ名 のマップを構築
  const sectionIdToTagMap = new Map();
  for (const tagName of ALL_SECTION_TAGS) {
    for (const sec of parseElements(xmlDoc, tagName)) {
      const id = sec.getAttribute('id');
      if (id) sectionIdToTagMap.set(id, tagName);
    }
  }

  // 各要素タイプについてチェック
  for (const [elementType, allowedTags] of Object.entries(ELEMENT_ALLOWED_SECTION_TAGS)) {
    for (const element of parseElements(xmlDoc, elementType)) {
      const id = element.getAttribute('id');
      const idSection = element.getAttribute('id_section');
      const kindStructure = element.getAttribute('kind_structure');

      if (!idSection) continue;
      const sectionTagName = sectionIdToTagMap.get(idSection);
      if (!sectionTagName) continue; // 存在チェックは validateSectionReferences が担当

      // チェック A: 断面タグ種別チェック（kind_structure=UNDEFINED は構造種別未定義のため除外）
      if (kindStructure !== 'UNDEFINED' && !allowedTags.includes(sectionTagName)) {
        issues.push({
          severity: SEVERITY.ERROR,
          category: CATEGORY.REFERENCE,
          message: `${elementType} ${id} が${elementType}用以外の断面 "${sectionTagName}" (id: ${idSection}) を参照しています`,
          elementType,
          elementId: id,
          attribute: 'id_section',
          value: idSection,
          repairable: false,
        });
        continue; // B チェックは不要
      }

      // チェック B: kind_structure 整合性チェック（StbSecPileProduct / UNDEFINED は除外）
      if (
        kindStructure &&
        kindStructure !== 'UNDEFINED' &&
        sectionTagName !== 'StbSecPileProduct'
      ) {
        const expectedSuffix = KIND_STRUCTURE_SUFFIX[kindStructure];
        if (expectedSuffix && !sectionTagName.endsWith(expectedSuffix)) {
          issues.push({
            severity: SEVERITY.ERROR,
            category: CATEGORY.DATA,
            message: `${elementType} ${id} の kind_structure="${kindStructure}" と断面種別 "${sectionTagName}" が一致しません`,
            elementType,
            elementId: id,
            attribute: 'kind_structure',
            value: kindStructure,
            expected: expectedSuffix,
            repairable: false,
          });
        }
      }
    }
  }
}

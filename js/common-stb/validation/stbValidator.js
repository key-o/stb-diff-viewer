/**
 * @fileoverview ST-Bridge包括的バリデーションエンジン
 *
 * ST-Bridgeファイル全体を検証し、問題を検出・レポートします。
 *
 * 検証項目:
 * - 構造検証: 必須要素の存在、要素間参照の整合性
 * - データ検証: 座標値・寸法値の範囲、重複ID
 * - 幾何学的検証: 要素の妥当性チェック
 */

import {
  parseElements,
  buildNodeMap,
  parseStories,
  parseAxes,
} from '../import/parser/stbXmlParser.js';
import { createLogger } from '../../utils/logger.js';
import { isSchemaLoaded, getActiveVersion } from '../import/parser/jsonSchemaLoader.js';
import { validateJsonSchema } from './jsonSchemaValidator.js';

const logger = createLogger('validation:validator');

/**
 * バリデーション問題の重要度レベル
 */
export const SEVERITY = {
  ERROR: 'error', // データが使用不可
  WARNING: 'warning', // 使用可能だが確認推奨
  INFO: 'info', // 情報提供のみ
};

/**
 * バリデーション問題のカテゴリ
 */
export const CATEGORY = {
  STRUCTURE: 'structure', // 構造的な問題
  REFERENCE: 'reference', // 参照整合性
  DATA: 'data', // データ値の問題
  GEOMETRY: 'geometry', // 幾何学的問題
  DUPLICATE: 'duplicate', // 重複問題
  SCHEMA: 'schema', // XSDスキーマ制約違反
};

/**
 * バリデーション問題
 * @typedef {Object} ValidationIssue
 * @property {string} severity - 重要度 (error, warning, info)
 * @property {string} category - カテゴリ
 * @property {string} message - メッセージ
 * @property {string} elementType - 要素タイプ
 * @property {string} elementId - 要素ID
 * @property {string} attribute - 属性名（該当する場合）
 * @property {*} value - 現在の値
 * @property {*} expected - 期待される値
 * @property {string} xpath - 対象要素/属性の絶対XPath
 * @property {string} idXPath - id属性を持つ要素を起点にしたXPath
 * @property {boolean} repairable - 修復可能かどうか
 * @property {string} repairSuggestion - 修復提案
 */

/**
 * バリデーション結果
 * @typedef {Object} ValidationReport
 * @property {boolean} valid - 全体的な妥当性
 * @property {ValidationIssue[]} issues - 検出された問題
 * @property {Object} statistics - 統計情報
 * @property {Date} timestamp - 検証日時
 */

/**
 * ST-Bridgeドキュメント全体をバリデーション
 *
 * @param {Document} xmlDoc - パース済みXMLドキュメント
 * @param {Object} options - オプション
 * @param {boolean} options.validateReferences - 参照整合性チェックを実行
 * @param {boolean} options.validateGeometry - 幾何学検証を実行
 * @param {boolean} options.includeInfo - 情報レベルの問題を含める
 * @returns {ValidationReport} バリデーション結果
 */
export function validateStbDocument(xmlDoc, options = {}) {
  const {
    validateReferences = true,
    validateGeometry = true,
    validateSchema = true,
    includeInfo = false,
  } = options;

  const issues = [];
  const statistics = {
    totalElements: 0,
    errorCount: 0,
    warningCount: 0,
    infoCount: 0,
    elementCounts: {},
    repairableCount: 0,
  };

  const timestamp = new Date();

  if (!xmlDoc) {
    issues.push({
      severity: SEVERITY.ERROR,
      category: CATEGORY.STRUCTURE,
      message: 'XMLドキュメントがnullまたはundefinedです',
      elementType: 'Document',
      elementId: '',
      repairable: false,
    });
    return createReport(false, issues, statistics, timestamp);
  }

  // 0. JSON Schemaスキーマ検証（オプション、スキーマ読込済みの場合のみ）
  if (validateSchema && isSchemaLoaded()) {
    try {
      const version = detectStbVersion(xmlDoc);
      const schemaIssues = validateJsonSchema(xmlDoc, { version });
      issues.push(...schemaIssues);
    } catch (e) {
      logger.warn(`JSON Schemaスキーマ検証中にエラーが発生: ${e.message}`);
    }
  }

  // 1. 構造検証
  validateStructure(xmlDoc, issues);

  // 2. ノード検証
  const nodeMap = buildNodeMap(xmlDoc);
  validateNodes(xmlDoc, nodeMap, issues, statistics);

  // 3. 階情報検証
  const stories = parseStories(xmlDoc);
  validateStories(stories, issues);

  // 4. 軸情報検証
  const axesData = parseAxes(xmlDoc);
  validateAxes(axesData, issues);

  // 5. 要素検証
  validateElements(xmlDoc, nodeMap, issues, statistics);

  // 6. 参照整合性検証
  if (validateReferences) {
    validateReferenceIntegrity(xmlDoc, nodeMap, issues, statistics);
  }

  // 7. IDM整合性検証（kind_structure と断面タグ種別の一致チェック）
  validateStructureKindConsistency(xmlDoc, issues);

  // 8. 幾何学検証
  if (validateGeometry) {
    validateGeometricConstraints(xmlDoc, nodeMap, issues);
  }

  // 統計情報の更新
  updateStatistics(issues, statistics);

  // 情報レベルの除外（オプション）
  const filteredIssues = includeInfo
    ? issues
    : issues.filter((issue) => issue.severity !== SEVERITY.INFO);

  const valid = !filteredIssues.some((issue) => issue.severity === SEVERITY.ERROR);

  return createReport(valid, filteredIssues, statistics, timestamp);
}

/**
 * 構造検証 - 必須要素の存在チェック
 */
function validateStructure(xmlDoc, issues) {
  // ST_BRIDGE ルート要素
  const root = xmlDoc.documentElement;
  if (!root || root.tagName !== 'ST_BRIDGE') {
    issues.push({
      severity: SEVERITY.ERROR,
      category: CATEGORY.STRUCTURE,
      message: 'ルート要素がST_BRIDGEではありません',
      elementType: 'Document',
      elementId: '',
      value: root?.tagName,
      expected: 'ST_BRIDGE',
      repairable: false,
    });
  }

  // バージョンチェック
  const version = root?.getAttribute('version');
  if (version && !version.startsWith('2.')) {
    issues.push({
      severity: SEVERITY.WARNING,
      category: CATEGORY.STRUCTURE,
      message: `ST-Bridgeバージョン ${version} は完全にサポートされていない可能性があります`,
      elementType: 'ST_BRIDGE',
      elementId: '',
      attribute: 'version',
      value: version,
      repairable: false,
    });
  }

  // 必須要素のチェック
  const requiredElements = ['StbCommon', 'StbModel'];
  for (const elementName of requiredElements) {
    const elements = parseElements(xmlDoc, elementName);
    if (elements.length === 0) {
      issues.push({
        severity: SEVERITY.ERROR,
        category: CATEGORY.STRUCTURE,
        message: `必須要素 ${elementName} が存在しません`,
        elementType: elementName,
        elementId: '',
        repairable: false,
      });
    }
  }

  // StbNodes要素のチェック
  const nodes = parseElements(xmlDoc, 'StbNode');
  if (nodes.length === 0) {
    issues.push({
      severity: SEVERITY.ERROR,
      category: CATEGORY.STRUCTURE,
      message: 'StbNode要素が存在しません。構造モデルにノードが必要です',
      elementType: 'StbNodes',
      elementId: '',
      repairable: false,
    });
  }
}

/**
 * ノード検証
 */
function validateNodes(xmlDoc, nodeMap, issues, statistics) {
  const nodes = parseElements(xmlDoc, 'StbNode');
  const seenIds = new Set();

  for (const node of nodes) {
    const id = node.getAttribute('id');
    const x = node.getAttribute('X');
    const y = node.getAttribute('Y');
    const z = node.getAttribute('Z');

    // ID重複チェック
    if (seenIds.has(id)) {
      issues.push({
        severity: SEVERITY.ERROR,
        category: CATEGORY.DUPLICATE,
        message: `ノードID "${id}" が重複しています`,
        elementType: 'StbNode',
        elementId: id,
        attribute: 'id',
        repairable: false,
      });
    }
    seenIds.add(id);

    // 座標値の検証
    const coords = [
      { name: 'X', value: x },
      { name: 'Y', value: y },
      { name: 'Z', value: z },
    ];

    for (const coord of coords) {
      if (coord.value === null || coord.value === '') {
        issues.push({
          severity: SEVERITY.ERROR,
          category: CATEGORY.DATA,
          message: `ノード ${id} の${coord.name}座標が欠落しています`,
          elementType: 'StbNode',
          elementId: id,
          attribute: coord.name,
          repairable: true,
          repairSuggestion: 'デフォルト値 0 を設定',
        });
        continue;
      }

      const numValue = parseFloat(coord.value);
      if (isNaN(numValue)) {
        issues.push({
          severity: SEVERITY.ERROR,
          category: CATEGORY.DATA,
          message: `ノード ${id} の${coord.name}座標 "${coord.value}" が数値ではありません`,
          elementType: 'StbNode',
          elementId: id,
          attribute: coord.name,
          value: coord.value,
          repairable: true,
          repairSuggestion: '無効な値を0に置換',
        });
      } else if (!isFinite(numValue)) {
        issues.push({
          severity: SEVERITY.ERROR,
          category: CATEGORY.DATA,
          message: `ノード ${id} の${coord.name}座標が無限大です`,
          elementType: 'StbNode',
          elementId: id,
          attribute: coord.name,
          value: numValue,
          repairable: true,
          repairSuggestion: '無限大を適切な値に置換',
        });
      } else if (Math.abs(numValue) > 1e9) {
        issues.push({
          severity: SEVERITY.WARNING,
          category: CATEGORY.DATA,
          message: `ノード ${id} の${coord.name}座標 ${numValue}mm が非常に大きい値です`,
          elementType: 'StbNode',
          elementId: id,
          attribute: coord.name,
          value: numValue,
          repairable: false,
        });
      }
    }
  }

  statistics.elementCounts.StbNode = nodes.length;
}

/**
 * 階情報検証
 */
function validateStories(stories, issues) {
  const seenHeights = new Map();

  for (const story of stories) {
    // 高さの重複チェック
    if (seenHeights.has(story.height)) {
      issues.push({
        severity: SEVERITY.WARNING,
        category: CATEGORY.DUPLICATE,
        message: `階 "${story.name}" の高さ ${story.height}mm が "${seenHeights.get(story.height)}" と重複しています`,
        elementType: 'StbStory',
        elementId: story.id,
        attribute: 'height',
        value: story.height,
        repairable: true,
        repairSuggestion: '重複する階を削除またはマージ',
      });
    }
    seenHeights.set(story.height, story.name);

    // 名前のチェック
    if (!story.name || story.name.trim() === '') {
      issues.push({
        severity: SEVERITY.WARNING,
        category: CATEGORY.DATA,
        message: `階ID ${story.id} に名前が設定されていません`,
        elementType: 'StbStory',
        elementId: story.id,
        attribute: 'name',
        repairable: true,
        repairSuggestion: `デフォルト名 "Story_${story.id}" を設定`,
      });
    }
  }
}

/**
 * 軸情報検証
 */
function validateAxes(axesData, issues) {
  const validateAxisGroup = (axes, groupName) => {
    const seenDistances = new Map();

    for (const axis of axes) {
      // 距離の重複チェック
      if (seenDistances.has(axis.distance)) {
        issues.push({
          severity: SEVERITY.WARNING,
          category: CATEGORY.DUPLICATE,
          message: `${groupName}軸 "${axis.name}" の距離 ${axis.distance}mm が "${seenDistances.get(axis.distance)}" と重複しています`,
          elementType: 'StbParallelAxis',
          elementId: axis.id,
          attribute: 'distance',
          value: axis.distance,
          repairable: true,
          repairSuggestion: '重複する軸を削除',
        });
      }
      seenDistances.set(axis.distance, axis.name);

      // 負の距離チェック（通常は問題ないが警告）
      if (axis.distance < 0) {
        issues.push({
          severity: SEVERITY.INFO,
          category: CATEGORY.DATA,
          message: `${groupName}軸 "${axis.name}" の距離が負の値 ${axis.distance}mm です`,
          elementType: 'StbParallelAxis',
          elementId: axis.id,
          attribute: 'distance',
          value: axis.distance,
          repairable: false,
        });
      }
    }
  };

  validateAxisGroup(axesData.xAxes, 'X');
  validateAxisGroup(axesData.yAxes, 'Y');
}

/**
 * 構造要素検証
 */
function validateElements(xmlDoc, nodeMap, issues, statistics) {
  const elementTypes = [
    { name: 'StbColumn', type: 'column' },
    { name: 'StbPost', type: 'post' },
    { name: 'StbGirder', type: 'girder' },
    { name: 'StbBeam', type: 'beam' },
    { name: 'StbBrace', type: 'brace' },
    { name: 'StbPile', type: 'pile' },
    { name: 'StbFooting', type: 'footing' },
    { name: 'StbFoundationColumn', type: 'foundationColumn' },
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
      if (name === 'StbFoundationColumn') {
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
      } else if (name !== 'StbFooting') {
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

/**
 * 参照整合性検証
 */
function validateReferenceIntegrity(xmlDoc, nodeMap, issues, _statistics) {
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
  const columns = parseElements(xmlDoc, 'StbColumn');
  for (const col of columns) {
    checkNodeReference(col, 'StbColumn', 'id_node_bottom');
    checkNodeReference(col, 'StbColumn', 'id_node_top');
  }

  // 間柱要素
  const posts = parseElements(xmlDoc, 'StbPost');
  for (const post of posts) {
    checkNodeReference(post, 'StbPost', 'id_node_bottom');
    checkNodeReference(post, 'StbPost', 'id_node_top');
  }

  // 大梁要素
  const girders = parseElements(xmlDoc, 'StbGirder');
  for (const girder of girders) {
    checkNodeReference(girder, 'StbGirder', 'id_node_start');
    checkNodeReference(girder, 'StbGirder', 'id_node_end');
  }

  // 小梁要素
  const beams = parseElements(xmlDoc, 'StbBeam');
  for (const beam of beams) {
    checkNodeReference(beam, 'StbBeam', 'id_node_start');
    checkNodeReference(beam, 'StbBeam', 'id_node_end');
  }

  // ブレース要素
  const braces = parseElements(xmlDoc, 'StbBrace');
  for (const brace of braces) {
    checkNodeReference(brace, 'StbBrace', 'id_node_start');
    checkNodeReference(brace, 'StbBrace', 'id_node_end');
  }

  // 杭要素
  const piles = parseElements(xmlDoc, 'StbPile');
  for (const pile of piles) {
    const idNodeBottom = pile.getAttribute('id_node_bottom');
    const idNode = pile.getAttribute('id_node');
    if (idNodeBottom) {
      checkNodeReference(pile, 'StbPile', 'id_node_bottom');
      checkNodeReference(pile, 'StbPile', 'id_node_top');
    } else if (idNode) {
      checkNodeReference(pile, 'StbPile', 'id_node');
    }
  }

  // 基礎要素
  const footings = parseElements(xmlDoc, 'StbFooting');
  for (const footing of footings) {
    checkNodeReference(footing, 'StbFooting', 'id_node');
  }

  // 基礎柱要素（id_nodeを使用）
  const foundationColumns = parseElements(xmlDoc, 'StbFoundationColumn');
  for (const fc of foundationColumns) {
    checkNodeReference(fc, 'StbFoundationColumn', 'id_node');
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
    'StbColumn',
    'StbPost',
    'StbGirder',
    'StbBeam',
    'StbBrace',
    'StbPile',
    'StbFooting',
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
  const foundationColumns = parseElements(xmlDoc, 'StbFoundationColumn');
  for (const element of foundationColumns) {
    const id = element.getAttribute('id');

    // id_section_FD（基礎部分）のチェック
    const idSectionFD = element.getAttribute('id_section_FD');
    if (idSectionFD && idSectionFD !== '0' && !sectionIds.has(idSectionFD)) {
      issues.push({
        severity: SEVERITY.ERROR,
        category: CATEGORY.REFERENCE,
        message: `StbFoundationColumn ${id} が存在しない断面 "${idSectionFD}" を参照しています（id_section_FD）`,
        elementType: 'StbFoundationColumn',
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
        elementType: 'StbFoundationColumn',
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
function validateStructureKindConsistency(xmlDoc, issues) {
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

      // チェック A: 断面タグ種別チェック
      if (!allowedTags.includes(sectionTagName)) {
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

/**
 * 幾何学的制約の検証
 */
function validateGeometricConstraints(xmlDoc, nodeMap, issues) {
  // 柱の長さ検証
  const columns = parseElements(xmlDoc, 'StbColumn');
  for (const col of columns) {
    const id = col.getAttribute('id');
    const bottomId = col.getAttribute('id_node_bottom');
    const topId = col.getAttribute('id_node_top');

    if (bottomId && topId && nodeMap.has(bottomId) && nodeMap.has(topId)) {
      const bottom = nodeMap.get(bottomId);
      const top = nodeMap.get(topId);

      const length = Math.sqrt(
        Math.pow(top.x - bottom.x, 2) +
          Math.pow(top.y - bottom.y, 2) +
          Math.pow(top.z - bottom.z, 2),
      );

      if (length < 100) {
        // 100mm未満
        issues.push({
          severity: SEVERITY.WARNING,
          category: CATEGORY.GEOMETRY,
          message: `StbColumn ${id} の長さが ${length.toFixed(1)}mm で非常に短いです`,
          elementType: 'StbColumn',
          elementId: id,
          value: length,
          repairable: true,
          repairSuggestion: '長さが100mm未満の要素を削除',
        });
      }

      if (length > 50000) {
        // 50m超
        issues.push({
          severity: SEVERITY.WARNING,
          category: CATEGORY.GEOMETRY,
          message: `StbColumn ${id} の長さが ${length.toFixed(1)}mm で非常に長いです`,
          elementType: 'StbColumn',
          elementId: id,
          value: length,
          repairable: false,
        });
      }
    }
  }

  // 梁の長さ検証（同様のロジック）
  const beamTypes = ['StbGirder', 'StbBeam'];
  for (const beamType of beamTypes) {
    const beams = parseElements(xmlDoc, beamType);
    for (const beam of beams) {
      const id = beam.getAttribute('id');
      const startId = beam.getAttribute('id_node_start');
      const endId = beam.getAttribute('id_node_end');

      if (startId && endId && nodeMap.has(startId) && nodeMap.has(endId)) {
        const start = nodeMap.get(startId);
        const end = nodeMap.get(endId);

        const length = Math.sqrt(
          Math.pow(end.x - start.x, 2) +
            Math.pow(end.y - start.y, 2) +
            Math.pow(end.z - start.z, 2),
        );

        if (length < 100) {
          issues.push({
            severity: SEVERITY.WARNING,
            category: CATEGORY.GEOMETRY,
            message: `${beamType} ${id} の長さが ${length.toFixed(1)}mm で非常に短いです`,
            elementType: beamType,
            elementId: id,
            value: length,
            repairable: true,
            repairSuggestion: '長さが100mm未満の要素を削除',
          });
        }

        if (length > 30000) {
          // 30m超
          issues.push({
            severity: SEVERITY.WARNING,
            category: CATEGORY.GEOMETRY,
            message: `${beamType} ${id} の長さが ${length.toFixed(1)}mm で非常に長いです`,
            elementType: beamType,
            elementId: id,
            value: length,
            repairable: false,
          });
        }
      }
    }
  }
}

/**
 * 統計情報の更新
 */
function updateStatistics(issues, statistics) {
  for (const issue of issues) {
    switch (issue.severity) {
      case SEVERITY.ERROR:
        statistics.errorCount++;
        break;
      case SEVERITY.WARNING:
        statistics.warningCount++;
        break;
      case SEVERITY.INFO:
        statistics.infoCount++;
        break;
    }

    if (issue.repairable) {
      statistics.repairableCount++;
    }
  }
}

/**
 * バリデーションレポートの作成
 */
function createReport(valid, issues, statistics, timestamp) {
  return {
    valid,
    issues,
    statistics,
    timestamp,
  };
}

/**
 * バリデーションレポートをフォーマット
 *
 * @param {ValidationReport} report - バリデーションレポート
 * @returns {string} フォーマットされたテキスト
 */
export function formatValidationReport(report) {
  const lines = [];

  lines.push('='.repeat(60));
  lines.push('ST-Bridge バリデーションレポート');
  lines.push('='.repeat(60));
  lines.push('');
  lines.push(`検証日時: ${report.timestamp.toISOString()}`);
  lines.push(`結果: ${report.valid ? '✓ 有効' : '✗ エラーあり'}`);
  lines.push('');

  // 統計情報
  lines.push('--- 統計情報 ---');
  lines.push(`総要素数: ${report.statistics.totalElements}`);
  lines.push(`エラー: ${report.statistics.errorCount}`);
  lines.push(`警告: ${report.statistics.warningCount}`);
  lines.push(`情報: ${report.statistics.infoCount}`);
  lines.push(`修復可能: ${report.statistics.repairableCount}`);
  lines.push('');

  // 要素別カウント
  if (Object.keys(report.statistics.elementCounts).length > 0) {
    lines.push('--- 要素別カウント ---');
    for (const [type, count] of Object.entries(report.statistics.elementCounts)) {
      lines.push(`  ${type}: ${count}`);
    }
    lines.push('');
  }

  // 問題一覧
  if (report.issues.length > 0) {
    lines.push('--- 検出された問題 ---');

    // エラーを先に表示
    const errors = report.issues.filter((i) => i.severity === SEVERITY.ERROR);
    if (errors.length > 0) {
      lines.push('');
      lines.push('[エラー]');
      for (const issue of errors) {
        lines.push(`  - ${issue.message}`);
        if (issue.elementId) {
          lines.push(`    要素: ${issue.elementType} (ID: ${issue.elementId})`);
        }
        if (issue.idXPath || issue.xpath) {
          lines.push(`    XPath: ${issue.idXPath || issue.xpath}`);
        }
        if (issue.repairable && issue.repairSuggestion) {
          lines.push(`    修復提案: ${issue.repairSuggestion}`);
        }
      }
    }

    // 警告
    const warnings = report.issues.filter((i) => i.severity === SEVERITY.WARNING);
    if (warnings.length > 0) {
      lines.push('');
      lines.push('[警告]');
      for (const issue of warnings) {
        lines.push(`  - ${issue.message}`);
        if (issue.elementId) {
          lines.push(`    要素: ${issue.elementType} (ID: ${issue.elementId})`);
        }
        if (issue.idXPath || issue.xpath) {
          lines.push(`    XPath: ${issue.idXPath || issue.xpath}`);
        }
      }
    }

    // 情報
    const infos = report.issues.filter((i) => i.severity === SEVERITY.INFO);
    if (infos.length > 0) {
      lines.push('');
      lines.push('[情報]');
      for (const issue of infos) {
        lines.push(`  - ${issue.message}`);
        if (issue.idXPath || issue.xpath) {
          lines.push(`    XPath: ${issue.idXPath || issue.xpath}`);
        }
      }
    }
  } else {
    lines.push('問題は検出されませんでした。');
  }

  lines.push('');
  lines.push('='.repeat(60));

  return lines.join('\n');
}

/**
 * 修復可能な問題のみを抽出
 *
 * @param {ValidationReport} report - バリデーションレポート
 * @returns {ValidationIssue[]} 修復可能な問題の配列
 */
export function getRepairableIssues(report) {
  return report.issues.filter((issue) => issue.repairable);
}

/**
 * 特定のカテゴリの問題を抽出
 *
 * @param {ValidationReport} report - バリデーションレポート
 * @param {string} category - カテゴリ
 * @returns {ValidationIssue[]} 該当する問題の配列
 */
export function getIssuesByCategory(report, category) {
  return report.issues.filter((issue) => issue.category === category);
}

/**
 * 特定の要素タイプの問題を抽出
 *
 * @param {ValidationReport} report - バリデーションレポート
 * @param {string} elementType - 要素タイプ
 * @returns {ValidationIssue[]} 該当する問題の配列
 */
export function getIssuesByElementType(report, elementType) {
  return report.issues.filter((issue) => issue.elementType === elementType);
}

/**
 * コンソールにバリデーションサマリーを表示
 *
 * @param {Object} report - バリデーションレポート
 */
export function logValidationSummary(report) {
  logger.info('--- ST-Bridge Validation Summary ---');
  logger.info(`Valid: ${report.valid ? 'Yes' : 'No'}`);
  logger.info(`Errors: ${report.statistics.errorCount}`);
  logger.info(`Warnings: ${report.statistics.warningCount}`);
  logger.info(`Repairable: ${report.statistics.repairableCount}`);
  logger.info(`Total Elements: ${report.statistics.totalElements}`);

  if (report.statistics.errorCount > 0) {
    logger.info('\nTop Errors:');
    report.issues
      .filter((i) => i.severity === 'error')
      .slice(0, 5)
      .forEach((issue) => {
        logger.info(`  - ${issue.message}`);
      });
  }
}

/**
 * 簡易バリデーション (デフォルトオプション付き)
 * @param {Document} xmlDoc
 * @param {Object} options
 * @returns {Object}
 */
export function quickValidate(xmlDoc, options = {}) {
  return validateStbDocument(xmlDoc, {
    validateReferences: true,
    validateGeometry: true,
    ...options,
  });
}

/**
 * XMLドキュメントからSTBバージョンを検出
 * @param {Document} xmlDoc - XMLドキュメント
 * @returns {string} バージョン文字列（デフォルト: アクティブバージョンまたは '2.0.2'）
 */
function detectStbVersion(xmlDoc) {
  const root = xmlDoc.documentElement;
  if (!root) return getActiveVersion() || '2.0.2';

  const version = root.getAttribute('version');
  if (version) {
    // '2.1.0' や '2.0.2' にマッピング
    if (version.startsWith('2.1')) return '2.1.0';
    if (version.startsWith('2.0')) return '2.0.2';
  }

  return getActiveVersion() || '2.0.2';
}

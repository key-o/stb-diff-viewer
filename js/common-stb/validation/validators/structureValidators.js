/**
 * @fileoverview ST-Bridge 構造・基礎データバリデータ
 *
 * stbValidator.js から分割。必須要素・ノード・階・軸の検証を担当。
 * 各関数は共有の issues 配列に検出結果を push する。
 */

import { parseElements } from '../../import/parser/stbXmlParser.js';
import { STB_TAG_NAMES } from '../../../constants/elementTypes.js';
import { SEVERITY, CATEGORY } from '../validationConstants.js';

/**
 * 構造検証 - 必須要素の存在チェック
 */
export function validateStructure(xmlDoc, issues) {
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
  const requiredElements = [STB_TAG_NAMES.COMMON, STB_TAG_NAMES.MODEL];
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
  const nodes = parseElements(xmlDoc, STB_TAG_NAMES.NODE);
  if (nodes.length === 0) {
    issues.push({
      severity: SEVERITY.ERROR,
      category: CATEGORY.STRUCTURE,
      message: 'StbNode要素が存在しません。構造モデルにノードが必要です',
      elementType: STB_TAG_NAMES.NODES,
      elementId: '',
      repairable: false,
    });
  }
}

/**
 * ノード検証
 */
export function validateNodes(xmlDoc, nodeMap, issues, statistics) {
  const nodes = parseElements(xmlDoc, STB_TAG_NAMES.NODE);
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
        elementType: STB_TAG_NAMES.NODE,
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
          elementType: STB_TAG_NAMES.NODE,
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
          elementType: STB_TAG_NAMES.NODE,
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
          elementType: STB_TAG_NAMES.NODE,
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
          elementType: STB_TAG_NAMES.NODE,
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
export function validateStories(stories, issues) {
  const seenHeights = new Map();

  for (const story of stories) {
    // 高さの重複チェック
    if (seenHeights.has(story.height)) {
      issues.push({
        severity: SEVERITY.WARNING,
        category: CATEGORY.DUPLICATE,
        message: `階 "${story.name}" の高さ ${story.height}mm が "${seenHeights.get(story.height)}" と重複しています`,
        elementType: STB_TAG_NAMES.STORY,
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
        elementType: STB_TAG_NAMES.STORY,
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
export function validateAxes(axesData, issues) {
  const validateAxisGroup = (axes, groupName) => {
    const seenDistances = new Map();

    for (const axis of axes) {
      // 距離の重複チェック
      if (seenDistances.has(axis.distance)) {
        issues.push({
          severity: SEVERITY.WARNING,
          category: CATEGORY.DUPLICATE,
          message: `${groupName}軸 "${axis.name}" の距離 ${axis.distance}mm が "${seenDistances.get(axis.distance)}" と重複しています`,
          elementType: STB_TAG_NAMES.PARALLEL_AXIS,
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
          elementType: STB_TAG_NAMES.PARALLEL_AXIS,
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

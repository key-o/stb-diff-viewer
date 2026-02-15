/**
 * @fileoverview 比較レポート用データ収集モジュール
 *
 * globalStateとeventBusから比較結果を取得し、
 * レポート生成に必要なデータ構造に整形します。
 *
 * @module export/report/reportDataCollector
 */

import { getState } from '../../app/globalState.js';
import { ELEMENT_LABELS } from '../../config/elementLabels.js';

/**
 * @typedef {Object} ElementTypeStats
 * @property {number} matched - 一致要素数
 * @property {number} onlyA - モデルAのみの要素数
 * @property {number} onlyB - モデルBのみの要素数
 * @property {number} total - 合計要素数
 */

/**
 * @typedef {Object} AttributeDiff
 * @property {string} attrName - 属性名（XML属性名）
 * @property {string} label - 属性の日本語ラベル
 * @property {string|null} valueA - モデルAの値
 * @property {string|null} valueB - モデルBの値
 * @property {boolean} isDifferent - 値が異なるか
 */

/**
 * @typedef {Object} DiffElement
 * @property {string} elementType - 要素タイプ（STB形式）
 * @property {string} displayType - 要素タイプ表示名
 * @property {string} id - 要素ID
 * @property {string} [name] - 要素名
 * @property {string} [guid] - GUID
 * @property {Object.<string, string>} [attributes] - 全XML属性
 */

/**
 * @typedef {Object} ReportData
 * @property {Object} meta - メタデータ
 * @property {Object} summary - サマリ統計
 * @property {Object.<string, ElementTypeStats>} elementTypeStats - 要素種別統計
 * @property {DiffElement[]} onlyAElements - モデルAのみの要素一覧
 * @property {DiffElement[]} onlyBElements - モデルBのみの要素一覧
 * @property {Array} mismatchElements - 属性不一致要素一覧
 */

/**
 * レポート用構造属性リスト（attributeComparator.jsのSTRUCTURAL_ATTRIBUTESと同期）
 * @type {string[]}
 */
const REPORT_STRUCTURAL_ATTRIBUTES = [
  'id_sec',
  'kind',
  'rotate',
  'offset_X',
  'offset_Y',
  'offset_Z',
  'level_top',
  'level_bottom',
  'condition_bottom',
  'condition_top',
  'joint_bottom',
  'joint_top',
  'haunch_H',
  'haunch_start',
  'haunch_end',
];

/**
 * 構造属性の日本語ラベル
 * @type {Object.<string, string>}
 */
const ATTRIBUTE_LABELS = {
  id_sec: '断面ID',
  kind: '種別',
  rotate: '回転角',
  offset_X: 'Xオフセット',
  offset_Y: 'Yオフセット',
  offset_Z: 'Zオフセット',
  level_top: '上端レベル',
  level_bottom: '下端レベル',
  condition_bottom: '下端条件',
  condition_top: '上端条件',
  joint_bottom: '下端接合',
  joint_top: '上端接合',
  haunch_H: 'ハンチ高さ',
  haunch_start: 'ハンチ始端',
  haunch_end: 'ハンチ終端',
};

/** 数値比較の精度閾値 */
const NUMERIC_TOLERANCE = 0.001;

/**
 * 要素からプロパティ値を取得する（XML DOM/JSオブジェクト両対応）
 * @param {Element|Object} element - 要素
 * @param {string} attrName - 属性名
 * @returns {string|undefined} 属性値（文字列）
 */
function getElementProperty(element, attrName) {
  if (!element) return undefined;
  if (typeof element.getAttribute === 'function') {
    const val = element.getAttribute(attrName);
    return val === null ? undefined : val;
  }
  const val = element[attrName];
  return val !== undefined && val !== null ? String(val) : undefined;
}

/**
 * 要素から全属性を抽出する（XML DOM/JSオブジェクト両対応）
 * @param {Element|Object} element - 要素
 * @returns {Object.<string, string>} 属性名→値のマップ
 */
function extractAllAttributes(element) {
  const attrs = {};
  if (!element) return attrs;

  if (element.attributes && typeof element.attributes.length === 'number') {
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      if (attr.name.startsWith('xmlns')) continue;
      attrs[attr.name] = attr.value;
    }
  } else if (typeof element === 'object') {
    for (const [key, value] of Object.entries(element)) {
      if (
        value !== null &&
        value !== undefined &&
        typeof value !== 'object' &&
        typeof value !== 'function'
      ) {
        attrs[key] = String(value);
      }
    }
  }
  return attrs;
}

/**
 * 2つの要素の構造属性を詳細に比較する
 * @param {Element|Object} elementA - モデルAの要素
 * @param {Element|Object} elementB - モデルBの要素
 * @returns {AttributeDiff[]} 属性差分一覧
 */
function compareAttributeDetails(elementA, elementB) {
  const diffs = [];
  for (const attr of REPORT_STRUCTURAL_ATTRIBUTES) {
    const valueA = getElementProperty(elementA, attr);
    const valueB = getElementProperty(elementB, attr);

    if (valueA === undefined && valueB === undefined) continue;

    let isDifferent = false;
    if (valueA === undefined || valueB === undefined) {
      isDifferent = true;
    } else {
      const numA = Number(valueA);
      const numB = Number(valueB);
      if (!isNaN(numA) && !isNaN(numB)) {
        isDifferent = Math.abs(numA - numB) > NUMERIC_TOLERANCE;
      } else {
        isDifferent = String(valueA) !== String(valueB);
      }
    }

    diffs.push({
      attrName: attr,
      label: ATTRIBUTE_LABELS[attr] || attr,
      valueA: valueA ?? null,
      valueB: valueB ?? null,
      isDifferent,
    });
  }
  return diffs;
}

/**
 * 比較結果からレポート用データを収集する
 * @param {Object} comparisonResults - 比較結果オブジェクト
 * @returns {ReportData} レポート用データ
 */
export function collectReportData(comparisonResults) {
  const meta = collectMetaData();
  const { summary, elementTypeStats } = calculateStatistics(comparisonResults);
  const onlyAElements = collectDiffElements(comparisonResults, 'onlyA');
  const onlyBElements = collectDiffElements(comparisonResults, 'onlyB');
  const mismatchElements = collectMismatchElements(comparisonResults);

  return {
    meta,
    summary,
    elementTypeStats,
    onlyAElements,
    onlyBElements,
    mismatchElements,
  };
}

/**
 * モデルのメタデータを収集する
 * @returns {Object} メタデータ
 */
function collectMetaData() {
  const fileA = getState('files.originalFileA');
  const fileB = getState('files.originalFileB');
  const versionA = getState('models.stbVersionA');
  const versionB = getState('models.stbVersionB');

  return {
    fileNameA: fileA?.name || 'Model A',
    fileNameB: fileB?.name || 'Model B',
    fileSizeA: fileA?.size || null,
    fileSizeB: fileB?.size || null,
    stbVersionA: versionA || 'unknown',
    stbVersionB: versionB || 'unknown',
    isCrossVersion: versionA && versionB && versionA !== versionB,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * 比較結果から統計データを計算する
 * @param {Object} comparisonResults - 比較結果
 * @returns {{summary: Object, elementTypeStats: Object}}
 */
function calculateStatistics(comparisonResults) {
  const summary = {
    totalElements: 0,
    totalMatched: 0,
    totalOnlyA: 0,
    totalOnlyB: 0,
    totalMismatch: 0,
  };

  const elementTypeStats = {};

  for (const [elementType, result] of Object.entries(comparisonResults)) {
    if (!result || typeof result !== 'object') continue;

    const matched = result.matched?.length || 0;
    const onlyA = result.onlyA?.length || 0;
    const onlyB = result.onlyB?.length || 0;
    const mismatch = result.mismatch?.length || 0;
    const total = matched + onlyA + onlyB;

    if (total === 0) continue;

    elementTypeStats[elementType] = {
      displayName: ELEMENT_LABELS[elementType] || elementType,
      matched,
      onlyA,
      onlyB,
      mismatch,
      total,
    };

    summary.totalElements += total;
    summary.totalMatched += matched;
    summary.totalOnlyA += onlyA;
    summary.totalOnlyB += onlyB;
    summary.totalMismatch += mismatch;
  }

  return { summary, elementTypeStats };
}

/**
 * 差分要素の一覧を収集する（全XML属性付き）
 * @param {Object} comparisonResults - 比較結果
 * @param {'onlyA'|'onlyB'} category - カテゴリ
 * @returns {DiffElement[]} 差分要素一覧
 */
function collectDiffElements(comparisonResults, category) {
  const elements = [];

  for (const [elementType, result] of Object.entries(comparisonResults)) {
    if (!result?.[category]) continue;

    for (const elem of result[category]) {
      const rawElement = elem.element || elem;
      elements.push({
        elementType,
        displayType: ELEMENT_LABELS[elementType] || elementType,
        id: elem.id || getElementProperty(rawElement, 'id') || '-',
        name: elem.name || getElementProperty(rawElement, 'name') || '',
        guid: elem.guid || getElementProperty(rawElement, 'guid') || '',
        attributes: extractAllAttributes(rawElement),
      });
    }
  }

  return elements;
}

/**
 * 属性不一致要素の一覧を収集する（属性差分詳細付き）
 * @param {Object} comparisonResults - 比較結果
 * @returns {Array} 属性不一致要素一覧
 */
function collectMismatchElements(comparisonResults) {
  const elements = [];

  for (const [elementType, result] of Object.entries(comparisonResults)) {
    if (!result?.mismatch) continue;

    for (const pair of result.mismatch) {
      const dataA = pair.dataA || {};
      const dataB = pair.dataB || {};
      const elementA = dataA.element || dataA;
      const elementB = dataB.element || dataB;

      const attributeDiffs = compareAttributeDetails(elementA, elementB);
      const diffCount = attributeDiffs.filter((d) => d.isDifferent).length;

      elements.push({
        elementType,
        displayType: ELEMENT_LABELS[elementType] || elementType,
        idA: dataA.id || getElementProperty(elementA, 'id') || '-',
        idB: dataB.id || getElementProperty(elementB, 'id') || '-',
        nameA: dataA.name || getElementProperty(elementA, 'name') || '',
        nameB: dataB.name || getElementProperty(elementB, 'name') || '',
        attributeDiffs,
        diffCount,
      });
    }
  }

  return elements;
}

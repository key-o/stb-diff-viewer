/**
 * @fileoverview 比較レンダリング用ユーティリティ関数
 *
 * 属性の差分判定、XPath構築、バリデーション状態マップの構築など、
 * 比較テーブルのレンダリングで使用する共通ヘルパーを提供します。
 */

import { getElementValidation } from '../../../common-stb/validation/validationManager.js';
import { getToleranceConfig } from '../../../config/toleranceConfig.js';

/**
 * 属性値が「異なる」かどうかを判定する。
 * 両方が数値として解釈できる場合は toleranceConfig.attributeNumericTolerance を適用し、
 * "0" と "0.0" や "150" と "150.0" を同一とみなす。
 * @param {string|number|null|undefined} valA
 * @param {string|number|null|undefined} valB
 * @returns {boolean}
 */
export function attributesDiffer(valA, valB) {
  const numA = Number(valA);
  const numB = Number(valB);
  if (isFinite(numA) && isFinite(numB)) {
    const tolerance = getToleranceConfig().attributeNumericTolerance ?? 0.001;
    return Math.abs(numA - numB) > tolerance;
  }
  return String(valA) !== String(valB);
}

/**
 * XML要素からXPath形式のパスを構築する。
 * 要素の親チェーンを辿ることで、ネストされた断面子要素でも
 * 重要度設定と一致する正確なパスを生成する。
 * @param {Element} xmlElement - XML要素ノード
 * @returns {string|null} XPath形式のパス（構築できない場合はnull）
 */
export function buildXPathFromXmlElement(xmlElement) {
  if (!xmlElement || !xmlElement.tagName) return null;
  const parts = [];
  let current = xmlElement;
  while (current && current.tagName) {
    parts.unshift(current.tagName);
    current = current.parentElement;
  }
  return '//' + parts.join('/');
}

/**
 * 属性名の比較用に正規化
 * @param {string} attributeName
 * @returns {string}
 */
export function normalizeAttributeName(attributeName) {
  return typeof attributeName === 'string' ? attributeName.toLowerCase() : '';
}

/**
 * 要素名を比較用に正規化（名前空間除去 + 小文字化）
 * @param {string} elementName
 * @returns {string}
 */
export function normalizeElementName(elementName) {
  if (typeof elementName !== 'string') return '';
  const noPrefix = elementName.includes(':') ? elementName.split(':').pop() : elementName;
  return noPrefix ? noPrefix.toLowerCase() : '';
}

/**
 * title属性向けの最小HTMLエスケープ
 * @param {string} value
 * @returns {string}
 */
export function escapeHtmlAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 要素IDに紐づく属性別バリデーション結果を取得
 * @param {string} elementId
 * @param {{targetElementName?: string}} [options]
 * @returns {Map<string, {status: string, messages: string[]}>}
 */
export function buildAttributeValidationStatusMap(elementId, options = {}) {
  const result = new Map();
  const { targetElementName = '' } = options;
  const normalizedTargetElement = normalizeElementName(targetElementName);

  if (!elementId) return result;

  const validation = getElementValidation(elementId, {
    targetElementName: targetElementName || undefined,
  });
  if (!validation) return result;

  const mergeIssue = (issue, severity) => {
    if (normalizedTargetElement) {
      const issueElementName = normalizeElementName(issue?.elementType);
      if (issueElementName && issueElementName !== normalizedTargetElement) {
        return;
      }
    }

    const attrKey = normalizeAttributeName(issue?.attribute);
    if (!attrKey) return;

    const existing = result.get(attrKey);
    const currentStatus = existing?.status;
    const nextStatus = currentStatus === 'error' || severity === 'error' ? 'error' : 'warning';
    const messages = existing?.messages ?? [];

    if (issue?.message && !messages.includes(issue.message)) {
      messages.push(issue.message);
    }

    result.set(attrKey, { status: nextStatus, messages });
  };

  for (const error of validation.errors || []) {
    mergeIssue(error, 'error');
  }
  for (const warning of validation.warnings || []) {
    mergeIssue(warning, 'warning');
  }

  return result;
}

/**
 * 属性名に対応するセルの装飾情報を取得
 * @param {string} attrName
 * @param {Map<string, {status: string, messages: string[]}>} validationMap
 * @returns {{className: string, titleAttr: string}}
 */
export function getValidationCellMeta(attrName, validationMap) {
  const attrKey = normalizeAttributeName(attrName);
  const validation = attrKey ? validationMap.get(attrKey) : null;

  if (!validation) {
    return { className: '', titleAttr: '' };
  }

  const className = validation.status === 'error' ? 'validation-error' : 'validation-warning';
  const title = validation.messages?.length
    ? ` title="${escapeHtmlAttribute(validation.messages.join('\n'))}"`
    : '';

  return { className, titleAttr: title };
}

/**
 * td用class属性文字列を生成
 * @param {...string} classNames
 * @returns {string}
 */
export function buildCellClassAttr(...classNames) {
  const filtered = classNames.filter(Boolean);
  return filtered.length > 0 ? ` class="${filtered.join(' ')}"` : '';
}

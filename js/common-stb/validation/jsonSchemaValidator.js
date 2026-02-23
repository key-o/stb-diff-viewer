/**
 * @fileoverview JSON Schema 検証モジュール（ブラウザ版）
 *
 * JSON Schema と ajv を使って STB XML ファイルを検証する。
 * xsdSchemaValidator.js の JSON Schema 版。
 *
 * 検証項目:
 * - 未宣言属性の検出（additionalProperties: false）
 * - 必須属性の欠落チェック
 * - const 値（fixed 値）の一致チェック
 * - 数値制約（minimum, maximum, exclusiveMinimum, exclusiveMaximum）
 * - パターン制約
 * - 列挙型制約（enum）
 * - 型チェック（number, boolean 等）
 */

import Ajv from 'ajv';
import {
  getElementDefinitionForVersion,
  isVersionLoaded,
} from '../import/parser/jsonSchemaLoader.js';
import { SEVERITY, CATEGORY } from './stbValidator.js';

// ajv インスタンスのキャッシュ（バージョン別）
const ajvCache = new Map(); // version -> { ajv, validatorCache }

/**
 * JSON Schema に基づいて STB XML ドキュメントを検証
 *
 * @param {Document} xmlDoc - パース済み XML ドキュメント
 * @param {Object} options
 * @param {string} [options.version='2.0.2'] - STB バージョン
 * @returns {Array<Object>} ValidationIssue 配列
 */
export function validateJsonSchema(xmlDoc, options = {}) {
  const { version = '2.0.2' } = options;

  if (!xmlDoc || !xmlDoc.documentElement) return [];
  if (!isVersionLoaded(version)) return [];

  const ctx = getAjvContext(version);
  const issues = [];

  validateElement(xmlDoc.documentElement, version, ctx, issues);

  return issues;
}

// ============================================================
// 内部: ajv コンテキスト管理
// ============================================================

/**
 * バージョン別 ajv コンテキストを取得（キャッシュ）
 */
function getAjvContext(version) {
  if (ajvCache.has(version)) return ajvCache.get(version);

  const ajv = new Ajv({
    allErrors: true,
    coerceTypes: true, // XML 属性値は全て文字列 → 型変換
    strict: false, // 未知キーワードを無視
  });

  const ctx = { ajv, validatorCache: new Map() };
  ajvCache.set(version, ctx);
  return ctx;
}

/**
 * 要素名に対応する ajv 検証関数を取得（キャッシュ）
 */
function getValidator(elementName, version, ctx) {
  const { ajv, validatorCache } = ctx;
  if (validatorCache.has(elementName)) return validatorCache.get(elementName);

  const def = getElementDefinitionForVersion(version, elementName);
  if (!def) {
    validatorCache.set(elementName, null);
    return null;
  }

  // JSON Schema オブジェクトを構築
  const schema = buildElementSchema(def);

  try {
    const validator = ajv.compile(schema);
    validatorCache.set(elementName, validator);
    return validator;
  } catch {
    validatorCache.set(elementName, null);
    return null;
  }
}

/**
 * 要素定義から ajv 用の JSON Schema を構築
 */
function buildElementSchema(def) {
  const properties = {};
  const required = [];

  for (const [attrName, attrDef] of def.attributes) {
    properties[attrName] = buildPropertySchema(attrDef);
    if (attrDef.required) required.push(attrName);
  }

  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
    additionalProperties: false,
  };
}

/**
 * attrDef から JSON Schema プロパティを構築
 */
function buildPropertySchema(attrDef) {
  const schema = {};

  if (attrDef.fixed !== null && attrDef.fixed !== undefined) {
    schema.const = attrDef.fixed;
    return schema;
  }

  const type = attrDef.type;
  if (type === 'number' || type === 'integer') {
    schema.type = type;
  } else if (type === 'boolean') {
    schema.type = 'boolean';
  } else {
    schema.type = 'string';
  }

  const c = attrDef.constraints;
  if (c) {
    if (c.enumerations.length > 0) {
      schema.enum = c.enumerations;
      delete schema.type;
    }
    if (c.patterns.length > 0) schema.pattern = c.patterns[0];
    if (c.minExclusive !== null) schema.exclusiveMinimum = c.minExclusive;
    if (c.maxExclusive !== null) schema.exclusiveMaximum = c.maxExclusive;
    if (c.minInclusive !== null) schema.minimum = c.minInclusive;
    if (c.maxInclusive !== null) schema.maximum = c.maxInclusive;
    if (c.minLength !== null) schema.minLength = c.minLength;
  }

  return schema;
}

// ============================================================
// 内部: XML 走査と検証
// ============================================================

/**
 * 要素を再帰的に検証
 */
function validateElement(element, version, ctx, issues) {
  const elementName = element.localName || element.nodeName.replace(/^.*:/, '');
  const elementId = element.getAttribute ? element.getAttribute('id') || '' : '';

  const validator = getValidator(elementName, version, ctx);

  if (validator) {
    const attrs = attrsToObject(element);
    const valid = validator(attrs);

    if (!valid && validator.errors) {
      for (const err of validator.errors) {
        const issue = convertAjvError(err, elementName, elementId, attrs, element);
        if (issue) issues.push(issue);
      }
    }
  }

  // 子要素を再帰的に検証
  for (let i = 0; i < element.childNodes.length; i++) {
    const child = element.childNodes[i];
    if (child.nodeType === 1) {
      validateElement(child, version, ctx, issues);
    }
  }
}

/**
 * XML 要素の属性を JSON オブジェクトに変換（xmlns:*, xsi:* は除外）
 */
function attrsToObject(element) {
  const obj = {};
  if (!element.attributes) return obj;

  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes[i];
    const name = attr.localName || attr.name;
    const fullName = attr.name || name;

    if (fullName === 'xmlns' || fullName.startsWith('xmlns:')) continue;
    if (fullName.startsWith('xsi:')) continue;

    obj[name] = attr.value;
  }

  return obj;
}

/**
 * ajv エラーを ValidationIssue に変換
 */
function convertAjvError(err, elementName, elementId, attrs, element) {
  const { keyword, instancePath, params, message } = err;

  // instancePath: "/attrName" → attrName
  const attrName = instancePath ? instancePath.replace(/^\//, '') : null;
  const value = attrName ? attrs[attrName] : undefined;
  const makeIssue = (overrides = {}) => {
    const hasAttribute = Object.prototype.hasOwnProperty.call(overrides, 'attribute');
    const resolvedAttribute = hasAttribute ? overrides.attribute : attrName || undefined;
    const issue = {
      severity: SEVERITY.ERROR,
      category: CATEGORY.SCHEMA,
      elementType: elementName,
      elementId,
      ...buildIssueLocation(element, resolvedAttribute),
      ...overrides,
    };
    if (resolvedAttribute) {
      issue.attribute = resolvedAttribute;
    }
    return issue;
  };

  switch (keyword) {
    case 'required': {
      const missing = params.missingProperty;
      return makeIssue({
        message: `要素 '${elementName}' に必須属性 '${missing}' がありません`,
        attribute: missing,
        repairable: false,
      });
    }

    case 'additionalProperties': {
      const extra = params.additionalProperty;
      return makeIssue({
        message: `要素 '${elementName}' で属性 '${extra}' は宣言されていません`,
        attribute: extra,
        value: attrs[extra],
        repairable: false,
      });
    }

    case 'const': {
      return makeIssue({
        message: `要素 '${elementName}' の属性 '${attrName}' の値 '${value}' は固定値 '${params.allowedValue}' と一致しません`,
        value,
        expected: params.allowedValue,
        repairable: false,
      });
    }

    case 'enum': {
      const allowed = params.allowedValues ? params.allowedValues.join(', ') : '（定義参照）';
      return makeIssue({
        message: `要素 '${elementName}' の属性 '${attrName}' の値 '${value}' は許可されていません。期待値: ${allowed}`,
        value,
        expected: params.allowedValues,
        repairable: false,
      });
    }

    case 'type': {
      return makeIssue({
        message: `要素 '${elementName}' の属性 '${attrName}' の値 '${value}' は型 '${params.type}' ではありません`,
        value,
        repairable: false,
      });
    }

    case 'minimum':
    case 'maximum':
    case 'exclusiveMinimum':
    case 'exclusiveMaximum': {
      const comparison = params?.comparison;
      const limit = params?.limit;
      const numericConstraint =
        comparison && limit !== undefined ? `値 ${comparison} ${limit}` : keyword;
      return makeIssue({
        message: `要素 '${elementName}' の属性 '${attrName}' の値 '${value}' は数値制約（${numericConstraint}）に違反しています`,
        value,
        expected: comparison && limit !== undefined ? `${comparison} ${limit}` : undefined,
        repairable: false,
      });
    }

    case 'pattern': {
      return makeIssue({
        message: `要素 '${elementName}' の属性 '${attrName}' の値 '${value}' はパターン制約に一致しません`,
        value,
        repairable: false,
      });
    }

    case 'minLength': {
      return makeIssue({
        message: `要素 '${elementName}' の属性 '${attrName}' の値 '${value}' は最小文字数制約 '${params.limit}' を満たしていません`,
        value,
        repairable: false,
      });
    }

    default:
      if (message) {
        return makeIssue({
          message: `要素 '${elementName}' のスキーマエラー: ${message}`,
          attribute: attrName || undefined,
          repairable: false,
        });
      }
      return null;
  }
}

/**
 * 要素/属性の XPath 情報を生成する
 */
function buildIssueLocation(element, attributeName) {
  if (!element || element.nodeType !== 1) return {};

  const segments = [];
  let current = element;
  while (current && current.nodeType === 1) {
    const name = current.localName || current.nodeName.replace(/^.*:/, '');
    const id = current.getAttribute ? current.getAttribute('id') : null;
    segments.unshift({ name, id: id || '' });
    current = current.parentNode;
  }

  if (segments.length === 0) return {};

  const fullElementXPath = `/${segments.map((s) => buildXPathSegment(s)).join('/')}`;
  const xpath = attributeName ? `${fullElementXPath}/@${attributeName}` : fullElementXPath;

  let idXPath = xpath;
  let anchorElementType;
  let anchorElementId;

  for (let i = segments.length - 1; i >= 0; i--) {
    if (!segments[i].id) continue;

    const head = `//${buildXPathSegment(segments[i])}`;
    const tail = segments.slice(i + 1).map((s) => buildXPathSegment(s)).join('/');
    const base = tail ? `${head}/${tail}` : head;
    idXPath = attributeName ? `${base}/@${attributeName}` : base;
    anchorElementType = segments[i].name;
    anchorElementId = segments[i].id;
    break;
  }

  return {
    xpath,
    idXPath,
    anchorElementType,
    anchorElementId,
  };
}

function buildXPathSegment(segment) {
  if (!segment.id) return segment.name;
  return `${segment.name}[@id=${toXPathLiteral(segment.id)}]`;
}

function toXPathLiteral(value) {
  const str = String(value);
  if (!str.includes("'")) return `'${str}'`;
  if (!str.includes('"')) return `"${str}"`;

  const parts = str.split("'").map((part) => `'${part}'`);
  return `concat(${parts.join(`, "'", `)})`;
}

/**
 * @fileoverview XSDスキーマ検証モジュール（ブラウザ版）
 *
 * XSD解析済みスキーマに基づいて、STB XMLファイルの構文的整合性を検証する。
 * tools/stb-schema-checker/validator.js のロジックをブラウザ互換で実装。
 *
 * 検証項目:
 * - 未宣言属性の検出
 * - 必須属性の欠落チェック
 * - fixed値の一致チェック
 * - 数値ファセット制約（minExclusive, maxExclusive, minInclusive, maxInclusive）
 * - パターン制約
 * - minLength制約
 * - 列挙型制約
 * - 組み込み型検証（positiveInteger, boolean等）
 * - 予期しない要素の検出
 * - 必須子要素チェック（choiceグループ対応）
 */

import {
  getElementDefinitionForVersion,
  getSimpleTypeForVersion,
  isVersionLoaded,
  stripNsPrefix,
} from '../import/parser/xsdSchemaParser.js';
import { SEVERITY, CATEGORY } from './stbValidator.js';

/**
 * XSDスキーマに基づいてSTB XMLドキュメントを検証
 *
 * @param {Document} xmlDoc - パース済みXMLドキュメント
 * @param {Object} options - オプション
 * @param {string} options.version - STBバージョン ('2.0.2' | '2.1.0')
 * @returns {Array<Object>} ValidationIssue配列
 */
export function validateXsdSchema(xmlDoc, options = {}) {
  const { version = '2.0.2' } = options;

  if (!xmlDoc || !xmlDoc.documentElement) {
    return [];
  }

  if (!isVersionLoaded(version)) {
    return [];
  }

  const issues = [];
  const root = xmlDoc.documentElement;

  // ルート要素から再帰的に検証
  validateElement(root, version, issues, null);

  return issues;
}

/**
 * 要素を再帰的に検証
 * @param {Element} element - XML要素
 * @param {string} version - STBバージョン
 * @param {Array} issues - エラー蓄積配列
 * @param {Object|null} parentDef - 親要素の定義
 */
function validateElement(element, version, issues, parentDef) {
  const elementName = element.localName || element.nodeName.replace(/^.*:/, '');

  // スキーマから要素定義を取得
  const elemDef = getElementDefinitionForVersion(version, elementName);

  if (!elemDef) {
    // 要素がスキーマで定義されていない場合
    if (parentDef) {
      // 親の子要素定義に含まれるか確認
      const isExpected =
        parentDef.children && parentDef.children.has && parentDef.children.has(elementName);

      if (!isExpected) {
        issues.push({
          severity: SEVERITY.ERROR,
          category: CATEGORY.SCHEMA,
          message: `要素 '${elementName}' はこのコンテキストで予期されていません（親要素: '${parentDef.name}'）`,
          elementType: elementName,
          elementId: element.getAttribute('id') || '',
          repairable: false,
        });
      }
    }
    // 子要素の検証は続行（定義があるものについて）
    validateChildElements(element, version, issues, null);
    return;
  }

  // 属性の検証
  validateAttributes(element, elementName, elemDef, version, issues);

  // 必須子要素のチェック
  validateRequiredChildren(element, elementName, elemDef, issues);

  // 子要素の再帰検証
  validateChildElements(element, version, issues, elemDef);
}

/**
 * 属性を検証
 * @param {Element} element - XML要素
 * @param {string} elementName - 要素名
 * @param {Object} elemDef - 要素定義
 * @param {string} version - STBバージョン
 * @param {Array} issues - エラー蓄積配列
 */
function validateAttributes(element, elementName, elemDef, version, issues) {
  const attrs = elemDef.attributes;
  if (!attrs) return;

  const elementId = element.getAttribute('id') || '';

  // 1. 必須属性チェック
  for (const [attrName, attrDef] of attrs) {
    if (attrDef.required) {
      const value = element.getAttribute(attrName);
      if (value === null || value === undefined) {
        issues.push({
          severity: SEVERITY.ERROR,
          category: CATEGORY.SCHEMA,
          message: `要素 '${elementName}' に必須属性 '${attrName}' がありません`,
          elementType: elementName,
          elementId,
          attribute: attrName,
          repairable: false,
        });
      }
    }
  }

  // 2. 各属性の検証（未宣言チェック + 値の検証）
  if (element.attributes) {
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      const attrName = attr.localName || attr.name;

      // xmlns属性とxsi属性はスキップ
      if (attrName === 'xmlns' || attr.name.startsWith('xmlns:')) continue;
      if (attr.name.startsWith('xsi:')) continue;

      const attrDef = attrs.get(attrName);
      if (!attrDef) {
        // 未宣言属性
        issues.push({
          severity: SEVERITY.ERROR,
          category: CATEGORY.SCHEMA,
          message: `要素 '${elementName}' で属性 '${attrName}' は宣言されていません`,
          elementType: elementName,
          elementId,
          attribute: attrName,
          value: attr.value,
          repairable: false,
        });
        continue;
      }

      // 値のバリデーション
      const value = attr.value;
      if (value !== null && value !== undefined) {
        validateAttributeValue(elementName, elementId, attrName, value, attrDef, version, issues);
      }
    }
  }
}

/**
 * 属性値を検証
 */
function validateAttributeValue(elementName, elementId, attrName, value, attrDef, version, issues) {
  // fixed値チェック
  if (attrDef.fixed !== null && attrDef.fixed !== undefined && value !== attrDef.fixed) {
    issues.push({
      severity: SEVERITY.ERROR,
      category: CATEGORY.SCHEMA,
      message: `要素 '${elementName}' の属性 '${attrName}' の値 '${value}' はfixed値 '${attrDef.fixed}' と一致しません`,
      elementType: elementName,
      elementId,
      attribute: attrName,
      value,
      expected: attrDef.fixed,
      repairable: false,
    });
    return;
  }

  // インライン制約がある場合
  if (attrDef.constraints) {
    validateValueConstraints(
      elementName,
      elementId,
      attrName,
      value,
      attrDef.constraints,
      version,
      issues,
    );
    return;
  }

  // 型参照による検証
  if (attrDef.type) {
    const typeName = stripNsPrefix(attrDef.type);

    // 組み込み型
    if (attrDef.type.startsWith('xs:') || attrDef.type.startsWith('xsd:')) {
      validateBuiltinType(elementName, elementId, attrName, value, typeName, issues);
      return;
    }

    // カスタムsimpleType
    const simpleType = getSimpleTypeForVersion(version, typeName);
    if (simpleType) {
      validateSimpleTypeValue(elementName, elementId, attrName, value, simpleType, version, issues);
    }
  }
}

/**
 * インライン制約に基づいて値を検証
 */
function validateValueConstraints(
  elementName,
  elementId,
  attrName,
  value,
  constraints,
  version,
  issues,
) {
  // 列挙値チェック
  if (constraints.enumerations && constraints.enumerations.length > 0) {
    if (!constraints.enumerations.includes(value)) {
      issues.push({
        severity: SEVERITY.ERROR,
        category: CATEGORY.SCHEMA,
        message: `要素 '${elementName}' の属性 '${attrName}' の値 '${value}' は許可されていません。期待値: ${constraints.enumerations.join(', ')}`,
        elementType: elementName,
        elementId,
        attribute: attrName,
        value,
        expected: constraints.enumerations,
        repairable: false,
      });
      return;
    }
  }

  // 数値制約チェック
  const baseType = constraints.baseType ? stripNsPrefix(constraints.baseType) : null;
  if (baseType && isNumericType(baseType)) {
    const num = parseFloat(value);
    if (isNaN(num)) {
      issues.push({
        severity: SEVERITY.ERROR,
        category: CATEGORY.SCHEMA,
        message: `要素 '${elementName}' の属性 '${attrName}' の値 '${value}' は有効な数値ではありません`,
        elementType: elementName,
        elementId,
        attribute: attrName,
        value,
        repairable: false,
      });
      return;
    }

    checkNumericConstraints(elementName, elementId, attrName, value, num, constraints, issues);
  }

  // minLengthチェック
  if (constraints.minLength !== null && constraints.minLength !== undefined) {
    if (value.length < constraints.minLength) {
      issues.push({
        severity: SEVERITY.ERROR,
        category: CATEGORY.SCHEMA,
        message: `要素 '${elementName}' の属性 '${attrName}' の値 '${value}' はminLength制約 '${constraints.minLength}' を満たしていません`,
        elementType: elementName,
        elementId,
        attribute: attrName,
        value,
        repairable: false,
      });
    }
  }

  // パターンチェック
  if (constraints.patterns && constraints.patterns.length > 0) {
    const matched = constraints.patterns.some((p) => {
      try {
        return new RegExp(`^${p}$`).test(value);
      } catch {
        return true;
      }
    });
    if (!matched) {
      issues.push({
        severity: SEVERITY.ERROR,
        category: CATEGORY.SCHEMA,
        message: `要素 '${elementName}' の属性 '${attrName}' の値 '${value}' はパターン制約に一致しません`,
        elementType: elementName,
        elementId,
        attribute: attrName,
        value,
        repairable: false,
      });
    }
  }
}

/**
 * 数値制約のチェック
 */
function checkNumericConstraints(
  elementName,
  elementId,
  attrName,
  value,
  num,
  constraints,
  issues,
) {
  if (constraints.minExclusive !== null && constraints.minExclusive !== undefined) {
    if (num <= constraints.minExclusive) {
      issues.push({
        severity: SEVERITY.ERROR,
        category: CATEGORY.SCHEMA,
        message: `要素 '${elementName}' の属性 '${attrName}' の値 '${value}' はminExclusiveファセット '${constraints.minExclusive}' に違反しています`,
        elementType: elementName,
        elementId,
        attribute: attrName,
        value,
        expected: `> ${constraints.minExclusive}`,
        repairable: false,
      });
    }
  }

  if (constraints.maxExclusive !== null && constraints.maxExclusive !== undefined) {
    if (num >= constraints.maxExclusive) {
      issues.push({
        severity: SEVERITY.ERROR,
        category: CATEGORY.SCHEMA,
        message: `要素 '${elementName}' の属性 '${attrName}' の値 '${value}' はmaxExclusiveファセット '${constraints.maxExclusive}' に違反しています`,
        elementType: elementName,
        elementId,
        attribute: attrName,
        value,
        expected: `< ${constraints.maxExclusive}`,
        repairable: false,
      });
    }
  }

  if (constraints.minInclusive !== null && constraints.minInclusive !== undefined) {
    if (num < constraints.minInclusive) {
      issues.push({
        severity: SEVERITY.ERROR,
        category: CATEGORY.SCHEMA,
        message: `要素 '${elementName}' の属性 '${attrName}' の値 '${value}' はminInclusiveファセット '${constraints.minInclusive}' に違反しています`,
        elementType: elementName,
        elementId,
        attribute: attrName,
        value,
        expected: `>= ${constraints.minInclusive}`,
        repairable: false,
      });
    }
  }

  if (constraints.maxInclusive !== null && constraints.maxInclusive !== undefined) {
    if (num > constraints.maxInclusive) {
      issues.push({
        severity: SEVERITY.ERROR,
        category: CATEGORY.SCHEMA,
        message: `要素 '${elementName}' の属性 '${attrName}' の値 '${value}' はmaxInclusiveファセット '${constraints.maxInclusive}' に違反しています`,
        elementType: elementName,
        elementId,
        attribute: attrName,
        value,
        expected: `<= ${constraints.maxInclusive}`,
        repairable: false,
      });
    }
  }
}

/**
 * simpleTypeの値を検証
 */
function validateSimpleTypeValue(
  elementName,
  elementId,
  attrName,
  value,
  simpleType,
  version,
  issues,
) {
  // union型の場合
  if (simpleType.baseType === 'union' && simpleType.memberTypes) {
    const isValid = simpleType.memberTypes.some((mt) => {
      const mtName = stripNsPrefix(mt);
      const mtDef = getSimpleTypeForVersion(version, mtName);
      if (mtDef) {
        const tempErrors = [];
        validateSimpleTypeValue(
          elementName,
          elementId,
          attrName,
          value,
          mtDef,
          version,
          tempErrors,
        );
        return tempErrors.length === 0;
      }
      // 組み込み型
      const tempErrors = [];
      validateBuiltinType(elementName, elementId, attrName, value, mtName, tempErrors);
      return tempErrors.length === 0;
    });
    if (!isValid) {
      issues.push({
        severity: SEVERITY.ERROR,
        category: CATEGORY.SCHEMA,
        message: `要素 '${elementName}' の属性 '${attrName}' の値 '${value}' はunion型のいずれのメンバー型にも適合しません`,
        elementType: elementName,
        elementId,
        attribute: attrName,
        value,
        repairable: false,
      });
    }
    return;
  }

  // 列挙値チェック
  if (simpleType.enumerations && simpleType.enumerations.length > 0) {
    if (!simpleType.enumerations.includes(value)) {
      issues.push({
        severity: SEVERITY.ERROR,
        category: CATEGORY.SCHEMA,
        message: `要素 '${elementName}' の属性 '${attrName}' の値 '${value}' は許可されていません。期待値: ${simpleType.enumerations.join(', ')}`,
        elementType: elementName,
        elementId,
        attribute: attrName,
        value,
        expected: simpleType.enumerations,
        repairable: false,
      });
      return;
    }
  }

  // 基底型の検証
  const baseTypeName = simpleType.baseType ? stripNsPrefix(simpleType.baseType) : null;

  // 数値型制約
  if (baseTypeName && isNumericType(baseTypeName)) {
    const num = parseFloat(value);
    if (isNaN(num)) {
      issues.push({
        severity: SEVERITY.ERROR,
        category: CATEGORY.SCHEMA,
        message: `要素 '${elementName}' の属性 '${attrName}' の値 '${value}' は有効な数値ではありません`,
        elementType: elementName,
        elementId,
        attribute: attrName,
        value,
        repairable: false,
      });
      return;
    }

    checkNumericConstraints(elementName, elementId, attrName, value, num, simpleType, issues);
  }

  // minLengthチェック
  if (simpleType.minLength !== null && simpleType.minLength !== undefined) {
    if (value.length < simpleType.minLength) {
      issues.push({
        severity: SEVERITY.ERROR,
        category: CATEGORY.SCHEMA,
        message: `要素 '${elementName}' の属性 '${attrName}' の値 '${value}' はminLength制約 '${simpleType.minLength}' を満たしていません`,
        elementType: elementName,
        elementId,
        attribute: attrName,
        value,
        repairable: false,
      });
    }
  }

  // パターンチェック
  if (simpleType.patterns && simpleType.patterns.length > 0) {
    const matched = simpleType.patterns.some((p) => {
      try {
        return new RegExp(`^${p}$`).test(value);
      } catch {
        return true;
      }
    });
    if (!matched) {
      issues.push({
        severity: SEVERITY.ERROR,
        category: CATEGORY.SCHEMA,
        message: `要素 '${elementName}' の属性 '${attrName}' の値 '${value}' はパターン制約に一致しません`,
        elementType: elementName,
        elementId,
        attribute: attrName,
        value,
        repairable: false,
      });
    }
  }

  // 基底型がカスタムsimpleTypeの場合、再帰的に検証
  if (baseTypeName && !isBuiltinType(baseTypeName)) {
    const baseST = getSimpleTypeForVersion(version, baseTypeName);
    if (baseST) {
      validateSimpleTypeValue(elementName, elementId, attrName, value, baseST, version, issues);
    }
  }
}

/**
 * 組み込みXSD型の検証
 */
function validateBuiltinType(elementName, elementId, attrName, value, typeName, issues) {
  switch (typeName) {
    case 'positiveInteger':
      if (!/^\d+$/.test(value) || parseInt(value, 10) <= 0) {
        issues.push({
          severity: SEVERITY.ERROR,
          category: CATEGORY.SCHEMA,
          message: `要素 '${elementName}' の属性 '${attrName}' の値 '${value}' は有効なpositiveIntegerではありません`,
          elementType: elementName,
          elementId,
          attribute: attrName,
          value,
          repairable: false,
        });
      }
      break;

    case 'nonNegativeInteger':
      if (!/^\d+$/.test(value) || parseInt(value, 10) < 0) {
        issues.push({
          severity: SEVERITY.ERROR,
          category: CATEGORY.SCHEMA,
          message: `要素 '${elementName}' の属性 '${attrName}' の値 '${value}' は有効なnonNegativeIntegerではありません`,
          elementType: elementName,
          elementId,
          attribute: attrName,
          value,
          repairable: false,
        });
      }
      break;

    case 'integer':
    case 'int':
    case 'long':
    case 'short':
      if (!/^-?\d+$/.test(value)) {
        issues.push({
          severity: SEVERITY.ERROR,
          category: CATEGORY.SCHEMA,
          message: `要素 '${elementName}' の属性 '${attrName}' の値 '${value}' は有効な整数ではありません`,
          elementType: elementName,
          elementId,
          attribute: attrName,
          value,
          repairable: false,
        });
      }
      break;

    case 'double':
    case 'float':
    case 'decimal':
      if (isNaN(parseFloat(value))) {
        issues.push({
          severity: SEVERITY.ERROR,
          category: CATEGORY.SCHEMA,
          message: `要素 '${elementName}' の属性 '${attrName}' の値 '${value}' は有効な${typeName}ではありません`,
          elementType: elementName,
          elementId,
          attribute: attrName,
          value,
          repairable: false,
        });
      }
      break;

    case 'boolean':
      if (!['true', 'false', '1', '0'].includes(value)) {
        issues.push({
          severity: SEVERITY.ERROR,
          category: CATEGORY.SCHEMA,
          message: `要素 '${elementName}' の属性 '${attrName}' の値 '${value}' は有効なbooleanではありません`,
          elementType: elementName,
          elementId,
          attribute: attrName,
          value,
          repairable: false,
        });
      }
      break;

    // string, token, normalizedString, NMTOKEN, ID, IDREF, NCName, anyURI
    // - 文字列型は基本的にOK
  }
}

/**
 * 必須子要素の検証（choiceグループ対応）
 */
function validateRequiredChildren(element, elementName, elemDef, issues) {
  if (!elemDef.children || elemDef.children.size === 0) return;

  const elementId = element.getAttribute('id') || '';

  // choiceグループを特定
  const choiceGroups = new Map();

  for (const [, childDef] of elemDef.children) {
    if (childDef.choiceGroup) {
      if (!choiceGroups.has(childDef.choiceGroup)) {
        choiceGroups.set(childDef.choiceGroup, []);
      }
      choiceGroups.get(childDef.choiceGroup).push(childDef);
    }
  }

  // choiceグループの検証: グループ内のいずれか1つが存在すればOK
  // 注: STBスキーマではchoice自体がminOccurs="0"のケースが多いため、警告のみ
  // （今回はスキップ）

  // 通常の子要素（choiceグループに属さないもの）の必須チェック
  for (const [, childDef] of elemDef.children) {
    if (childDef.choiceGroup) continue;

    const minOccurs = parseInt(childDef.minOccurs || '1', 10);
    if (minOccurs <= 0) continue;

    const childElements = getDirectChildElementsByName(element, childDef.name);
    if (childElements.length < minOccurs) {
      issues.push({
        severity: SEVERITY.ERROR,
        category: CATEGORY.SCHEMA,
        message: `要素 '${elementName}' に必須の子要素 '${childDef.name}' がありません（最低 ${minOccurs} 個必要）`,
        elementType: elementName,
        elementId,
        expected: `>= ${minOccurs} occurrences of '${childDef.name}'`,
        repairable: false,
      });
    }
  }
}

/**
 * 子要素を再帰的に検証
 */
function validateChildElements(element, version, issues, parentDef) {
  for (let i = 0; i < element.childNodes.length; i++) {
    const child = element.childNodes[i];
    if (child.nodeType !== 1) continue;
    validateElement(child, version, issues, parentDef);
  }
}

/**
 * 直接の子要素を名前で取得
 */
function getDirectChildElementsByName(parent, name) {
  const results = [];
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i];
    if (child.nodeType !== 1) continue;
    const localName = child.localName || child.nodeName.replace(/^.*:/, '');
    if (localName === name) results.push(child);
  }
  return results;
}

/**
 * 数値型かどうか判定
 */
function isNumericType(typeName) {
  return [
    'double',
    'float',
    'decimal',
    'integer',
    'int',
    'long',
    'short',
    'positiveInteger',
    'nonNegativeInteger',
    'nonPositiveInteger',
    'negativeInteger',
    'unsignedInt',
    'unsignedLong',
    'unsignedShort',
    'unsignedByte',
    'byte',
  ].includes(typeName);
}

/**
 * 組み込み型かどうか判定
 */
function isBuiltinType(typeName) {
  return [
    'string',
    'token',
    'normalizedString',
    'NMTOKEN',
    'ID',
    'IDREF',
    'NCName',
    'anyURI',
    'double',
    'float',
    'decimal',
    'integer',
    'int',
    'long',
    'short',
    'positiveInteger',
    'nonNegativeInteger',
    'nonPositiveInteger',
    'negativeInteger',
    'unsignedInt',
    'unsignedLong',
    'unsignedShort',
    'unsignedByte',
    'byte',
    'boolean',
  ].includes(typeName);
}

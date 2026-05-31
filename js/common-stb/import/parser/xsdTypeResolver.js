/**
 * @fileoverview XSD型解決モジュール
 *
 * simpleType/complexTypeの解決、キャッシュ、属性グループ参照の解決、
 * 子要素の再帰的解析など、XSDスキーマの型解決ロジックを提供します。
 *
 * **内部モジュール**: xsdSchemaParser.js から再エクスポートされます。
 * 外部からは xsdSchemaParser.js 経由でアクセスしてください。
 */

import { createLogger } from '../../../utils/logger.js';

const log = createLogger('common-stb:import:parser:xsdTypeResolver');

// デバッグログの有効/無効（本番環境では false）
const XSD_DEBUG = false;

// 最大再帰深度（循環参照対策）
const MAX_DEPTH = 20;

/**
 * デバッグログ出力（XSD_DEBUG が true の場合のみ出力）
 * @param {...any} _args - ログ引数（未使用）
 */
function debugLog(..._args) {
  if (XSD_DEBUG) {
    // console.log(..._args); // デバッグ時はコメント解除
  }
}

// ────────────────────────────────────────────
// 共有状態への参照（xsdSchemaParser から注入される）
// ────────────────────────────────────────────

/** @type {{ xsdSchema: Document|null, simpleTypesByVersion: Map, activeVersion: string }} */
let _state = {
  xsdSchema: null,
  simpleTypesByVersion: new Map(),
  activeVersion: '2.0.2',
};

/**
 * 共有状態を設定する（xsdSchemaParser から呼ばれる内部API）
 * @param {Object} state - 共有状態オブジェクト
 */
export function _setSharedState(state) {
  _state = state;
}

// ────────────────────────────────────────────
// ユーティリティ
// ────────────────────────────────────────────

/**
 * @param {{ localName?: string | null, nodeName?: string | null } | null | undefined} node
 * @returns {string}
 */
function getNodeLocalName(node) {
  if (!node) return '';
  if (typeof node.localName === 'string' && node.localName) {
    return node.localName;
  }
  if (typeof node.nodeName === 'string' && node.nodeName) {
    return node.nodeName.replace(/^.*:/, '');
  }
  return '';
}

/**
 * 名前空間プレフィックスを除去するユーティリティ
 * @param {string} name - プレフィックス付き名前
 * @returns {string} プレフィックスなし名前
 */
export function stripNsPrefix(name) {
  if (!name) return '';
  return name.includes(':') ? name.split(':').pop() : name;
}

// ────────────────────────────────────────────
// simpleType 収集・取得
// ────────────────────────────────────────────

/**
 * simpleType定義を収集しバージョン別に保存
 * @param {string} version - STBバージョン
 * @param {Document} xsdDoc - XSD Document
 */
export function collectSimpleTypes(version, xsdDoc) {
  if (!_state.simpleTypesByVersion.has(version)) {
    _state.simpleTypesByVersion.set(version, new Map());
  }
  const versionTypes = _state.simpleTypesByVersion.get(version);

  const simpleTypes = xsdDoc.querySelectorAll('xs\\:simpleType[name], simpleType[name]');
  simpleTypes.forEach((st) => {
    const name = st.getAttribute('name');
    if (!name) return;

    // トップレベルのsimpleTypeのみ（schema直下）
    const parent = st.parentNode;
    const parentLN = getNodeLocalName(parent);
    if (parentLN !== 'schema') return;

    const typeDef = {
      name,
      baseType: null,
      enumerations: [],
      patterns: [],
      minExclusive: null,
      maxExclusive: null,
      minInclusive: null,
      maxInclusive: null,
      minLength: null,
      maxLength: null,
      totalDigits: null,
      fractionDigits: null,
      memberTypes: null,
    };

    const restriction = st.querySelector('xs\\:restriction, restriction');
    if (restriction) {
      typeDef.baseType = restriction.getAttribute('base');
      parseRestrictionFacetsBrowser(restriction, typeDef);
    }

    const union = st.querySelector('xs\\:union, union');
    if (union) {
      typeDef.baseType = 'union';
      typeDef.memberTypes = (union.getAttribute('memberTypes') || '').split(/\s+/).filter(Boolean);
    }

    versionTypes.set(name, typeDef);
  });

  debugLog(`collectSimpleTypes: Collected ${versionTypes.size} simpleTypes for ${version}`);
}

/**
 * 指定バージョンのsimpleType定義を取得
 * @param {string} version - STBバージョン
 * @param {string} typeName - 型名
 * @returns {Object|null} simpleType定義
 */
export function getSimpleTypeForVersion(version, typeName) {
  const versionTypes = _state.simpleTypesByVersion.get(version);
  return versionTypes ? versionTypes.get(typeName) || null : null;
}

/**
 * アクティブバージョンのsimpleType定義を取得
 * @param {string} typeName - 型名
 * @returns {Object|null} simpleType定義
 */
export function getSimpleType(typeName) {
  return getSimpleTypeForVersion(_state.activeVersion, typeName);
}

/**
 * 指定バージョンの全simpleType定義を取得
 * @param {string} [version] - STBバージョン（省略時はアクティブバージョン）
 * @returns {Map<string, Object>} simpleType定義のMap
 */
export function getSimpleTypes(version) {
  const v = version || _state.activeVersion;
  return _state.simpleTypesByVersion.get(v) || new Map();
}

// ────────────────────────────────────────────
// restriction ファセット解析
// ────────────────────────────────────────────

/**
 * restriction内のファセット（制約）を解析（ブラウザ版）
 * @param {Element} restriction - restriction要素
 * @param {Object} typeDef - ファセットを格納するオブジェクト
 */
function parseRestrictionFacetsBrowser(restriction, typeDef) {
  for (let i = 0; i < restriction.childNodes.length; i++) {
    const node = restriction.childNodes[i];
    if (node.nodeType !== 1) continue;
    const facetElement = /** @type {Element} */ (node);

    const localName = getNodeLocalName(facetElement);
    const value = facetElement.getAttribute('value');

    switch (localName) {
      case 'enumeration':
        typeDef.enumerations.push(value);
        break;
      case 'pattern':
        typeDef.patterns.push(value);
        break;
      case 'minExclusive':
        typeDef.minExclusive = parseFloat(value);
        break;
      case 'maxExclusive':
        typeDef.maxExclusive = parseFloat(value);
        break;
      case 'minInclusive':
        typeDef.minInclusive = parseFloat(value);
        break;
      case 'maxInclusive':
        typeDef.maxInclusive = parseFloat(value);
        break;
      case 'minLength':
        typeDef.minLength = parseInt(value, 10);
        break;
      case 'maxLength':
        typeDef.maxLength = parseInt(value, 10);
        break;
      case 'totalDigits':
        typeDef.totalDigits = parseInt(value, 10);
        break;
      case 'fractionDigits':
        typeDef.fractionDigits = parseInt(value, 10);
        break;
    }
  }
}

/**
 * インラインsimpleType制約を解析（ブラウザ版）
 * @param {Element} stNode - simpleType要素
 * @returns {Object} 制約オブジェクト
 */
function parseInlineSimpleTypeBrowser(stNode) {
  const constraints = {
    baseType: null,
    enumerations: [],
    patterns: [],
    minExclusive: null,
    maxExclusive: null,
    minInclusive: null,
    maxInclusive: null,
    minLength: null,
    maxLength: null,
  };

  const restriction = stNode.querySelector('xs\\:restriction, restriction');
  if (restriction) {
    constraints.baseType = restriction.getAttribute('base');
    parseRestrictionFacetsBrowser(restriction, constraints);
  }

  return constraints;
}

// ────────────────────────────────────────────
// 属性・型参照の解決
// ────────────────────────────────────────────

/**
 * 要素からドキュメント情報を取得
 * @param {Element} element - XML要素
 * @returns {string|null} ドキュメント文字列
 */
export function getDocumentation(element) {
  const annotation = element.querySelector('xs\\:annotation, annotation');
  if (!annotation) return null;

  const documentation = annotation.querySelector('xs\\:documentation, documentation');
  return documentation ? documentation.textContent.trim() : null;
}

/**
 * 属性要素から属性定義を解析する共通ヘルパー
 * @param {Element} attr - xs:attribute要素
 * @returns {Object} 属性定義
 */
export function parseAttributeDef(attr) {
  const attrName = attr.getAttribute('name');
  const attrType = attr.getAttribute('type');
  const use = attr.getAttribute('use') || 'optional';
  const defaultValue = attr.getAttribute('default');
  const fixed = attr.getAttribute('fixed');
  const documentation = getDocumentation(attr);

  // インラインsimpleType制約のチェック
  let constraints = null;
  if (!attrType) {
    const inlineST = attr.querySelector('xs\\:simpleType, simpleType');
    if (inlineST) {
      constraints = parseInlineSimpleTypeBrowser(inlineST);
    }
  }

  return {
    name: attrName,
    type: attrType,
    required: use === 'required',
    default: defaultValue,
    fixed: fixed,
    documentation: documentation,
    constraints: constraints,
  };
}

/**
 * 型参照を解決して属性を取得する
 * @param {string} typeRef - 型参照名
 * @param {Set<string>} visited - 循環参照防止のための訪問済み型セット
 * @returns {Map<string, Object>|null} 属性定義のマップ
 */
export function resolveTypeReference(typeRef, visited = new Set()) {
  if (!_state.xsdSchema) {
    log.error('resolveTypeReference: xsdSchema is null');
    return null;
  }

  debugLog(`Resolving type reference: ${typeRef}`);

  // 名前空間プレフィックスを除去
  const typeName = typeRef.includes(':') ? typeRef.split(':')[1] : typeRef;

  // ビルトイン型（xs:string, xs:double等）の場合は解決しない
  if (typeRef.startsWith('xs:') || typeRef.startsWith('xsd:')) {
    debugLog(`Skipping built-in type: ${typeRef}`);
    return null;
  }

  // 循環参照のチェック
  if (visited.has(typeName)) {
    debugLog(`Circular reference detected for type: ${typeName}`);
    return null;
  }

  visited.add(typeName);

  // complexType定義を検索
  const complexType = _state.xsdSchema.querySelector(
    `xs\\:complexType[name="${typeName}"], complexType[name="${typeName}"]`,
  );

  if (!complexType) {
    debugLog(`Complex type ${typeName} not found`);
    visited.delete(typeName);
    return null;
  }

  debugLog(`Found complex type definition for: ${typeName}`);

  const attributes = new Map();

  // 属性定義を取得
  const attributeElements = complexType.querySelectorAll('xs\\:attribute, attribute');

  debugLog(`Found ${attributeElements.length} attributes in complex type ${typeName}`);

  attributeElements.forEach((attr) => {
    const attrDef = parseAttributeDef(attr);
    if (attrDef.name) {
      attributes.set(attrDef.name, attrDef);
      debugLog(
        `  Added type reference attribute: ${attrDef.name} (${attrDef.required ? 'required' : 'optional'})`,
      );
    }
  });

  // 基底型からの継承も考慮
  const extension = complexType.querySelector('xs\\:extension, extension');
  if (extension) {
    const baseType = extension.getAttribute('base');
    debugLog(`Found extension base type: ${baseType} for ${typeName}`);

    const baseAttributes = resolveTypeReference(baseType, visited);
    if (baseAttributes) {
      debugLog(`Inherited ${baseAttributes.size} attributes from base type ${baseType}`);
      baseAttributes.forEach((attrDef, attrName) => {
        if (!attributes.has(attrName)) {
          attributes.set(attrName, attrDef);
          debugLog(`  Inherited attribute: ${attrName}`);
        }
      });
    }
  }

  visited.delete(typeName);
  return attributes;
}

/**
 * attributeGroup参照を解決して属性定義を取得
 * @param {string} ref - 参照名（例: "stb:Column"）
 * @returns {Map<string, Object>|null} 属性定義のマップ
 */
export function resolveAttributeGroupReference(ref) {
  if (!_state.xsdSchema) {
    log.error('resolveAttributeGroupReference: xsdSchema is null');
    return null;
  }

  // 名前空間プレフィックスを除去
  const groupName = ref.includes(':') ? ref.split(':')[1] : ref;

  debugLog(`Resolving attribute group: ${groupName}`);

  // attributeGroup要素を検索
  const attributeGroup = _state.xsdSchema.querySelector(
    `xs\\:attributeGroup[name="${groupName}"], attributeGroup[name="${groupName}"]`,
  );

  if (!attributeGroup) {
    debugLog(`Attribute group not found: ${groupName}`);
    return null;
  }

  debugLog(`Found attribute group definition for: ${groupName}`);

  const attributes = new Map();

  // 属性定義を取得
  const attributeElements = attributeGroup.querySelectorAll('xs\\:attribute, attribute');

  debugLog(`Found ${attributeElements.length} attributes in attribute group ${groupName}`);

  attributeElements.forEach((attr) => {
    const attrDef = parseAttributeDef(attr);
    if (attrDef.name) {
      attributes.set(attrDef.name, attrDef);
      debugLog(
        `  Added attribute: ${attrDef.name} (${attrDef.required ? 'required' : 'optional'})`,
      );
    }
  });

  return attributes;
}

// ────────────────────────────────────────────
// 子要素解析
// ────────────────────────────────────────────

let choiceGroupCounter = 0;

/**
 * complexType要素から子要素を再帰的に解析する
 * @param {Element} complexTypeElement - complexType要素
 * @param {Map<string, Object>} childrenMap - 子要素定義を格納するマップ
 * @param {Set<string>} visited - 循環参照防止のための訪問済み要素セット
 * @param {number} depth - 現在の再帰深度
 */
export function parseChildElements(complexTypeElement, childrenMap, visited, depth) {
  if (!complexTypeElement || depth >= MAX_DEPTH) {
    if (depth >= MAX_DEPTH) {
      debugLog(`Max depth ${MAX_DEPTH} reached, stopping recursion`);
    }
    return;
  }

  debugLog(`parseChildElements at depth ${depth}`);

  // 直接の子要素からコンテナを探索
  for (let i = 0; i < complexTypeElement.childNodes.length; i++) {
    const child = complexTypeElement.childNodes[i];
    if (child.nodeType !== 1) continue;
    const childElement = /** @type {Element} */ (child);
    const localName = getNodeLocalName(childElement);

    if (localName === 'sequence' || localName === 'choice' || localName === 'all') {
      processContainerChildren(childElement, childrenMap, visited, depth + 1, null);
    }
  }

  // xs:extension からの継承も考慮
  const extension = complexTypeElement.querySelector('xs\\:extension, extension');
  if (extension) {
    const baseType = extension.getAttribute('base');
    if (baseType) {
      debugLog(`Processing extension base type: ${baseType}`);
      const baseChildren = resolveTypeChildren(baseType, visited, depth + 1);
      if (baseChildren) {
        baseChildren.forEach((childDef, childName) => {
          if (!childrenMap.has(childName)) {
            childrenMap.set(childName, childDef);
            debugLog(`  Inherited child: ${childName}`);
          }
        });
      }
    }

    // extension内のsequence/choice/allも処理
    for (let i = 0; i < extension.childNodes.length; i++) {
      const child = extension.childNodes[i];
      if (child.nodeType !== 1) continue;
      const childElement = /** @type {Element} */ (child);
      const localName = getNodeLocalName(childElement);

      if (localName === 'sequence' || localName === 'choice' || localName === 'all') {
        processContainerChildren(childElement, childrenMap, visited, depth + 1, null);
      }
    }
  }
}

/**
 * sequence/choice/all コンテナ内の子要素を処理（choiceグループ追跡付き）
 * @param {Element} container - コンテナ要素
 * @param {Map<string, Object>} childrenMap - 子要素定義を格納するマップ
 * @param {Set<string>} visited - 循環参照防止
 * @param {number} depth - 現在の再帰深度
 * @param {string|null} parentChoiceGroup - 親のchoiceグループID
 */
function processContainerChildren(container, childrenMap, visited, depth, parentChoiceGroup) {
  if (depth >= MAX_DEPTH) return;

  const localName = getNodeLocalName(container);
  const isChoice = localName === 'choice';
  const currentChoiceGroup = isChoice ? `choice_${choiceGroupCounter++}` : parentChoiceGroup;

  debugLog(`Processing ${localName} container (choiceGroup: ${currentChoiceGroup})`);

  for (let i = 0; i < container.childNodes.length; i++) {
    const child = container.childNodes[i];
    if (child.nodeType !== 1) continue;
    const childElement = /** @type {Element} */ (child);
    const childLN = getNodeLocalName(childElement);

    if (childLN === 'element') {
      const childDef = parseElementChild(childElement, visited);
      if (childDef) {
        if (currentChoiceGroup) {
          childDef.choiceGroup = currentChoiceGroup;
        }
        if (!childrenMap.has(childDef.name)) {
          childrenMap.set(childDef.name, childDef);
          debugLog(`  Added child element: ${childDef.name} (choiceGroup: ${currentChoiceGroup})`);
        }
      }
    } else if (childLN === 'group') {
      const ref = childElement.getAttribute('ref');
      if (ref) {
        debugLog(`  Processing group reference: ${ref}`);
        const groupChildren = resolveGroupReference(ref, visited, depth + 1);
        if (groupChildren) {
          groupChildren.forEach((groupChild, childName) => {
            if (!childrenMap.has(childName)) {
              if (currentChoiceGroup && !groupChild.choiceGroup) {
                groupChild.choiceGroup = currentChoiceGroup;
              }
              childrenMap.set(childName, groupChild);
              debugLog(`    Added group child: ${childName}`);
            }
          });
        }
      }
    } else if (childLN === 'sequence' || childLN === 'choice' || childLN === 'all') {
      processContainerChildren(childElement, childrenMap, visited, depth + 1, currentChoiceGroup);
    }
  }
}

/**
 * 単一の子要素ノードを解析する
 * @param {Element} elementNode - element要素
 * @param {Set<string>} visited - 循環参照防止のための訪問済み要素セット
 * @returns {Object|null} 子要素定義 {name, type, minOccurs, maxOccurs}
 */
function parseElementChild(elementNode, visited) {
  const name = elementNode.getAttribute('name');
  const ref = elementNode.getAttribute('ref');
  const type = elementNode.getAttribute('type');
  const minOccurs = elementNode.getAttribute('minOccurs') || '1';
  const maxOccurs = elementNode.getAttribute('maxOccurs') || '1';

  debugLog(`parseElementChild: name=${name}, ref=${ref}, type=${type}`);

  // ref属性がある場合は参照を解決
  // minOccurs/maxOccursは参照元（ref使用側）の値を優先する
  // XSDでは <xs:element ref="stb:Foo" minOccurs="0"/> のように参照側で出現回数を指定する
  if (ref) {
    const resolved = resolveElementReference(ref, visited);
    if (resolved) {
      resolved.minOccurs = minOccurs;
      resolved.maxOccurs = maxOccurs;
    }
    return resolved;
  }

  // name属性がない場合はスキップ
  if (!name) {
    debugLog('parseElementChild: No name or ref, skipping');
    return null;
  }

  // simpleType要素の場合はスキップ（属性のみの要素）
  const simpleType = elementNode.querySelector('xs\\:simpleType, simpleType');
  if (simpleType) {
    debugLog(`Element ${name} has simpleType, treating as leaf`);
    return {
      name: name,
      type: 'simpleType',
      minOccurs: minOccurs,
      maxOccurs: maxOccurs,
      isLeaf: true,
    };
  }

  return {
    name: name,
    type: type || 'unknown',
    minOccurs: minOccurs,
    maxOccurs: maxOccurs,
    isLeaf: false,
  };
}

/**
 * 要素参照を解決する (ref="stb:ElementName" の形式)
 * @param {string} ref - 参照名
 * @param {Set<string>} visited - 循環参照防止のための訪問済み要素セット
 * @returns {Object|null} 子要素定義
 */
function resolveElementReference(ref, visited) {
  if (!_state.xsdSchema) {
    debugLog('resolveElementReference: xsdSchema is null');
    return null;
  }

  // 名前空間プレフィックスを除去
  const elementName = ref.includes(':') ? ref.split(':')[1] : ref;

  debugLog(`Resolving element reference: ${elementName}`);

  // 循環参照のチェック
  if (visited.has(elementName)) {
    debugLog(`Circular reference detected for element: ${elementName}`);
    return null;
  }

  visited.add(elementName);

  // 要素定義を検索
  const element = _state.xsdSchema.querySelector(
    `xs\\:element[name="${elementName}"], element[name="${elementName}"]`,
  );

  if (!element) {
    debugLog(`Element ${elementName} not found`);
    visited.delete(elementName);
    return null;
  }

  const type = element.getAttribute('type');
  const minOccurs = element.getAttribute('minOccurs') || '1';
  const maxOccurs = element.getAttribute('maxOccurs') || '1';

  visited.delete(elementName);

  return {
    name: elementName,
    type: type || 'unknown',
    minOccurs: minOccurs,
    maxOccurs: maxOccurs,
    isLeaf: false,
  };
}

/**
 * group参照を解決する
 * @param {string} ref - 参照名
 * @param {Set<string>} visited - 循環参照防止のための訪問済み要素セット
 * @param {number} depth - 現在の再帰深度
 * @returns {Map<string, Object>|null} 子要素定義のマップ
 */
function resolveGroupReference(ref, visited, depth) {
  if (!_state.xsdSchema || depth >= MAX_DEPTH) {
    return null;
  }

  // 名前空間プレフィックスを除去
  const groupName = ref.includes(':') ? ref.split(':')[1] : ref;

  debugLog(`Resolving group reference: ${groupName}`);

  // group要素を検索
  const group = _state.xsdSchema.querySelector(
    `xs\\:group[name="${groupName}"], group[name="${groupName}"]`,
  );

  if (!group) {
    debugLog(`Group ${groupName} not found`);
    return null;
  }

  const children = new Map();
  parseChildElements(group, children, visited, depth);

  return children;
}

/**
 * 型参照から子要素を解決する
 * @param {string} typeRef - 型参照名
 * @param {Set<string>} visited - 循環参照防止のための訪問済み要素セット
 * @param {number} depth - 現在の再帰深度
 * @returns {Map<string, Object>|null} 子要素定義のマップ
 */
function resolveTypeChildren(typeRef, visited, depth) {
  if (!_state.xsdSchema || depth >= MAX_DEPTH) {
    return null;
  }

  // 名前空間プレフィックスを除去
  const typeName = typeRef.includes(':') ? typeRef.split(':')[1] : typeRef;

  // ビルトイン型の場合は解決しない
  if (typeRef.startsWith('xs:') || typeRef.startsWith('xsd:')) {
    return null;
  }

  debugLog(`Resolving type children: ${typeName}`);

  // complexType定義を検索
  const complexType = _state.xsdSchema.querySelector(
    `xs\\:complexType[name="${typeName}"], complexType[name="${typeName}"]`,
  );

  if (!complexType) {
    debugLog(`Complex type ${typeName} not found`);
    return null;
  }

  const children = new Map();
  parseChildElements(complexType, children, visited, depth);

  return children;
}

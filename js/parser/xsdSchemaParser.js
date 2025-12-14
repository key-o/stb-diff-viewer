/**
 * @fileoverview XSDスキーマ解析モジュール
 *
 * このファイルは、XMLスキーマ定義（XSD）ファイルを解析し、
 * STB要素の本来の属性定義を取得する機能を提供します:
 * - XSDファイルの読み込みと解析
 * - 要素タイプごとの属性定義の抽出
 * - 属性の型情報とデフォルト値の取得
 * - 必須属性と任意属性の判定
 * - 属性の説明文やドキュメントの取得
 *
 * **パラメータ比較機能用途**:
 * - モデルA/B間の属性値比較時のバリデーション
 * - 属性値の型チェックと制約違反検出
 * - 必須属性の未設定エラー検出
 * - 列挙値・パターン制約の正当性確認
 * - パラメータ編集UIでのリアルタイムバリデーション
 */

// グローバルにスキーマ情報を保持
let xsdSchema = null;
const elementDefinitions = new Map();

/**
 * XSDファイルを読み込み、スキーマ情報を解析する
 * @param {string} xsdUrl - XSDファイルのURL
 * @returns {Promise<boolean>} 読み込み成功可否
 */
export async function loadXsdSchema(xsdUrl) {
  try {
    console.log(`[XSD] Loading XSD schema from: ${xsdUrl}`);

    // 複数のパス候補を試す
    const pathCandidates = [
      xsdUrl,
      `./schemas/ST-Bridge202.xsd`,
      `../schemas/ST-Bridge202.xsd`,
      `./materials/ST-Bridge202.xsd`,
      `../materials/ST-Bridge202.xsd`
    ];

    let response = null;
    let successUrl = null;

    for (const candidate of pathCandidates) {
      try {
        console.log(`[XSD] Trying path: ${candidate}`);
        response = await fetch(candidate);
        console.log(`[XSD] Fetch response for ${candidate}: status=${response.status}, ok=${response.ok}`);

        if (response.ok) {
          successUrl = candidate;
          break;
        }
      } catch (fetchError) {
        console.log(`[XSD] Fetch failed for ${candidate}: ${fetchError.message}`);
        continue;
      }
    }

    if (!response || !response.ok) {
      throw new Error(
        `Failed to fetch XSD from any candidate paths. Last status: ${response?.status} ${response?.statusText}`
      );
    }

    console.log(`[XSD] Successfully loaded from: ${successUrl}`);

    const xsdText = await response.text();
    console.log(`XSD text loaded, length: ${xsdText.length} characters`);

    const parser = new DOMParser();
    xsdSchema = parser.parseFromString(xsdText, 'application/xml');

    const parseError = xsdSchema.querySelector('parsererror');
    if (parseError) {
      console.error('XSD Parse error:', parseError.textContent);
      throw new Error('Failed to parse XSD file');
    }

    console.log('XSD parsed successfully, analyzing element definitions...');

    // スキーマ情報を解析して要素定義を構築
    parseElementDefinitions();

    console.log(
      `XSD schema loaded successfully. Found ${elementDefinitions.size} element definitions.`
    );

    // デバッグ: 見つかった要素定義をログ出力
    console.log(
      'Found element definitions:',
      Array.from(elementDefinitions.keys())
    );

    return true;
  } catch (error) {
    console.error('Error loading XSD schema:', error);
    return false;
  }
}

/**
 * スキーマから要素定義を解析し、elementDefinitionsに格納する
 */
function parseElementDefinitions() {
  if (!xsdSchema) {
    console.error('parseElementDefinitions: xsdSchema is null');
    return;
  }

  console.log('Starting parseElementDefinitions...');

  // 名前空間の確認
  const namespaceURI = 'https://www.building-smart.or.jp/dl';

  // 要素定義を直接取得（name属性を持つもの）
  const elements = xsdSchema.querySelectorAll(
    'xs\\:element[name], element[name]'
  );

  console.log(`Found ${elements.length} named elements`);

  elements.forEach((element) => {
    const elementName = element.getAttribute('name');
    if (!elementName || !elementName.startsWith('Stb')) {
      return;
    }

    console.log(`Processing element: ${elementName}`);

    const attributes = new Map();

    // 型参照がある場合の処理
    const typeRef = element.getAttribute('type');
    if (typeRef) {
      console.log(`Element ${elementName} has type reference: ${typeRef}`);

      // 型参照を解決して属性を取得
      const typeAttributes = resolveTypeReference(typeRef);
      if (typeAttributes) {
        console.log(
          `Resolved ${typeAttributes.size} attributes from type reference ${typeRef}`
        );
        typeAttributes.forEach((attrDef, attrName) => {
          if (!attributes.has(attrName)) {
            attributes.set(attrName, attrDef);
            console.log(
              `  Added type attribute: ${attrName} (${
                attrDef.required ? 'required' : 'optional'
              })`
            );
          }
        });
      } else {
        console.log(`Failed to resolve type reference: ${typeRef}`);
      }
    }

    // 直接の属性定義を取得
    const attributeElements = element.querySelectorAll(
      'xs\\:attribute, attribute'
    );

    console.log(
      `Found ${attributeElements.length} direct attributes for ${elementName}`
    );

    attributeElements.forEach((attr) => {
      const attrName = attr.getAttribute('name');
      const attrType = attr.getAttribute('type');
      const use = attr.getAttribute('use') || 'optional';
      const defaultValue = attr.getAttribute('default');
      const fixed = attr.getAttribute('fixed');

      // ドキュメントやアノテーションを取得
      const documentation = getDocumentation(attr);

      if (attrName && !attributes.has(attrName)) {
        attributes.set(attrName, {
          name: attrName,
          type: attrType,
          required: use === 'required',
          default: defaultValue,
          fixed: fixed,
          documentation: documentation
        });

        console.log(`  Added attribute: ${attrName} (${use})`);
      }
    });

    // complexTypeの場合、内部の属性も処理
    const complexType = element.querySelector('xs\\:complexType, complexType');
    if (complexType) {
      const complexAttributes = complexType.querySelectorAll(
        'xs\\:attribute, attribute'
      );

      console.log(
        `Found ${complexAttributes.length} complex type attributes for ${elementName}`
      );

      complexAttributes.forEach((attr) => {
        const attrName = attr.getAttribute('name');
        const attrType = attr.getAttribute('type');
        const use = attr.getAttribute('use') || 'optional';
        const defaultValue = attr.getAttribute('default');
        const fixed = attr.getAttribute('fixed');

        // ドキュメントやアノテーションを取得
        const documentation = getDocumentation(attr);

        if (attrName && !attributes.has(attrName)) {
          attributes.set(attrName, {
            name: attrName,
            type: attrType,
            required: use === 'required',
            default: defaultValue,
            fixed: fixed,
            documentation: documentation
          });

          console.log(`  Added complex type attribute: ${attrName} (${use})`);
        }
      });

      // attributeGroup参照の処理
      const attributeGroups = complexType.querySelectorAll(
        'xs\\:attributeGroup[ref], attributeGroup[ref]'
      );

      console.log(
        `Found ${attributeGroups.length} attribute group references for ${elementName}`
      );

      attributeGroups.forEach((attrGroup) => {
        const ref = attrGroup.getAttribute('ref');
        if (ref) {
          console.log(`  Processing attribute group reference: ${ref}`);
          const groupAttributes = resolveAttributeGroupReference(ref);
          if (groupAttributes) {
            console.log(
              `  Resolved ${groupAttributes.size} attributes from attribute group ${ref}`
            );
            groupAttributes.forEach((attrDef, attrName) => {
              if (!attributes.has(attrName)) {
                attributes.set(attrName, attrDef);
                console.log(`    Added attribute group attribute: ${attrName}`);
              }
            });
          } else {
            console.log(
              `  Failed to resolve attribute group reference: ${ref}`
            );
          }
        }
      });
    }

    elementDefinitions.set(elementName, {
      name: elementName,
      attributes: attributes,
      documentation: getDocumentation(element)
    });

    console.log(
      `Registered element definition: ${elementName} with ${attributes.size} attributes`
    );

    // StbColumnの詳細ログ
    if (elementName === 'StbColumn') {
      console.log(`=== StbColumn Debug Info ===`);
      console.log(`Type reference: ${element.getAttribute('type')}`);
      console.log(`Direct attributes: ${attributeElements.length}`);
      console.log(`Has complexType: ${!!complexType}`);
      console.log(`Final attribute count: ${attributes.size}`);
      if (attributes.size > 0) {
        console.log(`Attributes:`, Array.from(attributes.keys()));
      }
      console.log(`=== End StbColumn Debug ===`);
    }
  });

  // 複合型の定義も処理（名前空間考慮）
  const complexTypes = xsdSchema.querySelectorAll(
    'xs\\:complexType[name], complexType[name]'
  );

  console.log(`Found ${complexTypes.length} named complex types`);

  complexTypes.forEach((complexType) => {
    const typeName = complexType.getAttribute('name');
    if (!typeName || !typeName.startsWith('Stb')) {
      return;
    }

    console.log(`Processing complex type: ${typeName}`);

    // 既に要素定義として処理されている場合はスキップ
    if (elementDefinitions.has(typeName)) {
      console.log(`Skipping ${typeName} - already processed as element`);
      return;
    }

    const attributes = new Map();

    // 属性定義を取得
    const attributeElements = complexType.querySelectorAll(
      'xs\\:attribute, attribute'
    );

    console.log(
      `Found ${attributeElements.length} attributes for complex type ${typeName}`
    );

    attributeElements.forEach((attr) => {
      const attrName = attr.getAttribute('name');
      const attrType = attr.getAttribute('type');
      const use = attr.getAttribute('use') || 'optional';
      const defaultValue = attr.getAttribute('default');
      const fixed = attr.getAttribute('fixed');

      // ドキュメントやアノテーションを取得
      const documentation = getDocumentation(attr);

      attributes.set(attrName, {
        name: attrName,
        type: attrType,
        required: use === 'required',
        default: defaultValue,
        fixed: fixed,
        documentation: documentation
      });

      console.log(`  Added attribute: ${attrName} (${use})`);
    });

    // 基底型からの継承も考慮
    const extension = complexType.querySelector('xs\\:extension, extension');
    if (extension) {
      const baseType = extension.getAttribute('base');
      console.log(`Found extension base type: ${baseType} for ${typeName}`);

      // 基底型の属性を追加
      const baseAttributes = resolveTypeReference(baseType, new Set());
      if (baseAttributes) {
        console.log(
          `Inherited ${baseAttributes.size} attributes from base type ${baseType}`
        );
        baseAttributes.forEach((attrDef, attrName) => {
          if (!attributes.has(attrName)) {
            attributes.set(attrName, attrDef);
            console.log(`  Inherited attribute: ${attrName}`);
          }
        });
      }
    }

    elementDefinitions.set(typeName, {
      name: typeName,
      attributes: attributes,
      documentation: getDocumentation(complexType)
    });

    console.log(
      `Registered complex type definition: ${typeName} with ${attributes.size} attributes`
    );
  });
}

/**
 * 要素からドキュメント情報を取得
 * @param {Element} element - XML要素
 * @returns {string|null} ドキュメント文字列
 */
function getDocumentation(element) {
  const annotation = element.querySelector('xs\\:annotation, annotation');
  if (!annotation) return null;

  const documentation = annotation.querySelector(
    'xs\\:documentation, documentation'
  );
  return documentation ? documentation.textContent.trim() : null;
}

/**
 * 指定された要素タイプの属性定義を取得
 * @param {string} elementType - 要素タイプ名（例: 'StbColumn', 'StbGirder'）
 * @returns {Map<string, Object>|null} 属性定義のマップ
 */
export function getElementAttributes(elementType) {
  // 短時間での重複ログを避けるため、最後のログ時刻を記録
  const now = Date.now();
  if (!getElementAttributes._lastLog) getElementAttributes._lastLog = {};

  const shouldLog =
    !getElementAttributes._lastLog[elementType] ||
    now - getElementAttributes._lastLog[elementType] > 5000; // 5秒間隔

  if (shouldLog) {
    console.log(`getElementAttributes called for: ${elementType}`);
    getElementAttributes._lastLog[elementType] = now;
  }

  const definition = elementDefinitions.get(elementType);
  if (definition) {
    if (shouldLog) {
      console.log(
        `Found definition for ${elementType}, attributes:`,
        definition.attributes.size
      );
    }
    return definition.attributes;
  } else {
    if (shouldLog) {
      console.log(`No definition found for ${elementType}`);
      console.log(`Total definitions available: ${elementDefinitions.size}`);

      // StbColumnが見つからない場合は、類似の要素を検索
      if (elementType === 'StbColumn') {
        const columnRelated = Array.from(elementDefinitions.keys()).filter(
          (key) => key.toLowerCase().includes('column')
        );
        console.log(
          `Column-related elements found:`,
          columnRelated.slice(0, 5)
        );
      }
    }
    return null;
  }
}

/**
 * 指定された要素タイプの全ての属性名を取得（XSDで定義されている全て）
 * @param {string} elementType - 要素タイプ名
 * @returns {Array<string>} 属性名の配列
 */
export function getAllAttributeNames(elementType) {
  const attributes = getElementAttributes(elementType);
  return attributes ? Array.from(attributes.keys()) : [];
}

/**
 * 指定された要素タイプと属性名の詳細情報を取得
 * @param {string} elementType - 要素タイプ名
 * @param {string} attributeName - 属性名
 * @returns {Object|null} 属性の詳細情報
 */
export function getAttributeInfo(elementType, attributeName) {
  const attributes = getElementAttributes(elementType);
  return attributes ? attributes.get(attributeName) : null;
}

/**
 * XSDスキーマが読み込まれているかチェック
 * @returns {boolean} スキーマの読み込み状態
 */
export function isSchemaLoaded() {
  return xsdSchema !== null && elementDefinitions.size > 0;
}

/**
 * 読み込まれている要素定義の一覧を取得
 * @returns {Array<string>} 要素名の配列
 */
export function getAvailableElements() {
  return Array.from(elementDefinitions.keys());
}

// clearSchema関数は削除されました（未使用のため）

// debugPrintSchema関数は削除されました（未使用のため）

/**
 * 属性値がXSDスキーマの型定義に適合するかチェック
 * @param {string} elementType - 要素タイプ名
 * @param {string} attributeName - 属性名
 * @param {string} value - チェックする値
 * @returns {Object} バリデーション結果 {valid: boolean, error?: string, suggestions?: string[]}
 */
export function validateAttributeValue(elementType, attributeName, value) {
  const attrInfo = getAttributeInfo(elementType, attributeName);
  if (!attrInfo) {
    return { valid: false, error: '属性がXSDスキーマで定義されていません' };
  }

  // 空値のチェック
  if (!value || value.trim() === '') {
    if (attrInfo.required) {
      return { valid: false, error: '必須属性です' };
    }
    return { valid: true }; // 任意属性で空値はOK
  }

  // 型に基づくバリデーション
  const type = attrInfo.type;
  if (!type) {
    return { valid: true }; // 型情報がない場合はスキップ
  }

  // XS標準型のバリデーション
  if (type.startsWith('xs:')) {
    return validateXsType(type, value);
  }

  // カスタム型の場合、XSDから列挙値を取得
  const enumValues = getEnumerationValues(type);
  if (enumValues.length > 0) {
    if (!enumValues.includes(value)) {
      return {
        valid: false,
        error: `許可された値ではありません`,
        suggestions: enumValues
      };
    }
  }

  return { valid: true };
}

/**
 * XS標準型のバリデーション
 * @param {string} type - XS型名
 * @param {string} value - チェックする値
 * @returns {Object} バリデーション結果
 */
function validateXsType(type, value) {
  switch (type) {
    case 'xs:string':
      return { valid: true };

    case 'xs:positiveInteger':
      const posInt = parseInt(value);
      if (isNaN(posInt) || posInt <= 0) {
        return { valid: false, error: '正の整数である必要があります' };
      }
      return { valid: true };

    case 'xs:double':
    case 'xs:decimal':
      const num = parseFloat(value);
      if (isNaN(num)) {
        return { valid: false, error: '数値である必要があります' };
      }
      return { valid: true };

    case 'xs:boolean':
      if (!['true', 'false'].includes(value.toLowerCase())) {
        return {
          valid: false,
          error: 'true または false である必要があります',
          suggestions: ['true', 'false']
        };
      }
      return { valid: true };

    default:
      return { valid: true }; // 未知の型はスキップ
  }
}

/**
 * カスタム型の列挙値を取得
 * @param {string} typeName - 型名
 * @returns {Array<string>} 列挙値の配列
 */
function getEnumerationValues(typeName) {
  if (!xsdSchema) return [];

  // カスタム型の定義を検索
  const simpleType = xsdSchema.querySelector(
    `xs\\:simpleType[name="${typeName}"], simpleType[name="${typeName}"]`
  );
  if (!simpleType) return [];

  // 列挙値を取得
  const enumerations = simpleType.querySelectorAll(
    'xs\\:enumeration, enumeration'
  );
  return Array.from(enumerations)
    .map((enumElement) => enumElement.getAttribute('value'))
    .filter((v) => v);
}

// getAttributeTypeInfo関数は削除されました（未使用のため）

/**
 * 指定された要素タイプ・属性名が列挙値を持つかチェック
 * @param {string} elementType - 要素タイプ名 (StbColumn等)
 * @param {string} attributeName - 属性名
 * @returns {boolean} 列挙値を持つかどうか
 */
export function hasEnumerationValues(elementType, attributeName) {
  const attrInfo = getAttributeInfo(elementType, attributeName);
  if (!attrInfo || !attrInfo.type) return false;

  const enumValues = getEnumerationValues(attrInfo.type);
  return enumValues.length > 0;
}

// getAttributeConstraints関数は削除されました（未使用のため）

/**
 * 要素の必須属性が全て設定されているかチェック
 * @param {string} elementType - 要素タイプ名
 * @param {Object} attributes - 現在の属性値オブジェクト
 * @returns {Array<string>} 未設定の必須属性名の配列
 */
export function getMissingRequiredAttributes(elementType, attributes) {
  const elementDef = elementDefinitions.get(elementType);
  if (!elementDef) return [];

  const missing = [];
  elementDef.attributes.forEach((attrInfo, attrName) => {
    if (
      attrInfo.required &&
      (!attributes[attrName] || attributes[attrName].trim() === '')
    ) {
      missing.push(attrName);
    }
  });

  return missing;
}

/**
 * 要素の全属性をXSDスキーマに基づいてバリデーション
 * @param {string} elementType - 要素タイプ名
 * @param {Object} attributes - 属性値オブジェクト
 * @returns {Object} バリデーション結果 {valid: boolean, errors: Array<{attr: string, error: string}>}
 */
export function validateElement(elementType, attributes) {
  const errors = [];

  // 必須属性チェック
  const missing = getMissingRequiredAttributes(elementType, attributes);
  missing.forEach((attr) => {
    errors.push({ attr, error: '必須属性が未設定です' });
  });

  // 各属性値のバリデーション
  Object.entries(attributes).forEach(([attrName, value]) => {
    const result = validateAttributeValue(elementType, attrName, value);
    if (!result.valid) {
      errors.push({
        attr: attrName,
        error: result.error,
        suggestions: result.suggestions
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/**
 * 型参照を解決して属性を取得する
 * @param {string} typeRef - 型参照名
 * @param {Set<string>} visited - 循環参照防止のための訪問済み型セット
 * @returns {Map<string, Object>|null} 属性定義のマップ
 */
function resolveTypeReference(typeRef, visited = new Set()) {
  if (!xsdSchema) {
    console.error('resolveTypeReference: xsdSchema is null');
    return null;
  }

  console.log(`Resolving type reference: ${typeRef}`);

  // 名前空間プレフィックスを除去
  const typeName = typeRef.includes(':') ? typeRef.split(':')[1] : typeRef;

  // ビルトイン型（xs:string, xs:double等）の場合は解決しない
  if (typeRef.startsWith('xs:') || typeRef.startsWith('xsd:')) {
    console.log(`Skipping built-in type: ${typeRef}`);
    return null;
  }

  // 循環参照のチェック
  if (visited.has(typeName)) {
    console.log(`Circular reference detected for type: ${typeName}`);
    return null;
  }

  visited.add(typeName);

  // complexType定義を検索
  const complexType = xsdSchema.querySelector(
    `xs\\:complexType[name="${typeName}"], complexType[name="${typeName}"]`
  );

  if (!complexType) {
    console.log(`Complex type ${typeName} not found`);
    visited.delete(typeName);
    return null;
  }

  console.log(`Found complex type definition for: ${typeName}`);

  const attributes = new Map();

  // 属性定義を取得
  const attributeElements = complexType.querySelectorAll(
    'xs\\:attribute, attribute'
  );

  console.log(
    `Found ${attributeElements.length} attributes in complex type ${typeName}`
  );

  attributeElements.forEach((attr) => {
    const attrName = attr.getAttribute('name');
    const attrType = attr.getAttribute('type');
    const use = attr.getAttribute('use') || 'optional';
    const defaultValue = attr.getAttribute('default');
    const fixed = attr.getAttribute('fixed');

    // ドキュメントやアノテーションを取得
    const documentation = getDocumentation(attr);

    if (attrName) {
      attributes.set(attrName, {
        name: attrName,
        type: attrType,
        required: use === 'required',
        default: defaultValue,
        fixed: fixed,
        documentation: documentation
      });

      console.log(`  Added type reference attribute: ${attrName} (${use})`);
    }
  });

  // 基底型からの継承も考慮
  const extension = complexType.querySelector('xs\\:extension, extension');
  if (extension) {
    const baseType = extension.getAttribute('base');
    console.log(`Found extension base type: ${baseType} for ${typeName}`);

    const baseAttributes = resolveTypeReference(baseType, visited);
    if (baseAttributes) {
      console.log(
        `Inherited ${baseAttributes.size} attributes from base type ${baseType}`
      );
      baseAttributes.forEach((attrDef, attrName) => {
        if (!attributes.has(attrName)) {
          attributes.set(attrName, attrDef);
          console.log(`  Inherited attribute: ${attrName}`);
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
function resolveAttributeGroupReference(ref) {
  if (!xsdSchema) {
    console.error('resolveAttributeGroupReference: xsdSchema is null');
    return null;
  }

  // 名前空間プレフィックスを除去
  const groupName = ref.includes(':') ? ref.split(':')[1] : ref;

  console.log(`Resolving attribute group: ${groupName}`);

  // attributeGroup要素を検索
  const attributeGroup = xsdSchema.querySelector(
    `xs\\:attributeGroup[name="${groupName}"], attributeGroup[name="${groupName}"]`
  );

  if (!attributeGroup) {
    console.warn(`Attribute group not found: ${groupName}`);
    return null;
  }

  console.log(`Found attribute group definition for: ${groupName}`);

  const attributes = new Map();

  // 属性定義を取得
  const attributeElements = attributeGroup.querySelectorAll(
    'xs\\:attribute, attribute'
  );

  console.log(
    `Found ${attributeElements.length} attributes in attribute group ${groupName}`
  );

  attributeElements.forEach((attr) => {
    const attrName = attr.getAttribute('name');
    const attrType = attr.getAttribute('type');
    const use = attr.getAttribute('use') || 'optional';
    const defaultValue = attr.getAttribute('default');
    const fixed = attr.getAttribute('fixed');

    // ドキュメントやアノテーションを取得
    const documentation = getDocumentation(attr);

    if (attrName) {
      attributes.set(attrName, {
        name: attrName,
        type: attrType,
        required: use === 'required',
        default: defaultValue,
        fixed: fixed,
        documentation: documentation
      });

      console.log(`  Added attribute: ${attrName} (${use})`);
    }
  });

  return attributes;
}

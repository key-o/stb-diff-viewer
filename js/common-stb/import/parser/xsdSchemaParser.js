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

// グローバルにスキーマ情報を保持（バージョン別管理）
const xsdSchemas = new Map(); // version -> Document
const elementDefinitionsByVersion = new Map(); // version -> Map<elementName, definition>
const simpleTypesByVersion = new Map(); // version -> Map<typeName, simpleTypeDef>
let choiceGroupCounter = 0;
let activeVersion = '2.0.2'; // デフォルトバージョン
let schemaBootstrapPromise = null;

// 後方互換性のためのエイリアス（既存コードで使用）
let xsdSchema = null;
let elementDefinitions = new Map();

/**
 * XSDスキーマ群を一度だけ初期化する
 * - 2.0.2 と 2.1.0 を事前読込
 * - 既定アクティブ版を設定
 *
 * @param {Object} options
 * @param {Array<string>} [options.preloadVersions] - 事前読込するバージョン一覧
 * @param {string} [options.defaultActiveVersion] - 既定で有効化するバージョン
 * @returns {Promise<boolean>} 少なくとも1つ読込できた場合 true
 */
export async function initializeXsdSchemas(options = {}) {
  const { preloadVersions = ['2.0.2', '2.1.0'], defaultActiveVersion = '2.0.2' } = options;

  if (schemaBootstrapPromise) {
    return schemaBootstrapPromise;
  }

  const uniqueVersions = [...new Set(preloadVersions.filter(Boolean))];

  schemaBootstrapPromise = (async () => {
    const results = await Promise.all(
      uniqueVersions.map((version) => loadXsdSchemaForVersion(version)),
    );
    const hasAnyLoaded = results.some(Boolean);

    if (!hasAnyLoaded) {
      return false;
    }

    const preferredVersion =
      uniqueVersions.includes(defaultActiveVersion) && isVersionLoaded(defaultActiveVersion)
        ? defaultActiveVersion
        : uniqueVersions.find((version) => isVersionLoaded(version));

    if (preferredVersion) {
      setActiveVersion(preferredVersion);
    }

    return true;
  })().catch((error) => {
    console.error('Error initializing XSD schemas:', error);
    schemaBootstrapPromise = null;
    return false;
  });

  return schemaBootstrapPromise;
}

/**
 * XSDファイルを読み込み、スキーマ情報を解析する
 * 後方互換性のため、デフォルトでv2.0.2を読み込みます
 * @param {string} _xsdUrl - XSDファイルのURL（オプション、使用されません）
 * @returns {Promise<boolean>} 読み込み成功可否
 */
export async function loadXsdSchema(_xsdUrl = null) {
  debugLog(`[XSD] loadXsdSchema called (backward compatibility mode)`);

  // デフォルトでv2.0.2を読み込む
  const success = await loadXsdSchemaForVersion('2.0.2');

  if (success) {
    // アクティブバージョンを2.0.2に設定
    setActiveVersion('2.0.2');
  }

  return success;
}

/**
 * 指定バージョンのXSDスキーマを読み込む（バージョン別管理対応）
 * @param {string} version - STBバージョン ('2.0.2' | '2.1.0')
 * @returns {Promise<boolean>} 読み込み成功可否
 */
export async function loadXsdSchemaForVersion(version) {
  // 既に読み込み済みの場合はスキップ
  if (xsdSchemas.has(version)) {
    debugLog(`[XSD] Schema ${version} already loaded, reusing cached version`);
    return true;
  }

  const xsdFilename = version === '2.1.0' ? 'ST-Bridge210.xsd' : 'ST-Bridge202.xsd';
  const xsdPath = `./schemas/${xsdFilename}`;

  try {
    debugLog(`[XSD] Loading XSD schema for version ${version} from: ${xsdPath}`);

    // 複数のパス候補を試す
    const pathCandidates = [
      xsdPath,
      `./schemas/${xsdFilename}`,
      `../schemas/${xsdFilename}`,
      `./materials/${xsdFilename}`,
      `../materials/${xsdFilename}`,
    ];

    let response = null;
    let successUrl = null;

    for (const candidate of pathCandidates) {
      try {
        debugLog(`[XSD] Trying path: ${candidate}`);
        response = await fetch(candidate);
        debugLog(
          `[XSD] Fetch response for ${candidate}: status=${response.status}, ok=${response.ok}`,
        );

        if (response.ok) {
          successUrl = candidate;
          break;
        }
      } catch (fetchError) {
        debugLog(`[XSD] Fetch failed for ${candidate}: ${fetchError.message}`);
        continue;
      }
    }

    if (!response || !response.ok) {
      throw new Error(
        `Failed to fetch XSD ${version} from any candidate paths. Last status: ${response?.status} ${response?.statusText}`,
      );
    }

    debugLog(`[XSD] Successfully loaded ${version} from: ${successUrl}`);

    const xsdText = await response.text();
    debugLog(`XSD ${version} text loaded, length: ${xsdText.length} characters`);

    const parser = new DOMParser();
    const xsdDoc = parser.parseFromString(xsdText, 'application/xml');

    const parseError = xsdDoc.querySelector('parsererror');
    if (parseError) {
      console.error(`XSD ${version} Parse error:`, parseError.textContent);
      throw new Error(`Failed to parse XSD file for version ${version}`);
    }

    debugLog(`XSD ${version} parsed successfully, analyzing element definitions...`);

    // バージョン別にスキーマを保存
    xsdSchemas.set(version, xsdDoc);

    // 要素定義を解析してバージョン別に保存
    parseElementDefinitionsForVersion(version, xsdDoc);

    const versionDefs = elementDefinitionsByVersion.get(version);
    debugLog(
      `XSD schema ${version} loaded successfully. Found ${versionDefs?.size || 0} element definitions.`,
    );

    return true;
  } catch (error) {
    console.error(`Error loading XSD schema for version ${version}:`, error);
    return false;
  }
}

/**
 * アクティブなXSDバージョンを設定
 * @param {string} version - STBバージョン ('2.0.2' | '2.1.0')
 */
export function setActiveVersion(version) {
  if (!xsdSchemas.has(version)) {
    console.warn(
      `[XSD] Version ${version} not loaded yet. Please load it first with loadXsdSchemaForVersion().`,
    );
    return;
  }

  activeVersion = version;

  // 後方互換性のため、グローバル変数を更新
  xsdSchema = xsdSchemas.get(version);
  elementDefinitions = elementDefinitionsByVersion.get(version) || new Map();

  debugLog(`[XSD] Active version set to: ${version}`);
}

/**
 * 現在のアクティブバージョンを取得
 * @returns {string} 現在のバージョン
 */
export function getActiveVersion() {
  return activeVersion;
}

/**
 * 指定バージョンが読み込まれているかチェック
 * @param {string} version - STBバージョン
 * @returns {boolean} 読み込み状態
 */
export function isVersionLoaded(version) {
  return xsdSchemas.has(version);
}

/**
 * バージョン別に要素定義を解析
 * @param {string} version - STBバージョン
 * @param {Document} xsdDoc - XSD Document
 */
function parseElementDefinitionsForVersion(version, xsdDoc) {
  if (!xsdDoc) {
    console.error(`parseElementDefinitionsForVersion: xsdDoc is null for version ${version}`);
    return;
  }

  debugLog(`Starting parseElementDefinitionsForVersion for ${version}...`);

  // バージョン別のMapを初期化
  if (!elementDefinitionsByVersion.has(version)) {
    elementDefinitionsByVersion.set(version, new Map());
  }

  const versionElementDefs = elementDefinitionsByVersion.get(version);

  // 一時的にグローバル変数を設定（既存の解析ロジックを再利用）
  const originalSchema = xsdSchema;

  xsdSchema = xsdDoc;
  elementDefinitions.clear();

  // simpleType定義を収集
  collectSimpleTypes(version, xsdDoc);

  // 既存の解析ロジックを実行
  parseElementDefinitions();

  // 結果をバージョン別Mapにコピー
  elementDefinitions.forEach((def, name) => {
    versionElementDefs.set(name, def);
  });

  // グローバル変数を復元
  xsdSchema = originalSchema;
  if (originalSchema && elementDefinitionsByVersion.has(activeVersion)) {
    elementDefinitions.clear();
    elementDefinitionsByVersion.get(activeVersion).forEach((def, name) => {
      elementDefinitions.set(name, def);
    });
  }

  debugLog(
    `Completed parseElementDefinitionsForVersion for ${version}. Found ${versionElementDefs.size} elements.`,
  );
}

/**
 * スキーマから要素定義を解析し、elementDefinitionsに格納する
 */
function parseElementDefinitions() {
  if (!xsdSchema) {
    console.error('parseElementDefinitions: xsdSchema is null');
    return;
  }

  debugLog('Starting parseElementDefinitions...');

  // 要素定義を直接取得（name属性を持つもの）
  const elements = xsdSchema.querySelectorAll('xs\\:element[name], element[name]');

  debugLog(`Found ${elements.length} named elements`);

  elements.forEach((element) => {
    const elementName = element.getAttribute('name');
    if (!elementName || !elementName.startsWith('Stb')) {
      return;
    }

    debugLog(`Processing element: ${elementName}`);

    const attributes = new Map();

    // 型参照がある場合の処理
    const typeRef = element.getAttribute('type');
    if (typeRef) {
      debugLog(`Element ${elementName} has type reference: ${typeRef}`);

      // 型参照を解決して属性を取得
      const typeAttributes = resolveTypeReference(typeRef);
      if (typeAttributes) {
        debugLog(`Resolved ${typeAttributes.size} attributes from type reference ${typeRef}`);
        typeAttributes.forEach((attrDef, attrName) => {
          if (!attributes.has(attrName)) {
            attributes.set(attrName, attrDef);
            debugLog(
              `  Added type attribute: ${attrName} (${attrDef.required ? 'required' : 'optional'})`,
            );
          }
        });
      } else {
        debugLog(`Failed to resolve type reference: ${typeRef}`);
      }
    }

    // 直接の属性定義を取得
    const attributeElements = element.querySelectorAll('xs\\:attribute, attribute');

    debugLog(`Found ${attributeElements.length} direct attributes for ${elementName}`);

    attributeElements.forEach((attr) => {
      const attrDef = parseAttributeDef(attr);
      if (attrDef.name && !attributes.has(attrDef.name)) {
        attributes.set(attrDef.name, attrDef);
        debugLog(
          `  Added attribute: ${attrDef.name} (${attrDef.required ? 'required' : 'optional'})`,
        );
      }
    });

    // complexTypeの場合、内部の属性も処理
    const complexType = element.querySelector('xs\\:complexType, complexType');
    if (complexType) {
      const complexAttributes = complexType.querySelectorAll('xs\\:attribute, attribute');

      debugLog(`Found ${complexAttributes.length} complex type attributes for ${elementName}`);

      complexAttributes.forEach((attr) => {
        const attrDef = parseAttributeDef(attr);
        if (attrDef.name && !attributes.has(attrDef.name)) {
          attributes.set(attrDef.name, attrDef);
          debugLog(
            `  Added complex type attribute: ${attrDef.name} (${attrDef.required ? 'required' : 'optional'})`,
          );
        }
      });

      // attributeGroup参照の処理
      const attributeGroups = complexType.querySelectorAll(
        'xs\\:attributeGroup[ref], attributeGroup[ref]',
      );

      debugLog(`Found ${attributeGroups.length} attribute group references for ${elementName}`);

      attributeGroups.forEach((attrGroup) => {
        const ref = attrGroup.getAttribute('ref');
        if (ref) {
          debugLog(`  Processing attribute group reference: ${ref}`);
          const groupAttributes = resolveAttributeGroupReference(ref);
          if (groupAttributes) {
            debugLog(`  Resolved ${groupAttributes.size} attributes from attribute group ${ref}`);
            groupAttributes.forEach((attrDef, attrName) => {
              if (!attributes.has(attrName)) {
                attributes.set(attrName, attrDef);
                debugLog(`    Added attribute group attribute: ${attrName}`);
              }
            });
          } else {
            debugLog(`  Failed to resolve attribute group reference: ${ref}`);
          }
        }
      });
    }

    // 子要素の定義を解析
    const children = new Map();
    if (complexType) {
      parseChildElements(complexType, children, new Set(), 0);
    }

    elementDefinitions.set(elementName, {
      name: elementName,
      attributes: attributes,
      children: children,
      documentation: getDocumentation(element),
    });

    debugLog(`Registered element definition: ${elementName} with ${attributes.size} attributes`);

    // StbColumnの詳細ログ
    if (elementName === 'StbColumn') {
      debugLog(`=== StbColumn Debug Info ===`);
      debugLog(`Type reference: ${element.getAttribute('type')}`);
      debugLog(`Direct attributes: ${attributeElements.length}`);
      debugLog(`Has complexType: ${!!complexType}`);
      debugLog(`Final attribute count: ${attributes.size}`);
      if (attributes.size > 0) {
        debugLog(`Attributes:`, Array.from(attributes.keys()));
      }
      debugLog(`=== End StbColumn Debug ===`);
    }
  });

  // 複合型の定義も処理（名前空間考慮）
  const complexTypes = xsdSchema.querySelectorAll('xs\\:complexType[name], complexType[name]');

  debugLog(`Found ${complexTypes.length} named complex types`);

  complexTypes.forEach((complexType) => {
    const typeName = complexType.getAttribute('name');
    if (!typeName || !typeName.startsWith('Stb')) {
      return;
    }

    debugLog(`Processing complex type: ${typeName}`);

    // 既に要素定義として処理されている場合はスキップ
    if (elementDefinitions.has(typeName)) {
      debugLog(`Skipping ${typeName} - already processed as element`);
      return;
    }

    const attributes = new Map();

    // 属性定義を取得
    const attributeElements = complexType.querySelectorAll('xs\\:attribute, attribute');

    debugLog(`Found ${attributeElements.length} attributes for complex type ${typeName}`);

    attributeElements.forEach((attr) => {
      const attrDef = parseAttributeDef(attr);
      if (attrDef.name) {
        attributes.set(attrDef.name, attrDef);
        debugLog(
          `  Added attribute: ${attrDef.name} (${attrDef.required ? 'required' : 'optional'})`,
        );
      }
    });

    // 基底型からの継承も考慮
    const extension = complexType.querySelector('xs\\:extension, extension');
    if (extension) {
      const baseType = extension.getAttribute('base');
      debugLog(`Found extension base type: ${baseType} for ${typeName}`);

      // 基底型の属性を追加
      const baseAttributes = resolveTypeReference(baseType, new Set());
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

    // 子要素の定義を解析
    const children = new Map();
    parseChildElements(complexType, children, new Set(), 0);

    elementDefinitions.set(typeName, {
      name: typeName,
      attributes: attributes,
      children: children,
      documentation: getDocumentation(complexType),
    });

    debugLog(`Registered complex type definition: ${typeName} with ${attributes.size} attributes`);
  });
}

/**
 * simpleType定義を収集しバージョン別に保存
 * @param {string} version - STBバージョン
 * @param {Document} xsdDoc - XSD Document
 */
function collectSimpleTypes(version, xsdDoc) {
  if (!simpleTypesByVersion.has(version)) {
    simpleTypesByVersion.set(version, new Map());
  }
  const versionTypes = simpleTypesByVersion.get(version);

  const simpleTypes = xsdDoc.querySelectorAll('xs\\:simpleType[name], simpleType[name]');
  simpleTypes.forEach((st) => {
    const name = st.getAttribute('name');
    if (!name) return;

    // トップレベルのsimpleTypeのみ（schema直下）
    const parent = st.parentNode;
    const parentLN = parent?.localName || parent?.nodeName?.replace(/^.*:/, '');
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
 * restriction内のファセット（制約）を解析（ブラウザ版）
 * @param {Element} restriction - restriction要素
 * @param {Object} typeDef - ファセットを格納するオブジェクト
 */
function parseRestrictionFacetsBrowser(restriction, typeDef) {
  for (let i = 0; i < restriction.childNodes.length; i++) {
    const node = restriction.childNodes[i];
    if (node.nodeType !== 1) continue;

    const localName = node.localName || node.nodeName.replace(/^.*:/, '');
    const value = node.getAttribute('value');

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

/**
 * 属性要素から属性定義を解析する共通ヘルパー
 * @param {Element} attr - xs:attribute要素
 * @returns {Object} 属性定義
 */
function parseAttributeDef(attr) {
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
 * 要素からドキュメント情報を取得
 * @param {Element} element - XML要素
 * @returns {string|null} ドキュメント文字列
 */
function getDocumentation(element) {
  const annotation = element.querySelector('xs\\:annotation, annotation');
  if (!annotation) return null;

  const documentation = annotation.querySelector('xs\\:documentation, documentation');
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
    XSD_DEBUG &&
    (!getElementAttributes._lastLog[elementType] ||
      now - getElementAttributes._lastLog[elementType] > 5000); // 5秒間隔

  if (shouldLog) {
    debugLog(`getElementAttributes called for: ${elementType}`);
    getElementAttributes._lastLog[elementType] = now;
  }

  const definition = elementDefinitions.get(elementType);
  if (definition) {
    if (shouldLog) {
      debugLog(`Found definition for ${elementType}, attributes:`, definition.attributes.size);
    }
    return definition.attributes;
  } else {
    if (shouldLog) {
      debugLog(`No definition found for ${elementType}`);
      debugLog(`Total definitions available: ${elementDefinitions.size}`);

      // StbColumnが見つからない場合は、類似の要素を検索
      if (elementType === 'StbColumn') {
        const columnRelated = Array.from(elementDefinitions.keys()).filter((key) =>
          key.toLowerCase().includes('column'),
        );
        debugLog(`Column-related elements found:`, columnRelated.slice(0, 5));
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

// clearSchema関数は削除されました（未使用のため）

// debugPrintSchema関数は削除されました（未使用のため）

/**
 * 要素の子要素定義を取得
 * @param {string} elementType - 要素タイプ名（例: 'StbColumn', 'StbGirder'）
 * @returns {Map<string, Object>|null} 子要素定義のマップ
 */
export function getElementChildren(elementType) {
  debugLog(`getElementChildren called for: ${elementType}`);

  const definition = elementDefinitions.get(elementType);
  if (definition && definition.children) {
    debugLog(`Found ${definition.children.size} children for ${elementType}`);
    return definition.children;
  }

  debugLog(`No children found for ${elementType}`);
  return null;
}

/**
 * 要素の完全な定義を取得（属性と子要素を含む）
 * @param {string} elementType - 要素タイプ名
 * @returns {Object|null} 要素定義 {name, attributes, children, documentation}
 */
export function getElementDefinition(elementType) {
  debugLog(`getElementDefinition called for: ${elementType}`);

  const definition = elementDefinitions.get(elementType);
  if (definition) {
    debugLog(
      `Found definition for ${elementType}: ${definition.attributes.size} attributes, ${definition.children?.size || 0} children`,
    );
    return definition;
  }

  debugLog(`No definition found for ${elementType}`);
  return null;
}

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
        suggestions: enumValues,
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
          suggestions: ['true', 'false'],
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
    `xs\\:simpleType[name="${typeName}"], simpleType[name="${typeName}"]`,
  );
  if (!simpleType) return [];

  // 列挙値を取得
  const enumerations = simpleType.querySelectorAll('xs\\:enumeration, enumeration');
  return Array.from(enumerations)
    .map((enumElement) => enumElement.getAttribute('value'))
    .filter((v) => v);
}

// getAttributeTypeInfo関数は削除されました（未使用のため）

// getAttributeConstraints関数は削除されました（未使用のため）

/**
 * 要素の必須属性が全て設定されているかチェック
 * @param {string} elementType - 要素タイプ名
 * @param {Object} attributes - 現在の属性値オブジェクト
 * @returns {Array<string>} 未設定の必須属性名の配列
 */
function getMissingRequiredAttributes(elementType, attributes) {
  const elementDef = elementDefinitions.get(elementType);
  if (!elementDef) return [];

  const missing = [];
  elementDef.attributes.forEach((attrInfo, attrName) => {
    if (attrInfo.required && (!attributes[attrName] || attributes[attrName].trim() === '')) {
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
        suggestions: result.suggestions,
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors: errors,
  };
}

/**
 * complexType要素から子要素を再帰的に解析する
 * @param {Element} complexTypeElement - complexType要素
 * @param {Map<string, Object>} childrenMap - 子要素定義を格納するマップ
 * @param {Set<string>} visited - 循環参照防止のための訪問済み要素セット
 * @param {number} depth - 現在の再帰深度
 */
function parseChildElements(complexTypeElement, childrenMap, visited, depth) {
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
    const localName = child.localName || child.nodeName.replace(/^.*:/, '');

    if (localName === 'sequence' || localName === 'choice' || localName === 'all') {
      processContainerChildren(child, childrenMap, visited, depth + 1, null);
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
      const localName = child.localName || child.nodeName.replace(/^.*:/, '');

      if (localName === 'sequence' || localName === 'choice' || localName === 'all') {
        processContainerChildren(child, childrenMap, visited, depth + 1, null);
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

  const localName = container.localName || container.nodeName.replace(/^.*:/, '');
  const isChoice = localName === 'choice';
  const currentChoiceGroup = isChoice ? `choice_${choiceGroupCounter++}` : parentChoiceGroup;

  debugLog(`Processing ${localName} container (choiceGroup: ${currentChoiceGroup})`);

  for (let i = 0; i < container.childNodes.length; i++) {
    const child = container.childNodes[i];
    if (child.nodeType !== 1) continue;
    const childLN = child.localName || child.nodeName.replace(/^.*:/, '');

    if (childLN === 'element') {
      const childDef = parseElementChild(child, visited);
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
      const ref = child.getAttribute('ref');
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
      processContainerChildren(child, childrenMap, visited, depth + 1, currentChoiceGroup);
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
  if (!xsdSchema) {
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
  const element = xsdSchema.querySelector(
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
  if (!xsdSchema || depth >= MAX_DEPTH) {
    return null;
  }

  // 名前空間プレフィックスを除去
  const groupName = ref.includes(':') ? ref.split(':')[1] : ref;

  debugLog(`Resolving group reference: ${groupName}`);

  // group要素を検索
  const group = xsdSchema.querySelector(
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
  if (!xsdSchema || depth >= MAX_DEPTH) {
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
  const complexType = xsdSchema.querySelector(
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
  const complexType = xsdSchema.querySelector(
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
function resolveAttributeGroupReference(ref) {
  if (!xsdSchema) {
    console.error('resolveAttributeGroupReference: xsdSchema is null');
    return null;
  }

  // 名前空間プレフィックスを除去
  const groupName = ref.includes(':') ? ref.split(':')[1] : ref;

  debugLog(`Resolving attribute group: ${groupName}`);

  // attributeGroup要素を検索
  const attributeGroup = xsdSchema.querySelector(
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

/**
 * 指定バージョンのsimpleType定義を取得
 * @param {string} version - STBバージョン
 * @param {string} typeName - 型名
 * @returns {Object|null} simpleType定義
 */
export function getSimpleTypeForVersion(version, typeName) {
  const versionTypes = simpleTypesByVersion.get(version);
  return versionTypes ? versionTypes.get(typeName) || null : null;
}

/**
 * アクティブバージョンのsimpleType定義を取得
 * @param {string} typeName - 型名
 * @returns {Object|null} simpleType定義
 */
export function getSimpleType(typeName) {
  return getSimpleTypeForVersion(activeVersion, typeName);
}

/**
 * 指定バージョンの全simpleType定義を取得
 * @param {string} [version] - STBバージョン（省略時はアクティブバージョン）
 * @returns {Map<string, Object>} simpleType定義のMap
 */
export function getSimpleTypes(version) {
  const v = version || activeVersion;
  return simpleTypesByVersion.get(v) || new Map();
}

/**
 * 指定バージョンの要素定義を取得
 * @param {string} version - STBバージョン
 * @param {string} elementType - 要素タイプ名
 * @returns {Object|null} 要素定義
 */
export function getElementDefinitionForVersion(version, elementType) {
  const versionDefs = elementDefinitionsByVersion.get(version);
  return versionDefs ? versionDefs.get(elementType) || null : null;
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

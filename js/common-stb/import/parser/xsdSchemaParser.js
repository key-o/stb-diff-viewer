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
 * クエリ・バリデーションAPIは xsdSchemaQueryApi.js に、
 * 型解決・子要素解析ロジックは xsdTypeResolver.js に分離しています。
 * 本モジュールがスキーマのライフサイクル管理と解析オーケストレーションを担い、
 * サブモジュールの関数を再エクスポートします。
 */

import { createLogger } from '../../../utils/logger.js';

// サブモジュール
import {
  _setSharedState as _setQueryApiState,
  getElementAttributes,
  getAllAttributeNames,
  getAttributeInfo,
  isSchemaLoaded,
  getElementChildren,
  getElementDefinition,
  getElementDefinitionForVersion,
  validateAttributeValue,
  validateElement,
} from './xsdSchemaQueryApi.js';

import {
  _setSharedState as _setTypeResolverState,
  stripNsPrefix,
  collectSimpleTypes,
  getSimpleTypeForVersion,
  getSimpleType,
  getSimpleTypes,
  parseAttributeDef,
  getDocumentation,
  parseChildElements,
  resolveTypeReference,
  resolveAttributeGroupReference,
} from './xsdTypeResolver.js';

const log = createLogger('common-stb:import:parser:xsdSchemaParser');
const XSD_DEBUG = false;

function debugLog(..._args) {
  if (XSD_DEBUG) {
    // console.log(..._args); // デバッグ時はコメント解除
  }
}

// グローバルにスキーマ情報を保持（バージョン別管理）
const xsdSchemas = new Map(); // version -> Document
const elementDefinitionsByVersion = new Map(); // version -> Map<elementName, definition>
const simpleTypesByVersion = new Map(); // version -> Map<typeName, simpleTypeDef>
let activeVersion = '2.0.2'; // デフォルトバージョン
let schemaBootstrapPromise = null;

// 後方互換性のためのエイリアス（既存コードで使用）
let xsdSchema = null;
let elementDefinitions = new Map();

/**
 * サブモジュールに現在の共有状態を注入する
 */
function syncSubModuleState() {
  _setQueryApiState({
    xsdSchema,
    elementDefinitions,
    elementDefinitionsByVersion,
    activeVersion,
  });
  _setTypeResolverState({
    xsdSchema,
    simpleTypesByVersion,
    activeVersion,
  });
}

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
      schemaBootstrapPromise = null;
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
    log.error('Error initializing XSD schemas:', error);
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
      log.error(`XSD ${version} Parse error:`, parseError.textContent);
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
    log.error(`Error loading XSD schema for version ${version}:`, error);
    return false;
  }
}

/**
 * アクティブなXSDバージョンを設定
 * @param {string} version - STBバージョン ('2.0.2' | '2.1.0')
 */
export function setActiveVersion(version) {
  if (!xsdSchemas.has(version)) {
    log.warn(
      `[XSD] Version ${version} not loaded yet. Please load it first with loadXsdSchemaForVersion().`,
    );
    return;
  }

  activeVersion = version;

  // 後方互換性のため、グローバル変数を更新
  xsdSchema = xsdSchemas.get(version);
  elementDefinitions = elementDefinitionsByVersion.get(version) || new Map();

  // サブモジュールに状態を同期
  syncSubModuleState();

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
 *
 * 注意: この関数はモジュールスコープ変数 (xsdSchema, elementDefinitions) を
 * 一時的に書き換えてサブモジュールに伝播するため、再入禁止です。
 * ブラウザの単一スレッド実行では問題ありませんが、呼び出し中に
 * setActiveVersion() が実行されると状態が不整合になります。
 *
 * @param {string} version - STBバージョン
 * @param {Document} xsdDoc - XSD Document
 */
function parseElementDefinitionsForVersion(version, xsdDoc) {
  if (!xsdDoc) {
    log.error(`parseElementDefinitionsForVersion: xsdDoc is null for version ${version}`);
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

  // サブモジュールに解析用の一時状態を注入
  syncSubModuleState();

  // simpleType定義を収集（xsdTypeResolver に委譲）
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

  // サブモジュールの状態も復元
  syncSubModuleState();

  debugLog(
    `Completed parseElementDefinitionsForVersion for ${version}. Found ${versionElementDefs.size} elements.`,
  );
}

/**
 * スキーマから要素定義を解析し、elementDefinitionsに格納する
 *
 * 内部で xsdTypeResolver の関数（parseAttributeDef, resolveTypeReference,
 * resolveAttributeGroupReference, parseChildElements, getDocumentation）を使用。
 */
function parseElementDefinitions() {
  if (!xsdSchema) {
    log.error('parseElementDefinitions: xsdSchema is null');
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

      // 型参照を解決して属性を取得（xsdTypeResolver に委譲）
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

    // 子要素の定義を解析（xsdTypeResolver に委譲）
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

// ────────────────────────────────────────────
// サブモジュールからの再エクスポート
// ────────────────────────────────────────────

// xsdSchemaQueryApi.js のクエリ・バリデーションAPI
export {
  getElementAttributes,
  getAllAttributeNames,
  getAttributeInfo,
  isSchemaLoaded,
  getElementChildren,
  getElementDefinition,
  getElementDefinitionForVersion,
  validateAttributeValue,
  validateElement,
};

// xsdTypeResolver.js のユーティリティ
export { stripNsPrefix, getSimpleTypeForVersion, getSimpleType, getSimpleTypes };

/**
 * @fileoverview JSON Schema ローダー（ブラウザ版）
 *
 * ST-Bridge JSON Schema ファイルを読み込み、要素定義・属性定義を提供する。
 * xsdSchemaParser.js の JSON Schema 版。提供する API は互換性を維持。
 *
 * スキーマファイル:
 *   ./schemas/ST-Bridge210.schema.json  (version 2.1.0)
 *   ./schemas/ST-Bridge202.schema.json  (version 2.0.2)
 */

// ============================================================
// グローバル状態（バージョン別管理）
// ============================================================

const jsonSchemas = new Map(); // version -> parsed JSON schema object
const elementDefsByVersion = new Map(); // version -> Map<elementName, elementDef>
let activeVersion = '2.0.2';
let schemaBootstrapPromise = null;

// ============================================================
// 初期化 API
// ============================================================

/**
 * JSON スキーマ群を一度だけ初期化する
 * @param {Object} options
 * @param {Array<string>} [options.preloadVersions] - 事前読込するバージョン一覧
 * @param {string} [options.defaultActiveVersion] - 既定で有効化するバージョン
 * @returns {Promise<boolean>} 少なくとも1つ読込できた場合 true
 */
export async function initializeJsonSchemas(options = {}) {
  const { preloadVersions = ['2.0.2', '2.1.0'], defaultActiveVersion = '2.0.2' } = options;

  if (schemaBootstrapPromise) {
    return schemaBootstrapPromise;
  }

  const uniqueVersions = [...new Set(preloadVersions.filter(Boolean))];

  schemaBootstrapPromise = (async () => {
    const results = await Promise.all(uniqueVersions.map((v) => loadJsonSchemaForVersion(v)));
    const hasAnyLoaded = results.some(Boolean);

    if (!hasAnyLoaded) return false;

    const preferredVersion =
      uniqueVersions.includes(defaultActiveVersion) && isVersionLoaded(defaultActiveVersion)
        ? defaultActiveVersion
        : uniqueVersions.find((v) => isVersionLoaded(v));

    if (preferredVersion) setActiveVersion(preferredVersion);

    return true;
  })().catch((err) => {
    console.error('[JsonSchema] Error initializing schemas:', err);
    schemaBootstrapPromise = null;
    return false;
  });

  return schemaBootstrapPromise;
}

/**
 * 指定バージョンの JSON Schema を読み込む
 * @param {string} version - '2.0.2' | '2.1.0'
 * @returns {Promise<boolean>}
 */
export async function loadJsonSchemaForVersion(version) {
  if (jsonSchemas.has(version)) return true;

  const filename = version === '2.1.0' ? 'ST-Bridge210.schema.json' : 'ST-Bridge202.schema.json';
  const candidates = [`./schemas/${filename}`, `../schemas/${filename}`];

  for (const path of candidates) {
    try {
      const response = await fetch(path);
      if (!response.ok) continue;

      const schema = await response.json();
      jsonSchemas.set(version, schema);
      parseElementDefsForVersion(version, schema);
      return true;
    } catch {
      // try next candidate
    }
  }

  console.error(`[JsonSchema] Failed to load schema for version ${version}`);
  return false;
}

// ============================================================
// バージョン管理
// ============================================================

/**
 * アクティブバージョンを設定
 * @param {string} version
 */
export function setActiveVersion(version) {
  if (!jsonSchemas.has(version)) {
    console.warn(`[JsonSchema] Version ${version} not loaded yet.`);
    return;
  }
  activeVersion = version;
}

/** @returns {string} アクティブバージョン */
export function getActiveVersion() {
  return activeVersion;
}

/**
 * @param {string} version
 * @returns {boolean}
 */
export function isVersionLoaded(version) {
  return jsonSchemas.has(version);
}

/** @returns {boolean} 1バージョン以上読み込み済みか */
export function isSchemaLoaded() {
  return jsonSchemas.size > 0;
}

// ============================================================
// 内部パース
// ============================================================

/**
 * JSON Schema の $defs から要素定義を解析してキャッシュ
 * @param {string} version
 * @param {Object} schema - JSON Schema オブジェクト
 */
function parseElementDefsForVersion(version, schema) {
  const defs = schema.$defs || schema.definitions || {};
  const defMap = new Map();

  for (const [elemName, elemSchema] of Object.entries(defs)) {
    const required = new Set(Array.isArray(elemSchema.required) ? elemSchema.required : []);
    const properties = elemSchema.properties || {};
    const attributes = new Map();

    for (const [attrName, propSchema] of Object.entries(properties)) {
      attributes.set(attrName, buildAttrDef(attrName, propSchema, required));
    }

    defMap.set(elemName, {
      name: elemName,
      attributes,
      children: new Map(), // JSON Schema には子要素ツリーなし
      documentation: elemSchema.description || null,
    });
  }

  elementDefsByVersion.set(version, defMap);
}

/**
 * JSON Schema プロパティから attrDef オブジェクトを構築
 * @param {string} name
 * @param {Object} propSchema
 * @param {Set<string>} required - 必須属性セット
 * @returns {Object} attrDef
 */
function buildAttrDef(name, propSchema, required) {
  const constraints = buildConstraints(propSchema);

  return {
    name,
    type: propSchema.type || 'string',
    required: required.has(name),
    default: propSchema.default ?? null,
    fixed: propSchema.const ?? null,
    documentation: propSchema.description || null,
    constraints: hasConstraints(constraints) ? constraints : null,
  };
}

/**
 * JSON Schema プロパティから制約オブジェクトを構築
 */
function buildConstraints(propSchema) {
  return {
    enumerations: Array.isArray(propSchema.enum) ? propSchema.enum.map(String) : [],
    patterns: propSchema.pattern ? [propSchema.pattern] : [],
    minExclusive: propSchema.exclusiveMinimum ?? null,
    maxExclusive: propSchema.exclusiveMaximum ?? null,
    minInclusive: propSchema.minimum ?? null,
    maxInclusive: propSchema.maximum ?? null,
    minLength: propSchema.minLength ?? null,
  };
}

/** 有効な制約が1つ以上あるか */
function hasConstraints(c) {
  return (
    c.enumerations.length > 0 ||
    c.patterns.length > 0 ||
    c.minExclusive !== null ||
    c.maxExclusive !== null ||
    c.minInclusive !== null ||
    c.maxInclusive !== null ||
    c.minLength !== null
  );
}

// ============================================================
// 要素定義取得 API
// ============================================================

/**
 * 指定バージョンの要素定義を取得
 * @param {string} version
 * @param {string} elementType
 * @returns {Object|null}
 */
export function getElementDefinitionForVersion(version, elementType) {
  const defs = elementDefsByVersion.get(version);
  return defs ? (defs.get(elementType) ?? null) : null;
}

/**
 * アクティブバージョンの要素定義を取得
 * @param {string} elementType
 * @returns {Object|null}
 */
export function getElementDefinition(elementType) {
  return getElementDefinitionForVersion(activeVersion, elementType);
}

/**
 * 要素の属性定義マップを取得
 * @param {string} elementType
 * @returns {Map<string, Object>|null}
 */
export function getElementAttributes(elementType) {
  const def = getElementDefinition(elementType);
  return def ? def.attributes : null;
}

/**
 * 要素の全属性名を取得
 * @param {string} elementType
 * @returns {string[]}
 */
export function getAllAttributeNames(elementType) {
  const attrs = getElementAttributes(elementType);
  return attrs ? Array.from(attrs.keys()) : [];
}

/**
 * 属性の詳細情報を取得
 * @param {string} elementType
 * @param {string} attributeName
 * @returns {Object|null}
 */
export function getAttributeInfo(elementType, attributeName) {
  const attrs = getElementAttributes(elementType);
  return attrs ? (attrs.get(attributeName) ?? null) : null;
}

/**
 * 子要素定義を取得（JSON Schema では常に空 Map）
 * @param {string} elementType
 * @returns {Map}
 */
export function getElementChildren(elementType) {
  const def = getElementDefinition(elementType);
  return def ? def.children : new Map();
}

// ============================================================
// バリデーション API（xsdSchemaParser 互換）
// ============================================================

/**
 * 属性値を JSON Schema に基づいてバリデーション
 * @param {string} elementType
 * @param {string} attributeName
 * @param {string} value
 * @returns {{ valid: boolean, error?: string, suggestions?: string[] }}
 */
export function validateAttributeValue(elementType, attributeName, value) {
  const attrInfo = getAttributeInfo(elementType, attributeName);
  if (!attrInfo) {
    return { valid: false, error: '属性がスキーマで定義されていません' };
  }

  // 空値チェック
  if (!value || String(value).trim() === '') {
    if (attrInfo.required) return { valid: false, error: '必須属性です' };
    return { valid: true };
  }

  // fixed値チェック
  if (attrInfo.fixed !== null && attrInfo.fixed !== undefined) {
    if (String(value) !== String(attrInfo.fixed)) {
      return { valid: false, error: `値は '${attrInfo.fixed}' である必要があります` };
    }
    return { valid: true };
  }

  const c = attrInfo.constraints;

  // 列挙値チェック
  if (c && c.enumerations.length > 0) {
    if (!c.enumerations.includes(String(value))) {
      return {
        valid: false,
        error: '許可された値ではありません',
        suggestions: c.enumerations,
      };
    }
    return { valid: true };
  }

  // 型チェック
  const type = attrInfo.type;
  if (type === 'number' || type === 'integer') {
    const num = Number(value);
    if (isNaN(num)) return { valid: false, error: '数値である必要があります' };

    if (c) {
      if (c.minExclusive !== null && num <= c.minExclusive)
        return { valid: false, error: `値は ${c.minExclusive} より大きい必要があります` };
      if (c.maxExclusive !== null && num >= c.maxExclusive)
        return { valid: false, error: `値は ${c.maxExclusive} より小さい必要があります` };
      if (c.minInclusive !== null && num < c.minInclusive)
        return { valid: false, error: `値は ${c.minInclusive} 以上である必要があります` };
      if (c.maxInclusive !== null && num > c.maxInclusive)
        return { valid: false, error: `値は ${c.maxInclusive} 以下である必要があります` };
    }

    if (type === 'integer' && !Number.isInteger(num)) {
      return { valid: false, error: '整数である必要があります' };
    }
  } else if (type === 'boolean') {
    if (!['true', 'false'].includes(String(value).toLowerCase())) {
      return {
        valid: false,
        error: 'true または false である必要があります',
        suggestions: ['true', 'false'],
      };
    }
  }

  // パターンチェック
  if (c && c.patterns.length > 0) {
    const matched = c.patterns.some((p) => {
      try {
        return new RegExp(`^${p}$`).test(String(value));
      } catch {
        return true;
      }
    });
    if (!matched) return { valid: false, error: 'パターン制約に一致しません' };
  }

  // minLength チェック
  if (c && c.minLength !== null && String(value).length < c.minLength) {
    return { valid: false, error: `文字数が ${c.minLength} 以上である必要があります` };
  }

  return { valid: true };
}

/**
 * 要素の全属性をバリデーション
 * @param {string} elementType
 * @param {Object} attributes - {attrName: value}
 * @returns {{ valid: boolean, errors: Array<{attr, error, suggestions}> }}
 */
export function validateElement(elementType, attributes) {
  const def = getElementDefinition(elementType);
  const errors = [];

  if (def) {
    // 必須属性チェック
    for (const [attrName, attrDef] of def.attributes) {
      if (
        attrDef.required &&
        (!attributes[attrName] || String(attributes[attrName]).trim() === '')
      ) {
        errors.push({ attr: attrName, error: '必須属性が未設定です' });
      }
    }
  }

  // 各属性値のバリデーション
  for (const [attrName, value] of Object.entries(attributes)) {
    const result = validateAttributeValue(elementType, attrName, value);
    if (!result.valid) {
      errors.push({ attr: attrName, error: result.error, suggestions: result.suggestions });
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================
// 互換性のためのスタブ（XSD 専用の概念）
// ============================================================

/**
 * 名前空間プレフィックスを除去（互換性用 no-op）
 * @param {string} name
 * @returns {string}
 */
export function stripNsPrefix(name) {
  if (!name) return '';
  return name.includes(':') ? name.split(':').pop() : name;
}

/**
 * simpleType 定義を取得（JSON Schema では常に null）
 * @returns {null}
 */
export function getSimpleTypeForVersion(_version, _typeName) {
  return null;
}

/**
 * 全 simpleType 定義を取得（JSON Schema では常に空 Map）
 * @returns {Map}
 */
export function getSimpleTypes(_version) {
  return new Map();
}

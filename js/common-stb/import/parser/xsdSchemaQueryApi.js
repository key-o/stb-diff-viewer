/**
 * @fileoverview XSDスキーマクエリAPIモジュール
 *
 * 属性検索、要素定義の検索、スキーマ走査、バリデーションロジックなど、
 * XSDスキーマに対するクエリ・検証APIを提供します。
 *
 * **内部モジュール**: xsdSchemaParser.js から再エクスポートされます。
 * 外部からは xsdSchemaParser.js 経由でアクセスしてください。
 */

// デバッグログの有効/無効（本番環境では false）
const XSD_DEBUG = false;

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

/** @type {{ xsdSchema: Document|null, elementDefinitions: Map, elementDefinitionsByVersion: Map, activeVersion: string }} */
let _state = {
  xsdSchema: null,
  elementDefinitions: new Map(),
  elementDefinitionsByVersion: new Map(),
  activeVersion: '2.0.2',
};

/** @type {Record<string, number>} */
const elementAttributesLastLog = {};

/**
 * 共有状態を設定する（xsdSchemaParser から呼ばれる内部API）
 * @param {Object} state - 共有状態オブジェクト
 */
export function _setSharedState(state) {
  _state = state;
}

// ────────────────────────────────────────────
// 要素属性クエリAPI
// ────────────────────────────────────────────

/**
 * 指定された要素タイプの属性定義を取得
 * @param {string} elementType - 要素タイプ名（例: 'StbColumn', 'StbGirder'）
 * @returns {Map<string, Object>|null} 属性定義のマップ
 */
export function getElementAttributes(elementType) {
  // 短時間での重複ログを避けるため、最後のログ時刻を記録
  const now = Date.now();
  const shouldLog =
    XSD_DEBUG &&
    (!elementAttributesLastLog[elementType] || now - elementAttributesLastLog[elementType] > 5000); // 5秒間隔

  if (shouldLog) {
    debugLog(`getElementAttributes called for: ${elementType}`);
    elementAttributesLastLog[elementType] = now;
  }

  const definition = _state.elementDefinitions.get(elementType);
  if (definition) {
    if (shouldLog) {
      debugLog(`Found definition for ${elementType}, attributes:`, definition.attributes.size);
    }
    return definition.attributes;
  } else {
    if (shouldLog) {
      debugLog(`No definition found for ${elementType}`);
      debugLog(`Total definitions available: ${_state.elementDefinitions.size}`);

      // StbColumnが見つからない場合は、類似の要素を検索
      if (elementType === 'StbColumn') {
        const columnRelated = Array.from(_state.elementDefinitions.keys()).filter((key) =>
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
  return _state.xsdSchema !== null && _state.elementDefinitions.size > 0;
}

/**
 * 要素の子要素定義を取得
 * @param {string} elementType - 要素タイプ名（例: 'StbColumn', 'StbGirder'）
 * @returns {Map<string, Object>|null} 子要素定義のマップ
 */
export function getElementChildren(elementType) {
  debugLog(`getElementChildren called for: ${elementType}`);

  const definition = _state.elementDefinitions.get(elementType);
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

  const definition = _state.elementDefinitions.get(elementType);
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
 * 指定バージョンの要素定義を取得
 * @param {string} version - STBバージョン
 * @param {string} elementType - 要素タイプ名
 * @returns {Object|null} 要素定義
 */
export function getElementDefinitionForVersion(version, elementType) {
  const versionDefs = _state.elementDefinitionsByVersion.get(version);
  return versionDefs ? versionDefs.get(elementType) || null : null;
}

// ────────────────────────────────────────────
// バリデーションAPI
// ────────────────────────────────────────────

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
  if (value == null || String(value).trim() === '') {
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

    case 'xs:positiveInteger': {
      const posInt = parseInt(value);
      if (isNaN(posInt) || posInt <= 0) {
        return { valid: false, error: '正の整数である必要があります' };
      }
      return { valid: true };
    }

    case 'xs:double':
    case 'xs:decimal': {
      const num = parseFloat(value);
      if (isNaN(num)) {
        return { valid: false, error: '数値である必要があります' };
      }
      return { valid: true };
    }

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
  if (!_state.xsdSchema) return [];

  // カスタム型の定義を検索
  const simpleType = _state.xsdSchema.querySelector(
    `xs\\:simpleType[name="${typeName}"], simpleType[name="${typeName}"]`,
  );
  if (!simpleType) return [];

  // 列挙値を取得
  const enumerations = simpleType.querySelectorAll('xs\\:enumeration, enumeration');
  return Array.from(enumerations)
    .map((enumElement) => enumElement.getAttribute('value'))
    .filter((v) => v);
}

/**
 * 要素の必須属性が全て設定されているかチェック
 * @param {string} elementType - 要素タイプ名
 * @param {Object} attributes - 現在の属性値オブジェクト
 * @returns {Array<string>} 未設定の必須属性名の配列
 */
function getMissingRequiredAttributes(elementType, attributes) {
  const elementDef = _state.elementDefinitions.get(elementType);
  if (!elementDef) return [];

  const missing = [];
  elementDef.attributes.forEach((attrInfo, attrName) => {
    if (
      attrInfo.required &&
      (attributes[attrName] == null || String(attributes[attrName]).trim() === '')
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
        suggestions: result.suggestions,
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors: errors,
  };
}

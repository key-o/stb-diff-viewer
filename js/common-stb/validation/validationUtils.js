/**
 * @fileoverview バリデーション用ユーティリティ関数
 *
 * バリデーション結果の重複排除、正規化、フィルタリング、XML整形などの
 * ヘルパー関数を提供します。
 */

/**
 * Extract anchor id from XPath-like string.
 * @param {string} xpath
 * @returns {string}
 */
export function extractIdFromXPath(xpath) {
  if (!xpath || typeof xpath !== 'string') {
    return '';
  }

  const quotedMatch = xpath.match(/\[@id\s*=\s*(['"])(.*?)\1\]/);
  if (quotedMatch?.[2]) {
    return quotedMatch[2];
  }

  const bareMatch = xpath.match(/\[@id\s*=\s*([^\]\s/]+)\]/);
  if (bareMatch?.[1]) {
    return bareMatch[1].replace(/^['"]|['"]$/g, '');
  }

  return '';
}

/**
 * Build a stable signature string for deduplicating issues.
 * @param {Object} issue
 * @returns {string}
 */
export function buildIssueSignature(issue) {
  if (!issue || typeof issue !== 'object') {
    return '';
  }

  return [
    issue.severity || '',
    issue.category || '',
    issue.message || '',
    issue.elementType || '',
    issue.elementId || '',
    issue.sectionType || '',
    issue.sectionId || '',
    issue.attribute || '',
    issue.idXPath || issue.xpath || '',
    issue.repairable ? '1' : '0',
    issue.repairSuggestion || '',
  ].join('|');
}

/**
 * Build a stable signature string for deduplicating suggestions.
 * @param {Object} suggestion
 * @returns {string}
 */
export function buildSuggestionSignature(suggestion) {
  if (!suggestion || typeof suggestion !== 'object') {
    return '';
  }

  return [
    suggestion.type || '',
    suggestion.severity || '',
    suggestion.category || '',
    suggestion.message || '',
    suggestion.actionText || '',
    suggestion.detailText || '',
  ].join('|');
}

/**
 * Add issue only when equivalent issue is not already present.
 * @param {Array<Object>} issues
 * @param {Object} issue
 */
export function pushUniqueIssue(issues, issue) {
  const signature = buildIssueSignature(issue);
  if (!signature) {
    return;
  }
  if (!issues.some((item) => buildIssueSignature(item) === signature)) {
    issues.push(issue);
  }
}

/**
 * Add suggestion only when equivalent suggestion is not already present.
 * @param {Array<Object>} suggestions
 * @param {Object} suggestion
 */
export function pushUniqueSuggestion(suggestions, suggestion) {
  const signature = buildSuggestionSignature(suggestion);
  if (!signature) {
    return;
  }
  if (!suggestions.some((item) => buildSuggestionSignature(item) === signature)) {
    suggestions.push(suggestion);
  }
}

/**
 * 要素/断面タイプ名を比較用に正規化
 * @param {string} typeName
 * @returns {string}
 */
export function normalizeValidationTypeName(typeName) {
  if (typeof typeName !== 'string') return '';
  const noPrefix = typeName.includes(':') ? typeName.split(':').pop() : typeName;
  return noPrefix ? noPrefix.toLowerCase() : '';
}

/**
 * バリデーションマップのキーを生成
 * @param {string} id
 * @param {string} typeName
 * @returns {string}
 */
export function buildValidationEntryKey(id, typeName) {
  const normalizedType = normalizeValidationTypeName(typeName);
  return `${normalizedType || '*'}|${String(id)}`;
}

/**
 * 複数エントリを1つに統合
 * @param {Array<Object>} entries
 * @param {{elementId?: string, elementType?: string, sectionId?: string, sectionType?: string}} [seed]
 * @returns {Object|null}
 */
export function mergeValidationEntries(entries, seed = {}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }

  if (entries.length === 1) {
    return entries[0];
  }

  const merged = {
    elementId: seed.elementId || entries[0].elementId || '',
    elementType: seed.elementType || entries[0].elementType || '',
    sectionId: seed.sectionId || entries[0].sectionId || '',
    sectionType: seed.sectionType || entries[0].sectionType || '',
    errors: [],
    warnings: [],
    suggestions: [],
  };

  for (const entry of entries) {
    for (const issue of entry.errors || []) {
      pushUniqueIssue(merged.errors, issue);
    }
    for (const issue of entry.warnings || []) {
      pushUniqueIssue(merged.warnings, issue);
    }
    for (const suggestion of entry.suggestions || []) {
      pushUniqueSuggestion(merged.suggestions, suggestion);
    }
  }

  return merged;
}

/**
 * issue が指定した断面コンテキスト（タグ名+id）に属するか判定
 * @param {Object} issue
 * @param {string} contextTagName
 * @param {string} contextId
 * @returns {boolean}
 */
export function issueMatchesContext(issue, contextTagName, contextId) {
  if (!issue || typeof issue !== 'object' || !contextTagName || !contextId) {
    return false;
  }

  const normalizedTag = normalizeValidationTypeName(contextTagName);
  if (!normalizedTag) {
    return false;
  }

  const xpath = String(issue.idXPath || issue.xpath || '');
  if (!xpath) {
    return false;
  }

  // 例: .../StbSecBeam_RC[@id="76"]/...
  // 例: .../stb:StbSecBeam_RC[@id='76']/...
  const escapedId = String(contextId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tagPattern = normalizedTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${tagPattern}\\s*\\[@id\\s*=\\s*['"]?${escapedId}['"]?\\]`, 'i');
  return re.test(xpath);
}

/**
 * issue配列を断面コンテキストで絞り込んだ新規エントリを作る
 * @param {Object} entry
 * @param {string} contextTagName
 * @param {string} contextId
 * @returns {Object|null}
 */
export function filterValidationEntryByContext(entry, contextTagName, contextId) {
  if (!entry) return null;

  const filteredErrors = (entry.errors || []).filter((issue) =>
    issueMatchesContext(issue, contextTagName, contextId),
  );
  const filteredWarnings = (entry.warnings || []).filter((issue) =>
    issueMatchesContext(issue, contextTagName, contextId),
  );
  const relatedMessages = new Set(
    [...filteredErrors, ...filteredWarnings].map((issue) => issue?.message).filter(Boolean),
  );

  const filtered = {
    ...entry,
    errors: filteredErrors,
    warnings: filteredWarnings,
    suggestions: (entry.suggestions || []).filter((suggestion) => {
      const msg = suggestion?.message || '';
      return msg && relatedMessages.has(msg);
    }),
  };

  if (
    filtered.errors.length === 0 &&
    filtered.warnings.length === 0 &&
    filtered.suggestions.length === 0
  ) {
    return null;
  }

  return filtered;
}

/**
 * XMLをフォーマット（インデント付き）
 * @param {string} xmlString
 * @returns {string}
 */
export function formatXml(xmlString) {
  if (!xmlString.startsWith('<?xml')) {
    xmlString = '<?xml version="1.0" encoding="UTF-8"?>\n' + xmlString;
  }

  let formatted = '';
  let indent = 0;
  const lines = xmlString.replace(/>\s*</g, '>\n<').split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('</')) {
      indent = Math.max(0, indent - 1);
    }

    formatted += '  '.repeat(indent) + trimmed + '\n';

    if (
      trimmed.startsWith('<') &&
      !trimmed.startsWith('</') &&
      !trimmed.startsWith('<?') &&
      !trimmed.endsWith('/>') &&
      !trimmed.includes('</')
    ) {
      indent++;
    }
  }

  return formatted;
}

/**
 * @fileoverview ST-Bridge バリデーション管理・統合モジュール
 *
 * バリデーションの実行、修復、およびUI/状態管理との連携を行います。
 * 旧 validationWorkflow.js, validationIntegration.js, validationUtils.js を統合。
 *
 * 機能:
 * - ワークフロー管理 (ロード -> 検証 -> 修復 -> エクスポート)
 * - UI連携 (スキーマエラー表示反映)
 * - 修復/検証のユーティリティ
 */

/* global XMLSerializer, Blob */

import { loadStbXmlAutoEncoding } from '../import/loader/stbXmlLoader.js';
import { validateStbDocument, formatValidationReport, SEVERITY, CATEGORY } from './stbValidator.js';
import { initializeMvdData } from './mvdValidator.js';
import { formatRepairReport, autoRepairDocument } from '../repair/stbRepairEngine.js';
import { setSchemaError, clearSchemaErrors } from './schemaErrorStore.js';
import { escapeHtml } from '../../utils/htmlUtils.js';
import { downloadBlob } from '../../utils/downloadHelper.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('common-stb:validation:validationManager');

/**
 * ワークフローステップ
 */
export const WORKFLOW_STEP = {
  IDLE: 'idle',
  LOADING: 'loading',
  VALIDATING: 'validating',
  VALIDATED: 'validated',
  REPAIRING: 'repairing',
  REPAIRED: 'repaired',
  EXPORTING: 'exporting',
  COMPLETED: 'completed',
  ERROR: 'error',
};

/**
 * バリデーション結果のサジェストタイプ
 */
export const SUGGESTION_TYPE = {
  AUTO_REPAIR: 'auto_repair', // 自動修復可能
  MANUAL_REVIEW: 'manual_review', // 手動確認が必要
  MANUAL_FIX: 'manual_fix', // 手動修正が必要
  INFO_ONLY: 'info_only', // 情報のみ（修正不要）
};

/**
 * Extract anchor id from XPath-like string.
 * @param {string} xpath
 * @returns {string}
 */
function extractIdFromXPath(xpath) {
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
function buildIssueSignature(issue) {
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
function buildSuggestionSignature(suggestion) {
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
function pushUniqueIssue(issues, issue) {
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
function pushUniqueSuggestion(suggestions, suggestion) {
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
function normalizeValidationTypeName(typeName) {
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
function buildValidationEntryKey(id, typeName) {
  const normalizedType = normalizeValidationTypeName(typeName);
  return `${normalizedType || '*'}|${String(id)}`;
}

/**
 * 複数エントリを1つに統合
 * @param {Array<Object>} entries
 * @param {{elementId?: string, elementType?: string, sectionId?: string, sectionType?: string}} [seed]
 * @returns {Object|null}
 */
function mergeValidationEntries(entries, seed = {}) {
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
function issueMatchesContext(issue, contextTagName, contextId) {
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
function filterValidationEntryByContext(entry, contextTagName, contextId) {
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
 * バリデーション・修復マネージャークラス
 */
export class ValidationManager {
  constructor() {
    this.state = {
      step: WORKFLOW_STEP.IDLE,
      originalDocument: null,
      repairedDocument: null,
      validationReport: null,
      repairReport: null,
      error: null,
      options: {},
      // 統合された統計情報
      stats: {
        valid: 0,
        info: 0,
        warning: 0,
        error: 0,
        total: 0,
      },
    };

    // 要素ごとのバリデーション結果キャッシュ
    this.elementValidationMap = new Map();
    this.elementValidationIndex = new Map();
    this.sectionValidationMap = new Map();
    this.sectionValidationIndex = new Map();

    this.listeners = [];
  }

  /**
   * 状態変更リスナーを追加
   * @param {Function} listener - コールバック関数
   */
  addListener(listener) {
    this.listeners.push(listener);
  }

  /**
   * 状態変更リスナーを削除
   * @param {Function} listener - コールバック関数
   */
  removeListener(listener) {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  /**
   * 状態変更を通知
   */
  notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener({ ...this.state });
      } catch (e) {
        log.error('Listener error:', e);
      }
    }
  }

  /**
   * 状態を更新
   * @param {Object} updates - 更新内容
   */
  updateState(updates) {
    this.state = { ...this.state, ...updates };
    this.notifyListeners();
  }

  /**
   * ワークフローをリセット
   */
  reset() {
    this.state = {
      step: WORKFLOW_STEP.IDLE,
      originalDocument: null,
      repairedDocument: null,
      validationReport: null,
      repairReport: null,
      error: null,
      options: {},
      stats: {
        valid: 0,
        info: 0,
        warning: 0,
        error: 0,
        total: 0,
      },
    };

    this.clearIntegration();
    this.notifyListeners();
  }

  /**
   * 統合情報をクリア
   */
  clearIntegration() {
    clearSchemaErrors();
    this.elementValidationMap.clear();
    this.elementValidationIndex.clear();
    this.sectionValidationMap.clear();
    this.sectionValidationIndex.clear();
  }

  /**
   * ファイルを読み込んでバリデーション
   * @param {File} file - 読み込むファイル
   * @param {Object} options - バリデーションオプション
   * @returns {Promise<Object>} バリデーションレポート
   */
  async loadAndValidate(file, options = {}) {
    try {
      this.updateState({
        step: WORKFLOW_STEP.LOADING,
        error: null,
        options,
      });

      const xmlDoc = await loadStbXmlAutoEncoding(file);

      this.updateState({
        originalDocument: xmlDoc,
      });

      if (options.mvdLevel) {
        await initializeMvdData();
      }

      return this.validateDocument(xmlDoc, options);
    } catch (e) {
      this.updateState({
        step: WORKFLOW_STEP.ERROR,
        error: e.message,
      });
      throw e;
    }
  }

  /**
   * XMLドキュメントを直接バリデーション
   * @param {Document} xmlDoc - バリデーション対象
   * @param {Object} options - バリデーションオプション
   * @param {string} [modelSource] - モデルソース ('A', 'B') A/B混線防止用
   * @returns {Object} バリデーションレポート
   */
  validateDocument(xmlDoc, options = {}, modelSource = null) {
    try {
      this.updateState({
        step: WORKFLOW_STEP.VALIDATING,
        originalDocument: xmlDoc, // loadAndValidateから呼ばれた場合は冗長だが問題ない
        error: null,
        options,
      });

      const validationReport = validateStbDocument(xmlDoc, {
        validateReferences: options.validateReferences !== false,
        validateGeometry: options.validateGeometry !== false,
        includeInfo: options.includeInfo || false,
        mvdLevel: options.mvdLevel || null,
      });

      // UI統合処理（旧 validationIntegration.js の機能）
      this.integrateResults(validationReport, modelSource);

      this.updateState({
        step: WORKFLOW_STEP.VALIDATED,
        validationReport,
      });

      return validationReport;
    } catch (e) {
      this.updateState({
        step: WORKFLOW_STEP.ERROR,
        error: e.message,
      });
      throw e;
    }
  }

  /**
   * Resolve UI anchor element id for a validation issue.
   * @param {Object} issue
   * @returns {string}
   */
  resolveIssueElementId(issue) {
    if (!issue || typeof issue !== 'object') {
      return '';
    }

    if (issue.elementId) {
      return String(issue.elementId);
    }
    if (issue.anchorElementId) {
      return String(issue.anchorElementId);
    }

    const fromIdXPath = extractIdFromXPath(issue.idXPath);
    if (fromIdXPath) {
      return fromIdXPath;
    }

    const fromXPath = extractIdFromXPath(issue.xpath);
    if (fromXPath) {
      return fromXPath;
    }

    return '';
  }

  /**
   * id/type からキャッシュキーを作成
   * @param {string} id
   * @param {string} typeName
   * @returns {string}
   */
  buildValidationKey(id, typeName) {
    return buildValidationEntryKey(id, typeName);
  }

  /**
   * id -> key の索引にキーを登録
   * @param {Map<string, Set<string>>} indexMap
   * @param {string} id
   * @param {string} key
   */
  addValidationIndex(indexMap, id, key) {
    if (!indexMap.has(id)) {
      indexMap.set(id, new Set());
    }
    indexMap.get(id).add(key);
  }

  /**
   * idに紐づくエントリを収集
   * @param {Map<string, Object>} valueMap
   * @param {Map<string, Set<string>>} indexMap
   * @param {string} id
   * @returns {Array<Object>}
   */
  collectValidationEntries(valueMap, indexMap, id) {
    const keys = indexMap.get(id);
    if (!keys || keys.size === 0) return [];

    const entries = [];
    for (const key of keys) {
      const entry = valueMap.get(key);
      if (entry) {
        entries.push(entry);
      }
    }
    return entries;
  }

  /**
   * バリデーション結果をUIシステムに統合
   * @param {Object} result - バリデーション結果
   * @param {string} [modelSource] - モデルソース ('A', 'B') A/B混線防止用
   */
  integrateResults(result, modelSource = null) {
    // modelSource指定時は既存データをクリアせず追記（A/B両方を保持するため）
    if (!modelSource) {
      this.clearIntegration();
    }

    const stats = {
      valid: 0,
      info: 0,
      warning: 0,
      error: 0,
      total: 0,
    };

    // 要素ごとにエラーを集約
    for (const issue of result.issues) {
      const resolvedElementId = this.resolveIssueElementId(issue);
      if (resolvedElementId) {
        const elementKey = this.buildValidationKey(resolvedElementId, issue.elementType);
        if (!this.elementValidationMap.has(elementKey)) {
          this.elementValidationMap.set(elementKey, {
            elementId: resolvedElementId,
            elementType: issue.elementType,
            errors: [],
            warnings: [],
            suggestions: [],
          });
          this.addValidationIndex(this.elementValidationIndex, resolvedElementId, elementKey);
        }
        const elementData = this.elementValidationMap.get(elementKey);
        const suggestion = this.createSuggestion(issue);

        if (issue.severity === SEVERITY.ERROR) {
          pushUniqueIssue(elementData.errors, issue);
        } else if (issue.severity === SEVERITY.WARNING) {
          pushUniqueIssue(elementData.warnings, issue);
        }

        pushUniqueSuggestion(elementData.suggestions, suggestion);
      }

      if (issue.sectionId) {
        const normalizedSectionId = String(issue.sectionId);
        const sectionKey = this.buildValidationKey(normalizedSectionId, issue.sectionType);
        if (!this.sectionValidationMap.has(sectionKey)) {
          this.sectionValidationMap.set(sectionKey, {
            sectionId: normalizedSectionId,
            sectionType: issue.sectionType,
            errors: [],
            warnings: [],
            suggestions: [],
          });
          this.addValidationIndex(this.sectionValidationIndex, normalizedSectionId, sectionKey);
        }
        const sectionData = this.sectionValidationMap.get(sectionKey);
        const suggestion = this.createSuggestion(issue);

        if (issue.severity === SEVERITY.ERROR) {
          pushUniqueIssue(sectionData.errors, issue);
        } else if (issue.severity === SEVERITY.WARNING) {
          pushUniqueIssue(sectionData.warnings, issue);
        }

        pushUniqueSuggestion(sectionData.suggestions, suggestion);
      }
    }

    // スキーマエラー表示システムに連携
    for (const [, data] of this.elementValidationMap) {
      let status = 'valid';
      if (data.errors.length > 0) {
        status = 'error';
      } else if (data.warnings.length > 0) {
        status = 'warning';
      } else if (data.suggestions.some((s) => s.type === SUGGESTION_TYPE.AUTO_REPAIR)) {
        status = 'info';
      }

      if (status !== 'valid') {
        stats[status]++;
      }

      const messages = [
        ...data.errors.map((e) => e.message),
        ...data.warnings.map((w) => w.message),
      ];
      setSchemaError(data.elementId, status, messages, modelSource, data.elementType);
    }

    // 状態更新用の統計情報を保存
    this.state.stats = stats;
  }

  /**
   * エラーからサジェスト情報を作成
   * @param {Object} issue - エラー情報
   * @returns {Object} サジェスト情報
   */
  createSuggestion(issue) {
    let suggestionType;
    let actionText;
    let detailText;

    if (issue.severity === SEVERITY.INFO) {
      suggestionType = SUGGESTION_TYPE.INFO_ONLY;
      actionText = '情報';
      detailText = issue.message;
    } else if (issue.repairable) {
      if (issue.repairSuggestion) {
        const suggestion = issue.repairSuggestion.toLowerCase();
        if (suggestion.includes('デフォルト') || suggestion.includes('自動')) {
          suggestionType = SUGGESTION_TYPE.AUTO_REPAIR;
          actionText = '自動修復可能';
        } else if (suggestion.includes('削除')) {
          suggestionType = SUGGESTION_TYPE.MANUAL_REVIEW;
          actionText = '要確認（削除推奨）';
        } else {
          suggestionType = SUGGESTION_TYPE.MANUAL_REVIEW;
          actionText = '要確認';
        }
        detailText = issue.repairSuggestion;
      } else {
        suggestionType = SUGGESTION_TYPE.AUTO_REPAIR;
        actionText = '自動修復可能';
        detailText = 'デフォルト値で修復できます';
      }
    } else {
      suggestionType = SUGGESTION_TYPE.MANUAL_FIX;
      actionText = '手動修正が必要';
      detailText = issue.message;
    }

    return {
      type: suggestionType,
      severity: issue.severity,
      category: issue.category,
      message: issue.message,
      actionText,
      detailText,
    };
  }

  /**
   * 自動修復を実行
   * @param {Object} repairOptions - 修復オプション
   * @returns {Object} 修復レポート
   */
  executeAutoRepair(repairOptions = {}) {
    if (!this.state.originalDocument || !this.state.validationReport) {
      throw new Error('バリデーションが完了していません');
    }

    try {
      this.updateState({
        step: WORKFLOW_STEP.REPAIRING,
      });

      const docClone = this.state.originalDocument.cloneNode(true);

      const { document: repairedDoc, report } = autoRepairDocument(
        docClone,
        this.state.validationReport,
        {
          removeInvalid: repairOptions.removeInvalid !== false,
          useDefaults: repairOptions.useDefaults !== false,
          skipCategories: repairOptions.skipCategories || [],
        },
      );

      this.updateState({
        step: WORKFLOW_STEP.REPAIRED,
        repairedDocument: repairedDoc,
        repairReport: report,
      });

      return report;
    } catch (e) {
      this.updateState({
        step: WORKFLOW_STEP.ERROR,
        error: e.message,
      });
      throw e;
    }
  }

  /**
   * 修復済みドキュメントを再バリデーション
   * @returns {Object} 新しいバリデーションレポート
   */
  revalidateRepaired() {
    if (!this.state.repairedDocument) {
      throw new Error('修復が完了していません');
    }

    const report = validateStbDocument(this.state.repairedDocument, {
      validateReferences: true,
      validateGeometry: true,
      includeInfo: false,
    });

    return report;
  }

  /**
   * 修復済みドキュメントをXML文字列として取得
   * @param {Object} options - 出力オプション
   * @returns {string} XML文字列
   */
  getRepairedXmlString(options = {}) {
    const doc = this.state.repairedDocument || this.state.originalDocument;
    if (!doc) {
      throw new Error('ドキュメントがありません');
    }

    const serializer = new XMLSerializer();
    let xmlString = serializer.serializeToString(doc);

    if (options.format !== false) {
      xmlString = formatXml(xmlString);
    }

    return xmlString;
  }

  /**
   * 修復済みドキュメントをファイルとしてダウンロード
   * @param {string} filename - ファイル名
   * @param {Object} options - 出力オプション
   */
  downloadRepairedFile(filename, options = {}) {
    this.updateState({
      step: WORKFLOW_STEP.EXPORTING,
    });

    try {
      const xmlString = this.getRepairedXmlString(options);

      if (!filename.endsWith('.stb')) {
        filename += '.stb';
      }

      const blob = new Blob([xmlString], { type: 'application/xml' });
      downloadBlob(blob, filename);

      this.updateState({
        step: WORKFLOW_STEP.COMPLETED,
      });
    } catch (e) {
      this.updateState({
        step: WORKFLOW_STEP.ERROR,
        error: e.message,
      });
      throw e;
    }
  }

  /**
   * 特定の要素のバリデーション結果を取得
   * @param {string} elementId
   * @param {{targetElementName?: string, elementType?: string}} [options]
   * @returns {Object|null}
   */
  getElementValidation(elementId, options = {}) {
    if (!elementId) return null;

    const normalizedElementId = String(elementId);
    const requestedType = options.targetElementName || options.elementType || '';
    const contextTagName = options.contextTagName || '';
    const contextId = options.contextId ? String(options.contextId) : '';

    if (requestedType) {
      const typedKey = this.buildValidationKey(normalizedElementId, requestedType);
      const typedEntry = this.elementValidationMap.get(typedKey) || null;
      if (!typedEntry) return null;
      if (!contextTagName || !contextId) return typedEntry;
      return filterValidationEntryByContext(typedEntry, contextTagName, contextId);
    }

    const entries = this.collectValidationEntries(
      this.elementValidationMap,
      this.elementValidationIndex,
      normalizedElementId,
    );

    if (entries.length === 0) return null;

    const merged =
      entries.length === 1
        ? entries[0]
        : mergeValidationEntries(entries, { elementId: normalizedElementId });
    if (!merged) return null;
    if (!contextTagName || !contextId) return merged;
    return filterValidationEntryByContext(merged, contextTagName, contextId);
  }

  /**
   * 特定の断面のバリデーション結果を取得
   * @param {string} sectionId
   * @param {{targetSectionType?: string, sectionType?: string}} [options]
   * @returns {Object|null}
   */
  getSectionValidation(sectionId, options = {}) {
    if (!sectionId) return null;

    const normalizedSectionId = String(sectionId);
    const requestedType = options.targetSectionType || options.sectionType || '';

    if (requestedType) {
      const typedKey = this.buildValidationKey(normalizedSectionId, requestedType);
      return this.sectionValidationMap.get(typedKey) || null;
    }

    const entries = this.collectValidationEntries(
      this.sectionValidationMap,
      this.sectionValidationIndex,
      normalizedSectionId,
    );

    if (entries.length === 0) return null;
    if (entries.length === 1) return entries[0];

    return mergeValidationEntries(entries, { sectionId: normalizedSectionId });
  }

  /**
   * 統計情報を取得
   */
  getStats() {
    return this.state.stats;
  }
}

/**
 * XMLをフォーマット（インデント付き）
 */
function formatXml(xmlString) {
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

/**
 * 完全なワークフローを実行（便利関数）
 */
export async function runCompleteWorkflow(file, options = {}) {
  const manager = new ValidationManager();
  const validationReport = await manager.loadAndValidate(file, options);

  let repairReport = null;
  let xmlString = null;

  if (!validationReport.valid && options.autoRepair !== false) {
    repairReport = manager.executeAutoRepair(options);
    xmlString = manager.getRepairedXmlString();

    // オプションがあれば再検証結果も含める
    if (options.revalidate) {
      repairReport.revalidation = manager.revalidateRepaired();
    }
  } else {
    xmlString = manager.getRepairedXmlString();
  }

  return {
    validationReport,
    repairReport,
    xmlString,
    manager, // workflow から manager へ名称変更的意味合い
  };
}

/**
 * バリデーションと修復の統合レポートを生成
 */
export function generateIntegratedReport(manager) {
  // 名前が manager になっただけで中身はほぼ同じ
  // manager は ValidationManager インスタンス (旧 ValidationWorkflow)

  // ValidationWorkflow の実装と互換性を持たせるため、ValidationManager も getState() を持つべきだが
  // 直接プロパティアクセスでもいいが、getState() は実装しておいたほうが良いだろう。
  // 上記クラス定義には getState が抜けていたので追加する。

  const state = manager.state; // あるいは manager.getState()

  const lines = [];

  lines.push('='.repeat(70));
  lines.push('ST-Bridge バリデーション & 修復 統合レポート');
  lines.push('='.repeat(70));
  lines.push('');

  if (state.validationReport) {
    lines.push(formatValidationReport(state.validationReport));
    lines.push('');
  }

  if (state.repairReport) {
    lines.push(formatRepairReport(state.repairReport));
    lines.push('');
  }

  lines.push('--- 最終ステータス ---');
  lines.push(`ワークフローステップ: ${state.step}`);

  if (state.error) {
    lines.push(`エラー: ${state.error}`);
  }

  // 統計情報
  if (state.validationReport) {
    const report = state.validationReport;
    lines.push(`データ有効性: ${report.valid ? '有効' : '要修正'}`);
    lines.push(`修復可能な問題: ${report.statistics.repairableCount}`);
  }

  if (state.repairReport) {
    const report = state.repairReport;
    lines.push(`実行した修復: ${report.totalRepairs}`);
    lines.push(`成功した修復: ${report.successCount}`);
  }

  lines.push('');
  lines.push('='.repeat(70));

  return lines.join('\n');
}

/**
 * ドキュメントを自動修復して結果を返す (旧 validationUtils.quickRepair)
 */
export function quickRepair(xmlDoc, options = {}) {
  const manager = new ValidationManager();

  // ステートを手動でセットアップ
  manager.validateDocument(xmlDoc);

  // 修復
  const repairReport = manager.executeAutoRepair({
    removeInvalid: true,
    useDefaults: true,
    ...options,
  });

  // 結果取得
  const validationReport = manager.state.validationReport;
  const revalidation = manager.revalidateRepaired();

  return {
    document: manager.state.repairedDocument,
    validationReport,
    repairReport,
    revalidation,
  };
}

/* UI連携・ヘルパー機能 */

// シングルトンインスタンス（アプリケーション全体で共有）
export const sharedManager = new ValidationManager();

/**
 * XMLドキュメントをバリデーションし、結果をUI表示システムに連携
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @param {string} [modelSource] - モデルソース ('A', 'B') A/B混線防止用
 * @returns {Object} バリデーション結果
 */
export function validateAndIntegrate(xmlDoc, modelSource = null) {
  return sharedManager.validateDocument(xmlDoc, {}, modelSource);
}

/**
 * 要素のバリデーション情報を取得
 * @param {string} elementId - 要素ID
 * @param {{targetElementName?: string, elementType?: string}} [options] - 要素種別フィルタ
 * @returns {Object|null} バリデーション情報
 */
export function getElementValidation(elementId, options = {}) {
  return sharedManager.getElementValidation(elementId, options);
}

/**
 * 断面のバリデーション情報を取得
 * @param {string} sectionId - 断面ID
 * @param {{targetSectionType?: string, sectionType?: string}} [options] - 断面種別フィルタ
 * @returns {Object|null} バリデーション情報
 */
export function getSectionValidation(sectionId, options = {}) {
  return sharedManager.getSectionValidation(sectionId, options);
}

/**
 * 最新のバリデーション結果を取得
 * @returns {Object|null} バリデーション結果
 */
export function getLastValidationResult() {
  return sharedManager.state.validationReport;
}

/**
 * バリデーション情報をクリア
 */
export function clearValidationData() {
  sharedManager.reset();
}

/**
 * バリデーションサマリーHTMLを生成
 * @returns {string} HTML文字列
 */
export function generateValidationSummaryHtml() {
  const result = sharedManager.state.validationReport;
  if (!result) {
    return '<div class="validation-summary">バリデーション未実行</div>';
  }

  const errorCount = result.issues.filter((i) => i.severity === SEVERITY.ERROR).length;
  const warningCount = result.issues.filter((i) => i.severity === SEVERITY.WARNING).length;
  const repairableCount = result.issues.filter((i) => i.repairable).length;

  let statusClass = 'valid';
  let statusText = '有効';
  if (errorCount > 0) {
    statusClass = 'error';
    statusText = 'エラーあり';
  } else if (warningCount > 0) {
    statusClass = 'warning';
    statusText = '警告あり';
  }

  let html = `<div class="validation-summary ${statusClass}">`;
  html += `<div class="summary-status">${statusText}</div>`;
  html += '<div class="summary-details">';
  html += `<span class="summary-item error">エラー: ${errorCount}</span>`;
  html += `<span class="summary-item warning">警告: ${warningCount}</span>`;
  html += `<span class="summary-item repairable">修復可能: ${repairableCount}</span>`;
  html += '</div>';
  html += '</div>';

  return html;
}

/**
 * 要素情報パネル用のエラー表示HTMLを生成
 * @param {string} elementId - 要素ID
 * @param {{targetElementName?: string, elementType?: string}} [options] - 要素種別フィルタ
 * @returns {string} HTML文字列
 */
export function generateValidationInfoHtml(elementId, options = {}) {
  const validation = getElementValidation(elementId, options);

  if (!validation) {
    return '';
  }

  const hasErrors = validation.errors.length > 0;
  const hasWarnings = validation.warnings.length > 0;
  const hasSuggestions = validation.suggestions.length > 0;

  if (!hasErrors && !hasWarnings && !hasSuggestions) {
    return '';
  }

  let html = '<div class="validation-info-section">';
  html += '<h4 class="validation-header">バリデーション結果</h4>';

  // エラー表示
  if (hasErrors) {
    html += '<div class="validation-errors">';
    html += `<div class="validation-category error">エラー (${validation.errors.length}件)</div>`;
    html += '<ul class="validation-list">';
    for (const error of validation.errors) {
      html += `<li class="validation-item error">${escapeHtml(error.message)}</li>`;
    }
    html += '</ul>';
    html += '</div>';
  }

  // 警告表示
  if (hasWarnings) {
    html += '<div class="validation-warnings">';
    html += `<div class="validation-category warning">警告 (${validation.warnings.length}件)</div>`;
    html += '<ul class="validation-list">';
    for (const warning of validation.warnings) {
      html += `<li class="validation-item warning">${escapeHtml(warning.message)}</li>`;
    }
    html += '</ul>';
    html += '</div>';
  }

  // サジェスト表示
  if (validation.suggestions.length > 0) {
    html += '<div class="validation-suggestions">';
    html += '<div class="validation-category suggestion">修復サジェスト</div>';
    html += '<ul class="suggestion-list">';

    const autoRepairs = validation.suggestions.filter(
      (s) => s.type === SUGGESTION_TYPE.AUTO_REPAIR,
    );
    const manualReviews = validation.suggestions.filter(
      (s) => s.type === SUGGESTION_TYPE.MANUAL_REVIEW,
    );
    const manualFixes = validation.suggestions.filter((s) => s.type === SUGGESTION_TYPE.MANUAL_FIX);

    // 自動修復可能
    for (const suggestion of autoRepairs) {
      html += `<li class="suggestion-item auto-repair">`;
      html += `<span class="suggestion-badge auto">自動修復</span>`;
      html += `<span class="suggestion-text">${escapeHtml(suggestion.detailText)}</span>`;
      if (suggestion.attribute) {
        html += `<span class="suggestion-attr">(${escapeHtml(suggestion.attribute)})</span>`;
      }
      html += `</li>`;
    }

    // 要確認
    for (const suggestion of manualReviews) {
      html += `<li class="suggestion-item manual-review">`;
      html += `<span class="suggestion-badge review">要確認</span>`;
      html += `<span class="suggestion-text">${escapeHtml(suggestion.detailText)}</span>`;
      if (suggestion.attribute) {
        html += `<span class="suggestion-attr">(${escapeHtml(suggestion.attribute)})</span>`;
      }
      html += `</li>`;
    }

    // 手動修正
    for (const suggestion of manualFixes) {
      html += `<li class="suggestion-item manual-fix">`;
      html += `<span class="suggestion-badge manual">手動修正</span>`;
      html += `<span class="suggestion-text">${escapeHtml(suggestion.detailText)}</span>`;
      if (suggestion.attribute) {
        html += `<span class="suggestion-attr">(${escapeHtml(suggestion.attribute)})</span>`;
      }
      html += `</li>`;
    }

    html += '</ul>';
    html += '</div>';
  }

  html += '</div>';

  return html;
}

/**
 * バリデーション用CSSスタイルを取得
 * @returns {string} CSS文字列
 */
export function getValidationStyles() {
  return `
      .validation-info-section {
        margin-top: 12px;
        padding: 10px;
        background: var(--bg-secondary);
        border-radius: var(--border-radius-lg);
        border: 1px solid var(--border-color-light);
      }
  
      .validation-header {
        margin: 0 0 8px 0;
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-semibold);
        color: var(--text-heading);
      }
  
      .validation-category {
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        margin-bottom: 4px;
        padding: 4px 8px;
        border-radius: var(--border-radius);
      }
  
      .validation-category.error {
        background: #ffebee;
        color: #c62828;
      }
  
      .validation-category.warning {
        background: #fff3e0;
        color: #e65100;
      }
  
      .validation-category.suggestion {
        background: #e3f2fd;
        color: #1565c0;
      }
  
      .validation-list {
        margin: 0 0 8px 0;
        padding-left: 20px;
        font-size: var(--font-size-sm);
      }
  
      .validation-item {
        margin-bottom: 2px;
        line-height: 1.4;
      }
  
      .validation-item.error {
        color: #c62828;
      }
  
      .validation-item.warning {
        color: #e65100;
      }
  
      .suggestion-list {
        margin: 0;
        padding: 0;
        list-style: none;
      }
  
      .suggestion-item {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 6px 8px;
        margin-bottom: 4px;
        border-radius: 4px;
        font-size: var(--font-size-sm);
        line-height: 1.4;
      }
  
      .suggestion-item.auto-repair {
        background: #e8f5e9;
      }
  
      .suggestion-item.manual-review {
        background: #fff3e0;
      }
  
      .suggestion-item.manual-fix {
        background: #fce4ec;
      }
  
      .suggestion-badge {
        flex-shrink: 0;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: var(--font-size-xs);
        font-weight: var(--font-weight-semibold);
        white-space: nowrap;
      }
  
      .suggestion-badge.auto {
        background: #4caf50;
        color: white;
      }
  
      .suggestion-badge.review {
        background: #ff9800;
        color: white;
      }
  
      .suggestion-badge.manual {
        background: #f44336;
        color: white;
      }
  
      .suggestion-text {
        flex: 1;
        color: #424242;
      }
  
      .suggestion-attr {
        color: #757575;
        font-size: var(--font-size-xs);
      }
  
      .validation-summary {
        padding: 8px 12px;
        border-radius: 4px;
        margin-bottom: 8px;
      }
  
      .validation-summary.valid {
        background: #e8f5e9;
        border: 1px solid #a5d6a7;
      }
  
      .validation-summary.warning {
        background: #fff3e0;
        border: 1px solid #ffcc80;
      }
  
      .validation-summary.error {
        background: #ffebee;
        border: 1px solid #ef9a9a;
      }
  
      .summary-status {
        font-weight: var(--font-weight-semibold);
        font-size: var(--font-size-sm);
        margin-bottom: 4px;
      }
  
      .summary-details {
        display: flex;
        gap: 12px;
        font-size: var(--font-size-sm);
      }
  
      .summary-item.error {
        color: #c62828;
      }
  
      .summary-item.warning {
        color: #e65100;
      }
  
      .summary-item.repairable {
        color: #1565c0;
      }
    `;
}

// エクスポート
export { SEVERITY, CATEGORY };

/**
 * バリデーション統計を取得 (互換性用)
 */
export function getValidationStats() {
  return sharedManager.state.stats;
}

/**
 * 特定のステータスの要素IDリストを取得 (互換性用)
 * @param {string} status 'error' | 'warning'
 */
export function getElementsByStatus(status) {
  const result = [];
  for (const [, data] of sharedManager.elementValidationMap.entries()) {
    const elementId = data.elementId || '';
    if (status === 'error' && data.errors.length > 0) {
      result.push({
        elementId,
        elementType: data.elementType || 'Unknown',
        messages: data.errors.map((issue) => issue.message).filter(Boolean),
      });
      continue;
    }

    if (status === 'warning' && data.warnings.length > 0) {
      result.push({
        elementId,
        elementType: data.elementType || 'Unknown',
        messages: data.warnings.map((issue) => issue.message).filter(Boolean),
      });
      continue;
    }

    if (status === 'info' && data.suggestions.length > 0) {
      const infoMessages = data.suggestions
        .map((suggestion) => suggestion.detailText || suggestion.message)
        .filter(Boolean);

      if (infoMessages.length > 0) {
        result.push({
          elementId,
          elementType: data.elementType || 'Unknown',
          messages: infoMessages,
        });
      }
    }
  }
  return result;
}

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
import { validateStbDocument, SEVERITY, CATEGORY } from './stbValidator.js';
import { initializeMvdData } from './mvdValidator.js';
import { autoRepairDocument } from '../repair/stbRepairEngine.js';
import { setSchemaError, clearSchemaErrors } from './schemaErrorStore.js';
import { downloadBlob } from '../../utils/downloadHelper.js';
import { createLogger } from '../../utils/logger.js';
import {
  extractIdFromXPath,
  buildValidationEntryKey,
  mergeValidationEntries,
  filterValidationEntryByContext,
  pushUniqueIssue,
  pushUniqueSuggestion,
  formatXml,
} from './validationUtils.js';

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

      const { document: xmlDoc } = await loadStbXmlAutoEncoding(file);

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

// Re-exports from sub-modules
export { SEVERITY, CATEGORY };
export {
  runCompleteWorkflow,
  generateIntegratedReport,
  quickRepair,
} from './validationWorkflow.js';
export {
  generateValidationSummaryHtml,
  generateValidationInfoHtml,
  getValidationStyles,
} from './validationHtmlRenderer.js';

/**
 * @fileoverview バリデーション結果のUI連携モジュール
 *
 * バリデーション結果をスキーマエラー表示モードと要素情報パネルに連携します。
 * - 自動修復可能な項目と手動修正が必要な項目を区別
 * - 要素ごとのエラー情報とサジェストを管理
 */

import { validateStbDocument, SEVERITY, CATEGORY } from './stbValidator.js';
import { setSchemaError, clearSchemaErrors } from '../colorModes/index.js';

// 要素ごとのバリデーション結果を保持
const elementValidationMap = new Map();

// 断面ごとのバリデーション結果を保持
const sectionValidationMap = new Map();

// 最新のバリデーション結果
let lastValidationResult = null;
// 最新のバリデーション統計
let lastValidationStats = {
  valid: 0,
  info: 0,
  warning: 0,
  error: 0,
  total: 0,
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
 * XMLドキュメントをバリデーションし、結果をUI表示システムに連携
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @returns {Object} バリデーション結果
 */
export function validateAndIntegrate(xmlDoc) {
  // バリデーション実行
  const result = validateStbDocument(xmlDoc);
  lastValidationResult = result;

  // 既存のエラー情報をクリア
  clearSchemaErrors();
  elementValidationMap.clear();
  sectionValidationMap.clear();

  // 要素ごとにエラーを集約
  for (const issue of result.issues) {
    if (issue.elementId) {
      // 要素に関連するエラー
      if (!elementValidationMap.has(issue.elementId)) {
        elementValidationMap.set(issue.elementId, {
          elementType: issue.elementType,
          errors: [],
          warnings: [],
          suggestions: [],
        });
      }
      const elementData = elementValidationMap.get(issue.elementId);

      const suggestion = createSuggestion(issue);

      if (issue.severity === SEVERITY.ERROR) {
        elementData.errors.push(issue);
      } else if (issue.severity === SEVERITY.WARNING) {
        elementData.warnings.push(issue);
      }

      elementData.suggestions.push(suggestion);
    }

    // 断面に関連するエラー
    if (issue.sectionId) {
      if (!sectionValidationMap.has(issue.sectionId)) {
        sectionValidationMap.set(issue.sectionId, {
          sectionType: issue.sectionType,
          errors: [],
          warnings: [],
          suggestions: [],
        });
      }
      const sectionData = sectionValidationMap.get(issue.sectionId);

      const suggestion = createSuggestion(issue);

      if (issue.severity === SEVERITY.ERROR) {
        sectionData.errors.push(issue);
      } else if (issue.severity === SEVERITY.WARNING) {
        sectionData.warnings.push(issue);
      }

      sectionData.suggestions.push(suggestion);
    }
  }

  // 統計をリセット
  lastValidationStats = {
    valid: 0,
    info: 0,
    warning: 0,
    error: 0,
    total: 0,
  };

  // スキーマエラー表示システムに連携
  for (const [elementId, data] of elementValidationMap) {
    let status = 'valid';
    if (data.errors.length > 0) {
      status = 'error';
    } else if (data.warnings.length > 0) {
      status = 'warning';
    } else if (data.suggestions.some((s) => s.type === SUGGESTION_TYPE.AUTO_REPAIR)) {
      status = 'info';
    }

    // 統計を更新
    if (status !== 'valid') {
      lastValidationStats[status]++;
    }

    const messages = [...data.errors.map((e) => e.message), ...data.warnings.map((w) => w.message)];

    setSchemaError(elementId, status, messages);
  }

  // 結果サマリーをコンソールに出力
  console.log('[ValidationIntegration] Validation complete:', {
    totalIssues: result.issues.length,
    elementsWithErrors: elementValidationMap.size,
    sectionsWithErrors: sectionValidationMap.size,
    stats: lastValidationStats,
  });

  return result;
}

/**
 * バリデーション統計を取得
 * @returns {Object} 統計情報
 */
export function getValidationStats() {
  return { ...lastValidationStats };
}

/**
 * エラーからサジェスト情報を作成
 * @param {Object} issue - エラー情報
 * @returns {Object} サジェスト情報
 */
function createSuggestion(issue) {
  let suggestionType;
  let actionText;
  let detailText;

  if (issue.severity === SEVERITY.INFO) {
    suggestionType = SUGGESTION_TYPE.INFO_ONLY;
    actionText = '情報';
    detailText = issue.message;
  } else if (issue.repairable) {
    // 修復可能な場合
    if (issue.repairSuggestion) {
      // 修復提案に基づいて自動/手動を判定
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
    // 修復不可能な場合
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
    attribute: issue.attribute,
    value: issue.value,
    repairable: issue.repairable,
  };
}

/**
 * 要素のバリデーション情報を取得
 * @param {string} elementId - 要素ID
 * @returns {Object|null} バリデーション情報
 */
export function getElementValidation(elementId) {
  return elementValidationMap.get(elementId) || null;
}

/**
 * 断面のバリデーション情報を取得
 * @param {string} sectionId - 断面ID
 * @returns {Object|null} バリデーション情報
 */
export function getSectionValidation(sectionId) {
  return sectionValidationMap.get(sectionId) || null;
}

/**
 * 最新のバリデーション結果を取得
 * @returns {Object|null} バリデーション結果
 */
export function getLastValidationResult() {
  return lastValidationResult;
}

/**
 * バリデーション情報をクリア
 */
export function clearValidationData() {
  elementValidationMap.clear();
  sectionValidationMap.clear();
  clearSchemaErrors();
  lastValidationResult = null;
}

/**
 * 指定したステータスの要素リストを取得
 * @param {string} status - ステータス ('info', 'warning', 'error')
 * @returns {Array<{elementId: string, elementType: string, messages: string[]}>} 要素リスト
 */
export function getElementsByStatus(status) {
  const elements = [];

  for (const [elementId, data] of elementValidationMap) {
    let elementStatus = 'valid';

    if (data.errors.length > 0) {
      elementStatus = 'error';
    } else if (data.warnings.length > 0) {
      elementStatus = 'warning';
    } else if (data.suggestions.some((s) => s.type === SUGGESTION_TYPE.AUTO_REPAIR)) {
      elementStatus = 'info';
    }

    if (elementStatus === status) {
      const messages = [];

      // エラーメッセージを収集
      if (status === 'error') {
        messages.push(...data.errors.map((e) => e.message));
      }
      // 警告メッセージを収集
      if (status === 'warning') {
        messages.push(...data.warnings.map((w) => w.message));
      }
      // サジェストメッセージを収集
      const relevantSuggestions = data.suggestions.filter((s) => {
        if (status === 'info') return s.type === SUGGESTION_TYPE.AUTO_REPAIR;
        if (status === 'warning') return s.type === SUGGESTION_TYPE.MANUAL_REVIEW;
        if (status === 'error') return s.type === SUGGESTION_TYPE.MANUAL_FIX;
        return false;
      });
      messages.push(...relevantSuggestions.map((s) => s.detailText));

      elements.push({
        elementId,
        elementType: data.elementType,
        messages: [...new Set(messages)], // 重複を除去
      });
    }
  }

  return elements;
}

/**
 * 全ステータスの要素リストを取得
 * @returns {Object} ステータスごとの要素リスト
 */
export function getAllElementsByStatus() {
  return {
    info: getElementsByStatus('info'),
    warning: getElementsByStatus('warning'),
    error: getElementsByStatus('error'),
  };
}

/**
 * 要素情報パネル用のエラー表示HTMLを生成
 * @param {string} elementId - 要素ID
 * @returns {string} HTML文字列
 */
export function generateValidationInfoHtml(elementId) {
  const validation = getElementValidation(elementId);

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

    // タイプごとにグループ化
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
 * バリデーションサマリーHTMLを生成
 * @returns {string} HTML文字列
 */
export function generateValidationSummaryHtml() {
  if (!lastValidationResult) {
    return '<div class="validation-summary">バリデーション未実行</div>';
  }

  const result = lastValidationResult;
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
 * HTMLエスケープ
 */
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
      background: #f8f9fa;
      border-radius: 6px;
      border: 1px solid #e9ecef;
    }

    .validation-header {
      margin: 0 0 8px 0;
      font-size: 13px;
      font-weight: 600;
      color: #495057;
    }

    .validation-category {
      font-size: 12px;
      font-weight: 500;
      margin-bottom: 4px;
      padding: 4px 8px;
      border-radius: 4px;
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
      font-size: 11px;
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
      font-size: 11px;
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
      font-size: 10px;
      font-weight: 600;
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
      font-size: 10px;
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
      font-weight: 600;
      font-size: 12px;
      margin-bottom: 4px;
    }

    .summary-details {
      display: flex;
      gap: 12px;
      font-size: 11px;
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

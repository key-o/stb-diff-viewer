/**
 * @fileoverview バリデーション結果のHTML生成モジュール
 *
 * バリデーション結果をHTML形式で表示するための関数を提供します。
 * サマリー表示、要素情報パネル用表示、CSSスタイル定義を含みます。
 */

import { SEVERITY } from './stbValidator.js';
import { SUGGESTION_TYPE } from './validationManager.js';
import { getElementValidation, sharedManager } from './validationManager.js';
import { escapeHtml } from '../../utils/htmlUtils.js';

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

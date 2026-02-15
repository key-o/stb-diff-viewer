/**
 * @fileoverview レポート用インラインCSS定義
 *
 * 自己完結型HTMLレポートのスタイル定義です。
 * ブラウザ表示と印刷の両方に対応しています。
 *
 * @module export/report/reportStyles
 */

/** 差分ステータスの色定義 */
export const STATUS_COLORS = {
  matched: '#4CAF50',
  onlyA: '#2196F3',
  onlyB: '#F44336',
  mismatch: '#FF9800',
};

/**
 * レポート全体のCSSを返す
 * @returns {string} CSS文字列
 */
export function getReportCSS() {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Segoe UI', 'Hiragino Sans', 'Meiryo', sans-serif;
      color: #333;
      background: #fff;
      line-height: 1.6;
      padding: 20px 40px;
      max-width: 1100px;
      margin: 0 auto;
    }

    h1 {
      font-size: 1.6em;
      border-bottom: 3px solid #333;
      padding-bottom: 8px;
      margin-bottom: 24px;
    }

    h2 {
      font-size: 1.2em;
      color: #444;
      border-left: 4px solid #2196F3;
      padding-left: 12px;
      margin: 28px 0 12px;
    }

    .report-meta {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 4px 16px;
      background: #f8f9fa;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      padding: 16px;
      margin-bottom: 24px;
      font-size: 0.9em;
    }

    .report-meta dt {
      font-weight: 600;
      color: #555;
    }

    .report-meta dd {
      color: #333;
    }

    .summary-cards {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 24px;
    }

    .summary-card {
      text-align: center;
      padding: 16px 8px;
      border-radius: 6px;
      border: 1px solid #e0e0e0;
    }

    .summary-card .value {
      font-size: 2em;
      font-weight: 700;
      display: block;
    }

    .summary-card .label {
      font-size: 0.85em;
      color: #666;
      margin-top: 4px;
    }

    .card-total { background: #f5f5f5; }
    .card-total .value { color: #333; }
    .card-matched { background: #e8f5e9; }
    .card-matched .value { color: ${STATUS_COLORS.matched}; }
    .card-onlyA { background: #e3f2fd; }
    .card-onlyA .value { color: ${STATUS_COLORS.onlyA}; }
    .card-onlyB { background: #ffebee; }
    .card-onlyB .value { color: ${STATUS_COLORS.onlyB}; }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 0.9em;
    }

    th, td {
      border: 1px solid #ddd;
      padding: 8px 12px;
      text-align: left;
    }

    th {
      background: #f5f5f5;
      font-weight: 600;
      color: #444;
    }

    tr:nth-child(even) { background: #fafafa; }
    tr:hover { background: #f0f0f0; }

    td.num { text-align: right; font-variant-numeric: tabular-nums; }

    .screenshot-section {
      margin: 20px 0;
    }

    .screenshot-section img {
      max-width: 100%;
      border: 1px solid #ddd;
      border-radius: 4px;
      display: block;
      margin: 8px 0;
    }

    .screenshot-label {
      font-size: 0.85em;
      color: #666;
      margin-bottom: 4px;
    }

    .version-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 0.85em;
      font-weight: 600;
    }

    .cross-version-notice {
      background: #fff3e0;
      border-left: 4px solid #ff9800;
      padding: 10px 16px;
      margin-bottom: 16px;
      border-radius: 0 4px 4px 0;
      font-size: 0.9em;
    }

    .no-data {
      color: #999;
      font-style: italic;
      padding: 12px;
    }

    .footer {
      margin-top: 40px;
      padding-top: 12px;
      border-top: 1px solid #ddd;
      font-size: 0.8em;
      color: #999;
      text-align: center;
    }

    .bar-chart {
      display: flex;
      height: 20px;
      border-radius: 3px;
      overflow: hidden;
      background: #eee;
    }

    .bar-segment {
      height: 100%;
      transition: width 0.3s;
    }

    /* 展開ヒントテキスト */
    .expand-hint {
      font-size: 0.8em;
      color: #888;
      font-style: italic;
      margin-bottom: 8px;
    }

    /* 属性不一致テーブルのサマリ行 */
    .mismatch-summary {
      cursor: pointer;
    }
    .mismatch-summary:hover {
      background: #fff8e1 !important;
    }

    /* 展開可能な行 */
    .expandable-row {
      cursor: pointer;
    }
    .expandable-row:hover {
      background: #e3f2fd !important;
    }

    /* 詳細展開行 */
    .detail-row {
      background: #f9f9f9 !important;
    }
    .detail-row:hover {
      background: #f9f9f9 !important;
    }

    .detail-cell {
      padding: 8px 16px;
    }

    /* 不一致数の強調 */
    .diff-count {
      font-weight: 600;
      color: ${STATUS_COLORS.mismatch};
    }

    /* 属性差分テーブル（mismatch詳細用） */
    .attr-diff-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85em;
      margin: 4px 0;
    }

    .attr-diff-table th {
      background: #e8eaf6;
      font-weight: 600;
      padding: 4px 8px;
      border: 1px solid #ccc;
      font-size: 0.9em;
    }

    .attr-diff-table td {
      padding: 4px 8px;
      border: 1px solid #ddd;
    }

    .attr-differ {
      background: #fff3e0 !important;
    }
    .attr-differ td {
      color: #e65100;
      font-weight: 600;
    }

    .attr-match td {
      color: #666;
    }

    .attr-name-cell {
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 0.9em;
    }

    .status-cell {
      text-align: center;
      font-weight: 600;
    }

    /* 属性一覧テーブル（onlyA/onlyB詳細用） */
    .attr-list-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85em;
      margin: 4px 0;
    }

    .attr-list-table th {
      background: #e3f2fd;
      font-weight: 600;
      padding: 4px 8px;
      border: 1px solid #ccc;
      font-size: 0.9em;
    }

    .attr-list-table td {
      padding: 4px 8px;
      border: 1px solid #ddd;
    }

    @media print {
      body { padding: 10px; font-size: 11px; }
      h1 { font-size: 1.4em; }
      h2 { font-size: 1.1em; page-break-after: avoid; }
      table { page-break-inside: avoid; }
      .summary-cards { grid-template-columns: repeat(4, 1fr); }
      .screenshot-section img { max-height: 300px; }
      .detail-row { display: table-row !important; }
      .mismatch-summary, .expandable-row { cursor: default; }
      .expand-hint { display: none; }
    }
  `;
}

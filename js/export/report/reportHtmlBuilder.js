/**
 * @fileoverview レポートHTML構築モジュール
 *
 * 収集されたレポートデータからHTML文字列を組み立てます。
 * 出力は自己完結型のHTMLファイルです。
 *
 * @module export/report/reportHtmlBuilder
 */

import { getReportCSS, STATUS_COLORS } from './reportStyles.js';
import { escapeHtml } from '../../utils/htmlUtils.js';

/**
 * レポートデータからHTML文字列を生成する
 * @param {import('./reportDataCollector.js').ReportData} reportData - レポートデータ
 * @param {import('./reportScreenshot.js').ScreenshotResult[]} screenshots - スクリーンショット
 * @returns {string} 完全なHTML文字列
 */
export function buildReportHtml(reportData, screenshots = []) {
  const { meta, summary, elementTypeStats, onlyAElements, onlyBElements, mismatchElements } =
    reportData;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>STB比較レポート - ${escapeHtml(meta.fileNameA)} vs ${escapeHtml(meta.fileNameB)}</title>
  <style>${getReportCSS()}</style>
</head>
<body>
  <h1>STB比較レポート</h1>

  ${buildMetaSection(meta)}
  ${buildScreenshotSection(screenshots)}
  ${buildSummaryCards(summary)}
  ${buildCrossVersionNotice(meta)}
  ${buildElementTypeTable(elementTypeStats)}
  ${buildDiffBarChart(elementTypeStats)}
  ${buildOnlyATable(onlyAElements)}
  ${buildOnlyBTable(onlyBElements)}
  ${buildMismatchTable(mismatchElements)}
  ${buildFooter(meta)}
  ${buildToggleScript()}
</body>
</html>`;
}

/**
 * メタ情報セクションを生成
 */
function buildMetaSection(meta) {
  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleString('ja-JP', { dateStyle: 'long', timeStyle: 'medium' });
  };

  const formatSize = (bytes) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return `
  <h2>モデル情報</h2>
  <dl class="report-meta">
    <dt>Model A</dt>
    <dd>${escapeHtml(meta.fileNameA)} (${formatSize(meta.fileSizeA)}) <span class="version-badge">${escapeHtml(meta.stbVersionA)}</span></dd>
    <dt>Model B</dt>
    <dd>${escapeHtml(meta.fileNameB)} (${formatSize(meta.fileSizeB)}) <span class="version-badge">${escapeHtml(meta.stbVersionB)}</span></dd>
    <dt>生成日時</dt>
    <dd>${formatDate(meta.generatedAt)}</dd>
  </dl>`;
}

/**
 * スクリーンショットセクションを生成
 */
function buildScreenshotSection(screenshots) {
  if (!screenshots || screenshots.length === 0) return '';

  const images = screenshots
    .map(
      (s) => `
    <div class="screenshot-section">
      <div class="screenshot-label">${escapeHtml(s.viewName)}</div>
      <img src="${s.dataUrl}" alt="${escapeHtml(s.viewName)}">
    </div>`,
    )
    .join('');

  return `
  <h2>3Dビュー</h2>
  ${images}`;
}

/**
 * サマリカードを生成
 */
function buildSummaryCards(summary) {
  return `
  <h2>サマリ</h2>
  <div class="summary-cards">
    <div class="summary-card card-total">
      <span class="value">${summary.totalElements.toLocaleString()}</span>
      <span class="label">全要素数</span>
    </div>
    <div class="summary-card card-matched">
      <span class="value">${summary.totalMatched.toLocaleString()}</span>
      <span class="label">一致</span>
    </div>
    <div class="summary-card card-onlyA">
      <span class="value">${summary.totalOnlyA.toLocaleString()}</span>
      <span class="label">Model Aのみ</span>
    </div>
    <div class="summary-card card-onlyB">
      <span class="value">${summary.totalOnlyB.toLocaleString()}</span>
      <span class="label">Model Bのみ</span>
    </div>
  </div>`;
}

/**
 * クロスバージョン警告を生成
 */
function buildCrossVersionNotice(meta) {
  if (!meta.isCrossVersion) return '';

  return `
  <div class="cross-version-notice">
    異なるSTBバージョン間の比較です（${escapeHtml(meta.stbVersionA)} → ${escapeHtml(meta.stbVersionB)}）。
    バージョン固有の差異が含まれる場合があります。
  </div>`;
}

/**
 * 要素種別統計テーブルを生成
 */
function buildElementTypeTable(elementTypeStats) {
  const entries = Object.entries(elementTypeStats);
  if (entries.length === 0) {
    return '<h2>要素種別統計</h2><p class="no-data">比較データがありません</p>';
  }

  const rows = entries
    .map(
      ([, stats]) => `
    <tr>
      <td>${escapeHtml(stats.displayName)}</td>
      <td class="num">${stats.total.toLocaleString()}</td>
      <td class="num">${stats.matched.toLocaleString()}</td>
      <td class="num">${stats.onlyA.toLocaleString()}</td>
      <td class="num">${stats.onlyB.toLocaleString()}</td>
      <td class="num">${stats.mismatch.toLocaleString()}</td>
    </tr>`,
    )
    .join('');

  return `
  <h2>要素種別統計</h2>
  <table>
    <thead>
      <tr>
        <th>要素タイプ</th>
        <th>合計</th>
        <th>一致</th>
        <th>Aのみ</th>
        <th>Bのみ</th>
        <th>属性不一致</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/**
 * 差分バーチャートを生成
 */
function buildDiffBarChart(elementTypeStats) {
  const entries = Object.entries(elementTypeStats);
  if (entries.length <= 1) return '';

  const bars = entries
    .map(([, stats]) => {
      if (stats.total === 0) return '';
      const matchedPct = (stats.matched / stats.total) * 100;
      const onlyAPct = (stats.onlyA / stats.total) * 100;
      const onlyBPct = (stats.onlyB / stats.total) * 100;

      return `
    <tr>
      <td style="width: 100px;">${escapeHtml(stats.displayName)}</td>
      <td>
        <div class="bar-chart">
          <div class="bar-segment" style="width:${matchedPct}%;background:${STATUS_COLORS.matched}" title="一致: ${stats.matched}"></div>
          <div class="bar-segment" style="width:${onlyAPct}%;background:${STATUS_COLORS.onlyA}" title="Aのみ: ${stats.onlyA}"></div>
          <div class="bar-segment" style="width:${onlyBPct}%;background:${STATUS_COLORS.onlyB}" title="Bのみ: ${stats.onlyB}"></div>
        </div>
      </td>
    </tr>`;
    })
    .join('');

  return `
  <h2>差分分布</h2>
  <table style="border: none;">
    <tbody>${bars}</tbody>
  </table>
  <div style="font-size: 0.8em; color: #666; margin-top: 4px;">
    <span style="color:${STATUS_COLORS.matched}">■</span> 一致
    <span style="color:${STATUS_COLORS.onlyA}; margin-left:12px;">■</span> Aのみ
    <span style="color:${STATUS_COLORS.onlyB}; margin-left:12px;">■</span> Bのみ
  </div>`;
}

/**
 * モデルAのみの要素テーブルを生成
 */
function buildOnlyATable(elements) {
  return buildDiffElementTable(elements, 'Model Aのみの要素（削除）', 'onlyA');
}

/**
 * モデルBのみの要素テーブルを生成
 */
function buildOnlyBTable(elements) {
  return buildDiffElementTable(elements, 'Model Bのみの要素（追加）', 'onlyB');
}

/**
 * 差分要素テーブルを生成（属性詳細の展開機能付き）
 */
function buildDiffElementTable(elements, title, category) {
  const sectionId = `section-${category}`;

  if (!elements || elements.length === 0) {
    return `<h2>${title}</h2><p class="no-data">該当する要素はありません</p>`;
  }

  const rows = elements
    .map((elem, index) => {
      const hasAttrs = elem.attributes && Object.keys(elem.attributes).length > 0;
      const clickAttr = hasAttrs
        ? ` class="expandable-row" onclick="toggleDetail('${category}-detail-${index}')"`
        : '';

      const mainRow = `
    <tr${clickAttr}>
      <td>${escapeHtml(elem.displayType)}</td>
      <td>${escapeHtml(String(elem.id))}</td>
      <td>${escapeHtml(elem.name || '-')}</td>
      <td>${escapeHtml(elem.guid || '-')}</td>
    </tr>`;

      const detailRow = hasAttrs
        ? buildAttributeListDetail(elem.attributes, `${category}-detail-${index}`)
        : '';

      return mainRow + detailRow;
    })
    .join('');

  return `
  <h2 id="${sectionId}">${title}（${elements.length}件）</h2>
  <p class="expand-hint">行をクリックして属性詳細を表示</p>
  <table>
    <thead>
      <tr>
        <th>要素タイプ</th>
        <th>ID</th>
        <th>名前</th>
        <th>GUID</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/**
 * 属性一覧の展開行を生成（onlyA/onlyB要素用）
 * @param {Object.<string, string>} attributes - 属性マップ
 * @param {string} detailId - 詳細行のID
 * @returns {string} HTML文字列
 */
function buildAttributeListDetail(attributes, detailId) {
  const entries = Object.entries(attributes);
  const filteredEntries = entries.filter(([key]) => !['id', 'name', 'guid'].includes(key));

  if (filteredEntries.length === 0) return '';

  const attrRows = filteredEntries
    .map(
      ([key, value]) => `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(String(value))}</td></tr>`,
    )
    .join('');

  return `
  <tr id="${detailId}" class="detail-row" style="display:none;">
    <td colspan="4" class="detail-cell">
      <table class="attr-list-table">
        <thead><tr><th>属性名</th><th>値</th></tr></thead>
        <tbody>${attrRows}</tbody>
      </table>
    </td>
  </tr>`;
}

/**
 * 属性不一致テーブルを生成（属性差分詳細の展開機能付き）
 */
function buildMismatchTable(elements) {
  if (!elements || elements.length === 0) return '';

  const rows = elements
    .map((elem, index) => {
      const summaryRow = `
    <tr class="mismatch-summary" onclick="toggleDetail('mismatch-detail-${index}')">
      <td>${escapeHtml(elem.displayType)}</td>
      <td>${escapeHtml(String(elem.idA))}</td>
      <td>${escapeHtml(elem.nameA || '-')}</td>
      <td>${escapeHtml(String(elem.idB))}</td>
      <td>${escapeHtml(elem.nameB || '-')}</td>
      <td class="num diff-count">${elem.diffCount || 0}</td>
    </tr>`;

      const detailRow = buildAttributeDiffDetail(elem.attributeDiffs, index);

      return summaryRow + detailRow;
    })
    .join('');

  return `
  <h2>属性不一致要素（${elements.length}件）</h2>
  <p class="expand-hint">行をクリックして属性比較詳細を表示</p>
  <table class="mismatch-table">
    <thead>
      <tr>
        <th>要素タイプ</th>
        <th>A側 ID</th>
        <th>A側 名前</th>
        <th>B側 ID</th>
        <th>B側 名前</th>
        <th>不一致数</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/**
 * 属性差分詳細の展開行を生成（mismatch要素用）
 * @param {import('./reportDataCollector.js').AttributeDiff[]} attributeDiffs - 属性差分一覧
 * @param {number} index - 要素インデックス
 * @returns {string} HTML文字列
 */
function buildAttributeDiffDetail(attributeDiffs, index) {
  if (!attributeDiffs || attributeDiffs.length === 0) {
    return `<tr id="mismatch-detail-${index}" class="detail-row" style="display:none;">
      <td colspan="6" class="detail-cell"><em>構造属性情報なし</em></td></tr>`;
  }

  const attrRows = attributeDiffs
    .map((diff) => {
      const statusClass = diff.isDifferent ? 'attr-differ' : 'attr-match';
      const statusMark = diff.isDifferent ? '&#10007;' : '&#10003;';
      return `
      <tr class="${statusClass}">
        <td>${escapeHtml(diff.label)}</td>
        <td class="attr-name-cell">${escapeHtml(diff.attrName)}</td>
        <td>${escapeHtml(diff.valueA ?? '-')}</td>
        <td>${escapeHtml(diff.valueB ?? '-')}</td>
        <td class="status-cell">${statusMark}</td>
      </tr>`;
    })
    .join('');

  return `
  <tr id="mismatch-detail-${index}" class="detail-row" style="display:none;">
    <td colspan="6" class="detail-cell">
      <table class="attr-diff-table">
        <thead>
          <tr>
            <th>属性</th>
            <th>属性名</th>
            <th>Model A</th>
            <th>Model B</th>
            <th>一致</th>
          </tr>
        </thead>
        <tbody>${attrRows}</tbody>
      </table>
    </td>
  </tr>`;
}

/**
 * 展開/折りたたみ用のインラインスクリプトを生成
 * @returns {string} scriptタグのHTML文字列
 */
function buildToggleScript() {
  return `
  <script>
    function toggleDetail(id) {
      var el = document.getElementById(id);
      if (el) {
        el.style.display = el.style.display === 'none' ? 'table-row' : 'none';
      }
    }
  </script>`;
}

/**
 * フッターを生成
 */
function buildFooter(meta) {
  const date = new Date(meta.generatedAt).toLocaleString('ja-JP');
  return `
  <div class="footer">
    STB Diff Viewer - 比較レポート | 生成日時: ${date}
  </div>`;
}


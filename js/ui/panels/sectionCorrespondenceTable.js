/**
 * @fileoverview 断面対応表ウィンドウ（B1）
 *
 * 異ソフト間比較モード（断面定義の対応＝名称＋階正準化）が有効なとき、
 * トップレベル断面の1:1対応（A4正準化キー）と形状トークンの一致/差を
 * ファミリ別の表として表示するフローティングウィンドウ。
 *
 * 対応表の構築は Layer 3 の buildSectionCorrespondence（純関数）が行い、
 * 本モジュールは表示・導線のみを担当する。
 *
 * 起点: 差分サマリー（diffSummary.js）の「断面対応表」ボタン
 *
 * @module ui/panels/sectionCorrespondenceTable
 */

import { floatingWindowManager } from './floatingWindowManager.js';
import { getState } from '../../data/state/globalState.js';
import { eventBus, ComparisonEvents } from '../../data/events/index.js';
import { isCrossSoftwareModeEnabled } from '../../config/crossSoftwareConfig.js';
import { buildSectionCorrespondence } from '../../common-stb/comparison/sectionCorrespondence.js';
import { SECTION_LABELS } from '../../config/elementLabels.js';
import { escapeHtml } from '../../utils/htmlUtils.js';
import { showWarning } from '../common/toast.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('ui:panels:sectionCorrespondenceTable');

const WINDOW_ID = 'section-correspondence-float';

/** SECTION_LABELS に無い断面ファミリの補完ラベル */
const EXTRA_FAMILY_LABELS = {
  Open: '開口断面',
  Steel: '鋼材形状',
  Undefined: '未定義断面',
};

let initialized = false;

const PANEL_HTML = `
  <div id="${WINDOW_ID}" class="floating-window section-correspondence-panel hidden">
    <div class="float-window-header" id="section-correspondence-header">
      <span class="float-window-title">📑 断面対応表（異ソフト間）</span>
      <div class="float-window-controls">
        <button type="button" class="float-window-btn" id="close-${WINDOW_ID}-btn" aria-label="閉じる">✕</button>
      </div>
    </div>
    <div class="float-window-content">
      <div class="sec-corr-summary" id="sec-corr-summary"></div>
      <div class="sec-corr-note">
        対応キー: 正規化した断面名称＋StbStory標高で正準化した階（A4方式）。
        形状は寸法・形状属性トークンの一致で判定します（配筋・鋼種・かぶりは対象外）。
      </div>
      <div class="sec-corr-body" id="sec-corr-body"></div>
    </div>
  </div>
`;

/**
 * 断面対応表ウィンドウを初期化する（ウィンドウ生成・登録・再比較追従）。
 */
export function initializeSectionCorrespondenceTable() {
  if (initialized) return;

  if (!document.getElementById(WINDOW_ID)) {
    document.body.insertAdjacentHTML('beforeend', PANEL_HTML);
  }

  floatingWindowManager.registerWindow({
    windowId: WINDOW_ID,
    toggleButtonId: null,
    closeButtonId: `close-${WINDOW_ID}-btn`,
    headerId: 'section-correspondence-header',
    draggable: true,
    resizable: true,
    autoShow: false,
  });

  // 再比較・モデル再読み込み時に表示中なら内容を追従させる。
  // モードOFFへ切り替わった場合（切替時は自動再比較が走る）はウィンドウを閉じる。
  eventBus.on(ComparisonEvents.UPDATE_STATISTICS, () => {
    if (!floatingWindowManager.isWindowVisible(WINDOW_ID)) return;
    if (!isCrossSoftwareModeEnabled()) {
      floatingWindowManager.hideWindow(WINDOW_ID);
      return;
    }
    renderCorrespondence();
  });

  initialized = true;
  log.info('断面対応表ウィンドウを初期化しました');
}

/**
 * 断面対応表を構築して表示する。
 * 異ソフト間比較モードが有効で、モデルA/Bの両方が読み込まれている場合のみ利用可能。
 */
export function showSectionCorrespondenceTable() {
  if (!isCrossSoftwareModeEnabled()) {
    showWarning('断面対応表は異ソフト間比較モード（名称＋階正準化）が有効な場合のみ利用できます');
    return;
  }
  if (!initialized) initializeSectionCorrespondenceTable();
  if (!renderCorrespondence()) return;
  floatingWindowManager.showWindow(WINDOW_ID);
  log.info('[UI] 断面対応表を表示しました');
}

/**
 * 現在のモデルA/Bから対応表を構築して描画する。
 * @returns {boolean} 描画できた場合 true
 */
function renderCorrespondence() {
  const documentA = getState('models.documentA');
  const documentB = getState('models.documentB');
  if (!documentA || !documentB) {
    showWarning('断面対応表にはモデルA/Bの両方の読み込みが必要です');
    return false;
  }

  const correspondence = buildSectionCorrespondence(documentA, documentB);
  const summaryEl = document.getElementById('sec-corr-summary');
  const bodyEl = document.getElementById('sec-corr-body');
  if (!summaryEl || !bodyEl) return false;

  summaryEl.innerHTML = renderTotals(correspondence.totals);
  bodyEl.innerHTML =
    correspondence.families.length > 0
      ? correspondence.families.map(renderFamilyBlock).join('')
      : '<div class="sec-corr-empty">トップレベル断面が見つかりません</div>';
  return true;
}

/**
 * 総合サマリー行を生成する。
 * @param {Object} totals - buildSectionCorrespondence の totals
 * @returns {string} HTML文字列
 */
function renderTotals(totals) {
  const rate = totals.matchRate == null ? '—' : `${(totals.matchRate * 100).toFixed(1)}%`;
  return `
    <span class="sec-corr-total-rate">対応率 <strong>${rate}</strong></span>
    <span class="sec-corr-total-detail">
      対応 ${totals.matchedCount}（A ${totals.countA} / B ${totals.countB}）・
      形状一致 <span class="sec-corr-count-equal">${totals.shapeEqualCount}件</span>・
      形状差 <span class="sec-corr-count-diff">${totals.shapeDiffCount}件</span>
    </span>
  `;
}

/**
 * ファミリ1件分のブロック（見出し＋対応表）を生成する。
 * @param {Object} family - buildSectionCorrespondence の families 要素
 * @returns {string} HTML文字列
 */
function renderFamilyBlock(family) {
  const diffPairs = family.pairs.filter((pair) => !pair.shapeEqual);
  const equalPairs = family.pairs.filter((pair) => pair.shapeEqual);

  const rows = [
    ...diffPairs.map(renderPairRow),
    ...family.onlyA.map((item) => renderOnlyRow(item, 'A')),
    ...family.onlyB.map((item) => renderOnlyRow(item, 'B')),
  ];

  const tableBody = rows.join('');
  let equalSection = '';
  if (equalPairs.length > 0) {
    equalSection = `
      <details class="sec-corr-equal-details">
        <summary>形状一致 ${equalPairs.length}件を表示</summary>
        <table class="sec-corr-table">
          <tbody>${equalPairs.map(renderPairRow).join('')}</tbody>
        </table>
      </details>
    `;
  }

  const table = tableBody
    ? `
      <table class="sec-corr-table">
        <thead>
          <tr><th>状態</th><th>符号</th><th>階(A)</th><th>階(B)</th><th>形状差の内訳</th></tr>
        </thead>
        <tbody>${tableBody}</tbody>
      </table>
    `
    : '';

  return `
    <div class="sec-corr-family">
      <div class="sec-corr-family-head">
        <span class="sec-corr-family-name">${escapeHtml(familyLabel(family.family))}</span>
        <span class="sec-corr-family-stats">
          A ${family.countA} / B ${family.countB}・対応 ${family.matchedCount}・
          形状一致 ${family.shapeEqualCount}・形状差 ${family.shapeDiffCount}・
          Aのみ ${family.onlyA.length}・Bのみ ${family.onlyB.length}
        </span>
      </div>
      ${table}
      ${equalSection}
    </div>
  `;
}

/**
 * 対応ペア1件の行を生成する。
 * @param {Object} pair - 対応ペア
 * @returns {string} HTML文字列
 */
function renderPairRow(pair) {
  const badge = pair.shapeEqual
    ? '<span class="badge badge-valid">形状一致</span>'
    : '<span class="badge badge-warning">形状差</span>';
  const tokenDiff = pair.shapeEqual
    ? '—'
    : `${renderTokenList('A', pair.shapeTokensOnlyA)}${renderTokenList('B', pair.shapeTokensOnlyB)}`;
  return `
    <tr class="${pair.shapeEqual ? 'sec-corr-row-equal' : 'sec-corr-row-diff'}">
      <td>${badge}</td>
      <td class="sec-corr-name">${escapeHtml(displayName(pair.name))}</td>
      <td>${escapeHtml(pair.floorA || '—')}</td>
      <td>${escapeHtml(pair.floorB || '—')}</td>
      <td class="sec-corr-tokens">${tokenDiff}</td>
    </tr>
  `;
}

/**
 * 片側のみ断面の行を生成する。
 * @param {Object} item - onlyA/onlyB 要素
 * @param {'A'|'B'} side - 存在する側
 * @returns {string} HTML文字列
 */
function renderOnlyRow(item, side) {
  const badgeClass = side === 'A' ? 'sec-corr-badge-only-a' : 'sec-corr-badge-only-b';
  const floorA = side === 'A' ? item.floor || '—' : '—';
  const floorB = side === 'B' ? item.floor || '—' : '—';
  return `
    <tr class="sec-corr-row-only">
      <td><span class="badge ${badgeClass}">${side}のみ</span></td>
      <td class="sec-corr-name">${escapeHtml(displayName(item.name))}</td>
      <td>${escapeHtml(floorA)}</td>
      <td>${escapeHtml(floorB)}</td>
      <td class="sec-corr-tokens">対応する断面がモデル${side === 'A' ? 'B' : 'A'}にありません</td>
    </tr>
  `;
}

/**
 * 片側のみの形状トークン一覧を生成する。
 * @param {'A'|'B'} side - モデル側
 * @param {string[]} tokens - トークン列
 * @returns {string} HTML文字列（トークンが無ければ空文字）
 */
function renderTokenList(side, tokens) {
  if (!tokens || tokens.length === 0) return '';
  return `<div class="sec-corr-token-line"><span class="sec-corr-token-side">${side}:</span> ${tokens
    .map((token) => `<code>${escapeHtml(token)}</code>`)
    .join(' ')}</div>`;
}

/**
 * 断面ファミリの日本語ラベルを取得する。
 * @param {string} family - 例: StbSecColumn
 * @returns {string} 表示名
 */
function familyLabel(family) {
  const key = family.replace(/^StbSec/, '');
  return SECTION_LABELS[key] || EXTRA_FAMILY_LABELS[key] || family;
}

/**
 * 断面名称の表示用文字列（名称なしの明示）。
 * @param {string} name
 * @returns {string}
 */
function displayName(name) {
  return name && String(name).trim() !== '' ? name : '(名称なし)';
}

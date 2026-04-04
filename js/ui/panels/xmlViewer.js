/**
 * @fileoverview 生XMLデータビューアパネル
 *
 * 読み込んだSTBファイルの生XML（整形済み）をフローティングウィンドウで表示します。
 * モデルA/B切り替えタブ、クリップボードコピー、バリデーションエラーハイライト、
 * 要素の折りたたみ機能を提供します。
 *
 * @module ui/panels/xmlViewer
 */

import { floatingWindowManager } from './floatingWindowManager.js';
import { getState } from '../../app/globalState.js';
import { formatXml } from '../../common-stb/export/xmlFormatter.js';
import { showSuccess, showWarning } from '../common/toast.js';
import { createLogger } from '../../utils/logger.js';
import { escapeHtml } from '../../utils/htmlUtils.js';

const log = createLogger('ui:panels:xmlViewer');

let currentModel = 'A';
/** @type {string} 最後に描画した生XMLテキスト（コピー用） */
let lastRawXml = '';
/** @type {Element[]} バリデーション後のエラー/警告マーク要素リスト（DOM順） */
let errorMarkEls = [];
/** @type {number} 現在フォーカス中のマークインデックス（-1 = 未選択） */
let errorMarkIndex = -1;

/**
 * XMLビューアパネルを初期化します
 */
export function initializeXmlViewer() {
  floatingWindowManager.registerWindow({
    windowId: 'xml-viewer-float',
    toggleButtonId: 'toggle-xml-viewer-btn',
    closeButtonId: 'close-xml-viewer-btn',
    headerId: 'xml-viewer-header',
    draggable: true,
    resizable: true,
    autoShow: false,
    onShow: () => renderXml(),
  });
  // floatingWindow.js が先に xml-viewer-float を登録済みの場合、上記 registerWindow はスキップされる。
  // setOnShowCallback で確実にコールバックをセットする。
  floatingWindowManager.setOnShowCallback('xml-viewer-float', () => renderXml());

  // タブ切り替え
  document.querySelectorAll('.xml-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.xml-tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentModel = btn.dataset.model;
      clearValidationStatus();
      renderXml();
    });
  });

  // コピーボタン（生テキストをコピー）
  document.getElementById('xml-viewer-copy-btn')?.addEventListener('click', () => {
    if (!lastRawXml) return;
    navigator.clipboard
      .writeText(lastRawXml)
      .then(() => showSuccess('XMLをクリップボードにコピーしました'))
      .catch(() => showWarning('コピーに失敗しました'));
  });

  // バリデーション実行ボタン
  document.getElementById('xml-run-validation-btn')?.addEventListener('click', () => {
    runValidationAndMark();
  });

  // エラーナビゲーションボタン
  document.getElementById('xml-prev-error-btn')?.addEventListener('click', () => {
    navigateError(-1);
  });
  document.getElementById('xml-next-error-btn')?.addEventListener('click', () => {
    navigateError(+1);
  });

  // 折りたたみボタン（イベント委譲）
  const pre = document.getElementById('xml-viewer-pre');
  pre?.addEventListener('click', (e) => {
    const btn = e.target.closest('.xml-fold-btn');
    if (!btn) return;
    const node = btn.closest('.xml-node');
    if (!node) return;
    const isCollapsed = node.classList.toggle('collapsed');
    btn.textContent = isCollapsed ? '▶' : '▼';
    btn.title = isCollapsed ? '展開する' : '折りたたむ';
  });

  log.info('XMLビューアパネルを初期化しました');
}

/**
 * バリデーションステータス表示をクリア
 */
function clearValidationStatus() {
  const status = document.getElementById('xml-validation-status');
  if (status) status.textContent = '';
  resetErrorNavigation();
}

/**
 * エラーナビゲーション状態をリセット
 */
function resetErrorNavigation() {
  errorMarkEls = [];
  errorMarkIndex = -1;
  updateNavButtons();
}

/**
 * エラーナビゲーションボタンの有効/無効とラベルを更新
 */
function updateNavButtons() {
  const prevBtn = document.getElementById('xml-prev-error-btn');
  const nextBtn = document.getElementById('xml-next-error-btn');
  const label = document.getElementById('xml-error-nav-label');
  const total = errorMarkEls.length;

  if (prevBtn) prevBtn.disabled = total === 0 || errorMarkIndex <= 0;
  if (nextBtn) nextBtn.disabled = total === 0 || errorMarkIndex >= total - 1;
  if (label) {
    if (total === 0) {
      label.textContent = '';
      label.title = '';
    } else {
      const pos = errorMarkIndex >= 0 ? errorMarkIndex + 1 : '-';
      label.textContent = `${pos}/${total} 箇所`;
      label.title = `エラーのある箇所 ${pos} / ${total}（エラー総数とは異なります）`;
    }
  }
}

/**
 * エラーマークへのナビゲーションを実行
 * @param {number} direction +1で次、-1で前
 */
function navigateError(direction) {
  if (errorMarkEls.length === 0) return;
  const next = errorMarkIndex + direction;
  if (next < 0 || next >= errorMarkEls.length) return;
  jumpToMark(next);
}

/**
 * 指定インデックスのマーク要素へジャンプ
 * @param {number} index
 */
function jumpToMark(index) {
  // 前のフォーカスを解除
  if (errorMarkIndex >= 0 && errorMarkEls[errorMarkIndex]) {
    errorMarkEls[errorMarkIndex].classList.remove('xml-mark-focused');
  }

  errorMarkIndex = index;
  const mark = errorMarkEls[index];
  if (!mark) return;

  // 折りたたまれた祖先ノードを展開
  let node = mark.closest('.xml-node');
  while (node) {
    if (node.classList.contains('collapsed')) {
      node.classList.remove('collapsed');
      const btn = node.querySelector(':scope > span.xml-line > button.xml-fold-btn');
      if (btn) {
        btn.textContent = '▼';
        btn.title = '折りたたむ';
      }
    }
    node = node.parentElement?.closest('.xml-node');
  }

  mark.classList.add('xml-mark-focused');
  mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
  updateNavButtons();
}

/**
 * バリデーション後にエラーマーク一覧を収集し、最初のマークへ自動ジャンプ
 */
function collectAndInitNavigation() {
  const pre = document.getElementById('xml-viewer-pre');
  if (!pre) return;
  errorMarkEls = Array.from(pre.querySelectorAll('mark.xml-mark-error, mark.xml-mark-warning'));
  errorMarkIndex = -1;
  if (errorMarkEls.length > 0) {
    jumpToMark(0);
  } else {
    updateNavButtons();
  }
}

/**
 * 現在選択中のモデルのXMLをDOMツリーとして表示します
 */
function renderXml() {
  const pre = document.getElementById('xml-viewer-pre');
  if (!pre) return;

  const doc = getState(currentModel === 'A' ? 'models.documentA' : 'models.documentB');
  if (!doc) {
    pre.innerHTML = '';
    pre.textContent = `(モデル${currentModel}は未読み込みです)`;
    lastRawXml = '';
    return;
  }

  const raw = new XMLSerializer().serializeToString(doc);
  lastRawXml = formatXml(raw);
  pre.innerHTML = renderDomTree(doc);
}

/**
 * バリデーションを実行してエラーをXML上にマークします
 */
async function runValidationAndMark() {
  const pre = document.getElementById('xml-viewer-pre');
  const statusEl = document.getElementById('xml-validation-status');
  const btn = document.getElementById('xml-run-validation-btn');
  const typeSelect = document.getElementById('xml-validation-type');

  if (!pre) return;
  // XML未表示（初回表示前など）の場合は自動でレンダリングしてから続行する
  if (!lastRawXml) renderXml();
  if (!lastRawXml) {
    showWarning('モデルが未読み込みです');
    return;
  }

  const validationType = typeSelect?.value || 'all';

  if (btn) {
    btn.disabled = true;
    btn.textContent = '実行中...';
  }
  if (statusEl) statusEl.textContent = '';

  try {
    const doc = getState(currentModel === 'A' ? 'models.documentA' : 'models.documentB');
    if (!doc) {
      showWarning(`モデル${currentModel}が未読み込みです`);
      return;
    }

    const issues = await collectIssues(doc, validationType);
    const errorMap = buildErrorMap(issues);

    pre.innerHTML = renderDomTree(doc, errorMap);
    collectAndInitNavigation();

    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warnCount = issues.filter((i) => i.severity === 'warning').length;
    if (statusEl) {
      statusEl.textContent = '';
      statusEl.className = 'xml-validation-status';
    }

    log.info(`バリデーション完了: ${issues.length}件の問題を検出`);
  } catch (err) {
    log.error('バリデーション実行エラー:', err);
    showWarning(`バリデーションに失敗しました: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'バリデーション実行';
    }
  }
}

/**
 * 指定タイプのバリデーションを実行して全issueを返します
 * @param {Document} doc
 * @param {'xsd'|'mvd-s2'|'mvd-s4'|'all'} validationType
 * @returns {Promise<Array>}
 */
async function collectIssues(doc, validationType) {
  const { validateJsonSchema } = await import('../../common-stb/validation/jsonSchemaValidator.js');
  const { validateMvdRequirements } = await import('../../common-stb/validation/mvdValidator.js');

  const version = getState(`models.stbVersion${currentModel}`) || '2.0.2';
  const issues = [];

  if (validationType === 'xsd' || validationType === 'all') {
    try {
      const schemaIssues = validateJsonSchema(doc, { version });
      issues.push(...schemaIssues);
    } catch (e) {
      log.warn('XSDバリデーションエラー:', e.message);
    }
  }

  if (validationType === 'mvd-s2' || validationType === 'all') {
    try {
      const mvdIssues = validateMvdRequirements(doc, 's2');
      issues.push(...mvdIssues);
    } catch (e) {
      log.warn('MVD S2バリデーションエラー:', e.message);
    }
  }

  if (validationType === 'mvd-s4' || validationType === 'all') {
    try {
      const mvdIssues = validateMvdRequirements(doc, 's4');
      issues.push(...mvdIssues);
    } catch (e) {
      log.warn('MVD S4バリデーションエラー:', e.message);
    }
  }

  return issues;
}

/**
 * issueリストから要素ごとのエラーマップを構築します
 * @param {Array} issues
 * @returns {Map<Element|string, Array>} key: DOM Element ref（優先）または "elementType|elementId"（フォールバック）
 */
function buildErrorMap(issues) {
  const map = new Map();
  for (const issue of issues) {
    if (!issue.elementType) continue;
    // DOM element ref をキーにすることで、ID なし同型要素の誤マージを防ぐ
    const key = issue.element ?? `${issue.elementType}|${issue.elementId ?? ''}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(issue);
  }
  return map;
}

// ─── DOM ベースのツリーレンダリング ──────────────────────────────────────────

/**
 * XML DocumentをインタラクティブなツリーのHTML文字列に変換します
 * @param {Document} doc
 * @param {Map<string, Array>} [errorMap]
 * @returns {string} innerHTML用HTML文字列
 */
function renderDomTree(doc, errorMap = new Map()) {
  const out = [];
  out.push('<span class="xml-line">&lt;?xml version="1.0" encoding="utf-8"?&gt;</span>');
  renderDomNode(doc.documentElement, 0, errorMap, out);
  return out.join('');
}

/**
 * 単一のDOM要素ノードをHTML文字列として出力します（再帰）
 * @param {Element} el
 * @param {number} depth
 * @param {Map<string, Array>} errorMap
 * @param {string[]} out
 */
function renderDomNode(el, depth, errorMap, out) {
  const indent = '  '.repeat(depth);
  const elementChildren = Array.from(el.childNodes).filter((n) => n.nodeType === 1);

  if (elementChildren.length === 0) {
    // 葉ノード: インライン表示
    const text = el.textContent.trim();
    const tagOpen = buildTagHtml(el, errorMap);
    const closeTag = `&lt;/${escapeHtml(el.tagName)}&gt;`;
    const content = text
      ? `${tagOpen}${escapeHtml(text)}${closeTag}`
      : tagOpen.replace(/&gt;(<\/mark>)?$/, (_, mark) => `/&gt;${mark || ''}`);
    out.push(`<span class="xml-line">${escapeHtml(indent)}${content}</span>`);
  } else {
    // 親ノード: 折りたたみ可能
    const childCount = elementChildren.length;
    const tagOpen = buildTagHtml(el, errorMap);
    const closeTag = `&lt;/${escapeHtml(el.tagName)}&gt;`;

    out.push('<span class="xml-node">');
    out.push(
      `<span class="xml-line">` +
        `<button class="xml-fold-btn" title="折りたたむ">▼</button>` +
        `${escapeHtml(indent)}${tagOpen}` +
        `<span class="xml-ellipsis"> …${childCount}要素…</span>` +
        `</span>`,
    );
    out.push('<span class="xml-children">');
    for (const child of elementChildren) {
      renderDomNode(child, depth + 1, errorMap, out);
    }
    out.push('</span>');
    out.push(`<span class="xml-line">${escapeHtml(indent)}${closeTag}</span>`);
    out.push('</span>');
  }
}

/**
 * 要素の開始タグHTMLを構築します（属性のバリデーションマーク付き）
 * @param {Element} el
 * @param {Map<string, Array>} errorMap
 * @returns {string}
 */
function buildTagHtml(el, errorMap) {
  const tagName = escapeHtml(el.tagName);
  // DOM element ref でルックアップ（ID なし同型要素の誤ハイライトを防ぐ）。
  // issue.element が設定されていない旧形式のフォールバックとして文字列キーも保持する。
  const idAttr = el.getAttribute('id');
  const issues =
    errorMap.get(el) ?? errorMap.get(`${el.localName || el.tagName}|${idAttr ?? ''}`) ?? [];

  // 属性のエラーマップを構築
  const attrIssueMap = new Map(issues.filter((i) => i.attribute).map((i) => [i.attribute, i]));
  const elemIssues = issues.filter((i) => !i.attribute);

  // 属性 HTML を構築
  let attrsHtml = '';
  for (const attr of Array.from(el.attributes)) {
    const attrIssue = attrIssueMap.get(attr.name);
    const nameHtml = escapeHtml(attr.name);
    const valHtml = escapeHtml(attr.value);
    if (attrIssue) {
      const tooltip = escapeAttr(`[${attrIssue.severity}] ${attrIssue.message}`);
      attrsHtml += ` ${nameHtml}="<mark class="xml-mark-${attrIssue.severity}" title="${tooltip}">${valHtml}</mark>"`;
    } else {
      attrsHtml += ` ${nameHtml}="${valHtml}"`;
    }
  }

  let tagHtml = `&lt;${tagName}${attrsHtml}&gt;`;

  // 要素レベルのエラーがある場合は開始タグ全体をラップ
  if (elemIssues.length > 0) {
    const maxSeverity = elemIssues.some((i) => i.severity === 'error')
      ? 'error'
      : elemIssues.some((i) => i.severity === 'warning')
        ? 'warning'
        : 'info';
    const tooltip = escapeAttr(elemIssues.map((i) => `[${i.severity}] ${i.message}`).join('\n'));
    tagHtml = `<mark class="xml-mark-${maxSeverity}" title="${tooltip}">${tagHtml}</mark>`;
  }

  return tagHtml;
}

/**
 * HTML属性値として安全にエスケープします
 * @param {string} str
 * @returns {string}
 */
function escapeAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

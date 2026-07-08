/**
 * @fileoverview 非ジオメトリ要素（STB定義）の生XML差分ビューア
 *
 * 3Dに描画されない非ジオメトリ要素（断面定義・StbCommon など）を、
 * 元XMLの抜粋としてモデルA/Bを左右に並べて表示するフローティングウィンドウ。
 * 3D描画要素が「クリック→3Dで確認」できるのに対し、非ジオメトリ要素を
 * 「クリック→生XMLで確認」できるようにするための対称の導線として機能する。
 *
 * 起点:
 * - 差分サマリー（diffSummary.js）の非描画タイプ行クリック → 全差分を表示
 * - 差分一覧（diffList.js）の非描画差分クリック → 単一要素を表示
 *
 * @module ui/panels/rawXmlDiffViewer
 */

import { floatingWindowManager } from './floatingWindowManager.js';
import { getState } from '../../data/state/globalState.js';
import { formatXml } from '../../common-stb/export/xmlFormatter.js';
import { escapeHtml } from '../../utils/htmlUtils.js';
import { ELEMENT_LABELS } from '../../config/elementLabels.js';
import { COMPARISON_CATEGORY } from '../../constants/comparisonCategories.js';
import {
  STB_DEFINITION_ELEMENT_TYPE,
  classifyDefinitionGroup,
} from '../../common-stb/comparison/stbDefinitionComparator.js';
import { showSuccess, showWarning } from '../common/toast.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('ui:panels:rawXmlDiffViewer');

const WINDOW_ID = 'raw-xml-diff-float';

/** カテゴリごとの表示バッジ（CSSクラスは raw-xml-cat-<category>） */
const CATEGORY_BADGES = {
  mismatch: '情報不一致',
  onlyA: 'Aのみ',
  onlyB: 'Bのみ',
  match: '情報一致',
};

let initialized = false;
/** @type {string} 直近に表示した内容のコピー用テキスト */
let lastCopyText = '';

const PANEL_HTML = `
  <div id="${WINDOW_ID}" class="floating-window raw-xml-diff-panel hidden">
    <div class="float-window-header" id="raw-xml-diff-header">
      <span class="float-window-title">🔍 非ジオメトリ要素の生XML</span>
      <div class="float-window-controls">
        <button type="button" class="float-window-btn" id="raw-xml-diff-copy-btn" title="表示中の生XMLをコピー">📋</button>
        <button type="button" class="float-window-btn" id="close-${WINDOW_ID}-btn" aria-label="閉じる">✕</button>
      </div>
    </div>
    <div class="float-window-content">
      <div class="raw-xml-diff-subtitle" id="raw-xml-diff-subtitle"></div>
      <div class="raw-xml-diff-body" id="raw-xml-diff-body"></div>
    </div>
  </div>
`;

/**
 * 生XML差分ビューアを初期化する（ウィンドウ生成・登録）。
 */
export function initializeRawXmlDiffViewer() {
  if (initialized) return;

  if (!document.getElementById(WINDOW_ID)) {
    document.body.insertAdjacentHTML('beforeend', PANEL_HTML);
  }

  floatingWindowManager.registerWindow({
    windowId: WINDOW_ID,
    toggleButtonId: null,
    closeButtonId: `close-${WINDOW_ID}-btn`,
    headerId: 'raw-xml-diff-header',
    draggable: true,
    resizable: true,
    autoShow: false,
  });

  document.getElementById('raw-xml-diff-copy-btn')?.addEventListener('click', () => {
    if (!lastCopyText) return;
    navigator.clipboard
      .writeText(lastCopyText)
      .then(() => showSuccess('生XMLをクリップボードにコピーしました'))
      .catch(() => showWarning('コピーに失敗しました'));
  });

  initialized = true;
  log.info('生XML差分ビューアを初期化しました');
}

/** 数値セルクリック時に表示するカテゴリ（列キー→生XMLカテゴリ集合）のラベル */
const CATEGORY_SET_LABELS = {
  mismatch: '情報不一致',
  onlyA: 'Aのみ',
  onlyB: 'Bのみ',
  match: '情報一致',
};

/**
 * 指定した非ジオメトリ要素タイプの差分（情報不一致・A/Bのみ）をすべて生XML表示する。
 * @param {string} [elementType] - 非描画の要素タイプ（既定: StbDefinition）
 * @param {Object} [options]
 * @param {'section'|'joint'|'open'|'other'} [options.group] - 定義グループで絞り込む（省略時は全て）
 * @param {Array<'mismatch'|'onlyA'|'onlyB'|'match'>} [options.categories]
 *   - 表示する差分カテゴリを限定する（省略時は情報不一致・A/Bのみ。'match' を含めると情報一致も表示）
 */
export function showRawXmlForAllDefinitionDiffs(
  elementType = STB_DEFINITION_ELEMENT_TYPE,
  { group = null, categories = null } = {},
) {
  const tagFilter = group ? (tag) => classifyDefinitionGroup(tag) === group : null;
  const includeExact = Array.isArray(categories) && categories.includes('match');
  let entries = buildEntries(getResultForType(elementType), { includeExact, tagFilter });
  if (Array.isArray(categories) && categories.length > 0) {
    const wanted = new Set(categories);
    entries = entries.filter((entry) => wanted.has(entry.category));
  }
  const groupLabel = group ? DEFINITION_GROUP_LABELS[group] || group : labelFor(elementType);
  const catLabel =
    Array.isArray(categories) && categories.length > 0
      ? `（${categories.map((c) => CATEGORY_SET_LABELS[c] || c).join('・')}）`
      : '';
  renderPanel({
    subtitle: `${groupLabel}${catLabel}: 非ジオメトリ要素の差分 ${entries.length} 件`,
    entries,
  });
  show();
}

/**
 * 断面定義id（rawElement@id）の集合に一致する差分のみを生XML表示する。
 * 差分サマリーの断面数値セルは配置要素を3D絞り込みするが、参照する配置要素が
 * 実在しない（未使用の断面定義）ときは3Dに何も出ないため、その代替導線として使う。
 * @param {string[]} ids - 断面定義の rawElement@id 集合
 * @param {Object} [options]
 * @param {string} [options.elementType] - 非描画の要素タイプ（既定: StbDefinition）
 * @param {string} [options.label] - サブタイトルに添えるカテゴリ名（例: '小梁'）
 */
export function showRawXmlForDefinitionIds(
  ids,
  { elementType = STB_DEFINITION_ELEMENT_TYPE, label = '' } = {},
) {
  const idSet = new Set((ids || []).map(String));
  const idFilter = (el) => el != null && idSet.has(String(el.getAttribute?.('id')));
  const entries = buildEntries(getResultForType(elementType), { includeExact: true, idFilter });
  const prefix = label ? `${label}: ` : '';
  renderPanel({
    subtitle: `${prefix}未使用の断面定義（参照する配置要素なし） ${entries.length} 件`,
    entries,
  });
  show();
}

/** 定義グループ → 表示ラベル（サブタイトル用） */
const DEFINITION_GROUP_LABELS = {
  section: '断面定義',
  joint: '継手（接合）定義',
  open: '開口配置',
  other: 'STB定義（材料・共通）',
};

/**
 * 単一の非ジオメトリ要素を生XML表示する（差分一覧のアイテムクリック用）。
 * @param {Object} params
 * @param {string} [params.elementType] - 要素タイプ（既定: StbDefinition）
 * @param {string} params.id - 要素の対応キー（比較結果の item.id / key）
 * @param {string} [params.category] - 差分カテゴリ（表示補助用）
 */
export function showRawXmlForElement({
  elementType = STB_DEFINITION_ELEMENT_TYPE,
  id,
  category,
} = {}) {
  const entries = buildEntries(getResultForType(elementType), { includeExact: true });
  const entry = entries.find((e) => String(e.id) === String(id));
  renderPanel({
    subtitle: `${labelFor(elementType)} / ${id ?? ''}`,
    entries: entry ? [entry] : [],
  });
  if (!entry) {
    log.warn(
      `[UI] RawXmlDiff: 要素が見つかりません (type=${elementType}, id=${id}, category=${category})`,
    );
  }
  show();
}

/**
 * 比較結果から指定要素タイプの正規化済み結果を取得する。
 * @param {string} elementType
 * @returns {Object|null}
 */
function getResultForType(elementType) {
  const results = getState('comparisonResults');
  if (!results) return null;
  return typeof results.get === 'function'
    ? results.get(elementType) || null
    : results[elementType] || null;
}

/**
 * 正規化済み比較結果を、生XML表示用のエントリ配列へ変換する。
 * @param {Object|null} result - 正規化済み比較結果
 * @param {Object} [options]
 * @param {boolean} [options.includeExact=false] - 情報一致（差分なし）ペアも含めるか
 * @param {((tag: string) => boolean)|null} [options.tagFilter=null] - タグで絞る述語（省略時は全て）
 * @param {((el: Element|null) => boolean)|null} [options.idFilter=null] - rawElement で絞る述語（A/Bいずれか一致で採用）
 * @returns {Array<{category: string, id: string, name: string, tag: string, elementA: Element|null, elementB: Element|null}>}
 */
function buildEntries(result, { includeExact = false, tagFilter = null, idFilter = null } = {}) {
  if (!result) return [];
  const entries = [];

  for (const pair of result[COMPARISON_CATEGORY.ATTRIBUTE_MISMATCH] || []) {
    entries.push(makeEntry('mismatch', pair.dataA, pair.dataB));
  }
  for (const item of result[COMPARISON_CATEGORY.ONLY_A] || []) {
    entries.push(makeEntry('onlyA', item, null));
  }
  for (const item of result[COMPARISON_CATEGORY.ONLY_B] || []) {
    entries.push(makeEntry('onlyB', null, item));
  }
  if (includeExact) {
    for (const pair of result[COMPARISON_CATEGORY.EXACT] || []) {
      entries.push(makeEntry('match', pair.dataA, pair.dataB));
    }
  }

  let filtered = tagFilter ? entries.filter((entry) => tagFilter(entry.tag)) : entries;
  if (idFilter) {
    filtered = filtered.filter((entry) => idFilter(entry.elementA) || idFilter(entry.elementB));
  }
  return filtered;
}

/**
 * 比較アイテムから表示用エントリを生成する。
 * @param {string} category
 * @param {Object|null} itemA - モデルA側の比較アイテム（rawElement を持つ）
 * @param {Object|null} itemB - モデルB側の比較アイテム
 * @returns {Object}
 */
function makeEntry(category, itemA, itemB) {
  return {
    category,
    id: itemA?.id ?? itemB?.id ?? '',
    name: itemA?.name ?? itemB?.name ?? itemA?.id ?? itemB?.id ?? '',
    tag: itemA?.tag ?? itemB?.tag ?? '',
    elementA: itemA?.rawElement ?? null,
    elementB: itemB?.rawElement ?? null,
  };
}

/**
 * パネル本体を描画する。
 * @param {Object} params
 * @param {string} params.subtitle
 * @param {Array<Object>} params.entries
 */
function renderPanel({ subtitle, entries }) {
  const subtitleEl = document.getElementById('raw-xml-diff-subtitle');
  const bodyEl = document.getElementById('raw-xml-diff-body');
  if (subtitleEl) subtitleEl.textContent = subtitle;
  if (!bodyEl) return;

  if (!entries.length) {
    bodyEl.innerHTML =
      '<div class="raw-xml-diff-empty">表示できる非ジオメトリ要素の差分がありません</div>';
    lastCopyText = '';
    return;
  }

  bodyEl.innerHTML = entries.map(renderEntryCard).join('');
  lastCopyText = buildCopyText(entries);
}

/**
 * 1エントリ分のカード（見出し＋A/B生XMLペイン）を生成する。
 * @param {Object} entry
 * @returns {string} HTML文字列
 */
function renderEntryCard(entry) {
  const badge = CATEGORY_BADGES[entry.category] || entry.category;
  return `
    <div class="raw-xml-diff-card raw-xml-cat-${escapeHtml(entry.category)}">
      <div class="raw-xml-card-head">
        <span class="raw-xml-cat-badge">${escapeHtml(badge)}</span>
        <span class="raw-xml-card-tag">${escapeHtml(entry.tag)}</span>
        <span class="raw-xml-card-name">${escapeHtml(entry.name || entry.id)}</span>
      </div>
      <div class="raw-xml-diff-panes">
        ${renderPane('モデルA', entry.elementA, 'a', 'モデルAには存在しません')}
        ${renderPane('モデルB', entry.elementB, 'b', 'モデルBには存在しません')}
      </div>
    </div>
  `;
}

/**
 * A または B の生XMLペインを生成する。
 * @param {string} label - ペイン見出し
 * @param {Element|null} el - 元XML要素
 * @param {'a'|'b'} side
 * @param {string} missingNote - 要素が無い場合の注記
 * @returns {string} HTML文字列
 */
function renderPane(label, el, side, missingNote) {
  const body = el
    ? `<pre class="raw-xml-pane-pre">${escapeHtml(elementToXml(el))}</pre>`
    : `<div class="raw-xml-pane-missing">${escapeHtml(missingNote)}</div>`;
  return `
    <div class="raw-xml-pane raw-xml-pane-${side}">
      <div class="raw-xml-pane-label">${escapeHtml(label)}</div>
      ${body}
    </div>
  `;
}

/**
 * DOM要素を整形済みの生XML抜粋（XML宣言を除いたもの）に変換する。
 * @param {Element} el
 * @returns {string}
 */
function elementToXml(el) {
  try {
    const serialized = new XMLSerializer().serializeToString(el);
    return formatXml(serialized).replace(/^<\?xml[^>]*\?>\s*/, '');
  } catch (error) {
    log.warn('生XMLのシリアライズに失敗しました:', error);
    return '(XMLの取得に失敗しました)';
  }
}

/**
 * コピー用のプレーンテキストを構築する。
 * @param {Array<Object>} entries
 * @returns {string}
 */
function buildCopyText(entries) {
  return entries
    .map((entry) => {
      const badge = CATEGORY_BADGES[entry.category] || entry.category;
      const parts = [`<!-- ${badge} ${entry.tag} ${entry.name || entry.id} -->`];
      if (entry.elementA) parts.push(`<!-- モデルA -->\n${elementToXml(entry.elementA)}`);
      if (entry.elementB) parts.push(`<!-- モデルB -->\n${elementToXml(entry.elementB)}`);
      return parts.join('\n');
    })
    .join('\n\n');
}

/**
 * 要素タイプの表示名を取得する。
 * @param {string} elementType
 * @returns {string}
 */
function labelFor(elementType) {
  return ELEMENT_LABELS[elementType] || elementType;
}

/**
 * ウィンドウを表示する（未初期化なら初期化する）。
 */
function show() {
  if (!initialized) initializeRawXmlDiffViewer();
  floatingWindowManager.showWindow(WINDOW_ID);
}

/**
 * @fileoverview ウィンドウテンプレートレンダラー
 *
 * フローティングウィンドウのテンプレートをレンダリングするためのユーティリティです。
 * config/windowConfig.js と連携して動的なウィンドウ生成を行います。
 *
 * @module ui/panels/windowTemplateRenderer
 */

import {
  getWindowDefinition,
  getWindowTemplate,
  WINDOW_DEFINITIONS,
  WINDOW_TEMPLATES,
} from '../../config/windowConfig.js';

// ============================================================================
// ウィンドウHTML生成
// ============================================================================

/**
 * ウィンドウのHTML構造を生成
 * @param {Object} options - オプション
 * @param {string} options.windowId - ウィンドウID
 * @param {string} options.title - タイトル
 * @param {string} options.icon - アイコン
 * @param {string} options.content - コンテンツHTML
 * @param {string} [options.headerExtra=''] - ヘッダー追加要素
 * @param {string} [options.cssClass=''] - 追加CSSクラス
 * @returns {string} HTML文字列
 */
export function generateWindowHTML(options) {
  const { windowId, title, icon, content, headerExtra = '', cssClass = '' } = options;

  const classNames = ['floating-window', cssClass].filter(Boolean).join(' ');

  return `
    <div id="${windowId}" class="${classNames}">
      <div class="float-window-header" id="${windowId}-header">
        <span class="float-window-title">${icon} ${title}</span>
        <div class="float-window-controls">
          ${headerExtra}
          <button class="float-window-btn" id="close-${windowId}-btn">✕</button>
        </div>
      </div>
      <div class="float-window-content">
        ${content}
      </div>
    </div>
  `.trim();
}

/**
 * ウィンドウIDからHTML構造を生成
 * @param {string} windowId - ウィンドウID
 * @returns {string|null} HTML文字列、または定義が見つからない場合はnull
 */
export function generateWindowHTMLById(windowId) {
  const def = getWindowDefinition(windowId);
  if (!def) {
    console.warn(`[WindowTemplateRenderer] ウィンドウ定義が見つかりません: ${windowId}`);
    return null;
  }

  let content = '';
  let headerExtra = '';

  if (def.template) {
    const template = getWindowTemplate(def.template);
    if (template) {
      content = template.content || '';
      headerExtra = template.headerExtra || '';
    }
  }

  return generateWindowHTML({
    windowId,
    title: def.title,
    icon: def.icon,
    content,
    headerExtra,
    cssClass: def.cssClass || '',
  });
}

// ============================================================================
// DOM操作
// ============================================================================

/**
 * ウィンドウをDOMに追加
 * @param {string} windowId - ウィンドウID
 * @param {HTMLElement} [container=document.body] - 挿入先コンテナ
 * @returns {HTMLElement|null} 生成されたウィンドウ要素
 */
export function appendWindowToDOM(windowId, container = document.body) {
  const html = generateWindowHTMLById(windowId);
  if (!html) return null;

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  const windowEl = tempDiv.firstElementChild;

  if (windowEl) {
    container.appendChild(windowEl);
    return windowEl;
  }

  return null;
}

/**
 * 複数のウィンドウをDOMに追加
 * @param {string[]} windowIds - ウィンドウIDの配列
 * @param {HTMLElement} [container=document.body] - 挿入先コンテナ
 * @returns {HTMLElement[]} 生成されたウィンドウ要素の配列
 */
export function appendWindowsToDOM(windowIds, container = document.body) {
  return windowIds.map((id) => appendWindowToDOM(id, container)).filter(Boolean);
}

// ============================================================================
// テンプレート管理
// ============================================================================

/**
 * カスタムテンプレートを登録（実行時拡張用）
 * @param {string} templateName - テンプレート名
 * @param {Object} templateDef - テンプレート定義
 * @param {string} templateDef.content - コンテンツHTML
 * @param {string} [templateDef.headerExtra] - ヘッダー追加要素
 */
export function registerTemplate(templateName, templateDef) {
  if (WINDOW_TEMPLATES[templateName]) {
    console.warn(`[WindowTemplateRenderer] テンプレートを上書き: ${templateName}`);
  }
  WINDOW_TEMPLATES[templateName] = templateDef;
}

/**
 * カスタムウィンドウ定義を登録（実行時拡張用）
 * @param {string} windowId - ウィンドウID
 * @param {Object} windowDef - ウィンドウ定義
 */
export function registerWindowDefinition(windowId, windowDef) {
  if (WINDOW_DEFINITIONS[windowId]) {
    console.warn(`[WindowTemplateRenderer] ウィンドウ定義を上書き: ${windowId}`);
  }
  WINDOW_DEFINITIONS[windowId] = windowDef;
}

// ============================================================================
// ユーティリティ
// ============================================================================

/**
 * ウィンドウが存在するか確認
 * @param {string} windowId - ウィンドウID
 * @returns {boolean} 存在する場合true
 */
export function windowExists(windowId) {
  return document.getElementById(windowId) !== null;
}

/**
 * ウィンドウ定義が存在するか確認
 * @param {string} windowId - ウィンドウID
 * @returns {boolean} 存在する場合true
 */
export function hasWindowDefinition(windowId) {
  return windowId in WINDOW_DEFINITIONS;
}

/**
 * 全ウィンドウIDを取得
 * @returns {string[]} ウィンドウIDの配列
 */
export function getAllWindowIds() {
  return Object.keys(WINDOW_DEFINITIONS);
}

// ============================================================================
// シングルトン
// ============================================================================

/**
 * WindowTemplateRenderer クラス
 * シングルトンパターンでインスタンスを提供
 */
class WindowTemplateRenderer {
  constructor() {
    this.generatedWindows = new Set();
  }

  /**
   * ウィンドウを生成（重複チェック付き）
   * @param {string} windowId - ウィンドウID
   * @param {HTMLElement} [container=document.body] - 挿入先
   * @returns {HTMLElement|null} 生成されたウィンドウ要素
   */
  createWindow(windowId, container = document.body) {
    if (this.generatedWindows.has(windowId)) {
      console.warn(`[WindowTemplateRenderer] ウィンドウは既に生成済み: ${windowId}`);
      return document.getElementById(windowId);
    }

    if (windowExists(windowId)) {
      console.warn(`[WindowTemplateRenderer] ウィンドウはDOMに既に存在: ${windowId}`);
      this.generatedWindows.add(windowId);
      return document.getElementById(windowId);
    }

    const windowEl = appendWindowToDOM(windowId, container);
    if (windowEl) {
      this.generatedWindows.add(windowId);
    }
    return windowEl;
  }

  /**
   * 生成済みウィンドウをリセット
   */
  reset() {
    this.generatedWindows.clear();
  }

  /**
   * 生成済みウィンドウIDを取得
   * @returns {string[]} ウィンドウIDの配列
   */
  getGeneratedWindowIds() {
    return [...this.generatedWindows];
  }
}

// シングルトンインスタンス
let rendererInstance = null;

/**
 * WindowTemplateRendererのシングルトンインスタンスを取得
 * @returns {WindowTemplateRenderer} レンダラーインスタンス
 */
export function getWindowTemplateRenderer() {
  if (!rendererInstance) {
    rendererInstance = new WindowTemplateRenderer();
  }
  return rendererInstance;
}

// ============================================================================
// デフォルトエクスポート
// ============================================================================

export default {
  generateWindowHTML,
  generateWindowHTMLById,
  appendWindowToDOM,
  appendWindowsToDOM,
  registerTemplate,
  registerWindowDefinition,
  windowExists,
  hasWindowDefinition,
  getAllWindowIds,
  getWindowTemplateRenderer,
};

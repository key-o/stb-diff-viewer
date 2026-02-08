/**
 * @fileoverview フローティングウィンドウ設定
 *
 * フローティングウィンドウの設定を一元管理します。
 * このファイルがウィンドウ設定の単一の情報源（Single Source of Truth）です。
 *
 * @module config/windowConfig
 */

// ============================================================================
// ウィンドウ定義
// ============================================================================

/**
 * フローティングウィンドウ定義
 * @type {Object.<string, Object>}
 */
export const WINDOW_DEFINITIONS = {
  'tree-view-float': {
    title: 'ツリービュー',
    icon: '🌳',
    toggleButtonId: 'toggle-tree-view-btn',
    draggable: true,
    resizable: false,
    autoShow: false,
    isDynamic: true, // JSで動的生成
    template: 'tree-view',
  },
  'element-settings-float': {
    title: '表示要素設定',
    icon: '🏗️',
    toggleButtonId: 'toggle-element-settings-btn',
    closeButtonId: 'close-element-settings-btn',
    headerId: 'element-settings-header',
    draggable: true,
    resizable: false,
    autoShow: false,
    isDynamic: false, // HTMLで静的定義
  },
  'component-info': {
    title: '要素情報',
    icon: '📋',
    toggleButtonId: 'toggle-component-info-btn',
    draggable: true,
    resizable: true,
    autoShow: true,
    isDynamic: false,
    cssClass: 'component-info-resizable',
  },
  'clipping-settings-float': {
    title: '表示範囲設定',
    icon: '✂️',
    toggleButtonId: 'toggle-clipping-settings-btn',
    closeButtonId: 'close-clipping-settings-btn',
    headerId: 'clipping-settings-header',
    draggable: true,
    resizable: false,
    autoShow: false,
    isDynamic: false,
  },
  'display-settings-float': {
    title: '色付けモード設定',
    icon: '🎨',
    toggleButtonId: 'toggle-display-settings-btn',
    closeButtonId: 'close-display-settings-btn',
    headerId: 'display-settings-header',
    draggable: true,
    resizable: false,
    autoShow: false,
    isDynamic: false,
  },
  'dxf-floating': {
    title: 'DXFエクスポート',
    icon: '📐',
    toggleButtonId: 'toggle-dxf-floating-btn',
    draggable: true,
    resizable: false,
    autoShow: false,
    isDynamic: false,
    hasOnShowCallback: true, // onShow コールバックあり
  },
  'schema-error-list-float': {
    title: 'スキーマエラー一覧',
    icon: '⚠️',
    toggleButtonId: 'toggle-schema-error-list-btn',
    closeButtonId: 'close-schema-error-list-btn',
    headerId: 'schema-error-list-header',
    draggable: true,
    resizable: false,
    autoShow: false,
    isDynamic: false,
  },
};

// ============================================================================
// テンプレート定義
// ============================================================================

/**
 * 動的生成ウィンドウのテンプレート
 * @type {Object.<string, Object>}
 */
export const WINDOW_TEMPLATES = {
  'tree-view': {
    headerExtra: '',
    content: `
      <div class="tree-view-tabs">
        <button type="button" class="tree-tab-btn active" data-tab="element">要素</button>
        <button type="button" class="tree-tab-btn" data-tab="section">断面</button>
        <select
          id="section-grouping-mode"
          class="grouping-mode-select tree-tab-option"
          title="グループ化モード"
          style="display: none;"
        >
          <option value="floor">階ごと</option>
          <option value="code">符号ごと</option>
        </select>
      </div>
      <div class="tree-tab-content">
        <div id="element-tree-container" class="tree-tab-panel active">
          <div class="tree-empty-message">
            モデルを読み込んでください
          </div>
        </div>
        <div id="section-tree-container" class="tree-tab-panel" style="display: none;">
          <div class="tree-empty-message">
            モデルを読み込んでください
          </div>
        </div>
      </div>
    `,
  },
};

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * ウィンドウIDからウィンドウ定義を取得
 * @param {string} windowId - ウィンドウID
 * @returns {Object|undefined} ウィンドウ定義
 */
export function getWindowDefinition(windowId) {
  return WINDOW_DEFINITIONS[windowId];
}

/**
 * テンプレート名からテンプレート定義を取得
 * @param {string} templateName - テンプレート名
 * @returns {Object|undefined} テンプレート定義
 */
export function getWindowTemplate(templateName) {
  return WINDOW_TEMPLATES[templateName];
}

/**
 * 動的生成ウィンドウのリストを取得
 * @returns {Array<Object>} 動的生成ウィンドウ定義の配列
 */
export function getDynamicWindows() {
  return Object.entries(WINDOW_DEFINITIONS)
    .filter(([, def]) => def.isDynamic)
    .map(([windowId, def]) => ({
      windowId,
      ...def,
    }));
}

/**
 * 静的HTMLウィンドウのリストを取得
 * @returns {Array<Object>} 静的HTMLウィンドウ定義の配列
 */
export function getStaticWindows() {
  return Object.entries(WINDOW_DEFINITIONS)
    .filter(([, def]) => !def.isDynamic)
    .map(([windowId, def]) => ({
      windowId,
      ...def,
    }));
}

/**
 * 全ウィンドウのリストを取得
 * @returns {Array<Object>} ウィンドウ定義の配列
 */
export function getAllWindows() {
  return Object.entries(WINDOW_DEFINITIONS).map(([windowId, def]) => ({
    windowId,
    ...def,
  }));
}

/**
 * 登録用の設定オブジェクトを生成
 * @param {string} windowId - ウィンドウID
 * @returns {Object|null} 登録用設定オブジェクト
 */
export function getRegisterConfig(windowId) {
  const def = getWindowDefinition(windowId);
  if (!def) return null;

  return {
    windowId,
    toggleButtonId: def.toggleButtonId,
    closeButtonId: def.closeButtonId || `close-${windowId}-btn`,
    headerId: def.headerId || `${windowId}-header`,
    draggable: def.draggable ?? true,
    resizable: def.resizable ?? false,
    autoShow: def.autoShow ?? false,
  };
}

// ============================================================================
// バリデーション
// ============================================================================

/**
 * ウィンドウ定義を検証
 * @param {Object} definition - ウィンドウ定義
 * @returns {boolean} 有効かどうか
 * @throws {Error} 無効な場合
 */
export function validateWindowDefinition(definition) {
  const required = ['title', 'toggleButtonId'];
  for (const field of required) {
    if (!definition[field]) {
      throw new Error(`Missing required field in window definition: ${field}`);
    }
  }
  return true;
}

/**
 * 全ウィンドウ定義を検証
 * @returns {boolean} 全て有効かどうか
 */
export function validateAllWindowDefinitions() {
  for (const [windowId, def] of Object.entries(WINDOW_DEFINITIONS)) {
    try {
      validateWindowDefinition(def);
    } catch (error) {
      throw new Error(`Invalid window definition for ${windowId}: ${error.message}`);
    }
  }
  return true;
}

// ============================================================================
// デフォルトエクスポート
// ============================================================================

export default {
  WINDOW_DEFINITIONS,
  WINDOW_TEMPLATES,
  getWindowDefinition,
  getWindowTemplate,
  getDynamicWindows,
  getStaticWindows,
  getAllWindows,
  getRegisterConfig,
  validateWindowDefinition,
  validateAllWindowDefinitions,
};

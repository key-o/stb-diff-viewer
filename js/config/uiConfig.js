/**
 * @fileoverview UI設定
 *
 * UI要素のスタイル、サイズ、z-indexなどの設定を一元管理します。
 * ハードコーディングされた値を外部化し、カスタマイズを容易にします。
 *
 * @module config/uiConfig
 */

/**
 * z-indexの階層定義
 * 値が大きいほど前面に表示されます
 */
export const Z_INDEX = {
  // 基本レイヤー（1-100）
  BASE: 1,
  PANEL: 10,

  // オーバーレイレイヤー（100-1000）
  OVERLAY: 100,
  DROPDOWN: 500,
  TOOLTIP: 800,

  // モーダルレイヤー（1000-10000）
  MODAL_BACKDROP: 1000,
  MODAL: 1100,
  TOAST: 3000,

  // 最前面レイヤー（10000+）
  CONTEXT_MENU: 10000,
  LOADING_INDICATOR: 10000,
  PERFORMANCE_MONITOR: 10000,
  PARAMETER_EDITOR: 10000,

  // 診断ツール（99999）
  GEOMETRY_INSPECTOR: 99999,
  GEOMETRY_MISMATCH_ANALYZER: 9999,
};

/**
 * フローティングウィンドウのデフォルトサイズ
 */
export const FLOATING_WINDOW_SIZE = {
  // 差分ステータスパネル
  diffStatusPanel: {
    width: 280,
    minWidth: 280,
  },

  // 要素ツリービュー
  elementTreeView: {
    height: 400,
  },

  // バリデーションパネル
  validationPanel: {
    maxHeight: 600,
    detailsMaxHeight: 300,
  },

  // ローディングインジケータ
  loadingIndicator: {
    minWidth: 320,
    maxWidth: 480,
  },

  // コンテキストメニュー
  contextMenu: {
    minWidth: 180,
    maxWidth: 280,
  },

  // トースト通知
  toast: {
    maxWidth: 400,
  },

  // パラメータエディタ
  parameterEditor: {
    maxWidth: 500,
  },

  // 診断ツール
  diagnostics: {
    width: 520,
  },

  // パフォーマンスモニター
  performanceMonitor: {
    minWidth: 150,
  },
};

/**
 * アニメーション時間（ミリ秒）
 */
export const ANIMATION_DURATION = {
  // トランジション
  fast: 150,
  normal: 300,
  slow: 500,

  // フェード
  fadeIn: 200,
  fadeOut: 150,

  // スライド
  slideIn: 250,
  slideOut: 200,

  // パネル開閉
  panelToggle: 300,
};

/**
 * スペーシング（px）
 */
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

/**
 * ブレークポイント（px）
 */
export const BREAKPOINT = {
  mobile: 480,
  tablet: 768,
  desktop: 1024,
  widescreen: 1280,
};

/**
 * アイコンサイズ（px）
 */
export const ICON_SIZE = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
};

/**
 * フォントサイズ（px）
 */
export const FONT_SIZE = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 24,
};

/**
 * プログレスバー設定
 */
export const PROGRESS_BAR = {
  height: 8,
  borderRadius: 4,
  minLabelHeight: 18,
};

/**
 * 入力フィールド設定
 */
export const INPUT_FIELD = {
  height: 32,
  minWidth: 40,
  numberInputWidth: 80,
};

/**
 * ボタン設定
 */
export const BUTTON = {
  // サイズ
  heightSmall: 24,
  heightMedium: 32,
  heightLarge: 40,

  // 最小幅
  minWidth: 30,
};

/**
 * パネル設定
 */
export const PANEL = {
  // ボーダー半径
  borderRadius: 4,
  borderRadiusLarge: 8,

  // シャドウ
  shadowLight: '0 2px 4px rgba(0, 0, 0, 0.1)',
  shadowMedium: '0 4px 8px rgba(0, 0, 0, 0.15)',
  shadowHeavy: '0 8px 16px rgba(0, 0, 0, 0.2)',
};

/**
 * カラー設定（CSSカスタムプロパティ名）
 * 実際の色値はstyle/配下のCSSで定義
 */
export const COLOR_VAR = {
  // 背景
  bgPrimary: 'var(--bg-primary)',
  bgSecondary: 'var(--bg-secondary)',
  bgTertiary: 'var(--bg-tertiary)',

  // 前景
  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',

  // アクセント
  accentPrimary: 'var(--accent-primary)',
  accentSecondary: 'var(--accent-secondary)',

  // ステータス
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  error: 'var(--color-error)',
  info: 'var(--color-info)',
};

/**
 * UI設定をCSSスタイル文字列に変換するヘルパー関数
 */
export const uiConfigHelpers = {
  /**
   * z-index値をスタイル文字列に変換
   * @param {string} key - Z_INDEXのキー
   * @returns {string} CSSスタイル文字列
   */
  getZIndexStyle(key) {
    const value = Z_INDEX[key];
    return value !== undefined ? `z-index: ${value};` : '';
  },

  /**
   * サイズ値をpx単位のスタイル文字列に変換
   * @param {number} value - ピクセル値
   * @param {string} property - CSSプロパティ名
   * @returns {string} CSSスタイル文字列
   */
  toPxStyle(value, property) {
    return `${property}: ${value}px;`;
  },

  /**
   * 複数のサイズ設定をスタイルオブジェクトに変換
   * @param {Object} sizeConfig - サイズ設定オブジェクト
   * @returns {Object} スタイルオブジェクト
   */
  toStyleObject(sizeConfig) {
    const result = {};
    for (const [key, value] of Object.entries(sizeConfig)) {
      // camelCaseをkebab-caseに変換
      const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      result[cssKey] = typeof value === 'number' ? `${value}px` : value;
    }
    return result;
  },
};

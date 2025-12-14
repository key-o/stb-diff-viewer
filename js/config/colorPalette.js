/**
 * @fileoverview 統一カラーパレット定義
 *
 * アプリケーション全体で使用する色を一元管理します。
 * マテリアルデザインカラーを基調とし、用途別に整理されています。
 *
 * 使用方法:
 * ```javascript
 * import { COLORS, DIFF_COLORS, ELEMENT_COLORS } from './config/colorPalette.js';
 * const greenColor = COLORS.GREEN;
 * const matchedColor = DIFF_COLORS.matched;
 * ```
 */

// ============================================================================
// マテリアルデザイン基本色
// ============================================================================

/**
 * マテリアルデザイン基本カラーパレット
 * @see https://materialui.co/colors/
 */
export const COLORS = {
  // プライマリカラー
  GREEN: '#4CAF50',           // マテリアルグリーン 500
  GREEN_LIGHT: '#A5D6A7',     // マテリアルグリーン 200
  GREEN_DARK: '#388E3C',      // マテリアルグリーン 700

  RED: '#F44336',             // マテリアルレッド 500
  RED_LIGHT: '#EF9A9A',       // マテリアルレッド 200
  RED_DARK: '#D32F2F',        // マテリアルレッド 700

  BLUE: '#2196F3',            // マテリアルブルー 500
  BLUE_LIGHT: '#90CAF9',      // マテリアルブルー 200
  BLUE_DARK: '#1976D2',       // マテリアルブルー 700

  ORANGE: '#FF9800',          // マテリアルオレンジ 500
  ORANGE_LIGHT: '#FFCC80',    // マテリアルオレンジ 200
  ORANGE_DARK: '#F57C00',     // マテリアルオレンジ 700

  AMBER: '#FFC107',           // マテリアルアンバー 500
  AMBER_LIGHT: '#FFE082',     // マテリアルアンバー 200
  AMBER_DARK: '#FFA000',      // マテリアルアンバー 700

  // セカンダリカラー
  BROWN: '#795548',           // マテリアルブラウン 500
  CYAN: '#00BCD4',            // マテリアルシアン 500
  PURPLE: '#9C27B0',          // マテリアルパープル 500
  PINK: '#E91E63',            // マテリアルピンク 500
  DEEP_ORANGE: '#FF5722',     // マテリアルディープオレンジ 500
  LIGHT_GREEN: '#8BC34A',     // マテリアルライトグリーン 500
  BLUE_GREY: '#607D8B',       // マテリアルブルーグレー 500

  // ニュートラルカラー
  GREY: '#9E9E9E',            // マテリアルグレー 500
  GREY_LIGHT: '#E0E0E0',      // マテリアルグレー 300
  GREY_DARK: '#616161',       // マテリアルグレー 700
  WHITE: '#FFFFFF',
  BLACK: '#000000'
};

// ============================================================================
// 差分表示色（Diff Colors）
// ============================================================================

/**
 * 差分表示用カラー（4段階分類）
 */
export const DIFF_COLORS = {
  matched: COLORS.GREEN,      // 一致要素（位置も属性も一致）
  mismatch: COLORS.ORANGE,    // 不一致要素（位置は一致、属性が異なる）
  onlyA: COLORS.GREEN,        // モデルAのみ（matchedと統一）
  onlyB: COLORS.RED          // モデルBのみ
};

/**
 * 許容差対応 差分表示用カラー（5段階分類）
 */
export const TOLERANCE_DIFF_COLORS = {
  exact: COLORS.GREEN,        // 完全一致
  withinTolerance: COLORS.AMBER, // 許容差内
  mismatch: COLORS.ORANGE,    // 不一致
  onlyA: COLORS.GREEN,        // モデルAのみ
  onlyB: COLORS.RED          // モデルBのみ
};

// ============================================================================
// 部材別色（Element Colors）
// ============================================================================

/**
 * 構造部材タイプ別カラー
 */
export const ELEMENT_COLORS = {
  // 柱系
  Column: COLORS.BROWN,       // 柱
  Post: COLORS.LIGHT_GREEN,   // 間柱

  // 梁系
  Girder: COLORS.BLUE,        // 大梁
  Beam: COLORS.GREEN,         // 小梁

  // ブレース
  Brace: COLORS.ORANGE,       // ブレース

  // 面材
  Slab: COLORS.GREY,          // スラブ
  Wall: COLORS.DEEP_ORANGE,   // 壁

  // その他
  Node: COLORS.PINK,          // 節点
  Pile: COLORS.BLUE_GREY,     // 杭
  Footing: COLORS.PURPLE,     // 基礎
  FoundationColumn: COLORS.CYAN // 基礎柱
};

// ============================================================================
// 状態色（Status Colors）
// ============================================================================

/**
 * バリデーション・スキーマ状態カラー
 */
export const STATUS_COLORS = {
  valid: COLORS.GREEN,        // 正常
  info: COLORS.BLUE,          // 情報
  warning: COLORS.ORANGE,     // 警告
  error: COLORS.RED          // エラー
};

// ============================================================================
// 重要度色（Importance Colors）
// ============================================================================

/**
 * 重要度レベル別カラー
 */
export const IMPORTANCE_COLORS = {
  REQUIRED: COLORS.RED,       // 必須
  OPTIONAL: COLORS.ORANGE,    // 任意
  UNNECESSARY: COLORS.GREY,   // 不要
  NOT_APPLICABLE: COLORS.GREY_DARK // 対象外
};

// ============================================================================
// UI色（UI Colors）
// ============================================================================

/**
 * UIハイライト・インタラクションカラー
 */
export const UI_COLORS = {
  highlight: COLORS.AMBER,    // ハイライト
  selected: COLORS.AMBER_LIGHT, // 選択状態
  hover: COLORS.GREY_LIGHT,   // ホバー状態
  background: '#F0F0F0',      // 背景（シーン）
  backgroundDark: '#111111',  // 背景（ダーク）
  border: COLORS.GREY_LIGHT  // ボーダー
};

/**
 * 軸・階表示カラー
 */
export const LAYOUT_COLORS = {
  axis: '#888888',            // 通り芯
  story: '#AAAAAA',           // 階
  grid: COLORS.GREY_LIGHT    // グリッド
};

// ============================================================================
// Three.js用 16進数変換
// ============================================================================

/**
 * CSS色コード（#RRGGBB）をThree.js用の数値（0xRRGGBB）に変換
 * @param {string} hexColor - CSS色コード（例: '#4CAF50'）
 * @returns {number} Three.js用の数値（例: 0x4CAF50）
 */
export function toThreeColor(hexColor) {
  return parseInt(hexColor.replace('#', ''), 16);
}

/**
 * マテリアルデザイン基本色のThree.js用数値
 */
export const THREE_COLORS = {
  GREEN: toThreeColor(COLORS.GREEN),
  GREEN_LIGHT: toThreeColor(COLORS.GREEN_LIGHT),
  RED: toThreeColor(COLORS.RED),
  RED_LIGHT: toThreeColor(COLORS.RED_LIGHT),
  BLUE: toThreeColor(COLORS.BLUE),
  BLUE_LIGHT: toThreeColor(COLORS.BLUE_LIGHT),
  ORANGE: toThreeColor(COLORS.ORANGE),
  AMBER: toThreeColor(COLORS.AMBER),
  BROWN: toThreeColor(COLORS.BROWN),
  GREY: toThreeColor(COLORS.GREY),
  WHITE: toThreeColor(COLORS.WHITE),
  BLACK: toThreeColor(COLORS.BLACK)
};

// ============================================================================
// デフォルトエクスポート
// ============================================================================

export default {
  COLORS,
  DIFF_COLORS,
  TOLERANCE_DIFF_COLORS,
  ELEMENT_COLORS,
  STATUS_COLORS,
  IMPORTANCE_COLORS,
  UI_COLORS,
  LAYOUT_COLORS,
  THREE_COLORS,
  toThreeColor
};

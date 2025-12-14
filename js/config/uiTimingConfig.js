/**
 * @fileoverview UI タイミング設定
 *
 * このファイルは、UIの遅延処理やアニメーションに関連するタイミング定数を定義します。
 * マジックナンバーを排除し、一元管理することで保守性を向上させます。
 */

/**
 * UI関連のタイミング定数（ミリ秒）
 */
export const UI_TIMING = {
  // === 色モード関連 ===
  /** 色モード変更後の再描画遅延 */
  COLOR_MODE_REDRAW_DELAY_MS: 300,
  /** 色モード適用遅延（要素描画完了待ち） */
  COLOR_MODE_APPLY_DELAY_MS: 100,
  /** 重要度色モード適用遅延（長め） */
  IMPORTANCE_COLOR_APPLY_DELAY_MS: 200,

  // === ステータスメッセージ関連 ===
  /** ステータスメッセージ表示前遅延 */
  STATUS_MESSAGE_SHOW_DELAY_MS: 500,
  /** ステータスメッセージ表示時間（標準） */
  STATUS_MESSAGE_DURATION_MS: 5000,
  /** ステータスメッセージ表示時間（短） */
  STATUS_MESSAGE_SHORT_DURATION_MS: 3000,
  /** ステータスメッセージ表示時間（長） */
  STATUS_MESSAGE_LONG_DURATION_MS: 4000,

  // === ラベル・レンダリング関連 ===
  /** ラベル更新遅延 */
  LABEL_UPDATE_DELAY_MS: 100,
  /** ビューモード切替後の更新遅延 */
  VIEW_MODE_UPDATE_DELAY_MS: 10,

  // === モーダル・パネル関連 ===
  /** モーダルフェードアウト遅延 */
  MODAL_FADE_OUT_DELAY_MS: 300,
  /** パネルリサイズ再有効化遅延 */
  PANEL_RESIZE_REENABLE_DELAY_MS: 500,

  // === トースト関連 ===
  /** トースト表示時間 */
  TOAST_DURATION_MS: 3000,

  // === プログレス関連 ===
  /** プログレス非表示遅延 */
  PROGRESS_HIDE_DELAY_MS: 1000,

  // === フィルタ・統計関連 ===
  /** フィルタ適用遅延 */
  FILTER_APPLY_DELAY_MS: 100,
  /** 統計更新遅延 */
  STATISTICS_REFRESH_DELAY_MS: 500,

  // === 開発ツール関連 ===
  /** 開発ツール待機時間 */
  DEVTOOLS_WAIT_MS: 2000
};

/**
 * タイミング定数の説明を取得
 * @param {string} key - 定数名
 * @returns {string} 定数の説明
 */
export function getTimingDescription(key) {
  const descriptions = {
    COLOR_MODE_REDRAW_DELAY_MS: '色モード変更後の再描画遅延',
    COLOR_MODE_APPLY_DELAY_MS: '色モード適用遅延（要素描画完了待ち）',
    IMPORTANCE_COLOR_APPLY_DELAY_MS: '重要度色モード適用遅延（長め）',
    STATUS_MESSAGE_SHOW_DELAY_MS: 'ステータスメッセージ表示前遅延',
    STATUS_MESSAGE_DURATION_MS: 'ステータスメッセージ表示時間（標準）',
    STATUS_MESSAGE_SHORT_DURATION_MS: 'ステータスメッセージ表示時間（短）',
    STATUS_MESSAGE_LONG_DURATION_MS: 'ステータスメッセージ表示時間（長）',
    LABEL_UPDATE_DELAY_MS: 'ラベル更新遅延',
    VIEW_MODE_UPDATE_DELAY_MS: 'ビューモード切替後の更新遅延',
    MODAL_FADE_OUT_DELAY_MS: 'モーダルフェードアウト遅延',
    PANEL_RESIZE_REENABLE_DELAY_MS: 'パネルリサイズ再有効化遅延',
    TOAST_DURATION_MS: 'トースト表示時間',
    PROGRESS_HIDE_DELAY_MS: 'プログレス非表示遅延',
    FILTER_APPLY_DELAY_MS: 'フィルタ適用遅延',
    STATISTICS_REFRESH_DELAY_MS: '統計更新遅延',
    DEVTOOLS_WAIT_MS: '開発ツール待機時間'
  };
  return descriptions[key] || '不明';
}

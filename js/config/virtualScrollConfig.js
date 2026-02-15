/**
 * @fileoverview 仮想スクロール設定（単一の情報源 - SSOT）
 *
 * ツリービューなどで使用する仮想スクロールの設定を一元管理します。
 */

/**
 * 仮想スクロール設定
 */
export const VIRTUAL_SCROLL_CONFIG = {
  /** 仮想スクロールを有効にする要素数の閾値 */
  THRESHOLD: 1000,

  /** アイテムの高さ（px）- コンテキスト別 */
  ITEM_HEIGHT: {
    /** 要素ツリービューのアイテム高さ */
    element: 32,
    /** 断面ツリービューのアイテム高さ */
    section: 28,
    /** デフォルトのアイテム高さ */
    default: 30,
  },

  /** バッファサイズ（表示領域外に事前レンダリングする行数） */
  BUFFER_SIZE: 10,

  /** スクロールデバウンス時間（ms） */
  SCROLL_DEBOUNCE_MS: 16,
};

export default VIRTUAL_SCROLL_CONFIG;

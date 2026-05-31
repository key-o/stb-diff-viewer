/**
 * @fileoverview 機能フラグ設定
 *
 * 公開用ビルドの互換マーカーです。
 * `npm run build:public` は common-ss7/ と export/ss7/ ディレクトリを
 * 配布物から除外し、この値を false に固定します。
 *
 * @module config/featureFlags
 */

/**
 * 旧 SS7 CSV インポート・エクスポート機能の有効/無効。
 * アプリ本体の UI とローダー導線からは削除済みです。
 */
export const SS7_ENABLED = false;

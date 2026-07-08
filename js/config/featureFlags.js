/**
 * @fileoverview 機能フラグ設定
 *
 * 公開時に非公開とする機能をここで制御します。
 * 公開用ビルドでは `npm run build:public` を実行してください。
 * スクリプトがこのファイルの SS7_ENABLED を false に書き換えた上で、
 * common-ss7/ と export/ss7/ ディレクトリを配布物から除外します。
 *
 * @module config/featureFlags
 */

/**
 * SS7 CSV インポート・エクスポート機能（β機能）の有効/無効
 *
 * - true  : SS7 CSV の読み込み・書き出しを有効にする（開発版デフォルト）
 * - false : 機能を無効化し、UIおよびローダーからSS7サポートを除外する（公開ビルド）
 */
export const SS7_ENABLED = false;

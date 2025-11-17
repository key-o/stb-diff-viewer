/**
 * @fileoverview エラーメッセージ定義
 *
 * アプリケーション全体で使用するエラーメッセージを一元管理します。
 * エラーコードとメッセージのマッピングを定義し、国際化対応の準備もします。
 */

/**
 * エラーメッセージマップ
 * エラーコードをキーとし、ユーザー向けメッセージを値とします
 */
export const ERROR_MESSAGES = {
  // ファイル関連エラー (ERR_FILE_*)
  ERR_FILE_NOT_SELECTED: 'ファイルが選択されていません',
  ERR_FILE_READ: 'ファイルの読み込みに失敗しました',
  ERR_FILE_TOO_LARGE: 'ファイルサイズが大きすぎます（最大: 64MB）',
  ERR_FILE_INVALID_FORMAT: 'ファイル形式が正しくありません',
  ERR_FILE_EMPTY: 'ファイルが空です',
  ERR_FILE_CORRUPTED: 'ファイルが破損しています',

  // パース関連エラー (ERR_PARSE_*)
  ERR_PARSE_XML: 'XMLファイルの解析に失敗しました',
  ERR_PARSE_JSON: 'JSONファイルの解析に失敗しました',
  ERR_PARSE_INVALID_STRUCTURE: 'ファイルの構造が正しくありません',
  ERR_PARSE_MISSING_ELEMENT: '必要な要素が見つかりません',
  ERR_PARSE_INVALID_VALUE: '不正な値が含まれています',

  // バリデーション関連エラー (ERR_VALIDATION_*)
  ERR_VALIDATION_REQUIRED: '必須項目が入力されていません',
  ERR_VALIDATION_INVALID_TYPE: '型が正しくありません',
  ERR_VALIDATION_OUT_OF_RANGE: '値が範囲外です',
  ERR_VALIDATION_INVALID_FORMAT: '形式が正しくありません',
  ERR_VALIDATION_COLOR_FORMAT: '色コードの形式が正しくありません（例: #RRGGBB）',

  // ネットワーク関連エラー (ERR_NETWORK_*)
  ERR_NETWORK_OFFLINE: 'インターネット接続がありません',
  ERR_NETWORK_TIMEOUT: '処理がタイムアウトしました',
  ERR_NETWORK_REQUEST_FAILED: 'リクエストに失敗しました',
  ERR_NETWORK_RESPONSE_ERROR: 'サーバーからエラーが返されました',
  ERR_NETWORK_CORS: 'CORS エラーが発生しました',

  // API関連エラー (ERR_API_*)
  ERR_API_IFC_CONVERSION: 'IFC変換に失敗しました',
  ERR_API_SERVER_ERROR: 'サーバーエラーが発生しました',
  ERR_API_UNAUTHORIZED: '認証が必要です',
  ERR_API_RATE_LIMIT: 'リクエスト数の制限を超えました',

  // レンダリング関連エラー (ERR_RENDER_*)
  ERR_RENDER_INIT: '3Dビューアの初期化に失敗しました',
  ERR_RENDER_GEOMETRY: 'ジオメトリの生成に失敗しました',
  ERR_RENDER_MATERIAL: 'マテリアルの生成に失敗しました',
  ERR_RENDER_SCENE: 'シーンの構築に失敗しました',
  ERR_RENDER_WEBGL: 'WebGLがサポートされていません',

  // 状態管理関連エラー (ERR_STATE_*)
  ERR_STATE_INVALID: '不正な状態です',
  ERR_STATE_NOT_INITIALIZED: '初期化されていません',
  ERR_STATE_ALREADY_INITIALIZED: '既に初期化されています',
  ERR_STATE_TRANSITION: '状態遷移に失敗しました',

  // 比較関連エラー (ERR_COMPARE_*)
  ERR_COMPARE_NO_ELEMENTS: '比較する要素がありません',
  ERR_COMPARE_MISMATCH: 'モデルの構造が一致しません',
  ERR_COMPARE_INVALID_KEY: '比較キーが不正です',

  // UI関連エラー (ERR_UI_*)
  ERR_UI_ELEMENT_NOT_FOUND: 'UI要素が見つかりません',
  ERR_UI_INVALID_INPUT: '入力が不正です',
  ERR_UI_OPERATION_CANCELLED: '操作がキャンセルされました',

  // 設定関連エラー (ERR_CONFIG_*)
  ERR_CONFIG_LOAD: '設定の読み込みに失敗しました',
  ERR_CONFIG_SAVE: '設定の保存に失敗しました',
  ERR_CONFIG_INVALID_VALUE: '設定値が不正です',

  // その他のエラー (ERR_*)
  ERR_UNKNOWN: '予期しないエラーが発生しました',
  ERR_NOT_IMPLEMENTED: 'この機能は実装されていません',
  ERR_PERMISSION_DENIED: '権限がありません',
  ERR_OPERATION_FAILED: '操作に失敗しました'
};

/**
 * 詳細なエラーメッセージを生成
 * @param {string} code - エラーコード
 * @param {Object} params - メッセージパラメータ
 * @returns {string}
 */
export function formatErrorMessage(code, params = {}) {
  let message = ERROR_MESSAGES[code] || ERROR_MESSAGES.ERR_UNKNOWN;

  // パラメータを置換（例: {fileName} → actual file name）
  Object.entries(params).forEach(([key, value]) => {
    message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  });

  return message;
}

/**
 * エラーコードからユーザーメッセージを取得
 * @param {string} code - エラーコード
 * @returns {string}
 */
export function getUserMessage(code) {
  return ERROR_MESSAGES[code] || ERROR_MESSAGES.ERR_UNKNOWN;
}

/**
 * エラーに対する推奨アクションを取得
 * @param {string} code - エラーコード
 * @returns {string}
 */
export function getRecommendedAction(code) {
  const actions = {
    ERR_FILE_NOT_SELECTED: 'ファイルを選択してください',
    ERR_FILE_TOO_LARGE: 'より小さいファイルを使用してください',
    ERR_FILE_INVALID_FORMAT: 'STBまたはXML形式のファイルを選択してください',
    ERR_PARSE_XML: 'ファイルの内容を確認してください',
    ERR_NETWORK_OFFLINE: 'インターネット接続を確認してください',
    ERR_NETWORK_TIMEOUT: '時間を置いて再度お試しください',
    ERR_RENDER_WEBGL: '別のブラウザを使用してください',
    ERR_NOT_IMPLEMENTED: '将来のバージョンで実装予定です'
  };

  return actions[code] || '再度お試しいただくか、サポートにお問い合わせください';
}

/**
 * エラーコードのカテゴリを判定
 * @param {string} code - エラーコード
 * @returns {string}
 */
export function getErrorCategory(code) {
  if (code.startsWith('ERR_FILE_')) return 'file';
  if (code.startsWith('ERR_PARSE_')) return 'parse';
  if (code.startsWith('ERR_VALIDATION_')) return 'validation';
  if (code.startsWith('ERR_NETWORK_')) return 'network';
  if (code.startsWith('ERR_API_')) return 'api';
  if (code.startsWith('ERR_RENDER_')) return 'render';
  if (code.startsWith('ERR_STATE_')) return 'state';
  if (code.startsWith('ERR_COMPARE_')) return 'compare';
  if (code.startsWith('ERR_UI_')) return 'ui';
  if (code.startsWith('ERR_CONFIG_')) return 'config';
  return 'other';
}

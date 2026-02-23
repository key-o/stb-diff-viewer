/**
 * @fileoverview スキーマエラー状態管理ストア
 *
 * スキーマ検証エラー情報の保存・取得・クリアを行うデータストアです。
 * colorModes と validationManager の間の循環依存を解消するために、
 * 共有状態をこのモジュールに分離しています。
 *
 * @module common-stb/validation/schemaErrorStore
 */

// スキーマエラー情報を保存するマップ
const schemaErrorMap = new Map();

/**
 * モデルソースと要素IDからスキーマエラーキーを生成
 * A/Bモデルで同一elementIdが存在する場合の混線を防止する。
 * @param {string} elementId 要素ID
 * @param {string} [modelSource] モデルソース ('A', 'B', 'matched')
 * @returns {string} スキーマキー
 */
export function buildSchemaKey(elementId, modelSource) {
  if (modelSource && modelSource !== 'matched') {
    return `${modelSource}:${elementId}`;
  }
  return elementId;
}

/**
 * 要素のスキーマエラー情報を設定
 * @param {string} elementId 要素ID
 * @param {string} status エラー状態 ('valid' | 'info' | 'warning' | 'error')
 * @param {string[]} errorMessages エラーメッセージの配列
 * @param {string} [modelSource] モデルソース ('A', 'B', 'matched')
 */
export function setSchemaError(elementId, status, errorMessages = [], modelSource = null) {
  const key = buildSchemaKey(elementId, modelSource);
  schemaErrorMap.set(key, {
    status,
    errorMessages,
    messages: errorMessages,
  });
}

/**
 * 要素のスキーマエラー情報を取得
 * モデルソース付きキーを優先し、見つからない場合はelementId単独でフォールバックする。
 * @param {string} elementId 要素ID
 * @param {string} [modelSource] モデルソース ('A', 'B', 'matched')
 * @returns {object} エラー情報オブジェクト
 */
export function getSchemaError(elementId, modelSource) {
  const DEFAULT_RESULT = { status: 'valid', errorMessages: [], messages: [] };

  // モデルソース付きキーで検索
  if (modelSource && modelSource !== 'matched') {
    const key = buildSchemaKey(elementId, modelSource);
    const result = schemaErrorMap.get(key);
    if (result) return result;
  }

  // フォールバック: elementId単独で検索（後方互換性）
  return schemaErrorMap.get(elementId) || DEFAULT_RESULT;
}

/**
 * 全てのスキーマエラー情報をクリア
 */
export function clearSchemaErrors() {
  schemaErrorMap.clear();
}

/**
 * スキーマエラーの統計情報を取得
 * @returns {object} 統計情報
 */
export function getSchemaErrorStats() {
  const totalElements = schemaErrorMap.size;
  let infoElements = 0;
  let warningElements = 0;
  let errorElements = 0;

  schemaErrorMap.forEach((errorInfo) => {
    switch (errorInfo.status) {
      case 'info':
        infoElements++;
        break;
      case 'warning':
        warningElements++;
        break;
      case 'error':
        errorElements++;
        break;
      default:
        break;
    }
  });

  return {
    totalElements,
    infoElements,
    warningElements,
    errorElements,
    validElements: Math.max(0, totalElements - (infoElements + warningElements + errorElements)),
  };
}

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
 * @param {string} [elementType] 要素種別
 * @returns {string} スキーマキー
 */
export function buildSchemaKey(elementId, modelSource, elementType = '') {
  const normalizedType =
    typeof elementType === 'string' && elementType.trim() !== ''
      ? (elementType.includes(':') ? elementType.split(':').pop() : elementType).toLowerCase()
      : '';
  const scopedElementId = normalizedType ? `${normalizedType}@${elementId}` : elementId;

  if (modelSource && modelSource !== 'matched') {
    return `${modelSource}:${scopedElementId}`;
  }
  return scopedElementId;
}

/**
 * ステータス優先度を取得
 * @param {string} status
 * @returns {number}
 */
function getStatusRank(status) {
  switch (status) {
    case 'error':
      return 3;
    case 'warning':
      return 2;
    case 'info':
      return 1;
    default:
      return 0;
  }
}

/**
 * 同一ID向け集約キーを生成
 * @param {string} elementId
 * @param {string} [modelSource]
 * @returns {string}
 */
function buildAggregateSchemaKey(elementId, modelSource) {
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
 * @param {string} [elementType] 要素種別
 */
export function setSchemaError(
  elementId,
  status,
  errorMessages = [],
  modelSource = null,
  elementType = '',
) {
  const typedKey = buildSchemaKey(elementId, modelSource, elementType);
  const value = {
    status,
    errorMessages,
    messages: errorMessages,
  };
  schemaErrorMap.set(typedKey, value);

  // 後方互換性のため、要素種別を指定しないキーにも最重度ステータスを反映
  if (elementType) {
    const aggregateKey = buildAggregateSchemaKey(elementId, modelSource);
    const currentAggregate = schemaErrorMap.get(aggregateKey);
    if (!currentAggregate || getStatusRank(status) >= getStatusRank(currentAggregate.status)) {
      schemaErrorMap.set(aggregateKey, value);
    }
  }
}

/**
 * 要素のスキーマエラー情報を取得
 * モデルソース付きキーを優先し、見つからない場合はelementId単独でフォールバックする。
 * @param {string} elementId 要素ID
 * @param {string} [modelSource] モデルソース ('A', 'B', 'matched')
 * @param {string} [elementType] 要素種別
 * @returns {object} エラー情報オブジェクト
 */
export function getSchemaError(elementId, modelSource, elementType = '') {
  const DEFAULT_RESULT = { status: 'valid', errorMessages: [], messages: [] };

  // 要素種別付きキーで検索
  if (elementType) {
    const typedKey = buildSchemaKey(elementId, modelSource, elementType);
    const typed = schemaErrorMap.get(typedKey);
    if (typed) return typed;
  }

  // モデルソース付きキーで検索
  if (modelSource && modelSource !== 'matched') {
    const key = buildAggregateSchemaKey(elementId, modelSource);
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

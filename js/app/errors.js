/**
 * @fileoverview カスタムエラークラス体系
 *
 * アプリケーション全体で使用する統一的なエラークラスを定義します。
 * エラーの種類ごとに適切なクラスを使用することで、エラーハンドリングが容易になります。
 */

/**
 * アプリケーション基底エラークラス
 * すべてのカスタムエラーはこのクラスを継承します
 */
export class AppError extends Error {
  /**
   * @param {string} message - エラーメッセージ
   * @param {Object} options - オプション
   * @param {string} options.code - エラーコード
   * @param {string} options.severity - 重要度 ('error', 'warning', 'info')
   * @param {Error} options.cause - 元のエラー
   * @param {Object} options.context - コンテキスト情報
   */
  constructor(message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code || 'ERR_UNKNOWN';
    this.severity = options.severity || 'error';
    this.cause = options.cause || null;
    this.context = options.context || {};
    this.timestamp = new Date();

    // スタックトレースを保持
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * エラー情報をオブジェクトとして取得
   * @returns {Object}
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }

  /**
   * ユーザー向けメッセージを取得
   * @returns {string}
   */
  getUserMessage() {
    return this.message;
  }
}

/**
 * バリデーションエラー
 * ユーザー入力や引数の検証失敗時に使用
 */
export class ValidationError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code || 'ERR_VALIDATION',
      severity: options.severity || 'warning',
    });
    this.field = options.field || null;
    this.value = options.value || null;
    this.constraints = options.constraints || [];
  }
}

/**
 * パースエラー
 * ファイルやデータの解析失敗時に使用
 */
export class ParseError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code || 'ERR_PARSE',
      severity: options.severity || 'error',
    });
    this.fileName = options.fileName || null;
    this.lineNumber = options.lineNumber || null;
    this.columnNumber = options.columnNumber || null;
  }
}

/**
 * ネットワークエラー
 * API呼び出しやファイル読み込みの失敗時に使用
 */
export class NetworkError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code || 'ERR_NETWORK',
      severity: options.severity || 'error',
    });
    this.url = options.url || null;
    this.statusCode = options.statusCode || null;
    this.method = options.method || null;
  }
}

/**
 * ファイルエラー
 * ファイル操作の失敗時に使用
 */
export class FileError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code || 'ERR_FILE',
      severity: options.severity || 'error',
    });
    this.fileName = options.fileName || null;
    this.fileSize = options.fileSize || null;
    this.operation = options.operation || null; // 'read', 'write', 'parse', etc.
  }
}

/**
 * レンダリングエラー
 * 3D描画やビューア操作の失敗時に使用
 */
export class RenderError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code || 'ERR_RENDER',
      severity: options.severity || 'error',
    });
    this.elementType = options.elementType || null;
    this.elementId = options.elementId || null;
  }
}

/**
 * 状態管理エラー
 * 状態の不整合や不正な状態遷移時に使用
 */
export class StateError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code || 'ERR_STATE',
      severity: options.severity || 'error',
    });
    this.currentState = options.currentState || null;
    this.expectedState = options.expectedState || null;
  }
}

/**
 * 設定エラー
 * 設定の読み込みや適用の失敗時に使用
 */
export class ConfigError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code || 'ERR_CONFIG',
      severity: options.severity || 'error',
    });
    this.configKey = options.configKey || null;
    this.configValue = options.configValue || null;
  }
}

/**
 * 未実装エラー
 * 未実装の機能が呼び出された時に使用
 */
export class NotImplementedError extends AppError {
  constructor(message = '機能が実装されていません', options = {}) {
    super(message, {
      ...options,
      code: options.code || 'ERR_NOT_IMPLEMENTED',
      severity: options.severity || 'warning',
    });
    this.featureName = options.featureName || null;
  }
}

/**
 * タイムアウトエラー
 * 処理のタイムアウト時に使用
 */
export class TimeoutError extends AppError {
  constructor(message = '処理がタイムアウトしました', options = {}) {
    super(message, {
      ...options,
      code: options.code || 'ERR_TIMEOUT',
      severity: options.severity || 'error',
    });
    this.timeout = options.timeout || null;
    this.operation = options.operation || null;
  }
}

/**
 * エラーが特定のタイプかチェック
 * @param {Error} error - チェックするエラー
 * @param {Function} errorClass - エラークラス
 * @returns {boolean}
 */
export function isErrorType(error, errorClass) {
  return error instanceof errorClass;
}

/**
 * エラーの重要度を判定
 * @param {Error} error - エラー
 * @returns {string} 'critical', 'error', 'warning', 'info'
 */
export function getErrorSeverity(error) {
  if (error instanceof AppError) {
    return error.severity;
  }
  // 標準Errorは'error'として扱う
  return 'error';
}

/**
 * エラーをラップして詳細情報を追加
 * @param {Error} originalError - 元のエラー
 * @param {string} message - 追加メッセージ
 * @param {Object} context - コンテキスト情報
 * @returns {AppError}
 */
export function wrapError(originalError, message, context = {}) {
  if (originalError instanceof AppError) {
    // 既にAppErrorの場合は情報を追加
    originalError.context = { ...originalError.context, ...context };
    return originalError;
  }

  // 標準ErrorをAppErrorでラップ
  return new AppError(message, {
    cause: originalError,
    context: {
      originalMessage: originalError.message,
      ...context,
    },
  });
}

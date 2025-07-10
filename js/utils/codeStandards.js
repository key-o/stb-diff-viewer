/**
 * @fileoverview コード標準化ユーティリティ
 * 
 * STB Diff Viewerプロジェクト全体で使用する標準化されたユーティリティ関数群。
 * 全モジュールで統一されたパターンでコードを記述するための基盤を提供します。
 */

// ==========================================
// 命名規則定数
// ==========================================

/**
 * 要素タイプの正規化マッピング
 * @constant {Object}
 */
export const ELEMENT_TYPES = {
  NODE: 'Node',
  COLUMN: 'Column', 
  GIRDER: 'Girder',
  BEAM: 'Beam',
  BRACE: 'Brace',
  SLAB: 'Slab',
  WALL: 'Wall',
  AXIS: 'Axis',
  STORY: 'Story'
};

/**
 * STB XML要素名マッピング
 * @constant {Object}
 */
export const STB_ELEMENT_NAMES = {
  [ELEMENT_TYPES.NODE]: 'StbNode',
  [ELEMENT_TYPES.COLUMN]: 'StbColumn',
  [ELEMENT_TYPES.GIRDER]: 'StbGirder',
  [ELEMENT_TYPES.BEAM]: 'StbBeam',
  [ELEMENT_TYPES.BRACE]: 'StbBrace',
  [ELEMENT_TYPES.SLAB]: 'StbSlab',
  [ELEMENT_TYPES.WALL]: 'StbWall',
  [ELEMENT_TYPES.AXIS]: 'StbAxis',
  [ELEMENT_TYPES.STORY]: 'StbStory'
};

/**
 * ログレベル定数
 * @constant {Object}
 */
export const LOG_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error'
};

// ==========================================
// エラーハンドリング統一
// ==========================================

/**
 * 統一されたエラーハンドリングクラス
 */
export class StandardError extends Error {
  constructor(message, code, module, operation, originalError = null) {
    super(message);
    this.name = 'StandardError';
    this.code = code;
    this.module = module;
    this.operation = operation;
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();
  }

  /**
   * エラーをユーザーフレンドリーなメッセージに変換
   * @returns {string} ユーザー向けメッセージ
   */
  getUserMessage() {
    const userMessages = {
      FILE_LOAD_ERROR: 'ファイルの読み込みに失敗しました',
      XML_PARSE_ERROR: 'STBファイルの解析に失敗しました',
      RENDER_ERROR: '3D表示の初期化に失敗しました',
      COMPARISON_ERROR: 'モデルの比較処理中にエラーが発生しました',
      ELEMENT_NOT_FOUND: '指定された要素が見つかりません',
      VALIDATION_ERROR: 'データの検証に失敗しました'
    };
    
    return userMessages[this.code] || '予期しないエラーが発生しました';
  }

  /**
   * 開発者向けの詳細ログメッセージを生成
   * @returns {string} 詳細メッセージ
   */
  getDetailedMessage() {
    return `[${this.module}] ${this.operation} failed: ${this.message}`;
  }
}

/**
 * 統一されたエラーハンドリング関数
 * @param {Error} error - キャッチされたエラー
 * @param {string} module - エラーが発生したモジュール名
 * @param {string} operation - エラーが発生した操作名
 * @param {boolean} showToUser - ユーザーにエラーを表示するか
 * @returns {StandardError} 標準化されたエラーオブジェクト
 */
export function handleError(error, module, operation, showToUser = true) {
  let standardError;
  
  if (error instanceof StandardError) {
    standardError = error;
  } else {
    // エラーコードの推定
    let code = 'UNKNOWN_ERROR';
    if (error.message.includes('parse')) code = 'XML_PARSE_ERROR';
    if (error.message.includes('file') || error.message.includes('load')) code = 'FILE_LOAD_ERROR';
    if (error.message.includes('render')) code = 'RENDER_ERROR';
    if (error.message.includes('not found')) code = 'ELEMENT_NOT_FOUND';
    
    standardError = new StandardError(
      error.message,
      code,
      module,
      operation,
      error
    );
  }
  
  // ログ出力
  standardLogger.error(standardError.getDetailedMessage(), {
    code: standardError.code,
    module: standardError.module,
    operation: standardError.operation,
    timestamp: standardError.timestamp,
    stack: standardError.stack
  });
  
  // ユーザーに表示
  if (showToUser) {
    showErrorToUser(standardError.getUserMessage());
  }
  
  return standardError;
}

/**
 * ユーザーにエラーを表示
 * @param {string} message - 表示するメッセージ
 */
export function showErrorToUser(message) {
  // 将来的にはより洗練されたエラー表示UIに変更可能
  alert(message);
}

// ==========================================
// ログ出力統一
// ==========================================

/**
 * 統一されたロガークラス
 */
export class StandardLogger {
  constructor(moduleName) {
    this.moduleName = moduleName;
    this.isDebugEnabled = this.checkDebugMode();
  }

  /**
   * デバッグモードかどうかを確認
   * @returns {boolean} デバッグモードの場合true
   */
  checkDebugMode() {
    return localStorage.getItem('stb-debug-mode') === 'true' ||
           window.location.search.includes('debug=true');
  }

  /**
   * ログメッセージをフォーマット
   * @param {string} level - ログレベル
   * @param {string} message - メッセージ
   * @param {*} data - 追加データ
   * @returns {string} フォーマットされたメッセージ
   */
  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${this.moduleName}]`;
    return data ? `${prefix} ${message}` : `${prefix} ${message}`;
  }

  /**
   * デバッグログ
   * @param {string} message - メッセージ
   * @param {*} data - 追加データ
   */
  debug(message, data = null) {
    if (this.isDebugEnabled) {
      console.debug(this.formatMessage(LOG_LEVELS.DEBUG, message), data || '');
    }
  }

  /**
   * 情報ログ
   * @param {string} message - メッセージ
   * @param {*} data - 追加データ
   */
  info(message, data = null) {
    console.info(this.formatMessage(LOG_LEVELS.INFO, message), data || '');
  }

  /**
   * 警告ログ
   * @param {string} message - メッセージ
   * @param {*} data - 追加データ
   */
  warn(message, data = null) {
    console.warn(this.formatMessage(LOG_LEVELS.WARN, message), data || '');
  }

  /**
   * エラーログ
   * @param {string} message - メッセージ
   * @param {*} data - 追加データ
   */
  error(message, data = null) {
    console.error(this.formatMessage(LOG_LEVELS.ERROR, message), data || '');
  }
}

// グローバルロガーインスタンス
export const standardLogger = new StandardLogger('GLOBAL');

/**
 * モジュール固有のロガーを作成
 * @param {string} moduleName - モジュール名
 * @returns {StandardLogger} ロガーインスタンス
 */
export function createLogger(moduleName) {
  return new StandardLogger(moduleName);
}

// ==========================================
// DOM操作統一
// ==========================================

/**
 * 統一されたDOM要素取得
 * @param {string} selector - セレクタ
 * @param {Document|Element} parent - 親要素（省略時はdocument）
 * @returns {Element|null} 要素またはnull
 */
export function getElement(selector, parent = document) {
  try {
    return parent.querySelector(selector);
  } catch (error) {
    standardLogger.error(`Invalid selector: ${selector}`, error);
    return null;
  }
}

/**
 * 統一されたDOM要素作成
 * @param {string} tagName - タグ名
 * @param {Object} attributes - 属性オブジェクト
 * @param {string} textContent - テキスト内容
 * @returns {Element} 作成された要素
 */
export function createElement(tagName, attributes = {}, textContent = '') {
  const element = document.createElement(tagName);
  
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'style' && typeof value === 'object') {
      Object.assign(element.style, value);
    } else {
      element.setAttribute(key, value);
    }
  });
  
  if (textContent) {
    element.textContent = textContent;
  }
  
  return element;
}

/**
 * 統一されたイベントリスナー追加
 * @param {Element} element - 要素
 * @param {string} eventType - イベントタイプ
 * @param {Function} handler - ハンドラ関数
 * @param {Object} options - オプション
 */
export function addEventListenerSafe(element, eventType, handler, options = {}) {
  if (!element || typeof handler !== 'function') {
    standardLogger.warn('Invalid element or handler for event listener', {
      element: !!element,
      eventType,
      handler: typeof handler
    });
    return;
  }
  
  try {
    element.addEventListener(eventType, handler, options);
  } catch (error) {
    standardLogger.error(`Failed to add event listener: ${eventType}`, error);
  }
}

// ==========================================
// 型チェック・バリデーション統一
// ==========================================

/**
 * 要素タイプの妥当性チェック
 * @param {string} elementType - 要素タイプ
 * @returns {boolean} 妥当な場合true
 */
export function isValidElementType(elementType) {
  return Object.values(ELEMENT_TYPES).includes(elementType);
}

/**
 * STB要素名の妥当性チェック
 * @param {string} tagName - STB要素名
 * @returns {boolean} 妥当な場合true
 */
export function isValidStbElementName(tagName) {
  return Object.values(STB_ELEMENT_NAMES).includes(tagName);
}

/**
 * IDの妥当性チェック
 * @param {string} id - ID文字列
 * @returns {boolean} 妥当な場合true
 */
export function isValidId(id) {
  return typeof id === 'string' && id.length > 0 && id.trim() === id;
}

/**
 * 数値の妥当性チェック（建築単位：mm）
 * @param {*} value - チェックする値
 * @returns {boolean} 妥当な数値の場合true
 */
export function isValidCoordinate(value) {
  const num = parseFloat(value);
  return !isNaN(num) && isFinite(num);
}

// ==========================================
// パフォーマンス計測統一
// ==========================================

/**
 * パフォーマンス計測クラス
 */
export class PerformanceMeasurer {
  constructor(operationName) {
    this.operationName = operationName;
    this.startTime = performance.now();
    this.marks = [];
  }

  /**
   * 中間マークを記録
   * @param {string} markName - マーク名
   */
  mark(markName) {
    const time = performance.now();
    this.marks.push({
      name: markName,
      time,
      elapsed: time - this.startTime
    });
  }

  /**
   * 計測終了とレポート出力
   * @returns {Object} 計測結果
   */
  finish() {
    const endTime = performance.now();
    const totalTime = endTime - this.startTime;
    
    const result = {
      operation: this.operationName,
      totalTime,
      marks: this.marks,
      memoryUsage: this.getMemoryUsage()
    };
    
    standardLogger.info(`Performance: ${this.operationName} completed`, {
      totalTime: `${totalTime.toFixed(2)}ms`,
      marks: this.marks.length
    });
    
    return result;
  }

  /**
   * メモリ使用量取得
   * @returns {Object} メモリ使用量情報
   */
  getMemoryUsage() {
    if (performance.memory) {
      return {
        used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
        total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
        limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
      };
    }
    return null;
  }
}

/**
 * 簡単なパフォーマンス計測
 * @param {string} operationName - 操作名
 * @param {Function} operation - 実行する操作
 * @returns {Promise<*>} 操作の結果
 */
export async function measurePerformance(operationName, operation) {
  const measurer = new PerformanceMeasurer(operationName);
  
  try {
    const result = await operation();
    measurer.finish();
    return result;
  } catch (error) {
    measurer.finish();
    throw error;
  }
}

// ==========================================
// 非同期処理統一
// ==========================================

/**
 * タイムアウト付きPromise
 * @param {Promise} promise - 元のPromise
 * @param {number} timeoutMs - タイムアウト（ミリ秒）
 * @param {string} timeoutMessage - タイムアウトメッセージ
 * @returns {Promise} タイムアウト付きPromise
 */
export function withTimeout(promise, timeoutMs, timeoutMessage = 'Operation timed out') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
    )
  ]);
}

/**
 * リトライ機能付き実行
 * @param {Function} operation - 実行する操作
 * @param {number} maxRetries - 最大リトライ回数
 * @param {number} delayMs - リトライ間隔（ミリ秒）
 * @returns {Promise<*>} 操作の結果
 */
export async function retryOperation(operation, maxRetries = 3, delayMs = 1000) {
  let lastError;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (i < maxRetries) {
        standardLogger.warn(`Operation failed, retrying in ${delayMs}ms (attempt ${i + 1}/${maxRetries})`, error.message);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  throw lastError;
}

/**
 * 遅延実行
 * @param {number} ms - 遅延時間（ミリ秒）
 * @returns {Promise<void>} 遅延Promise
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// データ変換統一
// ==========================================

/**
 * 要素タイプからSTB要素名に変換
 * @param {string} elementType - 要素タイプ
 * @returns {string} STB要素名
 */
export function elementTypeToStbName(elementType) {
  return STB_ELEMENT_NAMES[elementType] || elementType;
}

/**
 * STB要素名から要素タイプに変換
 * @param {string} stbElementName - STB要素名
 * @returns {string} 要素タイプ
 */
export function stbNameToElementType(stbElementName) {
  const entry = Object.entries(STB_ELEMENT_NAMES).find(([_, name]) => name === stbElementName);
  return entry ? entry[0] : stbElementName;
}

/**
 * 座標値の正規化（mm単位に統一）
 * @param {*} value - 座標値
 * @returns {number|null} 正規化された座標値
 */
export function normalizeCoordinate(value) {
  const num = parseFloat(value);
  return isValidCoordinate(num) ? num : null;
}

// ==========================================
// 設定・初期化統一
// ==========================================

/**
 * モジュール初期化の統一インターフェース
 */
export class ModuleInitializer {
  constructor(moduleName) {
    this.moduleName = moduleName;
    this.logger = createLogger(moduleName);
    this.initialized = false;
    this.dependencies = [];
  }

  /**
   * 依存関係を追加
   * @param {string} dependency - 依存するモジュール名
   */
  addDependency(dependency) {
    this.dependencies.push(dependency);
  }

  /**
   * 初期化実行
   * @param {Function} initFunction - 初期化関数
   * @returns {Promise<boolean>} 初期化成功時true
   */
  async initialize(initFunction) {
    if (this.initialized) {
      this.logger.warn('Module already initialized');
      return true;
    }

    try {
      this.logger.info('Initializing module...');
      
      // 依存関係チェック（簡易版）
      for (const dep of this.dependencies) {
        this.logger.debug(`Checking dependency: ${dep}`);
      }

      await initFunction();
      
      this.initialized = true;
      this.logger.info('Module initialization completed');
      return true;
      
    } catch (error) {
      this.logger.error('Module initialization failed', error);
      return false;
    }
  }
}

// ==========================================
// エクスポート
// ==========================================

// 利用可能な標準関数をまとめてエクスポート
export const Standards = {
  // エラーハンドリング
  StandardError,
  handleError,
  showErrorToUser,
  
  // ログ出力
  StandardLogger,
  createLogger,
  
  // DOM操作
  getElement,
  createElement,
  addEventListenerSafe,
  
  // バリデーション
  isValidElementType,
  isValidStbElementName,
  isValidId,
  isValidCoordinate,
  
  // パフォーマンス
  PerformanceMeasurer,
  measurePerformance,
  
  // 非同期処理
  withTimeout,
  retryOperation,
  delay,
  
  // データ変換
  elementTypeToStbName,
  stbNameToElementType,
  normalizeCoordinate,
  
  // モジュール初期化
  ModuleInitializer
};
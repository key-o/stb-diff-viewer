/**
 * @fileoverview プログレスインジケータモジュール
 *
 * モデル読み込み中の詳細な進捗情報を表示します。
 */

/**
 * プログレスインジケータの状態
 * @typedef {Object} IndicatorState
 * @property {boolean} visible - 表示中かどうか
 * @property {number} progress - 進捗率（0-100）
 * @property {string} message - 表示メッセージ
 * @property {string} detail - 詳細情報
 * @property {number} startTime - 開始時刻
 */

/**
 * プログレスインジケータマネージャー
 *
 * 読み込み進捗を視覚的に表示します。
 */
class LoadingIndicator {
  /**
   * @param {string} containerId - コンテナ要素のID
   */
  constructor(containerId = 'loading-indicator') {
    this.containerId = containerId;
    this.container = null;
    this.progressBar = null;
    this.messageElement = null;
    this.detailElement = null;
    this.percentElement = null;

    /** @type {IndicatorState} */
    this.state = {
      visible: false,
      progress: 0,
      message: '',
      detail: '',
      startTime: 0,
    };
  }

  /**
   * インジケータ要素を作成
   *
   * @private
   */
  createElements() {
    // 既存の要素があれば再利用
    this.container = document.getElementById(this.containerId);

    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = this.containerId;
      this.container.className = 'loading-indicator';
      document.body.appendChild(this.container);
    }

    this.container.innerHTML = `
      <div class="loading-indicator-content">
        <div class="loading-indicator-header">
          <span class="loading-indicator-message">読み込み中...</span>
          <span class="loading-indicator-percent">0%</span>
        </div>
        <div class="loading-indicator-progress-container">
          <div class="loading-indicator-progress-bar"></div>
        </div>
        <div class="loading-indicator-detail"></div>
        <div class="loading-indicator-time"></div>
      </div>
    `;

    this.messageElement = this.container.querySelector('.loading-indicator-message');
    this.percentElement = this.container.querySelector('.loading-indicator-percent');
    this.progressBar = this.container.querySelector('.loading-indicator-progress-bar');
    this.detailElement = this.container.querySelector('.loading-indicator-detail');
    this.timeElement = this.container.querySelector('.loading-indicator-time');

    this.injectStyles();
  }

  /**
   * スタイルを注入
   *
   * @private
   */
  injectStyles() {
    if (document.getElementById('loading-indicator-styles')) {
      return;
    }

    const styles = document.createElement('style');
    styles.id = 'loading-indicator-styles';
    styles.textContent = `
      .loading-indicator {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(30, 30, 30, 0.95);
        border: 1px solid #444;
        border-radius: 8px;
        padding: 24px 32px;
        min-width: 320px;
        max-width: 480px;
        z-index: 10000;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        display: none;
      }

      .loading-indicator.visible {
        display: block;
      }

      .loading-indicator-content {
        color: #fff;
      }

      .loading-indicator-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }

      .loading-indicator-message {
        font-size: var(--font-size-base);
        font-weight: var(--font-weight-medium);
      }

      .loading-indicator-percent {
        font-size: var(--font-size-xl);
        font-weight: var(--font-weight-bold);
        color: #4CAF50;
        font-family: var(--font-family-monospace);
      }

      .loading-indicator-progress-container {
        height: 8px;
        background: #333;
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: 12px;
      }

      .loading-indicator-progress-bar {
        height: 100%;
        background: linear-gradient(90deg, #4CAF50, #8BC34A);
        border-radius: 4px;
        width: 0%;
        transition: width 0.3s ease-out;
      }

      .loading-indicator-detail {
        font-size: var(--font-size-sm);
        color: #aaa;
        margin-bottom: 8px;
        min-height: 18px;
      }

      .loading-indicator-time {
        font-size: var(--font-size-sm);
        color: #666;
        text-align: right;
      }

      /* アニメーション用 */
      .loading-indicator-progress-bar.indeterminate {
        width: 100% !important;
        background: linear-gradient(
          90deg,
          transparent 0%,
          #4CAF50 50%,
          transparent 100%
        );
        background-size: 200% 100%;
        animation: indeterminate 1.5s infinite linear;
      }

      @keyframes indeterminate {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
    `;
    document.head.appendChild(styles);
  }

  /**
   * インジケータを表示
   *
   * @param {string} [message='読み込み中...'] - 表示メッセージ
   */
  show(message = '読み込み中...') {
    if (!this.container) {
      this.createElements();
    }

    this.state = {
      visible: true,
      progress: 0,
      message,
      detail: '',
      startTime: Date.now(),
    };

    this.messageElement.textContent = message;
    this.percentElement.textContent = '0%';
    this.progressBar.style.width = '0%';
    this.detailElement.textContent = '';
    this.timeElement.textContent = '';
    this.container.classList.add('visible');
  }

  /**
   * 進捗を更新
   *
   * @param {number} progress - 進捗率（0-100）
   * @param {string} [message] - 更新メッセージ
   * @param {string} [detail] - 詳細情報
   */
  update(progress, message = null, detail = null) {
    if (!this.container) return;

    this.state.progress = Math.max(0, Math.min(100, progress));

    if (message !== null) {
      this.state.message = message;
      this.messageElement.textContent = message;
    }

    if (detail !== null) {
      this.state.detail = detail;
      this.detailElement.textContent = detail;
    }

    this.percentElement.textContent = `${Math.round(this.state.progress)}%`;
    this.progressBar.style.width = `${this.state.progress}%`;

    // 経過時間を更新
    const elapsed = Date.now() - this.state.startTime;
    this.timeElement.textContent = `経過時間: ${this.formatTime(elapsed)}`;
  }

  /**
   * ProgressiveLoaderの状態から更新
   *
   * @param {Object} loaderState - ProgressiveLoaderの状態
   */
  updateFromLoaderState(loaderState) {
    const message = `読み込み中: ${loaderState.currentElementType || '準備中'}`;
    const detail =
      loaderState.totalElements > 0
        ? `${loaderState.processedElements} / ${loaderState.totalElements} 要素`
        : '';

    this.update(loaderState.progressPercent, message, detail);
  }

  /**
   * 不定進捗モードに切り替え
   *
   * @param {string} [message='処理中...'] - 表示メッセージ
   */
  setIndeterminate(message = '処理中...') {
    if (!this.container) return;

    this.state.message = message;
    this.messageElement.textContent = message;
    this.percentElement.textContent = '';
    this.progressBar.classList.add('indeterminate');
  }

  /**
   * 確定進捗モードに切り替え
   */
  setDeterminate() {
    if (!this.progressBar) return;
    this.progressBar.classList.remove('indeterminate');
  }

  /**
   * インジケータを非表示
   *
   * @param {number} [delay=0] - 非表示までの遅延（ミリ秒）
   */
  hide(delay = 0) {
    if (!this.container) return;

    const doHide = () => {
      this.state.visible = false;
      this.container.classList.remove('visible');
    };

    if (delay > 0) {
      setTimeout(doHide, delay);
    } else {
      doHide();
    }
  }

  /**
   * 完了状態を表示して非表示
   *
   * @param {string} [message='完了'] - 完了メッセージ
   * @param {number} [hideDelay=1000] - 非表示までの遅延
   */
  complete(message = '完了', hideDelay = 1000) {
    this.update(100, message, '');
    this.hide(hideDelay);
  }

  /**
   * エラー状態を表示
   *
   * @param {string} [message='エラーが発生しました'] - エラーメッセージ
   */
  error(message = 'エラーが発生しました') {
    if (!this.container) return;

    this.messageElement.textContent = message;
    this.percentElement.textContent = '!';
    this.percentElement.style.color = '#f44336';
    this.progressBar.style.background = '#f44336';
  }

  /**
   * 時間をフォーマット
   *
   * @private
   * @param {number} ms - ミリ秒
   * @returns {string} フォーマットされた時間文字列
   */
  formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) {
      return `${seconds}秒`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}分${remainingSeconds}秒`;
  }

  /**
   * リソースを解放
   */
  dispose() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    this.progressBar = null;
    this.messageElement = null;
    this.detailElement = null;
    this.percentElement = null;
  }
}

// シングルトンインスタンス
let globalIndicator = null;

/**
 * グローバルローディングインジケータを取得
 *
 * @returns {LoadingIndicator}
 */
export function getLoadingIndicator() {
  if (!globalIndicator) {
    globalIndicator = new LoadingIndicator();
  }
  return globalIndicator;
}

/**
 * ローディングを表示
 *
 * @param {string} [message] - メッセージ
 */
export function showLoading(message) {
  getLoadingIndicator().show(message);
}


/**
 * ローディングを非表示
 *
 * @param {number} [delay] - 遅延
 */
export function hideLoading(delay) {
  getLoadingIndicator().hide(delay);
}

/**
 * ローディング完了
 *
 * @param {string} [message] - 完了メッセージ
 */
export function completeLoading(message) {
  getLoadingIndicator().complete(message);
}

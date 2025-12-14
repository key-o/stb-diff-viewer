/**
 * トースト通知システム
 *
 * 成功/エラー/警告/情報の通知を表示
 * - 自動消去
 * - スタック表示
 * - アニメーション付き表示/非表示
 */

/** @type {HTMLElement|null} */
let toastContainer = null;

/** @type {Map<number, {element: HTMLElement, timeoutId: number}>} */
const activeToasts = new Map();

/** @type {number} */
let toastIdCounter = 0;

/** デフォルト設定 */
const DEFAULT_CONFIG = {
  /** 表示位置 */
  position: 'bottom-right',
  /** 自動消去までの時間（ms）、0で無効 */
  duration: 4000,
  /** 最大表示数 */
  maxToasts: 5,
  /** アニメーション時間（ms） */
  animationDuration: 300
};

/** @type {typeof DEFAULT_CONFIG} */
let config = { ...DEFAULT_CONFIG };

/**
 * トースト通知システムを初期化
 * @param {Partial<typeof DEFAULT_CONFIG>} [options] - オプション
 */
export function initializeToast(options = {}) {
  config = { ...DEFAULT_CONFIG, ...options };

  // 既存のコンテナがあれば削除
  if (toastContainer) {
    toastContainer.remove();
  }

  // コンテナを作成
  toastContainer = document.createElement('div');
  toastContainer.id = 'toast-container';
  toastContainer.className = `toast-container toast-${config.position}`;
  toastContainer.style.cssText = getContainerStyles();

  document.body.appendChild(toastContainer);
}

/**
 * コンテナのスタイルを取得
 * @private
 */
function getContainerStyles() {
  const baseStyles = `
    position: fixed;
    z-index: var(--z-toast, 3000);
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 400px;
    pointer-events: none;
  `;

  const positions = {
    'top-left': 'top: 20px; left: 20px;',
    'top-center': 'top: 20px; left: 50%; transform: translateX(-50%);',
    'top-right': 'top: 20px; right: 20px;',
    'bottom-left': 'bottom: 20px; left: 20px;',
    'bottom-center': 'bottom: 20px; left: 50%; transform: translateX(-50%);',
    'bottom-right': 'bottom: 20px; right: 20px;'
  };

  return baseStyles + (positions[config.position] || positions['bottom-right']);
}

/**
 * トースト通知を表示
 * @param {Object} options - オプション
 * @param {string} options.message - メッセージ
 * @param {'success' | 'error' | 'warning' | 'info'} [options.type='info'] - タイプ
 * @param {number} [options.duration] - 表示時間（ms）
 * @param {boolean} [options.closable=true] - 閉じるボタンを表示
 * @returns {number} トーストID
 */
export function showToast(options) {
  if (!toastContainer) {
    initializeToast();
  }

  const {
    message,
    type = 'info',
    duration = config.duration,
    closable = true
  } = options;

  // 最大数を超えている場合、古いトーストを削除
  while (activeToasts.size >= config.maxToasts) {
    const oldestId = activeToasts.keys().next().value;
    hideToast(oldestId);
  }

  const toastId = ++toastIdCounter;
  const toast = createToastElement(toastId, message, type, closable);

  // コンテナに追加
  if (config.position.startsWith('bottom')) {
    toastContainer.insertBefore(toast, toastContainer.firstChild);
  } else {
    toastContainer.appendChild(toast);
  }

  // アニメーションで表示
  requestAnimationFrame(() => {
    toast.classList.add('toast-show');
  });

  // 自動消去タイマー
  let timeoutId = 0;
  if (duration > 0) {
    timeoutId = window.setTimeout(() => {
      hideToast(toastId);
    }, duration);
  }

  activeToasts.set(toastId, { element: toast, timeoutId });

  return toastId;
}

/**
 * トースト要素を作成
 * @private
 */
function createToastElement(id, message, type, closable) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.dataset.toastId = String(id);
  toast.style.cssText = getToastStyles(type);

  // アイコン
  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.innerHTML = getTypeIcon(type);
  toast.appendChild(icon);

  // メッセージ
  const messageEl = document.createElement('span');
  messageEl.className = 'toast-message';
  messageEl.textContent = message;
  toast.appendChild(messageEl);

  // 閉じるボタン
  if (closable) {
    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: inherit;
      font-size: 18px;
      cursor: pointer;
      padding: 0 0 0 8px;
      opacity: 0.7;
      transition: opacity 0.2s;
      margin: 0;
    `;
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.opacity = '1';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.opacity = '0.7';
    });
    closeBtn.addEventListener('click', () => {
      hideToast(id);
    });
    toast.appendChild(closeBtn);
  }

  return toast;
}

/**
 * トーストのスタイルを取得
 * @private
 */
function getToastStyles(type) {
  const colors = {
    success: { bg: 'var(--color-success)', text: '#fff' },
    error: { bg: 'var(--color-danger)', text: '#fff' },
    warning: { bg: 'var(--color-warning)', text: '#fff' },
    info: { bg: 'var(--color-info)', text: '#fff' }
  };

  const { bg, text } = colors[type] || colors.info;

  return `
    display: flex;
    align-items: center;
    padding: 12px 16px;
    background-color: ${bg};
    color: ${text};
    border-radius: var(--border-radius-lg, 6px);
    box-shadow: var(--shadow-lg, 0 10px 25px rgba(0, 0, 0, 0.15));
    font-size: 14px;
    pointer-events: auto;
    opacity: 0;
    transform: translateX(100%);
    transition: opacity ${config.animationDuration}ms ease, transform ${config.animationDuration}ms ease;
  `;
}

/**
 * タイプに応じたアイコンを取得
 * @private
 */
function getTypeIcon(type) {
  const icons = {
    success: '&#10004;', // チェックマーク
    error: '&#10006;',   // ×マーク
    warning: '&#9888;',  // 警告マーク
    info: '&#8505;'      // 情報マーク
  };
  return icons[type] || icons.info;
}

/**
 * トーストを非表示
 * @param {number} toastId - トーストID
 */
export function hideToast(toastId) {
  const toastData = activeToasts.get(toastId);
  if (!toastData) return;

  const { element, timeoutId } = toastData;

  // タイマーをクリア
  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  // アニメーションで非表示
  element.classList.remove('toast-show');
  element.style.opacity = '0';
  element.style.transform = 'translateX(100%)';

  // アニメーション後に削除
  setTimeout(() => {
    element.remove();
    activeToasts.delete(toastId);
  }, config.animationDuration);
}

/**
 * すべてのトーストを非表示
 */
export function hideAllToasts() {
  for (const toastId of activeToasts.keys()) {
    hideToast(toastId);
  }
}

/**
 * 成功トーストを表示（ショートカット）
 * @param {string} message - メッセージ
 * @param {Object} [options] - 追加オプション
 */
export function showSuccess(message, options = {}) {
  return showToast({ message, type: 'success', ...options });
}

/**
 * エラートーストを表示（ショートカット）
 * @param {string} message - メッセージ
 * @param {Object} [options] - 追加オプション
 */
export function showError(message, options = {}) {
  return showToast({ message, type: 'error', duration: 6000, ...options });
}

/**
 * 警告トーストを表示（ショートカット）
 * @param {string} message - メッセージ
 * @param {Object} [options] - 追加オプション
 */
export function showWarning(message, options = {}) {
  return showToast({ message, type: 'warning', ...options });
}

/**
 * 情報トーストを表示（ショートカット）
 * @param {string} message - メッセージ
 * @param {Object} [options] - 追加オプション
 */
export function showInfo(message, options = {}) {
  return showToast({ message, type: 'info', ...options });
}

/**
 * クリーンアップ
 */
export function destroyToast() {
  hideAllToasts();
  if (toastContainer) {
    toastContainer.remove();
    toastContainer = null;
  }
}

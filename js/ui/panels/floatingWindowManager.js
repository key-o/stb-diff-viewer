/**
 * FloatingWindowManager - フローティングウィンドウの管理クラス
 *
 * このクラスは、フローティングウィンドウの作成、表示/非表示、ドラッグ機能、リサイズ機能を統一的に管理します。
 *
 * 使用例:
 * ```javascript
 * const manager = new FloatingWindowManager();
 *
 * // ウィンドウの登録
 * manager.registerWindow({
 *   windowId: 'my-window',
 *   toggleButtonId: 'toggle-my-window-btn',
 *   closeButtonId: 'close-my-window-btn',
 *   headerId: 'my-window-header',
 *   draggable: true,
 *   resizable: true,
 *   autoShow: false
 * });
 * ```
 */

import { createLogger } from '../../utils/logger.js';
import {
  getWindowDefinition,
  getWindowTemplate,
  getRegisterConfig,
} from '../../config/windowConfig.js';

const log = createLogger('ui/floatingWindowManager');

export class FloatingWindowManager {
  constructor() {
    this.windows = new Map();
    this._baseZIndex = 100;
    this._topZIndex = 100;

    // ブラウザリサイズ時に表示中のウィンドウをビューポート内に収める
    this._onWindowResize = () => {
      for (const [, info] of this.windows) {
        if (info.isVisible) {
          this._clampToViewport(info.element);
        }
      }
    };
    window.addEventListener('resize', this._onWindowResize);
  }

  /**
   * ウィンドウをHTMLから動的に生成する
   * @param {Object} config - ウィンドウ設定
   * @param {string} config.windowId - ウィンドウID
   * @param {string} config.title - タイトル
   * @param {string} config.icon - アイコン
   * @param {string} config.content - 内部HTML
   * @param {string} [config.headerExtra] - ヘッダー追加要素
   * @returns {HTMLElement} 生成されたウィンドウ要素
   */
  createWindow(config) {
    const { windowId, title, icon, content, headerExtra = '' } = config;

    const windowEl = document.createElement('div');
    windowEl.id = windowId;
    windowEl.className = 'floating-window';

    windowEl.innerHTML = `
      <div class="float-window-header" id="${windowId}-header">
        <span class="float-window-title">${icon} ${title}</span>
        <div class="float-window-controls">
          ${headerExtra}
          <button class="float-window-btn" id="close-${windowId}-btn">✕</button>
        </div>
      </div>
      <div class="float-window-content">
        ${content}
      </div>
    `;

    document.body.appendChild(windowEl);
    return windowEl;
  }

  /**
   * 設定ファイルからウィンドウを生成・登録する
   * @param {string} windowId - ウィンドウID (windowConfig.jsで定義済み)
   * @param {Object} [options] - 追加オプション
   * @param {Function} [options.onShow] - 表示時コールバック
   * @param {Function} [options.onHide] - 非表示時コールバック
   * @returns {HTMLElement|null} 生成されたウィンドウ要素
   */
  createWindowFromConfig(windowId, options = {}) {
    const def = getWindowDefinition(windowId);
    if (!def) {
      log.warn(`FloatingWindowManager: ウィンドウ定義が見つかりません: ${windowId}`);
      return null;
    }

    // 動的生成ウィンドウの場合はテンプレートからHTML生成
    if (def.isDynamic && def.template) {
      const template = getWindowTemplate(def.template);
      if (template) {
        this.createWindow({
          windowId,
          title: def.title,
          icon: def.icon,
          content: template.content || '',
          headerExtra: template.headerExtra || '',
        });
      }
    }

    // 登録設定を取得
    const registerConfig = getRegisterConfig(windowId);
    if (registerConfig) {
      // オプションのコールバックをマージ
      if (options.onShow) registerConfig.onShow = options.onShow;
      if (options.onHide) registerConfig.onHide = options.onHide;

      this.registerWindow(registerConfig);
    }

    return document.getElementById(windowId);
  }

  /**
   * ウィンドウを登録する
   * @param {Object} config - ウィンドウの設定
   * @param {string} config.windowId - ウィンドウ要素のID
   * @param {string} config.toggleButtonId - トグルボタンのID
   * @param {string} config.closeButtonId - 閉じるボタンのID
   * @param {string} config.headerId - ヘッダー要素のID（ドラッグハンドル）
   * @param {boolean} [config.draggable=true] - ドラッグ可能にするか
   * @param {boolean} [config.resizable=false] - リサイズ可能にするか
   * @param {boolean} [config.autoShow=false] - 初期表示するか
   * @param {Function} [config.onShow] - 表示時のコールバック
   * @param {Function} [config.onHide] - 非表示時のコールバック
   */
  registerWindow(config) {
    const {
      windowId,
      toggleButtonId,
      closeButtonId,
      headerId,
      draggable = true,
      resizable = false,
      autoShow = false,
      onShow = null,
      onHide = null,
    } = config;

    // 既に登録済みの場合はスキップ（二重登録・イベントリスナー重複を防止）
    if (this.windows.has(windowId)) {
      log.warn(`FloatingWindowManager: ウィンドウ #${windowId} は既に登録されています（スキップ）`);
      return false;
    }

    // 要素を取得
    const windowElement = document.getElementById(windowId);
    const toggleButton = toggleButtonId ? document.getElementById(toggleButtonId) : null;
    const closeButton = closeButtonId ? document.getElementById(closeButtonId) : null;
    const header = headerId ? document.getElementById(headerId) : null;

    if (!windowElement) {
      log.warn(`FloatingWindowManager: ウィンドウ要素 #${windowId} が見つかりません`);
      return false;
    }

    // ウィンドウ情報を保存
    const windowInfo = {
      element: windowElement,
      toggleButton,
      closeButton,
      header,
      draggable,
      resizable,
      onShow,
      onHide,
      isVisible: windowElement.classList.contains('visible'),
      dragCleanup: null, // ドラッグイベントのクリーンアップ関数
      resizeCleanup: null, // リサイズイベントのクリーンアップ関数
      toggleHandler: null, // トグルボタンのハンドラー
      closeHandler: null, // 閉じるボタンのハンドラー
      focusHandler: null, // フォーカス（前面表示）ハンドラー
    };

    // トグルボタンのイベントリスナー
    if (toggleButton) {
      windowInfo.toggleHandler = () => {
        this.toggleWindow(windowId);
      };
      toggleButton.addEventListener('click', windowInfo.toggleHandler);
    }

    // 閉じるボタンのイベントリスナー
    if (closeButton) {
      windowInfo.closeHandler = () => {
        this.hideWindow(windowId);
      };
      closeButton.addEventListener('click', windowInfo.closeHandler);
    }

    // クリック時に前面表示
    windowInfo.focusHandler = () => this.bringToFront(windowId);
    windowElement.addEventListener('mousedown', windowInfo.focusHandler);

    // ドラッグ機能を有効化
    if (draggable && header) {
      windowInfo.dragCleanup = this.makeDraggable(windowElement, header);
    }

    // リサイズ機能を有効化
    if (resizable) {
      windowInfo.resizeCleanup = this.makeResizable(windowElement);
    }

    this.windows.set(windowId, windowInfo);

    // 初期表示
    if (autoShow) {
      this.showWindow(windowId);
    }

    log.info(`FloatingWindowManager: ウィンドウ #${windowId} を登録しました`);
    return true;
  }

  /**
   * ウィンドウの表示時コールバックを設定する（登録済みウィンドウ用）
   * @param {string} windowId - ウィンドウID
   * @param {Function} fn - 表示時コールバック
   */
  setOnShowCallback(windowId, fn) {
    const windowInfo = this.windows.get(windowId);
    if (!windowInfo) return;
    windowInfo.onShow = fn;
  }

  /**
   * ウィンドウをビューポート内に収める
   * @param {HTMLElement} element - 対象要素
   */
  _clampToViewport(element) {
    const rect = element.getBoundingClientRect();
    let left = rect.left;
    let top = rect.top;

    // ウィンドウ全体がビューポート内に収まるよう位置を制限する
    // ウィンドウがビューポートより大きい場合は左上を優先して表示する
    const maxLeft = Math.max(0, window.innerWidth - element.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - element.offsetHeight);

    left = Math.max(0, Math.min(maxLeft, left));
    top = Math.max(0, Math.min(maxTop, top));

    if (left !== rect.left || top !== rect.top) {
      element.style.transform = '';
      element.style.right = 'auto';
      element.style.bottom = 'auto';
      element.style.left = `${left}px`;
      element.style.top = `${top}px`;
    }
  }

  /**
   * 指定ウィンドウを最前面に持ってくる
   * @param {string} windowId - ウィンドウID
   */
  bringToFront(windowId) {
    const windowInfo = this.windows.get(windowId);
    if (!windowInfo) return;

    // z-index が上限(200)に達したらリセット
    if (this._topZIndex >= 200) {
      this._topZIndex = this._baseZIndex;
      for (const info of this.windows.values()) {
        info.element.style.zIndex = '';
      }
    }

    this._topZIndex += 1;
    windowInfo.element.style.zIndex = this._topZIndex;
  }

  /**
   * ウィンドウを表示する
   * @param {string} windowId - ウィンドウID
   */
  showWindow(windowId) {
    const windowInfo = this.windows.get(windowId);
    if (!windowInfo) {
      log.warn(`FloatingWindowManager: ウィンドウ #${windowId} が登録されていません`);
      return;
    }

    // hidden クラスを削除し visible を追加
    windowInfo.element.classList.remove('hidden');
    windowInfo.element.classList.add('visible');
    windowInfo.isVisible = true;

    // 表示時に前面へ
    this.bringToFront(windowId);

    // 画面外に出ていたら境界内に収める
    this._clampToViewport(windowInfo.element);

    // コールバック実行
    if (windowInfo.onShow) {
      windowInfo.onShow();
    }
  }

  /**
   * ウィンドウを非表示にする
   * @param {string} windowId - ウィンドウID
   */
  hideWindow(windowId) {
    const windowInfo = this.windows.get(windowId);
    if (!windowInfo) {
      log.warn(`FloatingWindowManager: ウィンドウ #${windowId} が登録されていません`);
      return;
    }

    // visible クラスを削除し hidden を追加
    windowInfo.element.classList.remove('visible');
    windowInfo.element.classList.add('hidden');
    windowInfo.isVisible = false;

    // コールバック実行
    if (windowInfo.onHide) {
      windowInfo.onHide();
    }
  }

  /**
   * ウィンドウの表示/非表示を切り替える
   * @param {string} windowId - ウィンドウID
   */
  toggleWindow(windowId) {
    const windowInfo = this.windows.get(windowId);
    if (!windowInfo) {
      log.warn(`FloatingWindowManager: ウィンドウ #${windowId} が登録されていません`);
      return;
    }

    if (windowInfo.isVisible) {
      this.hideWindow(windowId);
    } else {
      this.showWindow(windowId);
    }
  }

  /**
   * ウィンドウが表示されているかチェック
   * @param {string} windowId - ウィンドウID
   * @returns {boolean}
   */
  isWindowVisible(windowId) {
    const windowInfo = this.windows.get(windowId);
    return windowInfo ? windowInfo.isVisible : false;
  }

  /**
   * 要素をドラッグ可能にする
   * @param {HTMLElement} element - ドラッグ対象の要素
   * @param {HTMLElement} handle - ドラッグハンドル（ヘッダー部分）
   * @returns {Function} クリーンアップ関数
   */
  makeDraggable(element, handle) {
    let isDragging = false;
    let startMouseX;
    let startMouseY;
    let startLeft;
    let startTop;

    function dragStart(e) {
      // ボタンなどのクリックはドラッグしない
      if (e.target.closest('button') || e.target.closest('a')) {
        return;
      }

      // ドラッグ開始時点の要素位置を left/top で確定する
      // transform や right で配置されている場合も getBoundingClientRect で吸収する
      const rect = element.getBoundingClientRect();
      element.style.transform = '';
      element.style.right = 'auto';
      element.style.bottom = 'auto';
      element.style.left = `${rect.left}px`;
      element.style.top = `${rect.top}px`;

      startMouseX = e.clientX;
      startMouseY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;

      isDragging = true;
    }

    function drag(e) {
      if (!isDragging) return;
      e.preventDefault();

      const dx = e.clientX - startMouseX;
      const dy = e.clientY - startMouseY;

      // ドラッグ中もウィンドウ全体がビューポート内に収まるよう制限する
      const maxLeft = Math.max(0, window.innerWidth - element.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - element.offsetHeight);

      element.style.left = `${Math.max(0, Math.min(maxLeft, startLeft + dx))}px`;
      element.style.top = `${Math.max(0, Math.min(maxTop, startTop + dy))}px`;
    }

    function dragEnd() {
      isDragging = false;
    }

    handle.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    // クリーンアップ関数を返す
    return () => {
      handle.removeEventListener('mousedown', dragStart);
      document.removeEventListener('mousemove', drag);
      document.removeEventListener('mouseup', dragEnd);
    };
  }

  /**
   * 要素をリサイズ可能にする（右・下・右下ハンドル）
   * @param {HTMLElement} element - リサイズ対象の要素
   * @returns {Function} クリーンアップ関数
   */
  makeResizable(element) {
    // 既存ハンドルを削除して再生成
    for (const handle of element.querySelectorAll('.resize-handle')) {
      handle.remove();
    }

    const handles = [
      { className: 'resize-handle resize-handle-e', direction: 'e' },
      { className: 'resize-handle resize-handle-s', direction: 's' },
      { className: 'resize-handle resize-handle-se', direction: 'se' },
    ];

    for (const { className, direction } of handles) {
      const handle = document.createElement('div');
      handle.className = className;
      handle.dataset.direction = direction;
      element.appendChild(handle);
    }
    element.classList.add('has-resize-handle');

    let isResizing = false;
    let direction = null;
    let startX, startY, startWidth, startHeight;

    function resizeStart(e) {
      if (e.button !== 0) return;
      direction = e.currentTarget.dataset.direction;
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = element.offsetWidth;
      startHeight = element.offsetHeight;

      // インラインで left が未設定の場合、CSSの right/bottom で配置されている可能性がある
      // その場合 left/top に変換して左端・上端を固定する
      // （right固定のままwidthを変えると左端が動いてしまう）
      const rect = element.getBoundingClientRect();
      if (!element.style.left) {
        element.style.left = `${rect.left}px`;
        element.style.right = 'auto';
      }
      if (!element.style.top) {
        element.style.top = `${rect.top}px`;
        element.style.bottom = 'auto';
      }

      element.classList.add('resizing');
      e.preventDefault();
    }

    function resize(e) {
      if (!isResizing) return;
      e.preventDefault();

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      const maxWidth = window.innerWidth - 20;
      const maxHeight = window.innerHeight - 20;

      // CSSで定義されたmin-width/min-heightを尊重する
      const computedStyle = window.getComputedStyle(element);
      const minWidth = parseFloat(computedStyle.minWidth) || 300;
      const minHeight = parseFloat(computedStyle.minHeight) || 200;

      if (direction === 'e' || direction === 'se') {
        element.style.width = `${Math.max(minWidth, Math.min(maxWidth, startWidth + deltaX))}px`;
      }
      if (direction === 's' || direction === 'se') {
        element.style.height = `${Math.max(minHeight, Math.min(maxHeight, startHeight + deltaY))}px`;
      }
    }

    function resizeEnd() {
      if (isResizing) {
        isResizing = false;
        direction = null;
        element.classList.remove('resizing');
        // リサイズ後にウィンドウがビューポート外に出ていれば位置を調整する
        const rect = element.getBoundingClientRect();
        const maxLeft = Math.max(0, window.innerWidth - element.offsetWidth);
        const maxTop = Math.max(0, window.innerHeight - element.offsetHeight);
        const newLeft = Math.max(0, Math.min(maxLeft, rect.left));
        const newTop = Math.max(0, Math.min(maxTop, rect.top));
        if (newLeft !== rect.left || newTop !== rect.top) {
          element.style.left = `${newLeft}px`;
          element.style.top = `${newTop}px`;
        }
      }
    }

    const allHandles = element.querySelectorAll('.resize-handle');
    for (const handle of allHandles) {
      handle.addEventListener('mousedown', resizeStart);
    }
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', resizeEnd);

    return () => {
      for (const handle of element.querySelectorAll('.resize-handle')) {
        handle.removeEventListener('mousedown', resizeStart);
      }
      document.removeEventListener('mousemove', resize);
      document.removeEventListener('mouseup', resizeEnd);
      element.classList.remove('has-resize-handle');
    };
  }

  /**
   * 全てのウィンドウを非表示にする
   */
  hideAllWindows() {
    for (const windowId of this.windows.keys()) {
      this.hideWindow(windowId);
    }
  }

  /**
   * ウィンドウの登録を解除する
   * @param {string} windowId - ウィンドウID
   */
  unregisterWindow(windowId) {
    const windowInfo = this.windows.get(windowId);
    if (windowInfo) {
      // ドラッグイベントのクリーンアップ
      if (windowInfo.dragCleanup) {
        windowInfo.dragCleanup();
      }

      // リサイズイベントのクリーンアップ
      if (windowInfo.resizeCleanup) {
        windowInfo.resizeCleanup();
      }

      // トグルボタンのイベントリスナー解除
      if (windowInfo.toggleButton && windowInfo.toggleHandler) {
        windowInfo.toggleButton.removeEventListener('click', windowInfo.toggleHandler);
      }

      // 閉じるボタンのイベントリスナー解除
      if (windowInfo.closeButton && windowInfo.closeHandler) {
        windowInfo.closeButton.removeEventListener('click', windowInfo.closeHandler);
      }

      // フォーカスハンドラーの解除
      if (windowInfo.focusHandler) {
        windowInfo.element.removeEventListener('mousedown', windowInfo.focusHandler);
      }

      log.info(`FloatingWindowManager: ウィンドウ #${windowId} を解除しました`);
    }

    this.windows.delete(windowId);
  }

  /**
   * すべてのウィンドウを解除してリソースを解放する
   */
  destroy() {
    for (const windowId of this.windows.keys()) {
      this.unregisterWindow(windowId);
    }
    window.removeEventListener('resize', this._onWindowResize);
    log.info('FloatingWindowManager: すべてのウィンドウを解除しました');
  }
}

// シングルトンインスタンスをエクスポート
export const floatingWindowManager = new FloatingWindowManager();

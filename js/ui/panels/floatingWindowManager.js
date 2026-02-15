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
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    function dragStart(e) {
      // ボタンなどのクリックはドラッグしない
      if (e.target.closest('button') || e.target.closest('a')) {
        return;
      }

      initialX = e.clientX - xOffset;
      initialY = e.clientY - yOffset;

      isDragging = true;
    }

    function drag(e) {
      if (isDragging) {
        e.preventDefault();

        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;

        xOffset = currentX;
        yOffset = currentY;

        setTranslate(currentX, currentY, element);
      }
    }

    function dragEnd() {
      isDragging = false;
    }

    function setTranslate(xPos, yPos, el) {
      el.style.transform = `translate(${xPos}px, ${yPos}px)`;
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
   * 要素をリサイズ可能にする
   * @param {HTMLElement} element - リサイズ対象の要素
   * @returns {Function} クリーンアップ関数
   */
  makeResizable(element) {
    // リサイズハンドルを作成（右下の角）
    let resizeHandle = element.querySelector('.resize-handle');
    if (!resizeHandle) {
      resizeHandle = document.createElement('div');
      resizeHandle.className = 'resize-handle';
      element.appendChild(resizeHandle);
    }
    element.classList.add('has-resize-handle');

    let isResizing = false;
    let startX;
    let startY;
    let startWidth;
    let startHeight;

    function resizeStart(e) {
      if (e.button !== 0) return; // 左クリックのみ

      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = element.offsetWidth;
      startHeight = element.offsetHeight;

      element.classList.add('resizing');
      e.preventDefault();
    }

    function resize(e) {
      if (!isResizing) return;

      e.preventDefault();

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      const newWidth = Math.max(300, startWidth + deltaX); // 最小幅300px
      const newHeight = Math.max(200, startHeight + deltaY); // 最小高さ200px

      element.style.width = `${newWidth}px`;
      element.style.height = `${newHeight}px`;
    }

    function resizeEnd() {
      if (isResizing) {
        isResizing = false;
        element.classList.remove('resizing');
      }
    }

    resizeHandle.addEventListener('mousedown', resizeStart);
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', resizeEnd);

    // クリーンアップ関数を返す
    return () => {
      resizeHandle.removeEventListener('mousedown', resizeStart);
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
    log.info('FloatingWindowManager: すべてのウィンドウを解除しました');
  }
}

// シングルトンインスタンスをエクスポート
export const floatingWindowManager = new FloatingWindowManager();

/**
 * FloatingWindowManager - フローティングウィンドウの管理クラス
 *
 * このクラスは、フローティングウィンドウの作成、表示/非表示、ドラッグ機能を統一的に管理します。
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
 *   autoShow: false
 * });
 * ```
 */
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
   * ウィンドウを登録する
   * @param {Object} config - ウィンドウの設定
   * @param {string} config.windowId - ウィンドウ要素のID
   * @param {string} config.toggleButtonId - トグルボタンのID
   * @param {string} config.closeButtonId - 閉じるボタンのID
   * @param {string} config.headerId - ヘッダー要素のID（ドラッグハンドル）
   * @param {boolean} [config.draggable=true] - ドラッグ可能にするか
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
      autoShow = false,
      onShow = null,
      onHide = null
    } = config;

    // 要素を取得
    const windowElement = document.getElementById(windowId);
    const toggleButton = toggleButtonId ? document.getElementById(toggleButtonId) : null;
    const closeButton = closeButtonId ? document.getElementById(closeButtonId) : null;
    const header = headerId ? document.getElementById(headerId) : null;

    if (!windowElement) {
      console.warn(`FloatingWindowManager: ウィンドウ要素 #${windowId} が見つかりません`);
      return false;
    }

    // ウィンドウ情報を保存
    this.windows.set(windowId, {
      element: windowElement,
      toggleButton,
      closeButton,
      header,
      draggable,
      onShow,
      onHide,
      isVisible: windowElement.classList.contains('visible')
    });

    // トグルボタンのイベントリスナー
    if (toggleButton) {
      toggleButton.addEventListener('click', () => {
        this.toggleWindow(windowId);
      });
    }

    // 閉じるボタンのイベントリスナー
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        this.hideWindow(windowId);
      });
    }

    // ドラッグ機能を有効化
    if (draggable && header) {
      this.makeDraggable(windowElement, header);
    }

    // 初期表示
    if (autoShow) {
      this.showWindow(windowId);
    }

    console.log(`FloatingWindowManager: ウィンドウ #${windowId} を登録しました`);
    return true;
  }

  /**
   * ウィンドウを表示する
   * @param {string} windowId - ウィンドウID
   */
  showWindow(windowId) {
    const windowInfo = this.windows.get(windowId);
    if (!windowInfo) {
      console.warn(`FloatingWindowManager: ウィンドウ #${windowId} が登録されていません`);
      return;
    }

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
      console.warn(`FloatingWindowManager: ウィンドウ #${windowId} が登録されていません`);
      return;
    }

    windowInfo.element.classList.remove('visible');
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
      console.warn(`FloatingWindowManager: ウィンドウ #${windowId} が登録されていません`);
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
   */
  makeDraggable(element, handle) {
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    handle.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

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
    this.windows.delete(windowId);
  }
}

// シングルトンインスタンスをエクスポート
export const floatingWindowManager = new FloatingWindowManager();

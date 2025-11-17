/**
 * フローティングウィンドウの初期化と制御
 *
 * このファイルは、FloatingWindowManagerを使用して各フローティングウィンドウを初期化します。
 */

import { floatingWindowManager } from './floatingWindowManager.js';

/**
 * 全てのフローティングウィンドウを初期化
 */
export function initializeFloatingWindow() {
  // 要素表示設定ウィンドウ
  floatingWindowManager.registerWindow({
    windowId: 'element-settings-float',
    toggleButtonId: 'toggle-element-settings-btn',
    closeButtonId: 'close-element-settings-btn',
    headerId: 'element-settings-header',
    draggable: true,
    autoShow: false,
  });

  // 要素情報パネル
  floatingWindowManager.registerWindow({
    windowId: 'component-info',
    toggleButtonId: 'toggle-component-info-btn',
    closeButtonId: 'close-component-info-btn',
    headerId: 'component-info-header',
    draggable: true,
    autoShow: false,
  });

  // 表示範囲設定ウィンドウ
  floatingWindowManager.registerWindow({
    windowId: 'clipping-settings-float',
    toggleButtonId: 'toggle-clipping-settings-btn',
    closeButtonId: 'close-clipping-settings-btn',
    headerId: 'clipping-settings-header',
    draggable: true,
    autoShow: false,
  });

  // 表示モード設定ウィンドウ
  floatingWindowManager.registerWindow({
    windowId: 'display-settings-float',
    toggleButtonId: 'toggle-display-settings-btn',
    closeButtonId: 'close-display-settings-btn',
    headerId: 'display-settings-header',
    draggable: true,
    autoShow: false,
  });

  // 要素ツリー表示ウィンドウ
  floatingWindowManager.registerWindow({
    windowId: 'element-tree-float',
    toggleButtonId: 'toggle-element-tree-btn',
    closeButtonId: 'close-element-tree-btn',
    headerId: 'element-tree-header',
    draggable: true,
    autoShow: false,
  });

  // 断面ツリーウィンドウを登録
  floatingWindowManager.registerWindow({
    windowId: 'section-tree-float',
    toggleButtonId: 'toggle-section-tree-btn',
    closeButtonId: 'close-section-tree-btn',
    headerId: 'section-tree-header',
    draggable: true,
    autoShow: false,
  });

  console.log('フローティングウィンドウの初期化が完了しました');
}

/**
 * FloatingWindowManagerのインスタンスをエクスポート（他のモジュールから使用可能）
 */
export { floatingWindowManager };

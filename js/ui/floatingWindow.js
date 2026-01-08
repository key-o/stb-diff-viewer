/**
 * フローティングウィンドウの初期化と制御
 *
 * このファイルは、FloatingWindowManagerを使用して各フローティングウィンドウを初期化します。
 */

import { floatingWindowManager } from './floatingWindowManager.js';
import { dxfController } from '../app/controllers/dxfController.js';

/**
 * 動的に生成するウィンドウのテンプレート
 */
const dynamicWindowTemplates = [
  {
    windowId: 'tree-view-float',
    title: 'ツリービュー',
    icon: '🌳',
    content: `
      <div class="tree-view-tabs">
        <button type="button" class="tree-tab-btn active" data-tab="element">要素</button>
        <button type="button" class="tree-tab-btn" data-tab="section">断面</button>
        <select
          id="section-grouping-mode"
          class="grouping-mode-select tree-tab-option"
          title="グループ化モード"
          style="display: none;"
        >
          <option value="floor">階ごと</option>
          <option value="code">符号ごと</option>
        </select>
      </div>
      <div class="tree-tab-content">
        <div id="element-tree-container" class="tree-tab-panel active">
          <div class="tree-empty-message">
            モデルを読み込んでください
          </div>
        </div>
        <div id="section-tree-container" class="tree-tab-panel" style="display: none;">
          <div class="tree-empty-message">
            モデルを読み込んでください
          </div>
        </div>
      </div>
    `,
    headerExtra: '',
    toggleButtonId: 'toggle-tree-view-btn',
  },
  // 許容差設定は色付けモード設定パネル内に統合されたため削除
];

/**
 * 全てのフローティングウィンドウを初期化
 */
export function initializeFloatingWindow() {
  // 動的にウィンドウを生成
  for (const template of dynamicWindowTemplates) {
    floatingWindowManager.createWindow(template);

    // 生成したウィンドウを登録
    floatingWindowManager.registerWindow({
      windowId: template.windowId,
      toggleButtonId: template.toggleButtonId,
      closeButtonId: `close-${template.windowId}-btn`,
      headerId: `${template.windowId}-header`,
      draggable: true,
      autoShow: false,
    });
  }

  // ツリービューのタブ切り替え機能を初期化
  initializeTreeViewTabs();

  // ビュー・表示設定ウィンドウ（HTMLに定義済み）
  floatingWindowManager.registerWindow({
    windowId: 'element-settings-float',
    toggleButtonId: 'toggle-element-settings-btn',
    closeButtonId: 'close-element-settings-btn',
    headerId: 'element-settings-header',
    draggable: true,
    autoShow: false,
  });

  // 要素情報パネル（HTMLに定義済み）
  floatingWindowManager.registerWindow({
    windowId: 'component-info',
    toggleButtonId: 'toggle-component-info-btn',
    closeButtonId: 'close-component-info-btn',
    headerId: 'component-info-header',
    draggable: true,
    autoShow: false,
  });

  // 表示範囲設定ウィンドウ（HTMLに定義済み）
  floatingWindowManager.registerWindow({
    windowId: 'clipping-settings-float',
    toggleButtonId: 'toggle-clipping-settings-btn',
    closeButtonId: 'close-clipping-settings-btn',
    headerId: 'clipping-settings-header',
    draggable: true,
    autoShow: false,
  });

  // 色付けモード設定ウィンドウ（HTMLに定義済み）
  floatingWindowManager.registerWindow({
    windowId: 'display-settings-float',
    toggleButtonId: 'toggle-display-settings-btn',
    closeButtonId: 'close-display-settings-btn',
    headerId: 'display-settings-header',
    draggable: true,
    autoShow: false,
  });

  // DXFフローティングウィンドウ（HTMLに定義済み）
  floatingWindowManager.registerWindow({
    windowId: 'dxf-floating',
    toggleButtonId: 'toggle-dxf-floating-btn',
    closeButtonId: 'close-dxf-floating-btn',
    headerId: 'dxf-floating-header',
    draggable: true,
    autoShow: false,
    onShow: () => {
      try {
        dxfController.updatePlacementOptions();
        dxfController.updateExportStatus();
      } catch (e) {
        // 無ければ無視
      }
    },
  });
  console.log('フローティングウィンドウの初期化が完了しました');
}

/**
 * ツリービューのタブ切り替え機能を初期化
 */
function initializeTreeViewTabs() {
  const tabButtons = document.querySelectorAll('.tree-tab-btn');
  const tabPanels = document.querySelectorAll('.tree-tab-panel');
  const groupingModeSelect = document.getElementById('section-grouping-mode');

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;

      // タブボタンのアクティブ状態を切り替え
      tabButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      // パネルの表示を切り替え
      tabPanels.forEach((panel) => {
        if (panel.id === `${targetTab}-tree-container`) {
          panel.style.display = '';
          panel.classList.add('active');
        } else {
          panel.style.display = 'none';
          panel.classList.remove('active');
        }
      });

      // 断面タブの場合はグループ化モードを表示
      if (groupingModeSelect) {
        groupingModeSelect.style.display = targetTab === 'section' ? '' : 'none';
      }
    });
  });
}

/**
 * FloatingWindowManagerのインスタンスをエクスポート（他のモジュールから使用可能）
 */
export { floatingWindowManager };

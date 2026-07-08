/**
 * @fileoverview 右サイドパネル(#overlay)の折り畳みトグル
 *
 * 画面右端のトグルボタンで右パネルを開閉する。折り畳むとパネルが右へ畳まれ、
 * 3D キャンバスが全幅に広がる。状態は localStorage に保存する。
 *
 * @module ui/panels/overlayPanelToggle
 */

import { createLogger } from '../../utils/logger.js';
import { storageHelper } from '../../utils/storageHelper.js';
import { eventBus, ModelEvents } from '../../data/events/index.js';

const log = createLogger('ui:overlayPanelToggle');

const STORAGE_KEY = 'overlayCollapsed';

/**
 * 右パネル折り畳みトグルを初期化する。
 */
export function initializeOverlayToggle() {
  const toggleBtn = document.getElementById('overlay-toggle-btn');
  if (!toggleBtn) {
    log.warn('右パネルトグルボタンが見つかりません');
    return;
  }

  const apply = (collapsed) => {
    document.body.classList.toggle('overlay-collapsed', collapsed);
    toggleBtn.setAttribute('aria-expanded', String(!collapsed));
    // 折り畳み時は「開く」方向(◀)、展開時は「閉じる」方向(▶)を示す
    toggleBtn.textContent = collapsed ? '◀' : '▶';
    toggleBtn.setAttribute(
      'aria-label',
      collapsed ? 'サイドパネルを開く' : 'サイドパネルを折り畳む',
    );
  };

  toggleBtn.addEventListener('click', () => {
    const collapsed = !document.body.classList.contains('overlay-collapsed');
    apply(collapsed);
    storageHelper.set(STORAGE_KEY, collapsed);
    log.info(`[UI] 右パネルを${collapsed ? '折り畳み' : '展開'}ました`);
  });

  // モデル読み込み完了時にパネルを開く
  eventBus.on(ModelEvents.LOADED, () => {
    if (!document.body.classList.contains('overlay-collapsed')) return;
    apply(false);
    storageHelper.set(STORAGE_KEY, false);
    log.info('[UI] モデル読み込み完了により右パネルを展開しました');
  });

  // 初期状態: 保存された状態があれば復元、なければ折り畳んでおく
  apply(storageHelper.get(STORAGE_KEY, true) === true);
}

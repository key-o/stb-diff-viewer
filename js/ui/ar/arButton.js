/**
 * @fileoverview ARモード切替ボタンのUIコンポーネント
 *
 * WebXR AR対応デバイスでのみARボタンを表示し、
 * ARセッションの開始・終了をユーザー操作に接続します。
 * モデル未読み込み時はボタンを無効化し、理由を提示します（FR-1.4）。
 * AR中のモデル配置はXRセッションのselectイベントで行われます。
 */

import { createLogger } from '../../utils/logger.js';
import { arSessionManager } from '../../viewer/index.js';
import { eventBus } from '../../data/events/eventBus.js';
import { ModelEvents, RenderEvents } from '../../constants/eventTypes.js';
import { isModelLoaded } from '../../app/controllers/modelLoaderController.js';
import { showWarning } from '../common/toast.js';
import { computeArButtonState } from './arButtonState.js';
import {
  initArOverlay,
  showArOverlay,
  hideArOverlay,
  updateArPlacementState,
} from './arOverlay.js';

const log = createLogger('ui/ar/arButton');

/** 有効時のツールチップ文言 */
const AR_BUTTON_TITLE_AVAILABLE = 'AR表示（対応デバイスのみ）';

/**
 * ARボタンUIを初期化
 * WebXR ARが利用可能な場合のみボタンを表示
 */
export async function initArButton() {
  const supported = await arSessionManager.checkSupport();

  const btn = document.getElementById('arModeButton');
  if (!btn) {
    log.warn('ARモードボタン要素が見つかりません (#arModeButton)');
    return;
  }

  if (!supported) {
    btn.style.display = 'none';
    log.info('WebXR AR非対応のため、ARボタンを非表示にしました');
    return;
  }

  // AR専用オーバーレイを初期化
  initArOverlay();

  // ボタンを表示
  btn.style.display = '';
  btn.disabled = false;
  btn.addEventListener('click', _handleArButtonClick);

  // モデル読み込み状態に応じて活性状態を追従させる（FR-1.4）
  _updateArButtonAvailability();
  eventBus.on(RenderEvents.MODEL_LOADED, _updateArButtonAvailability);
  eventBus.on(ModelEvents.CLEARED, _updateArButtonAvailability);

  log.info('ARボタンを有効化しました');
}

/**
 * モデル読み込み状態に基づいてARボタンの活性状態を更新（FR-1.4）
 *
 * タッチ端末（ARの対象デバイス）では disabled ボタンはタップイベント自体が
 * 発生せず理由を提示できないため、aria-disabled ＋ クリックガード方式で
 * 無効化し、タップ時はトーストで理由を表示する。
 * @private
 */
function _updateArButtonAvailability() {
  const btn = document.getElementById('arModeButton');
  if (!btn) return;
  // AR中（「AR終了」表示中）は終了操作を妨げないため変更しない
  if (arSessionManager.isActive) return;

  const state = computeArButtonState({
    supported: true,
    modelLoaded: isModelLoaded(),
    sessionActive: false,
  });

  if (state.enabled) {
    btn.removeAttribute('aria-disabled');
    btn.classList.remove('ar-unavailable');
    btn.title = AR_BUTTON_TITLE_AVAILABLE;
  } else {
    btn.setAttribute('aria-disabled', 'true');
    btn.classList.add('ar-unavailable');
    btn.title = state.reason || '';
  }
}

/**
 * ARボタンクリックハンドラ
 * @private
 */
async function _handleArButtonClick() {
  const btn = document.getElementById('arModeButton');
  if (!btn) return;

  // モデル未読み込み時は開始せず、理由をトーストで提示（FR-1.4）
  if (!arSessionManager.isActive && btn.getAttribute('aria-disabled') === 'true') {
    const state = computeArButtonState({
      supported: true,
      modelLoaded: isModelLoaded(),
      sessionActive: false,
    });
    if (state.reason) {
      showWarning(state.reason);
    }
    return;
  }

  if (arSessionManager.isActive) {
    // ARセッション終了
    await arSessionManager.endSession();
  } else {
    // ARセッション開始
    btn.disabled = true;
    btn.textContent = 'AR起動中...';

    const arOverlayRoot = document.getElementById('ar-overlay');
    const success = await arSessionManager.startSession({
      domOverlayRoot: arOverlayRoot,
      onSessionEnd: () => _onSessionEnd(btn),
      onStateChange: (state) => updateArPlacementState(state),
    });

    if (success) {
      btn.disabled = false;
      btn.textContent = 'AR終了';
      btn.classList.add('ar-active');
      showArOverlay();
    } else {
      btn.disabled = false;
      btn.textContent = 'AR表示';
      log.error('ARセッションの開始に失敗しました');
    }
  }
}

/**
 * ARセッション終了時のUI復元
 * @param {HTMLElement} btn
 * @private
 */
function _onSessionEnd(btn) {
  if (btn) {
    btn.textContent = 'AR表示';
    btn.classList.remove('ar-active');
    btn.disabled = false;
  }
  hideArOverlay();
  // セッション中にモデル状態が変わっている可能性があるため再評価
  _updateArButtonAvailability();
  log.info('ARモードUIを復元しました');
}

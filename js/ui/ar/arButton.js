/**
 * @fileoverview ARモード切替ボタンのUIコンポーネント
 *
 * WebXR AR対応デバイスでのみARボタンを表示し、
 * ARセッションの開始・終了をユーザー操作に接続します。
 */

import { createLogger } from '../../utils/logger.js';
import { arSessionManager } from '../../viewer/ar/arSessionManager.js';

const log = createLogger('ui/ar/arButton');

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

  // ボタンを表示
  btn.style.display = '';
  btn.disabled = false;
  btn.addEventListener('click', _handleArButtonClick);
  log.info('ARボタンを有効化しました');
}

/**
 * ARボタンクリックハンドラ
 * @private
 */
async function _handleArButtonClick() {
  const btn = document.getElementById('arModeButton');
  if (!btn) return;

  if (arSessionManager.isActive) {
    // ARセッション終了
    await arSessionManager.endSession();
  } else {
    // ARセッション開始
    btn.disabled = true;
    btn.textContent = 'AR起動中...';

    const overlay = document.getElementById('overlay');
    const success = await arSessionManager.startSession({
      domOverlayRoot: overlay,
      onSessionEnd: () => _onSessionEnd(btn),
    });

    if (success) {
      btn.disabled = false;
      btn.textContent = 'AR終了';
      btn.classList.add('ar-active');

      // AR空間タップでモデル配置
      const canvas = document.getElementById('three-canvas');
      if (canvas) {
        canvas.addEventListener('click', _handleArTap, { once: false });
      }
    } else {
      btn.disabled = false;
      btn.textContent = 'AR表示';
      log.error('ARセッションの開始に失敗しました');
    }
  }
}

/**
 * AR空間でのタップ処理（モデル配置）
 * @param {Event} e
 * @private
 */
function _handleArTap(_e) {
  if (!arSessionManager.isActive) {
    const canvas = document.getElementById('three-canvas');
    if (canvas) {
      canvas.removeEventListener('click', _handleArTap);
    }
    return;
  }
  const placed = arSessionManager.placeModel();
  if (!placed) {
    log.info('有効な面検出前のため、配置は保留されました');
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
  const canvas = document.getElementById('three-canvas');
  if (canvas) {
    canvas.removeEventListener('click', _handleArTap);
  }
  log.info('ARモードUIを復元しました');
}

/**
 * @fileoverview AR専用オーバーレイUIコンポーネント
 *
 * ARセッション中のみ表示されるDOM Overlayを管理します。
 * 終了・再配置・縮尺切替・状態ガイダンスを提供し、
 * UI操作がXR selectイベント（モデル配置）を誤発火させないよう制御します。
 */

import { createLogger } from '../../utils/logger.js';
import { arSessionManager } from '../../viewer/index.js';
import { ArGestureController } from './arGestures.js';
import { formatArElementInfo } from './arElementInfo.js';

const log = createLogger('ui/ar/arOverlay');

/** 配置状態ごとのガイダンス文言 */
const GUIDANCE_TEXT = {
  detecting: '平面を検出しています… 床にカメラを向けてください',
  ready: 'タップしてモデルを配置',
  placed: '',
};

/**
 * AR専用オーバーレイのルート要素を取得
 * @returns {HTMLElement|null}
 */
export function getArOverlayRoot() {
  return document.getElementById('ar-overlay');
}

/**
 * AR専用オーバーレイUIを初期化（起動時に1回呼ぶ）
 * @returns {HTMLElement|null} オーバーレイのルート要素
 */
export function initArOverlay() {
  const root = getArOverlayRoot();
  if (!root) {
    log.warn('AR専用オーバーレイ要素が見つかりません (#ar-overlay)');
    return null;
  }

  const exitBtn = root.querySelector('#arExitButton');
  if (exitBtn) {
    exitBtn.addEventListener('click', () => {
      arSessionManager.endSession();
    });
  }

  const repositionBtn = root.querySelector('#arRepositionButton');
  if (repositionBtn) {
    repositionBtn.addEventListener('click', () => {
      hideArElementInfo();
      arSessionManager.resetPlacement();
    });
  }

  const infoCloseBtn = root.querySelector('#arElementInfoClose');
  if (infoCloseBtn) {
    infoCloseBtn.addEventListener('click', () => hideArElementInfo());
  }

  root.querySelectorAll('[data-ar-scale]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const factor = Number(btn.dataset.arScale);
      const applied = arSessionManager.setModelScale(factor);
      updateScaleUi(applied);
    });
  });

  // UI領域のタップがXR select（モデル配置）を発火させないよう抑制
  root.querySelectorAll('.ar-overlay-top, .ar-overlay-bottom, .ar-element-info').forEach((el) => {
    el.addEventListener('beforexrselect', (e) => e.preventDefault());
  });

  _attachGestures(root);

  log.info('AR専用オーバーレイを初期化しました');
  return root;
}

/**
 * 配置済みモデルへのジェスチャー操作（回転・ピンチスケール）を接続
 * @private
 * @param {HTMLElement} root
 */
function _attachGestures(root) {
  const gestures = new ArGestureController({
    rotateBy: (delta) => arSessionManager.rotateModelBy(delta),
    setScale: (factor) => {
      const applied = arSessionManager.setModelScale(factor);
      updateScaleUi(applied);
    },
    getScale: () => arSessionManager.modelScale,
    isPlaced: () => arSessionManager.isPlaced,
    onTap: ({ x, y }) => _handleModelTap(x, y),
  });

  const toPoints = (touchList) => Array.from(touchList, (t) => ({ x: t.clientX, y: t.clientY }));

  // UIボタン上のタッチはジェスチャー対象外
  const isOnControls = (target) =>
    typeof target?.closest === 'function' &&
    target.closest('.ar-overlay-top, .ar-overlay-bottom, .ar-element-info') !== null;

  root.addEventListener(
    'touchstart',
    (e) => {
      if (isOnControls(e.target)) return;
      gestures.handleTouchStart(toPoints(e.touches));
    },
    { passive: true },
  );
  root.addEventListener(
    'touchmove',
    (e) => {
      if (gestures.mode === 'none') return;
      gestures.handleTouchMove(toPoints(e.touches));
    },
    { passive: true },
  );
  const onEnd = (e) => {
    gestures.handleTouchEnd(toPoints(e.touches));
  };
  root.addEventListener('touchend', onEnd, { passive: true });
  root.addEventListener('touchcancel', onEnd, { passive: true });
}

/**
 * 配置済みモデルへのタップで要素をピックし、情報カードを表示する（FR-6.1）
 * 何もヒットしなかった場合はカードを閉じる
 * @private
 * @param {number} x - タップX座標（px）
 * @param {number} y - タップY座標（px）
 */
function _handleModelTap(x, y) {
  const picked = arSessionManager.pickElementAt(x, y);
  const text = formatArElementInfo(picked);
  if (text) {
    showArElementInfo(text);
  } else {
    hideArElementInfo();
  }
}

/**
 * 要素情報カードを表示する
 * @param {import('./arElementInfo.js').ArElementInfoText} text
 */
export function showArElementInfo(text) {
  const root = getArOverlayRoot();
  const card = root?.querySelector('#arElementInfo');
  if (!card || !text) return;

  const title = card.querySelector('#arElementInfoTitle');
  if (title) title.textContent = text.title;
  const detail = card.querySelector('#arElementInfoDetail');
  if (detail) {
    detail.textContent = text.detail;
    detail.hidden = text.detail === '';
  }
  card.hidden = false;
}

/**
 * 要素情報カードを非表示にする
 */
export function hideArElementInfo() {
  const card = getArOverlayRoot()?.querySelector('#arElementInfo');
  if (card) card.hidden = true;
}

/**
 * オーバーレイを表示（ARセッション開始時）
 */
export function showArOverlay() {
  const root = getArOverlayRoot();
  if (!root) return;
  root.hidden = false;
  hideArElementInfo();
  updateArPlacementState(arSessionManager.getPlacementState());
  updateScaleUi(arSessionManager.modelScale);
}

/**
 * オーバーレイを非表示（ARセッション終了時）
 */
export function hideArOverlay() {
  const root = getArOverlayRoot();
  if (!root) return;
  root.hidden = true;
}

/**
 * 配置状態に応じてガイダンスとボタン表示を更新
 * @param {'detecting'|'ready'|'placed'} state
 */
export function updateArPlacementState(state) {
  const root = getArOverlayRoot();
  if (!root) return;

  const guidance = root.querySelector('#arGuidanceText');
  if (guidance) {
    const text = GUIDANCE_TEXT[state] ?? '';
    guidance.textContent = text;
    guidance.hidden = text === '';
  }

  const repositionBtn = root.querySelector('#arRepositionButton');
  if (repositionBtn) {
    repositionBtn.hidden = state !== 'placed';
  }

  // 未配置状態（再配置直後など）では要素情報カードを閉じる
  if (state !== 'placed') {
    hideArElementInfo();
  }
}

/**
 * 縮尺表示とプリセットボタンの選択状態を更新
 * @param {number} factor - 現在の縮尺係数（1.0 = 実寸）
 */
export function updateScaleUi(factor) {
  const root = getArOverlayRoot();
  if (!root) return;

  const label = root.querySelector('#arScaleLabel');
  if (label) {
    label.textContent = formatScale(factor);
  }

  root.querySelectorAll('[data-ar-scale]').forEach((btn) => {
    const btnFactor = Number(btn.dataset.arScale);
    btn.classList.toggle('active', Math.abs(btnFactor - factor) < 1e-9);
  });
}

/**
 * 縮尺係数を表示用文字列に変換
 * @param {number} factor
 * @returns {string}
 */
export function formatScale(factor) {
  if (!Number.isFinite(factor) || factor <= 0) return '';
  if (factor >= 0.999) return '実寸';
  return `1/${Math.round(1 / factor)}`;
}

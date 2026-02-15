/**
 * @fileoverview 3Dビュースクリーンショット取得モジュール
 *
 * Three.jsキャンバスからPNG画像をBase64形式で取得します。
 * レポートへの画像埋め込みに使用します。
 *
 * @module export/report/reportScreenshot
 */

import { renderer, setView, VIEW_DIRECTIONS } from '../../viewer/index.js';
import { getState } from '../../app/globalState.js';

/**
 * @typedef {Object} ScreenshotResult
 * @property {string} dataUrl - Base64エンコードされた画像データURL
 * @property {string} viewName - ビュー名（日本語）
 * @property {string} viewKey - ビューキー
 */

/** ビュー名の日本語マッピング */
const VIEW_LABELS = {
  iso: 'アイソメトリック',
  top: '上面図',
  front: '正面図',
};

/**
 * 現在のビューのスクリーンショットを取得する
 * @returns {string|null} Base64画像データURL、またはnull
 */
export function captureCurrentView() {
  const gl = renderer?.domElement;
  if (!gl) return null;

  try {
    // 描画を強制更新してからキャプチャ
    const requestRender = getState('rendering.requestRender');
    if (requestRender) {
      requestRender();
    }

    return gl.toDataURL('image/png');
  } catch {
    console.warn('[Report] スクリーンショットの取得に失敗しました');
    return null;
  }
}

/**
 * 複数ビューのスクリーンショットを取得する
 * @param {string[]} [viewKeys=['iso']] - 取得するビューキーの配列
 * @returns {Promise<ScreenshotResult[]>} スクリーンショット結果の配列
 */
export async function captureMultipleViews(viewKeys = ['iso']) {
  const results = [];
  const gl = renderer?.domElement;
  if (!gl) return results;

  for (const viewKey of viewKeys) {
    try {
      // ビューを切り替え
      if (viewKey !== 'iso' && VIEW_DIRECTIONS[viewKey]) {
        setView(viewKey);
        // カメラアニメーション完了を待つ
        await wait(500);
      }

      // 描画更新
      const requestRender = getState('rendering.requestRender');
      if (requestRender) {
        requestRender();
      }
      await wait(100);

      const dataUrl = gl.toDataURL('image/png');
      results.push({
        dataUrl,
        viewName: VIEW_LABELS[viewKey] || viewKey,
        viewKey,
      });
    } catch {
      console.warn(`[Report] ${viewKey}ビューのスクリーンショット取得に失敗`);
    }
  }

  return results;
}

/**
 * 指定ミリ秒待機するユーティリティ
 * @param {number} ms - 待機時間（ミリ秒）
 * @returns {Promise<void>}
 */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

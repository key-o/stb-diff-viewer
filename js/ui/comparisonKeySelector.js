/**
 * @fileoverview 比較キータイプ選択UIモジュール
 *
 * このモジュールは要素の対応関係を決定するキータイプの選択UIを提供します：
 * - 位置情報ベース vs GUIDベースの選択
 * - 設定変更時の再比較トリガー
 * - 設定の永続化（SettingsManager経由）
 */

import {
  COMPARISON_KEY_TYPE,
  COMPARISON_KEY_TYPE_LABELS,
  COMPARISON_KEY_TYPE_DESCRIPTIONS,
} from '../config/comparisonKeyConfig.js';
import comparisonKeyManager from '../core/comparisonKeyManager.js';
import { COMPARISON_KEY_EVENTS } from './events.js';

/**
 * 比較キー選択UIを初期化する
 * @param {string} containerSelector - UIコンテナのセレクター
 * @param {function} onKeyTypeChanged - キータイプ変更時のコールバック
 */
export function initializeComparisonKeySelector(
  containerSelector,
  onKeyTypeChanged
) {
  console.log(`[ComparisonKeySelector] Initializing with selector: ${containerSelector}`);

  const container = document.querySelector(containerSelector);
  if (!container) {
    console.warn(`[ComparisonKeySelector] Container not found: ${containerSelector}`);
    return;
  }

  // 現在の設定を取得
  const currentKeyType = comparisonKeyManager.getKeyType();
  console.log(`[ComparisonKeySelector] Current key type: ${currentKeyType}`);

  // UIを作成
  const selectorHTML = createSelectorHTML(currentKeyType);
  container.innerHTML = selectorHTML;

  // イベントリスナーを設定
  setupEventListeners(container, onKeyTypeChanged);

  console.log('[ComparisonKeySelector] Initialization complete');
}

/**
 * セレクターのHTMLを生成する
 * @param {string} currentKeyType - 現在のキータイプ
 * @returns {string} HTML文字列
 */
function createSelectorHTML(currentKeyType) {
  return `
    <div class="comparison-key-selector">
      <div class="selector-header">
        <label class="selector-label">要素対応の判定基準:</label>
      </div>
      <div class="selector-options">
        ${Object.entries(COMPARISON_KEY_TYPE)
          .map(([key, value]) => {
            const isChecked = value === currentKeyType ? 'checked' : '';
            const label = COMPARISON_KEY_TYPE_LABELS[value];
            const description = COMPARISON_KEY_TYPE_DESCRIPTIONS[value];
            return `
              <div class="selector-option">
                <label class="radio-label">
                  <input
                    type="radio"
                    name="comparisonKeyType"
                    value="${value}"
                    ${isChecked}
                  />
                  <span class="radio-text">
                    <strong>${label}</strong>
                    <span class="radio-description">${description}</span>
                  </span>
                </label>
              </div>
            `;
          })
          .join('')}
      </div>
      <div class="selector-info">
        <small>
          ※ 設定を変更すると自動的に再比較が実行されます
        </small>
      </div>
    </div>
  `;
}

/**
 * イベントリスナーを設定する
 * @param {Element} container - UIコンテナ
 * @param {function} onKeyTypeChanged - キータイプ変更時のコールバック
 */
function setupEventListeners(container, onKeyTypeChanged) {
  const radioButtons = container.querySelectorAll('input[name="comparisonKeyType"]');

  console.log(`[ComparisonKeySelector] Setting up listeners for ${radioButtons.length} radio buttons`);

  radioButtons.forEach((radio) => {
    radio.addEventListener('change', (event) => {
      const newKeyType = event.target.value;
      console.log(`[ComparisonKeySelector] Radio button changed: ${newKeyType}`);
      handleKeyTypeChange(newKeyType, onKeyTypeChanged);
    });
  });

  // グローバルイベントリスナー（他のタブでの変更を監視）
  document.addEventListener(COMPARISON_KEY_EVENTS.KEY_TYPE_CHANGED, (event) => {
    const { newKeyType } = event.detail;
    console.log(`[ComparisonKeySelector] Global event received: ${newKeyType}`);
    updateUISelection(container, newKeyType);
  });

  console.log('[ComparisonKeySelector] Event listeners setup complete');
}

/**
 * キータイプ変更を処理する
 * @param {string} newKeyType - 新しいキータイプ
 * @param {function} onKeyTypeChanged - コールバック関数
 */
function handleKeyTypeChange(newKeyType, onKeyTypeChanged) {
  try {
    console.log(`[ComparisonKeySelector] Key type change requested: ${newKeyType}`);

    // ComparisonKeyManagerに設定を保存（これによりイベントが発火される）
    const success = comparisonKeyManager.setKeyType(newKeyType);

    if (!success) {
      throw new Error(`Invalid key type: ${newKeyType}`);
    }

    console.log(`[ComparisonKeySelector] Key type changed successfully: ${newKeyType}`);

    // コールバックを実行（再比較をトリガー）
    if (typeof onKeyTypeChanged === 'function') {
      console.log('[ComparisonKeySelector] Executing callback for recomparison...');
      onKeyTypeChanged(newKeyType);
    } else {
      console.warn('[ComparisonKeySelector] No callback provided for key type change');
    }
  } catch (error) {
    console.error('[ComparisonKeySelector] Failed to change key type:', error);
    alert('比較キータイプの変更に失敗しました。詳細はコンソールを確認してください。');
  }
}

/**
 * UI選択状態を更新する
 * @param {Element} container - UIコンテナ
 * @param {string} keyType - 選択するキータイプ
 */
function updateUISelection(container, keyType) {
  const radioButtons = container.querySelectorAll('input[name="comparisonKeyType"]');
  radioButtons.forEach((radio) => {
    radio.checked = radio.value === keyType;
  });
}

/**
 * 現在選択されているキータイプを取得する
 * @param {string} containerSelector - UIコンテナのセレクター
 * @returns {string|null} 選択されているキータイプ、またはnull
 */
export function getSelectedKeyType(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) {
    return null;
  }

  const selectedRadio = container.querySelector('input[name="comparisonKeyType"]:checked');
  return selectedRadio ? selectedRadio.value : null;
}

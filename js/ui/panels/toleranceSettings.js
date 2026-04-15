/**
 * 許容差設定パネルUI
 * 基準点(StbNode)とオフセットの許容差を個別に設定するUIを提供
 */

import {
  getToleranceConfig,
  setToleranceConfig,
  resetToleranceConfig,
  DEFAULT_TOLERANCE_CONFIG,
} from '../../config/toleranceConfig.js';
import { createLogger } from '../../utils/logger.js';
import { storageHelper } from '../../utils/storageHelper.js';
import { eventBus, SettingsEvents } from '../../data/events/index.js';

const STORAGE_KEY = 'toleranceConfig';

const logger = createLogger('ToleranceSettings');

/**
 * 許容差設定パネルのHTML構造を生成
 */
function createToleranceSettingsHTML() {
  return `
    <div class="tolerance-settings-container">
      <div class="tolerance-section">
        <h4 class="tolerance-section-title">⚙️ 許容差設定</h4>
        <p class="tolerance-description">
          微小な座標誤差を許容して比較を行います。基準点とオフセットで個別に設定できます。
        </p>
      </div>

      <!-- 許容差有効化 -->
      <div class="tolerance-section">
        <label class="tolerance-checkbox-label">
          <input type="checkbox" id="tolerance-enabled" checked />
          <strong>許容差を有効にする</strong>
        </label>
      </div>

      <!-- 基準点許容差設定 -->
      <div class="tolerance-section">
        <h5 class="tolerance-subsection-title">📍 基準点（StbNode）の許容差</h5>
        <div class="tolerance-axis-group">
          <div class="tolerance-axis-item">
            <label for="tolerance-basepoint-x">X軸:</label>
            <input type="number" id="tolerance-basepoint-x" class="tolerance-input" 
                   min="0" max="1000" step="0.1" value="${DEFAULT_TOLERANCE_CONFIG.basePoint.x}" />
            <span class="tolerance-unit">mm</span>
          </div>
          <div class="tolerance-axis-item">
            <label for="tolerance-basepoint-y">Y軸:</label>
            <input type="number" id="tolerance-basepoint-y" class="tolerance-input" 
                   min="0" max="1000" step="0.1" value="${DEFAULT_TOLERANCE_CONFIG.basePoint.y}" />
            <span class="tolerance-unit">mm</span>
          </div>
          <div class="tolerance-axis-item">
            <label for="tolerance-basepoint-z">Z軸:</label>
            <input type="number" id="tolerance-basepoint-z" class="tolerance-input" 
                   min="0" max="1000" step="0.1" value="${DEFAULT_TOLERANCE_CONFIG.basePoint.z}" />
            <span class="tolerance-unit">mm</span>
          </div>
        </div>
      </div>

      <!-- オフセット許容差設定 -->
      <div class="tolerance-section">
        <h5 class="tolerance-subsection-title">📏 オフセットの許容差</h5>
        <div class="tolerance-axis-group">
          <div class="tolerance-axis-item">
            <label for="tolerance-offset-x">X軸:</label>
            <input type="number" id="tolerance-offset-x" class="tolerance-input"
                   min="0" max="1000" step="0.1" value="${DEFAULT_TOLERANCE_CONFIG.offset.x}" />
            <span class="tolerance-unit">mm</span>
          </div>
          <div class="tolerance-axis-item">
            <label for="tolerance-offset-y">Y軸:</label>
            <input type="number" id="tolerance-offset-y" class="tolerance-input"
                   min="0" max="1000" step="0.1" value="${DEFAULT_TOLERANCE_CONFIG.offset.y}" />
            <span class="tolerance-unit">mm</span>
          </div>
          <div class="tolerance-axis-item">
            <label for="tolerance-offset-z">Z軸:</label>
            <input type="number" id="tolerance-offset-z" class="tolerance-input"
                   min="0" max="1000" step="0.1" value="${DEFAULT_TOLERANCE_CONFIG.offset.z}" />
            <span class="tolerance-unit">mm</span>
          </div>
        </div>
      </div>

      <!-- 属性値数値しきい値 -->
      <div class="tolerance-section">
        <h5 class="tolerance-subsection-title">🔢 属性値の数値しきい値</h5>
        <p class="tolerance-description">
          rotate・offset 等の数値属性比較で許容する誤差。この値以下の差異は一致とみなします（例: "0" と "0.0" の不一致を防止）。
        </p>
        <div class="tolerance-axis-group">
          <div class="tolerance-axis-item">
            <label for="tolerance-attribute-numeric">しきい値:</label>
            <input type="number" id="tolerance-attribute-numeric" class="tolerance-input"
                   min="0" max="1" step="0.0001" value="${DEFAULT_TOLERANCE_CONFIG.attributeNumericTolerance}" />
            <span class="tolerance-unit"></span>
          </div>
        </div>
      </div>

      <!-- 厳密モード -->
      <div class="tolerance-section">
        <label class="tolerance-checkbox-label">
          <input type="checkbox" id="tolerance-strict-mode" />
          完全一致モード（許容差を無視）
        </label>
      </div>

      <!-- 適用ボタン -->
      <div class="tolerance-actions">
        <button id="tolerance-apply-btn" class="btn btn-primary">
          ✓ 設定を適用
        </button>
        <button id="tolerance-reset-btn" class="btn btn-secondary">
          🔄 デフォルトに戻す
        </button>
      </div>
    </div>
  `;
}

/**
 * 許容差設定パネルのスタイルを追加
 */
function injectToleranceStyles() {
  const styleId = 'tolerance-settings-styles';
  if (document.getElementById(styleId)) {
    return; // 既に追加済み
  }

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .tolerance-settings-container {
      padding: 0;
    }

    .tolerance-section {
      margin-bottom: 16px;
    }

    .tolerance-section-title {
      margin: 0 0 8px 0;
      font-size: var(--font-size-base);
      color: #343a40;
      font-weight: var(--font-weight-semibold);
    }

    .tolerance-subsection-title {
      margin: 0 0 8px 0;
      font-size: var(--font-size-sm);
      color: #495057;
      font-weight: var(--font-weight-semibold);
    }

    .tolerance-description {
      font-size: var(--font-size-sm);
      color: #666;
      margin: 0 0 10px 0;
      line-height: 1.4;
    }

    .tolerance-checkbox-label {
      display: flex;
      align-items: center;
      font-size: var(--font-size-sm);
      cursor: pointer;
    }

    .tolerance-checkbox-label input[type="checkbox"] {
      margin-right: 8px;
      cursor: pointer;
    }

    .tolerance-axis-group {
      background: #f8f9fa;
      padding: 12px;
      border-radius: 4px;
      border: 1px solid #dee2e6;
    }

    .tolerance-axis-item {
      display: flex;
      align-items: center;
      margin-bottom: 8px;
      gap: 8px;
    }

    .tolerance-axis-item:last-child {
      margin-bottom: 0;
    }

    .tolerance-axis-item label {
      min-width: 40px;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      color: #495057;
    }

    .tolerance-input {
      flex: 1;
      padding: 4px 8px;
      border: 1px solid #ced4da;
      border-radius: 3px;
      font-size: var(--font-size-sm);
      width: 80px;
    }

    .tolerance-input:focus {
      outline: none;
      border-color: #007bff;
      box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
    }

    .tolerance-unit {
      font-size: var(--font-size-sm);
      color: #6c757d;
      min-width: 30px;
    }

    .tolerance-actions {
      display: flex;
      gap: 8px;
      margin-top: 16px;
    }

    .tolerance-actions .btn {
      flex: 1;
      padding: 8px 12px;
      font-size: var(--font-size-sm);
      border-radius: 4px;
      cursor: pointer;
      border: none;
      transition: all 0.2s ease;
    }

    .tolerance-actions .btn-primary {
      background: #007bff;
      color: white;
    }

    .tolerance-actions .btn-primary:hover {
      background: #0056b3;
    }

    .tolerance-actions .btn-secondary {
      background: #6c757d;
      color: white;
    }

    .tolerance-actions .btn-secondary:hover {
      background: #545b62;
    }
  `;
  document.head.appendChild(style);
}

/**
 * 許容差設定パネルを初期化
 * @param {HTMLElement} container - パネルを挿入するコンテナー要素
 */
export function initializeToleranceSettings(container) {
  logger.info('Initializing tolerance settings panel');

  // スタイルを追加
  injectToleranceStyles();

  // HTMLを挿入
  container.innerHTML = createToleranceSettingsHTML();

  // LocalStorageから保存済み設定を復元
  const savedConfig = storageHelper.get(STORAGE_KEY);
  if (savedConfig) {
    setToleranceConfig(savedConfig);
  }

  // 現在の設定値を読み込んでUIに反映
  loadSettingsToUI();

  // イベントリスナーを設定
  setupEventListeners();

  logger.info('Tolerance settings panel initialized');
}

/**
 * 現在の設定値をUIに反映
 */
function loadSettingsToUI() {
  const config = getToleranceConfig();

  // 有効化フラグ
  document.getElementById('tolerance-enabled').checked = config.enabled;

  // 基準点許容差
  document.getElementById('tolerance-basepoint-x').value = config.basePoint.x;
  document.getElementById('tolerance-basepoint-y').value = config.basePoint.y;
  document.getElementById('tolerance-basepoint-z').value = config.basePoint.z;

  // オフセット許容差
  document.getElementById('tolerance-offset-x').value = config.offset.x;
  document.getElementById('tolerance-offset-y').value = config.offset.y;
  document.getElementById('tolerance-offset-z').value = config.offset.z;

  // 属性値数値しきい値
  document.getElementById('tolerance-attribute-numeric').value = config.attributeNumericTolerance;

  // 厳密モード
  document.getElementById('tolerance-strict-mode').checked = config.strictMode;

  // 厳密モードが有効な場合は許容差入力を無効化
  updateInputStates();

  logger.debug('Settings loaded to UI', config);
}

/**
 * UIから設定値を読み取って適用
 */
function applySettingsFromUI() {
  const enabled = document.getElementById('tolerance-enabled').checked;
  const strictMode = document.getElementById('tolerance-strict-mode').checked;

  const newConfig = {
    enabled,
    strictMode,
    basePoint: {
      x: parseFloat(document.getElementById('tolerance-basepoint-x').value),
      y: parseFloat(document.getElementById('tolerance-basepoint-y').value),
      z: parseFloat(document.getElementById('tolerance-basepoint-z').value),
    },
    offset: {
      x: parseFloat(document.getElementById('tolerance-offset-x').value),
      y: parseFloat(document.getElementById('tolerance-offset-y').value),
      z: parseFloat(document.getElementById('tolerance-offset-z').value),
    },
    attributeNumericTolerance: parseFloat(
      document.getElementById('tolerance-attribute-numeric').value,
    ),
  };

  // 設定を適用
  setToleranceConfig(newConfig);
  storageHelper.set(STORAGE_KEY, getToleranceConfig());

  logger.info('Tolerance settings applied', newConfig);

  // 設定適用後のコールバックを実行（eventBus経由で再比較など）
  eventBus.emit(SettingsEvents.CHANGED, { type: 'tolerance', config: newConfig });

  // 通知
  showNotification('✓ 許容差設定を適用しました', 'success');
}

/**
 * デフォルト設定にリセット
 */
function resetToDefaults() {
  resetToleranceConfig();
  const config = getToleranceConfig();
  storageHelper.set(STORAGE_KEY, config);
  loadSettingsToUI();
  logger.info('Settings reset to defaults');

  // リセット後も再比較を実行（eventBus経由）
  eventBus.emit(SettingsEvents.CHANGED, { type: 'tolerance', config });

  showNotification('🔄 デフォルト設定に戻しました', 'info');
}

/**
 * 入力フィールドの有効/無効を更新
 */
function updateInputStates() {
  const enabled = document.getElementById('tolerance-enabled').checked;
  const strictMode = document.getElementById('tolerance-strict-mode').checked;

  // 許容差が無効、または厳密モードが有効な場合は入力を無効化
  const disabled = !enabled || strictMode;

  // すべての許容差入力フィールドを取得
  const inputs = [
    'tolerance-basepoint-x',
    'tolerance-basepoint-y',
    'tolerance-basepoint-z',
    'tolerance-offset-x',
    'tolerance-offset-y',
    'tolerance-offset-z',
    'tolerance-attribute-numeric',
  ];

  inputs.forEach((id) => {
    const input = document.getElementById(id);
    if (input) {
      input.disabled = disabled;
      input.style.opacity = disabled ? '0.5' : '1';
    }
  });

  // 厳密モードチェックボックスも許容差が無効なら無効化
  const strictModeCheckbox = document.getElementById('tolerance-strict-mode');
  if (strictModeCheckbox) {
    strictModeCheckbox.disabled = !enabled;
    strictModeCheckbox.parentElement.style.opacity = enabled ? '1' : '0.5';
  }
}

/**
 * イベントリスナーを設定
 */
function setupEventListeners() {
  // 適用ボタン
  const applyBtn = document.getElementById('tolerance-apply-btn');
  if (applyBtn) {
    applyBtn.addEventListener('click', applySettingsFromUI);
  }

  // リセットボタン
  const resetBtn = document.getElementById('tolerance-reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetToDefaults);
  }

  // 有効化チェックボックス
  const enabledCheckbox = document.getElementById('tolerance-enabled');
  if (enabledCheckbox) {
    enabledCheckbox.addEventListener('change', updateInputStates);
  }

  // 厳密モードチェックボックス
  const strictModeCheckbox = document.getElementById('tolerance-strict-mode');
  if (strictModeCheckbox) {
    strictModeCheckbox.addEventListener('change', updateInputStates);
  }

  logger.debug('Event listeners set up');
}

/**
 * 通知メッセージを表示
 * @param {string} message - メッセージ
 * @param {string} type - 'success' | 'info' | 'warning' | 'error'
 */
function showNotification(message, type = 'info') {
  // 既存の通知システムがあれば利用、なければコンソールに出力
  if (window.showNotification) {
    window.showNotification(message, type);
  } else {
    logger.info(`[${type.toUpperCase()}] ${message}`);
  }
}

/**
 * グローバルに公開する関数
 */
export function getToleranceSettingsUI() {
  return {
    loadSettingsToUI,
    applySettingsFromUI,
    resetToDefaults,
  };
}

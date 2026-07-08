/**
 * 許容差設定パネルUI
 * 基準点(StbNode)・回転角・ジオメトリ中心方向の許容差を、比較キータイプごとに
 * 関連セクションを強調表示しながら設定するUIを提供
 */

import {
  getToleranceConfig,
  setToleranceConfig,
  resetToleranceConfig,
  DEFAULT_TOLERANCE_CONFIG,
} from '../../config/toleranceConfig.js';
import { COMPARISON_KEY_TYPE } from '../../config/comparisonKeyConfig.js';
import comparisonKeyManager from '../../app/comparisonKeyManager.js';
import { COMPARISON_KEY_EVENTS } from '../../constants/eventTypes.js';
import { createLogger } from '../../utils/logger.js';
import { storageHelper } from '../../utils/storageHelper.js';
import { eventBus, SettingsEvents } from '../../data/events/index.js';

const STORAGE_KEY = 'toleranceConfig';

const logger = createLogger('ToleranceSettings');

/**
 * 許容差セクションを関連付ける比較キータイプ
 * 「基準点の許容差」は位置情報系キータイプ（オフセット・回転角も内部で
 * 座標に加算されてから同じ許容差で判定されるため）に関連する。
 * 所属通芯・階ベースは階名・通芯名の文字列一致でキーを生成するため、
 * 座標許容差は使用しない。
 * 回転角許容差は「+オフセット+回転」のみ、ジオメトリ中心・方向はそのキータイプのみに関連する。
 */
const TOLERANCE_SECTION_RELEVANCE = {
  basePoint: [
    COMPARISON_KEY_TYPE.POSITION_NODE_ONLY,
    COMPARISON_KEY_TYPE.POSITION_WITH_OFFSET,
    COMPARISON_KEY_TYPE.POSITION_WITH_ROTATE,
  ],
  rotate: [COMPARISON_KEY_TYPE.POSITION_WITH_ROTATE],
  geometry: [COMPARISON_KEY_TYPE.GEOMETRY_CENTER_DIRECTION_BASED],
};

/**
 * 許容差設定パネルのHTML構造を生成
 */
function createToleranceSettingsHTML() {
  return `
    <div class="tolerance-settings-container">
      <div class="tolerance-section">
        <h4 class="tolerance-section-title">⚙️ 許容差設定</h4>
        <p class="tolerance-description">
          微小な座標誤差を許容して比較を行います。許容差は、対応付けようとする2モデルの基準点どうしの座標差に適用します。関連する許容差は、上で選択した「配置要素の対応判定基準」に応じて強調表示されます。
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
      <div class="tolerance-section" data-tolerance-relevance="basePoint">
        <h5 class="tolerance-subsection-title">📍 基準点（節点位置）の許容差</h5>
        <p class="tolerance-description">
          「節点位置」「+オフセット」「+オフセット+回転」の3方式で使用（オフセット加算後の最終座標を判定）
        </p>
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

      <!-- 回転角許容差設定 -->
      <div class="tolerance-section" data-tolerance-relevance="rotate">
        <h5 class="tolerance-subsection-title">🔄 回転角（Rotate）の許容差</h5>
        <p class="tolerance-description">
          「節点位置 + オフセット + 回転」方式でのみ使用
        </p>
        <div class="tolerance-axis-group">
          <div class="tolerance-axis-item">
            <label for="tolerance-rotate">回転角:</label>
            <input type="number" id="tolerance-rotate" class="tolerance-input"
                   min="0" max="360" step="0.1" value="${DEFAULT_TOLERANCE_CONFIG.rotate}" />
            <span class="tolerance-unit">度</span>
          </div>
        </div>
      </div>

      <!-- ジオメトリ中心・方向許容差設定 -->
      <div class="tolerance-section" data-tolerance-relevance="geometry">
        <h5 class="tolerance-subsection-title">📌 ジオメトリ中心・方向の許容差</h5>
        <p class="tolerance-description">
          「ジオメトリ中心・方向」方式でのみ使用。中心位置のズレ（XYZ）と、軸・法線方向のズレ（角度）を別々に設定
        </p>
        <div class="tolerance-axis-group">
          <div class="tolerance-axis-subgroup-title">中心位置XYZのズレ許容差</div>
          <div class="tolerance-axis-item">
            <label for="tolerance-geometry-center-x">中心X:</label>
            <input type="number" id="tolerance-geometry-center-x" class="tolerance-input"
                   min="0" max="1000" step="0.1" value="${DEFAULT_TOLERANCE_CONFIG.geometryCenter.x}" />
            <span class="tolerance-unit">mm</span>
          </div>
          <div class="tolerance-axis-item">
            <label for="tolerance-geometry-center-y">中心Y:</label>
            <input type="number" id="tolerance-geometry-center-y" class="tolerance-input"
                   min="0" max="1000" step="0.1" value="${DEFAULT_TOLERANCE_CONFIG.geometryCenter.y}" />
            <span class="tolerance-unit">mm</span>
          </div>
          <div class="tolerance-axis-item">
            <label for="tolerance-geometry-center-z">中心Z:</label>
            <input type="number" id="tolerance-geometry-center-z" class="tolerance-input"
                   min="0" max="1000" step="0.1" value="${DEFAULT_TOLERANCE_CONFIG.geometryCenter.z}" />
            <span class="tolerance-unit">mm</span>
          </div>
          <div class="tolerance-axis-subgroup-title">方向ベクトルのズレ許容差</div>
          <div class="tolerance-axis-item">
            <label for="tolerance-direction-angle">角度差:</label>
            <input type="number" id="tolerance-direction-angle" class="tolerance-input"
                   min="0" max="180" step="0.1" value="${DEFAULT_TOLERANCE_CONFIG.directionAngle}" />
            <span class="tolerance-unit">度</span>
          </div>
          <label class="tolerance-checkbox-label tolerance-inline-checkbox">
            <input type="checkbox" id="tolerance-direction-opposite" checked />
            逆方向を同一方向として扱う
          </label>
          <div class="tolerance-axis-subgroup-title">寸法差の許容差（過剰一致防止）</div>
          <div class="tolerance-axis-item">
            <label for="tolerance-geometry-length">長さ:</label>
            <input type="number" id="tolerance-geometry-length" class="tolerance-input"
                   min="0" max="10000" step="0.1" value="${DEFAULT_TOLERANCE_CONFIG.geometryLength}" />
            <span class="tolerance-unit">mm</span>
          </div>
          <div class="tolerance-axis-item">
            <label for="tolerance-geometry-area">面積:</label>
            <input type="number" id="tolerance-geometry-area" class="tolerance-input"
                   min="0" max="1000000" step="1" value="${DEFAULT_TOLERANCE_CONFIG.geometryArea}" />
            <span class="tolerance-unit">mm²</span>
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

      <!-- プリセット -->
      <div class="tolerance-section">
        <h5 class="tolerance-subsection-title">📦 プリセット</h5>
        <p class="tolerance-description">
          異ソフト間（別ソフトが出力した同一建物）の比較では、基準点・ジオメトリ中心の
          許容差を150mmへ緩和すると対応付けが改善します（検証済み・誤対応の増加なし）。
        </p>
        <div class="tolerance-actions">
          <button id="tolerance-preset-cross-btn" class="btn btn-secondary">
            ⇄ 異ソフト間（150mm）を適用
          </button>
        </div>
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

    .tolerance-inline-checkbox {
      margin-top: 8px;
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

    .tolerance-axis-subgroup-title {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      color: #6c757d;
      margin: 8px 0 4px 0;
    }

    .tolerance-axis-subgroup-title:first-child {
      margin-top: 0;
    }

    .tolerance-section[data-tolerance-relevance] {
      border-left: 3px solid transparent;
      padding-left: 8px;
      transition: border-color 0.2s ease, opacity 0.2s ease;
      opacity: 0.6;
    }

    .tolerance-section[data-tolerance-relevance].tolerance-section-relevant {
      border-left-color: #007bff;
      opacity: 1;
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

  // 回転角許容差
  const rotateElement = document.getElementById('tolerance-rotate');
  if (rotateElement) {
    rotateElement.value = config.rotate;
  }

  // ジオメトリ中心・方向許容差
  document.getElementById('tolerance-geometry-center-x').value = config.geometryCenter.x;
  document.getElementById('tolerance-geometry-center-y').value = config.geometryCenter.y;
  document.getElementById('tolerance-geometry-center-z').value = config.geometryCenter.z;
  document.getElementById('tolerance-direction-angle').value = config.directionAngle;
  document.getElementById('tolerance-geometry-length').value = config.geometryLength;
  document.getElementById('tolerance-geometry-area').value = config.geometryArea;
  document.getElementById('tolerance-direction-opposite').checked =
    config.directionOppositeEquivalent;

  // 属性値数値しきい値
  document.getElementById('tolerance-attribute-numeric').value = config.attributeNumericTolerance;

  // 厳密モード
  document.getElementById('tolerance-strict-mode').checked = config.strictMode;

  // 厳密モードが有効な場合は許容差入力を無効化
  updateInputStates();

  // 現在の比較キータイプに応じてセクションを強調表示
  updateToleranceSectionRelevance();

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
    rotate: parseFloat(document.getElementById('tolerance-rotate').value),
    geometryCenter: {
      x: parseFloat(document.getElementById('tolerance-geometry-center-x').value),
      y: parseFloat(document.getElementById('tolerance-geometry-center-y').value),
      z: parseFloat(document.getElementById('tolerance-geometry-center-z').value),
    },
    directionAngle: parseFloat(document.getElementById('tolerance-direction-angle').value),
    geometryLength: parseFloat(document.getElementById('tolerance-geometry-length').value),
    geometryArea: parseFloat(document.getElementById('tolerance-geometry-area').value),
    directionOppositeEquivalent: document.getElementById('tolerance-direction-opposite').checked,
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
 * 異ソフト間比較プリセットを適用する。
 * 基準点・ジオメトリ中心の許容差を150mmへ緩和する（他の設定は現状維持）。
 * 検証根拠: docs/reports/cross-software-match-benchmark.md（曖昧度0%・別モデル偽陽性0%）
 */
const CROSS_SOFTWARE_CENTER_TOLERANCE_MM = 150;

function applyCrossSoftwarePreset() {
  const t = CROSS_SOFTWARE_CENTER_TOLERANCE_MM;
  ['tolerance-basepoint-x', 'tolerance-basepoint-y', 'tolerance-basepoint-z'].forEach((id) => {
    document.getElementById(id).value = t;
  });
  [
    'tolerance-geometry-center-x',
    'tolerance-geometry-center-y',
    'tolerance-geometry-center-z',
  ].forEach((id) => {
    document.getElementById(id).value = t;
  });
  applySettingsFromUI();
  logger.info(`Cross-software tolerance preset applied (${t}mm)`);
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
    'tolerance-rotate',
    'tolerance-geometry-center-x',
    'tolerance-geometry-center-y',
    'tolerance-geometry-center-z',
    'tolerance-direction-angle',
    'tolerance-geometry-length',
    'tolerance-geometry-area',
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

  const directionOppositeCheckbox = document.getElementById('tolerance-direction-opposite');
  if (directionOppositeCheckbox) {
    directionOppositeCheckbox.disabled = disabled;
    directionOppositeCheckbox.parentElement.style.opacity = disabled ? '0.5' : '1';
  }
}

/**
 * 現在の比較キータイプに応じて、関連する許容差セクションを強調表示する
 */
function updateToleranceSectionRelevance() {
  const currentKeyType = comparisonKeyManager.getKeyType();

  Object.entries(TOLERANCE_SECTION_RELEVANCE).forEach(([relevanceKey, relevantKeyTypes]) => {
    const section = document.querySelector(`[data-tolerance-relevance="${relevanceKey}"]`);
    if (!section) return;
    section.classList.toggle(
      'tolerance-section-relevant',
      relevantKeyTypes.includes(currentKeyType),
    );
  });
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

  // 異ソフト間プリセットボタン
  const crossPresetBtn = document.getElementById('tolerance-preset-cross-btn');
  if (crossPresetBtn) {
    crossPresetBtn.addEventListener('click', applyCrossSoftwarePreset);
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

  // 比較キータイプ変更時に関連セクションの強調表示を更新
  document.addEventListener(COMPARISON_KEY_EVENTS.KEY_TYPE_CHANGED, () => {
    updateToleranceSectionRelevance();
  });

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

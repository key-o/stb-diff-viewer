/**
 * @fileoverview スキーマエラー表示モード
 *
 * スキーマ検証エラーを視覚的に表示する色付けモードを提供します。
 *
 * @module colorModes/schemaColorMode
 */

import * as THREE from 'three';
import { elementGroups, camera, controls, colorManager } from '../viewer/index.js';
import { DEFAULT_SCHEMA_COLORS } from '../config/colorConfig.js';
import { ELEMENT_LABELS } from '../config/elementLabels.js';
import {
  validateAndIntegrate,
  getLastValidationResult,
  getValidationStats,
  getElementsByStatus,
} from '../common-stb/validation/validationManager.js';
import { scheduleRender } from '../utils/renderScheduler.js';
import { getState } from '../app/globalState.js';
import { showColorModeStatus } from './colorModeManager.js';
import { createApplyColorMode } from './colorModeState.js';
import {
  buildSchemaKey,
  setSchemaError,
  getSchemaError,
  clearSchemaErrors,
  getSchemaErrorStats,
} from '../common-stb/validation/schemaErrorStore.js';
// フローティングウィンドウマネージャー（依存性注入で設定）
let _floatingWindowManager = null;

/**
 * フローティングウィンドウマネージャーを設定（依存性注入）
 * @param {object} manager - floatingWindowManager インスタンス
 */
export function setFloatingWindowManager(manager) {
  _floatingWindowManager = manager;
}

/**
 * スキーマ色タイプの定義
 */
const SCHEMA_COLOR_TYPES = ['valid', 'info', 'warning', 'error'];

/**
 * 単一のスキーマ色コントロールを初期化
 * @param {string} colorType - 色タイプ（valid, info, warning, error）
 */
function initializeSingleSchemaColorControl(colorType) {
  const colorInput = document.getElementById(`schema-${colorType}-color`);

  // 色変更イベントリスナーを設定
  if (colorInput) {
    colorInput.addEventListener('change', (e) => {
      colorManager.setSchemaColor(colorType, e.target.value);
      updateSchemaErrorMaterials();
      scheduleRender();
    });
  }
}

/**
 * スキーマエラー色設定UIのイベントリスナーを設定
 */
export function initializeSchemaColorControls() {
  console.log('[SchemaColorMode] initializeSchemaColorControls() called');
  // 全ての色タイプに対してコントロールを初期化
  SCHEMA_COLOR_TYPES.forEach(initializeSingleSchemaColorControl);

  // リセットボタンを追加 (ButtonManagerを使用)
  const container = document.getElementById('schema-color-settings');
  if (container) {
    // 既存のリセットボタン（デフォルト色に戻すボタン）があるかチェック
    const existingResetButton = container.querySelector('button.btn-reset');
    if (!existingResetButton) {
      const resetButton = document.createElement('button');
      resetButton.type = 'button';
      resetButton.className = 'btn-reset';
      resetButton.textContent = 'デフォルト色に戻す';
      resetButton.setAttribute('aria-label', 'スキーマ色をデフォルトに戻す');
      resetButton.title = 'スキーマエラー色をデフォルト設定に戻します';
      resetButton.style.marginTop = '10px';
      resetButton.style.width = '100%';
      resetButton.addEventListener('click', () => resetSchemaColors());
      container.appendChild(resetButton);
    }
  }

  // リスト表示ボタンのイベントリスナーを設定
  initializeSchemaListButtons();
}

/**
 * スキーマエラーリスト表示ボタンの初期化
 */
function initializeSchemaListButtons() {
  console.log('[SchemaColorMode] initializeSchemaListButtons() called');
  const statusTypes = ['info', 'warning', 'error'];

  statusTypes.forEach((status) => {
    const btn = document.getElementById(`schema-${status}-list-btn`);
    if (btn) {
      btn.addEventListener('click', () => {
        console.log(`[SchemaColorMode] List button clicked for status: ${status}`);
        showSchemaErrorListModal(status);
      });
    } else {
      console.warn(`[SchemaColorMode] Button not found: schema-${status}-list-btn`);
    }
  });

  // フローティングウィンドウとして登録
  _floatingWindowManager?.registerWindow({
    windowId: 'schema-error-list-float',
    closeButtonId: 'close-schema-error-list-btn',
    headerId: 'schema-error-list-header',
    draggable: true,
    autoShow: false,
  });

  // Escキーで閉じる
  document.addEventListener('keydown', (e) => {
    const floatWindow = document.getElementById('schema-error-list-float');
    if (e.key === 'Escape' && floatWindow && floatWindow.classList.contains('visible')) {
      hideSchemaErrorListModal();
    }
  });
}

/**
 * スキーマエラー要素リストフローティングウィンドウを表示
 * @param {string} status - ステータス ('info', 'warning', 'error')
 */
function showSchemaErrorListModal(status) {
  const floatWindow = document.getElementById('schema-error-list-float');
  const title = document.getElementById('schema-list-modal-title');
  const container = document.getElementById('schema-list-container');

  if (!floatWindow || !container) {
    console.error('[SchemaColorMode] Float window elements not found:', {
      floatWindow: floatWindow ? 'found' : 'missing',
      container: container ? 'found' : 'missing',
    });
    return;
  }

  // タイトルを設定
  const statusLabels = {
    info: '自動修復が必要な要素',
    warning: '要確認の要素',
    error: '手動修正が必要な要素',
  };
  if (title) {
    title.textContent = statusLabels[status] || '要素リスト';
  }

  // 要素リストを取得
  const elements = getElementsByStatus(status);

  // リストをクリア
  container.innerHTML = '';

  if (elements.length === 0) {
    container.innerHTML = '<div class="schema-list-empty">該当する要素はありません</div>';
  } else {
    // 要素リストを生成
    elements.forEach((element) => {
      const item = createSchemaListItem(element, status);
      container.appendChild(item);
    });
  }

  // フローティングウィンドウを表示
  _floatingWindowManager?.showWindow('schema-error-list-float');
  console.log('[SchemaColorMode] Float window displayed for status:', status);
}

/**
 * スキーマエラー要素リストフローティングウィンドウを非表示
 */
function hideSchemaErrorListModal() {
  _floatingWindowManager?.hideWindow('schema-error-list-float');
}

/**
 * スキーマエラーリストアイテムを作成
 * @param {Object} element - 要素情報
 * @param {string} status - ステータス
 * @returns {HTMLElement} リストアイテム要素
 */
function createSchemaListItem(element, status) {
  const item = document.createElement('div');
  item.className = `schema-list-item status-${status}`;
  item.dataset.elementId = element.elementId;
  item.dataset.elementType = element.elementType;

  // 要素タイプの日本語ラベルを取得
  const typeLabel = ELEMENT_LABELS[element.elementType] || element.elementType;

  // ヘッダー部分
  const header = document.createElement('div');
  header.className = 'schema-list-item-header';
  header.innerHTML = `
    <span class="schema-list-item-type">${typeLabel}</span>
    <span class="schema-list-item-id">ID: ${element.elementId}</span>
  `;
  item.appendChild(header);

  // メッセージ部分
  if (element.messages && element.messages.length > 0) {
    const messages = document.createElement('div');
    messages.className = 'schema-list-item-messages';
    element.messages.slice(0, 3).forEach((msg) => {
      const msgEl = document.createElement('div');
      msgEl.className = 'schema-list-item-message';
      msgEl.textContent = msg;
      messages.appendChild(msgEl);
    });
    if (element.messages.length > 3) {
      const moreEl = document.createElement('div');
      moreEl.className = 'schema-list-item-message';
      moreEl.textContent = `...他 ${element.messages.length - 3} 件`;
      moreEl.style.fontStyle = 'italic';
      messages.appendChild(moreEl);
    }
    item.appendChild(messages);
  }

  // クリックイベント：要素を3Dビューでフォーカス
  item.addEventListener('click', () => {
    focusOnSchemaErrorElement(element.elementId, element.elementType);
  });

  return item;
}

/**
 * セクション型から要素型へのマッピング
 */
const SECTION_TO_ELEMENT_TYPE = {
  slabSections: 'Slab',
  wallSections: 'Wall',
  parapetSections: 'Parapet',
  columnSections: 'Column',
  postSections: 'Post',
  girderSections: 'Girder',
  beamSections: 'Beam',
  braceSections: 'Brace',
  pileSections: 'Pile',
  footingSections: 'Footing',
  foundationColumnSections: 'FoundationColumn',
  stripFootingSections: 'StripFooting',
};

/**
 * 要素タイプがセクション型かどうかを判定
 * @param {string} elementType - 要素タイプ
 * @returns {boolean} セクション型の場合true
 */
function isSectionType(elementType) {
  return elementType && elementType.toLowerCase().endsWith('sections');
}

/**
 * スキーマエラー要素を3Dビューでフォーカス
 * @param {string} elementId - 要素IDまたは断面ID
 * @param {string} elementType - 要素タイプまたはセクション型
 */
function focusOnSchemaErrorElement(elementId, elementType) {
  let targetObject = null;

  // 断面エラーか要素エラーかを判定
  const isSectionError = isSectionType(elementType);

  // セクション型から要素型へのマッピングを適用
  const actualElementType = SECTION_TO_ELEMENT_TYPE[elementType] || elementType;

  // elementGroupsから該当する要素タイプのグループを取得
  const elementTypeGroup = elementGroups[actualElementType];
  if (elementTypeGroup) {
    elementTypeGroup.traverse((child) => {
      // 既に見つかった場合はスキップ
      if (targetObject) return;

      if (isSectionError) {
        // 断面エラーの場合: sectionIdで検索
        if (child.userData?.sectionId === elementId) {
          targetObject = child;
        }
      } else {
        // 要素エラーの場合: elementIdで検索
        if (child.userData?.elementId === elementId) {
          targetObject = child;
        }
      }
    });
  }

  if (targetObject) {
    // 要素を選択
    import('../interaction.js').then(({ selectElement3D }) => {
      selectElement3D(targetObject, scheduleRender);
    });

    // カメラをフォーカス
    focusCameraOnElement(targetObject);

    // モーダルを閉じる
    hideSchemaErrorListModal();
  } else {
    const searchField = isSectionError ? 'sectionId' : 'elementId';
    console.warn(
      `[SchemaErrorList] Element not found: ${elementType} → ${actualElementType}, ${elementId} (by ${searchField})`,
    );
  }
}

/**
 * カメラを要素にフォーカス
 * @param {THREE.Object3D} object - 対象オブジェクト
 */
function focusCameraOnElement(object) {
  if (!camera || !controls) return;

  // バウンディングボックスを計算
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  // コントロールのターゲットを更新
  controls.target.copy(center);

  // カメラ位置を調整（適度な距離から見る）
  const distance = maxDim * 3;
  const direction = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  camera.position.copy(center).add(direction.multiplyScalar(distance));

  controls.update();
  scheduleRender();
}

/**
 * スキーマエラー用マテリアルを更新
 */
function updateSchemaErrorMaterials() {
  // ColorManagerのキャッシュをクリアして再生成を促す
  colorManager.clearMaterialCache();
}

/**
 * スキーマエラー色設定をデフォルトにリセット
 */
export function resetSchemaColors() {
  // ColorManagerを使用して色をリセット
  colorManager.setSchemaColor('valid', DEFAULT_SCHEMA_COLORS.valid);
  colorManager.setSchemaColor('info', DEFAULT_SCHEMA_COLORS.info);
  colorManager.setSchemaColor('warning', DEFAULT_SCHEMA_COLORS.warning);
  colorManager.setSchemaColor('error', DEFAULT_SCHEMA_COLORS.error);

  // UIの色設定コントロールを更新
  const updateColorInput = (id, color) => {
    const input = document.getElementById(id);
    const preview = document.getElementById(id.replace('-color', '-preview'));
    if (input) input.value = color;
    if (preview) {
      preview.style.backgroundColor = color;
      preview.title = `現在の色: ${color}`;
    }
  };

  updateColorInput('schema-valid-color', DEFAULT_SCHEMA_COLORS.valid);
  updateColorInput('schema-info-color', DEFAULT_SCHEMA_COLORS.info);
  updateColorInput('schema-warning-color', DEFAULT_SCHEMA_COLORS.warning);
  updateColorInput('schema-error-color', DEFAULT_SCHEMA_COLORS.error);

  // スキーマエラーモードが有効な場合は即座に適用
  import('./index.js').then(({ getCurrentColorMode, COLOR_MODES, updateElementsForColorMode }) => {
    if (getCurrentColorMode() === COLOR_MODES.SCHEMA) {
      updateSchemaErrorMaterials();
      updateElementsForColorMode();
    }
  });
}

/** 全要素にスキーマエラー色分けを適用 */
export const applySchemaColorModeToAll = createApplyColorMode('SchemaColorMode');

/**
 * スキーマモード用バリデーション実行
 * docA/docB 両方を検証し、結果をモデルソース付きキーで保存する。
 */
export function runValidationForSchemaMode() {
  // 読み込まれているドキュメントを取得
  const docA = getState('models.documentA');
  const docB = getState('models.documentB');

  if (!docA && !docB) {
    console.warn('[ColorMode] No documents loaded for validation');
    // デモエラーをフォールバックとして設定
    setDemoSchemaErrors();
    return;
  }

  // モデルAをバリデーション
  if (docA) {
    validateAndIntegrate(docA, 'A');
  }

  // モデルBも検証（docAの有無に関わらず）
  if (docB) {
    validateAndIntegrate(docB, 'B');
  }

  // バリデーションサマリーをステータスバーに表示
  const lastResult = getLastValidationResult();
  if (lastResult) {
    const errorCount = lastResult.issues.filter((i) => i.severity === 'error').length;
    const warningCount = lastResult.issues.filter((i) => i.severity === 'warning').length;
    showColorModeStatus(`バリデーション完了: エラー ${errorCount}件, 警告 ${warningCount}件`, 5000);

    // 統計UIを更新
    updateSchemaStatsUI();
  }
}

/**
 * スキーマ検証統計UIを更新
 */
function updateSchemaStatsUI() {
  const stats = getValidationStats();

  // 全要素数を計算
  let totalElements = 0;
  const groups = Object.values(elementGroups);
  groups.forEach((group) => {
    group.traverse((object) => {
      if (object.isMesh && object.userData && object.userData.elementId) {
        totalElements++;
      }
    });
  });

  // 正常要素数を計算
  const validCount = Math.max(0, totalElements - (stats.info + stats.warning + stats.error));

  const validCountEl = document.getElementById('schema-valid-count');
  const infoCountEl = document.getElementById('schema-info-count');
  const warningCountEl = document.getElementById('schema-warning-count');
  const errorCountEl = document.getElementById('schema-error-count');

  if (validCountEl) validCountEl.textContent = validCount;
  if (infoCountEl) infoCountEl.textContent = stats.info;
  if (warningCountEl) warningCountEl.textContent = stats.warning;
  if (errorCountEl) errorCountEl.textContent = stats.error;
}

// Re-export schema error store functions for backward compatibility
export { buildSchemaKey, setSchemaError, getSchemaError, clearSchemaErrors, getSchemaErrorStats };

/**
 * デモ用スキーマエラー設定関数
 */
export function setDemoSchemaErrors() {
  setSchemaError('C1', 'error', ['断面サイズが規定外']);
  setSchemaError('G1', 'error', ['材料強度不明']);
  setSchemaError('B3', 'valid', []);
  setSchemaError('S1', 'valid', []);
  setSchemaError('W1', 'error', ['厚み設定エラー']);
}

/**
 * スキーマ色設定の取得
 * @returns {Object} スキーマステータスと色のマッピング
 */
export function getSchemaColors() {
  return {
    valid: colorManager.getSchemaColor('valid'),
    info: colorManager.getSchemaColor('info'),
    warning: colorManager.getSchemaColor('warning'),
    error: colorManager.getSchemaColor('error'),
  };
}

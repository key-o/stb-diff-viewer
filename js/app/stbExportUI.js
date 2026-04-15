/**
 * @fileoverview STB→DXFエクスポートUI
 *
 * STBモデルからDXFファイルへのエクスポートに関するUI操作を管理します。
 */

import { createLogger } from '../utils/logger.js';
import {
  canExportStbToDxf,
  exportStbToDxf,
  getStbExportStats,
} from '../export/dxf/stb-to-dxf/index.js';
import { DEFAULT_ELEMENT_COLORS } from '../config/colorConfig.js';
import { ELEMENT_LABELS } from '../config/elementLabels.js';
import { showWarning } from './dxfLoaderHelpers.js';
import {
  initBatchExportButtons,
  updateBatchExportButtons,
  setSelectedStbExportTypesGetter,
} from './batchExportUI.js';

const log = createLogger('DXFLoader');

// STBエクスポート用に選択された要素タイプ
const selectedStbExportTypes = new Set();

// 要素タイプの日本語名と色（SSOT: elementLabels.js, colorConfig.js）
const ELEMENT_TYPE_INFO = Object.fromEntries(
  Object.keys(DEFAULT_ELEMENT_COLORS).map((type) => [
    type,
    { name: ELEMENT_LABELS[type] || type, color: DEFAULT_ELEMENT_COLORS[type] },
  ]),
);

/**
 * 選択されたSTBエクスポート要素タイプの配列を取得
 * @returns {Array<string>} 選択された要素タイプの配列
 */
export function getSelectedStbExportTypes() {
  return Array.from(selectedStbExportTypes);
}

/**
 * STBエクスポートの状態を更新
 */
export function updateStbExportStatus() {
  const statusEl = document.getElementById('stb-export-status');
  const statusTextEl = document.getElementById('stb-export-status-text');
  const elementSelectEl = document.getElementById('stb-export-element-select');
  const statsEl = document.getElementById('stb-export-stats');
  const filenameGroupEl = document.getElementById('stb-export-filename-group');
  const exportBtn = document.getElementById('exportStbDxfButton');

  if (!statusEl || !statusTextEl) return;

  const { canExport, reason, solidElementTypes } = canExportStbToDxf();

  if (canExport) {
    statusEl.className = 'stb-export-status status-ready';
    statusTextEl.textContent = `エクスポート可能: ${solidElementTypes.length}種類の部材`;

    // 要素選択UIを表示
    if (elementSelectEl) elementSelectEl.classList.remove('hidden');
    if (statsEl) statsEl.classList.remove('hidden');
    if (filenameGroupEl) filenameGroupEl.classList.remove('hidden');

    // 要素タイプリストを更新
    updateStbExportTypeList(solidElementTypes);

    // エクスポートボタンを有効化
    if (exportBtn) exportBtn.disabled = false;
  } else {
    statusEl.className = 'stb-export-status status-not-ready';
    statusTextEl.textContent = reason;

    // UIを非表示
    if (elementSelectEl) elementSelectEl.classList.add('hidden');
    if (statsEl) statsEl.classList.add('hidden');
    if (filenameGroupEl) filenameGroupEl.classList.add('hidden');

    // エクスポートボタンを無効化
    if (exportBtn) exportBtn.disabled = true;
  }

  // 連続出力ボタンの状態を更新
  updateBatchExportButtons();
}

/**
 * STBエクスポート要素タイプリストを更新
 * @param {Array<string>} availableTypes - 利用可能な要素タイプ
 */
function updateStbExportTypeList(availableTypes) {
  const listContainer = document.getElementById('stb-export-type-list');
  if (!listContainer) return;

  listContainer.innerHTML = '';
  selectedStbExportTypes.clear();

  // メッシュ数を取得
  const stats = getStbExportStats(availableTypes);

  for (const type of availableTypes) {
    const info = ELEMENT_TYPE_INFO[type] || { name: type, color: '#ffffff' };
    const meshCount = stats.byElementType[type] || 0;

    const item = document.createElement('label');
    item.className = 'stb-export-type-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.dataset.elementType = type;
    selectedStbExportTypes.add(type);

    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedStbExportTypes.add(type);
      } else {
        selectedStbExportTypes.delete(type);
      }
      updateStbExportStats();
    });

    const colorBox = document.createElement('span');
    colorBox.className = 'type-color';
    colorBox.style.backgroundColor = info.color;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'type-name';
    nameSpan.textContent = info.name;

    const countSpan = document.createElement('span');
    countSpan.className = 'type-count';
    countSpan.textContent = `(${meshCount}メッシュ)`;

    item.appendChild(checkbox);
    item.appendChild(colorBox);
    item.appendChild(nameSpan);
    item.appendChild(countSpan);
    listContainer.appendChild(item);
  }

  updateStbExportStats();
}

/**
 * STBエクスポート統計を更新
 */
function updateStbExportStats() {
  const statsEl = document.getElementById('stb-export-mesh-count');
  const exportBtn = document.getElementById('exportStbDxfButton');
  if (!statsEl) return;

  const selectedTypes = Array.from(selectedStbExportTypes);
  const stats = getStbExportStats(selectedTypes);

  statsEl.textContent = `選択: ${stats.totalMeshes} メッシュ`;

  // エクスポートボタンの有効/無効
  if (exportBtn) {
    exportBtn.disabled = stats.totalMeshes === 0;
  }
}

/**
 * STB→DXFエクスポートを実行
 */
function handleExportStbDxf() {
  const selectedTypes = Array.from(selectedStbExportTypes);
  if (selectedTypes.length === 0) {
    showWarning('エクスポートする部材を選択してください');
    return;
  }

  const filenameInput = document.getElementById('stbDxfExportFilename');
  const filename = filenameInput?.value?.trim() || 'stb_export';

  const success = exportStbToDxf(selectedTypes, filename);
  if (success) {
    log.info('STB→DXFエクスポート成功:', filename);
  }
}

/**
 * STBエクスポートUIを初期化
 */
export function initStbExportUI() {
  // 全選択ボタン
  const selectAllBtn = document.getElementById('selectAllStbExportTypes');
  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', () => {
      const checkboxes = document.querySelectorAll('#stb-export-type-list input[type="checkbox"]');
      checkboxes.forEach((cb) => {
        cb.checked = true;
        selectedStbExportTypes.add(cb.dataset.elementType);
      });
      updateStbExportStats();
    });
  }

  // 全解除ボタン
  const deselectAllBtn = document.getElementById('deselectAllStbExportTypes');
  if (deselectAllBtn) {
    deselectAllBtn.addEventListener('click', () => {
      const checkboxes = document.querySelectorAll('#stb-export-type-list input[type="checkbox"]');
      checkboxes.forEach((cb) => {
        cb.checked = false;
        selectedStbExportTypes.delete(cb.dataset.elementType);
      });
      updateStbExportStats();
    });
  }

  // エクスポートボタン
  const exportBtn = document.getElementById('exportStbDxfButton');
  if (exportBtn) {
    exportBtn.addEventListener('click', handleExportStbDxf);
  }

  // バッチエクスポートに選択タイプ取得関数を設定（循環依存回避）
  setSelectedStbExportTypesGetter(getSelectedStbExportTypes);

  // 連続出力ボタンを初期化
  initBatchExportButtons();

  // 初期状態を更新
  updateStbExportStatus();

  log.info('STBエクスポートUI初期化完了');
}

/**
 * STBエクスポートパネルの表示/非表示を切り替え
 * @param {boolean} show - 表示するかどうか
 */
export function setStbExportPanelVisibility(show) {
  const panel = document.getElementById('stb-dxf-export-panel');
  if (panel) {
    if (show) {
      panel.classList.remove('hidden');
      updateStbExportStatus();
    } else {
      panel.classList.add('hidden');
    }
  }
}

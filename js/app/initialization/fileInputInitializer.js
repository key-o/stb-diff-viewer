/**
 * 比較対象ファイル入力の初期化
 */

import { createLogger } from '../../utils/logger.js';
import { t } from '../../config/i18n.js';
import { getAcceptAttribute, getEnabledFileTypes } from '../../config/fileTypeConfig.js';

const log = createLogger('app:initialization:fileInputInitializer');

/** ドロップ案内に表示するファイルタイプ別ラベル（有効なタイプのみ列挙） */
const DROP_HINT_LABELS = {
  stb: 'STB',
  ifc: 'IFC',
  ss7: 'SS7 / CSV',
};

/**
 * 有効なファイルタイプに応じて accept 属性・ドロップ案内を同期する。
 * SS7 等の無効な形式は featureFlags 経由で fileTypeConfig から外れるため、
 * 公開ビルドでは自動的に UI から除外される。
 */
function applyEnabledFileTypesUi() {
  const accept = getAcceptAttribute();
  for (const id of ['fileA', 'fileB']) {
    const input = document.getElementById(id);
    if (input) {
      input.accept = accept;
    }
  }

  const dropHint = document.querySelector('#canvas-drop-hint .canvas-drop-hint-sub');
  if (dropHint) {
    const labels = getEnabledFileTypes()
      .map((ft) => DROP_HINT_LABELS[ft.id])
      .filter(Boolean)
      .join(' / ');
    dropHint.textContent = `${labels} をここにドロップ。2ファイルならモデルA/Bとして比較します。`;
  }
}

function updateCompareButtonLabel() {
  const compareButton = document.getElementById('compareButton');
  const inputA = document.getElementById('fileA');
  const inputB = document.getElementById('fileB');

  if (!compareButton || !inputA || !inputB) {
    return;
  }

  const hasA = inputA.files && inputA.files.length > 0;
  const hasB = inputB.files && inputB.files.length > 0;

  if (hasA && hasB) {
    compareButton.textContent = t('app.compare.execute');
    return;
  }

  if (hasA || hasB) {
    compareButton.textContent = t('app.compare.loadModel');
    return;
  }

  compareButton.textContent = t('app.compare.loadOrCompare');
}

function wire(targetId, suffix) {
  const btn = document.querySelector(`.custom-file-btn[data-target="${targetId}"]`);
  const input = document.getElementById(targetId);
  const fileSuffix = suffix || targetId.replace(/^file/i, '');
  const nameEl = document.getElementById(`fileName${fileSuffix}`);
  const wrapper = document.getElementById(`wrapper${fileSuffix}`);

  if (!btn || !input) {
    return;
  }

  btn.addEventListener('click', () => {
    input.click();
  });

  input.addEventListener('change', () => {
    const file = input.files && input.files[0];

    if (file) {
      if (nameEl) {
        nameEl.textContent = file.name;
        nameEl.title = file.name;
      }
      btn.classList.add('has-file');
      if (wrapper) {
        wrapper.classList.add('has-file');
      }
    } else if (nameEl) {
      nameEl.textContent = t('file.unselected');
      nameEl.title = '';
      btn.classList.remove('has-file');
      if (wrapper) {
        wrapper.classList.remove('has-file');
      }
    }

    updateCompareButtonLabel();
  });
}

/**
 * 比較用ファイル入力の初期化を実行します。
 */
export function initializeCompareFileInputs() {
  log.info('比較用ファイル入力の初期化を開始します');

  applyEnabledFileTypesUi();
  wire('fileA', 'A');
  wire('fileB', 'B');

  // 歴史的に呼び出し元が前提としていたため暫定互換として残す
  window.updateCompareButtonLabel = updateCompareButtonLabel;

  updateCompareButtonLabel();
}

export { updateCompareButtonLabel };

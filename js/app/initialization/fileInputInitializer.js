/**
 * 比較対象ファイル入力の初期化
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('app:initialization:fileInputInitializer');

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
    compareButton.textContent = '🔍 比較実行';
    return;
  }

  if (hasA || hasB) {
    compareButton.textContent = '🔍 モデル読込';
    return;
  }

  compareButton.textContent = '🔍 読込 / 比較実行';
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
      nameEl.textContent = '未選択';
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

  wire('fileA', 'A');
  wire('fileB', 'B');

  // 歴史的に呼び出し元が前提としていたため暫定互換として残す
  window.updateCompareButtonLabel = updateCompareButtonLabel;

  updateCompareButtonLabel();
}

export { updateCompareButtonLabel };

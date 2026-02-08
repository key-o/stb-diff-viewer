/**
 * @fileoverview STBエクスポートハンドラー
 *
 * STBファイルのエクスポート機能を処理します。
 *
 * @module ui/events/exportHandlers/stbExportHandler
 */

import { showError, showWarning } from '../../common/toast.js';

/**
 * Setup STB export button listener
 */
export function setupStbExportListener() {
  const exportStbBtn = document.getElementById('exportStbBtn');

  if (exportStbBtn) {
    exportStbBtn.addEventListener('click', handleStbExport);
  }
}

/**
 * Handle STB export button click
 */
async function handleStbExport() {
  const exportStbBtn = document.getElementById('exportStbBtn');
  const versionSelect = document.getElementById('stbExportVersion');
  const targetSelect = document.getElementById('stbExportTarget');
  const filenameInput = document.getElementById('stbExportFilename');

  try {
    if (exportStbBtn) {
      exportStbBtn.disabled = true;
      exportStbBtn.textContent = '⏳ 出力中...';
    }

    const targetVersion = versionSelect?.value || '2.1.0';
    const targetModel = targetSelect?.value || 'auto';

    const { getState } = await import('../../../app/globalState.js');
    const { exportStbDocument } = await import('../../../export/stb/stbExporter.js');

    const docA = getState('models.documentA');
    const docB = getState('models.documentB');
    const fileA = getState('files.originalFileA');
    const fileB = getState('files.originalFileB');

    let sourceDoc = null;
    let sourceFile = null;

    if (targetModel === 'A') {
      sourceDoc = docA;
      sourceFile = fileA;
    } else if (targetModel === 'B') {
      sourceDoc = docB;
      sourceFile = fileB;
    } else {
      sourceDoc = docB || docA;
      sourceFile = fileB || fileA;
    }

    if (!sourceDoc) {
      showWarning('出力するモデルが読み込まれていません。');
      return;
    }

    let filename = filenameInput?.value?.trim();
    if (!filename) {
      if (sourceFile?.name) {
        filename = sourceFile.name.replace(/\.stb$/i, '');
      } else {
        filename = 'stb_export';
      }
    }

    filename = filename.endsWith('.stb') ? filename : `${filename}.stb`;

    exportStbDocument(sourceDoc, { filename, targetVersion });
  } catch (error) {
    console.error('STB出力エラー:', error);
    showError(`STB出力に失敗しました: ${error.message}`);
  } finally {
    if (exportStbBtn) {
      exportStbBtn.disabled = false;
      exportStbBtn.textContent = '📦 STBファイルを出力';
    }
  }
}

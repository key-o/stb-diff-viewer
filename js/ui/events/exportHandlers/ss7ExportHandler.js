/**
 * @fileoverview SS7 CSVエクスポートハンドラー
 *
 * SS7形式CSVファイルのエクスポート機能を処理します。
 *
 * @module ui/events/exportHandlers/ss7ExportHandler
 */

import { showError, showWarning, showSuccess } from '../../common/toast.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('ui:events:exportHandlers:ss7ExportHandler');

/**
 * SS7エクスポートボタンのイベントリスナーを設定する
 */
export function setupSs7ExportListener() {
  const exportSs7Btn = document.getElementById('exportSs7Btn');
  if (exportSs7Btn) {
    exportSs7Btn.addEventListener('click', handleSs7Export);
  }
}

/**
 * SS7エクスポートボタンのクリック処理
 */
async function handleSs7Export() {
  const exportSs7Btn = document.getElementById('exportSs7Btn');

  try {
    if (exportSs7Btn) {
      exportSs7Btn.disabled = true;
      exportSs7Btn.textContent = '📊 変換中...';
    }

    const { getState } = await import('../../../data/state/globalState.js');
    const modelADocument = getState('models.documentA');
    const modelBDocument = getState('models.documentB');
    const xmlDoc = modelADocument || modelBDocument;

    if (!xmlDoc) {
      showWarning('モデルが読み込まれていません。STBファイルを読み込んでください。');
      return;
    }

    const { downloadStbAsSs7Csv } = await import('../../../export/ss7/index.js');

    const originalFileA = getState('files.originalFileA');
    const originalFileB = getState('files.originalFileB');
    const originalFile = originalFileA || originalFileB;

    let filename;
    if (originalFile?.name) {
      filename = originalFile.name.replace(/\.(stb|xml)$/i, '_ss7.csv');
      if (!filename.endsWith('.csv')) filename += '_ss7.csv';
    } else {
      const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      filename = `model_${ts}_ss7.csv`;
    }

    const projectName = originalFile?.name?.replace(/\.(stb|xml)$/i, '') || '';

    // SS7元CSVテキストがあればパススルー用に渡す（エクスポート対象モデルと同じスロットから取得）
    const ss7OriginalCsvText = modelADocument
      ? getState('models.ss7OriginalCsvTextA')
      : getState('models.ss7OriginalCsvTextB');

    await downloadStbAsSs7Csv(xmlDoc, { filename, projectName, ss7OriginalCsvText });

    showSuccess('SS7 CSVファイルを出力しました。');
    log.info(`[Process] SS7 CSV出力完了: ${filename}`);
  } catch (error) {
    log.error('SS7 CSV出力エラー:', error);
    showError(`SS7 CSV出力に失敗しました: ${error.message}`);
  } finally {
    if (exportSs7Btn) {
      exportSs7Btn.disabled = false;
      exportSs7Btn.textContent = '📊 SS7 CSV出力';
    }
  }
}

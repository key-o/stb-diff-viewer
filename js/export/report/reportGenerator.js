/**
 * @fileoverview 比較レポート生成メインモジュール
 *
 * データ収集→スクリーンショット→HTML構築→ダウンロードを統合します。
 *
 * @module export/report/reportGenerator
 */

import { collectReportData } from './reportDataCollector.js';
import { captureCurrentView, captureMultipleViews } from './reportScreenshot.js';
import { buildReportHtml } from './reportHtmlBuilder.js';
import { eventBus, ExportEvents } from '../../app/events/index.js';
import { downloadBlob } from '../../utils/downloadHelper.js';

/**
 * @typedef {Object} ReportOptions
 * @property {boolean} [includeScreenshot=true] - スクリーンショットを含めるか
 * @property {boolean} [multiView=false] - 複数アングル（アイソメ・上面・正面）のスクリーンショットを含めるか
 * @property {string} [filename] - 出力ファイル名
 */

/**
 * 比較レポートを生成しダウンロードする
 * @param {Object} comparisonResults - 比較結果オブジェクト
 * @param {ReportOptions} [options={}] - オプション
 */
export async function generateReport(comparisonResults, options = {}) {
  if (!comparisonResults) {
    throw new Error('比較結果がありません');
  }

  const { includeScreenshot = true, multiView = false, filename } = options;

  eventBus.emit(ExportEvents.STARTED, { type: 'report' });

  try {
    // データ収集
    const reportData = collectReportData(comparisonResults);

    // スクリーンショット取得
    let screenshots = [];
    if (includeScreenshot) {
      if (multiView) {
        screenshots = await captureMultipleViews(['iso', 'top', 'front']);
      } else {
        const currentView = captureCurrentView();
        if (currentView) {
          screenshots = [
            {
              dataUrl: currentView,
              viewName: '現在のビュー',
              viewKey: 'current',
            },
          ];
        }
      }
    }

    // HTML構築
    const html = buildReportHtml(reportData, screenshots);

    // ダウンロード
    const outputFilename = filename || generateFilename(reportData.meta);
    downloadHtml(html, outputFilename);

    eventBus.emit(ExportEvents.COMPLETED, { type: 'report', filename: outputFilename });
  } catch (error) {
    eventBus.emit(ExportEvents.ERROR, { type: 'report', error: error.message });
    throw error;
  }
}

/**
 * ファイル名を生成する
 * @param {Object} meta - メタデータ
 * @returns {string} ファイル名
 */
function generateFilename(meta) {
  const date = new Date().toISOString().slice(0, 10);
  const nameA = stripExtension(meta.fileNameA);
  const nameB = stripExtension(meta.fileNameB);
  return `stb-diff-report_${nameA}_vs_${nameB}_${date}.html`;
}

/**
 * 拡張子を除去する
 * @param {string} filename - ファイル名
 * @returns {string} 拡張子なしのファイル名
 */
function stripExtension(filename) {
  return filename.replace(/\.[^.]+$/, '');
}

/**
 * HTMLファイルをダウンロードする
 * @param {string} html - HTML文字列
 * @param {string} filename - ファイル名
 */
function downloadHtml(html, filename) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  downloadBlob(blob, filename);
}

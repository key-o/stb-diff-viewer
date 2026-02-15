/**
 * @fileoverview 比較レポートエクスポートハンドラー
 *
 * 比較レポートの生成・ダウンロードボタンのイベント処理を行います。
 *
 * @module ui/events/exportHandlers/reportExportHandler
 */

import { showError, showWarning, showSuccess } from '../../common/toast.js';
import { eventBus, ComparisonEvents } from '../../../app/events/index.js';
import { getState } from '../../../app/globalState.js';

/** 最新の比較結果を保持 */
let latestComparisonResults = null;

/**
 * レポートエクスポートボタンのリスナーを設定する
 */
export function setupReportExportListener() {
  const reportBtn = document.getElementById('exportReportBtn');
  if (reportBtn) {
    reportBtn.addEventListener('click', handleReportExport);
  }

  // リスナー登録前に比較が完了していた場合も、現在状態から有効化する
  const existingResults = getState('comparisonResults');
  if (existingResults) {
    latestComparisonResults = existingResults;
    enableReportButton();
  }

  // 比較結果をキャッシュ
  eventBus.on(ComparisonEvents.UPDATE_STATISTICS, (data) => {
    if (data?.comparisonResults) {
      latestComparisonResults = data.comparisonResults;
      enableReportButton();
    }
  });
}

/**
 * レポートエクスポートボタンを有効化する
 */
function enableReportButton() {
  const reportBtn = document.getElementById('exportReportBtn');
  if (reportBtn) {
    reportBtn.disabled = false;
  }
}

/**
 * レポートエクスポートのクリックハンドラ
 */
async function handleReportExport() {
  const reportBtn = document.getElementById('exportReportBtn');

  if (!latestComparisonResults) {
    showWarning('比較結果がありません。先にモデルを読み込んで比較を実行してください。');
    return;
  }

  try {
    if (reportBtn) {
      reportBtn.disabled = true;
      reportBtn.textContent = '生成中...';
    }

    // レポートジェネレータを動的インポート
    const { generateReport } = await import('../../../export/report/reportGenerator.js');

    // 比較結果がMapの場合はObjectに変換
    let results = latestComparisonResults;
    if (results instanceof Map) {
      results = Object.fromEntries(results);
    }

    const multiViewCheck = document.getElementById('reportMultiViewCheck');
    const multiView = multiViewCheck?.checked ?? false;
    await generateReport(results, { multiView });
    showSuccess('比較レポートをダウンロードしました');
  } catch (error) {
    console.error('[Report] レポート生成エラー:', error);
    showError(`レポートの生成に失敗しました: ${error.message}`);
  } finally {
    if (reportBtn) {
      reportBtn.disabled = false;
      reportBtn.textContent = '比較レポート出力';
    }
  }
}

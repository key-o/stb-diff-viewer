/**
 * @fileoverview 差分サマリー表示機能
 *
 * このファイルは、モデル比較後の差分結果をUI上にサマリー表示する機能を提供します:
 * - 要素タイプ別の差分統計表示
 * - 一致・差分・追加・削除要素の数値表示
 * - 視覚的な差分概要の提供
 */

/**
 * 差分結果のサマリーを表示する
 * @param {Object} comparisonResults - 比較結果オブジェクト
 */
export function updateDiffSummary(comparisonResults) {
  const summaryElement = document.getElementById('diff-summary');
  const contentElement = document.getElementById('diff-summary-content');

  if (!summaryElement || !contentElement || !comparisonResults) {
    return;
  }

  // 統計データを集計
  const stats = calculateDiffStatistics(comparisonResults);

  // サマリーHTMLを生成
  const summaryHTML = generateSummaryHTML(stats);

  // 表示を更新
  contentElement.innerHTML = summaryHTML;
  summaryElement.classList.toggle('hidden', stats.totalElements === 0);

  // 差分一覧ボタンのイベントリスナーを設定
  const diffListBtn = document.getElementById('open-diff-list-from-summary');
  if (diffListBtn) {
    diffListBtn.addEventListener('click', () => {
      if (typeof window.toggleDiffList === 'function') {
        window.toggleDiffList();
      }
    });
  }
}

/**
 * 比較結果から統計データを計算する
 * @param {Object} comparisonResults - 比較結果オブジェクト
 * @returns {Object} 統計データ
 */
function calculateDiffStatistics(comparisonResults) {
  const stats = {
    totalElements: 0,
    totalMatched: 0,
    totalOnlyA: 0,
    totalOnlyB: 0,
    elementTypes: {}
  };

  // 要素タイプ別に統計を計算
  Object.entries(comparisonResults).forEach(([elementType, result]) => {
    if (!result || typeof result !== 'object') return;

    const matched = result.matched ? result.matched.length : 0;
    const onlyA = result.onlyA ? result.onlyA.length : 0;
    const onlyB = result.onlyB ? result.onlyB.length : 0;
    const total = matched + onlyA + onlyB;

    if (total > 0) {
      stats.elementTypes[elementType] = {
        matched,
        onlyA,
        onlyB,
        total
      };

      stats.totalElements += total;
      stats.totalMatched += matched;
      stats.totalOnlyA += onlyA;
      stats.totalOnlyB += onlyB;
    }
  });

  return stats;
}

/**
 * 統計データからHTMLを生成する
 * @param {Object} stats - 統計データ
 * @returns {string} HTML文字列
 */
function generateSummaryHTML(stats) {
  if (stats.totalElements === 0) {
    return '<div class="diff-stat-item">比較対象の要素がありません</div>';
  }

  let html = '';

  // 全体統計
  html +=
    '<div style="margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #dee2e6;">';
  html += `<div class="diff-stat-item">`;
  html += `  <span>📊 総要素数</span>`;
  html += `  <span class="diff-stat-value">${stats.totalElements}</span>`;
  html += `</div>`;

  if (stats.totalMatched > 0) {
    html += `<div class="diff-stat-item">`;
    html += `  <span>✅ 一致要素</span>`;
    html += `  <span class="diff-stat-value diff-stat-matched">${stats.totalMatched}</span>`;
    html += `</div>`;
  }

  if (stats.totalOnlyA > 0) {
    html += `<div class="diff-stat-item">`;
    html += `  <span>🟢 モデルA専用</span>`;
    html += `  <span class="diff-stat-value diff-stat-only-a">${stats.totalOnlyA}</span>`;
    html += `</div>`;
  }

  if (stats.totalOnlyB > 0) {
    html += `<div class="diff-stat-item">`;
    html += `  <span>🔴 モデルB専用</span>`;
    html += `  <span class="diff-stat-value diff-stat-only-b">${stats.totalOnlyB}</span>`;
    html += `</div>`;
  }

  html += '</div>';

  // 要素タイプ別詳細
  const elementTypeEntries = Object.entries(stats.elementTypes);
  if (elementTypeEntries.length > 1) {
    html += '<div style="font-size: 0.85em;">';
    html +=
      '<div style="font-weight: 600; margin-bottom: 6px; color: #495057;">要素タイプ別:</div>';

    elementTypeEntries.forEach(([elementType, typeStats]) => {
      const typeName = getElementTypeDisplayName(elementType);
      html += `<div class="diff-stat-item" style="font-size: 0.9em;">`;
      html += `  <span>${typeName}</span>`;
      html += `  <span class="diff-stat-value">`;

      const parts = [];
      if (typeStats.matched > 0) parts.push(`一致:${typeStats.matched}`);
      if (typeStats.onlyA > 0) parts.push(`A:${typeStats.onlyA}`);
      if (typeStats.onlyB > 0) parts.push(`B:${typeStats.onlyB}`);

      html += parts.join(' / ');
      html += `  </span>`;
      html += `</div>`;
    });

    html += '</div>';
  }

  // 差分がある場合は「差分一覧を表示」ボタンを追加
  if (stats.totalOnlyA > 0 || stats.totalOnlyB > 0) {
    html += `
      <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid #dee2e6;">
        <button type="button" id="open-diff-list-from-summary" class="btn btn-sm btn-secondary" style="width: 100%; padding: 8px; font-size: 13px;">
          📋 差分一覧を表示
        </button>
      </div>
    `;
  }

  return html;
}

/**
 * 要素タイプの表示名を取得する
 * @param {string} elementType - 要素タイプ
 * @returns {string} 表示名
 */
function getElementTypeDisplayName(elementType) {
  const displayNames = {
    Node: '節点',
    Column: '柱',
    Girder: '大梁',
    Beam: '小梁',
    Brace: 'ブレース',
    Slab: 'スラブ',
    Wall: '壁',
    Axis: '通り芯',
    Story: '階'
  };

  return displayNames[elementType] || elementType;
}

/**
 * 差分結果が更新された際のイベントリスナーを設定する
 */
export function setupDiffSummaryEventListeners() {
  // 比較結果更新イベントを監視
  window.addEventListener('updateComparisonStatistics', (event) => {
    if (event.detail && event.detail.comparisonResults) {
      updateDiffSummary(event.detail.comparisonResults);
    }
  });

  console.log('Diff summary event listeners set up');
}

/**
 * 差分サマリーをクリアする
 */
export function clearDiffSummary() {
  const summaryElement = document.getElementById('diff-summary');
  const contentElement = document.getElementById('diff-summary-content');

  if (summaryElement) {
    summaryElement.classList.add('hidden');
  }

  if (contentElement) {
    contentElement.innerHTML = '';
  }
}

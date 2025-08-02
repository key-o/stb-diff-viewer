/**
 * @fileoverview 重要度別統計表示機能
 *
 * このファイルは、重要度レベル別の差分統計とサマリー表示機能を提供します:
 * - 重要度別差分数カウント
 * - 円グラフでの視覚的表示
 * - 高重要度差分の警告表示
 * - 統計データのエクスポート機能
 * - リアルタイム統計更新
 *
 * 統計情報により、ユーザーは比較結果の概要を素早く把握でき、
 * 重要な差分に注意を向けることができます。
 */

import { IMPORTANCE_LEVELS, IMPORTANCE_LEVEL_NAMES } from '../core/importanceManager.js';
import { IMPORTANCE_COLORS } from '../config/importanceConfig.js';
import { getState, setState } from '../core/globalState.js';
import { generateImportanceSummary } from '../comparator.js';

/**
 * 重要度別統計表示クラス
 */
export class ImportanceStatistics {
  constructor() {
    this.statistics = null;
    this.isVisible = false;
    this.updateInterval = null;
    this.autoUpdateEnabled = true;
    this.containerElement = null;
    this.chartCanvas = null;
    
    this.setupEventListeners();
  }

  /**
   * イベントリスナーを設定
   */
  setupEventListeners() {
    // 比較結果更新時の統計更新
    window.addEventListener('updateComparisonStatistics', (event) => {
      if (event.detail && event.detail.comparisonResults) {
        this.updateStatistics(event.detail.comparisonResults);
      }
    });

    // 重要度設定変更時の統計更新
    window.addEventListener('importanceSettingsChanged', (event) => {
      if (this.autoUpdateEnabled) {
        setTimeout(() => this.refreshStatistics(), 500); // 少し遅らせて更新
      }
    });

    // フィルタ適用時の統計更新
    window.addEventListener('importanceFilterApplied', (event) => {
      this.updateFilterStatistics(event.detail);
    });
  }

  /**
   * 統計表示を初期化
   * @param {HTMLElement} containerElement - 統計表示用コンテナ
   */
  initialize(containerElement) {
    this.containerElement = containerElement;
    this.createStatisticsHTML();
    this.bindEvents();
    
    // 初回統計の生成
    this.refreshStatistics();
    
    console.log('ImportanceStatistics initialized');
  }

  /**
   * 統計表示HTMLを作成
   */
  createStatisticsHTML() {
    const statisticsHTML = `
      <div id="importance-statistics-panel" class="statistics-panel" style="display: none;">
        <div class="statistics-header">
          <h3>重要度別統計</h3>
          <div class="statistics-controls">
            <button id="statistics-refresh" class="btn btn-sm" title="統計を更新">🔄</button>
            <button id="statistics-export" class="btn btn-sm" title="統計をエクスポート">📊</button>
            <button id="statistics-close" class="close-button">×</button>
          </div>
        </div>
        
        <div class="statistics-content">
          <!-- サマリーカード -->
          <div class="statistics-summary">
            <div class="summary-cards">
              <div class="summary-card total">
                <div class="card-icon">📊</div>
                <div class="card-content">
                  <div class="card-value" id="total-elements">-</div>
                  <div class="card-label">総要素数</div>
                </div>
              </div>
              <div class="summary-card differences">
                <div class="card-icon">⚠️</div>
                <div class="card-content">
                  <div class="card-value" id="total-differences">-</div>
                  <div class="card-label">総差分数</div>
                </div>
              </div>
              <div class="summary-card critical" id="critical-card">
                <div class="card-icon">🚨</div>
                <div class="card-content">
                  <div class="card-value" id="critical-differences">-</div>
                  <div class="card-label">高重要度差分</div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- 重要度別詳細統計 -->
          <div class="statistics-details">
            <div class="details-header">
              <h4>重要度別詳細</h4>
              <select id="statistics-view-mode">
                <option value="differences">差分表示</option>
                <option value="all">全要素表示</option>
                <option value="percentages">割合表示</option>
              </select>
            </div>
            
            <div class="statistics-table">
              <table id="statistics-data-table">
                <thead>
                  <tr>
                    <th>重要度</th>
                    <th>一致</th>
                    <th>A専用</th>
                    <th>B専用</th>
                    <th>差分計</th>
                    <th>割合</th>
                  </tr>
                </thead>
                <tbody id="statistics-table-body">
                  <!-- 統計データが動的に挿入される -->
                </tbody>
              </table>
            </div>
          </div>
          
          <!-- 要素タイプ別統計 -->
          <div class="statistics-by-type">
            <div class="type-header">
              <h4>要素タイプ別統計</h4>
              <button id="toggle-type-view" class="btn btn-sm">詳細表示</button>
            </div>
            <div id="type-statistics-container">
              <!-- 要素タイプ別統計が動的に挿入される -->
            </div>
          </div>
          
          <!-- 視覚的グラフ -->
          <div class="statistics-charts">
            <div class="chart-container">
              <h4>重要度分布</h4>
              <canvas id="importance-distribution-chart" width="300" height="200"></canvas>
            </div>
          </div>
          
          <!-- フィルタ統計 -->
          <div class="filter-statistics" id="filter-statistics" style="display: none;">
            <h4>フィルタ統計</h4>
            <div class="filter-stats-content">
              <div class="filter-stat">
                <span class="stat-label">表示中:</span>
                <span class="stat-value" id="filter-visible">-</span>
              </div>
              <div class="filter-stat">
                <span class="stat-label">非表示:</span>
                <span class="stat-value" id="filter-hidden">-</span>
              </div>
              <div class="filter-stat">
                <span class="stat-label">効率:</span>
                <span class="stat-value" id="filter-efficiency">-%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    this.containerElement.insertAdjacentHTML('beforeend', statisticsHTML);
    this.chartCanvas = document.getElementById('importance-distribution-chart');
    
    this.addStyles();
  }

  /**
   * スタイルを追加
   */
  addStyles() {
    if (document.getElementById('importance-statistics-styles')) return;
    
    const styles = `
      <style id="importance-statistics-styles">
        .statistics-panel {
          position: fixed;
          top: 50px;
          left: 20px;
          width: 450px;
          max-height: 80vh;
          background: white;
          border: 1px solid #ccc;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          z-index: 1000;
          overflow-y: auto;
        }
        
        .statistics-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid #eee;
          background: #f8f9fa;
          border-radius: 8px 8px 0 0;
        }
        
        .statistics-header h3 {
          margin: 0;
          font-size: 16px;
          color: #333;
        }
        
        .statistics-controls {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        
        .statistics-controls .btn {
          padding: 4px 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          background: white;
          cursor: pointer;
          font-size: 12px;
        }
        
        .statistics-controls .btn:hover {
          background: #f0f0f0;
        }
        
        .statistics-content {
          padding: 16px;
        }
        
        .statistics-summary {
          margin-bottom: 20px;
        }
        
        .summary-cards {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        
        .summary-card {
          display: flex;
          align-items: center;
          padding: 12px;
          border-radius: 6px;
          border: 1px solid #eee;
          background: white;
        }
        
        .summary-card.total { border-left: 4px solid #007bff; }
        .summary-card.differences { border-left: 4px solid #ffc107; }
        .summary-card.critical { border-left: 4px solid #dc3545; }
        
        .summary-card.critical.alert {
          background: #fff5f5;
          animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
        
        .card-icon {
          font-size: 24px;
          margin-right: 12px;
        }
        
        .card-content {
          flex: 1;
        }
        
        .card-value {
          font-size: 20px;
          font-weight: bold;
          color: #333;
        }
        
        .card-label {
          font-size: 12px;
          color: #666;
          margin-top: 2px;
        }
        
        .statistics-details, .statistics-by-type, .statistics-charts {
          margin-bottom: 20px;
        }
        
        .details-header, .type-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        
        .details-header h4, .type-header h4 {
          margin: 0;
          font-size: 14px;
          color: #333;
        }
        
        .details-header select {
          font-size: 12px;
          padding: 2px 6px;
          border: 1px solid #ddd;
          border-radius: 3px;
        }
        
        .statistics-table {
          overflow-x: auto;
        }
        
        .statistics-table table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        
        .statistics-table th,
        .statistics-table td {
          padding: 6px 8px;
          text-align: center;
          border-bottom: 1px solid #eee;
        }
        
        .statistics-table th {
          background: #f8f9fa;
          font-weight: bold;
          color: #555;
        }
        
        .statistics-table .importance-cell {
          text-align: left;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .importance-indicator {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          border: 1px solid #ccc;
        }
        
        .chart-container {
          text-align: center;
        }
        
        .chart-container h4 {
          margin: 0 0 12px 0;
          font-size: 14px;
          color: #333;
        }
        
        .filter-statistics {
          border-top: 1px solid #eee;
          padding-top: 16px;
        }
        
        .filter-statistics h4 {
          margin: 0 0 12px 0;
          font-size: 14px;
          color: #333;
        }
        
        .filter-stats-content {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        
        .filter-stat {
          text-align: center;
          padding: 8px;
          background: #f8f9fa;
          border-radius: 4px;
        }
        
        .stat-label {
          display: block;
          font-size: 11px;
          color: #666;
          margin-bottom: 2px;
        }
        
        .stat-value {
          display: block;
          font-size: 14px;
          font-weight: bold;
          color: #333;
        }
        
        .type-statistics-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 0;
          border-bottom: 1px solid #f0f0f0;
          font-size: 12px;
        }
        
        .type-name {
          font-weight: bold;
          color: #555;
        }
        
        .type-stats {
          display: flex;
          gap: 12px;
          color: #666;
        }
      </style>
    `;
    
    document.head.insertAdjacentHTML('beforeend', styles);
  }

  /**
   * イベントを関連付け
   */
  bindEvents() {
    // パネル閉じるボタン
    document.getElementById('statistics-close').addEventListener('click', () => {
      this.hide();
    });

    // 統計更新ボタン
    document.getElementById('statistics-refresh').addEventListener('click', () => {
      this.refreshStatistics();
    });

    // エクスポートボタン
    document.getElementById('statistics-export').addEventListener('click', () => {
      this.exportStatistics();
    });

    // 表示モード変更
    document.getElementById('statistics-view-mode').addEventListener('change', (e) => {
      this.updateStatisticsDisplay(e.target.value);
    });

    // 要素タイプ詳細表示切り替え
    document.getElementById('toggle-type-view').addEventListener('click', (e) => {
      this.toggleTypeDetailView();
    });
  }

  /**
   * 統計を更新
   * @param {Map} comparisonResults - 比較結果
   */
  updateStatistics(comparisonResults) {
    try {
      console.log('Updating statistics with comparison results:', comparisonResults);
      
      // 比較結果から統計を生成
      const results = Array.from(comparisonResults.values());
      console.log('Raw comparison results:', results);
      
      const resultsWithImportance = results.filter(result => result.importanceStats);
      console.log('Results with importance stats:', resultsWithImportance);
      
      if (resultsWithImportance.length === 0) {
        console.warn('No results with importance statistics found');
        // 重要度情報がない場合は基本的な統計を作成
        this.createBasicStatistics(results);
      } else {
        this.statistics = generateImportanceSummary(resultsWithImportance);
      }
      
      console.log('Final statistics:', this.statistics);
      
      // 表示を更新
      if (this.isVisible) {
        this.updateDisplay();
      }
      
    } catch (error) {
      console.error('Failed to update statistics:', error);
    }
  }

  /**
   * 重要度情報がない場合の基本統計を作成
   * @param {Array} results - 比較結果配列
   */
  createBasicStatistics(results) {
    this.statistics = {
      totalElements: 0,
      totalDifferences: 0,
      criticalDifferences: 0,
      byImportance: {},
      byElementType: {},
      timestamp: new Date().toISOString()
    };

    // 重要度レベル別の初期化
    for (const level of Object.values(IMPORTANCE_LEVELS)) {
      this.statistics.byImportance[level] = {
        matched: 0,
        differences: 0,
        onlyA: 0,
        onlyB: 0
      };
    }

    // 各結果を処理
    results.forEach(result => {
      if (!result) return;
      
      const matched = result.matched ? result.matched.length : 0;
      const onlyA = result.onlyA ? result.onlyA.length : 0;
      const onlyB = result.onlyB ? result.onlyB.length : 0;
      const differences = onlyA + onlyB;
      
      this.statistics.totalElements += matched + differences;
      this.statistics.totalDifferences += differences;
      
      // 要素タイプ別統計
      if (result.elementType || result.isSelected !== undefined) {
        const elementType = result.elementType || 'Unknown';
        this.statistics.byElementType[elementType] = {
          totalMatched: matched,
          totalDifferences: differences,
          totalOnlyA: onlyA,
          totalOnlyB: onlyB
        };
      }
      
      // デフォルトで高重要度として扱う
      this.statistics.byImportance[IMPORTANCE_LEVELS.REQUIRED].matched += matched;
      this.statistics.byImportance[IMPORTANCE_LEVELS.REQUIRED].onlyA += onlyA;
      this.statistics.byImportance[IMPORTANCE_LEVELS.REQUIRED].onlyB += onlyB;
      this.statistics.byImportance[IMPORTANCE_LEVELS.REQUIRED].differences += differences;
      this.statistics.criticalDifferences += differences;
    });

    console.log('Created basic statistics:', this.statistics);
  }

  /**
   * 統計を手動で更新（現在の比較結果から）
   */
  refreshStatistics() {
    const comparisonResults = getState('comparisonResults');
    if (comparisonResults) {
      this.updateStatistics(comparisonResults);
    } else {
      console.log('No comparison results available for statistics');
    }
  }

  /**
   * 表示を更新
   */
  updateDisplay() {
    if (!this.statistics) return;

    this.updateSummaryCards();
    this.updateStatisticsTable();
    this.updateTypeStatistics();
    this.updateChart();
  }

  /**
   * サマリーカードを更新
   */
  updateSummaryCards() {
    const stats = this.statistics;
    
    document.getElementById('total-elements').textContent = stats.totalElements;
    document.getElementById('total-differences').textContent = stats.totalDifferences;
    document.getElementById('critical-differences').textContent = stats.criticalDifferences;
    
    // 高重要度差分がある場合は警告表示
    const criticalCard = document.getElementById('critical-card');
    if (stats.criticalDifferences > 0) {
      criticalCard.classList.add('alert');
    } else {
      criticalCard.classList.remove('alert');
    }
  }

  /**
   * 統計テーブルを更新
   */
  updateStatisticsTable() {
    const tbody = document.getElementById('statistics-table-body');
    const viewMode = document.getElementById('statistics-view-mode').value;
    
    tbody.innerHTML = '';
    
    for (const [level, stats] of Object.entries(this.statistics.byImportance)) {
      const row = document.createElement('tr');
      
      const levelName = IMPORTANCE_LEVEL_NAMES[level];
      const color = IMPORTANCE_COLORS[level];
      const total = stats.matched + stats.differences;
      const percentage = this.statistics.totalElements > 0 
        ? ((total / this.statistics.totalElements) * 100).toFixed(1) 
        : '0.0';
      
      row.innerHTML = `
        <td class="importance-cell">
          <div class="importance-indicator" style="background-color: ${color};"></div>
          ${levelName}
        </td>
        <td>${stats.matched}</td>
        <td>${stats.onlyA}</td>
        <td>${stats.onlyB}</td>
        <td><strong>${stats.differences}</strong></td>
        <td>${percentage}%</td>
      `;
      
      // 高重要度差分がある行を強調
      if (level === IMPORTANCE_LEVELS.REQUIRED && stats.differences > 0) {
        row.style.backgroundColor = '#fff5f5';
      }
      
      tbody.appendChild(row);
    }
  }

  /**
   * 要素タイプ別統計を更新
   */
  updateTypeStatistics() {
    const container = document.getElementById('type-statistics-container');
    container.innerHTML = '';
    
    for (const [elementType, stats] of Object.entries(this.statistics.byElementType)) {
      const item = document.createElement('div');
      item.className = 'type-statistics-item';
      
      item.innerHTML = `
        <div class="type-name">${elementType}</div>
        <div class="type-stats">
          <span>差分: ${stats.totalDifferences}</span>
          <span>一致: ${stats.totalMatched}</span>
        </div>
      `;
      
      container.appendChild(item);
    }
  }

  /**
   * チャートを更新
   */
  updateChart() {
    if (!this.chartCanvas) return;
    
    const ctx = this.chartCanvas.getContext('2d');
    const width = this.chartCanvas.width;
    const height = this.chartCanvas.height;
    
    // キャンバスをクリア
    ctx.clearRect(0, 0, width, height);
    
    // シンプルな円グラフを描画
    this.drawPieChart(ctx, width, height);
  }

  /**
   * 円グラフを描画
   * @param {CanvasRenderingContext2D} ctx - キャンバスコンテキスト
   * @param {number} width - 幅
   * @param {number} height - 高さ
   */
  drawPieChart(ctx, width, height) {
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 20;
    
    const total = this.statistics.totalElements;
    if (total === 0) return;
    
    let startAngle = 0;
    
    for (const [level, stats] of Object.entries(this.statistics.byImportance)) {
      const count = stats.matched + stats.differences;
      if (count === 0) continue;
      
      const angle = (count / total) * 2 * Math.PI;
      const color = IMPORTANCE_COLORS[level];
      
      // セクションを描画
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + angle);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      startAngle += angle;
    }
  }

  /**
   * フィルタ統計を更新
   * @param {Object} filterStats - フィルタ統計
   */
  updateFilterStatistics(filterStats) {
    const filterContainer = document.getElementById('filter-statistics');
    
    if (filterStats.totalElements > 0 && filterStats.hiddenElements > 0) {
      filterContainer.style.display = 'block';
      
      document.getElementById('filter-visible').textContent = filterStats.visibleElements;
      document.getElementById('filter-hidden').textContent = filterStats.hiddenElements;
      document.getElementById('filter-efficiency').textContent = `${filterStats.filterEfficiency}%`;
    } else {
      filterContainer.style.display = 'none';
    }
  }

  /**
   * 表示モードを変更
   * @param {string} mode - 表示モード
   */
  updateStatisticsDisplay(mode) {
    // 現在は基本的な切り替えのみ実装
    console.log(`Statistics view mode changed to: ${mode}`);
    this.updateStatisticsTable();
  }

  /**
   * 要素タイプ詳細表示を切り替え
   */
  toggleTypeDetailView() {
    const button = document.getElementById('toggle-type-view');
    const isDetailed = button.textContent === '簡易表示';
    
    button.textContent = isDetailed ? '詳細表示' : '簡易表示';
    
    // 詳細表示の実装（今後拡張可能）
    console.log(`Type detail view: ${!isDetailed ? 'detailed' : 'simple'}`);
  }

  /**
   * 統計データをエクスポート
   */
  exportStatistics() {
    if (!this.statistics) {
      alert('エクスポートする統計データがありません。');
      return;
    }

    try {
      const exportData = {
        timestamp: new Date().toISOString(),
        summary: {
          totalElements: this.statistics.totalElements,
          totalDifferences: this.statistics.totalDifferences,
          criticalDifferences: this.statistics.criticalDifferences
        },
        byImportance: this.statistics.byImportance,
        byElementType: this.statistics.byElementType
      };

      const jsonContent = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const link = document.createElement('a');
      
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `importance_statistics_${new Date().toISOString().slice(0, 10)}.json`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log('Statistics exported successfully');
      
    } catch (error) {
      console.error('Failed to export statistics:', error);
      alert('統計データのエクスポートに失敗しました。');
    }
  }

  /**
   * パネルを表示
   */
  show() {
    document.getElementById('importance-statistics-panel').style.display = 'block';
    this.isVisible = true;
    
    // 表示時に統計を更新
    this.refreshStatistics();
    
    setState('ui.statisticsPanelVisible', true);
  }

  /**
   * パネルを非表示
   */
  hide() {
    document.getElementById('importance-statistics-panel').style.display = 'none';
    this.isVisible = false;
    
    setState('ui.statisticsPanelVisible', false);
  }

  /**
   * パネルの表示切り替え
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * 自動更新の有効/無効切り替え
   * @param {boolean} enabled - 有効にするかどうか
   */
  setAutoUpdate(enabled) {
    this.autoUpdateEnabled = enabled;
    
    if (enabled && !this.updateInterval) {
      // 定期更新を開始（30秒間隔）
      this.updateInterval = setInterval(() => {
        if (this.isVisible) {
          this.refreshStatistics();
        }
      }, 30000);
    } else if (!enabled && this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * 統計データを取得
   * @returns {Object} 現在の統計データ
   */
  getStatistics() {
    return this.statistics;
  }
}

// シングルトンインスタンス
let importanceStatisticsInstance = null;

/**
 * ImportanceStatisticsのシングルトンインスタンスを取得
 * @returns {ImportanceStatistics} インスタンス
 */
export function getImportanceStatistics() {
  if (!importanceStatisticsInstance) {
    importanceStatisticsInstance = new ImportanceStatistics();
  }
  return importanceStatisticsInstance;
}

/**
 * 重要度統計パネルを初期化
 * @param {HTMLElement} containerElement - パネルを配置するコンテナ
 * @returns {ImportanceStatistics} 初期化済みのインスタンス
 */
export function initializeImportanceStatistics(containerElement = document.body) {
  const statistics = getImportanceStatistics();
  statistics.initialize(containerElement);
  return statistics;
}

// デフォルトエクスポート
export default ImportanceStatistics;
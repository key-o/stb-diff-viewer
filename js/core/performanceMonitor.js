/**
 * @fileoverview パフォーマンス監視モジュール
 *
 * このファイルは、アプリケーションのパフォーマンスを監視します:
 * - 関数実行時間の測定
 * - メモリ使用量の監視
 * - レンダリングパフォーマンスの追跡
 * - パフォーマンスボトルネックの特定
 *
 * 開発時やデバッグ時に有用な情報を提供します。
 */

/**
 * パフォーマンス監視クラス
 */
class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.enabled = false;
    this.renderTimes = [];
    this.maxRenderTimeHistory = 100;
  }

  /**
   * 監視を有効/無効にする
   * @param {boolean} enabled - 有効フラグ
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled) {
      console.log('Performance monitoring enabled');
    }
  }

  /**
   * 関数の実行時間を測定
   * @param {string} name - 測定名
   * @param {Function} func - 測定対象の関数
   * @returns {any} 関数の戻り値
   */
  async measureAsync(name, func) {
    if (!this.enabled) return await func();

    const start = performance.now();
    try {
      const result = await func();
      const end = performance.now();
      this.recordMetric(name, end - start);
      return result;
    } catch (error) {
      const end = performance.now();
      this.recordMetric(name, end - start, { error: true });
      throw error;
    }
  }

  /**
   * 同期関数の実行時間を測定
   * @param {string} name - 測定名
   * @param {Function} func - 測定対象の関数
   * @returns {any} 関数の戻り値
   */
  measure(name, func) {
    if (!this.enabled) return func();

    const start = performance.now();
    try {
      const result = func();
      const end = performance.now();
      this.recordMetric(name, end - start);
      return result;
    } catch (error) {
      const end = performance.now();
      this.recordMetric(name, end - start, { error: true });
      throw error;
    }
  }

  /**
   * メトリクスを記録
   * @private
   */
  recordMetric(name, duration, metadata = {}) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, {
        count: 0,
        totalTime: 0,
        minTime: Infinity,
        maxTime: -Infinity,
        avgTime: 0,
        lastTime: 0,
        errors: 0
      });
    }

    const metric = this.metrics.get(name);
    metric.count++;
    metric.totalTime += duration;
    metric.minTime = Math.min(metric.minTime, duration);
    metric.maxTime = Math.max(metric.maxTime, duration);
    metric.avgTime = metric.totalTime / metric.count;
    metric.lastTime = duration;

    if (metadata.error) {
      metric.errors++;
    }

    // 長時間実行の警告
    if (duration > 100) {
      console.warn(`Slow operation detected: ${name} took ${duration.toFixed(2)}ms`);
    }
  }

  /**
   * レンダリング時間を記録
   * @param {number} renderTime - レンダリング時間（ミリ秒）
   */
  recordRenderTime(renderTime) {
    if (!this.enabled) return;

    this.renderTimes.push({
      time: renderTime,
      timestamp: performance.now()
    });

    // 履歴サイズ制限
    if (this.renderTimes.length > this.maxRenderTimeHistory) {
      this.renderTimes.shift();
    }

    // フレームレート低下の警告
    if (renderTime > 16.67) { // 60FPS以下
      console.warn(`Low framerate detected: render took ${renderTime.toFixed(2)}ms`);
    }
  }

  /**
   * メモリ使用量を取得
   * @returns {Object} メモリ使用量情報
   */
  getMemoryUsage() {
    if (!this.enabled || !performance.memory) {
      return null;
    }

    return {
      used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
      total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
      limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
    };
  }

  /**
   * パフォーマンス統計を取得
   * @returns {Object} パフォーマンス統計
   */
  getStats() {
    const stats = {
      functions: {},
      rendering: {},
      memory: this.getMemoryUsage()
    };

    // 関数実行統計
    for (const [name, metric] of this.metrics.entries()) {
      stats.functions[name] = {
        ...metric,
        avgTime: parseFloat(metric.avgTime.toFixed(2)),
        minTime: parseFloat(metric.minTime.toFixed(2)),
        maxTime: parseFloat(metric.maxTime.toFixed(2)),
        lastTime: parseFloat(metric.lastTime.toFixed(2))
      };
    }

    // レンダリング統計
    if (this.renderTimes.length > 0) {
      const recentRenderTimes = this.renderTimes.slice(-30); // 最新30フレーム
      const totalTime = recentRenderTimes.reduce((sum, item) => sum + item.time, 0);
      
      stats.rendering = {
        averageFrameTime: parseFloat((totalTime / recentRenderTimes.length).toFixed(2)),
        estimatedFPS: parseFloat((1000 / (totalTime / recentRenderTimes.length)).toFixed(1)),
        frameCount: this.renderTimes.length,
        recentFrames: recentRenderTimes.length
      };
    }

    return stats;
  }

  /**
   * 統計をコンソールに出力
   */
  logStats() {
    if (!this.enabled) {
      console.log('Performance monitoring is disabled');
      return;
    }

    const stats = this.getStats();
    console.group('Performance Statistics');
    
    // 関数実行統計
    if (Object.keys(stats.functions).length > 0) {
      console.group('Function Performance');
      for (const [name, metric] of Object.entries(stats.functions)) {
        console.log(`${name}:`, metric);
      }
      console.groupEnd();
    }

    // レンダリング統計
    if (stats.rendering.frameCount > 0) {
      console.group('Rendering Performance');
      console.log('Average frame time:', `${stats.rendering.averageFrameTime}ms`);
      console.log('Estimated FPS:', stats.rendering.estimatedFPS);
      console.log('Total frames:', stats.rendering.frameCount);
      console.groupEnd();
    }

    // メモリ使用量
    if (stats.memory) {
      console.group('Memory Usage');
      console.log(`Used: ${stats.memory.used}MB`);
      console.log(`Total: ${stats.memory.total}MB`);
      console.log(`Limit: ${stats.memory.limit}MB`);
      console.groupEnd();
    }

    console.groupEnd();
  }

  /**
   * 統計をリセット
   */
  reset() {
    this.metrics.clear();
    this.renderTimes = [];
    console.log('Performance metrics reset');
  }

  /**
   * レンダーループの装飾関数
   * @param {Function} renderFunc - 元のレンダー関数
   * @returns {Function} 装飾されたレンダー関数
   */
  decorateRenderFunction(renderFunc) {
    return (...args) => {
      if (!this.enabled) return renderFunc(...args);

      const start = performance.now();
      const result = renderFunc(...args);
      const end = performance.now();
      
      this.recordRenderTime(end - start);
      return result;
    };
  }

  /**
   * 関数を自動監視用に装飾
   * @param {Object} target - 対象オブジェクト
   * @param {string} methodName - メソッド名
   * @param {string} [displayName] - 表示名
   */
  decorateMethod(target, methodName, displayName = null) {
    if (!target[methodName] || typeof target[methodName] !== 'function') {
      console.warn(`Method ${methodName} not found on target`);
      return;
    }

    const originalMethod = target[methodName];
    const monitorName = displayName || `${target.constructor.name}.${methodName}`;

    target[methodName] = (...args) => {
      return this.measure(monitorName, () => originalMethod.apply(target, args));
    };
  }
}

// シングルトンインスタンス
const performanceMonitor = new PerformanceMonitor();

// 開発時のデバッグ用にwindowに公開
if (typeof window !== 'undefined') {
  window.performanceMonitor = performanceMonitor;
}

export default performanceMonitor;

/**
 * 便利な関数をエクスポート
 */
export const enablePerformanceMonitoring = (enabled = true) => performanceMonitor.setEnabled(enabled);
export const measurePerformance = (name, func) => performanceMonitor.measure(name, func);
export const measurePerformanceAsync = (name, func) => performanceMonitor.measureAsync(name, func);
export const recordRenderTime = (time) => performanceMonitor.recordRenderTime(time);
export const getPerformanceStats = () => performanceMonitor.getStats();
export const logPerformanceStats = () => performanceMonitor.logStats();
export const resetPerformanceStats = () => performanceMonitor.reset();
export const decorateRenderFunction = (func) => performanceMonitor.decorateRenderFunction(func);

// --- 重要度評価専用のパフォーマンス測定関数 ---

/**
 * 重要度評価処理のパフォーマンスを測定する
 * @param {number} elementCount - 処理対象要素数
 * @param {Function} callback - 評価処理関数
 * @returns {Object} 処理結果とメトリクス
 */
export function measureImportanceEvaluation(elementCount, callback) {
  const startTime = performance.now();
  const startMemory = performance.memory?.usedJSHeapSize || 0;
  
  console.log(`Starting importance evaluation for ${elementCount} elements`);
  
  let result;
  let error = null;
  
  try {
    result = callback();
  } catch (e) {
    error = e;
    console.error('Error during importance evaluation:', e);
  }
  
  const endTime = performance.now();
  const endMemory = performance.memory?.usedJSHeapSize || 0;
  
  const duration = endTime - startTime;
  const memoryUsed = endMemory - startMemory;
  
  const metrics = {
    elementCount,
    duration: Math.round(duration * 100) / 100,
    memoryUsed: Math.round(memoryUsed / 1024 / 1024 * 100) / 100, // MB
    elementsPerSecond: elementCount > 0 ? Math.round(elementCount / (duration / 1000)) : 0,
    memoryPerElement: elementCount > 0 ? Math.round(memoryUsed / elementCount) : 0,
    timestamp: new Date().toISOString(),
    hasError: !!error
  };
  
  // メトリクスを記録
  performanceMonitor.recordMetric('importanceEvaluation', duration, {
    elementCount,
    memoryUsed: metrics.memoryUsed,
    error: !!error
  });
  
  console.log(`Importance evaluation metrics:`, metrics);
  
  // パフォーマンス警告
  if (duration > 1000) {
    console.warn(`⚠️ Slow importance evaluation: ${duration.toFixed(2)}ms for ${elementCount} elements`);
  }
  
  if (metrics.memoryUsed > 50) { // 50MB
    console.warn(`⚠️ High memory usage in importance evaluation: ${metrics.memoryUsed}MB`);
  }
  
  if (metrics.elementsPerSecond < 100) {
    console.warn(`⚠️ Low processing rate: ${metrics.elementsPerSecond} elements/second`);
  }
  
  if (error) {
    throw error;
  }
  
  return { result, metrics };
}

/**
 * 重要度評価プロファイラークラス
 */
export class ImportancePerformanceProfiler {
  constructor() {
    this.samples = [];
    this.maxSamples = 100;
    this.thresholds = {
      slowDuration: 500,      // 500ms以上で遅い
      highMemory: 25,         // 25MB以上で高メモリ使用
      lowProcessingRate: 200  // 200要素/秒以下で低速
    };
  }
  
  /**
   * プロファイリング付きで重要度評価を実行
   * @param {number} elementCount - 要素数
   * @param {Function} callback - 評価処理関数
   * @returns {any} 処理結果
   */
  profile(elementCount, callback) {
    const { result, metrics } = measureImportanceEvaluation(elementCount, callback);
    
    // サンプルを記録
    this.samples.push(metrics);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
    
    // 異常検知
    this.detectAnomalies(metrics);
    
    return result;
  }
  
  /**
   * 統計情報を取得
   * @returns {Object|null} 統計データ
   */
  getStats() {
    if (this.samples.length === 0) return null;
    
    const durations = this.samples.map(s => s.duration);
    const memoryUsages = this.samples.map(s => s.memoryUsed);
    const processingRates = this.samples.map(s => s.elementsPerSecond);
    const elementCounts = this.samples.map(s => s.elementCount);
    
    return {
      sampleCount: this.samples.length,
      
      // 処理時間統計
      duration: {
        avg: this.calculateAverage(durations),
        min: Math.min(...durations),
        max: Math.max(...durations),
        median: this.calculateMedian(durations)
      },
      
      // メモリ使用量統計
      memory: {
        avg: this.calculateAverage(memoryUsages),
        min: Math.min(...memoryUsages),
        max: Math.max(...memoryUsages),
        median: this.calculateMedian(memoryUsages)
      },
      
      // 処理速度統計
      processingRate: {
        avg: this.calculateAverage(processingRates),
        min: Math.min(...processingRates),
        max: Math.max(...processingRates),
        median: this.calculateMedian(processingRates)
      },
      
      // 要素数統計
      elementCount: {
        avg: this.calculateAverage(elementCounts),
        min: Math.min(...elementCounts),
        max: Math.max(...elementCounts),
        total: elementCounts.reduce((sum, count) => sum + count, 0)
      },
      
      // パフォーマンス分析
      performance: {
        slowSamples: this.samples.filter(s => s.duration > this.thresholds.slowDuration).length,
        highMemorySamples: this.samples.filter(s => s.memoryUsed > this.thresholds.highMemory).length,
        lowRateSamples: this.samples.filter(s => s.elementsPerSecond < this.thresholds.lowProcessingRate).length,
        errorSamples: this.samples.filter(s => s.hasError).length
      }
    };
  }
  
  /**
   * 詳細レポートを生成
   * @returns {string} レポート文字列
   */
  generateReport() {
    const stats = this.getStats();
    if (!stats) {
      return 'No profiling data available';
    }
    
    const lines = [];
    lines.push('=== Importance Evaluation Performance Report ===');
    lines.push(`Sample Count: ${stats.sampleCount}`);
    lines.push('');
    
    lines.push('Processing Time:');
    lines.push(`  Average: ${stats.duration.avg.toFixed(2)}ms`);
    lines.push(`  Min: ${stats.duration.min.toFixed(2)}ms`);
    lines.push(`  Max: ${stats.duration.max.toFixed(2)}ms`);
    lines.push(`  Median: ${stats.duration.median.toFixed(2)}ms`);
    lines.push('');
    
    lines.push('Memory Usage:');
    lines.push(`  Average: ${stats.memory.avg.toFixed(2)}MB`);
    lines.push(`  Min: ${stats.memory.min.toFixed(2)}MB`);
    lines.push(`  Max: ${stats.memory.max.toFixed(2)}MB`);
    lines.push(`  Median: ${stats.memory.median.toFixed(2)}MB`);
    lines.push('');
    
    lines.push('Processing Rate:');
    lines.push(`  Average: ${stats.processingRate.avg.toFixed(0)} elements/sec`);
    lines.push(`  Min: ${stats.processingRate.min.toFixed(0)} elements/sec`);
    lines.push(`  Max: ${stats.processingRate.max.toFixed(0)} elements/sec`);
    lines.push(`  Median: ${stats.processingRate.median.toFixed(0)} elements/sec`);
    lines.push('');
    
    lines.push('Performance Issues:');
    lines.push(`  Slow samples (>${this.thresholds.slowDuration}ms): ${stats.performance.slowSamples}`);
    lines.push(`  High memory samples (>${this.thresholds.highMemory}MB): ${stats.performance.highMemorySamples}`);
    lines.push(`  Low rate samples (<${this.thresholds.lowProcessingRate} elem/s): ${stats.performance.lowRateSamples}`);
    lines.push(`  Error samples: ${stats.performance.errorSamples}`);
    lines.push('');
    
    lines.push('Total Elements Processed: ' + stats.elementCount.total.toLocaleString());
    lines.push(`Report generated at: ${new Date().toISOString()}`);
    
    return lines.join('\n');
  }
  
  /**
   * 異常を検知して警告を出力
   * @private
   * @param {Object} metrics - メトリクス
   */
  detectAnomalies(metrics) {
    const anomalies = [];
    
    if (metrics.duration > this.thresholds.slowDuration) {
      anomalies.push(`Slow processing: ${metrics.duration.toFixed(2)}ms`);
    }
    
    if (metrics.memoryUsed > this.thresholds.highMemory) {
      anomalies.push(`High memory usage: ${metrics.memoryUsed.toFixed(2)}MB`);
    }
    
    if (metrics.elementsPerSecond < this.thresholds.lowProcessingRate) {
      anomalies.push(`Low processing rate: ${metrics.elementsPerSecond} elements/sec`);
    }
    
    if (anomalies.length > 0) {
      console.warn('🚨 Performance anomalies detected:', anomalies);
    }
  }
  
  /**
   * 平均値を計算
   * @private
   */
  calculateAverage(values) {
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }
  
  /**
   * 中央値を計算
   * @private
   */
  calculateMedian(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
  }
  
  /**
   * サンプルをクリア
   */
  clear() {
    this.samples = [];
    console.log('Importance profiler samples cleared');
  }
  
  /**
   * 閾値を更新
   * @param {Object} newThresholds - 新しい閾値
   */
  updateThresholds(newThresholds) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    console.log('Importance profiler thresholds updated:', this.thresholds);
  }
}

// グローバルプロファイラーインスタンス
let globalImportanceProfiler = null;

/**
 * グローバル重要度プロファイラーを取得
 * @returns {ImportancePerformanceProfiler} プロファイラーインスタンス
 */
export function getImportanceProfiler() {
  if (!globalImportanceProfiler) {
    globalImportanceProfiler = new ImportancePerformanceProfiler();
    
    // 開発時のデバッグ用にwindowに公開
    if (typeof window !== 'undefined') {
      window.importanceProfiler = globalImportanceProfiler;
    }
  }
  return globalImportanceProfiler;
}

/**
 * 重要度評価のバッチ処理パフォーマンス測定
 * @param {Array} batches - バッチリスト
 * @param {Function} processBatch - バッチ処理関数
 * @returns {Object} 処理結果とメトリクス
 */
export async function measureBatchImportanceEvaluation(batches, processBatch) {
  const startTime = performance.now();
  const startMemory = performance.memory?.usedJSHeapSize || 0;
  
  const results = [];
  const batchMetrics = [];
  let totalElements = 0;
  
  console.log(`Starting batch importance evaluation for ${batches.length} batches`);
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchStartTime = performance.now();
    
    try {
      const batchResult = await processBatch(batch, i);
      results.push(batchResult);
      
      const batchDuration = performance.now() - batchStartTime;
      const batchElementCount = Array.isArray(batch) ? batch.length : (batch.elementCount || 0);
      totalElements += batchElementCount;
      
      batchMetrics.push({
        batchIndex: i,
        elementCount: batchElementCount,
        duration: batchDuration,
        elementsPerSecond: batchElementCount / (batchDuration / 1000)
      });
      
      console.log(`Batch ${i + 1}/${batches.length} completed: ${batchElementCount} elements in ${batchDuration.toFixed(2)}ms`);
      
    } catch (error) {
      console.error(`Error in batch ${i}:`, error);
      batchMetrics.push({
        batchIndex: i,
        elementCount: 0,
        duration: performance.now() - batchStartTime,
        error: error.message
      });
    }
  }
  
  const endTime = performance.now();
  const endMemory = performance.memory?.usedJSHeapSize || 0;
  
  const totalDuration = endTime - startTime;
  const totalMemoryUsed = endMemory - startMemory;
  
  const overallMetrics = {
    batchCount: batches.length,
    totalElements,
    totalDuration: Math.round(totalDuration * 100) / 100,
    totalMemoryUsed: Math.round(totalMemoryUsed / 1024 / 1024 * 100) / 100,
    averageBatchTime: Math.round(totalDuration / batches.length * 100) / 100,
    overallElementsPerSecond: Math.round(totalElements / (totalDuration / 1000)),
    successfulBatches: batchMetrics.filter(b => !b.error).length,
    failedBatches: batchMetrics.filter(b => b.error).length,
    batchMetrics
  };
  
  console.log(`Batch importance evaluation completed:`, overallMetrics);
  
  return {
    results,
    metrics: overallMetrics
  };
}
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
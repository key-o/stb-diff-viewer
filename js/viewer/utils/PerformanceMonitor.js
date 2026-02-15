/**
 * @fileoverview パフォーマンスモニターモジュール
 *
 * FPS、メモリ使用量、レンダリング統計をリアルタイムで計測・表示します。
 * 開発時のパフォーマンス分析に使用します。
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('viewer:PerformanceMonitor');

/**
 * パフォーマンス計測クラス
 */
class PerformanceMonitor {
  constructor() {
    /** @type {number[]} 直近のフレーム時間（ms） */
    this.frameTimes = [];

    /** @type {number} フレーム時間の保持数 */
    this.maxFrameSamples = 60;

    /** @type {number} 最後のフレーム時刻 */
    this.lastFrameTime = 0;

    /** @type {boolean} 計測中かどうか */
    this.isRunning = false;

    /** @type {Object} 計測結果 */
    this.stats = {
      fps: 0,
      avgFrameTime: 0,
      minFrameTime: Infinity,
      maxFrameTime: 0,
      drawCalls: 0,
      triangles: 0,
      geometries: 0,
      textures: 0,
    };

    /** @type {Map<string, number>} カスタムマーク */
    this.marks = new Map();

    /** @type {Array<{name: string, duration: number}>} 計測履歴 */
    this.measurements = [];

    /** @type {number} 履歴の最大保持数 */
    this.maxMeasurements = 100;

    /** @type {HTMLElement|null} 表示用DOM要素 */
    this.displayElement = null;

    /** @type {number|null} 更新タイマーID */
    this.updateIntervalId = null;
  }

  /**
   * 計測を開始
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastFrameTime = performance.now();
    log.info('PerformanceMonitor started');
  }

  /**
   * 計測を停止
   */
  stop() {
    this.isRunning = false;

    if (this.updateIntervalId) {
      clearInterval(this.updateIntervalId);
      this.updateIntervalId = null;
    }

    log.info('PerformanceMonitor stopped');
  }

  /**
   * フレーム開始時に呼び出し
   */
  beginFrame() {
    if (!this.isRunning) return;

    this.marks.set('frame', performance.now());
  }

  /**
   * フレーム終了時に呼び出し
   */
  endFrame() {
    if (!this.isRunning) return;

    const now = performance.now();
    const frameTime = now - this.lastFrameTime;
    this.lastFrameTime = now;

    // フレーム時間を記録
    this.frameTimes.push(frameTime);
    if (this.frameTimes.length > this.maxFrameSamples) {
      this.frameTimes.shift();
    }

    // 統計を更新
    this.updateStats();
  }

  /**
   * 統計情報を更新
   * @private
   */
  updateStats() {
    if (this.frameTimes.length === 0) return;

    const sum = this.frameTimes.reduce((a, b) => a + b, 0);
    this.stats.avgFrameTime = sum / this.frameTimes.length;
    this.stats.fps = 1000 / this.stats.avgFrameTime;
    this.stats.minFrameTime = Math.min(...this.frameTimes);
    this.stats.maxFrameTime = Math.max(...this.frameTimes);
  }

  /**
   * レンダラー統計を更新
   * @param {THREE.WebGLRenderer} renderer
   */
  updateRendererStats(renderer) {
    if (!renderer || !renderer.info) return;

    const info = renderer.info;
    this.stats.drawCalls = info.render?.calls || 0;
    this.stats.triangles = info.render?.triangles || 0;
    this.stats.geometries = info.memory?.geometries || 0;
    this.stats.textures = info.memory?.textures || 0;
  }

  /**
   * カスタム計測を開始
   * @param {string} name - 計測名
   */
  mark(name) {
    this.marks.set(name, performance.now());
  }

  /**
   * カスタム計測を終了
   * @param {string} name - 計測名
   * @returns {number} 経過時間（ms）
   */
  measure(name) {
    const startTime = this.marks.get(name);
    if (startTime === undefined) {
      log.warn(`Mark not found: ${name}`);
      return 0;
    }

    const duration = performance.now() - startTime;
    this.marks.delete(name);

    // 履歴に追加
    this.measurements.push({ name, duration });
    if (this.measurements.length > this.maxMeasurements) {
      this.measurements.shift();
    }

    return duration;
  }

  /**
   * 計測結果をログ出力
   * @param {string} name - 計測名
   */
  logMeasure(name) {
    const duration = this.measure(name);
    log.info(`[Perf] ${name}: ${duration.toFixed(2)}ms`);
    return duration;
  }

  /**
   * 現在の統計情報を取得
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      frameCount: this.frameTimes.length,
    };
  }

  /**
   * 計測履歴を取得
   * @param {string} [name] - フィルタする計測名（省略時は全件）
   * @returns {Array}
   */
  getMeasurements(name = null) {
    if (name) {
      return this.measurements.filter((m) => m.name === name);
    }
    return [...this.measurements];
  }

  /**
   * 計測履歴の統計を取得
   * @param {string} name - 計測名
   * @returns {Object}
   */
  getMeasurementStats(name) {
    const filtered = this.getMeasurements(name);
    if (filtered.length === 0) {
      return { count: 0, avg: 0, min: 0, max: 0 };
    }

    const durations = filtered.map((m) => m.duration);
    return {
      count: durations.length,
      avg: durations.reduce((a, b) => a + b, 0) / durations.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
    };
  }

  /**
   * 画面上に統計を表示するDOM要素を作成
   * @param {HTMLElement} container - 親要素
   */
  createDisplay(container) {
    this.displayElement = document.createElement('div');
    this.displayElement.id = 'performance-monitor';
    this.displayElement.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.8);
      color: #0f0;
      font-family: var(--font-family-monospace);
      font-size: var(--font-size-sm);
      padding: 10px;
      border-radius: 4px;
      z-index: 10000;
      pointer-events: none;
      min-width: 150px;
    `;

    container.appendChild(this.displayElement);

    // 定期更新
    this.updateIntervalId = setInterval(() => {
      this.updateDisplay();
    }, 200);
  }

  /**
   * 表示を更新
   * @private
   */
  updateDisplay() {
    if (!this.displayElement) return;

    const s = this.stats;
    this.displayElement.innerHTML = `
      <div style="color: ${s.fps >= 55 ? '#0f0' : s.fps >= 30 ? '#ff0' : '#f00'}">
        FPS: ${s.fps.toFixed(1)}
      </div>
      <div>Frame: ${s.avgFrameTime.toFixed(2)}ms</div>
      <div style="font-size: var(--font-size-xs); color: #888; margin-top: 5px;">
        Draw: ${s.drawCalls}<br>
        Tris: ${(s.triangles / 1000).toFixed(1)}K<br>
        Geom: ${s.geometries}<br>
        Tex: ${s.textures}
      </div>
    `;
  }

  /**
   * 表示を削除
   */
  removeDisplay() {
    if (this.displayElement && this.displayElement.parentNode) {
      this.displayElement.parentNode.removeChild(this.displayElement);
      this.displayElement = null;
    }

    if (this.updateIntervalId) {
      clearInterval(this.updateIntervalId);
      this.updateIntervalId = null;
    }
  }

  /**
   * 全データをリセット
   */
  reset() {
    this.frameTimes = [];
    this.marks.clear();
    this.measurements = [];
    this.stats = {
      fps: 0,
      avgFrameTime: 0,
      minFrameTime: Infinity,
      maxFrameTime: 0,
      drawCalls: 0,
      triangles: 0,
      geometries: 0,
      textures: 0,
    };
  }
}

// シングルトンインスタンス
let instance = null;

/**
 * グローバルなPerformanceMonitorインスタンスを取得
 * @returns {PerformanceMonitor}
 */
export function getPerformanceMonitor() {
  if (!instance) {
    instance = new PerformanceMonitor();
  }
  return instance;
}


/**
 * 非同期関数のパフォーマンス計測
 * @param {string} name - 計測名
 * @param {Function} fn - 計測する関数
 * @returns {Promise<any>}
 */
export async function measureAsync(name, fn) {
  const monitor = getPerformanceMonitor();
  monitor.mark(name);
  try {
    const result = await fn();
    monitor.logMeasure(name);
    return result;
  } catch (error) {
    monitor.logMeasure(name);
    throw error;
  }
}

/**
 * 同期関数のパフォーマンス計測
 * @param {string} name - 計測名
 * @param {Function} fn - 計測する関数
 * @returns {any}
 */
export function measureSync(name, fn) {
  const monitor = getPerformanceMonitor();
  monitor.mark(name);
  try {
    const result = fn();
    monitor.logMeasure(name);
    return result;
  } catch (error) {
    monitor.logMeasure(name);
    throw error;
  }
}

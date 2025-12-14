/**
 * @fileoverview ジオメトリキャッシュモジュール
 *
 * 同じ断面形状を持つ要素のジオメトリを再利用することで、
 * メモリ使用量とジオメトリ生成時間を削減します。
 *
 * 例: 同じH鋼断面(H-400x200x8x13)の柱が100本ある場合、
 * ジオメトリは1つだけ生成してクローンまたは共有します。
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('geometry:cache');

/**
 * キャッシュエントリの構造
 * @typedef {Object} CacheEntry
 * @property {THREE.BufferGeometry} geometry - キャッシュされたジオメトリ
 * @property {number} refCount - 参照カウント
 * @property {number} lastAccess - 最終アクセス時刻
 * @property {number} size - 概算メモリサイズ（バイト）
 */

/**
 * キャッシュ統計情報
 * @typedef {Object} CacheStats
 * @property {number} hits - キャッシュヒット数
 * @property {number} misses - キャッシュミス数
 * @property {number} entries - 現在のエントリ数
 * @property {number} totalSize - 概算総メモリサイズ
 */

/**
 * ジオメトリキャッシュマネージャー
 *
 * 断面形状に基づいてジオメトリをキャッシュし、
 * 同一形状の要素間でジオメトリを共有します。
 */
class GeometryCacheManager {
  constructor() {
    /** @type {Map<string, CacheEntry>} */
    this.cache = new Map();

    /** @type {CacheStats} */
    this.stats = {
      hits: 0,
      misses: 0,
      entries: 0,
      totalSize: 0
    };

    /** @type {number} 最大キャッシュエントリ数 */
    this.maxEntries = 500;

    /** @type {number} 最大キャッシュサイズ（バイト） */
    this.maxSize = 100 * 1024 * 1024; // 100MB

    /** @type {boolean} キャッシュが有効かどうか */
    this.enabled = true;
  }

  /**
   * キャッシュキーを生成
   *
   * 断面形状のパラメータから一意のキーを生成します。
   *
   * @param {string} shapeType - 形状タイプ（H, BOX, Pipe等）
   * @param {Object} params - 形状パラメータ
   * @param {number} [length] - 押し出し長さ（オプション）
   * @returns {string} キャッシュキー
   */
  generateKey(shapeType, params, length = null) {
    const paramStr = Object.entries(params)
      .filter(([_, v]) => v !== undefined && v !== null)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${typeof v === 'number' ? v.toFixed(2) : v}`)
      .join('|');

    const lengthStr = length !== null ? `@L${length.toFixed(0)}` : '';

    return `${shapeType}[${paramStr}]${lengthStr}`;
  }

  /**
   * 断面データからキャッシュキーを生成
   *
   * @param {Object} sectionData - 断面データオブジェクト
   * @param {number} [length] - 押し出し長さ
   * @returns {string} キャッシュキー
   */
  generateKeyFromSection(sectionData, length = null) {
    const shapeType = sectionData.shapeTypeAttr ||
                      sectionData.elementTag ||
                      sectionData.type ||
                      'unknown';

    // 主要なパラメータを抽出
    const params = {};

    // 鉄骨断面パラメータ
    if (sectionData.A !== undefined) params.A = sectionData.A;
    if (sectionData.B !== undefined) params.B = sectionData.B;
    if (sectionData.t1 !== undefined) params.t1 = sectionData.t1;
    if (sectionData.t2 !== undefined) params.t2 = sectionData.t2;
    if (sectionData.r1 !== undefined) params.r1 = sectionData.r1;
    if (sectionData.r2 !== undefined) params.r2 = sectionData.r2;

    // RC断面パラメータ
    if (sectionData.D !== undefined) params.D = sectionData.D;
    if (sectionData.width !== undefined) params.width = sectionData.width;
    if (sectionData.height !== undefined) params.height = sectionData.height;
    if (sectionData.depth !== undefined) params.depth = sectionData.depth;

    // 円形パラメータ
    if (sectionData.diameter !== undefined) params.diameter = sectionData.diameter;
    if (sectionData.radius !== undefined) params.radius = sectionData.radius;

    return this.generateKey(shapeType, params, length);
  }

  /**
   * キャッシュからジオメトリを取得
   *
   * @param {string} key - キャッシュキー
   * @returns {THREE.BufferGeometry|null} キャッシュされたジオメトリ、またはnull
   */
  get(key) {
    if (!this.enabled) return null;

    const entry = this.cache.get(key);
    if (entry) {
      this.stats.hits++;
      entry.lastAccess = Date.now();
      entry.refCount++;
      log.debug(`Cache hit: ${key} (refs: ${entry.refCount})`);
      return entry.geometry;
    }

    this.stats.misses++;
    return null;
  }

  /**
   * ジオメトリをキャッシュに追加
   *
   * @param {string} key - キャッシュキー
   * @param {THREE.BufferGeometry} geometry - キャッシュするジオメトリ
   * @returns {THREE.BufferGeometry} キャッシュされたジオメトリ
   */
  set(key, geometry) {
    if (!this.enabled) return geometry;

    // 既存エントリがある場合は更新
    if (this.cache.has(key)) {
      const entry = this.cache.get(key);
      entry.lastAccess = Date.now();
      entry.refCount++;
      return entry.geometry;
    }

    // キャッシュサイズチェック
    if (this.cache.size >= this.maxEntries) {
      this.evictLRU();
    }

    const size = this.estimateGeometrySize(geometry);

    if (this.stats.totalSize + size > this.maxSize) {
      this.evictUntilFits(size);
    }

    const entry = {
      geometry: geometry,
      refCount: 1,
      lastAccess: Date.now(),
      size: size
    };

    this.cache.set(key, entry);
    this.stats.entries = this.cache.size;
    this.stats.totalSize += size;

    log.debug(`Cache set: ${key} (size: ${(size / 1024).toFixed(1)}KB)`);

    return geometry;
  }

  /**
   * キャッシュからジオメトリを取得、なければ作成してキャッシュ
   *
   * @param {string} key - キャッシュキー
   * @param {function(): THREE.BufferGeometry} createFn - ジオメトリ生成関数
   * @returns {THREE.BufferGeometry} ジオメトリ
   */
  getOrCreate(key, createFn) {
    let geometry = this.get(key);

    if (!geometry) {
      geometry = createFn();
      if (geometry) {
        this.set(key, geometry);
      }
    }

    return geometry;
  }

  /**
   * 断面データからジオメトリを取得または作成
   *
   * @param {Object} sectionData - 断面データ
   * @param {number} length - 押し出し長さ
   * @param {function(): THREE.BufferGeometry} createFn - 生成関数
   * @returns {THREE.BufferGeometry} ジオメトリ
   */
  getOrCreateFromSection(sectionData, length, createFn) {
    const key = this.generateKeyFromSection(sectionData, length);
    return this.getOrCreate(key, createFn);
  }

  /**
   * ジオメトリのメモリサイズを概算
   *
   * @param {THREE.BufferGeometry} geometry
   * @returns {number} 概算サイズ（バイト）
   */
  estimateGeometrySize(geometry) {
    let size = 0;

    if (geometry.attributes) {
      for (const attr of Object.values(geometry.attributes)) {
        if (attr.array) {
          size += attr.array.byteLength;
        }
      }
    }

    if (geometry.index && geometry.index.array) {
      size += geometry.index.array.byteLength;
    }

    return size || 1024; // 最小サイズ
  }

  /**
   * LRU方式で古いエントリを削除
   *
   * @param {number} [count=1] - 削除するエントリ数
   */
  evictLRU(count = 1) {
    const entries = Array.from(this.cache.entries())
      .filter(([_, entry]) => entry.refCount <= 1)
      .sort((a, b) => a[1].lastAccess - b[1].lastAccess);

    for (let i = 0; i < Math.min(count, entries.length); i++) {
      const [key, entry] = entries[i];
      this.stats.totalSize -= entry.size;
      entry.geometry.dispose();
      this.cache.delete(key);
      log.debug(`Cache evicted (LRU): ${key}`);
    }

    this.stats.entries = this.cache.size;
  }

  /**
   * 指定サイズが収まるまでエントリを削除
   *
   * @param {number} requiredSize - 必要なサイズ
   */
  evictUntilFits(requiredSize) {
    while (this.stats.totalSize + requiredSize > this.maxSize && this.cache.size > 0) {
      this.evictLRU(1);
    }
  }

  /**
   * 参照カウントをデクリメント
   *
   * @param {string} key - キャッシュキー
   */
  release(key) {
    const entry = this.cache.get(key);
    if (entry && entry.refCount > 0) {
      entry.refCount--;
    }
  }

  /**
   * キャッシュをクリア
   *
   * @param {boolean} [disposeGeometries=true] - ジオメトリをdisposeするか
   */
  clear(disposeGeometries = true) {
    if (disposeGeometries) {
      for (const entry of this.cache.values()) {
        entry.geometry.dispose();
      }
    }

    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      entries: 0,
      totalSize: 0
    };

    log.info('Geometry cache cleared');
  }

  /**
   * キャッシュ統計を取得
   *
   * @returns {CacheStats & {hitRate: number}}
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(1) : 0,
      totalSizeMB: (this.stats.totalSize / (1024 * 1024)).toFixed(2)
    };
  }

  /**
   * キャッシュの有効/無効を設定
   *
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.clear();
    }
  }

  /**
   * デバッグ情報を出力
   */
  debugPrint() {
    const stats = this.getStats();
    console.log('=== Geometry Cache Stats ===');
    console.log(`Entries: ${stats.entries}`);
    console.log(`Hits: ${stats.hits}, Misses: ${stats.misses}`);
    console.log(`Hit Rate: ${stats.hitRate}%`);
    console.log(`Total Size: ${stats.totalSizeMB} MB`);
    console.log('============================');
  }
}

// シングルトンインスタンス
const geometryCache = new GeometryCacheManager();

/**
 * グローバルジオメトリキャッシュを取得
 * @returns {GeometryCacheManager}
 */
export function getGeometryCache() {
  return geometryCache;
}

/**
 * キャッシュ付きでジオメトリを取得または作成
 *
 * @param {string} key - キャッシュキー
 * @param {function(): THREE.BufferGeometry} createFn - 生成関数
 * @returns {THREE.BufferGeometry}
 */
export function getCachedGeometry(key, createFn) {
  return geometryCache.getOrCreate(key, createFn);
}

/**
 * 断面データからキャッシュキーを生成
 *
 * @param {Object} sectionData - 断面データ
 * @param {number} [length] - 押し出し長さ
 * @returns {string}
 */
export function generateSectionCacheKey(sectionData, length = null) {
  return geometryCache.generateKeyFromSection(sectionData, length);
}

/**
 * キャッシュをクリア
 */
export function clearGeometryCache() {
  geometryCache.clear();
}

/**
 * キャッシュ統計を取得
 * @returns {Object}
 */
export function getGeometryCacheStats() {
  return geometryCache.getStats();
}

/**
 * キャッシュの有効/無効を設定
 * @param {boolean} enabled
 */
export function setGeometryCacheEnabled(enabled) {
  geometryCache.setEnabled(enabled);
}

export { GeometryCacheManager };

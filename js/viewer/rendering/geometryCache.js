/**
 * @fileoverview ジオメトリキャッシュモジュール
 *
 * Three.jsジオメトリの効率的なキャッシュ管理を提供します。
 * 同一のジオメトリを複数の要素で共有することで、メモリ使用量を削減します。
 */

/**
 * ジオメトリキャッシュクラス
 *
 * 同じ形状のジオメトリを再利用することで、メモリ使用量とジオメトリ生成時間を削減します。
 * キーはジオメトリの種類・パラメータから生成します。
 *
 * @example
 * const cache = new GeometryCache();
 * const box1 = cache.getOrCreate('box_100x100x100', () => new THREE.BoxGeometry(100, 100, 100));
 * const box2 = cache.getOrCreate('box_100x100x100', () => new THREE.BoxGeometry(100, 100, 100));
 * // box1 === box2 (同じ参照)
 */
export class GeometryCache {
  constructor() {
    /** @type {Map<string, THREE.BufferGeometry>} キャッシュされたジオメトリ */
    this.cache = new Map();

    /** @type {Map<string, number>} 各ジオメトリの参照カウント */
    this.refCounts = new Map();

    /** @type {number} キャッシュヒット数（統計用） */
    this.hits = 0;

    /** @type {number} キャッシュミス数（統計用） */
    this.misses = 0;
  }

  /**
   * キャッシュからジオメトリを取得、なければ作成してキャッシュ
   *
   * @param {string} key - キャッシュキー
   * @param {Function} createFn - ジオメトリ生成関数
   * @returns {THREE.BufferGeometry} ジオメトリ（キャッシュから取得または新規作成）
   */
  getOrCreate(key, createFn) {
    if (this.cache.has(key)) {
      this.hits++;
      this.refCounts.set(key, (this.refCounts.get(key) || 0) + 1);
      return this.cache.get(key);
    }

    this.misses++;
    const geometry = createFn();
    this.cache.set(key, geometry);
    this.refCounts.set(key, 1);
    return geometry;
  }

  /**
   * ジオメトリがキャッシュに存在するか確認
   *
   * @param {string} key - キャッシュキー
   * @returns {boolean} 存在する場合true
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * キャッシュからジオメトリを取得（存在しない場合はnull）
   *
   * @param {string} key - キャッシュキー
   * @returns {THREE.BufferGeometry|null}
   */
  get(key) {
    if (this.cache.has(key)) {
      this.hits++;
      this.refCounts.set(key, (this.refCounts.get(key) || 0) + 1);
      return this.cache.get(key);
    }
    return null;
  }

  /**
   * 参照カウントを減らす
   *
   * @param {string} key - キャッシュキー
   */
  release(key) {
    if (!this.refCounts.has(key)) return;

    const count = this.refCounts.get(key) - 1;
    if (count <= 0) {
      this.refCounts.delete(key);
      // 参照がなくなっても、すぐには削除しない（再利用の可能性のため）
      // 明示的なpurge()呼び出しで削除
    } else {
      this.refCounts.set(key, count);
    }
  }

  /**
   * 参照されていないジオメトリを削除
   */
  purgeUnused() {
    const keysToDelete = [];

    for (const [key, count] of this.refCounts) {
      if (count <= 0) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      const geometry = this.cache.get(key);
      if (geometry) {
        geometry.dispose();
      }
      this.cache.delete(key);
      this.refCounts.delete(key);
    }

    return keysToDelete.length;
  }

  /**
   * キャッシュを完全にクリア
   */
  clear() {
    for (const geometry of this.cache.values()) {
      geometry.dispose();
    }
    this.cache.clear();
    this.refCounts.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * キャッシュ統計情報を取得
   *
   * @returns {Object} 統計情報
   */
  getStats() {
    const totalRefs = Array.from(this.refCounts.values()).reduce((sum, v) => sum + v, 0);
    const hitRate = this.hits + this.misses > 0 ? this.hits / (this.hits + this.misses) : 0;

    return {
      cachedGeometries: this.cache.size,
      totalReferences: totalRefs,
      hits: this.hits,
      misses: this.misses,
      hitRate: (hitRate * 100).toFixed(1) + '%',
      estimatedMemorySavedKB: Math.round((totalRefs - this.cache.size) * 50), // 概算: 1ジオメトリ約50KB
    };
  }
}

/**
 * ジオメトリキーの生成ヘルパー
 */
export const GeometryKeyGenerator = {
  /**
   * プロファイルベースのジオメトリキーを生成
   *
   * @param {string} profileType - プロファイルタイプ ('H', 'BOX', 'L', etc.)
   * @param {Object} params - パラメータオブジェクト
   * @returns {string} キャッシュキー
   */
  fromProfile(profileType, params) {
    const values = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(2) : v}`)
      .join('|');
    return `profile:${profileType}:${values}`;
  },

  /**
   * 断面名からジオメトリキーを生成
   *
   * @param {string} sectionName - 断面名
   * @param {number} length - 長さ
   * @returns {string} キャッシュキー
   */
  fromSection(sectionName, length) {
    return `section:${sectionName}:L${length.toFixed(0)}`;
  },

  /**
   * プリミティブジオメトリのキーを生成
   *
   * @param {string} type - ジオメトリタイプ ('box', 'sphere', 'cylinder', etc.)
   * @param {Object} params - パラメータ
   * @returns {string} キャッシュキー
   */
  fromPrimitive(type, params) {
    const values = Object.values(params)
      .map((v) => (typeof v === 'number' ? v.toFixed(2) : v))
      .join('_');
    return `primitive:${type}:${values}`;
  },

  /**
   * ハッシュベースのキー生成（高速版）
   *
   * @param {string} prefix - プレフィックス
   * @param  {...any} values - 値（数値または文字列）
   * @returns {string} キャッシュキー
   */
  hash(prefix, ...values) {
    // シンプルなハッシュ計算（FNV-1a風）
    let hash = 2166136261;
    for (const val of values) {
      const str = typeof val === 'number' ? val.toFixed(4) : String(val);
      for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
    }
    return `${prefix}:${(hash >>> 0).toString(36)}`;
  },
};

/**
 * グローバルジオメトリキャッシュインスタンス
 */
export const globalGeometryCache = new GeometryCache();

/**
 * ジオメトリキャッシュの統計をログ出力
 */
export function logGeometryCacheStats() {
  const stats = globalGeometryCache.getStats();
  return stats;
}

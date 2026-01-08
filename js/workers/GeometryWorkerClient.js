/* global Worker */
/**
 * @fileoverview ジオメトリワーカークライアント
 *
 * Web Workerとの通信を管理し、Promise APIを提供します。
 *
 * @module StbDiffViewer/workers/GeometryWorkerClient
 */

/**
 * ジオメトリワーカークライアント
 *
 * @example
 * const client = new GeometryWorkerClient();
 * await client.initialize();
 *
 * const vertices = await client.generateProfileVertices('H', { H: 200, B: 100, tw: 5.5, tf: 8 });
 * console.log('Generated vertices:', vertices);
 *
 * client.terminate();
 */
export class GeometryWorkerClient {
  constructor() {
    /** @type {Worker|null} */
    this.worker = null;

    /** @type {Map<string, {resolve: Function, reject: Function}>} */
    this.pendingRequests = new Map();

    /** @type {number} */
    this.messageIdCounter = 0;

    /** @type {boolean} */
    this.initialized = false;

    /** @type {string|null} */
    this.workerVersion = null;
  }

  /**
   * ワーカーを初期化
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        // ワーカーのパスはプロジェクト構成に依存
        this.worker = new Worker(new URL('./geometryWorker.js', import.meta.url), {
          type: 'module',
        });

        this.worker.onmessage = (event) => this.handleMessage(event);

        this.worker.onerror = (error) => {
          console.error('[GeometryWorkerClient] Worker error:', error);
          this.handleError(error);
        };

        // 初期化確認
        this.sendRequest('ping')
          .then((result) => {
            this.workerVersion = result.version;
            this.initialized = true;
            console.log(`[GeometryWorkerClient] Initialized (version: ${result.version})`);
            resolve();
          })
          .catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * メッセージハンドラ
   * @private
   */
  handleMessage(event) {
    const { id, success, result, error } = event.data;

    const pending = this.pendingRequests.get(id);
    if (!pending) {
      console.warn('[GeometryWorkerClient] Unknown message id:', id);
      return;
    }

    this.pendingRequests.delete(id);

    if (success) {
      pending.resolve(result);
    } else {
      pending.reject(new Error(error?.message || 'Unknown worker error'));
    }
  }

  /**
   * エラーハンドラ
   * @private
   */
  handleError(error) {
    // 全ての保留中リクエストをリジェクト
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(error);
      this.pendingRequests.delete(id);
    }
  }

  /**
   * ワーカーにリクエストを送信
   * @private
   * @param {string} type - メッセージタイプ
   * @param {Object} [payload] - ペイロード
   * @param {Transferable[]} [transfer] - 転送オブジェクト
   * @returns {Promise<any>}
   */
  sendRequest(type, payload = {}, transfer = []) {
    return new Promise((resolve, reject) => {
      const id = `msg_${++this.messageIdCounter}`;

      this.pendingRequests.set(id, { resolve, reject });

      const message = { type, id, payload };

      if (transfer.length > 0) {
        this.worker.postMessage(message, transfer);
      } else {
        this.worker.postMessage(message);
      }
    });
  }

  /**
   * 断面プロファイルの頂点を生成
   * @param {string} profileType - 断面タイプ
   * @param {Object} dimensions - 寸法パラメータ
   * @returns {Promise<Float32Array>}
   */
  async generateProfileVertices(profileType, dimensions) {
    await this.ensureInitialized();
    return this.sendRequest('generateProfileVertices', { profileType, dimensions });
  }

  /**
   * 押し出しジオメトリデータを生成
   * @param {Float32Array} profileVertices - 断面頂点
   * @param {number} length - 押し出し長さ
   * @param {boolean} [closed=true] - 閉じた形状か
   * @returns {Promise<{positions: Float32Array, normals: Float32Array, indices: Uint32Array}>}
   */
  async generateExtrusionData(profileVertices, length, closed = true) {
    await this.ensureInitialized();
    return this.sendRequest('generateExtrusionData', { profileVertices, length, closed });
  }

  /**
   * バッチ変換処理
   * @param {Float32Array} positions - 頂点位置配列
   * @param {Array<Float32Array>} transforms - 変換行列配列
   * @returns {Promise<Float32Array>}
   */
  async batchTransform(positions, transforms) {
    await this.ensureInitialized();
    return this.sendRequest('batchTransform', { positions, transforms });
  }

  /**
   * バウンディングボックスを計算
   * @param {Float32Array} positions - 頂点位置配列
   * @returns {Promise<{min: Object, max: Object, center: Object, size: Object}>}
   */
  async calculateBoundingBox(positions) {
    await this.ensureInitialized();
    return this.sendRequest('calculateBoundingBox', { positions });
  }

  /**
   * 複数の頂点配列をマージ
   * @param {Array<Float32Array>} arrays - マージする配列
   * @returns {Promise<Float32Array>}
   */
  async mergeVertexArrays(arrays) {
    await this.ensureInitialized();
    return this.sendRequest('mergeVertexArrays', { arrays });
  }

  /**
   * グリッド頂点を生成
   * @param {number} width - 幅
   * @param {number} height - 高さ
   * @param {number} divisionsX - X方向分割数
   * @param {number} divisionsY - Y方向分割数
   * @returns {Promise<{positions: Float32Array, indices: Uint32Array}>}
   */
  async generateGridVertices(width, height, divisionsX, divisionsY) {
    await this.ensureInitialized();
    return this.sendRequest('generateGridVertices', { width, height, divisionsX, divisionsY });
  }

  /**
   * 初期化を確認
   * @private
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * ワーカーを終了
   */
  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.initialized = false;
      this.pendingRequests.clear();
      console.log('[GeometryWorkerClient] Terminated');
    }
  }

  /**
   * ワーカーが利用可能かどうか
   * @returns {boolean}
   */
  get isAvailable() {
    return typeof Worker !== 'undefined';
  }

  /**
   * ワーカーバージョンを取得
   * @returns {string|null}
   */
  get version() {
    return this.workerVersion;
  }
}

/**
 * 共有インスタンス
 */
let sharedInstance = null;

/**
 * 共有ワーカークライアントを取得
 * @returns {GeometryWorkerClient}
 */
export function getGeometryWorkerClient() {
  if (!sharedInstance) {
    sharedInstance = new GeometryWorkerClient();
  }
  return sharedInstance;
}

/**
 * 共有ワーカークライアントを終了
 */
export function terminateGeometryWorker() {
  if (sharedInstance) {
    sharedInstance.terminate();
    sharedInstance = null;
  }
}

/**
 * Web Worker対応かどうかを判定
 * @returns {boolean}
 */
export function isWorkerSupported() {
  return typeof Worker !== 'undefined';
}

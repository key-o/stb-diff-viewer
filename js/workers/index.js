/**
 * @fileoverview Web Workersモジュール
 *
 * メインスレッドをブロックせずに重い処理を実行するためのワーカー群。
 *
 * @module StbDiffViewer/workers
 */

export {
  GeometryWorkerClient,
  getGeometryWorkerClient,
  terminateGeometryWorker,
  isWorkerSupported,
} from './GeometryWorkerClient.js';

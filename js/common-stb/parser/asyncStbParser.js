/**
 * @fileoverview 非同期STBパーサーモジュール
 *
 * 大規模STBファイルをブロッキングなしで解析するための非同期パーサー。
 * メインスレッドをブロックせずにXML解析を行い、進捗をコールバックで報告します。
 *
 * @module common/stb/parser/asyncStbParser
 */

import { parseElements } from './stbXmlParser.js';

/**
 * デフォルト設定
 */
const DEFAULT_CONFIG = {
  /** 1バッチで処理する要素数 */
  batchSize: 100,
  /** バッチ間の遅延（ms）- 0でrequestIdleCallback使用 */
  batchDelay: 0,
  /** タイムアウト（ms）- 0で無制限 */
  timeout: 0,
  /** 進捗報告間隔（0-1）- 例: 0.1で10%ごと */
  progressInterval: 0.1,
};

/**
 * 非同期スケジューラー
 * requestIdleCallback対応環境では使用、そうでなければsetTimeoutでフォールバック
 */
const scheduleTask =
  typeof requestIdleCallback !== 'undefined'
    ? (callback) => requestIdleCallback(callback, { timeout: 50 })
    : (callback) => setTimeout(callback, 0);

/**
 * 非同期STBパーサークラス
 *
 * @example
 * const parser = new AsyncStbParser({
 *   onProgress: (progress, message) => console.log(`${progress * 100}%: ${message}`),
 *   onComplete: (result) => console.log('完了:', result),
 *   onError: (error) => console.error('エラー:', error),
 * });
 *
 * parser.parse(xmlDocument);
 */
export class AsyncStbParser {
  /**
   * @param {Object} options - オプション設定
   * @param {Function} [options.onProgress] - 進捗コールバック (progress: 0-1, message: string)
   * @param {Function} [options.onComplete] - 完了コールバック (result: Object)
   * @param {Function} [options.onError] - エラーコールバック (error: Error)
   * @param {Object} [options.config] - 解析設定
   */
  constructor(options = {}) {
    this.onProgress = options.onProgress || (() => {});
    this.onComplete = options.onComplete || (() => {});
    this.onError = options.onError || ((e) => console.error(e));
    this.config = { ...DEFAULT_CONFIG, ...options.config };

    this.aborted = false;
    this.startTime = null;
  }

  /**
   * 解析を中断
   */
  abort() {
    this.aborted = true;
  }

  /**
   * XMLドキュメントを非同期で解析
   *
   * @param {Document} xmlDoc - パース対象のXMLドキュメント
   * @returns {Promise<Object>} 解析結果
   */
  async parse(xmlDoc) {
    this.aborted = false;
    this.startTime = performance.now();

    try {
      const result = {
        nodes: null,
        stories: null,
        axes: null,
        columns: [],
        girders: [],
        beams: [],
        braces: [],
        posts: [],
        slabs: [],
        walls: [],
        piles: [],
        footings: [],
        foundationColumns: [],
        stripFootings: [],
        parapets: [],
        openings: [],
        joints: null,
        steelSections: null,
        parseTime: 0,
      };

      // 解析タスクの定義
      const tasks = [
        { name: 'nodes', weight: 0.1, fn: () => this.parseNodes(xmlDoc) },
        { name: 'stories', weight: 0.02, fn: () => this.parseStories(xmlDoc) },
        { name: 'axes', weight: 0.02, fn: () => this.parseAxes(xmlDoc) },
        { name: 'columns', weight: 0.12, fn: () => this.parseElementsAsync(xmlDoc, 'StbColumn') },
        { name: 'girders', weight: 0.12, fn: () => this.parseElementsAsync(xmlDoc, 'StbGirder') },
        { name: 'beams', weight: 0.12, fn: () => this.parseElementsAsync(xmlDoc, 'StbBeam') },
        { name: 'braces', weight: 0.08, fn: () => this.parseElementsAsync(xmlDoc, 'StbBrace') },
        { name: 'posts', weight: 0.05, fn: () => this.parseElementsAsync(xmlDoc, 'StbPost') },
        { name: 'slabs', weight: 0.1, fn: () => this.parseElementsAsync(xmlDoc, 'StbSlab') },
        { name: 'walls', weight: 0.08, fn: () => this.parseElementsAsync(xmlDoc, 'StbWall') },
        { name: 'piles', weight: 0.05, fn: () => this.parseElementsAsync(xmlDoc, 'StbPile') },
        { name: 'footings', weight: 0.05, fn: () => this.parseElementsAsync(xmlDoc, 'StbFooting') },
        {
          name: 'foundationColumns',
          weight: 0.03,
          fn: () => this.parseElementsAsync(xmlDoc, 'StbFoundationColumn'),
        },
        {
          name: 'stripFootings',
          weight: 0.03,
          fn: () => this.parseElementsAsync(xmlDoc, 'StbStripFooting'),
        },
        {
          name: 'parapets',
          weight: 0.01,
          fn: () => this.parseElementsAsync(xmlDoc, 'StbParapet'),
        },
        { name: 'openings', weight: 0.01, fn: () => this.parseElementsAsync(xmlDoc, 'StbOpen') },
      ];

      let completedWeight = 0;
      const totalWeight = tasks.reduce((sum, t) => sum + t.weight, 0);

      for (const task of tasks) {
        if (this.aborted) {
          throw new Error('解析が中断されました');
        }

        this.onProgress(completedWeight / totalWeight, `${task.name}を解析中...`);
        result[task.name] = await task.fn();
        completedWeight += task.weight;

        // 各タスク後にメインスレッドに制御を返す
        await this.yieldToMain();
      }

      result.parseTime = performance.now() - this.startTime;
      this.onProgress(1, '解析完了');
      this.onComplete(result);

      return result;
    } catch (error) {
      this.onError(error);
      throw error;
    }
  }

  /**
   * メインスレッドに制御を返す
   * @private
   */
  yieldToMain() {
    return new Promise((resolve) => scheduleTask(resolve));
  }

  /**
   * ノードマップを解析（チャンク処理）
   * @private
   */
  async parseNodes(xmlDoc) {
    const nodeMap = new Map();
    const nodeElements = parseElements(xmlDoc, 'StbNode');

    const batchSize = this.config.batchSize;
    for (let i = 0; i < nodeElements.length; i += batchSize) {
      if (this.aborted) throw new Error('解析が中断されました');

      const batch = nodeElements.slice(i, i + batchSize);
      for (const el of batch) {
        const id = el.getAttribute('id');
        if (id) {
          nodeMap.set(id, {
            x: parseFloat(el.getAttribute('x')) || 0,
            y: parseFloat(el.getAttribute('y')) || 0,
            z: parseFloat(el.getAttribute('z')) || 0,
          });
        }
      }

      // バッチごとにyield
      if (i + batchSize < nodeElements.length) {
        await this.yieldToMain();
      }
    }

    return nodeMap;
  }

  /**
   * 階情報を解析
   * @private
   */
  parseStories(xmlDoc) {
    const stories = [];
    const storyElements = parseElements(xmlDoc, 'StbStory');

    for (const el of storyElements) {
      stories.push({
        id: el.getAttribute('id'),
        name: el.getAttribute('name'),
        height: parseFloat(el.getAttribute('height')) || 0,
        kind: el.getAttribute('kind'),
      });
    }

    return stories;
  }

  /**
   * 軸情報を解析
   * @private
   */
  parseAxes(xmlDoc) {
    const axes = { x: [], y: [], arc: [] };

    // X軸
    const xAxes = parseElements(xmlDoc, 'StbX_Axis');
    for (const el of xAxes) {
      axes.x.push({
        id: el.getAttribute('id'),
        name: el.getAttribute('name'),
        distance: parseFloat(el.getAttribute('distance')) || 0,
      });
    }

    // Y軸
    const yAxes = parseElements(xmlDoc, 'StbY_Axis');
    for (const el of yAxes) {
      axes.y.push({
        id: el.getAttribute('id'),
        name: el.getAttribute('name'),
        distance: parseFloat(el.getAttribute('distance')) || 0,
      });
    }

    // 円弧軸
    const arcAxes = parseElements(xmlDoc, 'StbArc_Axis');
    for (const el of arcAxes) {
      axes.arc.push({
        id: el.getAttribute('id'),
        name: el.getAttribute('name'),
        centerX: parseFloat(el.getAttribute('center_x')) || 0,
        centerY: parseFloat(el.getAttribute('center_y')) || 0,
        radius: parseFloat(el.getAttribute('radius')) || 0,
        startAngle: parseFloat(el.getAttribute('start_angle')) || 0,
        endAngle: parseFloat(el.getAttribute('end_angle')) || 0,
      });
    }

    return axes;
  }

  /**
   * 汎用要素を非同期でチャンク解析
   * @private
   */
  async parseElementsAsync(xmlDoc, elementType) {
    const elements = parseElements(xmlDoc, elementType);
    const results = [];
    const batchSize = this.config.batchSize;

    for (let i = 0; i < elements.length; i += batchSize) {
      if (this.aborted) throw new Error('解析が中断されました');

      const batch = elements.slice(i, i + batchSize);
      for (const el of batch) {
        const parsed = this.parseGenericElement(el);
        if (parsed) {
          results.push(parsed);
        }
      }

      // バッチごとにyield
      if (i + batchSize < elements.length) {
        await this.yieldToMain();
      }
    }

    return results;
  }

  /**
   * 汎用要素パーサー
   * @private
   */
  parseGenericElement(el) {
    const id = el.getAttribute('id');
    if (!id) return null;

    const result = {
      id,
      name: el.getAttribute('name'),
      guid: el.getAttribute('guid'),
      id_section: el.getAttribute('id_section'),
      kind_structure: el.getAttribute('kind_structure'),
    };

    // ノード参照（柱・杭など）
    const idNode = el.getAttribute('id_node') || el.getAttribute('id_node_bottom');
    if (idNode) {
      result.id_node = idNode;
      result.id_node_bottom = el.getAttribute('id_node_bottom');
      result.id_node_top = el.getAttribute('id_node_top');
    }

    // 開始/終了ノード（梁・ブレースなど）
    const idNodeStart = el.getAttribute('id_node_start');
    if (idNodeStart) {
      result.id_node_start = idNodeStart;
      result.id_node_end = el.getAttribute('id_node_end');
    }

    // 階参照
    const idStory = el.getAttribute('id_story');
    if (idStory) {
      result.id_story = idStory;
    }

    // オフセット値
    const offsetI = el.getAttribute('offset_i') || el.getAttribute('offset_start');
    if (offsetI) {
      result.offset_i = parseFloat(offsetI) || 0;
      result.offset_j =
        parseFloat(el.getAttribute('offset_j') || el.getAttribute('offset_end')) || 0;
    }

    // レベル
    const level = el.getAttribute('level');
    if (level) {
      result.level = parseFloat(level) || 0;
    }

    // 角度/回転
    const rotate = el.getAttribute('rotate');
    if (rotate) {
      result.rotate = parseFloat(rotate) || 0;
    }

    // 面要素の節点リスト（スラブ・壁）
    const nodeIds = el.getAttribute('id_node_list') || el.getAttribute('id_nodes');
    if (nodeIds) {
      result.nodeIds = nodeIds.split(/[,\s]+/).filter(Boolean);
    }

    return result;
  }
}

/**
 * 進捗付きパース関数
 * より簡単に非同期パースを行うためのヘルパー
 *
 * @param {Document} xmlDoc - XMLドキュメント
 * @param {Function} [onProgress] - 進捗コールバック (progress: 0-1, message: string)
 * @param {Object} [config] - 設定
 * @returns {Promise<Object>} 解析結果
 */
export async function parseStbAsync(xmlDoc, onProgress = null, config = {}) {
  return new Promise((resolve, reject) => {
    const parser = new AsyncStbParser({
      onProgress: onProgress || (() => {}),
      onComplete: resolve,
      onError: reject,
      config,
    });
    parser.parse(xmlDoc);
  });
}

/**
 * XML文字列からドキュメントを非同期でパース
 *
 * @param {string} xmlString - XML文字列
 * @param {Function} [onProgress] - 進捗コールバック
 * @param {Object} [config] - 設定
 * @returns {Promise<Object>} 解析結果
 */
export async function parseStbFromString(xmlString, onProgress = null, config = {}) {
  // XMLパースは同期だが、DOMParser自体は高速なので問題ない
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'application/xml');

  // パースエラーチェック
  const parseError = xmlDoc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`XML解析エラー: ${parseError.textContent}`);
  }

  return parseStbAsync(xmlDoc, onProgress, config);
}

/**
 * ファイルから非同期でパース
 *
 * @param {File} file - XMLファイル
 * @param {Function} [onProgress] - 進捗コールバック
 * @param {Object} [config] - 設定
 * @returns {Promise<Object>} 解析結果
 */
export async function parseStbFromFile(file, onProgress = null, config = {}) {
  // ファイル読み込みフェーズ
  if (onProgress) {
    onProgress(0, 'ファイルを読み込み中...');
  }

  const xmlString = await file.text();

  // パースフェーズ（進捗は0.1からスタート）
  const wrappedProgress = onProgress
    ? (progress, message) => onProgress(0.1 + progress * 0.9, message)
    : null;

  return parseStbFromString(xmlString, wrappedProgress, config);
}

export { DEFAULT_CONFIG };

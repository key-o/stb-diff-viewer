/**
 * @fileoverview 比較アルゴリズムレジストリ
 *
 * プラグインによる比較アルゴリズムの追加・拡張を可能にするレジストリ。
 * デフォルトの比較戦略に加えて、カスタム比較ロジックを登録できます。
 *
 * @module StbDiffViewer/comparison/ComparisonRegistry
 */

/**
 * 比較戦略インターフェース
 * @typedef {Object} ComparisonStrategy
 * @property {string} id - 一意のID
 * @property {string} name - 表示名
 * @property {string} [description] - 説明
 * @property {string[]} [elementTypes] - 対応する要素タイプ（空配列で全て対応）
 * @property {Function} compare - 比較関数 (elementA, elementB, options) => ComparisonResult
 * @property {Function} [generateKey] - キー生成関数 (element) => string
 * @property {number} [priority] - 優先度（高いほど優先、デフォルト: 0）
 */

/**
 * 比較結果
 * @typedef {Object} ComparisonResult
 * @property {boolean} matched - 一致したかどうか
 * @property {number} [similarity] - 類似度（0-1）
 * @property {Object} [differences] - 差分詳細
 * @property {string} [reason] - 不一致理由
 */

/**
 * デフォルトの比較戦略
 */
const DEFAULT_STRATEGIES = {
  /**
   * 位置ベース比較（デフォルト）
   */
  position: {
    id: 'position',
    name: '位置ベース比較',
    description: '要素の位置座標を使用して比較します',
    elementTypes: [],
    priority: 0,
    compare: (elementA, elementB, options = {}) => {
      const tolerance = options.tolerance || 1.0; // mm

      // 座標比較
      const posA = getElementPosition(elementA);
      const posB = getElementPosition(elementB);

      if (!posA || !posB) {
        return { matched: false, reason: '位置情報なし' };
      }

      const distance = Math.sqrt(
        Math.pow(posA.x - posB.x, 2) + Math.pow(posA.y - posB.y, 2) + Math.pow(posA.z - posB.z, 2),
      );

      if (distance <= tolerance) {
        return {
          matched: true,
          similarity: 1 - distance / tolerance,
          differences: null,
        };
      }

      return {
        matched: false,
        similarity: Math.max(0, 1 - distance / (tolerance * 10)),
        reason: `距離差: ${distance.toFixed(2)}mm`,
        differences: { distance },
      };
    },
    generateKey: (element) => {
      const pos = getElementPosition(element);
      if (!pos) return null;

      // 座標を整数化してキーを生成
      const x = Math.round(pos.x);
      const y = Math.round(pos.y);
      const z = Math.round(pos.z);
      return `pos:${x}:${y}:${z}`;
    },
  },

  /**
   * GUID比較
   */
  guid: {
    id: 'guid',
    name: 'GUID比較',
    description: 'グローバル一意識別子（GUID）で比較します',
    elementTypes: [],
    priority: 10,
    compare: (elementA, elementB) => {
      const guidA = elementA.guid;
      const guidB = elementB.guid;

      if (!guidA || !guidB) {
        return { matched: false, reason: 'GUID情報なし' };
      }

      if (guidA === guidB) {
        return { matched: true, similarity: 1 };
      }

      return { matched: false, reason: 'GUIDが一致しない' };
    },
    generateKey: (element) => {
      return element.guid ? `guid:${element.guid}` : null;
    },
  },

  /**
   * 名前ベース比較
   */
  name: {
    id: 'name',
    name: '名前ベース比較',
    description: '要素名で比較します',
    elementTypes: [],
    priority: -10,
    compare: (elementA, elementB) => {
      const nameA = elementA.name;
      const nameB = elementB.name;

      if (!nameA || !nameB) {
        return { matched: false, reason: '名前情報なし' };
      }

      if (nameA === nameB) {
        return { matched: true, similarity: 1 };
      }

      // 部分一致のチェック
      if (nameA.includes(nameB) || nameB.includes(nameA)) {
        return {
          matched: false,
          similarity: 0.5,
          reason: '名前が部分一致のみ',
        };
      }

      return { matched: false, similarity: 0, reason: '名前が一致しない' };
    },
    generateKey: (element) => {
      return element.name ? `name:${element.name}` : null;
    },
  },

  /**
   * 属性一括比較
   */
  attributes: {
    id: 'attributes',
    name: '属性一括比較',
    description: '全ての属性値を比較します',
    elementTypes: [],
    priority: -20,
    compare: (elementA, elementB, options = {}) => {
      const ignoreKeys = new Set(options.ignoreKeys || ['id', 'guid']);
      const differences = {};
      let matchCount = 0;
      let totalCount = 0;

      // elementAのプロパティをチェック
      for (const [key, valueA] of Object.entries(elementA)) {
        if (ignoreKeys.has(key) || typeof valueA === 'function') continue;

        totalCount++;
        const valueB = elementB[key];

        if (valueA === valueB) {
          matchCount++;
        } else if (JSON.stringify(valueA) === JSON.stringify(valueB)) {
          matchCount++;
        } else {
          differences[key] = { a: valueA, b: valueB };
        }
      }

      // elementBにあってelementAにないプロパティ
      for (const key of Object.keys(elementB)) {
        if (ignoreKeys.has(key) || typeof elementB[key] === 'function') continue;
        if (!(key in elementA)) {
          totalCount++;
          differences[key] = { a: undefined, b: elementB[key] };
        }
      }

      const similarity = totalCount > 0 ? matchCount / totalCount : 0;
      const matched = Object.keys(differences).length === 0;

      return {
        matched,
        similarity,
        differences: matched ? null : differences,
        reason: matched ? null : `${Object.keys(differences).length}個の属性が異なります`,
      };
    },
  },
};

/**
 * 要素の位置を取得するヘルパー
 * @private
 */
function getElementPosition(element) {
  // 直接座標
  if (element.x !== undefined && element.y !== undefined) {
    return { x: element.x, y: element.y, z: element.z || 0 };
  }

  // 中心座標
  if (element.centerX !== undefined) {
    return { x: element.centerX, y: element.centerY, z: element.centerZ || 0 };
  }

  // position オブジェクト
  if (element.position) {
    return {
      x: element.position.x || 0,
      y: element.position.y || 0,
      z: element.position.z || 0,
    };
  }

  // 開始/終了座標から中点を計算
  if (element.startX !== undefined && element.endX !== undefined) {
    return {
      x: (element.startX + element.endX) / 2,
      y: (element.startY + element.endY) / 2,
      z: ((element.startZ || 0) + (element.endZ || 0)) / 2,
    };
  }

  return null;
}

/**
 * 比較レジストリクラス
 */
class ComparisonRegistry {
  constructor() {
    /** @type {Map<string, ComparisonStrategy>} 登録された比較戦略 */
    this.strategies = new Map();

    /** @type {string} デフォルト戦略ID */
    this.defaultStrategyId = 'position';

    // デフォルト戦略を登録
    Object.values(DEFAULT_STRATEGIES).forEach((strategy) => {
      this.register(strategy);
    });
  }

  /**
   * 比較戦略を登録
   * @param {ComparisonStrategy} strategy - 比較戦略
   * @returns {boolean} 登録成功時true
   * @throws {TypeError} If strategy is not a valid object
   * @throws {Error} If strategy is missing required fields
   */
  register(strategy) {
    // Type validation
    if (!strategy || typeof strategy !== 'object') {
      const error = new TypeError('strategy must be a non-null object');
      console.error('[ComparisonRegistry] Validation failed:', error);
      return false;
    }

    if (Array.isArray(strategy)) {
      const error = new TypeError('strategy must be an object, not an array');
      console.error('[ComparisonRegistry] Validation failed:', error);
      return false;
    }

    // Required field validation
    if (!strategy.id) {
      const error = new Error('strategy.id is required');
      console.error('[ComparisonRegistry] Validation failed:', error);
      return false;
    }

    if (typeof strategy.id !== 'string' || strategy.id.trim().length === 0) {
      const error = new TypeError('strategy.id must be a non-empty string');
      console.error('[ComparisonRegistry] Validation failed:', error);
      return false;
    }

    if (typeof strategy.compare !== 'function') {
      const error = new TypeError('strategy.compare must be a function');
      console.error('[ComparisonRegistry] Validation failed:', error);
      return false;
    }

    // Optional field validation
    if (strategy.elementTypes !== undefined && !Array.isArray(strategy.elementTypes)) {
      const error = new TypeError('strategy.elementTypes must be an array if provided');
      console.error('[ComparisonRegistry] Validation failed:', error);
      return false;
    }

    if (strategy.priority !== undefined && typeof strategy.priority !== 'number') {
      const error = new TypeError('strategy.priority must be a number if provided');
      console.error('[ComparisonRegistry] Validation failed:', error);
      return false;
    }

    this.strategies.set(strategy.id, {
      priority: 0,
      elementTypes: [],
      ...strategy,
    });

    return true;
  }

  /**
   * 比較戦略の登録を解除
   * @param {string} strategyId - 戦略ID
   * @returns {boolean} 解除成功時true
   * @throws {TypeError} If strategyId is not a string
   */
  unregister(strategyId) {
    // Validate strategyId parameter
    if (typeof strategyId !== 'string') {
      const error = new TypeError('strategyId must be a string');
      console.error('[ComparisonRegistry] Validation failed:', error);
      return false;
    }

    if (strategyId.trim().length === 0) {
      const error = new Error('strategyId must be a non-empty string');
      console.error('[ComparisonRegistry] Validation failed:', error);
      return false;
    }

    if (!this.strategies.has(strategyId)) {
      return false;
    }

    this.strategies.delete(strategyId);
    return true;
  }

  /**
   * 比較戦略を取得
   * @param {string} strategyId - 戦略ID
   * @returns {ComparisonStrategy|null}
   * @throws {TypeError} If strategyId is not a string
   */
  get(strategyId) {
    // Validate strategyId parameter
    if (typeof strategyId !== 'string') {
      const error = new TypeError('strategyId must be a string');
      console.error('[ComparisonRegistry] Validation failed:', error);
      return null;
    }

    if (strategyId.trim().length === 0) {
      const error = new Error('strategyId must be a non-empty string');
      console.error('[ComparisonRegistry] Validation failed:', error);
      return null;
    }

    return this.strategies.get(strategyId) || null;
  }

  /**
   * 要素タイプに対応する戦略を取得（優先度順）
   * @param {string} elementType - 要素タイプ
   * @returns {ComparisonStrategy[]}
   * @throws {TypeError} If elementType is not a string
   */
  getStrategiesForType(elementType) {
    // Validate elementType parameter
    if (typeof elementType !== 'string') {
      const error = new TypeError('elementType must be a string');
      console.error('[ComparisonRegistry] Validation failed:', error);
      return [];
    }

    if (elementType.trim().length === 0) {
      const error = new Error('elementType must be a non-empty string');
      console.error('[ComparisonRegistry] Validation failed:', error);
      return [];
    }

    const applicable = [];

    for (const strategy of this.strategies.values()) {
      // 空配列は全タイプ対応
      if (strategy.elementTypes.length === 0 || strategy.elementTypes.includes(elementType)) {
        applicable.push(strategy);
      }
    }

    // 優先度で降順ソート
    return applicable.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 全戦略のリストを取得
   * @returns {ComparisonStrategy[]}
   */
  getAll() {
    return Array.from(this.strategies.values()).sort((a, b) => b.priority - a.priority);
  }

  /**
   * デフォルト戦略を設定
   * @param {string} strategyId - 戦略ID
   * @throws {TypeError} If strategyId is not a string
   */
  setDefault(strategyId) {
    // Validate strategyId parameter
    if (typeof strategyId !== 'string') {
      const error = new TypeError('strategyId must be a string');
      console.error('[ComparisonRegistry] Validation failed:', error);
      return;
    }

    if (strategyId.trim().length === 0) {
      const error = new Error('strategyId must be a non-empty string');
      console.error('[ComparisonRegistry] Validation failed:', error);
      return;
    }

    if (!this.strategies.has(strategyId)) {
      console.warn(`[ComparisonRegistry] Strategy '${strategyId}' not found`);
      return;
    }
    this.defaultStrategyId = strategyId;
  }

  /**
   * デフォルト戦略を取得
   * @returns {ComparisonStrategy}
   */
  getDefault() {
    return this.strategies.get(this.defaultStrategyId);
  }

  /**
   * 要素を比較
   * @param {Object} elementA - 要素A
   * @param {Object} elementB - 要素B
   * @param {Object} options - オプション
   * @param {string} [options.strategyId] - 使用する戦略ID
   * @param {string} [options.elementType] - 要素タイプ
   * @param {number} [options.tolerance] - 許容誤差
   * @returns {ComparisonResult}
   * @throws {TypeError} If elementA or elementB is not a valid object
   * @throws {TypeError} If options is not an object
   */
  compare(elementA, elementB, options = {}) {
    // Validate elementA
    if (!elementA || typeof elementA !== 'object') {
      const error = new TypeError('elementA must be a non-null object');
      console.error('[ComparisonRegistry] Validation failed:', error);
      return { matched: false, reason: 'elementA must be a non-null object' };
    }

    // Validate elementB
    if (!elementB || typeof elementB !== 'object') {
      const error = new TypeError('elementB must be a non-null object');
      console.error('[ComparisonRegistry] Validation failed:', error);
      return { matched: false, reason: 'elementB must be a non-null object' };
    }

    // Validate options
    if (options !== null && typeof options !== 'object') {
      const error = new TypeError('options must be an object if provided');
      console.error('[ComparisonRegistry] Validation failed:', error);
      return { matched: false, reason: 'options must be an object' };
    }

    if (Array.isArray(options)) {
      const error = new TypeError('options must be an object, not an array');
      console.error('[ComparisonRegistry] Validation failed:', error);
      return { matched: false, reason: 'options must be an object, not an array' };
    }

    let strategy;

    if (options.strategyId) {
      strategy = this.get(options.strategyId);
    } else if (options.elementType) {
      const strategies = this.getStrategiesForType(options.elementType);
      strategy = strategies[0];
    } else {
      strategy = this.getDefault();
    }

    if (!strategy) {
      return { matched: false, reason: '比較戦略が見つかりません' };
    }

    return strategy.compare(elementA, elementB, options);
  }

  /**
   * 要素のマッチングキーを生成
   * @param {Object} element - 要素
   * @param {string} [strategyId] - 戦略ID
   * @returns {string|null}
   * @throws {TypeError} If element is not a valid object
   * @throws {TypeError} If strategyId is provided but not a string
   */
  generateKey(element, strategyId = null) {
    // Validate element
    if (!element || typeof element !== 'object') {
      const error = new TypeError('element must be a non-null object');
      console.error('[ComparisonRegistry] Validation failed:', error);
      return null;
    }

    // Validate strategyId if provided
    if (strategyId !== null && typeof strategyId !== 'string') {
      const error = new TypeError('strategyId must be a string if provided');
      console.error('[ComparisonRegistry] Validation failed:', error);
      return null;
    }

    if (strategyId !== null && strategyId.trim().length === 0) {
      const error = new Error('strategyId must be a non-empty string if provided');
      console.error('[ComparisonRegistry] Validation failed:', error);
      return null;
    }

    const strategy = strategyId ? this.get(strategyId) : this.getDefault();

    if (!strategy?.generateKey) {
      return null;
    }

    return strategy.generateKey(element);
  }

  /**
   * 複数戦略での比較を実行
   * @param {Object} elementA - 要素A
   * @param {Object} elementB - 要素B
   * @param {string[]} strategyIds - 戦略IDリスト
   * @param {Object} options - オプション
   * @returns {Object} {strategyId: ComparisonResult, ...}
   * @throws {TypeError} If elementA or elementB is not a valid object
   * @throws {TypeError} If strategyIds is not an array
   * @throws {TypeError} If options is not an object
   */
  compareMultiple(elementA, elementB, strategyIds, options = {}) {
    // Validate elementA
    if (!elementA || typeof elementA !== 'object') {
      const error = new TypeError('elementA must be a non-null object');
      console.error('[ComparisonRegistry] Validation failed:', error);
      return {};
    }

    // Validate elementB
    if (!elementB || typeof elementB !== 'object') {
      const error = new TypeError('elementB must be a non-null object');
      console.error('[ComparisonRegistry] Validation failed:', error);
      return {};
    }

    // Validate strategyIds
    if (!Array.isArray(strategyIds)) {
      const error = new TypeError('strategyIds must be an array');
      console.error('[ComparisonRegistry] Validation failed:', error);
      return {};
    }

    // Validate each strategyId in the array
    for (const strategyId of strategyIds) {
      if (typeof strategyId !== 'string' || strategyId.trim().length === 0) {
        const error = new TypeError('Each strategyId must be a non-empty string');
        console.error('[ComparisonRegistry] Validation failed:', error);
        return {};
      }
    }

    // Validate options
    if (options !== null && typeof options !== 'object') {
      const error = new TypeError('options must be an object if provided');
      console.error('[ComparisonRegistry] Validation failed:', error);
      return {};
    }

    if (Array.isArray(options)) {
      const error = new TypeError('options must be an object, not an array');
      console.error('[ComparisonRegistry] Validation failed:', error);
      return {};
    }

    const results = {};

    for (const strategyId of strategyIds) {
      const strategy = this.get(strategyId);
      if (strategy) {
        results[strategyId] = strategy.compare(elementA, elementB, options);
      }
    }

    return results;
  }
}

// シングルトンインスタンス
export const comparisonRegistry = new ComparisonRegistry();

// デフォルト戦略のエクスポート
export { DEFAULT_STRATEGIES };

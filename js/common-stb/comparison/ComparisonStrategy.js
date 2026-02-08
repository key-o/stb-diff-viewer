/**
 * @fileoverview 比較戦略の基底クラス
 *
 * モデル要素比較のための戦略パターン実装。
 * 異なる比較ロジック（厳密、許容差、バージョン対応）を統一インターフェースで提供します。
 */

/**
 * 比較結果の型定義
 * @typedef {Object} ComparisonResult
 * @property {Array<{dataA: any, dataB: any}>} matched - 一致した要素ペア
 * @property {Array<any>} onlyA - モデルAのみに存在する要素
 * @property {Array<any>} onlyB - モデルBのみに存在する要素
 */

/**
 * 比較オプションの型定義
 * @typedef {Object} ComparisonOptions
 * @property {string} [keyType] - 比較キータイプ
 * @property {Object} [toleranceConfig] - 許容差設定
 * @property {Object} [versionInfo] - バージョン情報
 */

/**
 * 比較戦略の基底クラス
 * @abstract
 */
export class BaseStrategy {
  /**
   * 戦略名を取得
   * @returns {string} 戦略名
   */
  get name() {
    return 'base';
  }

  /**
   * 2つの要素リストを比較する
   * @abstract
   * @param {Array<Element>} elementsA - モデルAの要素リスト
   * @param {Array<Element>} elementsB - モデルBの要素リスト
   * @param {Map} nodeMapA - モデルAのノードマップ
   * @param {Map} nodeMapB - モデルBのノードマップ
   * @param {function} keyExtractor - キー抽出関数
   * @param {ComparisonOptions} [options={}] - 比較オプション
   * @returns {ComparisonResult} 比較結果
   */
  compare(elementsA, elementsB, nodeMapA, nodeMapB, keyExtractor, _options = {}) {
    throw new Error('compare() must be implemented by subclass');
  }

  /**
   * 2つの要素データを比較する
   * @abstract
   * @param {Object} dataA - 要素Aのデータ
   * @param {Object} dataB - 要素Bのデータ
   * @param {ComparisonOptions} [options={}] - 比較オプション
   * @returns {Object} 詳細な比較結果
   */
  compareElementData(dataA, dataB, _options = {}) {
    throw new Error('compareElementData() must be implemented by subclass');
  }

  /**
   * この戦略が指定されたオプションに適用可能かどうかを判定
   * @param {ComparisonOptions} options - 比較オプション
   * @returns {boolean} 適用可能な場合true
   */
  isApplicable(_options = {}) {
    return true;
  }
}

/**
 * 基本比較戦略（厳密一致）
 */
export class BasicStrategy extends BaseStrategy {
  get name() {
    return 'basic';
  }

  /**
   * @override
   */
  compare(elementsA, elementsB, nodeMapA, nodeMapB, keyExtractor, _options = {}) {
    const keysA = new Map();
    const keysB = new Map();
    const dataA = [];
    const dataB = [];
    const matchedData = [];

    for (const elementA of elementsA) {
      const { key, data } = keyExtractor(elementA, nodeMapA);
      if (key !== null) {
        keysA.set(key, data);
      }
    }

    for (const elementB of elementsB) {
      const { key, data } = keyExtractor(elementB, nodeMapB);
      if (key !== null) {
        keysB.set(key, data);
      }
    }

    for (const [key, dataAItem] of keysA.entries()) {
      if (keysB.has(key)) {
        matchedData.push({ dataA: dataAItem, dataB: keysB.get(key) });
        keysB.delete(key);
      } else {
        dataA.push(dataAItem);
      }
    }

    for (const dataBItem of keysB.values()) {
      dataB.push(dataBItem);
    }

    return { matched: matchedData, onlyA: dataA, onlyB: dataB };
  }

  /**
   * @override
   */
  compareElementData(_dataA, _dataB, _options = {}) {
    // 基本的には同じキーであれば一致とみなす
    return {
      isEqual: true,
      differences: [],
      matchType: 'exact',
    };
  }
}

// 互換性のためのエイリアス（旧名: BasicComparisonStrategy）
export { BasicStrategy as BasicComparisonStrategy };

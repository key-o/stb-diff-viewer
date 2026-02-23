/**
 * BaseColorStateManager - 色状態管理の基底クラス
 *
 * BaseElementStateManagerを継承し、色管理に特化した機能を追加します。
 * 色のバリデーション、デフォルト色へのリセット、色変更コールバックなどを提供します。
 */

import { BaseElementStateManager } from './baseElementStateManager.js';

/**
 * BaseColorStateManagerクラス
 * 色管理に特化した基底クラス
 */
class BaseColorStateManager extends BaseElementStateManager {
  /**
   * コンストラクタ
   * @param {Array<string>} colorTypes - 管理対象の色タイプリスト
   * @param {Object} defaultColors - デフォルトの色設定（タイプ: 色コード）
   * @param {string} managerName - マネージャー名（ログ出力用）
   */
  constructor(colorTypes, defaultColors, managerName = 'BaseColorStateManager') {
    // デフォルト色を保存（リセット用）
    const defaultColorMap = {};
    colorTypes.forEach((type) => {
      defaultColorMap[type] = defaultColors[type] || '#888888';
    });

    // 基底クラスのコンストラクタを呼び出し（最初の色をデフォルト状態として使用）
    super(colorTypes, defaultColorMap[colorTypes[0]], managerName);

    // デフォルト色設定を保存
    this.defaultColors = defaultColorMap;

    // 初期色を設定
    colorTypes.forEach((type) => {
      this.states.set(type, defaultColorMap[type]);
    });

    // 色変更時の追加コールバック（マテリアルキャッシュクリアなど）
    this.colorChangeCallbacks = [];
  }

  /**
   * 色の妥当性をチェック（オーバーライド）
   * @param {string} color - チェックする色コード
   * @returns {boolean} 妥当ならtrue
   * @protected
   */
  _validateState(color) {
    // 16進数カラーコードの形式をチェック（#RGB または #RRGGBB）
    return /^#([0-9A-Fa-f]{3}){1,2}$/.test(color);
  }

  /**
   * 色を取得
   * @param {string} colorType - 色タイプ
   * @returns {string} 色コード
   */
  getColor(colorType) {
    return this.getState(colorType);
  }

  /**
   * 色を設定
   * @param {string} colorType - 色タイプ
   * @param {string} color - 色コード
   * @returns {boolean} 設定成功フラグ
   */
  setColor(colorType, color) {
    const success = this.setState(colorType, color);

    if (success) {
      // 色変更時の追加コールバックを実行
      this._executeColorChangeCallbacks(colorType, color);
    }

    return success;
  }

  /**
   * 全ての色を取得
   * @returns {Object} 色タイプをキー、色コードを値とするオブジェクト
   */
  getAllColors() {
    return this.getAllStates();
  }

  /**
   * 全ての色を設定
   * @param {Object} colors - 色タイプをキー、色コードを値とするオブジェクト
   */
  setAllColors(colors) {
    Object.entries(colors).forEach(([type, color]) => {
      this.setColor(type, color);
    });
  }

  /**
   * 色をデフォルトにリセット
   * @param {string} colorType - 色タイプ（省略時は全てリセット）
   */
  resetToDefault(colorType = null) {
    if (colorType) {
      // 特定の色タイプのみリセット
      const defaultColor = this.defaultColors[colorType];
      if (defaultColor) {
        this.setColor(colorType, defaultColor);

        if (this.debugMode) {
        }
      }
    } else {
      // 全ての色をリセット
      Object.entries(this.defaultColors).forEach(([type, color]) => {
        this.states.set(type, color);
      });

      // 色変更時の追加コールバックを実行
      this._executeColorChangeCallbacks(null, null);

      if (this.debugMode) {
      }
    }
  }

  /**
   * 色変更時の追加コールバックを登録
   * @param {Function} callback - コールバック関数 (colorType, color) => {}
   * @returns {Function} コールバック解除用関数
   */
  onColorChange(callback) {
    this.colorChangeCallbacks.push(callback);

    // 解除用関数を返す
    return () => {
      const index = this.colorChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.colorChangeCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * 色変更時の追加コールバックを実行
   * @param {string} colorType - 色タイプ
   * @param {string} color - 新しい色コード
   * @private
   */
  _executeColorChangeCallbacks(colorType, color) {
    this.colorChangeCallbacks.forEach((callback) => {
      try {
        callback(colorType, color);
      } catch (error) {
        console.error(`[${this.managerName}] Color change callback error:`, error);
      }
    });
  }

  /**
   * デバッグ情報を取得（オーバーライド）
   * @returns {Object} デバッグ情報
   */
  getDebugInfo() {
    const baseInfo = super.getDebugInfo();
    return {
      ...baseInfo,
      colors: this.getAllColors(),
      defaultColors: { ...this.defaultColors },
      colorChangeCallbackCount: this.colorChangeCallbacks.length,
    };
  }
}

/**
 * 色管理マネージャーのファクトリ関数
 *
 * 同一パターンのサブクラス（ElementColorManager, SchemaColorManager, LoadColorManager 等）を
 * ボイラープレートなしで生成します。
 *
 * @param {Object} options - ファクトリオプション
 * @param {Object} options.colorConfig - 色設定オブジェクト（タイプ: 色コード）
 * @param {string} options.managerName - マネージャー名（ログ出力用）
 * @param {string} options.methodPrefix - メソッド名プレフィックス（例: 'Element' → getElementColor）
 * @param {string|null} [options.fallbackKey=null] - getColor が undefined を返した場合のフォールバックキー
 * @returns {{ manager: BaseColorStateManager, types: string[], defaults: Object }}
 */
function createColorManager({ colorConfig, managerName, methodPrefix, fallbackKey = null }) {
  const types = Object.keys(colorConfig);
  const defaults = { ...colorConfig };

  class GeneratedColorManager extends BaseColorStateManager {
    constructor() {
      super(types, defaults, managerName);
    }
  }

  // get<Prefix>Color(type)
  const getMethodName = `get${methodPrefix}Color`;
  if (fallbackKey) {
    GeneratedColorManager.prototype[getMethodName] = function (type) {
      return this.getColor(type) || this.getColor(fallbackKey);
    };
  } else {
    GeneratedColorManager.prototype[getMethodName] = function (type) {
      return this.getColor(type);
    };
  }

  // set<Prefix>Color(type, color)
  GeneratedColorManager.prototype[`set${methodPrefix}Color`] = function (type, color) {
    return this.setColor(type, color);
  };

  // getAll<Prefix>Colors()
  GeneratedColorManager.prototype[`getAll${methodPrefix}Colors`] = function () {
    return this.getAllColors();
  };

  const manager = new GeneratedColorManager();
  return { manager, types, defaults };
}

// BaseColorStateManagerクラスをエクスポート
export { BaseColorStateManager, createColorManager };
export default BaseColorStateManager;

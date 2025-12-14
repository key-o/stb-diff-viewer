/**
 * @fileoverview グローバル状態管理モジュール
 *
 * このファイルは、アプリケーション全体の状態を集中管理します:
 * - 状態の初期化と更新
 * - 状態変更の通知機能
 * - 型安全な状態アクセス
 * - デバッグ用の状態監視
 *
 * 従来のwindowオブジェクトへの直接割り当てを置き換え、
 * より構造化された状態管理を提供します。
 */

/**
 * アプリケーションの全体状態
 */
class ApplicationState {
  constructor() {
    this.state = {
      // レンダリング関連
      rendering: {
        scheduleRender: null,
        requestRender: null,
        rendererInitialized: false
      },

      // モデル関連
      models: {
        modelADocument: null,
        modelBDocument: null,
        nodeMapA: new Map(),
        nodeMapB: new Map(),
        // IFC変換用: 生の座標データ（THREE.Vector3変換前）
        nodeMapRawA: new Map(),
        nodeMapRawB: new Map(),
        sectionMaps: {
          columnSections: new Map(),
          girderSections: new Map(),
          beamSections: new Map(),
          braceSections: new Map()
        },
        // 鋼材断面データ（IFC変換で再利用）
        steelSections: new Map(),
        // 要素データ（IFC変換で再利用）
        elementData: {
          columnElements: [],
          girderElements: [],
          beamElements: [],
          braceElements: []
        },
        modelsLoaded: false
      },

      // UI関連
      ui: {
        nodeLabels: [],
        stories: [],
        axesData: { xAxes: [], yAxes: [] },
        currentViewMode: 'diff',
        editMode: false,
        labelContentType: 'id' // ラベル表示内容: 'id', 'name', 'section'
      },

      // 表示モード関連
      viewModes: {
        columnViewMode: 'line',
        beamViewMode: 'line',
        isModelAVisible: true,
        isModelBVisible: true
      },

      // 機能関数
      functions: {
        toggleLegend: null,
        applyStoryClip: null,
        applyAxisClip: null,
        displayElementInfo: null,
        clearClippingPlanes: null,
        toggleEditMode: null,
        setModelVisibility: null
      },

      // 重要度関連
      importance: {
        elementRatings: new Map(),
        evaluationResults: null,
        currentMode: 'default',
        filterSettings: {}
      },

      // ファイル関連（IFC変換用）
      files: {
        originalFileA: null,
        originalFileB: null
      }
    };

    this.listeners = new Map();
    this.debug = false;
  }

  /**
   * 状態を設定
   * @param {string} path - 状態のパス（例: 'models.modelsLoaded'）
   * @param {any} value - 設定する値
   */
  set(path, value) {
    const keys = path.split('.');
    let target = this.state;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!target[keys[i]]) {
        target[keys[i]] = {};
      }
      target = target[keys[i]];
    }

    const lastKey = keys[keys.length - 1];
    const oldValue = target[lastKey];
    target[lastKey] = value;

    if (this.debug) {
      console.log(`状態が変更されました: ${path}`, { oldValue, newValue: value });
    }

    // 変更通知
    this.notifyListeners(path, value, oldValue);
  }

  /**
   * 状態を取得
   * @param {string} path - 状態のパス
   * @returns {any} 状態の値
   */
  get(path) {
    const keys = path.split('.');
    let target = this.state;

    for (const key of keys) {
      if (target === null || target === undefined) {
        return undefined;
      }
      target = target[key];
    }

    return target;
  }

  /**
   * 状態変更リスナーを追加
   * @param {string} path - 監視する状態のパス
   * @param {Function} listener - コールバック関数
   */
  addListener(path, listener) {
    if (!this.listeners.has(path)) {
      this.listeners.set(path, []);
    }
    this.listeners.get(path).push(listener);
  }

  /**
   * 状態変更リスナーを削除
   * @param {string} path - 監視する状態のパス
   * @param {Function} listener - コールバック関数
   */
  removeListener(path, listener) {
    const pathListeners = this.listeners.get(path);
    if (pathListeners) {
      const index = pathListeners.indexOf(listener);
      if (index > -1) {
        pathListeners.splice(index, 1);
      }
    }
  }

  /**
   * リスナーに変更を通知
   * @private
   */
  notifyListeners(path, newValue, oldValue) {
    const pathListeners = this.listeners.get(path);
    if (pathListeners) {
      pathListeners.forEach(listener => {
        try {
          listener(newValue, oldValue, path);
        } catch (error) {
          console.error(`${path}の状態リスナーでエラーが発生しました:`, error);
        }
      });
    }
  }

  /**
   * 関数を登録してグローバルに公開
   * @param {string} name - 関数名
   * @param {Function} func - 関数
   */
  registerFunction(name, func) {
    this.set(`functions.${name}`, func);

    // 後方互換性のためにwindowにも設定
    if (typeof window !== 'undefined') {
      window[name] = func;
    }
  }

  /**
   * 登録された関数を取得
   * @param {string} name - 関数名
   * @returns {Function} 関数
   */
  getFunction(name) {
    return this.get(`functions.${name}`);
  }

  /**
   * デバッグモードを有効/無効にする
   * @param {boolean} enabled - デバッグモード有効フラグ
   */
  setDebugMode(enabled) {
    this.debug = enabled;
    if (enabled) {
      console.log('グローバル状態デバッグモードが有効になりました');
    }
  }

  /**
   * 現在の状態をログ出力
   */
  logState() {
    console.log('現在のアプリケーション状態:', JSON.parse(JSON.stringify(this.state)));
  }

  /**
   * 状態をリセット
   */
  reset() {
    const functions = this.state.functions; // 関数は保持
    this.state = {
      rendering: {
        scheduleRender: null,
        requestRender: null,
        rendererInitialized: false
      },
      models: {
        modelADocument: null,
        modelBDocument: null,
        nodeMapA: new Map(),
        nodeMapB: new Map(),
        nodeMapRawA: new Map(),
        nodeMapRawB: new Map(),
        sectionMaps: {
          columnSections: new Map(),
          girderSections: new Map(),
          beamSections: new Map(),
          braceSections: new Map()
        },
        steelSections: new Map(),
        elementData: {
          columnElements: [],
          girderElements: [],
          beamElements: [],
          braceElements: []
        },
        modelsLoaded: false
      },
      ui: {
        nodeLabels: [],
        stories: [],
        axesData: { xAxes: [], yAxes: [] },
        currentViewMode: 'diff',
        editMode: false,
        labelContentType: 'id' // ラベル表示内容: 'id', 'name', 'section'
      },
      viewModes: {
        columnViewMode: 'line',
        beamViewMode: 'line',
        isModelAVisible: true,
        isModelBVisible: true
      },
      functions,
      importance: {
        elementRatings: new Map(),
        evaluationResults: null,
        currentMode: 'default',
        filterSettings: {}
      },
      files: {
        originalFileA: null,
        originalFileB: null
      }
    };

    if (this.debug) {
      console.log('アプリケーション状態がリセットされました');
    }
  }
}

// シングルトンインスタンス
const globalState = new ApplicationState();

// 開発時のデバッグ用にwindowに公開
if (typeof window !== 'undefined') {
  window.globalState = globalState;
}

export default globalState;

/**
 * 便利な関数をエクスポート
 */
export const setState = (path, value) => globalState.set(path, value);
export const getState = (path) => globalState.get(path);
export const addStateListener = (path, listener) => globalState.addListener(path, listener);
export const removeStateListener = (path, listener) => globalState.removeListener(path, listener);
export const registerGlobalFunction = (name, func) => globalState.registerFunction(name, func);
export const getGlobalFunction = (name) => globalState.getFunction(name);
export const enableStateDebug = (enabled = true) => globalState.setDebugMode(enabled);
export const logApplicationState = () => globalState.logState();
export const resetApplicationState = () => globalState.reset();

// 重要度機能専用の便利関数
export const setImportanceState = (path, value) => globalState.set(`importance.${path}`, value);
export const getImportanceState = (path) => globalState.get(`importance.${path}`);

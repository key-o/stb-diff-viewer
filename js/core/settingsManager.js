/**
 * @fileoverview 重要度設定管理モジュール
 *
 * このファイルは、重要度評価の設定管理を行います:
 * - デフォルト重要度設定の定義
 * - ユーザーカスタム設定の永続化
 * - 設定の検証と適用
 * - 設定変更の通知機能
 */

import { IMPORTANCE_EVENTS } from '../ui/events.js';
import { setImportanceState, getImportanceState } from './globalState.js';

/**
 * 重要度設定管理クラス
 */
export class SettingsManager {
  constructor() {
    this.defaultSettings = this.loadDefaultImportanceSettings();
    this.userSettings = this.loadUserSettings();
    this.listeners = new Set();
    this.storageKey = 'stb-diff-viewer-importance-settings';
    
    // 設定変更監視
    this.setupStorageListener();
    
    console.log('SettingsManager initialized');
  }
  
  /**
   * デフォルト重要度設定を読み込む
   * @returns {Object} デフォルト設定オブジェクト
   */
  loadDefaultImportanceSettings() {
    return {
      // 構造要素の重要度設定
      elements: {
        'StbColumn': 'high',      // 柱 - 高重要度
        'StbGirder': 'high',      // 大梁 - 高重要度
        'StbBeam': 'high',        // 小梁 - 高重要度
        'StbBrace': 'high',       // ブレース - 高重要度
        'StbNode': 'medium',      // 節点 - 中重要度
        'StbSlab': 'medium',      // スラブ - 中重要度
        'StbWall': 'medium',      // 壁 - 中重要度
        'StbStory': 'medium',     // 階 - 中重要度
        'StbAxis': 'low',         // 軸 - 低重要度
        'StbDrawingLineAxis': 'low',  // 描画軸(直線) - 低重要度
        'StbDrawingArcAxis': 'low',   // 描画軸(円弧) - 低重要度
        // 断面情報
        'StbSecColumn_RC': 'high',
        'StbSecColumn_S': 'high',
        'StbSecColumn_SRC': 'high',
        'StbSecColumn_CFT': 'high',
        'StbSecBeam_RC': 'high',
        'StbSecBeam_S': 'high',
        'StbSecBeam_SRC': 'high',
        'StbSecBrace_S': 'high',
        'StbSecSlab_RC': 'medium',
        'StbSecWall_RC': 'medium'
      },
      
      // 属性の重要度設定
      attributes: {
        'id': 'notApplicable',         // ID属性 - 対象外
        'guid': 'notApplicable',       // GUID - 対象外
        'name': 'medium',              // 名前 - 中重要度
        'material': 'high',            // 材料 - 高重要度
        'shape': 'high',               // 形状 - 高重要度
        'strength_concrete': 'high',   // コンクリート強度 - 高重要度
        'strength_rebar': 'high',      // 鉄筋強度 - 高重要度
        'pos': 'low',                  // 位置情報 - 低重要度
        'rotate': 'low',               // 回転情報 - 低重要度
        'offset': 'low'                // オフセット情報 - 低重要度
      },
      
      // XPathパターンベースの設定
      xpathPatterns: {
        // 構造要素全般
        '//Stb*[contains(name(), "Column") or contains(name(), "Girder") or contains(name(), "Beam") or contains(name(), "Brace")]': 'high',
        '//Stb*[contains(name(), "Sec") and contains(name(), "_RC")]/@strength_concrete': 'high',
        '//Stb*[contains(name(), "Sec") and contains(name(), "_S")]/@strength': 'high',
        '//*/@id': 'notApplicable',
        '//*/@guid': 'notApplicable',
        '//*/@name': 'medium'
      }
    };
  }
  
  /**
   * ユーザー設定をローカルストレージから読み込む
   * @returns {Object} ユーザー設定オブジェクト
   */
  loadUserSettings() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        console.log('User settings loaded from localStorage');
        return parsed;
      }
    } catch (error) {
      console.warn('Failed to load user settings from localStorage:', error);
    }
    
    return {
      elements: {},
      attributes: {},
      xpathPatterns: {},
      lastModified: null
    };
  }
  
  /**
   * ユーザー設定をローカルストレージに保存する
   */
  saveUserSettings() {
    try {
      // 最終更新時刻を設定
      this.userSettings.lastModified = new Date().toISOString();
      
      localStorage.setItem(this.storageKey, JSON.stringify(this.userSettings));
      console.log('User settings saved to localStorage');
      
      // 設定保存イベントを発行
      this.notifySettingsSaved();
      
    } catch (error) {
      console.error('Failed to save user settings to localStorage:', error);
      
      // 保存失敗イベントを発行
      this.notifySettingsError('Failed to save settings', error);
    }
  }
  
  /**
   * 要素の重要度を取得する
   * @param {string} elementPath - 要素のパス（XPath形式）
   * @returns {string} 重要度レベル ('high', 'medium', 'low', 'notApplicable')
   */
  getImportance(elementPath) {
    // 1. ユーザー設定から検索
    if (this.userSettings.elements[elementPath]) {
      return this.userSettings.elements[elementPath];
    }
    
    if (this.userSettings.attributes[elementPath]) {
      return this.userSettings.attributes[elementPath];
    }
    
    // 2. デフォルト設定から検索
    if (this.defaultSettings.elements[elementPath]) {
      return this.defaultSettings.elements[elementPath];
    }
    
    if (this.defaultSettings.attributes[elementPath]) {
      return this.defaultSettings.attributes[elementPath];
    }
    
    // 3. パターンマッチング（要素名ベース）
    const elementName = this.extractElementName(elementPath);
    if (elementName) {
      // デフォルト設定から部分マッチを試行
      for (const [pattern, importance] of Object.entries(this.defaultSettings.elements)) {
        if (elementName.includes(pattern) || pattern.includes(elementName)) {
          return importance;
        }
      }
      
      // ユーザー設定から部分マッチを試行
      for (const [pattern, importance] of Object.entries(this.userSettings.elements)) {
        if (elementName.includes(pattern) || pattern.includes(elementName)) {
          return importance;
        }
      }
    }
    
    // 4. 属性パターンマッチング
    if (elementPath.startsWith('@')) {
      const attrName = elementPath.substring(1);
      for (const [pattern, importance] of Object.entries(this.defaultSettings.attributes)) {
        if (attrName.includes(pattern) || pattern.includes(attrName)) {
          return importance;
        }
      }
    }
    
    // 5. デフォルト値
    return 'low';
  }
  
  /**
   * 要素の重要度を設定する
   * @param {string} elementPath - 要素のパス
   * @param {string} importance - 重要度レベル
   */
  setImportance(elementPath, importance) {
    // 入力検証
    if (!this.validateImportanceLevel(importance)) {
      throw new Error(`Invalid importance level: ${importance}`);
    }
    
    if (!this.validateElementPath(elementPath)) {
      console.warn(`Potentially invalid element path: ${elementPath}`);
    }
    
    // 設定カテゴリの判定
    const category = elementPath.startsWith('@') ? 'attributes' : 'elements';
    
    // ユーザー設定に保存
    if (!this.userSettings[category]) {
      this.userSettings[category] = {};
    }
    
    const oldImportance = this.getImportance(elementPath);
    this.userSettings[category][elementPath] = importance;
    
    // 保存
    this.saveUserSettings();
    
    // 変更通知
    this.notifyImportanceChanged(elementPath, importance, oldImportance);
    
    console.log(`Importance set for ${elementPath}: ${oldImportance} -> ${importance}`);
  }
  
  /**
   * 要素パスから要素名を抽出する
   * @param {string} elementPath - 要素パス
   * @returns {string|null} 要素名
   */
  extractElementName(elementPath) {
    // XPath形式の場合
    const xpathMatch = elementPath.match(/\/\/?(Stb[A-Za-z_]+)/);
    if (xpathMatch) {
      return xpathMatch[1];
    }
    
    // 単純な要素名の場合
    if (elementPath.startsWith('Stb')) {
      return elementPath;
    }
    
    return null;
  }
  
  /**
   * 重要度レベルの妥当性を検証する
   * @param {string} importance - 重要度レベル
   * @returns {boolean} 妥当かどうか
   */
  validateImportanceLevel(importance) {
    const validLevels = ['high', 'medium', 'low', 'notApplicable'];
    return validLevels.includes(importance);
  }
  
  /**
   * 要素パスの妥当性を検証する
   * @param {string} elementPath - 要素パス
   * @returns {boolean} 妥当かどうか
   */
  validateElementPath(elementPath) {
    // XPath風のパスかチェック
    return /^(\/|\.)?(Stb[A-Za-z_]+|@[a-zA-Z_][a-zA-Z0-9_]*)/.test(elementPath);
  }
  
  /**
   * 全設定をリセットする
   */
  resetToDefaults() {
    this.userSettings = {
      elements: {},
      attributes: {},
      xpathPatterns: {},
      lastModified: new Date().toISOString()
    };
    
    this.saveUserSettings();
    this.notifySettingsReset();
    
    console.log('Settings reset to defaults');
  }
  
  /**
   * 設定をエクスポートする
   * @returns {Object} エクスポート用設定オブジェクト
   */
  exportSettings() {
    return {
      version: '1.0',
      timestamp: new Date().toISOString(),
      defaultSettings: this.defaultSettings,
      userSettings: this.userSettings
    };
  }
  
  /**
   * 設定をインポートする
   * @param {Object} settings - インポートする設定
   * @returns {boolean} インポート成功可否
   */
  importSettings(settings) {
    try {
      // バージョンチェック
      if (settings.version !== '1.0') {
        console.warn(`Unsupported settings version: ${settings.version}`);
      }
      
      // 設定の妥当性チェック
      if (this.validateImportedSettings(settings.userSettings)) {
        this.userSettings = settings.userSettings;
        this.saveUserSettings();
        this.notifySettingsImported();
        
        console.log('Settings imported successfully');
        return true;
      } else {
        throw new Error('Invalid settings format');
      }
    } catch (error) {
      console.error('Failed to import settings:', error);
      this.notifySettingsError('Failed to import settings', error);
      return false;
    }
  }
  
  /**
   * インポートされた設定の妥当性を検証する
   * @param {Object} settings - 検証する設定
   * @returns {boolean} 妥当かどうか
   */
  validateImportedSettings(settings) {
    if (!settings || typeof settings !== 'object') {
      return false;
    }
    
    // 必要なプロパティの存在チェック
    const requiredProps = ['elements', 'attributes'];
    for (const prop of requiredProps) {
      if (!settings.hasOwnProperty(prop) || typeof settings[prop] !== 'object') {
        return false;
      }
    }
    
    // 重要度値の検証
    const allImportances = [
      ...Object.values(settings.elements),
      ...Object.values(settings.attributes)
    ];
    
    return allImportances.every(importance => this.validateImportanceLevel(importance));
  }
  
  /**
   * ローカルストレージの変更を監視する
   */
  setupStorageListener() {
    window.addEventListener('storage', (event) => {
      if (event.key === this.storageKey) {
        console.log('Settings changed in another tab, reloading...');
        this.userSettings = this.loadUserSettings();
        this.notifySettingsReloaded();
      }
    });
  }
  
  /**
   * 設定変更リスナーを追加する
   * @param {Function} listener - リスナー関数
   */
  addListener(listener) {
    this.listeners.add(listener);
  }
  
  /**
   * 設定変更リスナーを削除する
   * @param {Function} listener - リスナー関数
   */
  removeListener(listener) {
    this.listeners.delete(listener);
  }
  
  /**
   * リスナーに通知する
   * @private
   * @param {string} type - 通知タイプ
   * @param {any} data - 通知データ
   */
  notifyListeners(type, data) {
    this.listeners.forEach(listener => {
      try {
        listener(type, data);
      } catch (error) {
        console.error('Error in settings listener:', error);
      }
    });
  }
  
  /**
   * 重要度変更を通知する
   * @private
   */
  notifyImportanceChanged(elementPath, newImportance, oldImportance) {
    // グローバル状態更新
    const elementRatings = getImportanceState('elementRatings') || new Map();
    elementRatings.set(elementPath, newImportance);
    setImportanceState('elementRatings', elementRatings);
    
    // イベント発行
    const event = new CustomEvent(IMPORTANCE_EVENTS.RATING_CHANGED, {
      detail: {
        elementPath,
        newRating: newImportance,
        oldRating: oldImportance
      }
    });
    document.dispatchEvent(event);
    
    // リスナー通知
    this.notifyListeners('importanceChanged', {
      elementPath,
      newImportance,
      oldImportance
    });
  }
  
  /**
   * 設定保存完了を通知する
   * @private
   */
  notifySettingsSaved() {
    const event = new CustomEvent(IMPORTANCE_EVENTS.SETTINGS_LOADED, {
      detail: {
        settings: this.userSettings,
        source: 'localStorage'
      }
    });
    document.dispatchEvent(event);
    
    this.notifyListeners('settingsSaved', this.userSettings);
  }
  
  /**
   * 設定リセットを通知する
   * @private
   */
  notifySettingsReset() {
    this.notifyListeners('settingsReset', {});
  }
  
  /**
   * 設定インポート完了を通知する
   * @private
   */
  notifySettingsImported() {
    const event = new CustomEvent(IMPORTANCE_EVENTS.SETTINGS_LOADED, {
      detail: {
        settings: this.userSettings,
        source: 'import'
      }
    });
    document.dispatchEvent(event);
    
    this.notifyListeners('settingsImported', this.userSettings);
  }
  
  /**
   * 設定再読み込みを通知する
   * @private
   */
  notifySettingsReloaded() {
    const event = new CustomEvent(IMPORTANCE_EVENTS.SETTINGS_LOADED, {
      detail: {
        settings: this.userSettings,
        source: 'reload'
      }
    });
    document.dispatchEvent(event);
    
    this.notifyListeners('settingsReloaded', this.userSettings);
  }
  
  /**
   * 設定エラーを通知する
   * @private
   */
  notifySettingsError(message, error) {
    this.notifyListeners('settingsError', { message, error });
  }
  
  /**
   * 現在の設定状態を取得する
   * @returns {Object} 設定状態
   */
  getSettingsStatus() {
    return {
      hasUserSettings: Object.keys(this.userSettings.elements).length > 0 || 
                      Object.keys(this.userSettings.attributes).length > 0,
      userElementsCount: Object.keys(this.userSettings.elements).length,
      userAttributesCount: Object.keys(this.userSettings.attributes).length,
      defaultElementsCount: Object.keys(this.defaultSettings.elements).length,
      defaultAttributesCount: Object.keys(this.defaultSettings.attributes).length,
      lastModified: this.userSettings.lastModified
    };
  }
}

// グローバルインスタンス
let globalSettingsManager = null;

/**
 * グローバル設定マネージャーのインスタンスを取得する
 * @returns {SettingsManager} 設定マネージャーインスタンス
 */
export function getGlobalSettingsManager() {
  if (!globalSettingsManager) {
    globalSettingsManager = new SettingsManager();
  }
  return globalSettingsManager;
}

/**
 * 設定マネージャーを初期化する
 * @returns {SettingsManager} 初期化された設定マネージャー
 */
export function initializeSettingsManager() {
  globalSettingsManager = new SettingsManager();
  
  // 開発時のデバッグ用にwindowに公開
  if (typeof window !== 'undefined') {
    window.importanceSettingsManager = globalSettingsManager;
  }
  
  console.log('Global settings manager initialized');
  return globalSettingsManager;
}

// 便利な関数をエクスポート
export const getElementImportance = (elementPath) => {
  return getGlobalSettingsManager().getImportance(elementPath);
};

export const setElementImportance = (elementPath, importance) => {
  return getGlobalSettingsManager().setImportance(elementPath, importance);
};

export const resetImportanceSettings = () => {
  return getGlobalSettingsManager().resetToDefaults();
};

export const exportImportanceSettings = () => {
  return getGlobalSettingsManager().exportSettings();
};

export const importImportanceSettings = (settings) => {
  return getGlobalSettingsManager().importSettings(settings);
};
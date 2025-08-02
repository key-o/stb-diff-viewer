/**
 * @fileoverview 重要度管理システム
 * 
 * StbDiffCheckerの重要度判定機能をJavaScriptに移植した中核システム。
 * ST-Bridge要素の重要度設定、管理、検証を提供します。
 * 
 * 重要度レベル:
 * - required: 高重要度（必須）
 * - optional: 中重要度（任意）
 * - unnecessary: 低重要度（不要）
 * - notApplicable: 対象外
 */

import { validateImportanceSettings } from '../validation/importanceValidation.js';
import { getState, setState } from './globalState.js';

// 重要度レベル定数（C#版との互換性を保つ）
export const IMPORTANCE_LEVELS = {
  REQUIRED: 'required',
  OPTIONAL: 'optional', 
  UNNECESSARY: 'unnecessary',
  NOT_APPLICABLE: 'notApplicable'
};

// 重要度レベルの日本語名
export const IMPORTANCE_LEVEL_NAMES = {
  [IMPORTANCE_LEVELS.REQUIRED]: '高',
  [IMPORTANCE_LEVELS.OPTIONAL]: '中',
  [IMPORTANCE_LEVELS.UNNECESSARY]: '低',
  [IMPORTANCE_LEVELS.NOT_APPLICABLE]: '対象外'
};

// STB要素のタブ別グループ化定義（C#版ImportanceSetting.csと対応）
export const STB_ELEMENT_TABS = [
  { id: 'StbCommon', name: '共通' },
  { id: 'StbNodes', name: '節点' },
  { id: 'StbParallelAxes', name: '平行軸' },
  { id: 'StbArcAxes', name: '円弧軸' },
  { id: 'StbRadialAxes', name: '放射軸' },
  { id: 'StbDrawingLineAxis', name: '描画軸(直線)' },
  { id: 'StbDrawingArcAxis', name: '描画軸(円弧)' },
  { id: 'StbStories', name: '階' },
  { id: 'StbColumns', name: '柱' },
  { id: 'StbPosts', name: '間柱' },
  { id: 'StbGirders', name: '大梁' },
  { id: 'StbBeams', name: '小梁' },
  { id: 'StbBraces', name: 'ブレース' },
  { id: 'StbSlabs', name: 'スラブ' },
  { id: 'StbWalls', name: '壁' },
  { id: 'StbFootings', name: '基礎' },
  { id: 'StbStripFootings', name: '布基礎' },
  { id: 'StbPiles', name: '杭' },
  { id: 'StbFoundationColumns', name: '基礎柱' },
  { id: 'StbParapets', name: 'パラペット' },
  { id: 'StbSecColumn_RC', name: '柱断面RC' },
  { id: 'StbSecColumn_S', name: '柱断面S' },
  { id: 'StbSecColumn_SRC', name: '柱断面SRC' },
  { id: 'StbSecColumn_CFT', name: '柱断面CFT' },
  { id: 'StbSecBeam_RC', name: '梁断面RC' },
  { id: 'StbSecBeam_S', name: '梁断面S' },
  { id: 'StbSecBeam_SRC', name: '梁断面SRC' },
  { id: 'StbSecBrace_S', name: 'ブレース断面S' },
  { id: 'StbSecSlab_RC', name: 'スラブ断面RC' },
  { id: 'StbSecSlabDeck', name: 'スラブ断面デッキ' },
  { id: 'StbSecSlabPrecast', name: 'スラブ断面プレキャスト' },
  { id: 'StbSecWall_RC', name: '壁断面RC' },
  { id: 'StbSecFoundation_RC', name: '基礎断面RC' },
  { id: 'StbSecPile_RC', name: '杭断面RC' },
  { id: 'StbSecPile_S', name: '杭断面S' },
  { id: 'StbSecPileProduct', name: '杭断面製品' },
  { id: 'StbSecParapet_RC', name: 'パラペット断面RC' },
  { id: 'StbJoints', name: '継手' }
];

/**
 * 重要度管理システムのメインクラス
 */
class ImportanceManager {
  constructor() {
    this.userImportanceSettings = new Map();
    this.orderedElementPaths = [];
    this.elementPathsByTab = new Map();
    this.isInitialized = false;
  }

  /**
   * 重要度管理システムを初期化する
   * @param {string} xsdContent - ST-Bridge XSDスキーマ内容
   * @returns {Promise<boolean>} 初期化成功フラグ
   */
  async initialize(xsdContent = null) {
    try {
      // XSDコンテンツが提供されていない場合は、デフォルト設定を使用
      if (!xsdContent) {
        console.warn('XSD content not provided, using default importance settings');
        await this.loadDefaultSettings();
      } else {
        await this.parseXsdAndGenerateSettings(xsdContent);
      }

      this.isInitialized = true;
      this.notifySettingsChanged();
      
      console.log('ImportanceManager initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize ImportanceManager:', error);
      return false;
    }
  }

  /**
   * XSDスキーマから要素パスを解析して重要度設定を生成する
   * @param {string} xsdContent - XSDスキーマ内容
   */
  async parseXsdAndGenerateSettings(xsdContent) {
    // TODO: XSDパーサーとの統合（将来の拡張）
    // 現時点では既知の要素パスを使用
    await this.loadDefaultSettings();
  }

  /**
   * デフォルト重要度設定を読み込む
   */
  async loadDefaultSettings() {
    // デフォルトで全要素を「高重要度」に設定
    const defaultImportance = IMPORTANCE_LEVELS.REQUIRED;
    
    // 各タブの要素パスを生成
    for (const tab of STB_ELEMENT_TABS) {
      const elementPaths = this.generateElementPathsForTab(tab.id);
      
      if (!this.elementPathsByTab.has(tab.id)) {
        this.elementPathsByTab.set(tab.id, []);
      }
      
      for (const path of elementPaths) {
        // 重複チェック
        if (!this.orderedElementPaths.includes(path)) {
          this.orderedElementPaths.push(path);
          this.userImportanceSettings.set(path, defaultImportance);
          this.elementPathsByTab.get(tab.id).push(path);
        }
      }
    }
  }

  /**
   * 指定されたタブIDの要素パスを生成する
   * @param {string} tabId - タブID
   * @returns {string[]} 要素パスの配列
   */
  generateElementPathsForTab(tabId) {
    // 基本的な要素パス生成ロジック
    // 実際のXSDパーサーとの統合時により詳細に実装
    const basePaths = [
      `//ST_BRIDGE/${tabId}`,
      `//ST_BRIDGE/${tabId}/@id`,
      `//ST_BRIDGE/${tabId}/@guid`,
      `//ST_BRIDGE/${tabId}/@name`
    ];

    // 特定要素の追加属性
    const additionalPaths = this.getAdditionalPathsForElement(tabId);
    
    return [...basePaths, ...additionalPaths];
  }

  /**
   * 要素タイプに応じた追加パスを取得する
   * @param {string} elementType - 要素タイプ
   * @returns {string[]} 追加パスの配列
   */
  getAdditionalPathsForElement(elementType) {
    const additionalPaths = {
      'StbColumns': [
        '//ST_BRIDGE/StbColumns/StbColumn/@id_node_bottom',
        '//ST_BRIDGE/StbColumns/StbColumn/@id_node_top',
        '//ST_BRIDGE/StbColumns/StbColumn/@id_section',
        '//ST_BRIDGE/StbColumns/StbColumn/@rotate'
      ],
      'StbGirders': [
        '//ST_BRIDGE/StbGirders/StbGirder/@id_node_start',
        '//ST_BRIDGE/StbGirders/StbGirder/@id_node_end',
        '//ST_BRIDGE/StbGirders/StbGirder/@id_section',
        '//ST_BRIDGE/StbGirders/StbGirder/@rotate'
      ],
      'StbBeams': [
        '//ST_BRIDGE/StbBeams/StbBeam/@id_node_start',
        '//ST_BRIDGE/StbBeams/StbBeam/@id_node_end',
        '//ST_BRIDGE/StbBeams/StbBeam/@id_section',
        '//ST_BRIDGE/StbBeams/StbBeam/@rotate'
      ],
      'StbNodes': [
        '//ST_BRIDGE/StbNodes/StbNode/@X',
        '//ST_BRIDGE/StbNodes/StbNode/@Y',
        '//ST_BRIDGE/StbNodes/StbNode/@Z'
      ]
    };

    return additionalPaths[elementType] || [];
  }

  /**
   * 要素パスの重要度を取得する
   * @param {string} elementPath - 要素パス
   * @returns {string} 重要度レベル
   */
  getImportanceLevel(elementPath) {
    return this.userImportanceSettings.get(elementPath) || IMPORTANCE_LEVELS.REQUIRED;
  }

  /**
   * 要素パスの重要度を設定する
   * @param {string} elementPath - 要素パス
   * @param {string} importanceLevel - 重要度レベル
   * @returns {boolean} 設定成功フラグ
   */
  setImportanceLevel(elementPath, importanceLevel) {
    if (!Object.values(IMPORTANCE_LEVELS).includes(importanceLevel)) {
      console.error(`Invalid importance level: ${importanceLevel}`);
      return false;
    }

    this.userImportanceSettings.set(elementPath, importanceLevel);
    this.notifySettingsChanged();
    return true;
  }

  /**
   * 全ての重要度設定を取得する
   * @returns {Map<string, string>} 要素パスと重要度のマップ
   */
  getAllImportanceSettings() {
    return new Map(this.userImportanceSettings);
  }

  /**
   * タブ別の要素パスを取得する
   * @param {string} tabId - タブID
   * @returns {string[]} 要素パスの配列
   */
  getElementPathsByTab(tabId) {
    return this.elementPathsByTab.get(tabId) || [];
  }

  /**
   * 重要度設定をCSV形式でエクスポートする
   * @returns {string} CSV形式の文字列
   */
  exportToCSV() {
    const lines = ['Element Path,Importance Level'];
    
    for (const path of this.orderedElementPaths) {
      const importance = this.getImportanceLevel(path);
      const importanceName = IMPORTANCE_LEVEL_NAMES[importance];
      lines.push(`"${path}","${importanceName}"`);
    }
    
    return lines.join('\n');
  }

  /**
   * CSV形式の重要度設定をインポートする
   * @param {string} csvContent - CSV形式の文字列
   * @returns {boolean} インポート成功フラグ
   */
  importFromCSV(csvContent) {
    try {
      const lines = csvContent.split('\n').filter(line => line.trim());
      
      // ヘッダー行をスキップ
      const dataLines = lines.slice(1);
      
      for (const line of dataLines) {
        const [pathStr, importanceStr] = this.parseCSVLine(line);
        if (pathStr && importanceStr) {
          const importanceLevel = this.getImportanceLevelFromName(importanceStr);
          if (importanceLevel && this.userImportanceSettings.has(pathStr)) {
            this.userImportanceSettings.set(pathStr, importanceLevel);
          }
        }
      }
      
      this.notifySettingsChanged();
      return true;
    } catch (error) {
      console.error('Failed to import CSV:', error);
      return false;
    }
  }

  /**
   * CSV行を解析する
   * @param {string} line - CSV行
   * @returns {[string, string]} パスと重要度の配列
   */
  parseCSVLine(line) {
    // 簡単なCSVパーサー（"で囲まれた値に対応）
    const matches = line.match(/"([^"]+)","([^"]+)"/);
    if (matches) {
      return [matches[1], matches[2]];
    }
    
    // カンマ区切りの場合
    const parts = line.split(',');
    if (parts.length >= 2) {
      return [parts[0].trim(), parts[1].trim()];
    }
    
    return [null, null];
  }

  /**
   * 日本語名から重要度レベルを取得する
   * @param {string} importanceName - 重要度の日本語名
   * @returns {string|null} 重要度レベル
   */
  getImportanceLevelFromName(importanceName) {
    for (const [level, name] of Object.entries(IMPORTANCE_LEVEL_NAMES)) {
      if (name === importanceName) {
        return level;
      }
    }
    return null;
  }

  /**
   * 重要度設定の変更を関連システムに通知する
   */
  notifySettingsChanged() {
    // グローバル状態を更新
    setState('importanceSettings', {
      userSettings: Object.fromEntries(this.userImportanceSettings),
      orderedPaths: [...this.orderedElementPaths],
      elementPathsByTab: Object.fromEntries(this.elementPathsByTab),
      lastModified: new Date().toISOString()
    });

    // カスタムイベントを発火
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('importanceSettingsChanged', {
        detail: {
          manager: this,
          timestamp: Date.now()
        }
      }));
    }
  }

  /**
   * 重要度設定を検証する
   * @returns {Object} 検証結果
   */
  validateSettings() {
    const settingsObject = {
      elements: Object.fromEntries(this.userImportanceSettings),
      attributes: {},
      lastModified: new Date().toISOString()
    };

    return validateImportanceSettings(settingsObject);
  }

  /**
   * 重要度設定をリセットする
   */
  resetToDefaults() {
    this.userImportanceSettings.clear();
    this.orderedElementPaths = [];
    this.elementPathsByTab.clear();
    this.loadDefaultSettings();
  }

  /**
   * 統計情報を取得する
   * @returns {Object} 統計情報
   */
  getStatistics() {
    const stats = {
      total: this.orderedElementPaths.length,
      byLevel: {}
    };

    // レベル別の統計
    for (const level of Object.values(IMPORTANCE_LEVELS)) {
      stats.byLevel[level] = 0;
    }

    for (const importance of this.userImportanceSettings.values()) {
      stats.byLevel[importance]++;
    }

    return stats;
  }
}

// シングルトンインスタンス
let importanceManagerInstance = null;

/**
 * ImportanceManagerのシングルトンインスタンスを取得する
 * @returns {ImportanceManager} インスタンス
 */
export function getImportanceManager() {
  if (!importanceManagerInstance) {
    importanceManagerInstance = new ImportanceManager();
  }
  return importanceManagerInstance;
}

/**
 * 重要度管理システムを初期化する
 * @param {string} xsdContent - XSDスキーマ内容（オプション）
 * @returns {Promise<ImportanceManager>} 初期化済みのインスタンス
 */
export async function initializeImportanceManager(xsdContent = null) {
  const manager = getImportanceManager();
  await manager.initialize(xsdContent);
  return manager;
}

// デフォルトエクスポート
export default ImportanceManager;